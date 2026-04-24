# JUCE Random FX Soak (2026-04-24T10:37:04+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.033s`
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
- Final xrun count: `36`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `2.9917726252804786`
- CPU total percent (min/max/mean): `{'min': 34.95358433108526, 'max': 47.824201027388085, 'mean': 37.561896252663715}`
- Callback jitter ms (min/max/mean): `{'min': 0.0012446369938817082, 'max': 0.02913419155352268, 'mean': 0.004492641657007404}`
- Callback jitter p95 ms: `0.012528825967346429`
- Peak callback jitter ms: `8.286579666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.98978610917403, 'max': 47.89948231515616, 'mean': 37.61411110068573}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.18245999999999998, 'peak': 0.18245999999999998, 'mean': 0.1488178695652174}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `hard_a`: `1` flow(s)
- `random_jump`: `1` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T103652Z.json`
