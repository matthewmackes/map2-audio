# JUCE Random FX Soak (2026-04-02T21:54:18+00:00)

## Profile
- Duration target: `60s`
- Duration actual: `60.013s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `12.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Runtime pool source: `requested_not_in_runtime_inventory`

## Overall
- Status: `FAIL`
- Flow transitions: `5`
- Final xrun count: `26`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `0.4332394647826304`
- CPU total percent (min/max/mean): `{'min': 34.01625437989063, 'max': 38.73907253692125, 'mean': 35.9515275006947}`
- Callback jitter ms (min/max/mean): `{'min': 0.0005524420092934092, 'max': 0.03887567368882667, 'mean': 0.0024607815307398965}`
- Callback jitter p95 ms: `0.004455483902642987`
- Peak callback jitter ms: `12.585102666666666`
- Budget utilization percent (min/max/mean): `{'min': 34.05752743469111, 'max': 38.79896913397951, 'mean': 35.99657043852888}`

## Blend Type Usage
- `triangle`: `2` flow(s)
- `hard_a`: `2` flow(s)
- `hard_b`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T215317Z.json`
