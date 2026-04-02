# JUCE Random FX Soak (2026-04-02T21:46:25+00:00)

## Profile
- Duration target: `120s`
- Duration actual: `120.013s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `10`
- Final xrun count: `182`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.5165023789089516`
- CPU total percent (min/max/mean): `{'min': 34.25483409829142, 'max': 58.886959535693066, 'mean': 36.36942039658257}`
- Callback jitter ms (min/max/mean): `{'min': 0.0006800643197883284, 'max': 0.29745113991245875, 'mean': 0.006808314259332983}`
- Callback jitter p95 ms: `0.02157859489892458`
- Peak callback jitter ms: `24.659182666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.29689887428027, 'max': 58.93286909754747, 'mean': 36.41959437306985}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `sine`: `3` flow(s)
- `step_ab`: `2` flow(s)
- `random_jump`: `2` flow(s)
- `hard_a`: `1` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T214424Z.json`
