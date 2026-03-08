# SynthForge Tier A Soak Validation (2026-02-24T21:09:02+00:00)

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
- Final xrun count: `223`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 35.59490773563355, 'max': 40.79669427443059, 'mean': 37.71810720793348}`
- CPU headroom percent (min/max/mean): `{'min': 59.20330572556941, 'max': 64.40509226436646, 'mean': 62.28189279206652}`
- Callback jitter ms (min/max/mean): `{'min': 0.7438916552802114, 'max': 1.4525119075427186, 'mean': 0.8099213898044622}`
- Peak callback jitter ms observed: `23.251693666666668`
- Budget utilization percent (min/max/mean): `{'min': 35.63338949609729, 'max': 40.855447980150025, 'mean': 37.76229665180576}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-pwjack-5m.json`
