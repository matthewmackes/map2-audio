# MAP2 API Authentication and Authorization Model

MAP2 now has a single global API auth/authz model for HTTP and WebSocket entrypoints. Enforcement is provided by [APIAuthMiddleware](/home/mm/map2-audio/app/middleware/api_auth.py).

## Mode

`MAP2_API_AUTH_MODE` controls enforcement.

- `disabled`: no auth enforcement; preserves current local/dev behavior
- `required`: enforce token-based roles across HTTP and WebSocket entrypoints

The default remains `disabled` so existing local workflows do not break silently. Production-style deployments should set `MAP2_API_AUTH_MODE=required` and provision tokens via `/etc/map2/environment` or another secret source.

## Tokens

- `MAP2_API_OPERATOR_TOKEN`: read access and websocket subscriptions
- `MAP2_API_ADMIN_TOKEN`: mutating API access plus operator privileges
- `MAP2_API_CLUSTER_TOKEN`: cluster/deployment/ssh/config operations plus admin/operator privileges

Tokens may be presented via:

- `Authorization: Bearer <token>`
- `X-MAP2-API-Key: <token>`
- WebSocket query parameter `?token=<token>` or `?api_key=<token>`

## Trust boundaries

- Public: `/`, static assets, docs/openapi, `api/health`, `api/ready`, `api/version`, and `api/auth/*`
- Operator: non-public read access and websocket subscriptions
- Admin: mutating non-cluster API operations (`POST`, `PUT`, `PATCH`, `DELETE`)
- Cluster: `/api/cluster*`, `/api/raft*`, `/api/config*`, `/api/flow_failover*`, `/api/deployment*`, `/api/ssh_trust*`

## Special mode password behavior

`SPECIAL_MODE_PASSWORD` no longer falls back to an implicit `backdoor` default. If the password is unset, `/api/auth/special-backdoor` returns `503` instead of silently exposing a hidden default credential.

## Migration note

This change establishes the model without forcing every current install into immediate credential provisioning. To move a host into enforced mode:

1. Set `MAP2_API_AUTH_MODE=required`.
2. Provision operator/admin/cluster tokens in `/etc/map2/environment`.
3. Restart the backend service.
4. Update automation and websocket clients to send the appropriate token.
