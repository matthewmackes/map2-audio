# JUCE Random FX Soak (2026-04-20T02:14:50+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.041s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `4.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `23`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.9101403537912134`
- CPU total percent (min/max/mean): `{'min': 35.266439389091175, 'max': 45.54104410182918, 'mean': 37.291536901343214}`
- Callback jitter ms (min/max/mean): `{'min': 0.0012356298267488127, 'max': 0.05026607016728325, 'mean': 0.004323160902782737}`
- Callback jitter p95 ms: `0.004178165644726721`
- Peak callback jitter ms: `4.748052666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.31342615535756, 'max': 45.586529304715334, 'mean': 37.340148208725076}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.115269, 'peak': 0.153549, 'mean': 0.12301091304347825}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `triangle`: `1` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T021437Z.json`
