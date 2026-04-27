# JUCE Random FX Soak (2026-04-27T21:59:32+00:00)

## Profile
- Duration target: `20s`
- Duration actual: `20.1s`
- Sample rate: `48000 Hz`
- Buffer size: `64`
- Flow rotation: `8.0s`
- Blend step: `0.25s`
- Live rewire: `True`
- Effects active per flow: `10`
- Preloaded effect pool: `False`
- Preloaded instances: `0`
- Runtime pool source: `explicit_requested`

## Overall
- Status: `FAIL`
- Flow transitions: `3`
- Final xrun count: `56`
- Total flow errors: `0`

## Threshold Checks
- Xruns <= 0: `FAIL`
- Peak callback jitter <= 0.35 ms: `FAIL`
- Peak budget utilization <= 80.0%: `PASS`
- Flow apply errors <= 0: `PASS`
- Effect count always 10: `PASS`

## Key Metrics
- Xruns per second: `2.7860696517412933`
- CPU total percent (min/max/mean): `{'min': 35.56044462601095, 'max': 45.83976942775762, 'mean': 37.32554963292351}`
- Callback jitter ms (min/max/mean): `{'min': 0.17338537865330572, 'max': 0.3049708154235846, 'mean': 0.2090435498966616}`
- Callback jitter p95 ms: `0.26421900775161294`
- Peak callback jitter ms: `6.225323666666666`
- Budget utilization percent (min/max/mean): `{'min': 35.601732565840145, 'max': 45.89032319285129, 'mean': 37.37172356071566}`
- Topology mutation duration ms (last/peak/mean): `{'last': 0.116731, 'peak': 0.18148599999999998, 'mean': 0.13783984615384615}`
- Topology mutation count: `3`
- Topology no-op skips: `0`
- Topology connection counts (removed/added): `{'removed': 0, 'added': 37}`

## Blend Type Usage
- `step_ab`: `2` flow(s)
- `sine`: `1` flow(s)

## Artifacts
- JSON: `docs/fit-for-purpose-evidence/20260427/audio-channel-audit-215337Z/soak/juce-random-fx-live-20s-fixed-pool.json`
