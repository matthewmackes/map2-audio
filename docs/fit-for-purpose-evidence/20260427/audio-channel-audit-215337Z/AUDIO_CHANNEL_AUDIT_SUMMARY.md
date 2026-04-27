# Audio Channel Performance + Latency Audit (2026-04-27T22:01:41.263005+00:00)

Evidence root: `docs/fit-for-purpose-evidence/20260427/audio-channel-audit-215337Z`

## Worklist Pattern Mirrored

- `T055`: UA-1000 analog loopback latency closure, now rerun with connected loopback signal using the newer IR-based path-c tool.
- `T689` / prior random-FX soak artifacts: fixed 10-effect pool, 48 kHz / 64-sample callback, flow rotation, strict `0` xrun and `0.35 ms` peak-jitter thresholds.

## Latency Results

| Path | Gate | Mean RTT ms | P95 RTT ms | Jitter ms | Trials ms |
|---|---|---:|---:|---:|---|
| `hotone-jogg-fl` | `FAIL` | 21.203 | 24.287 | 10.453 | 14.016, 20.904, 23.562, 24.469, 23.068 |
| `hotone-jogg-fr` | `FAIL` | 396.075 | 1154.397 | 1270.571 | 4.882, 12.527, 1275.453, 17.342, 670.171 |
| `ua1000-aux0-clean` | `FAIL` | 9.461 | 9.808 | 1.064 | 8.757, 9.820, 9.761, 9.216, 9.751 |
| `ua1000-aux0` | `FAIL` | 9.246 | 9.825 | 1.390 | 9.247, 9.206, 8.580, 9.970, 9.228 |
| `ua1000-aux1` | `FAIL` | 10.239 | 10.566 | 0.772 | 9.844, 9.801, 10.539, 10.440, 10.573 |
| `ua1000-aux2` | `FAIL` | 9.857 | 10.584 | 1.606 | 10.560, 9.886, 9.266, 10.591, 8.985 |
| `ua1000-aux3` | `FAIL` | 9.833 | 10.471 | 1.319 | 9.233, 9.309, 9.927, 10.553, 10.145 |
| `ua1000-aux4` | `FAIL` | 9.610 | 9.883 | 0.690 | 9.866, 9.868, 9.887, 9.197, 9.232 |
| `ua1000-aux5` | `FAIL` | 9.364 | 9.966 | 1.453 | 9.844, 9.865, 9.991, 8.583, 8.539 |
| `ua1000-aux6` | `FAIL` | 9.426 | 10.362 | 2.030 | 10.588, 8.558, 9.458, 9.249, 9.279 |
| `ua1000-aux7` | `FAIL` | 10.008 | 10.570 | 1.344 | 10.573, 9.859, 10.557, 9.821, 9.229 |

Latency rollup excluding the pre-clean AUX0 row:
- UA-1000 mean RTT range: `9.364` to `10.239` ms; max p95 RTT `10.584` ms; all gates pass: `False`.
- Hotone mean RTT range: `21.203` to `396.075` ms; max p95 RTT `1154.397` ms; all gates pass: `False`.

## Soak Results

| Run | Pass | Xruns | Peak jitter ms | Jitter p95 ms | Budget max % | Flow count |
|---|---:|---:|---:|---:|---:|---:|
| `juce-random-fx-live-20s-fixed-pool` | `False` | 56 | 6.225 | 0.264 | 45.890 | 3 |
| `juce-random-fx-live-20s-reuse-effects` | `False` | 76 | 9.441 | 0.264 | 47.911 | 3 |
| `juce-random-fx-safe-60s` | `False` | 255 | 17.468 | 0.264 | 80.638 | 5 |

Historical comparison anchors:
- `docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223553Z.json`: pass `False`, xruns `5`, peak jitter `3.934` ms, jitter p95 `0.003` ms, budget max `37.463%`.
- `docs/fit-for-purpose-evidence/20260402/juce-random-fx-soak-20260402T223622Z.json`: pass `False`, xruns `4`, peak jitter `23.403` ms, jitter p95 `0.004` ms, budget max `41.368%`.

## Conclusions

- Hardware signal is present on the tested loopbacks; the failures are latency/stability threshold failures, not missing-device or missing-signal failures.
- UA-1000 same-index AUX loopbacks are consistent around 9-10 ms RTT but exceed the 5 ms p95 gate and often exceed the 1 ms jitter gate.
- Hotone FL->mono is measurable but slow/variable; Hotone FR->mono is highly unstable, suggesting either only one side is physically patched to mono input or the right-side route is correlating against leakage/secondary peaks.
- Random-FX callback soaks still fail the historical no-gap bar through xrun accumulation and peak-jitter spikes, while average CPU/budget remains mostly normal. This preserves the earlier conclusion that the problem is not sustained DSP overload.
- `jack-client` was missing from the runtime Python environment before this audit; live IR measurement required installing `jack-client==0.5.5` locally. The backend runtime manifest/contract has been updated so fresh installs carry that dependency instead of relying on operator-installed pip state.
