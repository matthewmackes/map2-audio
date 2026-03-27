# T209 API Load Qualification Preflight

- Timestamp: `2026-03-27T10:23:31Z`
- Run ID: `t209-smoke-20260327T102300Z`
- API base: `http://127.0.0.1:8080`
- Overall status: `FAIL`

## Checks

- `open_file_limit`: `PASS` - Open-file soft limit 65536 meets requirement >= 65536.
- `api_ready`: `PASS` - API readiness probe reports accepting traffic.
- `startup_order`: `PASS` - Startup-order diagnostics report traffic-gate services ready for qualification.
- `websocket_manager`: `PASS` - Service websocket_manager is running.
- `chain_inventory_route`: `PASS` - Route /api/chains/ responded successfully.
- `plugin_discovery_route`: `PASS` - Route /api/plugins/discover responded successfully.

## Load Command

- Executed: `True`
- Status: `FAIL`
- Reason: Load command exited with code 1.
