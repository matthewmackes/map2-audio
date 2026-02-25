# JUCE Random FX Soak (2026-02-25T00:13:55+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.047s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `4.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback_after_load_failure`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `42`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 46.05705597885598, 'max': 67.92452059280969, 'mean': 53.911759521878345}`
- Callback jitter ms (min/max/mean): `{'min': 0.010250499844816642, 'max': 0.29865755477022105, 'mean': 0.04305479342657708}`
- Peak callback jitter ms: `16.01611966666667`
- Budget utilization percent (min/max/mean): `{'min': 46.09730093733868, 'max': 67.98703030317944, 'mean': 53.97359256660927}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `random_jump`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T001342Z.json`
