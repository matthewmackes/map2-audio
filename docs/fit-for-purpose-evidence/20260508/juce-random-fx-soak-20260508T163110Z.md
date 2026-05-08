# JUCE Random FX Soak (2026-05-08T16:36:14+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.039s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `20.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `15`
- Final xrun count: `238`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.7932302134055906`
- CPU total percent (min/max/mean): `{'min': 36.18631085578084, 'max': 51.30958472137651, 'mean': 39.737716555951266}`
- Callback jitter ms (min/max/mean): `{'min': 0.046666242314261995, 'max': 0.12652090627709375, 'mean': 0.05721072163729656}`
- Callback jitter p95 ms: `0.06587717865244823`
- Peak callback jitter ms: `18.942889666666666`
- Budget utilization percent (min/max/mean): `{'min': 36.23643517673528, 'max': 51.40792798772025, 'mean': 39.799328417223315}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.150807, 'peak': 0.19746999999999998, 'mean': 0.1509099498327759}`
- Topology mutation count: `15`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `hard_b`: `2` flow(s)
- `triangle`: `2` flow(s)
- `hard_a`: `4` flow(s)
- `random_jump`: `3` flow(s)
- `sine`: `3` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260508/juce-random-fx-soak-20260508T163110Z.json`
