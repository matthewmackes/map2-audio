# MAP2 API Contract Standards

This document defines the baseline contract rules for MAP2's external control plane.

## Operation IDs

- Operation IDs must be unique across the full OpenAPI document.
- Operation IDs are generated centrally from route module, handler name, HTTP method, and normalized path.
- Route authors should not hand-roll operation IDs unless there is a compelling compatibility reason.

## Error envelope

All operations should publish the same error envelope shape:

```json
{
  "error": {
    "code": "internal_error",
    "message": "Internal server error",
    "details": null
  }
}
```

OpenAPI now injects shared `500` and `503` responses using this schema so clients can model fallback behavior consistently.

## Versioning policy

- New external-facing contracts should land under explicit versioned prefixes such as `/api/v1/...` or `/api/v2/...`.
- Existing unversioned routes remain for compatibility, but unversioned expansion should stop for integrator-facing features.
- Breaking changes should create a new versioned surface instead of silently mutating the existing one.

## Example: engine

Request:

```http
POST /api/engine/start
```

Success response:

```json
{
  "success": true,
  "message": "Audio engine started"
}
```

Error response:

```json
{
  "error": {
    "code": "service_unavailable",
    "message": "Required service or device is unavailable",
    "details": {
      "dependency": "pipewire"
    }
  }
}
```

## Example: midi

Request:

```http
POST /api/v2/midi/learn/start
Content-Type: application/json
```

```json
{
  "target": "plugin://gain:0"
}
```

Success response:

```json
{
  "success": true,
  "state": "learning"
}
```

## Example: tesira

Request:

```http
GET /api/tesira/devices/device-a/status
```

Success response:

```json
{
  "device_id": "device-a",
  "state": "connected",
  "ptp_locked": true
}
```

## Example: cluster

Request:

```http
POST /api/cluster/nodes/node-a/reboot
```

Success response:

```json
{
  "success": true,
  "node_id": "node-a",
  "action": "reboot"
}
```

## Example: avb

Request:

```http
GET /api/avb/streams/stream-1/stats
```

Success response:

```json
{
  "stream_id": "stream-1",
  "packets": 1024,
  "xruns": 0
}
```

---

## Example: device peak-meters (T2519, pivot-13b/c/d)

The unified per-device peak-meter surface lives under the
`/api/v1/devices` prefix. Every device facade under
`app/services/devices/*_meters.py` registers at import time with the
canonical `DeviceMeterSourceRegistry`. The route layer is shared —
adding a new device requires no route changes, only a new facade.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/v1/devices/{device_id}/peak-meters` | GET | Per-channel peak dBFS + `source` + `captured_at` for one device. |
| `/api/v1/devices/peak-meters/registry` | GET | Alphabetical enumeration of every registered device with `has_engine_source`. |
| `/api/v1/devices/peak-meters/registry?include_snapshot=true` | GET | Same enumeration with one inline snapshot per device (single-roundtrip dashboard). |
| `/api/v1/devices/peak-meters/stream` | WS | 30 fps fan-out of the entire registry. Frame envelope is versioned via `schema_version=1`. |
| `/api/v1/devices/peak-meters/stream?device_ids=a,b,c` | WS | Same stream restricted to the listed registry IDs. Unknown IDs silently dropped; whitespace + empty segments tolerated. |
| `/api/v1/devices/peak-meters/cluster/registry` | GET | Cluster fan-out: local registry + per-peer registries + per-peer failure errors. asyncio.gather across discovered peers; 2 s per-peer timeout. |
| `/api/v1/devices/peak-meters/cluster/registry?include_snapshot=true` | GET | Same fan-out, propagating include_snapshot to every peer fetch so each device entry carries an inline snapshot. |
| `/api/v1/devices/peak-meters/cluster/stream` | WS | Cluster WS fan-in: every tick recomputes the cluster registry and pushes a versioned frame. Default cadence 5 fps via `CLUSTER_WS_BROADCAST_INTERVAL_SECONDS`. Frame type: `device_peak_meters:cluster_registry`. |
| `/api/v1/devices/peak-meters/cluster/stream?include_snapshot=true` | WS | Same stream with inline per-device snapshots in every frame. |

Per-device payload shape:

```json
{
  "device_id": "edirol-ua-1000",
  "input_peak_db": [-6.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0],
  "output_peak_db": [-3.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0, -150.0],
  "source": "engine",
  "captured_at": 1715731200.5
}
```

The `source` field reports the wire-up state:

- `"engine"` — measured from the engine's per-device peak buffer (via `JuceEngineMeterSource`).
- `"engine_unavailable"` — engine wire-up installed but the reader callable raised. Silence-shaped payload, still timestamped.
- `"placeholder"` — no engine source installed; values are the silence sentinel (-150.0 dBFS).

The `captured_at` field is a unix timestamp (seconds since epoch, float). Backfilled by `DeviceMeterSourceRegistry.read_snapshot` with wall-clock when the underlying source omitted it; preserved verbatim when the source supplied a value. May be absent on responses from very old backends.

WebSocket frame shape (every tick):

```json
{
  "type": "device_peak_meters:registry",
  "schema_version": 1,
  "data": {
    "devices": [
      {
        "device_id": "edirol-ua-1000",
        "input_channels": 10,
        "output_channels": 10,
        "has_engine_source": false,
        "snapshot": {
          "input_peak_db": [...],
          "output_peak_db": [...],
          "source": "placeholder",
          "captured_at": 1715731200.5
        }
      }
    ]
  }
}
```

Initial state frame arrives immediately on connect; subsequent frames tick at `WS_BROADCAST_INTERVAL_SECONDS` (default 30 fps; module constant patchable for tests). Default cadence matches the MAP2 metering broadcast floor documented in `CLAUDE.md` § Service Polling Floors.

Frontend dedup (run-13h): every WS consumer hook (`useDevicesPeakMetersStream`, `useDeviceMeterSourceStream`, `useDevicesPeakMetersClusterStream`) routes through a single shared `wsSubscriptionStore` keyed by URL. A page mounting multiple consumers against the same URL (e.g. an overview tile filtered to `device_ids=tascam-us144mkii` plus a per-device panel reading the same filter) pays for one socket. The store owns reconnect with exponential 250 ms → 5 s backoff and emits frame parse errors via `onError` rather than tearing down the socket.

Cluster fan-out envelope (run-13f cycle 1):

```json
{
  "local": { "devices": [...] },
  "peers": [
    {
      "node_id": "peer-A",
      "hostname": "a.local",
      "devices": [...],
      "health": "ok"
    }
  ],
  "errors": { "peer-B": "http 504" }
}
```

A discovery service that fails entirely short-circuits to a local-only response (`peers: []`, `errors: {}`) so the operator surface always has a baseline.

Custom error code registered for this surface:

- `device_not_registered` — the per-device GET path received a device_id absent from the registry. Returned with HTTP 404 wrapped in the standard envelope.

---

## Example: sonobus (T2521)

The SonoBus / AOO remote-audio transport (T2521) ships under the
`/api/sonobus/*` prefix. All endpoints follow the standard error
envelope and tag `"SonoBus"` in the OpenAPI document. See
`docs/architecture/SONOBUS_AOO_TRANSPORT.md` for the full surface.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/sonobus/status` | GET | Authority + daemon + connection-server health + Q18 priority default. |
| `/api/sonobus/bindings` | GET / POST | List / create canonical SonoBusBinding rows. |
| `/api/sonobus/bindings/count` | GET | Lightweight count for the Overview tile. |
| `/api/sonobus/bindings/matrix` | GET | binding_kind × consumer_type aggregation + full row list. |
| `/api/sonobus/bindings/{binding_id}` | GET / PATCH / DELETE | Single binding CRUD. |
| `/api/sonobus/bindings/{binding_id}/{enable,disable}` | POST | Lifecycle toggles. |
| `/api/sonobus/cluster/bindings/matrix` | GET | Cluster fan-out (2 s per-peer timeout). |
| `/api/sonobus/peers` | GET | Projection over bindings — one row per (listener_node_id, endpoint, capability). |
| `/api/sonobus/groups` | GET | Projection over bindings — channel-group totals. |
| `/api/sonobus/sessions` | GET | Enabled bindings of kind `stream` + `client_session`. |
| `/api/sonobus/profiles` | GET | Built-in codec + jitter + resend presets (Q7/Q8/Q9). |
| `/api/sonobus/profiles/{profile_id}` | GET | Single preset lookup. |
| `/api/sonobus/events` | WS | sonobus:state on connect + sonobus:heartbeat every 5 s; daemon-side events land with T2521-4. |

Custom error codes registered for this surface:

- `sonobus.daemon_unreachable` — daemon (T2521-4) is not running and the request requires it.
- `sonobus.peer_capability_unsupported` — peer is `aoo_native` only and the operation requires `map2`.
- `sonobus.binding_conflict` — duplicate consumer_id under the same consumer_type.
- `sonobus.transport_disabled_for_recorder` — Q12 hard exclusion; the calling service rejected a `sonobus:` interface ID.

Request (status):

```http
GET /api/sonobus/status
```

Success response:

```json
{
  "authority_ok": true,
  "table_present": true,
  "binding_count": 0,
  "enabled_binding_count": 0,
  "daemon_running": false,
  "daemon_endpoint": null,
  "connection_server_enabled": true,
  "connection_server_running": false,
  "default_transport_priority": "avb_preferred"
}
```

WebSocket frame shape (versioned via `schema_version`):

```json
{
  "type": "sonobus:state",
  "schema_version": 1,
  "data": {
    "authority_ok": true,
    "binding_count": 0,
    "enabled_binding_count": 0,
    "daemon_running": false,
    "timestamp": "2026-05-13T22:00:00+00:00"
  }
}
```

---

## TypeScript contract generation (T2455)

Snapshot request/response payload types are generated from the live Pydantic
models so backend renames cannot silently drift away from the TS surface.

**Generator**: `scripts/generate_typescript_contracts.py`

  - Default: rewrites `web/src/map2/clients/snapshots.generated.ts` from the
    backend's `/openapi.json`. Tries `localhost:8080` first; falls back to
    importing the FastAPI app in-process.
  - `--check`: regenerates to a temp file and compares; non-zero exit if the
    committed file would change. Use this in CI.

**npm scripts** (run from `web/`):

  - `npm run generate:types` — write the file in place.
  - `npm run verify:contracts` — CI freshness check.

**Consumption surface**: `web/src/map2/clients/snapshots.contract.ts` —
re-exports the snapshot input/output types from the generated dump. Always
import contract types from here, not from the raw `snapshots.generated.ts`
(which is `// @ts-nocheck` to tolerate duplicate operation ids in the
cluster-proxy routes).

**Hand-written types** in `web/src/map2/clients/snapshots.ts` and
`web/src/app/components/SnapshotEditor/snapshotEditorState.ts` may continue
to live alongside the generated contract — they layer rich UI state on top
of the request payloads. Treat the generated contract as authoritative for
**everything sent to or received from `/api/snapshots/*`**; the hand types
are UI-state derivatives.

**Updating after a backend Pydantic change**:

```bash
cd web && npm run generate:types
```

Commit the regenerated `snapshots.generated.ts` in the same commit as the
Python change so the contract stays in sync.

---

## TypeScript contract generation (T2455)

Snapshot request/response payload types are generated from the live Pydantic
models so backend renames cannot silently drift away from the TS surface.

**Generator**: `scripts/generate_typescript_contracts.py`

  * Default: rewrites `web/src/map2/clients/snapshots.generated.ts` from the
    backends
