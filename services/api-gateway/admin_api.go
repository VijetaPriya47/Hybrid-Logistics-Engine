package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"ride-sharing/services/api-gateway/grpc_clients"
	"ride-sharing/shared/contracts"
	pb "ride-sharing/shared/proto/auth"
	pbf "ride-sharing/shared/proto/finance"
)

func handleAdminSystemLogs(w http.ResponseWriter, r *http.Request, auth *grpc_clients.UserAuthServiceClient) {
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
	limit := int32(100)
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = int32(n)
		}
	}
	resp, err := auth.Client.ListAuditLogs(context.Background(), &pb.ListAuditLogsRequest{
		Limit:           limit,
		BeforeTsRfc3339: q.Get("before"),
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = sub
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}

func handleAdminTransactions(w http.ResponseWriter, r *http.Request, fin *grpc_clients.FinanceServiceClient) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, _, _, ok := authFromRequest(r); !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	q := r.URL.Query()
	limit := int32(100)
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = int32(n)
		}
	}
	resp, err := fin.Client.ListLedger(context.Background(), &pbf.ListLedgerRequest{
		Limit:               limit,
		FilterUserId:        q.Get("user_id"),
		FilterTripId:        q.Get("trip_id"),
		FilterEmailContains: q.Get("email"),
		FilterPackageSlug:   q.Get("package"),
		FilterRiderUserId:   q.Get("rider_user_id"),
		FilterDriverUserId:  q.Get("driver_user_id"),
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
}

// handleAdminUsersBusiness: GET list, POST create, PATCH active/inactive.
func handleAdminUsersBusiness(w http.ResponseWriter, r *http.Request, auth *grpc_clients.UserAuthServiceClient) {
	sub, _, _, ok := authFromRequest(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	switch r.Method {
	case http.MethodGet:
		resp, err := auth.Client.ListBusinessUsers(context.Background(), &pb.ListBusinessUsersRequest{
			AdminUserId: sub,
		})
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp})
	case http.MethodPost:
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid json")
			return
		}
		defer r.Body.Close()
		resp, err := auth.Client.RegisterBusiness(context.Background(), &pb.RegisterBusinessRequest{
			AdminUserId: sub,
			Email:       body.Email,
			Password:    body.Password,
		})
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, contracts.APIResponse{Data: resp.User})
	case http.MethodPatch:
		var body struct {
			UserID   string `json:"user_id"`
			IsActive *bool  `json:"is_active"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid json")
			return
		}
		defer r.Body.Close()
		if body.UserID == "" || body.IsActive == nil {
			writeJSONError(w, http.StatusBadRequest, "user_id and is_active required")
			return
		}
		resp, err := auth.Client.SetBusinessUserActive(context.Background(), &pb.SetBusinessUserActiveRequest{
			AdminUserId:    sub,
			BusinessUserId: body.UserID,
			IsActive:       *body.IsActive,
		})
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, contracts.APIResponse{Data: resp.User})
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func handleAdminRegisterAdmin(w http.ResponseWriter, r *http.Request, auth *grpc_clients.UserAuthServiceClient) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sub, _, _, ok := authFromRequest(r)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Email           string `json:"email"`
		Password        string `json:"password"`
		CanCreateAdmins bool   `json:"can_create_admins"`
		CanDeleteData   bool   `json:"can_delete_data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid json")
		return
	}
	defer r.Body.Close()
	resp, err := auth.Client.RegisterAdmin(context.Background(), &pb.RegisterAdminRequest{
		AdminUserId:     sub,
		Email:           body.Email,
		Password:        body.Password,
		CanCreateAdmins: body.CanCreateAdmins,
		CanDeleteData:   body.CanDeleteData,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, contracts.APIResponse{Data: resp.User})
}
