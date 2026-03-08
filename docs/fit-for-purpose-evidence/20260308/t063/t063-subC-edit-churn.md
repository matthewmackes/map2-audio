# JUCE Random FX Soak (2026-03-08T14:20:22+00:00)

## Profile
- Duration target: `180s`
- Duration actual: `180.013s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `23`
- Final xrun count: `232`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 35.05479688614844, 'max': 68.00357058999946, 'mean': 37.13996692402496}`
- Callback jitter ms (min/max/mean): `{'min': 0.00555454636398583, 'max': 0.9993647146981318, 'mean': 0.08874047961590051}`
- Peak callback jitter ms: `37.875715666666665`
- Budget utilization percent (min/max/mean): `{'min': 35.09307204920813, 'max': 68.0680437662424, 'mean': 37.194159723668044}`

## Blend Type Usage
- `random_jump`: `5` flow(s)
- `step_ab`: `1` flow(s)
- `hard_b`: `5` flow(s)
- `sine`: `6` flow(s)
- `hard_a`: `3` flow(s)
- `triangle`: `3` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260308/t063/t063-subC-edit-churn.json`
