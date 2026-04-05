package repository

import (
	"context"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"ride-sharing/services/platform-service/internal/domain"
	pb "ride-sharing/shared/proto/finance"
)

// PostgresLedger implements domain.LedgerRepository.
type PostgresLedger struct {
	Pool *pgxpool.Pool
}

var _ domain.LedgerRepository = (*PostgresLedger)(nil)

// NewPostgresLedger creates a PostgreSQL-backed ledger repository.
func NewPostgresLedger(pool *pgxpool.Pool) *PostgresLedger {
	return &PostgresLedger{Pool: pool}
}

// Rider debits only: one row per trip for platform revenue.
const ledgerDebitFilter = `type = 'debit'`

func appendCreatedRange(q string, args *[]any, from, to *time.Time) string {
	if from != nil {
		*args = append(*args, *from)
		q += ` AND created_at >= $` + strconv.Itoa(len(*args))
	}
	if to != nil {
		*args = append(*args, *to)
		q += ` AND created_at <= $` + strconv.Itoa(len(*args))
	}
	return q
}

func trendBucketSQL(gran string) string {
	switch strings.ToLower(strings.TrimSpace(gran)) {
	case "month":
		return "month"
	case "year":
		return "year"
	default:
		return "day"
	}
}

func scanTransactionRow(rows pgx.Rows) (*pb.Transaction, error) {
	var t pb.Transaction
	var created time.Time
	if err := rows.Scan(
		&t.Id, &t.UserId, &t.AmountCents, &t.Currency, &t.Type, &t.Region, &t.Status,
		&t.SourceTripId, &t.PackageSlug, &created,
	); err != nil {
		return nil, err
	}
	t.CreatedAtRfc3339 = created.UTC().Format(time.RFC3339)
	return &t, nil
}

// RecordTripPayment idempotently records rider debit and driver credit (one row per trip per user).
func (r *PostgresLedger) RecordTripPayment(ctx context.Context, riderUserID, driverUserID string, amountCents int64, currency, region, tripID, packageSlug string) error {
	if tripID == "" || riderUserID == "" || amountCents <= 0 {
		log.Printf("ledger: RecordTripPayment skipped (empty trip/rider or non-positive amount)")
		return nil
	}
	if currency == "" {
		currency = "usd"
	} else {
		currency = strings.ToLower(currency)
	}
	if region == "" {
		region = "unspecified"
	}
	pkg := strings.TrimSpace(strings.ToLower(packageSlug))

	ins := `
INSERT INTO transactions (id, user_id, amount_cents, currency, type, region, status, source_trip_id, package_slug)
SELECT $1, $2, $3, lower($4), $5, $6, 'completed', $7, NULLIF($8,'')
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.source_trip_id = $7 AND t.user_id = $2)
`
	riderRowID := uuid.New()
	if _, err := r.Pool.Exec(ctx, ins, riderRowID, riderUserID, amountCents, currency, "debit", region, tripID, pkg); err != nil {
		return err
	}
	if driverUserID == "" || driverUserID == riderUserID {
		return nil
	}
	driverRowID := uuid.New()
	if _, err := r.Pool.Exec(ctx, ins, driverRowID, driverUserID, amountCents, currency, "credit", region, tripID, pkg); err != nil {
		return err
	}
	return nil
}

func (r *PostgresLedger) ListByUser(ctx context.Context, userID string, limit int32) ([]*pb.Transaction, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := r.Pool.Query(ctx, `
SELECT id::text, user_id, amount_cents, currency, type, region, status, COALESCE(source_trip_id,''), COALESCE(package_slug,''), created_at
FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*pb.Transaction
	for rows.Next() {
		t, err := scanTransactionRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *PostgresLedger) GlobalRevenue(ctx context.Context, from, to *time.Time, trendGran string) (total int64, currency string, trend []*pb.RevenuePoint, err error) {
	currency = "usd"
	unit := trendBucketSQL(trendGran)
	q := `SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE ` + ledgerDebitFilter
	args := []any{}
	q = appendCreatedRange(q, &args, from, to)
	if err = r.Pool.QueryRow(ctx, q, args...).Scan(&total); err != nil {
		return 0, "", nil, err
	}

	tq := `SELECT to_char(date_trunc('` + unit + `', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), COALESCE(SUM(amount_cents),0)
FROM transactions WHERE ` + ledgerDebitFilter
	targs := []any{}
	tq = appendCreatedRange(tq, &targs, from, to)
	tq += ` GROUP BY 1 ORDER BY 1`
	trows, err := r.Pool.Query(ctx, tq, targs...)
	if err != nil {
		return total, currency, nil, err
	}
	defer trows.Close()
	for trows.Next() {
		var p pb.RevenuePoint
		if err := trows.Scan(&p.Period, &p.AmountCents); err != nil {
			return total, currency, nil, err
		}
		trend = append(trend, &p)
	}
	return total, currency, trend, trows.Err()
}

func (r *PostgresLedger) RegionalAnalytics(ctx context.Context, from, to *time.Time) ([]*pb.RegionTotal, string, error) {
	cur := "usd"
	q := `SELECT region, COALESCE(SUM(amount_cents),0), COUNT(*)::int FROM transactions WHERE ` + ledgerDebitFilter
	args := []any{}
	q = appendCreatedRange(q, &args, from, to)
	q += ` GROUP BY region ORDER BY SUM(amount_cents) DESC`
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, cur, err
	}
	defer rows.Close()
	var out []*pb.RegionTotal
	for rows.Next() {
		var rt pb.RegionTotal
		if err := rows.Scan(&rt.Region, &rt.AmountCents, &rt.TransactionCount); err != nil {
			return nil, cur, err
		}
		out = append(out, &rt)
	}
	return out, cur, rows.Err()
}

func (r *PostgresLedger) CategoryInsights(ctx context.Context, from, to *time.Time) ([]*pb.CategoryInsight, string, error) {
	cur := "usd"
	base := `FROM transactions WHERE ` + ledgerDebitFilter
	args := []any{}
	base = appendCreatedRange(base, &args, from, to)
	q := `SELECT COALESCE(NULLIF(TRIM(package_slug),''), '') AS pkg,
COALESCE(SUM(amount_cents),0),
COUNT(DISTINCT source_trip_id)::int,
COUNT(DISTINCT user_id)::int
` + base + ` GROUP BY 1 ORDER BY SUM(amount_cents) DESC`

	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, cur, err
	}
	defer rows.Close()

	type pkgAgg struct {
		pkg    string
		net    int64
		trips  int32
		riders int32
	}
	var aggs []pkgAgg
	for rows.Next() {
		var a pkgAgg
		if err := rows.Scan(&a.pkg, &a.net, &a.trips, &a.riders); err != nil {
			return nil, cur, err
		}
		aggs = append(aggs, a)
	}
	if err := rows.Err(); err != nil {
		return nil, cur, err
	}

	dq := `SELECT COALESCE(NULLIF(TRIM(package_slug),''), ''), COUNT(DISTINCT user_id)::int
FROM transactions WHERE type = 'credit' `
	dargs := []any{}
	dq = appendCreatedRange(dq, &dargs, from, to)
	dq += ` GROUP BY 1`
	drows, err := r.Pool.Query(ctx, dq, dargs...)
	if err != nil {
		return nil, cur, err
	}
	defer drows.Close()
	driversByPkg := map[string]int32{}
	for drows.Next() {
		var pkg string
		var c int32
		if err := drows.Scan(&pkg, &c); err != nil {
			return nil, cur, err
		}
		driversByPkg[pkg] = c
	}
	if err := drows.Err(); err != nil {
		return nil, cur, err
	}

	var out []*pb.CategoryInsight
	for _, a := range aggs {
		dc := driversByPkg[a.pkg]
		if dc == 0 && a.pkg == "" {
			dc = driversByPkg[""]
		}
		out = append(out, &pb.CategoryInsight{
			PackageSlug:     a.pkg,
			NetAmountCents:  a.net,
			TripCount:       a.trips,
			DistinctRiders:  a.riders,
			DistinctDrivers: dc,
		})
	}
	return out, cur, nil
}

func earningSeriesUnit(gran string) string {
	if strings.ToLower(strings.TrimSpace(gran)) == "month" {
		return "month"
	}
	return "day"
}

func (r *PostgresLedger) CustomerDashboard(ctx context.Context, userID string, from, to *time.Time, seriesGran string, recentLimit int32) (
	income, expense, net int64, currency string, series []*pb.AmountPoint, recent []*pb.Transaction, err error) {
	currency = "usd"
	if recentLimit <= 0 || recentLimit > 100 {
		recentLimit = 20
	}

	sumQ := `SELECT
COALESCE(SUM(CASE WHEN type = 'credit' THEN amount_cents ELSE 0 END),0),
COALESCE(SUM(CASE WHEN type = 'debit' THEN amount_cents ELSE 0 END),0)
FROM transactions WHERE user_id = $1`
	args := []any{userID}
	sumQ = appendCreatedRange(sumQ, &args, from, to)
	if err = r.Pool.QueryRow(ctx, sumQ, args...).Scan(&income, &expense); err != nil {
		return 0, 0, 0, "", nil, nil, err
	}
	net = income - expense

	unit := earningSeriesUnit(seriesGran)
	sq := `SELECT to_char(date_trunc('` + unit + `', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
COALESCE(SUM(amount_cents),0)
FROM transactions WHERE user_id = $1 AND type = 'credit'`
	sargs := []any{userID}
	sq = appendCreatedRange(sq, &sargs, from, to)
	sq += ` GROUP BY 1 ORDER BY 1`
	srows, err := r.Pool.Query(ctx, sq, sargs...)
	if err != nil {
		return income, expense, net, currency, nil, nil, err
	}
	defer srows.Close()
	for srows.Next() {
		var p pb.AmountPoint
		if err := srows.Scan(&p.Period, &p.AmountCents); err != nil {
			return income, expense, net, currency, nil, nil, err
		}
		series = append(series, &p)
	}
	if err := srows.Err(); err != nil {
		return income, expense, net, currency, nil, nil, err
	}

	rrows, err := r.Pool.Query(ctx, `
SELECT id::text, user_id, amount_cents, currency, type, region, status, COALESCE(source_trip_id,''), COALESCE(package_slug,''), created_at
FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
`, userID, recentLimit)
	if err != nil {
		return income, expense, net, currency, series, nil, err
	}
	defer rrows.Close()
	for rrows.Next() {
		t, err := scanTransactionRow(rrows)
		if err != nil {
			return income, expense, net, currency, series, nil, err
		}
		recent = append(recent, t)
	}
	return income, expense, net, currency, series, recent, rrows.Err()
}

func (r *PostgresLedger) ListLedger(ctx context.Context, req *pb.ListLedgerRequest) ([]*pb.LedgerRow, error) {
	limit := req.GetLimit()
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := `
SELECT t.id::text, t.user_id, COALESCE(u.email,''), t.amount_cents, t.currency, t.type, t.region, t.status,
COALESCE(t.source_trip_id,''), COALESCE(t.package_slug,''), t.created_at
FROM transactions t
LEFT JOIN users u ON u.id::text = t.user_id
WHERE 1=1`
	args := []any{}
	if id := strings.TrimSpace(req.GetFilterUserId()); id != "" {
		args = append(args, id)
		q += ` AND t.user_id = $` + strconv.Itoa(len(args))
	}
	if tid := strings.TrimSpace(req.GetFilterTripId()); tid != "" {
		args = append(args, tid)
		q += ` AND t.source_trip_id = $` + strconv.Itoa(len(args))
	}
	if em := strings.TrimSpace(req.GetFilterEmailContains()); em != "" {
		args = append(args, "%"+em+"%")
		q += ` AND u.email ILIKE $` + strconv.Itoa(len(args))
	}
	if pkg := strings.TrimSpace(req.GetFilterPackageSlug()); pkg != "" {
		args = append(args, strings.ToLower(pkg))
		q += ` AND lower(COALESCE(t.package_slug,'')) = $` + strconv.Itoa(len(args))
	}
	if rid := strings.TrimSpace(req.GetFilterRiderUserId()); rid != "" {
		args = append(args, rid)
		q += ` AND t.type = 'debit' AND t.user_id = $` + strconv.Itoa(len(args))
	}
	if did := strings.TrimSpace(req.GetFilterDriverUserId()); did != "" {
		args = append(args, did)
		q += ` AND t.type = 'credit' AND t.user_id = $` + strconv.Itoa(len(args))
	}
	args = append(args, limit)
	q += ` ORDER BY t.created_at DESC LIMIT $` + strconv.Itoa(len(args))

	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*pb.LedgerRow
	for rows.Next() {
		var lr pb.LedgerRow
		var ts time.Time
		if err := rows.Scan(&lr.Id, &lr.UserId, &lr.UserEmail, &lr.AmountCents, &lr.Currency, &lr.Type, &lr.Region, &lr.Status, &lr.SourceTripId, &lr.PackageSlug, &ts); err != nil {
			return nil, err
		}
		lr.CreatedAtRfc3339 = ts.UTC().Format(time.RFC3339)
		out = append(out, &lr)
	}
	return out, rows.Err()
}
