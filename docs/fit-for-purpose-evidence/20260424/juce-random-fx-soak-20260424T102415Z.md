# JUCE Random FX Soak (2026-04-24T10:24:28+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.031s`
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
- Final xrun count: `21`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.7454908153935664`
- CPU total percent (min/max/mean): `{'min': 34.717362354619745, 'max': 47.81917909394485, 'mean': 37.96364055383739}`
- Callback jitter ms (min/max/mean): `{'min': 0.0013058939724791383, 'max': 0.26005319984030756, 'mean': 0.017309727759478123}`
- Callback jitter p95 ms: `0.038586658554151984`
- Peak callback jitter ms: `4.393499666666667`
- Budget utilization percent (min/max/mean): `{'min': 34.754730307324, 'max': 47.86936787223187, 'mean': 38.016962526095185}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.11487, 'peak': 0.166096, 'mean': 0.13011373913043478}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T102415Z.json`
