# SynthForge Tier A Soak Validation (2026-02-24T21:53:01+00:00)

## Profile
- Duration target: `1800s`
- Duration actual: `1800.184s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`

## Overall Result
- Status: `FAIL`
- Total samples: `1796`
- Final xrun count: `26957`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `FAIL`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `FAIL`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 35.495128202556806, 'max': 79.10780279849746, 'mean': 46.152683139555414}`
- CPU headroom percent (min/max/mean): `{'min': 20.89219720150254, 'max': 64.5048717974432, 'mean': 53.847316860444586}`
- Callback jitter ms (min/max/mean): `{'min': 0.2743689163428617, 'max': 1.7877928128880274, 'mean': 0.7130210359411021}`
- Peak callback jitter ms observed: `26.087078666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.52988182510756, 'max': 79.19022518730989, 'mean': 46.22595177542785}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `64`, >=target alignment `100.00%`, exact-match alignment `99.78%`
- Target `16` -> max `16`, >=target alignment `99.55%`, exact-match alignment `99.55%`
- Target `32` -> max `32`, >=target alignment `99.56%`, exact-match alignment `99.56%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-steadyclock-30m.json`
