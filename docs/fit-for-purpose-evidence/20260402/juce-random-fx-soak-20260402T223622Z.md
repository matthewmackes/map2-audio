# JUCE Random FX Soak (2026-04-02T22:36:44+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.014s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `4`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.199860097931448`
- CPU total percent (min/max/mean): `{'min': 34.37185791752337, 'max': 41.318389858151484, 'mean': 36.03708246377276}`
- Callback jitter ms (min/max/mean): `{'min': 0.0007100815312369357, 'max': 0.026637925713017475, 'mean': 0.00267354138175115}`
- Callback jitter p95 ms: `0.004053936664195878`
- Peak callback jitter ms: `23.402907666666668`
- Budget utilization percent (min/max/mean): `{'min': 34.41432224219747, 'max': 41.367940047546476, 'mean': 36.08693714474176}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223622Z.json`
