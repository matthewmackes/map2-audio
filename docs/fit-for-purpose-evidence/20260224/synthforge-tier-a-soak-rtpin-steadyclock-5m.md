# SynthForge Tier A Soak Validation (2026-02-24T21:22:43+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.165s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`

## Overall Result
- Status: `FAIL`
- Total samples: `299`
- Final xrun count: `180`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 35.56672959523289, 'max': 41.25661875585128, 'mean': 37.75973774564239}`
- CPU headroom percent (min/max/mean): `{'min': 58.74338124414872, 'max': 64.43327040476711, 'mean': 62.2402622543576}`
- Callback jitter ms (min/max/mean): `{'min': 0.7432118480547178, 'max': 1.2798735532839702, 'mean': 0.8117213484345428}`
- Peak callback jitter ms observed: `23.375010666666668`
- Budget utilization percent (min/max/mean): `{'min': 35.59969417829105, 'max': 41.305318601540876, 'mean': 37.80292619097311}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-steadyclock-5m.json`
