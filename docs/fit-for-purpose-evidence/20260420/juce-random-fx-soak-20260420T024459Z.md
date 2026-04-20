# JUCE Random FX Soak (2026-04-20T02:45:12+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.035s`
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
- Final xrun count: `22`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.8280016618196926`
- CPU total percent (min/max/mean): `{'min': 35.489094028205784, 'max': 40.58161104211551, 'mean': 37.07080532384414}`
- Callback jitter ms (min/max/mean): `{'min': 0.0009514065469900547, 'max': 0.06286147498015915, 'mean': 0.0055810468338399815}`
- Callback jitter p95 ms: `0.006185856596584085`
- Peak callback jitter ms: `5.399917666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.53526970279647, 'max': 40.641558309024084, 'mean': 37.122773525271874}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.155136, 'peak': 0.155136, 'mean': 0.14593021739130435}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `triangle`: `1` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T024459Z.json`
