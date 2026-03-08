# JUCE Random FX Soak (2026-03-08T15:10:47+00:00)

## Profile
- Duration target: `180s`
- Duration actual: `180.01s`
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
- Final xrun count: `154`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 34.90227237058364, 'max': 45.50320432098918, 'mean': 36.55000764902546}`
- Callback jitter ms (min/max/mean): `{'min': 0.0026188612250407075, 'max': 1.750663408085706, 'mean': 0.0728727371532871}`
- Peak callback jitter ms: `34.997985666666665`
- Budget utilization percent (min/max/mean): `{'min': 34.93743169624632, 'max': 45.58205055581955, 'mean': 36.59553770670314}`

## Blend Type Usage
- `random_jump`: `3` flow(s)
- `hard_b`: `3` flow(s)
- `sine`: `4` flow(s)
- `triangle`: `2` flow(s)
- `step_ab`: `1` flow(s)
- `hard_a`: `2` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260308/t063/t064-steady-rerun.json`
