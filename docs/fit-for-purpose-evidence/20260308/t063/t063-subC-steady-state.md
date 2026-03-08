# JUCE Random FX Soak (2026-03-08T14:17:15+00:00)

## Profile
- Duration target: `180s`
- Duration actual: `180.015s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `15`
- Final xrun count: `175`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 34.80791374934093, 'max': 41.64400320970662, 'mean': 36.477548226975955}`
- Callback jitter ms (min/max/mean): `{'min': 0.004528072306834662, 'max': 0.9650067915122643, 'mean': 0.06446851485404277}`
- Peak callback jitter ms: `27.281262666666667`
- Budget utilization percent (min/max/mean): `{'min': 34.8405471246685, 'max': 41.71771256943455, 'mean': 36.52566289947393}`

## Blend Type Usage
- `triangle`: `2` flow(s)
- `hard_a`: `3` flow(s)
- `random_jump`: `3` flow(s)
- `sine`: `3` flow(s)
- `step_ab`: `3` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260308/t063/t063-subC-steady-state.json`
