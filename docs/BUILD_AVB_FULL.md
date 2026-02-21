# Full Build Checklist (Plan 3 AVB)

Date: 2026-02-20
Execution source of truth: `docs/AVB_MASTER_WORK_PLAN.md`

## Prereqs (one-time)
- OS packages: `cmake ninja-build clang pkg-config libasio-dev libcap-dev libavtp-dev libssl-dev python3-dev nodejs npm`
- JUCE deps: system toolchain plus JUCE submodule already in `juce-engine/`.

## Configure & Build JUCE Engine
```bash
cmake -S juce-engine -B juce-engine/build -GNinja -DCMAKE_BUILD_TYPE=Release -DUSE_AVB=ON
cmake --build juce-engine/build --target map2_audio_engine -j$(nproc)
# optional C++ AVB unit tests (requires libavtp/libcap): add `-DBUILD_AVB_TESTS=ON` then run `ctest --test-dir juce-engine/build -R avb_tests`
# convenience: `cmake --build juce-engine/build --target check-avb` (runs `ctest -R avb_tests`)
```

## Backend Setup
```bash
pip3 install -e .[dev]
pytest -q
```

AVB-focused backend sweep:
```bash
pytest tests/test_avb_service_engine_contract.py \
       tests/test_avb_service_stats.py \
       tests/test_avb_stream_validation.py \
       tests/test_avb_routes_srp.py \
       tests/test_avb_router_map2.py \
       tests/test_avb_router_factory.py -q
```

## Frontend Setup
```bash
cd web
npm ci
npm run test:avb-routing
# optional full suite: npm test
```

## Hardware-Dependent Suites (run when TSN/PTP NIC available)
```bash
pytest -m avb tests/test_avb_integration.py tests/test_avb_rt_safety.py -q
```

## Artifacts
- Engine binary: `juce-engine/build/map2_audio_engine`
- Qualification snapshot: `docs/AVB_PLAN3_QUALIFICATION_2026-02-20.md`

## Notes
- Ensure `MAP2_AVB_ENABLED=true` and `MAP2_AVB_INTERFACE=<tsn nic>` before running AVB suites.
- For release packaging: `cmake --build juce-engine/build --target install`.
