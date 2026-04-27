# JUCE Random FX Soak (2026-04-27T21:59:09+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.043s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `FAIL`
- Flow transitions: `5`
- Final xrun count: `255`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `FAIL`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `4.246956347950635`
- CPU total percent (min/max/mean): `{'min': 34.2266357150122, 'max': 80.59322297900243, 'mean': 37.93375357582928}`
- Callback jitter ms (min/max/mean): `{'min': 0.17321874493812803, 'max': 0.524120728412019, 'mean': 0.2042448963473453}`
- Callback jitter p95 ms: `0.26377839489582006`
- Peak callback jitter ms: `17.46752366666667`
- Budget utilization percent (min/max/mean): `{'min': 34.259491114307174, 'max': 80.63765566781596, 'mean': 37.983323895891445}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.12135599999999999, 'peak': 0.16297999999999999, 'mean': 0.140044512605042}`
- Topology mutation count: `5`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `hard_b`: `2` flow(s)
- `triangle`: `1` flow(s)
- `sine`: `1` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260427/audio-channel-audit-215337Z/soak/juce-random-fx-safe-60s.json`
