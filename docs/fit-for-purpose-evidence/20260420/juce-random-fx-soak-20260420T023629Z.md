# JUCE Random FX Soak (2026-04-20T02:36:41+00:00)

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
- Final xrun count: `16`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.3287932895938874`
- CPU total percent (min/max/mean): `{'min': 35.07932168647429, 'max': 40.380013710162935, 'mean': 36.48947297994611}`
- Callback jitter ms (min/max/mean): `{'min': 0.001790140176378606, 'max': 0.008349845824309915, 'mean': 0.00294095758955389}`
- Callback jitter p95 ms: `0.004707217087067353`
- Peak callback jitter ms: `3.540910666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.12741777734075, 'max': 40.43731179105022, 'mean': 36.5425323099168}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.126996, 'peak': 0.14579899999999998, 'mean': 0.12931621739130433}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `hard_b`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T023629Z.json`
