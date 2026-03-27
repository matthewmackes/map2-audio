# T209 Qualification Closure - 2026-03-27

## Passing Artifacts

- Smoke qualification pass: `docs/fit-for-purpose-evidence/t209-smoke-20260327T114050Z`
- Full 310-second qualification pass: `docs/fit-for-purpose-evidence/t209-full-20260327T114213Z`

## Restart Qualification

- Restart 1: `2026-03-27T11:47:54Z`, `elapsed=68s`, `/api/health=healthy`, `/api/ready.accepting_traffic=true`
- Restart 2: `2026-03-27T11:49:02Z`, `elapsed=30s`, `/api/health=healthy`, `/api/ready.accepting_traffic=true`
- Restart 3: `2026-03-27T11:49:54Z`, `elapsed=29s`, `/api/health=healthy`, `/api/ready.accepting_traffic=true`

## Comparison To 2026-03-07 Failure Signatures

- The reviewed failure bundle showed `379/400` HTTP failures, `9240` websocket drops, transient `404`/`500`/`503` lifecycle errors, and 8-second read/connect timeouts.
- The 2026-03-27 smoke rerun passed with zero websocket drops and a passing server-side steady-state gate.
- The 2026-03-27 full 310-second rerun passed with zero websocket drops and a passing server-side steady-state gate.
- Controlled restart validation recovered to healthy readiness after each restart, and repeated restarts no longer needed manual intervention to restore `/api/ready.accepting_traffic=true`.

## Final Notes

- `tests/load_test.py` now evaluates server-side REST qualification from an explicit observability recording session so the gate uses the full run instead of a tail-truncated live ring buffer.
- Chain lifecycle qualification now uses the widened route timeout from `app/routes/chains.py`, which removed the false-positive `/api/chains/{id}/activate` `503` seen under concurrent load with the earlier `0.5s` timeout.
- Residual follow-up remains tracked separately for the one post-soak restart that still took `68s` before the next two restarts stabilized at `30s` and `29s`.
