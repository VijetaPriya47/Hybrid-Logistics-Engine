---
sidebar_position: 9
title: Security Measures
---

# Security Measures

This page captures the application-level controls that reduce common attack paths in RideSync, with a concrete review of SQL injection exposure in the current codebase.

## SQL Injection Review

An April 5, 2026 review of the repository did not find any confirmed SQL injection vulnerabilities in the live application query paths.

### Scope Reviewed

- `services/platform-service/internal/infrastructure/repository/postgres_users.go`
- `services/platform-service/internal/infrastructure/repository/postgres_ledger.go`
- `services/platform-service/internal/infrastructure/platgrpc/auth.go`
- `services/platform-service/internal/infrastructure/platgrpc/finance.go`
- `services/platform-service/internal/service/auth_service.go`
- `services/api-gateway/finance_api.go`
- `services/api-gateway/admin_api.go`

### Why The Current Queries Are Safe

- Runtime PostgreSQL access is concentrated in the Platform Service repositories and uses pgx positional parameters such as `$1`, `$2`, and `$3` for user-controlled values.
- User-provided values including email addresses, user IDs, reset tokens, and pagination limits are passed as bound parameters rather than interpolated into SQL strings.
- Finance date-range filters are validated as RFC3339 timestamps in the gRPC layer before reaching the repository, so free-form SQL fragments cannot flow into the query builder.
- The small amount of dynamic SQL construction in the ledger analytics queries only appends placeholder indexes like `$1` and `$2`; it does not append raw request text, column names, table names, or sort expressions.

### Reviewed Examples

Safe parameterized patterns currently used in the repository include:

```go
r.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE email = $1`, email)

r.Pool.Exec(ctx, `
INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
    id, email, hash, role)
```

The date-range analytics queries are also safe in their current form because only placeholder numbers are concatenated:

```go
q := `SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE 1=1`
if from != nil {
    args = append(args, *from)
    q += ` AND created_at >= $` + strconv.Itoa(len(args))
}
```

This pattern is safe here because the resulting SQL text changes only in parameter position, while the actual values still travel through `args...`.

## Remaining Security Constraints

The current posture is good, but the safety depends on preserving a few implementation rules:

- Do not concatenate request values directly into SQL statements, even for seemingly harmless filters.
- If the project later adds dynamic `ORDER BY`, column selection, table selection, or free-form search operators, those identifiers must be chosen from a fixed allowlist rather than copied from user input.
- Keep date parsing and numeric parsing in the HTTP or gRPC boundary so repositories continue to receive typed values instead of untrusted raw strings.
- Treat migration execution as trusted operator-only behavior. `shared/sqlmigrate/sqlmigrate.go` executes raw SQL files by design, so migration paths and files must not be user-controlled.

## Related Controls

- Password reset tokens are hashed before lookup and update operations in the Platform Service.
- Audit log insertion validates that `detail_json` is valid JSON before persisting it as `jsonb`.
- The API Gateway already documents CORS behavior and should continue tightening production origin allowlists rather than relying on wildcard origins.

## Reviewer Conclusion

At the time of review, the checked-in Postgres query paths are parameterized and are not SQL-injection prone. The main future risk is not the existing repository code, but any later introduction of string-built identifiers or raw search clauses without an allowlist.
