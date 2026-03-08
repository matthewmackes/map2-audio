# JUCE Random FX Soak (2026-03-08T10:40:17+00:00)

## Profile
- Duration target: `30000s`
- Duration actual: `30000.107s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `3.0s`
- Blend step: `0.5s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `PASS`
- Flow transitions: `9981`
- Final xrun count: `96894`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 10000000: `PASS`
- Peak callback jitter <= 1000.0 ms: `PASS`
- Peak budget utilization <= 500.0%: `PASS`
- Flow apply errors <= 100000: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 44.27743147436755, 'max': 102.54959435467535, 'mean': 50.70607049608126}`
- Callback jitter ms (min/max/mean): `{'min': 0.0017118782389894957, 'max': 1.2801845373601275, 'mean': 0.07796905562832519}`
- Peak callback jitter ms: `37.93631366666666`
- Budget utilization percent (min/max/mean): `{'min': 44.325216343761696, 'max': 102.61297048277747, 'mean': 50.764624826547035}`

## Blend Type Usage
- `hard_a`: `1675` flow(s)
- `random_jump`: `1649` flow(s)
- `triangle`: `1707` flow(s)
- `sine`: `1675` flow(s)
- `hard_b`: `1649` flow(s)
- `step_ab`: `1626` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260307/t058/t058-full-10000loops-3s-10fx-live.json`
