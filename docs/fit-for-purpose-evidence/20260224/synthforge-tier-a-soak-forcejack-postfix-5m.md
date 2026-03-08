# SynthForge Tier A Soak Validation (2026-02-24T22:52:42+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.163s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Voice cycle: `[8, 16, 32, 64]`
- Sample interval: `1.0s`

## Overall Result
- Status: `FAIL`
- Total samples: `299`
- Final xrun count: `65`
- Device: `EDIROL UA-1000 Multichannel`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Min headroom >= 30.0%: `FAIL`
- Peak callback jitter <= 0.2 ms: `FAIL`
- Peak budget utilization <= 70.0%: `PASS`
- Voice tracking hit each target: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 69.70926569542327, 'max': 80.02950300531326, 'mean': 74.96474084452203}`
- CPU headroom percent (min/max/mean): `{'min': 19.97049699468674, 'max': 30.29073430457673, 'mean': 25.035259155477974}`
- Callback jitter ms (min/max/mean): `{'min': 0.005933496642275437, 'max': 0.5414172476707574, 'mean': 0.017720117213638614}`
- Peak callback jitter ms observed: `23.87284533333333`
- Budget utilization percent (min/max/mean): `{'min': 34.874771229916064, 'max': 40.057137952037074, 'mean': 37.517835280072454}`
- Max active voices observed: `64`
- Max peak voices observed: `64`

## Voice Tracking by Target
- Target `8` -> max `8`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `16` -> max `16`, >=target alignment `98.67%`, exact-match alignment `98.67%`
- Target `32` -> max `32`, >=target alignment `100.00%`, exact-match alignment `100.00%`
- Target `64` -> max `64`, >=target alignment `100.00%`, exact-match alignment `100.00%`

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-forcejack-postfix-5m.json`
