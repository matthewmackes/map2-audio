# SynthForge Tier A Soak Validation (2026-02-27T21:05:17+00:00)

## Profile
- Duration target: `1800s`
- Duration actual: `1800.109s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`
- Warmup: `0.25s`
- Reset stats after warmup: `False`
- Bypass non-synth: `False`

## Overall Result
- Status: `FAIL`
- Total samples: `1797`
- Final xrun count: `69`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 34.6631681500769, 'max': 49.73768879715006, 'mean': 38.19997546571669}`
- CPU headroom percent (min/max/mean): `{'min': 50.26231120284994, 'max': 65.3368318499231, 'mean': 61.80002453428331}`
- Callback jitter ms (min/max/mean): `{'min': 0.0005291037545122576, 'max': 0.11730968638554473, 'mean': 0.0021784119715375127}`
- Peak callback jitter ms observed: `18.616122666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.70344785785219, 'max': 49.818743616962266, 'mean': 38.25403625230936}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `64`, >=target alignment `100.00%`, exact-match alignment `99.78%`
- Target `16` -> max `16`, >=target alignment `99.55%`, exact-match alignment `99.55%`
- Target `32` -> max `32`, >=target alignment `99.78%`, exact-match alignment `99.78%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260227/synthforge-tier-a-soak-t013-30m.json`
