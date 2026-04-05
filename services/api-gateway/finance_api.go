package main

import (
	"context"
	"net/http"
	"strconv"

	"ride-sharing/services/api-gateway/grpc_clients"
	"ride-sharing/shared/contracts"
	pb "ride-sharing/shared/proto/finance"
)

func handleFinanceMe(w http.ResponseWriter, r *http.Request, fin *grpc_clients.FinanceServiceClient) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sub, _, _, ok := authFromRequest(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit := int32(100)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = int32(n)
		}
	}
	resp, err := fin.Client.GetMyTransactions(context.Background(), &pb.GetMyTransactionsRequest{
		UserId: sub,
		Limit:  limit,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}

func handleFinanceMeSummary(w http.ResponseWriter, r *http.Request, fin *grpc_clients.FinanceServiceClient) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sub, _, _, ok := authFromRequest(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	q := r.URL.Query()
	recent := int32(20)
	if v := q.Get("recent_limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			recent = int32(n)
		}
	}
	resp, err := fin.Client.GetCustomerDashboard(context.Background(), &pb.GetCustomerDashboardRequest{
		UserId:            sub,
		FromRfc3339:       q.Get("from"),
		ToRfc3339:         q.Get("to"),
		SeriesGranularity: q.Get("series_granularity"),
		RecentLimit:       recent,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}

func handleFinanceDashboardRevenue(w http.ResponseWriter, r *http.Request, fin *grpc_clients.FinanceServiceClient) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query()
	resp, err := fin.Client.GetGlobalRevenue(context.Background(), &pb.GetGlobalRevenueRequest{
		FromRfc3339:      q.Get("from"),
		ToRfc3339:        q.Get("to"),
		TrendGranularity: q.Get("trend_granularity"),
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}

func handleFinanceDashboardRegions(w http.ResponseWriter, r *http.Request, fin *grpc_clients.FinanceServiceClient) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query()
	resp, err := fin.Client.GetRegionalAnalytics(context.Background(), &pb.GetRegionalAnalyticsRequest{
		FromRfc3339: q.Get("from"),
		ToRfc3339:   q.Get("to"),
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}

func handleFinanceDashboardCategories(w http.ResponseWriter, r *http.Request, fin *grpc_clients.FinanceServiceClient) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query()
	resp, err := fin.Client.GetCategoryInsights(context.Background(), &pb.GetCategoryInsightsRequest{
		FromRfc3339: q.Get("from"),
		ToRfc3339:   q.Get("to"),
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}
