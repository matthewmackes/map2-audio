# JUCE Random FX Soak (2026-05-18T16:20:11+00:00)

## Profile
- Duration target: `14400s`
- Duration actual: `14400.023s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `20.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `PASS`
- Flow transitions: `720`
- Final xrun count: `0`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `PASS`
- Peak callback jitter <= 0.35 ms: `PASS`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.0`
- CPU total percent (min/max/mean): `{'min': 0.0, 'max': 0.0, 'mean': 0.0}`
- Callback jitter ms (min/max/mean): `{'min': 0.0, 'max': 0.0, 'mean': 0.0}`
- Callback jitter p95 ms: `0.0`
- Peak callback jitter ms: `0.0`
- Budget utilization percent (min/max/mean): `{'min': 0.0, 'max': 0.0, 'mean': 0.0}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.15051, 'peak': 0.263656, 'mean': 0.15365980084775208}`
- Topology mutation count: `720`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `triangle`: `107` flow(s)
- `sine`: `123` flow(s)
- `step_ab`: `121` flow(s)
- `hard_a`: `121` flow(s)
- `random_jump`: `127` flow(s)
- `hard_b`: `121` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260518/tascam-us144mkii-soak-4h/40_soak_result.json`
