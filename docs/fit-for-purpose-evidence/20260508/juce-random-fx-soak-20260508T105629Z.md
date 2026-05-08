# JUCE Random FX Soak (2026-05-08T11:26:33+00:00)

## Profile
- Duration target: `1800s`
- Duration actual: `1800.028s`
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
- Flow transitions: `90`
- Final xrun count: `24617`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `FAIL`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `13.675898374914167`
- CPU total percent (min/max/mean): `{'min': 36.4619802039653, 'max': 112.70538451111884, 'mean': 41.32391490562256}`
- Callback jitter ms (min/max/mean): `{'min': 0.04510441536880378, 'max': 0.7383828823680272, 'mean': 0.08542547654825858}`
- Callback jitter p95 ms: `0.19649994510963478`
- Peak callback jitter ms: `44.75754766666666`
- Budget utilization percent (min/max/mean): `{'min': 36.508569856354725, 'max': 112.77274678700935, 'mean': 41.386963224091545}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.148555, 'peak': 0.261247, 'mean': 0.19706519877505566}`
- Topology mutation count: `90`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `hard_b`: `15` flow(s)
- `random_jump`: `17` flow(s)
- `sine`: `18` flow(s)
- `triangle`: `13` flow(s)
- `step_ab`: `16` flow(s)
- `hard_a`: `11` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260508/juce-random-fx-soak-20260508T105629Z.json`
