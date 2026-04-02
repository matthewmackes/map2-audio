# JUCE Random FX Soak (2026-04-02T22:34:23+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.013s`
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
- Final xrun count: `3`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.149902563333833`
- CPU total percent (min/max/mean): `{'min': 33.65620371989844, 'max': 37.369763605527886, 'mean': 35.304679820767625}`
- Callback jitter ms (min/max/mean): `{'min': 0.0006631963792206911, 'max': 0.0038276170874158894, 'mean': 0.0018573023803737955}`
- Callback jitter p95 ms: `0.0034559708731306104`
- Peak callback jitter ms: `4.253013666666667`
- Budget utilization percent (min/max/mean): `{'min': 33.69365895779304, 'max': 37.41580781573821, 'mean': 35.353402591504846}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223400Z.json`
