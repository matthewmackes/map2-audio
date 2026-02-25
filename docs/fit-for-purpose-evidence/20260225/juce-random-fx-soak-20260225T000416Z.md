# JUCE Random FX Soak (2026-02-25T00:05:17+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.092s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `10.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback_after_load_failure`

## Overall
- Status: `FAIL`
- Flow transitions: `6`
- Final xrun count: `200`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 47.16473384474435, 'max': 66.04770740619344, 'mean': 51.561294305775526}`
- Callback jitter ms (min/max/mean): `{'min': 0.006885945637971222, 'max': 0.2804317459587416, 'mean': 0.03423935869319412}`
- Peak callback jitter ms: `21.609198666666668`
- Budget utilization percent (min/max/mean): `{'min': 47.219193491485036, 'max': 66.11975627630815, 'mean': 51.62823748617595}`

## Blend Type Usage
- `hard_a`: `2` flow(s)
- `hard_b`: `2` flow(s)
- `random_jump`: `2` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T000416Z.json`
