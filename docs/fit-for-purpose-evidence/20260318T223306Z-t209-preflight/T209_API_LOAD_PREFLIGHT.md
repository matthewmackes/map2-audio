# T209 API Load Qualification Preflight

- Timestamp: `2026-03-18T22:33:07Z`
- Run ID: `t209-20260318T223307Z`
- API base: `http://127.0.0.1:8080`
- Overall status: `BLOCKED`

## Checks

- `open_file_limit`: `BLOCKED` - Open-file soft limit 8192 is below required >= 65536.
- `api_ready`: `BLOCKED` - Readiness probe did not report accepting traffic (status=200).
- `startup_order`: `BLOCKED` - Startup-order diagnostics are incomplete (status=200, completed=0, total=0).
- `websocket_manager`: `PASS` - Service websocket_manager is running.
- `chain_inventory_route`: `PASS` - Route /api/chains/ responded successfully.
- `plugin_discovery_route`: `PASS` - Route /api/plugins/discover responded successfully.

## Load Command

- Executed: `False`
- Status: `SKIPPED`
- Reason: No load command requested.
