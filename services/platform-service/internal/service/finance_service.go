package service

import (
	"context"
	"time"

	"ride-sharing/services/platform-service/internal/domain"
	pb "ride-sharing/shared/proto/finance"
)

type financeService struct {
	repo domain.LedgerRepository
}

var _ domain.FinanceService = (*financeService)(nil)

// NewFinanceService wires the ledger repository into the application service.
func NewFinanceService(repo domain.LedgerRepository) domain.FinanceService {
	return &financeService{repo: repo}
}

func (s *financeService) RecordTripPayment(ctx context.Context, riderUserID, driverUserID string, amountCents int64, currency, region, tripID, packageSlug string) error {
	return s.repo.RecordTripPayment(ctx, riderUserID, driverUserID, amountCents, currency, region, tripID, packageSlug)
}

func (s *financeService) ListByUser(ctx context.Context, userID string, limit int32) ([]*pb.Transaction, error) {
	return s.repo.ListByUser(ctx, userID, limit)
}

func (s *financeService) CustomerDashboard(ctx context.Context, userID string, from, to *time.Time, seriesGran string, recentLimit int32) (
	income, expense, net int64, currency string, series []*pb.AmountPoint, recent []*pb.Transaction, err error) {
	return s.repo.CustomerDashboard(ctx, userID, from, to, seriesGran, recentLimit)
}

func (s *financeService) GlobalRevenue(ctx context.Context, from, to *time.Time, trendGran string) (int64, string, []*pb.RevenuePoint, error) {
	return s.repo.GlobalRevenue(ctx, from, to, trendGran)
}

func (s *financeService) RegionalAnalytics(ctx context.Context, from, to *time.Time) ([]*pb.RegionTotal, string, error) {
	return s.repo.RegionalAnalytics(ctx, from, to)
}

func (s *financeService) CategoryInsights(ctx context.Context, from, to *time.Time) ([]*pb.CategoryInsight, string, error) {
	return s.repo.CategoryInsights(ctx, from, to)
}

func (s *financeService) ListLedger(ctx context.Context, req *pb.ListLedgerRequest) ([]*pb.LedgerRow, error) {
	return s.repo.ListLedger(ctx, req)
}
