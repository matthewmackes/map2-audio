# JUCE Random FX Soak (2026-04-20T02:40:55+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.038s`
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
- Final xrun count: `5`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.41535138727363347`
- CPU total percent (min/max/mean): `{'min': 34.54741512623436, 'max': 38.35189837303883, 'mean': 36.23752470083894}`
- Callback jitter ms (min/max/mean): `{'min': 0.001301352363288932, 'max': 0.004283691431863868, 'mean': 0.002176865992621598}`
- Callback jitter p95 ms: `0.003960239749683794`
- Peak callback jitter ms: `9.512995666666665`
- Budget utilization percent (min/max/mean): `{'min': 34.59411152425233, 'max': 38.417238035461985, 'mean': 36.28741986773808}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.129586, 'peak': 0.144759, 'mean': 0.13485952173913043}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `hard_b`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T024042Z.json`
