# JUCE Random FX Soak (2026-05-08T14:01:16+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.1s`
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
- Flow transitions: `3`
- Final xrun count: `70`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.1647254575707155`
- CPU total percent (min/max/mean): `{'min': 35.11399614354975, 'max': 47.551581518409606, 'mean': 39.01645057597797}`
- Callback jitter ms (min/max/mean): `{'min': 0.047996353575187195, 'max': 0.12216541593095305, 'mean': 0.05661759728431001}`
- Callback jitter p95 ms: `0.05861048031746449`
- Peak callback jitter ms: `1.4587586666666665`
- Budget utilization percent (min/max/mean): `{'min': 35.166497932535066, 'max': 47.620673920713934, 'mean': 39.0729762160262}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.11975999999999999, 'peak': 0.151831, 'mean': 0.1328284406779661}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260508/juce-random-fx-soak-20260508T140015Z.json`
