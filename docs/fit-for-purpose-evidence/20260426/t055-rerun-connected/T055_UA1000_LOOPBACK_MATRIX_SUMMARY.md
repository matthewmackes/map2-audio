# T055 UA-1000 Loopback Matrix (2026-04-26T17:37:20Z)

- overall_status: `FAIL`
- ua1000_port_count: `14`
- playback_port: `EDIROL UA-1000 Pro:playback_AUX0`
- capture_port: `EDIROL UA-1000 Pro:capture_AUX0`

## Preflight

- status: `PASS`
- reason: UA-1000 JACK ports are available for the loopback matrix.
- jack_lsp_artifact: `jack_lsp.txt`

## Conditions

| Condition | Status | Measured trials | Mean RTT (ms) | P95 RTT (ms) | XRUNs |
|---|---|---:|---:|---:|---:|
| tuned | FAIL | 0/3 | None | None | 0 |
| rollback | FAIL | 0/3 | None | None | 0 |

## Comparison

- status: `INCOMPLETE`
- mean_round_trip_delta_ms: `None`
- p95_round_trip_delta_ms: `None`
- recommendation: Incomplete matrix: rerun the missing condition(s) after restoring UA-1000 loopback signal.

Conclusion: Fail: matrix did not capture all requested tuned and rollback trials.
