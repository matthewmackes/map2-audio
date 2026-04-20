# JUCE Random FX Soak (2026-04-20T02:22:30+00:00)

## Profile
- Duration target: `12s`
- Duration actual: `12.041s`
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
- Final xrun count: `36`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `2.9897849015862468`
- CPU total percent (min/max/mean): `{'min': 35.269877583927446, 'max': 47.413879993699965, 'mean': 38.88720236329558}`
- Callback jitter ms (min/max/mean): `{'min': 0.0017639275101272512, 'max': 0.05743282085013885, 'mean': 0.006391407844206769}`
- Callback jitter p95 ms: `0.008308897073472985`
- Peak callback jitter ms: `4.023772666666667`
- Budget utilization percent (min/max/mean): `{'min': 35.318206046988884, 'max': 47.487641732968704, 'mean': 38.942772761229264}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.125154, 'peak': 0.152435, 'mean': 0.12855673913043478}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 1, 'added': 37}`

## Blend Type Usage
- `triangle`: `1` flow(s)
- `hard_a`: `1` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `/home/mm/map2-audio/docs/fit-for-purpose-evidence/20260420/juce-random-fx-soak-20260420T022217Z.json`
