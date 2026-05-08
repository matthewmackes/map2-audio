# JUCE Random FX Soak (2026-05-08T13:57:09+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.097s`
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
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `540`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `8.985473484533337`
- CPU total percent (min/max/mean): `{'min': 36.253499753880064, 'max': 51.575745621737944, 'mean': 39.71423985518439}`
- Callback jitter ms (min/max/mean): `{'min': 0.049641136639844076, 'max': 0.2085724710534679, 'mean': 0.070785533445612}`
- Callback jitter p95 ms: `0.1542295467455262`
- Peak callback jitter ms: `18.758940666666668`
- Budget utilization percent (min/max/mean): `{'min': 36.29206499424918, 'max': 51.64838448904364, 'mean': 39.771155218467186}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.141064, 'peak': 0.174614, 'mean': 0.1495997627118644}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260508/juce-random-fx-soak-20260508T135608Z.json`
