# AVB Qualification Matrix

Last updated: 2026-02-22 21:13 - Codex
Scope: AVB/AVDECC release-readiness gates for MAP2 with software and hardware evidence.

## Status Legend

- `PASS`: criteria met with current evidence
- `FAIL`: criteria not met
- `PENDING`: not yet executed in current cycle
- `BLOCKED`: cannot run due environment/lab constraints

## Matrix

| ID | Domain | Scenario | Procedure | Pass Criteria | Latest Outcome | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Q01 | Web UI | AVB routing regressions | `npm run test:avb-routing` | All suites pass with zero failed tests | 19 suites, 233 tests passed (2026-02-21) | PASS |
| Q02 | Backend | AVB service/router/SRP contracts | `pytest tests/test_avb_service_engine_contract.py tests/test_avb_router_map2.py tests/test_avb_routes_srp.py -q` | Zero failed tests | 95 passed in 0.83s (2026-02-21) | PASS |
| Q03 | JUCE C++ | AVB + AVDECC model harness | `cmake --build juce-engine/build --target check-avb -j4` | `avb_tests` and `avdecc_model_tests` both pass | Both suites passed, including AVTP init/teardown hardening coverage (2026-02-21) | PASS |
| Q04 | Hardware (HIL) | Multi-node discovery and route churn | `pytest -m avb tests/test_avb_integration.py -q` on AVB-capable lab network | Discovery completes <=10s and route churn succeeds >=99% with no orphaned routes | Blocked: AVB status reports enabled=false available=false; see /tmp/map2-avb-hil-continue-20260222-2144/q04_pytest.log | BLOCKED |
| Q05 | Hardware (HIL) | PTP lock and transport timing | `scripts/avb_capture_clock_drift.sh <iface> <duration_seconds> <output_dir>` during active traffic | 100% active streams report PTP lock; max timestamp skew within release target | Blocked: AVB status reports enabled=false available=false; see /tmp/map2-avb-hil-continue-20260222-2144/q05_capture.log | BLOCKED |
| Q06 | Hardware (HIL) | 24h endurance soak (8 streams) | Run `scripts/run_avb_24h_soak.sh` (or execute `docs/AVB_24H_SOAK_TEMPLATE.md`) and archive artifacts | No unrecovered stream failures; no sustained transport degradation; no orphaned SRP state | Deferred in this run; see /tmp/map2-avb-hil-continue-20260222-2144/q06_soak.log | PENDING |
| Q07 | Failure Handling | Rollback and SRP release behavior under faults | Included in Q02 (`test_avb_routes_srp.py`) | Failure paths clean up reservations and surface explicit errors/warnings | Covered in Q02 (2026-02-21) | PASS |
| Q08 | Rollout/Backout | Feature-flag and rollback playbook validation | `pytest tests/test_avb_routes_srp.py -k "rollback or release_warning or exception_releases" -q` + runbook checks in `docs/AVB_ROLLOUT_BACKOUT_RUNBOOK.md` | Rollback-focused tests pass and runbook no-orphan checks return zero active streams/connections/unreleased reservations | 7 passed, 44 deselected (2026-02-21) | PASS |
| Q09 | Installer Automation | AVB default/skip/uninstall/interface branch controls | `pytest tests/test_avb_ops_scripts.py -q` | Dry-run installer branch checks pass for default, `--skip-avb`, `--uninstall-avb`, and `--avb-interface` flows | 8 passed (2026-02-21) | PASS |

## Reproducible Command Set

```bash
# Web regression
npm run test:avb-routing

# Backend AVB contracts
pytest tests/test_avb_service_engine_contract.py tests/test_avb_router_map2.py tests/test_avb_routes_srp.py -q

# JUCE AVB harness
cmake --build juce-engine/build --target check-avb -j4

# PTP drift + AVTP capture evidence (hardware required)
./scripts/avb_capture_clock_drift.sh enp2s0 600 /tmp/map2-avb-evidence

# 24h soak runner (hardware required)
./scripts/run_avb_24h_soak.sh --duration-hours 24 --checkpoint-minutes 60 --output-dir /tmp/map2-avb-soak

# Optional: run Q04/Q05/Q06 gate commands in one wrapper
./scripts/run_avb_hil_qualification.sh --interface enp2s0 --capture-seconds 600 --run-q06-soak --soak-hours 24

# Generates:
# - /tmp/.../summary.txt
# - /tmp/.../matrix_update.md (copy/paste-ready Q04-Q06 row update snippet)
# - BLOCKED gate reasons in summary when lab prerequisites are missing

# Apply summary output directly into this matrix (Q04/Q05/Q06 latest outcome + status)
./scripts/apply_avb_hil_matrix_update.sh /tmp/.../summary.txt docs/AVB_QUALIFICATION_MATRIX.md

# Rollback/backout focused route safeguards
pytest tests/test_avb_routes_srp.py -k "rollback or release_warning or exception_releases" -q

# Installer AVB branch controls (dry-run)
pytest tests/test_avb_ops_scripts.py -q
```

## Remaining Hardware Inputs Needed

1. AVB-capable multi-node lab network for `pytest -m avb` scenarios.
2. PTP grandmaster/clock telemetry capture during live stream traffic (`scripts/avb_capture_clock_drift.sh`).
3. 24-hour soak capture window with stream, SRP, and transport diagnostics archived (`scripts/run_avb_24h_soak.sh` or `docs/AVB_24H_SOAK_TEMPLATE.md`).

## Runbooks

- Rollout/backout operations: `docs/AVB_ROLLOUT_BACKOUT_RUNBOOK.md`
