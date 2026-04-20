# JUCE Random FX Soak (2026-04-20T02:27:44+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.04s`
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
- Final xrun count: `18`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.495016611295681`
- CPU total percent (min/max/mean): `{'min': 34.89045668057762, 'max': 41.72698274829857, 'mean': 36.97011347505092}`
- Callback jitter ms (min/max/mean): `{'min': 0.0008811723098071335, 'max': 0.056708793421433354, 'mean': 0.0058576165617464405}`
- Callback jitter p95 ms: `0.01592865579159602`
- Peak callback jitter ms: `13.560966666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.943976417883476, 'max': 41.88835215693573, 'mean': 37.02909045443392}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.14912999999999998, 'peak': 0.184142, 'mean': 0.14689365217391304}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 41}`

## Blend Type Usage
- `hard_b`: `2` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T022731Z.json`
