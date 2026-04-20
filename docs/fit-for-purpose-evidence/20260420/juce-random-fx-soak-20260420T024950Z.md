# JUCE Random FX Soak (2026-04-20T02:50:02+00:00)

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
- Final xrun count: `59`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `4.901553543241671`
- CPU total percent (min/max/mean): `{'min': 35.21119032451837, 'max': 47.87330566704022, 'mean': 38.21075874514098}`
- Callback jitter ms (min/max/mean): `{'min': 0.0009995234612686428, 'max': 0.09762083192855676, 'mean': 0.009264247202789422}`
- Callback jitter p95 ms: `0.028501674254824666`
- Peak callback jitter ms: `6.092784666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.25466757300696, 'max': 47.93641171077712, 'mean': 38.266119256485645}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.160663, 'peak': 0.18520699999999998, 'mean': 0.14964178260869565}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `step_ab`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T024950Z.json`
