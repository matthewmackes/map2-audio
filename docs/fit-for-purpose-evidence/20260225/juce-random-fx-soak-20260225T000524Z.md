# JUCE Random FX Soak (2026-02-25T00:08:25+00:00)

## Profile
- Duration target: `180s`
- Duration actual: `180.018s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `False`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback_after_load_failure`

## Overall
- Status: `FAIL`
- Flow transitions: `15`
- Final xrun count: `319`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 44.39337636634169, 'max': 70.48872377333228, 'mean': 52.81794618464902}`
- Callback jitter ms (min/max/mean): `{'min': 0.005681320728243121, 'max': 0.4818848154766302, 'mean': 0.029178334542849516}`
- Peak callback jitter ms: `21.967496666666666`
- Budget utilization percent (min/max/mean): `{'min': 44.44613942451794, 'max': 70.56227937396483, 'mean': 52.88049639201066}`

## Blend Type Usage
- `sine`: `3` flow(s)
- `random_jump`: `4` flow(s)
- `triangle`: `3` flow(s)
- `hard_b`: `2` flow(s)
- `step_ab`: `2` flow(s)
- `hard_a`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T000524Z.json`
