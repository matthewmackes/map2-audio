# JUCE Random FX Soak (2026-04-02T22:29:16+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.014s`
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
- Xruns per second: `0.399720195862896`
- CPU total percent (min/max/mean): `{'min': 34.215754242633764, 'max': 37.76375650225423, 'mean': 35.45298081644241}`
- Callback jitter ms (min/max/mean): `{'min': 0.0006377529269936255, 'max': 0.004717852312176642, 'mean': 0.0016942066615886452}`
- Callback jitter p95 ms: `0.0030175768276335282`
- Peak callback jitter ms: `3.7821636666666665`
- Budget utilization percent (min/max/mean): `{'min': 34.26565941852209, 'max': 37.81915367679598, 'mean': 35.504227264124886}`

## Blend Type Usage
- `step_ab`: `1` flow(s)
- `triangle`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T222854Z.json`
