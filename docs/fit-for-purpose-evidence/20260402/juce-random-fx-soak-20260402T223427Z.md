# JUCE Random FX Soak (2026-04-02T22:34:49+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.012s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `8`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.3997601439136518`
- CPU total percent (min/max/mean): `{'min': 34.34838213375153, 'max': 38.23748005200283, 'mean': 35.91097129056367}`
- Callback jitter ms (min/max/mean): `{'min': 0.0007623149811170891, 'max': 0.004479746523506232, 'mean': 0.0015994835480821143}`
- Callback jitter p95 ms: `0.0024184227315967367`
- Peak callback jitter ms: `3.8055546666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.39736437598919, 'max': 38.28837701832127, 'mean': 35.95975249188353}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223427Z.json`
