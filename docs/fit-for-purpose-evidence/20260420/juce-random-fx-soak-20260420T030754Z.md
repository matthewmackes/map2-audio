# JUCE Random FX Soak (2026-04-20T03:08:06+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.043s`
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
- Final xrun count: `50`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `4.151789421240555`
- CPU total percent (min/max/mean): `{'min': 35.425483840557554, 'max': 46.58709913626942, 'mean': 38.53676172921687}`
- Callback jitter ms (min/max/mean): `{'min': 0.0016902269613648312, 'max': 0.20832572995058757, 'mean': 0.02630077538580145}`
- Callback jitter p95 ms: `0.19427869996322097`
- Peak callback jitter ms: `14.669248666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.47330589475822, 'max': 46.64311432938995, 'mean': 38.59748924183045}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.114843, 'peak': 0.16641, 'mean': 0.13615713043478261}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `hard_a`: `1` flow(s)
- `triangle`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T030754Z.json`
