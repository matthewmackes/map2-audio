# JUCE Random FX Soak (2026-04-20T17:34:46+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.039s`
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
- Final xrun count: `48`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `3.98704211313232`
- CPU total percent (min/max/mean): `{'min': 36.57950505069622, 'max': 48.44219134023556, 'mean': 39.958299507303025}`
- Callback jitter ms (min/max/mean): `{'min': 0.0016899398849003614, 'max': 0.1734998522342077, 'mean': 0.01099420018666575}`
- Callback jitter p95 ms: `0.006548401143504853`
- Peak callback jitter ms: `11.242001666666665`
- Budget utilization percent (min/max/mean): `{'min': 36.63078473954356, 'max': 48.51226587442882, 'mean': 40.020343686631996}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.11630299999999999, 'peak': 0.199005, 'mean': 0.1594971304347826}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T173433Z.json`
