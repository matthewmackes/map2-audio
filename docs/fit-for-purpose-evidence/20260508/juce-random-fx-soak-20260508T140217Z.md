# JUCE Random FX Soak (2026-05-08T14:07:21+00:00)

## Profile
- Duration target: `300s`
- Duration actual: `300.052s`
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
- Final xrun count: `233`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.776532067774919`
- CPU total percent (min/max/mean): `{'min': 35.51351860956688, 'max': 48.109768313010655, 'mean': 39.425202333987215}`
- Callback jitter ms (min/max/mean): `{'min': 0.04986219553219723, 'max': 0.11476925060783338, 'mean': 0.05645828125013424}`
- Callback jitter p95 ms: `0.06091508591354656`
- Peak callback jitter ms: `2.8401396666666665`
- Budget utilization percent (min/max/mean): `{'min': 35.558016394753366, 'max': 48.1665700450833, 'mean': 39.47737659949737}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.169349, 'peak': 0.227051, 'mean': 0.15368866555183947}`
- Topology mutation count: `15`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `step_ab`: `3` flow(s)
- `hard_b`: `3` flow(s)
- `sine`: `2` flow(s)
- `triangle`: `2` flow(s)
- `random_jump`: `4` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260508/juce-random-fx-soak-20260508T140217Z.json`
