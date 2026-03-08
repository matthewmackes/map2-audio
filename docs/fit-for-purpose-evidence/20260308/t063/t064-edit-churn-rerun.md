# JUCE Random FX Soak (2026-03-08T15:13:53+00:00)

## Profile
- Duration target: `180s`
- Duration actual: `180.016s`
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
- Final xrun count: `187`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 34.85102503008868, 'max': 47.89431500300944, 'mean': 36.47917281172847}`
- Callback jitter ms (min/max/mean): `{'min': 0.004804724022969519, 'max': 0.6297428345202615, 'mean': 0.05186787871298983}`
- Peak callback jitter ms: `37.30860766666666`
- Budget utilization percent (min/max/mean): `{'min': 34.885793105752406, 'max': 47.941299572156936, 'mean': 36.52694707582613}`

## Blend Type Usage
- `hard_a`: `3` flow(s)
- `step_ab`: `6` flow(s)
- `random_jump`: `4` flow(s)
- `triangle`: `4` flow(s)
- `hard_b`: `3` flow(s)
- `sine`: `3` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260308/t063/t064-edit-churn-rerun.json`
