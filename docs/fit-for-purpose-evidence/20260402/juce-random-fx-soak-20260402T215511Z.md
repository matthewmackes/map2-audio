# JUCE Random FX Soak (2026-04-02T21:56:11+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.011s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `5`
- Final xrun count: `55`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.9164986419156488`
- CPU total percent (min/max/mean): `{'min': 34.23705388217352, 'max': 52.76144496543846, 'mean': 36.15494333172088}`
- Callback jitter ms (min/max/mean): `{'min': 0.0010029591390329936, 'max': 0.2962139778562282, 'mean': 0.0052586131783757765}`
- Callback jitter p95 ms: `0.006271846617677487`
- Peak callback jitter ms: `8.173756666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.28671928022772, 'max': 52.82065510783086, 'mean': 36.20599633439838}`

## Blend Type Usage
- `hard_b`: `2` flow(s)
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T215511Z.json`
