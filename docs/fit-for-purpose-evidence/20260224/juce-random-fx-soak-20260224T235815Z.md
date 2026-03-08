# JUCE Random FX Soak (2026-02-24T23:58:46+00:00)

## Profile
- Duration target: `30s`
- Duration actual: `30.064s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback`

## Overall
- Status: `FAIL`
- Flow transitions: `4`
- Final xrun count: `72`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 44.098457678921186, 'max': 71.90678905032223, 'mean': 50.41828739998926}`
- Callback jitter ms (min/max/mean): `{'min': 0.006093111073972788, 'max': 0.19431886736959395, 'mean': 0.026702481190422647}`
- Peak callback jitter ms: `7.451981666666666`
- Budget utilization percent (min/max/mean): `{'min': 44.14727826589866, 'max': 71.97231467900622, 'mean': 50.484540612196476}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `hard_a`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260224/juce-random-fx-soak-20260224T235815Z.json`
