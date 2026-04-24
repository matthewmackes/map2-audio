# JUCE Random FX Soak (2026-04-24T01:22:32+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.036s`
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
- Final xrun count: `5`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.4154204054503157`
- CPU total percent (min/max/mean): `{'min': 35.48506208840683, 'max': 45.47939580711525, 'mean': 38.33628133736548}`
- Callback jitter ms (min/max/mean): `{'min': 0.002038276643388654, 'max': 0.005217980311145147, 'mean': 0.003047942036040454}`
- Callback jitter p95 ms: `0.004775475735955059`
- Peak callback jitter ms: `0.47185866666666665`
- Budget utilization percent (min/max/mean): `{'min': 35.534311560874585, 'max': 45.555262561836244, 'mean': 38.39385623179789}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.178808, 'peak': 0.178808, 'mean': 0.14229408695652174}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `random_jump`: `1` flow(s)
- `sine`: `1` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T012219Z.json`
