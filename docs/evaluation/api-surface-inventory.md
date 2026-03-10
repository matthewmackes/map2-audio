# MAP2 API Surface Inventory

Generated: `2026-03-10T13:01:33.047282+00:00`

## Regeneration

```bash
python3 scripts/generate_api_inventory.py
```

## Summary

- OpenAPI paths: `1106`
- HTTP operations: `1227`
- FastAPI route objects: `1239`
- WebSocket routes: `9`
- Duplicate operation IDs: `5`
- Untagged HTTP operations: `14`
- Source-inferred event/message candidates: `29`

## HTTP operations by subsystem

| Subsystem | Operations |
| --- | ---: |
| `api` | 1220 |
| `ws` | 3 |
| `favicon.ico` | 1 |
| `manifest.json` | 1 |
| `root` | 1 |
| `vite.svg` | 1 |

## Top route modules by HTTP operation count

| Module | Operations |
| --- | ---: |
| `app.routes.midi_hub` | 99 |
| `app.routes.tesira` | 74 |
| `app.routes.mpx1` | 45 |
| `app.routes.midi_v2` | 41 |
| `app.routes.avb` | 37 |
| `app.routes.audio` | 36 |
| `app.routes.engine` | 36 |
| `app.routes.cluster_admin` | 34 |
| `app.routes.synthforge` | 32 |
| `app.routes.system` | 28 |
| `app.routes.lcd` | 25 |
| `app.routes.chains` | 24 |
| `app.routes.midi` | 24 |
| `app.routes.impulse_response` | 20 |
| `app.routes.automation` | 19 |

## Duplicate operation IDs

- Duplicate Operation ID upload_nam_model_api_nam_upload_post for function upload_nam_model at /home/mm/map2-audio/app/routes/nam_models.py
- Duplicate Operation ID list_snapshots_api_engine_snapshots_get for function list_snapshots at /home/mm/map2-audio/app/routes/snapshots.py
- Duplicate Operation ID get_node_health_api_cluster_health__node_id__get for function get_node_health at /home/mm/map2-audio/app/routes/cluster_admin.py
- Duplicate Operation ID get_update_schedule_api_cluster_update_schedule_get for function get_update_schedule at /home/mm/map2-audio/app/routes/cluster_update.py
- Duplicate Operation ID get_update_history_api_cluster_update_history_get for function get_update_history at /home/mm/map2-audio/app/routes/cluster_update.py

## WebSocket routes

| Path | Subsystem | Module | Handler |
| --- | --- | --- | --- |
| `/api/audio-path/ws/changes` | `api` | `app.routes.audio_path` | `websocket_audio_path_changes` |
| `/api/lcd/ws/events` | `api` | `app.routes.lcd_events` | `websocket_events` |
| `/api/mpx1/ws` | `api` | `app.routes.mpx1` | `websocket_state` |
| `/api/synthforge/ws/metering` | `api` | `app.routes.synthforge` | `metering_websocket` |
| `/ws` | `ws` | `app.routes.websocket` | `websocket_endpoint` |
| `/ws/events` | `ws` | `app.routes.websocket` | `websocket_events` |
| `/ws/rt` | `ws` | `app.routes.websocket_rt` | `realtime_websocket_endpoint` |
| `/ws/system/metrics` | `ws` | `app.routes.websocket` | `system_metrics_stream` |
| `/ws/v1` | `ws` | `app.routes.websocket` | `websocket_endpoint_v1` |

## Source-inferred event/message types

| Type | Count |
| --- | ---: |
| `device_found` | 2 |
| `error` | 2 |
| `flow_snapshot_loaded` | 2 |
| `scan_complete` | 2 |
| `adopted` | 1 |
| `config_ack` | 1 |
| `deleted` | 1 |
| `disk-health` | 1 |
| `handshake` | 1 |
| `health-overview` | 1 |
| `heartbeat` | 1 |
| `interval_update` | 1 |
| `load` | 1 |
| `meter_update` | 1 |
| `mpx1:heartbeat` | 1 |
| `mpx1:state` | 1 |
| `parameter_batch` | 1 |
| `pipewire_metrics` | 1 |
| `pong` | 1 |
| `reconnecting` | 1 |
| `scan_error` | 1 |
| `tesira:deployments` | 1 |
| `tesira:preset_change` | 1 |
| `tesira:preset_reverse_sync` | 1 |
| `unload` | 1 |

## Generation warnings

- Duplicate Operation ID upload_nam_model_api_nam_upload_post for function upload_nam_model at /home/mm/map2-audio/app/routes/nam_models.py
- Duplicate Operation ID list_snapshots_api_engine_snapshots_get for function list_snapshots at /home/mm/map2-audio/app/routes/snapshots.py
- Duplicate Operation ID get_node_health_api_cluster_health__node_id__get for function get_node_health at /home/mm/map2-audio/app/routes/cluster_admin.py
- Duplicate Operation ID get_update_schedule_api_cluster_update_schedule_get for function get_update_schedule at /home/mm/map2-audio/app/routes/cluster_update.py
- Duplicate Operation ID get_update_history_api_cluster_update_history_get for function get_update_history at /home/mm/map2-audio/app/routes/cluster_update.py

## Notes

- HTTP endpoint details are sourced from FastAPI OpenAPI generation, so request bodies, response codes, tags, and summaries track the live app definition.
- WebSocket routes are discovered from Starlette route registration. Message/event types are inferred from broadcast/send-style callsites in `app/` source and should be treated as contract clues, not a formal schema.
- Duplicate operation IDs are an immediate client-generation risk because downstream SDK generation typically assumes stable unique operation identifiers.

