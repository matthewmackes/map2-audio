# JUCE Random FX Soak (2026-04-24T01:43:52+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.04s`
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
- Final xrun count: `18`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.495016611295681`
- CPU total percent (min/max/mean): `{'min': 35.55008603570505, 'max': 46.54288540846651, 'mean': 37.800398549771266}`
- Callback jitter ms (min/max/mean): `{'min': 0.001813753530824469, 'max': 0.030729165467738965, 'mean': 0.00491039993227617}`
- Callback jitter p95 ms: `0.01027862535075728`
- Peak callback jitter ms: `10.579439666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.596300282482844, 'max': 46.61801471369977, 'mean': 37.85072422695364}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.156505, 'peak': 0.156505, 'mean': 0.1482421304347826}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T014339Z.json`
