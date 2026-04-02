# JUCE Random FX Soak (2026-04-02T22:33:46+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.013s`
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
- Final xrun count: `64`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `3.197921351121771`
- CPU total percent (min/max/mean): `{'min': 34.36280873010426, 'max': 41.19560481936481, 'mean': 36.28071040537899}`
- Callback jitter ms (min/max/mean): `{'min': 0.001195106022011612, 'max': 0.0947008323013517, 'mean': 0.007973331803328024}`
- Callback jitter p95 ms: `0.04908404889958605`
- Peak callback jitter ms: `26.583447666666668`
- Budget utilization percent (min/max/mean): `{'min': 34.410898493954704, 'max': 41.24740672059503, 'mean': 36.33405293074607}`

## Blend Type Usage
- `hard_a`: `1` flow(s)
- `step_ab`: `1` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223323Z.json`
