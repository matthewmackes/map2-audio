# JUCE Random FX Soak (2026-04-02T22:36:16+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.012s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `explicit_requested`

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
- Xruns per second: `0.2498500899460324`
- CPU total percent (min/max/mean): `{'min': 34.37709226153225, 'max': 37.412531170687025, 'mean': 35.45859797812813}`
- Callback jitter ms (min/max/mean): `{'min': 0.0008437753423229016, 'max': 0.003271761490603808, 'mean': 0.0018964681433221553}`
- Callback jitter p95 ms: `0.003073618126371515`
- Peak callback jitter ms: `3.9337116666666665`
- Budget utilization percent (min/max/mean): `{'min': 34.42357987631002, 'max': 37.46318238467268, 'mean': 35.5044542866297}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223553Z.json`
