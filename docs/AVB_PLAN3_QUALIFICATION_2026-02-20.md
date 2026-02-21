# AVB Plan 3 Qualification – 2026-02-20

## Scope
Software-only qualification snapshot for Plan 3 AVB path (JUCE engine + Python backend). Hardware-in-the-loop tests remain pending.

## Test Matrix (Executed)
- Python: `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py tests/test_avb_router_map2.py tests/test_avb_router_factory.py -q` → 94 passed
- Python: `pytest tests/test_avb_stream_validation.py tests/test_avb_service_stats.py tests/test_avb_service_engine_contract.py tests/test_avb_router_map2.py -q` → 52 passed
- Frontend: `npm run test:avb-routing` → 18 suites, 224 tests passed (from prior run; unchanged since last frontend edits)
- Hardware-targeted AVB suites: `pytest -m avb tests/test_avb_integration.py tests/test_avb_rt_safety.py -q` → skipped (no AVB hardware present)

## C++ AVB Harness
- Catch2 opt-in harness built with `BUILD_AVB_TESTS=ON`, executed via `ctest --test-dir juce-engine/build -R avb_tests`
- Current coverage: `AvbStreamStats` snapshot/reset, latency min/max reset, and counter accumulation semantics

## Notable Coverage Additions (Today)
- Per-stream failover controls validation (`failover_policy`, `failover_interfaces`) and diagnostics reflection.
- AVB status compatibility matrix endpoint (`/api/avb/config/compatibility`) with profiles (default, strict_srp, avdecc_enabled, strict_srp_avdecc).
- Lifecycle stress tests:
  - Rapid create/start/stop/delete churn across mixed talker/listener streams.
  - Start failure recovery path resets error state on retry.
  - Mixed-direction churn with stats reset verification.
- Router rollback robustness:
  - SRP release unsuccessful payloads (rollback/reject) surface warnings.
  - Multi-connection connect/disconnect ensures state cleanup.
  - Strict SRP admission flows now cover:
    - Allowed-with-reservation happy path (response includes admission)
    - Allowed-without-reservation fails closed
    - Connect exceptions trigger SRP rollback release
    - SRP bypass accepted when not required
    - SRP admission exceptions surface 500 and block connect
  - SRP admissions API: filters, limit clamp, and offset pagination validated
- C++ Harness (Catch2, opt-in via `BUILD_AVB_TESTS=ON`):
  - `juce-engine/tests/AvbStreamManagerTests.cpp` (stats snapshot/reset, latency min/max reset)
  - Built and executed: `ctest --test-dir juce-engine/build -R avb_tests`

## Gaps / Next Actions
- Add C++ harness for `AvbStreamManager` state transitions and AVTP timestamp/sequence accounting.
- Run hardware AVB suites when NIC/PTP available: `pytest -m avb tests/test_avb_integration.py tests/test_avb_rt_safety.py` (currently skipped).
- Capture packet-level fidelity with AVTP pcap and compare timestamps against PTP grandmaster (<1 µs target).
- Generate performance soak (8 streams, 24h) once hardware available; record CPU/xrun/latency.

## Exit Criteria Snapshot
- Software regression coverage: ✅ (Python + frontend)
- Hardware validation: ⏳ (blocked on lab availability)
- Real-time perf targets: ⏳ (pending soak + AVTP pcap review)
