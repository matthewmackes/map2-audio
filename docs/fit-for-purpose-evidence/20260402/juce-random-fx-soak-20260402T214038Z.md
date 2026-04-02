# JUCE Random FX Soak (2026-04-02T21:43:39+00:00)

## Profile
- Duration target: `180s`
- Duration actual: `180.014s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `15`
- Final xrun count: `174`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.9665914873287632`
- CPU total percent (min/max/mean): `{'min': 34.029589896674295, 'max': 55.485833086215095, 'mean': 36.664563260869194}`
- Callback jitter ms (min/max/mean): `{'min': 0.0004405546401011366, 'max': 0.3567940727751153, 'mean': 0.005878770340850831}`
- Callback jitter p95 ms: `0.0058728783661571235`
- Peak callback jitter ms: `20.34602466666667`
- Budget utilization percent (min/max/mean): `{'min': 34.0757912551662, 'max': 55.54443620650178, 'mean': 36.71453943399644}`

## Blend Type Usage
- `hard_a`: `3` flow(s)
- `triangle`: `4` flow(s)
- `step_ab`: `2` flow(s)
- `hard_b`: `2` flow(s)
- `sine`: `3` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T214038Z.json`
