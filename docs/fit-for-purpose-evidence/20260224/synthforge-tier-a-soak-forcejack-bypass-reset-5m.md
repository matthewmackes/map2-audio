# SynthForge Tier A Soak Validation (2026-02-24T23:06:12+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.113s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`
- Warmup: `5.0s`
- Reset stats after warmup: `True`
- Bypass non-synth: `True`

## Overall Result
- Status: `FAIL`
- Total samples: `299`
- Final xrun count: `124`
- Device: `EDIROL UA-1000 Multichannel`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 2.9890983115890455, 'max': 7.841499055713387, 'mean': 5.103437651125448}`
- CPU headroom percent (min/max/mean): `{'min': 92.15850094428662, 'max': 97.01090168841095, 'mean': 94.89656234887454}`
- Callback jitter ms (min/max/mean): `{'min': 0.004240268616152113, 'max': 0.48533263570760454, 'mean': 0.018168578111772155}`
- Peak callback jitter ms observed: `23.795987666666665`
- Budget utilization percent (min/max/mean): `{'min': 3.04095380961143, 'max': 7.9206663213022, 'mean': 5.16931670024955}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-forcejack-bypass-reset-5m.json`
