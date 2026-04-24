# JUCE Random FX Soak (2026-04-24T00:45:38+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.032s`
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
- Final xrun count: `1`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.08311170212765957`
- CPU total percent (min/max/mean): `{'min': 35.32159357798429, 'max': 47.91579447844809, 'mean': 37.583782889405896}`
- Callback jitter ms (min/max/mean): `{'min': 0.001605157443432548, 'max': 0.005331207321800524, 'mean': 0.0028930051780085685}`
- Callback jitter p95 ms: `0.004577971939443631`
- Peak callback jitter ms: `0.6847683333333333`
- Budget utilization percent (min/max/mean): `{'min': 35.371562679633804, 'max': 47.99597793649516, 'mean': 37.6373944396983}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.217765, 'peak': 0.217765, 'mean': 0.1708401304347826}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `hard_a`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T004525Z.json`
