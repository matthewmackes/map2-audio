# JUCE Random FX Soak (2026-04-27T21:59:55+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.092s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `76`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `3.7826000398168427`
- CPU total percent (min/max/mean): `{'min': 34.891568958245195, 'max': 47.857711528668425, 'mean': 37.41466440346916}`
- Callback jitter ms (min/max/mean): `{'min': 0.1743801254780716, 'max': 0.3246626730901654, 'mean': 0.20709668750787935}`
- Callback jitter p95 ms: `0.26364847957405196`
- Peak callback jitter ms: `9.440799666666665`
- Budget utilization percent (min/max/mean): `{'min': 34.9312067644553, 'max': 47.91095798866498, 'mean': 37.46234229739431}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.150121, 'peak': 0.18293199999999998, 'mean': 0.1498150769230769}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 21, 'added': 37}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260427/audio-channel-audit-215337Z/soak/juce-random-fx-live-20s-reuse-effects.json`
