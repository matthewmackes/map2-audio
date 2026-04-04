# JUCE Random FX Soak (2026-04-04T19:01:37+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.012s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Preloaded effect pool: `True`
- Preloaded instances: `10`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `PASS`
- Flow transitions: `3`
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
- CPU total percent (min/max/mean): `{'min': 34.86683559082618, 'max': 41.21853435888742, 'mean': 36.50054316649796}`
- Callback jitter ms (min/max/mean): `{'min': 0.0008521439641337422, 'max': 0.005594535367986405, 'mean': 0.00249818854024901}`
- Callback jitter p95 ms: `0.003815068064304628`
- Peak callback jitter ms: `0.05170666666666657`
- Budget utilization percent (min/max/mean): `{'min': 34.91226657478286, 'max': 41.32024384984403, 'mean': 36.555448969941786}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.17282899999999998, 'peak': 0.188411, 'mean': 0.15874453846153846}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 21, 'added': 37}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260404/juce-random-fx-soak-20260404T190115Z.json`
