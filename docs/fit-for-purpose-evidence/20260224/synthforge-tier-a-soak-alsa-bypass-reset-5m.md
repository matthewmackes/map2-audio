# SynthForge Tier A Soak Validation (2026-02-24T23:11:24+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.202s`
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
- Final xrun count: `147`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 3.0679635231943276, 'max': 7.350699996962659, 'mean': 4.954906792480814}`
- CPU headroom percent (min/max/mean): `{'min': 92.64930000303734, 'max': 96.93203647680568, 'mean': 95.04509320751919}`
- Callback jitter ms (min/max/mean): `{'min': 0.0063439426442658525, 'max': 0.743406011764281, 'mean': 0.02551701439650529}`
- Peak callback jitter ms observed: `22.207004666666666`
- Budget utilization percent (min/max/mean): `{'min': 3.1082050661971494, 'max': 7.412589786001879, 'mean': 5.009569973640894}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-alsa-bypass-reset-5m.json`
