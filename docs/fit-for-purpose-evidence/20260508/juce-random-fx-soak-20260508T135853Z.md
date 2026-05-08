# JUCE Random FX Soak (2026-05-08T13:59:54+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.011s`
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
- Final xrun count: `748`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `12.464381530052822`
- CPU total percent (min/max/mean): `{'min': 35.856569779055775, 'max': 54.43291436810623, 'mean': 39.56420553654909}`
- Callback jitter ms (min/max/mean): `{'min': 0.05001983433064543, 'max': 0.37838877915629693, 'mean': 0.07801584684882172}`
- Callback jitter p95 ms: `0.1928026334177764`
- Peak callback jitter ms: `18.137904666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.903131553232456, 'max': 54.507369043522466, 'mean': 39.618872262903714}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.12131499999999999, 'peak': 0.12131499999999999, 'mean': 0.11004825423728813}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `triangle`: `2` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260508/juce-random-fx-soak-20260508T135853Z.json`
