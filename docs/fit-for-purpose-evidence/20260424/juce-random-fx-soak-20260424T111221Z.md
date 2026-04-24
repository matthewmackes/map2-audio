# JUCE Random FX Soak (2026-04-24T11:12:34+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.042s`
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
- Final xrun count: `20`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.6608536787908985`
- CPU total percent (min/max/mean): `{'min': 35.14491296899654, 'max': 49.03382979294722, 'mean': 37.47374764386001}`
- Callback jitter ms (min/max/mean): `{'min': 0.0014294182547111521, 'max': 0.03314030544255649, 'mean': 0.004501483624725689}`
- Callback jitter p95 ms: `0.01171607914552029`
- Peak callback jitter ms: `4.445953666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.186453635386, 'max': 49.15079900597226, 'mean': 37.52537096330748}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.214887, 'peak': 0.214887, 'mean': 0.16328317391304345}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `random_jump`: `1` flow(s)
- `sine`: `1` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T111221Z.json`
