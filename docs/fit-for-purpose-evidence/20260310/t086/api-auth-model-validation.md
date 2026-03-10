# T086 API Auth Model Validation

Date: 2026-03-10

## Scope

This validation covers the new global API auth/authz model implemented by `app/middleware/api_auth.py` and the removal of the implicit special-mode fallback password in `app/routes/auth.py`.

## Validation command

```bash
pytest tests/test_api_auth_middleware.py tests/test_special_mode_auth.py -q
```

## Result

- Status: PASS
- Tests passed: `4`

## What was verified

- Public health endpoints remain accessible without credentials.
- Operator token grants read access.
- Admin token is required for mutating non-cluster routes.
- Cluster token is required for cluster/deployment control routes.
- WebSocket access accepts the same token model via query parameter.
- `/api/auth/special-backdoor` returns `503` when `SPECIAL_MODE_PASSWORD` is unset instead of exposing an implicit default password.
