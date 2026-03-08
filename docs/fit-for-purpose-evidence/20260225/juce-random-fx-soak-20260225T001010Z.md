# JUCE Random FX Soak (2026-02-25T00:10:43+00:00)

## Profile
- Duration target: `30s`
- Duration actual: `30.288s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback_after_load_failure`

## Overall
- Status: `FAIL`
- Flow transitions: `4`
- Final xrun count: `428`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `FAIL`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 69.96809373137647, 'max': 102.68128793543448, 'mean': 76.89956951213063}`
- Callback jitter ms (min/max/mean): `{'min': 0.006401677980278936, 'max': 0.4604588447727716, 'mean': 0.043624400911759446}`
- Peak callback jitter ms: `22.145700666666666`
- Budget utilization percent (min/max/mean): `{'min': 70.57474850698958, 'max': 103.68003370292287, 'mean': 77.52383391459988}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `random_jump`: `1` flow(s)
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T001010Z.json`
