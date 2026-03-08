# JUCE Random FX Soak (2026-02-25T00:03:25+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.088s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `10.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `requested_intersection`

## Overall
- Status: `FAIL`
- Flow transitions: `6`
- Final xrun count: `99`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `FAIL`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 44.53783960585481, 'max': 83.6626155663857, 'mean': 48.67220670051087}`
- Callback jitter ms (min/max/mean): `{'min': 0.00496250553476516, 'max': 0.2557369655804536, 'mean': 0.028321139973443696}`
- Peak callback jitter ms: `22.882865666666667`
- Budget utilization percent (min/max/mean): `{'min': 44.58049514227972, 'max': 83.71313707484474, 'mean': 48.718385264728774}`

## Blend Type Usage
- `hard_b`: `3` flow(s)
- `hard_a`: `2` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T000224Z.json`
