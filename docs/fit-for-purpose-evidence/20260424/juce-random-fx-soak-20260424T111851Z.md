# JUCE Random FX Soak (2026-04-24T11:19:03+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.037s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `4.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `27`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `2.243083824873307`
- CPU total percent (min/max/mean): `{'min': 36.165469660794855, 'max': 47.240028826178474, 'mean': 38.38154985479341}`
- Callback jitter ms (min/max/mean): `{'min': 0.0020332656803084717, 'max': 0.10603524409360818, 'mean': 0.008031447864182516}`
- Callback jitter p95 ms: `0.00673675721613222`
- Peak callback jitter ms: `10.761651666666666`
- Budget utilization percent (min/max/mean): `{'min': 36.215883629858276, 'max': 47.321980800366184, 'mean': 38.450431079983225}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.178924, 'peak': 0.178924, 'mean': 0.14466230434782607}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 41}`

## Blend Type Usage
- `step_ab`: `1` flow(s)
- `sine`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T111851Z.json`
