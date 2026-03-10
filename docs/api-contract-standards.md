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
