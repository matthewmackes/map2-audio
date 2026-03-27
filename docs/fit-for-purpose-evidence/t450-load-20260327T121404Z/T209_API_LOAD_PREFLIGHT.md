# T209 API Load Qualification Preflight

- Timestamp: `2026-03-27T12:16:38Z`
- Run ID: `t450-load-20260327T121404Z`
- API base: `http://127.0.0.1:8080`
- Overall status: `PASS`

## Checks

- `open_file_limit`: `PASS` - Open-file soft limit 65536 meets requirement >= 65536.
- `api_ready`: `PASS` - API readiness probe reports accepting traffic.
- `startup_order`: `PASS` - Startup-order diagnostics report traffic-gate services ready for qualification.
- `websocket_manager`: `PASS` - Service websocket_manager is running.
- `chain_inventory_route`: `PASS` - Route /api/chains/ responded successfully.
- `plugin_discovery_route`: `PASS` - Route /api/plugins/discover responded successfully.
- `runtime_route_warmup`: `PASS` - Runtime hot paths warmed successfully before timed qualification.

## Load Command

- Executed: `True`
- Status: `PASS`
- Reason: Load command completed successfully.
