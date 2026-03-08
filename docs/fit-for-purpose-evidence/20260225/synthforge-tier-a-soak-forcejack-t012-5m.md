# SynthForge Tier A Soak Validation (2026-02-25T02:25:30+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.146s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`
- Warmup: `0.25s`
- Reset stats after warmup: `False`
- Bypass non-synth: `True`

## Overall Result
- Status: `FAIL`
- Total samples: `299`
- Final xrun count: `151`
- Device: `EDIROL UA-1000 Multichannel`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 4.688533328160086, 'max': 9.460050099500187, 'mean': 6.776799148934297}`
- CPU headroom percent (min/max/mean): `{'min': 90.5399499004998, 'max': 95.31146667183991, 'mean': 93.2232008510657}`
- Callback jitter ms (min/max/mean): `{'min': 0.00523743202468484, 'max': 0.3655066347925305, 'mean': 0.018184040408698147}`
- Peak callback jitter ms observed: `23.839806666666668`
- Budget utilization percent (min/max/mean): `{'min': 4.740219795664107, 'max': 9.522466378811654, 'mean': 6.8415568583886985}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260225/synthforge-tier-a-soak-forcejack-t012-5m.json`
