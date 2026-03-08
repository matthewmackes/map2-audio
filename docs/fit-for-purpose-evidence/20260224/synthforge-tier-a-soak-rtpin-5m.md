# SynthForge Tier A Soak Validation (2026-02-24T21:03:47+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.164s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`

## Overall Result
- Status: `FAIL`
- Total samples: `299`
- Final xrun count: `231`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 35.63487662976751, 'max': 42.50317261776689, 'mean': 37.571725882218466}`
- CPU headroom percent (min/max/mean): `{'min': 57.49682738223311, 'max': 64.36512337023248, 'mean': 62.42827411778153}`
- Callback jitter ms (min/max/mean): `{'min': 0.7124971353119377, 'max': 1.2338547925065724, 'mean': 0.8112713417572106}`
- Peak callback jitter ms observed: `23.970652666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.67391577727938, 'max': 42.54936067763671, 'mean': 37.614099013265744}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-5m.json`
