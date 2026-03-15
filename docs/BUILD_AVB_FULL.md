# Full Build Checklist (Plan 3 AVB)

Date: 2026-02-20
Execution source of truth: `docs/PROJECT_WORKLIST.md`

## Prereqs (one-time)
- OS packages: `cmake ninja-build clang pkg-config libasio-dev libcap-dev libavtp-dev libssl-dev python3-dev nodejs npm`
- JUCE deps: system toolchain plus JUCE submodule already in `juce-engine/`.

## Configure & Build JUCE Engine
```bash
cmake -S juce-engine -B juce-engine/build -GNinja -DCMAKE_BUILD_TYPE=Release -DUSE_AVB=ON
cmake --build juce-engine/build --target map2_audio_engine -j$(nproc)
# optional C++ AVB unit tests (requires libavtp/libcap): add `-DBUILD_AVB_TESTS=ON`
# AVTP suite: `cmake --build juce-engine/build --target avb_tests`
# AVDECC model suite (when `-DUSE_AVDECC=ON`): `cmake --build juce-engine/build --target avdecc_model_tests`
#   includes descriptor model round-trip and enumerator request/response lifecycle regression tests
# run all configured AVB C++ suites: `cmake --build juce-engine/build --target check-avb`
# AVTP stress + fault-injection subset:
#   juce-engine/build/avb_tests "[avb][avtp][stress]" -r compact
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

# AVDECC mock harness (CI-safe, no AVB hardware required)
pytest tests/test_avdecc_mock_integration.py -m avdecc_mock -q

# AVDECC AEM cache lifecycle regression
pytest tests/test_avdecc_aem_cache.py -q
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
