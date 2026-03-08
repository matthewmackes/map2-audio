# SynthForge Tier A Soak Validation (2026-02-24T21:50:35+00:00)

## Profile
- Duration target: `600s`
- Duration actual: `600.184s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`

## Overall Result
- Status: `FAIL`
- Total samples: `599`
- Final xrun count: `24094`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `FAIL`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `FAIL`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 36.09673580086108, 'max': 78.36509081929582, 'mean': 57.98786836267081}`
- CPU headroom percent (min/max/mean): `{'min': 21.634909180704184, 'max': 63.90326419913892, 'mean': 42.0121316373292}`
- Callback jitter ms (min/max/mean): `{'min': 0.3132355866940967, 'max': 1.5757066633874774, 'mean': 0.6339762024912867}`
- Peak callback jitter ms observed: `27.251764666666666`
- Budget utilization percent (min/max/mean): `{'min': 36.146532720731514, 'max': 78.4233266468547, 'mean': 58.11404183982076}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `99.33%`, exact-match alignment `99.33%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-steadyclock-10m.json`
