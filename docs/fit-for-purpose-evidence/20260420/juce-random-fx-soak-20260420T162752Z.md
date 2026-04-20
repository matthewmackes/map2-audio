# JUCE Random FX Soak (2026-04-20T16:28:05+00:00)

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
- Final xrun count: `17`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.4118428701935055`
- CPU total percent (min/max/mean): `{'min': 36.83465652277415, 'max': 47.48548391293107, 'mean': 40.26633292909103}`
- Callback jitter ms (min/max/mean): `{'min': 0.001558176018061967, 'max': 0.040286511315383265, 'mean': 0.006186497435415876}`
- Callback jitter p95 ms: `0.026646289324447823`
- Peak callback jitter ms: `10.996952666666665`
- Budget utilization percent (min/max/mean): `{'min': 36.88590130057564, 'max': 47.55486252972628, 'mean': 40.32727400376349}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.139058, 'peak': 0.142649, 'mean': 0.12833978260869564}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `hard_b`: `1` flow(s)
- `random_jump`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T162752Z.json`
