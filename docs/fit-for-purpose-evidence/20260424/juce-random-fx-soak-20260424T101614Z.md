# JUCE Random FX Soak (2026-04-24T10:16:27+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.048s`
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
- Xruns per second: `0.4150066401062417`
- CPU total percent (min/max/mean): `{'min': 35.33356039635858, 'max': 41.76080938584321, 'mean': 36.80865336564069}`
- Callback jitter ms (min/max/mean): `{'min': 0.0020283144347827864, 'max': 0.006524770782328573, 'mean': 0.003290345803471175}`
- Callback jitter p95 ms: `0.004284198138312681`
- Peak callback jitter ms: `0.6329636666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.381438842146714, 'max': 41.82709673741227, 'mean': 36.8601291666248}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.132377, 'peak': 0.138979, 'mean': 0.12545134782608694}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `sine`: `2` flow(s)
- `triangle`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T101614Z.json`
