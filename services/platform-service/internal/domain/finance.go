package domain

import (
	"context"
	"time"

	pb "ride-sharing/shared/proto/finance"
)

// LedgerRepository persists finance ledger rows and analytics queries.
type LedgerRepository interface {
	RecordTripPayment(ctx context.Context, riderUserID, driverUserID string, amountCents int64, currency, region, tripID, packageSlug string) error
	ListByUser(ctx context.Context, userID string, limit int32) ([]*pb.Transaction, error)
	CustomerDashboard(ctx context.Context, userID string, from, to *time.Time, seriesGran string, recentLimit int32) (
		income, expense, net int64, currency string, series []*pb.AmountPoint, recent []*pb.Transaction, err error)
	GlobalRevenue(ctx context.Context, from, to *time.Time, trendGran string) (total int64, currency string, trend []*pb.RevenuePoint, err error)
	RegionalAnalytics(ctx context.Context, from, to *time.Time) ([]*pb.RegionTotal, string, error)
	CategoryInsights(ctx context.Context, from, to *time.Time) ([]*pb.CategoryInsight, string, error)
	ListLedger(ctx context.Context, req *pb.ListLedgerRequest) ([]*pb.LedgerRow, error)
}

// FinanceService is the application API used by gRPC and AMQP consumers.
type FinanceService interface {
	RecordTripPayment(ctx context.Context, riderUserID, driverUserID string, amountCents int64, currency, region, tripID, packageSlug string) error
	ListByUser(ctx context.Context, userID string, limit int32) ([]*pb.Transaction, error)
	CustomerDashboard(ctx context.Context, userID string, from, to *time.Time, seriesGran string, recentLimit int32) (
		income, expense, net int64, currency string, series []*pb.AmountPoint, recent []*pb.Transaction, err error)
	GlobalRevenue(ctx context.Context, from, to *time.Time, trendGran string) (total int64, currency string, trend []*pb.RevenuePoint, err error)
	RegionalAnalytics(ctx context.Context, from, to *time.Time) ([]*pb.RegionTotal, string, error)
	CategoryInsights(ctx context.Context, from, to *time.Time) ([]*pb.CategoryInsight, string, error)
	ListLedger(ctx context.Context, req *pb.ListLedgerRequest) ([]*pb.LedgerRow, error)
}
