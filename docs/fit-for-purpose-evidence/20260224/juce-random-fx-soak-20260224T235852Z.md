# JUCE Random FX Soak (2026-02-24T23:59:25+00:00)

## Profile
- Duration target: `30s`
- Duration actual: `30.192s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback`

## Overall
- Status: `FAIL`
- Flow transitions: `4`
- Final xrun count: `542`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `FAIL`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 69.3671924382212, 'max': 100.23671739404766, 'mean': 76.21184235553437}`
- Callback jitter ms (min/max/mean): `{'min': 0.007372078339384014, 'max': 0.2929947146927657, 'mean': 0.04241367802202838}`
- Peak callback jitter ms: `21.973106666666666`
- Budget utilization percent (min/max/mean): `{'min': 69.9957364876782, 'max': 100.90634026906963, 'mean': 76.84309097959189}`

## Blend Type Usage
- `hard_a`: `2` flow(s)
- `step_ab`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260224/juce-random-fx-soak-20260224T235852Z.json`
