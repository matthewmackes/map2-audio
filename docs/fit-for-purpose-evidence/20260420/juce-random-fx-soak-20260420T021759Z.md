# JUCE Random FX Soak (2026-04-20T02:18:12+00:00)

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
- Final xrun count: `7`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.5812987875768145`
- CPU total percent (min/max/mean): `{'min': 34.431545828093995, 'max': 43.577274240497225, 'mean': 36.962554671008895}`
- Callback jitter ms (min/max/mean): `{'min': 0.0010275204990187808, 'max': 0.07421175895436102, 'mean': 0.005224427916409625}`
- Callback jitter p95 ms: `0.005877479573639488`
- Peak callback jitter ms: `7.704811666666667`
- Budget utilization percent (min/max/mean): `{'min': 34.48309493682164, 'max': 43.65199126414151, 'mean': 37.01763884776734}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.117614, 'peak': 0.170369, 'mean': 0.13395508695652172}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T021759Z.json`
