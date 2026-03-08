# T063-subC Lab Qualification Summary (2026-03-08)

## Scope
- Standard defaults validation for features 1/3/5/7 under two workload profiles:
  - Steady-state live load (effect residency enabled)
  - Edit-churn (flow rewires with load/unload churn)
- 10 active effects, rotating serial/parallel topologies and blend strategies.
- Native JUCE URI pool used (`effect_pool_source=requested_not_in_runtime_inventory`, `runtime_effect_pool_size=20`).

## Evidence Artifacts
- `docs/fit-for-purpose-evidence/20260308/t063/t063-subC-steady-state.json`
- `docs/fit-for-purpose-evidence/20260308/t063/t063-subC-steady-state.md`
- `docs/fit-for-purpose-evidence/20260308/t063/t063-subC-edit-churn.json`
- `docs/fit-for-purpose-evidence/20260308/t063/t063-subC-edit-churn.md`

## Threshold Matrix
| Gate | Steady-state | Edit-churn |
| --- | --- | --- |
| `xruns_ok` | FAIL | FAIL |
| `jitter_ok` | FAIL | FAIL |
| `budget_ok` | PASS | PASS |
| `flow_errors_ok` | PASS | PASS |
| `effect_count_ok` | PASS | PASS |

## Key Metrics
| Metric | Steady-state | Edit-churn |
| --- | --- | --- |
| Duration (s) | 180.019 | 180.110 |
| Flow transitions | 15 | 23 |
| Sample count | 359 | 359 |
| Final xruns | 175 | 232 |
| Peak callback jitter (ms) | 27.281 | 37.876 |
| CPU total mean (%) | 36.478 | 37.140 |
| CPU total max (%) | 41.644 | 68.004 |
| Budget utilization mean (%) | 36.526 | 37.194 |
| Budget utilization max (%) | 41.718 | 68.068 |

## Delta vs Baseline
Reference baseline: `T058` full 10000-loop run (`96894 xruns / 30000.107s ~= 3.23 xruns/s`).

- Steady-state: `175 / 180.019s ~= 0.97 xruns/s`
- Edit-churn: `232 / 180.110s ~= 1.29 xruns/s`

Result: xrun rate improved versus baseline, but release gates remain red due strict xrun/jitter thresholds.
