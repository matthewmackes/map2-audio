# JUCE Random FX Soak (2026-04-20T02:54:56+00:00)

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
- Final xrun count: `30`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `2.491073652744333`
- CPU total percent (min/max/mean): `{'min': 35.35126940636714, 'max': 45.334007700587684, 'mean': 37.860543694836736}`
- Callback jitter ms (min/max/mean): `{'min': 0.002151328583877226, 'max': 0.03950099969222902, 'mean': 0.006896022487080613}`
- Callback jitter p95 ms: `0.03398344796947936`
- Peak callback jitter ms: `8.157328666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.40311998157415, 'max': 45.39382132170045, 'mean': 37.91316307886953}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.118534, 'peak': 0.141117, 'mean': 0.12129508695652173}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `step_ab`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T025443Z.json`
