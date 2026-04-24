# JUCE Random FX Soak (2026-04-24T01:28:12+00:00)

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
- Final xrun count: `5`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.41528239202657813`
- CPU total percent (min/max/mean): `{'min': 35.624012712185994, 'max': 51.36183801954988, 'mean': 37.507269021057354}`
- Callback jitter ms (min/max/mean): `{'min': 0.0019487036642825562, 'max': 0.004090089754878816, 'mean': 0.0029834944920513503}`
- Callback jitter p95 ms: `0.003939248068457608`
- Peak callback jitter ms: `0.9073646666666668`
- Budget utilization percent (min/max/mean): `{'min': 35.67001612623395, 'max': 51.44551723945913, 'mean': 37.55954711465882}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.16872399999999999, 'peak': 0.16872399999999999, 'mean': 0.13582408695652173}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `hard_a`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T012759Z.json`
