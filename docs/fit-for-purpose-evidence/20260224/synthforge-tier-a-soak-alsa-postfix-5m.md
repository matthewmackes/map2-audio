# SynthForge Tier A Soak Validation (2026-02-24T22:58:04+00:00)

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
- Final xrun count: `199`
- Device: `Default ALSA Output (currently PipeWire Media Server)`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 36.168058952506186, 'max': 41.210800930030175, 'mean': 38.135167985265966}`
- CPU headroom percent (min/max/mean): `{'min': 58.789199069969825, 'max': 63.831941047493814, 'mean': 61.864832014734034}`
- Callback jitter ms (min/max/mean): `{'min': 0.7491547887383788, 'max': 1.1515878861070332, 'mean': 0.80337292981912}`
- Peak callback jitter ms observed: `22.854281666666665`
- Budget utilization percent (min/max/mean): `{'min': 36.20555617422128, 'max': 41.2579032303276, 'mean': 38.17943913550472}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-alsa-postfix-5m.json`
