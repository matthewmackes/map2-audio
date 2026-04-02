# JUCE Random FX Soak (2026-04-02T22:27:41+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.012s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `15`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.7495502698380971`
- CPU total percent (min/max/mean): `{'min': 34.31174963680253, 'max': 39.42399629464599, 'mean': 35.82675158789563}`
- Callback jitter ms (min/max/mean): `{'min': 0.0007943759880472492, 'max': 0.006969663205090639, 'mean': 0.0019129598926411302}`
- Callback jitter p95 ms: `0.0032859221350868316`
- Peak callback jitter ms: `23.436454666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.36057721542578, 'max': 39.483312392251484, 'mean': 35.87763716933917}`

## Blend Type Usage
- `hard_a`: `2` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T222719Z.json`
