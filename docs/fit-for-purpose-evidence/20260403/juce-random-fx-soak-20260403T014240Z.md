# JUCE Random FX Soak (2026-04-03T01:43:02+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.012s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Preloaded effect pool: `True`
- Preloaded instances: `10`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `12`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.5996402158704777`
- CPU total percent (min/max/mean): `{'min': 33.9424027283583, 'max': 45.63755577395044, 'mean': 35.97886321034667}`
- Callback jitter ms (min/max/mean): `{'min': 0.0007542726874379881, 'max': 0.13601351914093227, 'mean': 0.005282932268040912}`
- Callback jitter p95 ms: `0.004316207262941678`
- Peak callback jitter ms: `6.079918666666667`
- Budget utilization percent (min/max/mean): `{'min': 33.97179489718139, 'max': 45.682101966071315, 'mean': 36.02610834207081}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260403/juce-random-fx-soak-20260403T014240Z.json`
