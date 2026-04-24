# JUCE Random FX Soak (2026-04-24T01:53:44+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.037s`
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
- Final xrun count: `4`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.3323087147960455`
- CPU total percent (min/max/mean): `{'min': 34.76957621296498, 'max': 45.85632939107294, 'mean': 37.162027550798804}`
- Callback jitter ms (min/max/mean): `{'min': 0.001251626830212113, 'max': 0.0040008565604967026, 'mean': 0.0027062858976426947}`
- Callback jitter p95 ms: `0.0036617241205329247`
- Peak callback jitter ms: `2.510232666666667`
- Budget utilization percent (min/max/mean): `{'min': 34.806100095487025, 'max': 45.896365806061326, 'mean': 37.21089508400821}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.187154, 'peak': 0.187154, 'mean': 0.16851704347826085}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T015331Z.json`
