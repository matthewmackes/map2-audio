# JUCE Random FX Soak (2026-04-24T09:30:31+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.035s`
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
- Final xrun count: `2`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `PASS`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.1661819692563357`
- CPU total percent (min/max/mean): `{'min': 36.02455939071502, 'max': 42.71424266437666, 'mean': 38.21317235365668}`
- Callback jitter ms (min/max/mean): `{'min': 0.0016098722495096894, 'max': 0.005967360621495633, 'mean': 0.0027533414310007645}`
- Callback jitter p95 ms: `0.004671270316838176`
- Peak callback jitter ms: `0.14547433333333326`
- Budget utilization percent (min/max/mean): `{'min': 36.072586286340716, 'max': 42.80658910632948, 'mean': 38.26969982783917}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.186654, 'peak': 0.186654, 'mean': 0.16392760869565218}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `triangle`: `2` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T093019Z.json`
