# JUCE Random FX Soak (2026-02-25T00:10:01+00:00)

## Profile
- Duration target: `90s`
- Duration actual: `90.023s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `runtime_discovered_fallback_after_load_failure`

## Overall
- Status: `FAIL`
- Flow transitions: `12`
- Final xrun count: `451`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `FAIL`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- CPU total percent (min/max/mean): `{'min': 43.94836476337694, 'max': 89.364906960984, 'mean': 63.635059594679205}`
- Callback jitter ms (min/max/mean): `{'min': 0.007964924048227557, 'max': 0.6703156659587076, 'mean': 0.044683980382555145}`
- Peak callback jitter ms: `100.75526966666666`
- Budget utilization percent (min/max/mean): `{'min': 43.99188382217669, 'max': 89.41216310550921, 'mean': 63.69070396171388}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `sine`: `2` flow(s)
- `hard_a`: `3` flow(s)
- `step_ab`: `3` flow(s)
- `hard_b`: `2` flow(s)
- `random_jump`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260225/juce-random-fx-soak-20260225T000831Z.json`
