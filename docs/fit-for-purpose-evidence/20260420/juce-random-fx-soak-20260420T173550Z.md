# JUCE Random FX Soak (2026-04-20T17:36:02+00:00)

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
- Final xrun count: `41`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `3.4061643266594666`
- CPU total percent (min/max/mean): `{'min': 37.70768358995981, 'max': 49.20333488270415, 'mean': 40.01526922119035}`
- Callback jitter ms (min/max/mean): `{'min': 0.0011920771356527002, 'max': 0.011509759396374882, 'mean': 0.004349651993915482}`
- Callback jitter p95 ms: `0.011088987529809996`
- Peak callback jitter ms: `29.611660666666666`
- Budget utilization percent (min/max/mean): `{'min': 37.75878951305101, 'max': 49.28380503430084, 'mean': 40.07816425980531}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.125864, 'peak': 0.171872, 'mean': 0.13750817391304349}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `hard_b`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T173550Z.json`
