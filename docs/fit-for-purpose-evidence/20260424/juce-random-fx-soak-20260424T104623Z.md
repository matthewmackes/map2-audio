# JUCE Random FX Soak (2026-04-24T10:46:36+00:00)

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
- Final xrun count: `24`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `1.9941836310760281`
- CPU total percent (min/max/mean): `{'min': 35.40528803237399, 'max': 67.00799160014579, 'mean': 38.229345725986455}`
- Callback jitter ms (min/max/mean): `{'min': 0.0013167627561665874, 'max': 0.11838293612833707, 'mean': 0.007697453004959036}`
- Callback jitter p95 ms: `0.006402694399796244`
- Peak callback jitter ms: `4.744150666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.450291910525, 'max': 67.07491448263721, 'mean': 38.28001127281715}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.15764999999999998, 'peak': 0.15764999999999998, 'mean': 0.13250686956521737}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `sine`: `2` flow(s)
- `step_ab`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260424/juce-random-fx-soak-20260424T104623Z.json`
