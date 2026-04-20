# JUCE Random FX Soak (2026-04-20T02:58:13+00:00)

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
- Final xrun count: `68`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `5.647840531561462`
- CPU total percent (min/max/mean): `{'min': 35.96163436662911, 'max': 43.231992387306654, 'mean': 38.74229857679106}`
- Callback jitter ms (min/max/mean): `{'min': 0.00189804757795948, 'max': 0.06973497278766239, 'mean': 0.01052045841821841}`
- Callback jitter p95 ms: `0.0426295109626094`
- Peak callback jitter ms: `9.962122666666666`
- Budget utilization percent (min/max/mean): `{'min': 36.01017355349081, 'max': 43.304701300135044, 'mean': 38.80564819589552}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.11233, 'peak': 0.15259499999999998, 'mean': 0.12346421739130435}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `random_jump`: `2` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T025800Z.json`
