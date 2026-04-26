# T055 UA-1000 Loopback Matrix (2026-04-26T17:17:08Z)

- overall_status: `BLOCKED`
- ua1000_port_count: `0`
- playback_port: `None`
- capture_port: `None`

## Preflight

- status: `BLOCKED`
- reason: UA-1000 ports are absent from the current JACK graph.
- jack_lsp_artifact: `jack_lsp.txt`

## Conditions

| Condition | Status | Measured trials | Mean RTT (ms) | P95 RTT (ms) | XRUNs |
|---|---|---:|---:|---:|---:|
| tuned | BLOCKED | 0/3 | None | None | 0 |
| rollback | BLOCKED | 0/3 | None | None | 0 |

## Comparison

- status: `INCOMPLETE`
- mean_round_trip_delta_ms: `None`
- p95_round_trip_delta_ms: `None`
- recommendation: Reconnect or activate the UA-1000 so JACK exposes UA-1000 ports, then rerun the matrix.

Conclusion: Blocked: UA-1000-specific loopback matrix cannot run until JACK exposes UA-1000 ports.
