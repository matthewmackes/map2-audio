# JUCE Random FX Soak (2026-04-20T03:03:01+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.038s`
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
- Final xrun count: `39`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `3.239740820734341`
- CPU total percent (min/max/mean): `{'min': 35.53932972143395, 'max': 44.79938725530001, 'mean': 37.77997833441924}`
- Callback jitter ms (min/max/mean): `{'min': 0.00190181715915695, 'max': 0.12783786496580743, 'mean': 0.01131160847699792}`
- Callback jitter p95 ms: `0.0373382952561123`
- Peak callback jitter ms: `3.328927666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.59201718372711, 'max': 44.86887616188678, 'mean': 37.83571447504904}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.168134, 'peak': 0.168134, 'mean': 0.1496981304347826}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `triangle`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T030248Z.json`
