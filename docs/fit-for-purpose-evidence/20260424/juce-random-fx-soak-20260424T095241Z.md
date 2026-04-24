# JUCE Random FX Soak (2026-04-24T09:52:54+00:00)

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
- Final xrun count: `10`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.8304268393954493`
- CPU total percent (min/max/mean): `{'min': 34.85330855741924, 'max': 40.85925905676075, 'mean': 37.06191320635346}`
- Callback jitter ms (min/max/mean): `{'min': 0.0017962302426871137, 'max': 0.0045823226199541685, 'mean': 0.002996918858888913}`
- Callback jitter p95 ms: `0.003997890251802692`
- Peak callback jitter ms: `0.7561483333333333`
- Budget utilization percent (min/max/mean): `{'min': 34.90504680806371, 'max': 40.923732782012756, 'mean': 37.11377150595642}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.144164, 'peak': 0.144712, 'mean': 0.13117878260869564}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `hard_a`: `2` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T095241Z.json`
