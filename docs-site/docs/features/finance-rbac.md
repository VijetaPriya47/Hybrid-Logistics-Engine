---
sidebar_position: 8
title: Finance, RBAC, and audit logging
---

# Finance, RBAC, and audit logging

RideSync adds a non-destructive finance ledger, user authentication with three roles, JWT enforcement in the API Gateway, and asynchronous audit logging via RabbitMQ.

## Roles

| Role | Auth | Trip APIs | Finance |
|------|------|-----------|---------|
| `customer` | Google ID token (`POST /api/auth/google`) | `/trip/*`, `POST /api/trips/book` | `GET /api/finance/me`, `GET /api/finance/me/summary`, `GET /api/trips/history` |
| `business` | Email/password (`POST /api/auth/login`) | Denied | `GET /api/finance/dashboard/*` |
| `admin` | Email/password | Denied | Same dashboards as business + admin APIs below |

Inactive business accounts cannot sign in (`PermissionDenied`).

## HTTP routes (gateway)

**Public (no JWT):** `/health`, `/api/auth/login`, `/api/auth/google`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/webhook/stripe`, `/ws/*`.

**Authenticated:** All other routes require `Authorization: Bearer <jwt>`.

- `GET /api/finance/me` — customer; raw ledger rows (`GetMyTransactions`).
- `GET /api/finance/me/summary` — customer; income, expenses, net, earning series, recent rows (`GetCustomerDashboard`). Query: `from`, `to` (RFC3339), `series_granularity` (`day` \| `month`), `recent_limit`.
- `GET /api/trips/history` — customer; MongoDB trips for rider or assigned driver (`TripService.ListMyTrips`).
- `GET /api/finance/dashboard/revenue` — business or admin; query `from`, `to`, `trend_granularity` (`day` \| `month` \| `year`). Totals use **rider debits only** (one amount per trip).
- `GET /api/finance/dashboard/regions` — business or admin; `from`, `to`.
- `GET /api/finance/dashboard/categories` — business or admin; `from`, `to`. Groups by car **package**; net per package from debits; rider/driver distinct counts from debits/credits.
- `GET /api/admin/system-logs` — admin; `limit`, `before` (RFC3339).
- `GET /api/admin/users/business` — admin; lists business users with **created-by admin email** (`ListBusinessUsers`).
- `POST /api/admin/users/business` — admin; create business user (stores `created_by_admin_id` in SQL).
- `PATCH /api/admin/users/business` — admin; JSON `{ "user_id", "is_active" }` toggles business login.
- `POST /api/admin/users/admin` — admin; JSON `{ "email", "password", "can_create_admins", "can_delete_data" }`. Caller must have `can_create_admins` on their JWT.
- `GET /api/admin/transactions` — admin; ledger with filters: `limit` (default 100, max 500), `offset` (default 0, server-capped), `user_id`, `trip_id`, `email`, `package`, `rider_user_id`, `driver_user_id`. Response `data` includes `rows`, `total_count`, and `has_more` for pagination.

Trip `userID` in JSON is ignored for identity: the gateway overwrites it with the JWT `sub`.

## JWT claims

Alongside `sub`, `email`, `role`, **admin** tokens include `can_create_admins` and `can_delete_data` (for UI and future delete APIs). Business and customer tokens omit these flags.

## Environment variables

**API Gateway:** `JWT_SECRET`, `JWT_ISSUER` (default `ridesync-auth`), `JWT_AUDIENCE` (default `ridesync-gateway`), `PLATFORM_SERVICE_URL` (preferred; single gRPC endpoint for finance + auth). For backward compatibility, `FINANCE_SERVICE_URL` or `USER_AUTH_SERVICE_URL` are used if `PLATFORM_SERVICE_URL` is unset. Also `TRIP_SERVICE_URL`, `RABBITMQ_URI`. **Do not set `GOOGLE_CLIENT_ID` on the gateway**—it does not verify Google tokens; it only proxies `POST /api/auth/google` to **platform-service** over gRPC.

**platform-service** (combined finance ledger + user auth + audit): `DATABASE_URL`, `RABBITMQ_URI`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, **`GOOGLE_CLIENT_ID`** (required server-side for `idtoken.Validate`; must be the **same Web client ID** as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the web app), `JWT_*` (signing), `PUBLIC_GATEWAY_URL` (simulated reset email logs).

**Listen address:** If `GRPC_ADDR` is set, it is used (e.g. `:9094` for Docker Compose). If unset and **`PORT`** is set (Railway, Render, Fly), the server listens on **`:{PORT}`**. Otherwise default is **`:9094`**. Point the API gateway at the same host and port the platform exposes (on Railway, use the service’s **private** hostname and port, often the same as `PORT`).

**`SQL_SCHEMA_PATH` (important):**

- **Docker image** (`infra/production/docker/platform-service.Dockerfile`): the schema file is copied to **`/root/001_schema.sql`** and the image sets `ENV SQL_SCHEMA_PATH=/root/001_schema.sql`. On Railway, Render, etc., **do not** set `SQL_SCHEMA_PATH` to `infra/sql/001_schema.sql`—that path exists only in the Git repo, not inside the container. Either **omit** `SQL_SCHEMA_PATH` (use the image default) or set it explicitly to **`/root/001_schema.sql`**.
- **Local / monorepo run from repo root** (no Docker): default is `infra/sql/001_schema.sql`; override only if you keep the file elsewhere.

## RabbitMQ

- `finance_payment_success` — bound to `payment.event.success` (same routing key as trip payment consumer); consumed by `platform-service`.
- `audit_logs` — bound to `audit.event.write`; API Gateway publishes mutating requests; `platform-service` persists rows to `audit_logs`.

## PostgreSQL

Schema: `infra/sql/001_schema.sql` (`users` with `is_active`, `can_create_admins`, `can_delete_data`, `created_by_admin_id`; `transactions` with rider **debit** and driver **credit** per trip, `package_slug`; `audit_logs`; etc.).

## gRPC

- `platform-service` — **one** gRPC server exposes both `FinanceService` and `UserAuthService` on port **9094** (compose DNS `platform-service:9094`). The gateway opens a single connection and uses both stubs.

Install codegen plugins:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.1
make generate-proto
```

## Web UI (`web/`)

Next.js routes:

- `/login` — Google (riders/drivers) and email/password (admin/business); forgot-password request; requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for Google.
- `/finance/me` — customer dashboard (summary, earnings chart, recent ledger colors) plus ride history table.
- `/dashboard` — business/admin charts and tables for revenue, regions, packages.
- `/admin` — business overview, audit log table, business users + active toggle, transaction filters, provisioning forms (admin creation requires JWT `can_create_admins`).
- `/reset-password` — optional `?token=` query or paste token.

The home map flows require a **customer** JWT: sign in before **I Need a Ride** / **I Want to Drive**. Trip HTTP calls send `Authorization: Bearer`.
