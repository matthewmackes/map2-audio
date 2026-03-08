# SynthForge Tier A Soak Validation (2026-02-24T19:00:17+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.15s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`

## Overall Result
- Status: `FAIL`
- Total samples: `19`
- Final xrun count: `19`
- Device: `unknown`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `PASS`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 34.364325031542116, 'max': 39.94712382122748, 'mean': 36.143637168027134}`
- CPU headroom percent (min/max/mean): `{'min': 60.05287617877252, 'max': 65.63567496845789, 'mean': 63.85636283197286}`
- Callback jitter ms (min/max/mean): `{'min': 0.7843841391479682, 'max': 0.8693406115762885, 'mean': 0.8340404715620412}`
- Peak callback jitter ms observed: `20.951730666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.3943866490315, 'max': 39.99401293546931, 'mean': 36.18266652693575}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max observed active voices `8`
- Target `16` -> max observed active voices `16`
- Target `32` -> max observed active voices `32`
- Target `64` -> max observed active voices `64`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-smoke.json`
