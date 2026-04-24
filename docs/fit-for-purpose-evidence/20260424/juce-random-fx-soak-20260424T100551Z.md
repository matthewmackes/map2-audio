# JUCE Random FX Soak (2026-04-24T10:06:04+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.036s`
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
- Final xrun count: `4`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.33233632436025257`
- CPU total percent (min/max/mean): `{'min': 34.69851463840462, 'max': 41.363107122985284, 'mean': 36.97854458258836}`
- Callback jitter ms (min/max/mean): `{'min': 0.001647729504634084, 'max': 0.005103921366271927, 'mean': 0.0028450047210680364}`
- Callback jitter p95 ms: `0.004699068906957219`
- Peak callback jitter ms: `1.1791896666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.744844057301634, 'max': 41.42695123800177, 'mean': 37.02849863333973}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.186725, 'peak': 0.186725, 'mean': 0.15808239130434784}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 41}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `triangle`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T100551Z.json`
