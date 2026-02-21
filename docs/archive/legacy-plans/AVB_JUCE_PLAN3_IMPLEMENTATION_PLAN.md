# AVB-JUCE Plan 3 Implementation Plan

Date: 2026-02-19
Owner: MAP2 platform team (C++ engine + Python backend + AVB ops)

## 1. Purpose
Implement Plan 3 (custom JUCE AVB backend) as a production-grade, low-latency, fully configurable AVB path where AVB interfaces are first-class JUCE input and output devices.

This plan is written so another AI (or engineer) can continue execution phase-by-phase without re-discovery.

## 2. Scope and Targets
In scope:
- Complete AVB stream lifecycle in C++ engine (create/start/stop/delete/stats/reset).
- Expose lifecycle and telemetry through Python bindings and existing FastAPI routes.
- Make AVB endpoints discoverable/selectable in JUCE device management with deterministic behavior.
- Integrate existing platform features: SRP admission/release, PTP monitor, TSN qdisc, mDNS discovery, AVDECC entity model, router/matrix APIs, cluster metadata.
- Meet real-time safety and production observability requirements.

Out of scope:
- Non-AVB OS backends as primary path (this is Plan 3, not virtual soundcard bridge).
- Replacing the existing web routing UI architecture.

Performance targets:
- End-to-end AVB Class A path remains within AVB budget with stable playout and no sustained xruns under nominal load.
- Local engine callback path has zero heap allocations and zero locks in real-time callbacks.
- Stream setup latency (API create/start to first stable frames) under 1s at 48kHz/256.
- 8 concurrent streams stable for 24h soak with no crash, deadlock, or unbounded drift.

## 3. Current Baseline (What Already Exists)
Existing assets to reuse, not rewrite:
- C++ AVB transport primitives:
  - `juce-engine/Source/AvbStream.h`
  - `juce-engine/Source/AvbStream.cpp`
  - `juce-engine/Source/AvbAudioIODeviceType.h`
  - `juce-engine/Source/AvbAudioIODeviceType.cpp`
  - `juce-engine/Source/AvbAudioIODevice.h`
  - `juce-engine/Source/AvbAudioIODevice.cpp`
- JUCE registration hook:
  - `juce-engine/Source/JuceAudioIO.cpp` registers `AvbAudioIODeviceType` under `HAS_AVB`.
- Build flag and deps:
  - `juce-engine/CMakeLists.txt` (`USE_AVB`, `HAS_AVB`, libavtp, libcap).
- Platform AVB control plane:
  - `app/services/avb/avb_service.py`
  - `app/services/avb/avb_router.py`
  - `app/routes/avb.py`
  - `app/services/avb/srp_admission.py`
  - `app/services/avb/avb_discovery.py`
  - `app/services/avb/ptp_monitor.py`
  - `app/services/avb/tsn_qdisc.py`
- Config schema:
  - `app/config.py` (`avb.*`, `avb.srp.*`).
- Existing tests:
  - `tests/test_avb_service_engine_contract.py`
  - `tests/test_avb_service_stats.py`
  - `tests/test_avb_stream_validation.py`
  - `tests/test_avb_routes_srp.py`
  - `tests/test_avb_integration.py`
  - `tests/test_avb_rt_safety.py`

Baseline gaps to close:
- Python bindings expose AVB mostly as module-level placeholders, while backend expects engine instance lifecycle methods.
- `AvbAudioIODeviceType` uses env vars directly and has placeholder mDNS discovery behavior.
- `AvbStream` has partial libavtp placeholder behavior and incomplete sequence/timestamp validation.
- No persistent engine-side AVB stream registry that backend can control by stream ID.

## 4. Target Architecture
Data plane (real-time):
1. `AvbStreamManager` (new) owns active `AvbAudioIODevice` and/or `AvbStream` objects keyed by stream ID.
2. `AvbAudioIODevice` runs callback/network threads with lock-free ring buffers only.
3. `AvbStream` performs AVTP packetization/depacketization with strict timestamp and sequence handling.
4. Clock source uses PTP aligned time (CLOCK_TAI or equivalent) for transmit timestamps and receive alignment.

Control plane:
1. FastAPI calls `AvbService`.
2. `AvbService` calls concrete engine methods via pybind on the engine instance.
3. Engine stream manager performs lifecycle ops and returns structured status/stats.
4. Router/SRP/AVDECC remains authoritative for admission, topology, and route orchestration.

Config plane:
1. `app/config.py` is source of truth.
2. `AvbAudioIODeviceType` and stream manager receive resolved config through explicit engine API, not direct ad-hoc env reads.
3. Environment variables remain override inputs but should resolve through config service before runtime device creation.

## 5. Multi-Phase Plan

### Phase 0 - Contract Freeze and Instrumented Baseline
Status: in_progress (engine + pybind lifecycle scaffolding landed on 2026-02-19)

Objectives:
- Freeze cross-layer API contracts before implementation churn.
- Capture baseline metrics for regression comparison.

Work:
1. Define engine lifecycle API contract in `docs/` and implement no-op signatures in C++ and pybind:
   - `is_avb_available` / `isAvbAvailable`
   - `create_avb_stream`
   - `start_avb_stream`
   - `stop_avb_stream`
   - `delete_avb_stream`
   - `get_avb_stream_stats`
   - `reset_avb_stream_stats`
   - `list_avb_streams`
   - `get_avb_device_names`
2. Add lightweight telemetry counters around stream lifecycle and callback overruns.
3. Snapshot current test results for AVB suites.

Deliverables:
- API contract section checked into this plan and mirrored in pybind docs.
- Baseline metrics JSON artifact in `build-notes/` or `docs/`.

Exit criteria:
- Backend no longer depends on missing method names.
- Baseline test and latency numbers archived.

Continuation checkpoint:
- Commit message prefix: `avb-plan3-phase0:`.

### Phase 1 - Engine AVB Stream Manager (Core Lifecycle)
Status: in_progress (real device-backed lifecycle wiring landed on 2026-02-19)

Objectives:
- Introduce a single authoritative engine-side stream manager.

Work:
1. Add `AvbStreamManager` in JUCE engine source:
   - New files: `juce-engine/Source/AvbStreamManager.h`, `juce-engine/Source/AvbStreamManager.cpp`.
2. Responsibilities:
   - Validate configs.
   - Create/open/start/stop/delete stream objects by stream ID.
   - Hold stream state machine (`stopped`, `starting`, `running`, `stopping`, `error`).
   - Provide snapshot stats and reset support.
3. Wire manager into `Map2AudioEngine`:
   - Add member accessor APIs in `juce-engine/Source/Map2AudioEngine.h` and implementation in `juce-engine/Source/Map2AudioEngine.cpp`.
4. Ensure thread-safe non-RT lock discipline:
   - Mutex allowed for lifecycle maps.
   - No lock acquisition on audio callback path.

Deliverables:
- Functional lifecycle API at C++ level for stream ID operations.

Exit criteria:
- Local unit/integration harness can create/start/stop/delete multiple streams by ID without process restart.

Continuation checkpoint:
- Add state transition table to this doc with implemented transitions marked.

Progress update (2026-02-19):
- `Map2AudioEngine` AVB lifecycle methods now create and own real `AvbAudioIODevice` instances per stream ID.
- `createAvbStream` now:
  - Validates interface availability via `getAvbInterfaceInfo`.
  - Normalizes and validates stream config.
  - Derives deterministic numeric stream IDs.
  - Opens real AVB devices with talker/listener channel masks.
- `startAvbStream` / `stopAvbStream` / `deleteAvbStream` now control real device state, not synthetic flags.
- `getAvbStreamStats` and `resetAvbStreamStats` now use underlying `AvbStream` counters via `AvbAudioIODevice`.
- `Map2AudioEngine::shutdown` now explicitly stops/closes all managed AVB streams before clearing registry.
- `AvbAudioIODevice` now exposes:
  - `getAvbStreamStatsSnapshot()`
  - `resetAvbStreamStats()`
- Stream config plumbing now honors runtime:
  - `presentation_offset_us`
  - `priority`

Validation run (2026-02-19):
- Build:
  - `cmake --build juce-engine/build --target map2_audio_engine -j4`
- Python tests:
  - `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py -q`
  - Result: `61 passed`
- Pybind smoke:
  - `PYTHONPATH=juce-engine/build python3 -c 'import map2_audio_engine; print(hasattr(map2_audio_engine.AudioEngine(), \"create_avb_stream\"))'`

### Phase 2 - Pybind and Backend Contract Completion
Status: in_progress (backend lifecycle contract tightened on 2026-02-20)

Objectives:
- Remove placeholder AVB behavior and make backend use real engine methods.

Work:
1. Update `juce-engine/Source/PythonBindings.cpp`:
   - Expose engine instance methods (not only module-level placeholders) for all lifecycle/stats calls.
   - Keep naming parity for both snake_case and camelCase where needed for compatibility.
2. Update `app/services/avb/avb_service.py`:
   - Prefer a strict method set once available, reduce fallback guessing logic after migration window.
   - Preserve structured error codes for API compatibility.
3. Keep `app/routes/avb.py` response contracts stable.
4. Update engine-contract tests:
   - `tests/test_avb_service_engine_contract.py` should migrate from "method missing" expectations to "method exists and works" expectations.

Deliverables:
- End-to-end create/start/stop/delete/stats API path functioning via existing REST endpoints.

Exit criteria:
- `/api/avb/streams*` lifecycle paths succeed with real engine execution when AVB is enabled.

Continuation checkpoint:
- Capture `curl` sequence transcript for stream lifecycle in `build-notes/`.

Progress update (2026-02-20):
- `AvbService` now uses a stricter lifecycle method set aligned with engine contract:
  - create: `create_avb_stream` / `createAvbStream`
  - start: `start_avb_stream` / `startAvbStream`
  - stop: `stop_avb_stream` / `stopAvbStream`
  - delete: `delete_avb_stream` / `deleteAvbStream`
- Removed legacy add/remove stream fallback method probing from create/delete paths.
- Added explicit engine readiness error (`ENGINE_NOT_READY`) when lifecycle calls are attempted with no bound engine.
- Improved lifecycle state/error handling:
  - Clear stale `stream.error` on successful start/stop.
  - Mark stream `ERROR` and capture details on stop exceptions.
  - Prevent delete from proceeding when an implicit stop fails.
- Contract tests migrated from method-missing-only checks to real lifecycle success/error coverage in:
  - `tests/test_avb_service_engine_contract.py`

Validation run (2026-02-20):
- `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py -q`
- Result: `61 passed`

### Phase 3 - AvbAudioIODeviceType and Device Enumeration Hardening
Status: in_progress (local device identity/config hardening landed on 2026-02-20)

Objectives:
- Make AVB devices robust JUCE citizens with accurate discovery and config.

Work:
1. Refactor `juce-engine/Source/AvbAudioIODeviceType.cpp`:
   - Replace direct env-only config assumptions with resolved runtime config from engine/config service.
   - Implement real mDNS/cluster discovery integration (or consume backend-provided endpoint cache) instead of empty placeholder.
2. Add stable device identity mapping:
   - Device IDs must map predictably to entity_id + unique_id + direction.
3. Ensure separate input/output behavior is explicit and compatible with JUCE expectations.
4. Add handling for interface-down and PTP-unsynced states as non-crash degraded availability.

Deliverables:
- Reliable `scanForDevices()` output for local and discovered AVB endpoints.

Exit criteria:
- JUCE device list reflects expected AVB talkers/listeners with correct metadata.

Continuation checkpoint:
- Save discovery test matrix (local-only, multi-node, AVDECC-present) in `docs/`.

Progress update (2026-02-20):
- `AvbAudioIODeviceType` runtime availability checks now align with engine-side checks:
  - `MAP2_AVB_ENABLED` truthy parsing or `/etc/map2/avb-enabled`
  - configured interface existence in `/sys/class/net/<iface>`
  - `ptp4l` readiness via `/run/ptp4l.pid`
- `scanForDevices()` now refreshes availability on every scan and derives stable local names:
  - `AVB Talker [<interface>]`
  - `AVB Listener [<interface>]`
- `createDevice()` now:
  - refreshes availability at call time
  - validates local device selections (with legacy name compatibility)
  - uses direction-scoped stream IDs
  - propagates stream runtime config (`presentation_offset_us`, `priority`) into `AvbAudioIODevice`
- Local config resolution now robustly parses:
  - `MAP2_AVB_INTERFACE`
  - optional `MAP2_AVB_STREAM_ID` (fallback deterministic hash from interface)
  - optional `MAP2_AVB_DEST_MAC` (fallback `91:e0:f0:00:0e:80`)
  - optional `MAP2_AVB_PRESENTATION_OFFSET_US` (clamped)
  - optional `MAP2_AVB_PRIORITY` (clamped 0-7)

Validation run (2026-02-20):
- Build: `cmake --build juce-engine/build --target map2_audio_engine -j4`
- Python tests:
  - `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py -q`
  - Result: `61 passed`

### Phase 4 - AVTP Fidelity and PTP Time Discipline
Status: in_progress (transport timing/error-path improvements landed on 2026-02-20)

Objectives:
- Upgrade transport correctness to production quality.

Work:
1. Complete real libavtp use in `juce-engine/Source/AvbStream.cpp`:
   - Replace placeholder allocation and comments with full PDU encode/decode paths.
2. Implement strict sequence validation and timestamp validity tracking.
3. Improve receive loop behavior:
   - Bounded blocking/timeout policy.
   - Distinguish no-data from hard errors.
4. Use PTP-synchronized clock source in `AvbAudioIODevice::getPtpTimestamp()`.
5. Validate format conversion path for 16/24/32-bit with endian correctness and clipping policy.

Deliverables:
- Deterministic packetization/depacketization with credible stats and fault counters.

Exit criteria:
- Packet loss, sequence error, and timestamp error counters correlate with induced fault tests.

Continuation checkpoint:
- Add pcap verification notes and test scripts location.

Progress update (2026-02-20):
- `AvbAudioIODevice::getPtpTimestamp()` now prefers `clock_gettime(CLOCK_TAI)` with system-clock fallback.
- `AvbStream` non-blocking socket behavior now distinguishes transient conditions from hard errors:
  - `sendFrame()`: returns `1` on `EAGAIN/EWOULDBLOCK` backpressure.
  - `receiveFrame()`: returns `1` when no frame is available yet.
- Updated API comments in `AvbStream.h` to document the new return-code semantics.
- Listener network loop already includes bounded sleep on non-data paths to avoid busy-spin.

Validation run (2026-02-20):
- Build: `cmake --build juce-engine/build --target map2_audio_engine -j4`
- Python tests:
  - `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py -q`
  - Result: `61 passed`

### Phase 5 - Deep Integration With Existing AVB Platform Features
Status: in_progress (discovery cache sync wiring landed on 2026-02-20)

Objectives:
- Use current platform AVB features to the fullest (SRP, TSN, discovery, AVDECC, router).

Work:
1. SRP integration:
   - Keep `app/services/avb/srp_admission.py` as admission authority.
   - Bind reservation metadata to stream lifecycle in `app/services/avb/avb_service.py` and route flows in `app/services/avb/avb_router.py`.
2. TSN integration:
   - Confirm queue/priority config from `app/services/avb/tsn_qdisc.py` maps to stream priority and interface state checks.
3. PTP integration:
   - Surface sync/offset details from `app/services/avb/ptp_monitor.py` into stream health reporting.
4. Discovery integration:
   - Align `AvbAudioIODeviceType` device lists with `app/services/avb/avb_discovery.py` and router endpoint caches.
5. AVDECC integration:
   - Keep ACMP control flow in router/routes and ensure engine stream creation paths work for both MAP2 and AVDECC-managed routes.

Deliverables:
- Unified behavior between JUCE device layer and existing AVB router/control APIs.

Exit criteria:
- `POST /api/avb/router/connect` and `/disconnect` reliably provision/deprovision real streams with accurate SRP handling and warnings.

Continuation checkpoint:
- Add cross-service sequence diagram artifact in `docs/`.

Progress update (2026-02-20):
- Router discovery cache now syncs discovered endpoints into the engine AVB cache:
  - `app/services/avb/avb_router.py` adds:
    - `_build_engine_discovered_devices_payload()`
    - `_sync_engine_discovered_devices()`
  - Discovery and cleanup loops call sync after endpoint updates.
  - `stop()` now clears endpoints/connections and pushes an empty discovered-device payload.
- Engine AVB discovered-device cache API is now available in C++ and pybind:
  - `Map2AudioEngine` adds:
    - `setAvbDiscoveredDevices(...)`
    - `getAvbDiscoveredDevices()`
    - `clearAvbDiscoveredDevices()`
  - `getAvbDeviceNames()` now merges local AVB names with discovered endpoint names.
  - Python bindings now expose snake_case and camelCase aliases for these APIs.
- Router integration tests expanded in `tests/test_avb_router_map2.py`:
  - payload normalization/sorting
  - engine setter snake_case priority and camelCase fallback
  - router stop() clearing and empty-cache sync behavior
- Stream management APIs now include transport health context:
  - `GET /api/avb/streams` and `GET /api/avb/streams/{id}` enrich each stream with:
    - PTP status snapshot (`available`, `state`, `offset_ns`, `mean_path_delay_ns`)
    - TSN/qdisc snapshot (`mqprio`, `cbs`, `etf`, `vlan`, interface)
    - computed readiness + issue list (`PTP_UNAVAILABLE`, `TSN_UNAVAILABLE`, `TSN_INTERFACE_MISMATCH`, `STREAM_ERROR`)
- Route tests expanded in `tests/test_avb_service_stats.py` to validate healthy and degraded stream-health payloads.
- AVB device inventory endpoint added:
  - `GET /api/avb/devices` now returns:
    - JUCE-selectable AVB device names
    - engine discovered-endpoint cache entries
    - counts and AVB availability status
  - `AvbService` adds normalized accessors:
    - `get_device_names()`
    - `get_discovered_devices()`
  - Tests expanded in `tests/test_avb_service_stats.py` to validate normalization and route payload.
- AVB routing web UI now consumes new backend inventory/health signals:
  - `web/src/app/components/AvbRouting/hooks/useAvbApi.ts` adds:
    - `useAvbDevices()` (`GET /api/avb/devices`)
    - `useAvbStreams()` (`GET /api/avb/streams`)
  - `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx` now shows:
    - per-endpoint engine cache sync status (`Synced` / `Not Indexed`)
    - cached format metadata from discovered-device cache
    - global cache drift counts (`missing`, `orphaned`)
    - transport readiness counters (`Transport Ready Streams`, `Streams With Issues`)
  - AVB routing types extended in:
    - `web/src/app/components/AvbRouting/types/endpoint.ts`
    - `web/src/app/components/AvbRouting/types/index.ts`
  - Inspector tests expanded in:
    - `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx`
  - TopBar status strip now surfaces AVB readiness telemetry:
    - `Engine: <device_count>/<discovered_count>`
    - `Cache Drift: <missing>|<orphaned>`
    - `Transport: <ready>/<total>`
    - `Issues: <count>`
    - implemented in `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`
  - TopBar integration tests expanded for AVB telemetry chips:
    - `web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx`
  - TopBar endpoint filters now include an issues-only operator mode:
    - `Issues only` filter toggle wired through reducer/state and endpoint query logic
    - issue classification currently includes endpoint availability and degraded/offline node health
    - status-strip quick filter chip added:
      - `Endpoint Issues: <count>` toggles `issuesOnly` on/off directly from TopBar
    - shared issue-classification utility introduced to keep TopBar counters and `useFilteredEndpoints()` semantics aligned
      - `web/src/app/components/AvbRouting/utils/endpointIssues.ts`
    - implemented in:
      - `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`
      - `web/src/app/components/AvbRouting/context/RoutingContext.tsx`
      - `web/src/app/components/AvbRouting/types/state.ts`
    - tests expanded in:
      - `web/src/app/components/AvbRouting/components/TopBar/TopBar.filters.test.tsx`
      - `web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx`
      - `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`
  - RoutingContext endpoint sync now preserves backend node ownership and performs address-based fallback:
    - `node_id` is preserved from API payload when provided
    - when missing, `node_address` is resolved against node API/address inventory before local fallback
    - implemented in:
      - `web/src/app/components/AvbRouting/context/RoutingContext.tsx`
    - coverage expanded in:
      - `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`
  - NodeTree now surfaces per-node AVB health rollups from endpoint + engine cache state:
    - `Sync <synced>/<total>` per node
    - `Issues <count>` with breakdown tooltip (`missing cache`, `endpoint unavailable`, `cache unavailable`)
    - status badge now includes AVB issue context
    - implemented in `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.tsx`
  - NodeTree/NodeSelector/RoutingContext tests updated for new AVB cache hook wiring:
    - `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.badges.test.tsx`
    - `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx`
    - `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`

Validation run (2026-02-20):
- Build:
  - `cmake --build juce-engine/build --target map2_audio_engine -j4`
- Python tests:
  - `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py tests/test_avb_router_map2.py tests/test_avb_router_factory.py -q`
  - Result: `85 passed`
- AVB routing frontend tests:
  - `npm run test:avb-routing`
  - Result: `18 suites passed`, `224 tests passed`

### Phase 6 - Configuration and Operations Experience
Status: in_progress

Objectives:
- Expose full AVB runtime configurability without sacrificing RT safety.

Work:
1. Finalize supported runtime controls:
   - Stream channels/sample-rate/buffer/presentation offset/priority.
   - Interface selection and failover policy.
2. Ensure config source consistency:
   - `app/config.py` remains canonical.
   - Environment overrides mapped cleanly and logged.
3. Add diagnostics endpoints or fields (if missing):
   - Effective stream config.
   - PTP lock state.
   - TSN qdisc state.
   - SRP reservation state.
4. Update docs:
   - `docs/avb-setup.md` with precise Plan 3 runtime behavior and troubleshooting.

Progress update (2026-02-20):
- Runtime control parsing tightened on stream create:
  - validates positive integer controls (`channels`, `sample_rate`, `buffer_size`, `presentation_offset_us`)
  - validates `priority` range (`0..7`)
  - resolves `interface` from request with canonical fallback to `avb.interface`
  - implemented in:
    - `app/routes/avb.py`
  - test coverage expanded in:
    - `tests/test_avb_stream_validation.py`
- Stream diagnostics model expanded and exposed:
  - `/api/avb/streams` and `/api/avb/streams/{stream_id}` now include `diagnostics` with:
    - `effective_config`
    - `ptp_lock`
    - `tsn_qdisc`
    - `srp` binding state
  - new dedicated endpoint:
    - `GET /api/avb/streams/{stream_id}/diagnostics`
  - implemented in:
    - `app/routes/avb.py`
  - test coverage expanded in:
    - `tests/test_avb_service_stats.py`
- Operator setup docs updated for current stream-create contract and diagnostics API:
  - `docs/avb-setup.md` now uses `interface` + `dest_mac`
  - adds diagnostics probe example for `/api/avb/streams/{stream_id}/diagnostics`
- Config schema now defines failover knobs consumed by diagnostics/runtime resolution:
  - `avb.failover_policy` (env: `MAP2_AVB_FAILOVER_POLICY`)
  - `avb.failover_interfaces` (env: `MAP2_AVB_FAILOVER_INTERFACES`)
  - implemented in:
    - `app/config.py`
  - docs updated in:
    - `docs/avb-setup.md`
- AVB routing Inspector now surfaces stream-diagnostics counters from backend diagnostics payload:
  - `Diagnostics Coverage`
  - `PTP Locked Streams`
  - `TSN Fully Configured Streams`
  - `SRP Bound Streams`
  - `Failover Candidate Streams`
  - `Failover Policies` (aggregate) and `Failover Interfaces` (top candidates)
  - implemented in:
    - `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`
    - `web/src/app/components/AvbRouting/types/endpoint.ts`
    - `web/src/app/components/AvbRouting/types/index.ts`
  - test coverage expanded in:
    - `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx`
- AVB routing TopBar status strip now surfaces stream-diagnostics rollups:
  - `Diag: <diagnostics>/<total_streams>`
  - `PTP Lock: <locked>/<total_streams>`
  - `SRP: <bound>/<total_streams>`
  - implemented in:
    - `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`
  - test coverage expanded in:
    - `web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx`
- Stream create contract now accepts and validates per-stream failover controls:
  - `failover_policy` (`none`, `prefer_primary`, `round_robin`, `manual`)
  - `failover_interfaces` (list, CSV, or JSON-array string)
  - resolved stream interface is injected as the first failover candidate when missing
  - implemented in:
    - `app/routes/avb.py`
    - `app/services/avb/avb_service.py`
  - test coverage expanded in:
    - `tests/test_avb_stream_validation.py`
    - `tests/test_avb_service_stats.py`
- Added operator/runtime compatibility matrix API:
  - `GET /api/avb/config/compatibility`
  - `GET /api/avb/status` now includes `compatibility` summary
  - includes active profile and matrix rows for:
    - `default`
    - `strict_srp`
    - `avdecc_enabled`
    - `strict_srp_avdecc`
  - implemented in:
    - `app/routes/avb.py`
  - test coverage expanded in:
    - `tests/test_avb_service_stats.py`
- Operator docs now include configuration compatibility matrix and runtime probe call:
  - implemented in:
    - `docs/avb-setup.md`
- Software-only qualification snapshot recorded:
  - `docs/AVB_PLAN3_QUALIFICATION_2026-02-20.md`
- Strict SRP admission coverage broadened:
  - allowed with reservation returns admission in response
  - allowed without reservation fails closed
  - connect exception triggers SRP rollback release
  - implemented in:
    - `tests/test_avb_routes_srp.py`
- Build/runbook captured for full stack:
  - `docs/BUILD_AVB_FULL.md`
- SRP admissions API pagination (limit + offset) now covered:
  - `app/services/avb/srp_log_store.py`
  - `app/routes/avb.py`
  - tests:
    - `tests/test_avb_routes_srp.py`
    - `tests/test_avb_srp_log_store.py`
- AVB C++ harness scaffolded (opt-in Catch2):
  - `juce-engine/tests/AvbStreamManagerTests.cpp`
  - `juce-engine/CMakeLists.txt` adds `BUILD_AVB_TESTS` to pull Catch2 and build `avb_tests`
  - Current coverage: stats snapshot/reset, latency min/max reset, counter accumulation semantics

Validation run (2026-02-20):
- `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py tests/test_avb_routes_srp.py tests/test_avb_router_map2.py tests/test_avb_router_factory.py -q`
- Result: `94 passed`
- `npm run test:avb-routing`
- Result: `18 suites passed`, `224 tests passed`

Deliverables:
- Operator-visible, auditable AVB config and health model.

Exit criteria:
- Users can configure AVB stream behavior and verify effective runtime state from API.

Continuation checkpoint:
- Begin Phase 7 C++ AVB stream-manager harness work (state transitions + AVTP telemetry counters).

### Phase 7 - Test Expansion and Performance Qualification
Status: in_progress (Python lifecycle churn/recovery + SRP rollback failure modes landed on 2026-02-20)

Objectives:
- Qualify Plan 3 for production with strong regression protection.

Work:
1. Expand Python tests:
   - Update AVB service engine contract tests to real lifecycle success path.
   - Add router + SRP rollback tests for new failure modes.
2. Add C++ focused tests/harness:
   - Stream manager state transitions.
   - AVTP conversion correctness.
   - Sequence/timestamp error accounting.
3. Hardware-in-the-loop test runs:
   - `tests/test_avb_integration.py`
   - `tests/test_avb_rt_safety.py`
4. Add stress scenarios:
   - Rapid create/delete churn.
   - Network interruption and recovery.
   - Multi-stream mixed talker/listener workloads.

Progress update (2026-02-20):
- Expanded AVB service lifecycle contract tests with churn/recovery coverage:
  - rapid create/start/stop/delete churn loop keeps registry consistent
  - start failure followed by retry validates error-state recovery semantics
  - mixed talker/listener churn with stats reset coverage
  - implemented in:
    - `tests/test_avb_service_engine_contract.py`
- Expanded router + SRP rollback failure-mode tests:
  - connect rollback when SRP release returns unsuccessful payload
  - reject-path SRP release unsuccessful payload handling
  - multi-connection connect/disconnect ensures router state cleanup
  - implemented in:
    - `tests/test_avb_router_map2.py`

Deliverables:
- Repeatable qualification report with pass/fail against targets.

Exit criteria:
- AVB test suites pass in CI where possible and in hardware lab for gated release.

Continuation checkpoint:
- Store latest qualification report in `docs/AVB_PLAN3_QUALIFICATION_<date>.md`.

### Phase 8 - Rollout, Guardrails, and Backout
Status: pending

Objectives:
- Deploy safely with reversible controls.

Work:
1. Feature flag strategy:
   - Keep compile-time `USE_AVB` and runtime `avb.enabled` controls.
   - Optional staged enablement by node role.
2. Guardrails:
   - Startup validation for interface, CAP_NET_RAW, ptp4l availability, and SRP daemon health.
3. Backout:
   - Clear operational path to disable AVB while preserving baseline audio service.
4. Release checklist and handoff notes.

Deliverables:
- Production rollout runbook and backout playbook.

Exit criteria:
- Can enable/disable Plan 3 path without code rollback and without orphaning resources.

Continuation checkpoint:
- Final release candidate tag notes reference this phase completion.

## 6. API Contract (Phase 0 Freeze)
Engine instance methods required by backend:

1. `is_avb_available() -> bool`
2. `create_avb_stream(config: dict) -> bool | dict`
3. `start_avb_stream(stream_id: str) -> bool | dict`
4. `stop_avb_stream(stream_id: str) -> bool | dict`
5. `delete_avb_stream(stream_id: str) -> bool | dict`
6. `get_avb_stream_stats(stream_id: str) -> dict`
7. `reset_avb_stream_stats(stream_id: str) -> bool`
8. `get_avb_device_names() -> list[str]`
9. `get_avb_device_count() -> int`
10. `get_avb_interface_info(interface_name: str) -> dict`

Compatibility note:
- Keep temporary aliases (`camelCase`) until backend migration is complete.

## 7. Risk Register
1. Risk: Real-time regressions from lock contention.
Mitigation: Keep mutexes outside callback and network hot loops; add instrumentation.

2. Risk: AVTP behavior mismatch with third-party endpoints.
Mitigation: Validate with AVDECC devices and packet captures; add interoperability tests.

3. Risk: SRP reservation leaks on failure paths.
Mitigation: Preserve existing rollback/release safeguards and expand failure tests.

4. Risk: Config drift between env vars and runtime config.
Mitigation: Single config resolution path and explicit effective-config logging.

5. Risk: Device enumeration instability in multi-node environments.
Mitigation: Stable endpoint identity scheme and cache invalidation rules.

## 8. Execution Notes for Next AI
When resuming, do this first:
1. Read this file and mark current phase status.
2. Run AVB-focused tests to establish baseline:
   - `pytest tests/test_avb_service_engine_contract.py tests/test_avb_service_stats.py tests/test_avb_stream_validation.py -q`
3. Inspect current bindings in `juce-engine/Source/PythonBindings.cpp` around AVB methods.
4. Confirm active gaps against Phase 0 contract section.
5. Implement only one phase at a time and update this doc before moving on.

Commit hygiene:
- Use one commit per phase milestone.
- Prefix commits with `avb-plan3-phase<N>:`.
- Include executed test commands in commit body or matching `build-notes/` file.
