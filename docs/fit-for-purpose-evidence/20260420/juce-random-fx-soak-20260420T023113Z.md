# JUCE Random FX Soak (2026-04-20T02:31:26+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.034s`
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
- Final xrun count: `80`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `6.647831145088914`
- CPU total percent (min/max/mean): `{'min': 35.35642260643011, 'max': 55.06432683633737, 'mean': 40.296296845710906}`
- Callback jitter ms (min/max/mean): `{'min': 0.002002405160187616, 'max': 0.14145600217762974, 'mean': 0.028646673852545466}`
- Callback jitter p95 ms: `0.1336588179841108`
- Peak callback jitter ms: `8.643947666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.40509497362253, 'max': 55.11570445478091, 'mean': 40.351974026581125}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.14087, 'peak': 0.15570699999999998, 'mean': 0.13599360869565216}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 41}`

## Blend Type Usage
- `sine`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T023113Z.json`
