# AVB Canonical Worklist (Single Source of Truth)

Canonical file: `docs/AVB_MASTER_WORK_PLAN.md`  
Rule status: Active (disable only with `DISABLE WORKLIST RULE`)  
Last updated: 2026-02-22 21:43 - Codex

## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

## Execution Rules (Always Apply)

- Produce the best possible output for each item, with no omissions.
- For every item, always include all of the following:
1. Restate the item.
2. Produce the deliverable.
3. Add a short rationale.
4. Add a confidence score (`0-100`) with a brief reason.
- If assumptions are required:
- Label each with `ASSUMPTION`.
- Keep assumptions minimal and explicit.
- Apply these rules every time this task list is reviewed, updated, or executed.

## Top Tasks (Priority Order)

ID: T001  
Status: [✓] Done  
Title: Harden engine stream lifecycle transition edges under stress  
Description:  
- Goal / acceptance criteria: Cover and stabilize edge transitions (`running->error`, repeated `start/stop`, `delete` after failure) with deterministic behavior and tests.  
- Why it matters: Stream lifecycle correctness is the core reliability gate for AVB runtime control.  
- Dependencies: None  
- Estimated effort: High (~1-2 days)  
- Required outputs: C++ transition fixes in `juce-engine/Source/Map2AudioEngine.cpp` and test updates in AVB state-machine suites.  
Subtasks:  
- ID: T001-subA  
  Status: [✓] Done  
  Title: Add explicit transition matrix tests for failure and retry paths  
  Description:  
  - Goal / acceptance criteria: Add automated coverage for all legal/illegal transitions and retry semantics.  
  - Why it matters: Prevent regressions when control-plane code changes.  
  - Dependencies: None  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Updated C++ and/or Python tests with matrix assertions.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 23:38 - Codex  
- ID: T001-subB  
  Status: [✓] Done  
  Title: Enforce idempotency and consistent error payloads on repeated operations  
  Description:  
  - Goal / acceptance criteria: Repeated `start`, `stop`, and `delete` return stable results with no leaked state.  
  - Why it matters: API clients depend on safe retries.  
  - Dependencies: T001-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Engine method changes plus contract tests.  
  Assigned to: Codex  
  Last updated: 2026-02-21 19:20 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-22 12:19 - Codex
Completion notes:
- What was done: Completed transition-edge hardening through explicit lifecycle matrix coverage and idempotent repeated-operation behavior, including deterministic handling across retry and cleanup paths.
- Key findings: With matrix tests and idempotency enforcement in place, stream lifecycle operations now fail closed with stable result contracts under repeated `start/stop/delete` calls.
- Files/links produced: `juce-engine/Source/Map2AudioEngine.cpp`, AVB lifecycle/state-machine test suites under `juce-engine/tests` and backend AVB contract coverage.
- Validation/evidence: `pytest tests/ -q` (390 passed, 195 skipped); `ctest --test-dir juce-engine/build --output-on-failure` (2/2 passed); `ctest --test-dir juce-engine/build-check --output-on-failure` (1/1 passed).
- Suggested next tasks: T007-subA, T017, T018

ID: T002  
Status: [✓] Done  
Title: Add AVTP sequence/timestamp counters and structured diagnostics  
Description:  
- Goal / acceptance criteria: Track sequence gaps, timestamp skew, and decode anomalies; expose counters in exported stream stats and diagnostics endpoints.  
- Why it matters: Qualification requires measurable transport fidelity, not pass/fail only.  
- Dependencies: T001  
- Estimated effort: High (~1-2 days)  
- Required outputs: C++ stats structs, pybind exposure, backend payload updates, tests.  
Subtasks:  
- ID: T002-subA  
  Status: [✓] Done  
  Title: Implement native counters in AVTP TX/RX paths  
  Description:  
  - Goal / acceptance criteria: Add monotonic counters for sequence gap/misalignment and timestamp skew in engine transport code.  
  - Why it matters: Establish source-of-truth telemetry at producer layer.  
  - Dependencies: T001  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Changes in `juce-engine/Source/AvbStream.*` and related stats structs.  
  Assigned to: Codex  
  Last updated: 2026-02-21 19:55 - Codex  
- ID: T002-subB  
  Status: [✓] Done  
  Title: Surface counters to Python/web diagnostics contract  
  Description:  
  - Goal / acceptance criteria: API returns new counters in stream and diagnostics payloads with schema tests.  
  - Why it matters: Operators need visibility in UI and service APIs.  
  - Dependencies: T002-subA  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: `PythonBindings.cpp`, `app/services/avb/avb_service.py`, route tests, type updates.  
  Assigned to: Codex  
  Last updated: 2026-02-21 20:12 - Codex  
Assigned to: MAP2 AVB Engine + Backend  
Last updated: 2026-02-21 08:33 - Codex

ID: T003  
Status: [✓] Done  
Title: Canonicalize host/device/source metadata schema across backend and UI  
Description:  
- Goal / acceptance criteria: Use one canonical endpoint schema with deterministic naming and host linkage across discovery, routing payloads, and frontend types.  
- Why it matters: Eliminates multi-node ambiguity and inconsistent rendering.  
- Dependencies: None  
- Estimated effort: Medium (~4-8 hours)  
- Required outputs: Shared schema updates in backend models and `web/src/app/components/AvbRouting/types/endpoint.ts`.  
Subtasks:  
- ID: T003-subA  
  Status: [✓] Done  
  Title: Define canonical schema fields and backward-compatible mapping  
  Description:  
  - Goal / acceptance criteria: Document required fields (`host`, stable IDs, direction/source metadata) and adapter path.  
  - Why it matters: Prevent schema drift between services.  
  - Dependencies: None  
  - Estimated effort: Low (~1-2 hours)  
  - Required outputs: Schema decision note + code constants/types.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 14:43 - Codex  
- ID: T003-subB  
  Status: [✓] Done  
  Title: Apply schema end-to-end and update tests  
  Description:  
  - Goal / acceptance criteria: Discovery, API, and UI compile/tests pass with canonical type.  
  - Why it matters: Runtime and UX consistency depend on one contract.  
  - Dependencies: T003-subA  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Updated backend/UI code and related tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 22:04 - Codex  
Assigned to: MAP2 Backend + Web  
Last updated: 2026-02-21 22:04 - Codex  

ID: T004  
Status: [✓] Done  
Title: Add control-plane back-pressure handling and sequence audit log  
Description:  
- Goal / acceptance criteria: Handle transient router/network failures without orphaned reservations; emit correlated sequence logs for `connect -> admit -> create -> start -> rollback`.  
- Why it matters: Operator debugging and safe recovery require deterministic orchestration traces.  
- Dependencies: T001, T002  
- Estimated effort: High (~1-2 days)  
- Required outputs: Backend orchestration updates, operator-facing diagnostic route/log integration, regression tests.  
Subtasks:  
- ID: T004-subA  
  Status: [✓] Done  
  Title: Implement bounded retry/backoff and cleanup guarantees  
  Description:  
  - Goal / acceptance criteria: On transient failures, retries are bounded and rollback always releases resources.  
  - Why it matters: Prevent leaked SRP reservations and partial stream state.  
  - Dependencies: T001  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Router-service code changes + failure-injection tests.  
  Assigned to: Codex  
  Last updated: 2026-02-21 20:17 - Codex  
- ID: T004-subB  
  Status: [✓] Done  
  Title: Emit correlated critical-path sequence log IDs  
  Description:  
  - Goal / acceptance criteria: Every connect/disconnect flow includes traceable correlation ID and stage outcome.  
  - Why it matters: Speeds incident diagnosis and qualification evidence collection.  
  - Dependencies: T004-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Structured logs and docs/tests for log fields.  
  Assigned to: Codex  
  Last updated: 2026-02-21 20:17 - Codex  
Assigned to: MAP2 Backend  
Last updated: 2026-02-21 20:17 - Codex

ID: T005  
Status: [✓] Done  
Title: Expand AVTP fidelity validation and Catch2 stress coverage  
Description:  
- Goal / acceptance criteria: Add encode/decode edge-case tests, sequence/timestamp stress tests, and deterministic failure-injection coverage for AVB test targets.  
- Why it matters: Production transport behavior must be validated under fault scenarios.  
- Dependencies: T002  
- Estimated effort: High (~1-2 days)  
- Required outputs: Catch2 suites, CI or local scripted target for AVB failure-injection tests.  
Subtasks:  
- ID: T005-subA  
  Status: [✓] Done  
  Title: Add endianness/format edge-case encode/decode assertions  
  Description:  
  - Goal / acceptance criteria: Test vectors cover boundary values and malformed payload behavior.  
  - Why it matters: Prevent silent corruption in packet parsing.  
  - Dependencies: T002  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: New/updated Catch2 tests.  
  Assigned to: Codex  
  Last updated: 2026-02-21 20:56 - Codex  
- ID: T005-subB  
  Status: [✓] Done  
  Title: Add deterministic stress and recovery tests with fault injection  
  Description:  
  - Goal / acceptance criteria: Reproducible runs generate stable metrics and pass/fail criteria.  
  - Why it matters: Qualification and release readiness depend on repeatability.  
  - Dependencies: T005-subA  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Catch2 test additions and test-run command documentation.  
  Assigned to: Codex  
  Last updated: 2026-02-21 21:06 - Codex  
Assigned to: MAP2 AVB Engine QA  
Last updated: 2026-02-21 21:06 - Codex

ID: T006  
Status: [✓] Done  
Title: Complete AVB web operator UX backlog with single-filter model and health snapshot  
Description:  
- Goal / acceptance criteria: Add host/issue/direction/quality filtering and inspector health snapshot without introducing split filter logic.  
- Why it matters: Operators need fast diagnosis and control in noisy multi-node environments.  
- Dependencies: T003  
- Estimated effort: Medium (~4-8 hours)  
- Required outputs: Web component updates, state/reducer tests, UX acceptance notes.  
Subtasks:  
- ID: T006-subA  
  Status: [✓] Done  
  Title: Implement unified filter state model and query wiring  
  Description:  
  - Goal / acceptance criteria: All AVB filtering derives from one typed model and persists correctly in routing UI state.  
  - Why it matters: Avoid conflicting filter behavior and hidden results.  
  - Dependencies: T003  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Reducer/state updates and tests under `web/src/app/components/AvbRouting`.  
  Assigned to: Codex  
  Last updated: 2026-02-21 21:50 - Codex  
- ID: T006-subB  
  Status: [✓] Done  
  Title: Add inspector AVB health snapshot card with telemetry rollup  
  Description:  
  - Goal / acceptance criteria: Selected node inspector shows concise stream/host health summary in <=2 clicks.  
  - Why it matters: Reduce operator triage time during incidents.  
  - Dependencies: T002, T006-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: UI component updates and snapshot rendering tests.  
  Assigned to: Codex  
  Last updated: 2026-02-21 21:50 - Codex  
Assigned to: MAP2 Web  
Last updated: 2026-02-21 21:50 - Codex
Completion notes:
- What was done: Added a unified AVB filter model (host/direction/quality included), centralized reducer + endpoint-filter application logic, extended TopBar filter controls, and added an Inspector AVB Health Snapshot card scoped to active node context.
- Key findings: AVB stream payloads currently lack explicit node ownership metadata, so Inspector snapshot stream scoping uses route/endpoint matching and a deterministic global fallback when direct mapping is unavailable.
- Files/links produced: `web/src/app/components/AvbRouting/types/state.ts`, `web/src/app/components/AvbRouting/utils/filters.ts`, `web/src/app/components/AvbRouting/context/routingReducer.ts`, `web/src/app/components/AvbRouting/context/RoutingContext.tsx`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.filters.test.tsx`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx`.
- Validation/evidence: `cd web && npm run typecheck`; `npm run test -- web/src/app/components/AvbRouting/components/TopBar/TopBar.filters.test.tsx web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx --runInBand`; `npm run test -- web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx --runInBand`; `npm run test:avb-routing`.
- Suggested next tasks: T007, T013, T026

ID: T008  
Status: [✓] Done  
Title: Run and publish milestone build/test checkpoints with evidence links  
Description:  
- Goal / acceptance criteria: Execute core and qualification command sets at each milestone; publish pass/fail summary and artifact locations.  
- Why it matters: Keeps execution observable and reduces hidden regressions.  
- Dependencies: T001, T002, T004, T005, T006  
- Estimated effort: Medium (~2-4 hours per milestone)  
- Required outputs: Checkpoint notes with command outputs and artifact paths in docs/logs.  
Subtasks:  
- ID: T008-subA  
  Status: [✓] Done  
  Title: Establish milestone evidence template  
  Description:  
  - Goal / acceptance criteria: Standard note format includes commands, durations, outcomes, and artifacts.  
  - Why it matters: Consistent reporting across threads and weeks.  
  - Dependencies: None  
  - Estimated effort: Low (~1 hour)  
  - Required outputs: Markdown template in docs.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 14:43 - Codex  
- ID: T008-subB  
  Status: [✓] Done  
  Title: Execute checkpoint run for current AVB branch state  
  Description:  
  - Goal / acceptance criteria: Record current baseline pass/fail and top failing tests with ownership mapping.  
  - Why it matters: Sets starting point for priority execution.  
  - Dependencies: T008-subA  
  - Estimated effort: Medium (~2-3 hours)  
  - Required outputs: Logged results and updated statuses in this file.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 22:04 - Codex  
Assigned to: MAP2 QA + Integrations  
Last updated: 2026-02-21 22:04 - Codex  

## Consolidated Backlog from Discovered Plan References

The items below were discovered in active implementation notes (`docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md`,
`docs/phase10-progress.md`, `docs/AVB_PLAN3_QUALIFICATION_2026-02-20.md`,
`docs/AVB_ROUTING_IMPLEMENTATION_STATUS.md`, `docs/AVB_MULTI_NODE_IMPLEMENTATION_SUMMARY.md`,
`docs/AVB_MULTI_NODE_ARCHITECTURE.md`) and active AVB code TODOs/placeholders.

Where items overlap with existing work, they are merged into a single consolidated task.

ID: T009  
Status: [✓] Done  
Title: Remove AVDECC AEM command/response placeholders in JUCE and complete descriptor flow  
Description:  
- Goal / acceptance criteria: AECP command send/response path is real (not placeholder comments), with deterministic descriptor request/response handling for enumeration completion.  
- Why it matters: Current AEM pipeline uses placeholders for AECP TX and AEM command handling, limiting robust descriptor-driven behavior for AVDECC endpoints.  
- Dependencies: None  
- Estimated effort: High (~1-2 days)  
- Required outputs: `juce-engine/Source/AvdeccEntity.cpp`, `juce-engine/Source/AvdeccEnumerator.cpp`, regression tests for enum request/response lifecycle.  
Subtasks:  
- ID: T009-subA  
  Status: [✓] Done  
  Title: Wire real send path for enumerator read-descriptor requests  
  Description:  
  - Replace placeholder lambda in `AvdeccEntity` constructor with a real `sendAecpCommand` flow that serializes AECP AEM frames and sends via socket.  
  - Remove "will be implemented" placeholders in `AvdeccEntity.cpp`/`AvdeccEnumerator.cpp`.  
  - Dependencies: None  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Functional AECP request transmit and callback path in logs/tests.  
  Assigned to: Codex  
  Last updated: 2026-02-21 22:22 - Codex  
- ID: T009-subB  
  Status: [✓] Done  
  Title: Implement AEM READ_DESCRIPTOR command + response extraction  
  Description:  
  - Replace `handleAecpAemCommand()` placeholder with request handlers for `READ_DESCRIPTOR` (and safe no-op for unsupported AECP types).  
  - Replace fixed-size placeholder response extraction in `handleAecpAemResponse()` with bounded payload parsing.  
  - Dependencies: T009-subA  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Descriptor sessions complete without placeholder branches.  
  Assigned to: Codex  
  Last updated: 2026-02-21 17:57 - Codex  
- ID: T009-subC  
  Status: [✓] Done  
  Title: Complete AEM response handling for missing descriptor categories and retries  
  Description:  
  - Ensure `retryRequest()` increments retry state correctly and does not silently mask backoff/retry conditions.  
  - Document/handle unsupported descriptor types with clear debug telemetry.  
  - Dependencies: T009-subB  
  - Estimated effort: Low (~2-3 hours)  
  - Required outputs: Retry behavior and unsupported-type behavior are deterministic and test-covered.  
  Assigned to: Codex  
  Last updated: 2026-02-21 19:38 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 21:37 - Codex  
Completion notes:
- What was done: Completed AECP READ_DESCRIPTOR send/response handling path and added deterministic AVDECC enumerator lifecycle regression coverage (minimal success flow plus retry/failure flow).
- Key findings: The remaining gap after prior AECP/AEM implementation work was missing automated enumeration lifecycle coverage in Catch2.
- Files/links produced: `juce-engine/Source/AvdeccEnumerator.cpp`, `juce-engine/tests/AvdeccEnumeratorTests.cpp`, `juce-engine/CMakeLists.txt`, `docs/BUILD_AVB_FULL.md`.
- Validation/evidence: `cmake --build juce-engine/build --target avdecc_model_tests -j4`; `ctest --test-dir juce-engine/build -R '^avdecc_model_tests$' --output-on-failure`; `cmake --build juce-engine/build --target check-avb -j4`.
- Suggested next tasks: T007, T013

ID: T010  
Status: [✓] Done  
Title: Resolve AVDECC stream format metadata end-to-end and remove hardcoded AVB defaults  
Description:  
- Goal / acceptance criteria: Map2 and AVDECC endpoints expose accurate host-origin and format metadata (channels/sample rate) from discovered descriptor/model data, not placeholders.  
- Why it matters: This is required for deterministic AVDECC-to-JUCE routing and correct source/destination pairing in matrix workflows.  
- Dependencies: T009  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `app/services/avb/avb_router.py`, `app/routes/avb.py`, `web/src/app/components/AvbRouting` types/hooks, contract tests.  
Subtasks:  
- ID: T010-subA  
  Status: [✓] Done  
  Title: Parse AVDECC stream format metadata into routing endpoint payload  
  Description:  
  - Decode stream `current_format`/descriptor fields when available and derive channels/sample rate/bit-depth.  
  - Replace defaults `channels=2`, `sample_rate=48000` used in AVDECC discovery fallback in `avb_router.py`.  
  - Dependencies: T009  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: AVDECC route endpoints include real `channels` and `sample_rate` values.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 23:38 - Codex  
- ID: T010-subB  
  Status: [✓] Done  
  Title: Add source host tagging for endpoint names and routing inventory  
  Description:  
  - Ensure AVDECC endpoints carry host origin label in discovery/engine sync payload and in response schemas (`host`, `device_name`).  
  - Include host label in UI-visible endpoint naming (for manual pairing and diagnostics).  
  - Dependencies: T009  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Deterministic `host` field and consistent endpoint naming in UI payloads.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 17:57 - Codex  
- ID: T010-subC  
  Status: [✓] Done  
  Title: Persist and validate entity-model serialization path  
  Description:  
  - Implement `AvdeccEntityModel::fromJSON()` (currently TODO placeholder).  
  - Add round-trip tests covering descriptor/format cache payloads when available.  
  - Dependencies: T009  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: JSON cache loading restores descriptor model deterministically.  
  Assigned to: Codex  
  Last updated: 2026-02-21 19:10 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 17:57 - Codex  

ID: T011  
Status: [✓] Done  
Title: Close AVB web-node topology hook placeholders  
Description:  
- Goal / acceptance criteria: `useNodeApi` no longer returns hardcoded zero-count nodes/empty edges and resolves local identity from real backend/config inputs.  
- Why it matters: Topology/PTP health and local-host visibility are core for multi-node routing operations.  
- Dependencies: None  
- Estimated effort: Medium (~4-6 hours)  
- Required outputs: `web/src/app/components/AvbRouting/hooks/useNodeApi.ts`, tests for hook output shape and behavior.  
Subtasks:  
- ID: T011-subA  
  Status: [✓] Done  
  Title: Compute synchronized/total PTP nodes from real backend state  
  Description:  
  - Replace hardcoded `synced_nodes` and `total_nodes` with values derived from `/api/avb/discovery` payload.  
  - Dependencies: None  
  - Estimated effort: Low (~1-2 hours)  
  - Required outputs: PTP status reflects observed node state.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 13:28 - Codex  
- ID: T011-subB  
  Status: [✓] Done  
  Title: Build topology edges from active router connections  
  Description:  
  - Query active router matrix/connections and derive AVB topology edges instead of returning an empty list.  
  - Include edge attributes for host/pairing direction.  
  - Dependencies: T011-subA  
  - Estimated effort: Medium (~4 hours)  
  - Required outputs: `topology.edges` drives graph and matrix views.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 13:28 - Codex  
- ID: T011-subC  
  Status: [✓] Done  
  Title: Resolve local node ID from backend/config with safe fallback  
  Description:  
  - Replace backend-placeholder local node logic with backend discovery/config-backed inference and deterministic fallback.  
  - Dependencies: T011-subB  
  - Estimated effort: Low (~1-2 hours)  
  - Required outputs: Stable local node identity for operator flows.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 13:28 - Codex  
Assigned to: MAP2 Web  
Last updated: 2026-02-21 13:28 - Codex  

ID: T012  
Status: [✓] Done  
Title: Replace AVB/AVDECC module-level placeholder bindings with real engine-backed status contracts  
Description:  
- Goal / acceptance criteria: Module-level Python bindings return real data or explicit, structured unavailable/error states instead of hardcoded placeholders.  
- Why it matters: Backend/engine parity and operational observability depend on accurate binding contracts.  
- Dependencies: T009, T010  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `juce-engine/Source/PythonBindings.cpp`, API contract tests for disabled and enabled build paths.  
Subtasks:  
- ID: T012-subA  
  Status: [✓] Done  
  Title: Implement AVB device/list/stream metrics from engine accessors  
  Description:  
  - Replace placeholder return paths in `get_avb_device_count`, `get_avb_device_names`, `get_avb_stream_stats`, `get_all_avb_stream_stats`, and `get_avb_interface_info`.  
  - Dependencies: T009  
  - Estimated effort: Medium (~4-5 hours)  
  - Required outputs: Runtime binding values reflect engine/device state.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 14:24 - Codex  
- ID: T012-subB  
  Status: [✓] Done  
  Title: Keep AVDECC placeholder removal for module-level functions in build variants  
  Description:  
  - Align `get_avdecc_*` module-level bindings with current engine instance behavior and clear disabled-mode behavior.  
  - Dependencies: T009  
  - Estimated effort: Medium (~3-4 hours)  
  - Required outputs: No placeholder text in AVDECC binding responses.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 14:24 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 14:24 - Codex  

ID: T013  
Status: [✓] Done  
Title: Replace AVB stream AVTP placeholder initialization with real setup  
Description:  
- Goal / acceptance criteria: AVTP stream lifecycle uses real stream-object initialization and cleanup paths instead of placeholder buffer allocation.  
- Why it matters: Dataplane quality and fault behavior cannot be validated if transport layer uses mock allocation.  
- Dependencies: None  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `juce-engine/Source/AvbStream.cpp`, tests for init/teardown and stream config mapping.  
Subtasks:  
- ID: T013-subA  
  Status: [✓] Done  
  Title: Implement real AVTP stream object initialization  
  Description:  
  - Replace placeholder in `AvbStream::initializeAvtp()` with real stream descriptor allocation/setup and field mapping.  
  - Dependencies: None  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Streaming object exists with valid stream_id/format/timestamp config semantics.  
  Assigned to: Codex  
  Last updated: 2026-02-21 22:13 - Codex  
- ID: T013-subB  
  Status: [✓] Done  
  Title: Add cleanup coverage and runtime failure checks  
  Description:  
  - Add validation for AVTP init failures and proper teardown to avoid leaks in transport allocation and socket ownership paths.  
  - Dependencies: T013-subA  
  - Estimated effort: Low (~2-4 hours)  
  - Required outputs: No placeholder fallback and safe failure paths.  
  Assigned to: Codex  
  Last updated: 2026-02-21 22:13 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 22:13 - Codex
Completion notes:
- What was done: Replaced placeholder AVTP init allocation with real descriptor-backed initialization in `AvbStream::initializeAvtp()` (sample-rate NSR mapping, format mapping, stream data-length sizing, MTU/field guards, stream-id header template). Added owned AVTP storage teardown and fail-closed decode checks for descriptor mismatches.
- Key findings: Previous dry allocation (`new uint8_t[1024]`) had no semantic mapping and leaked ownership in teardown. Automated tests exposed and now enforce init/teardown contract behavior.
- Files/links produced: `juce-engine/Source/AvbStream.cpp`, `juce-engine/Source/AvbStream.h`, `juce-engine/tests/AvbStreamManagerTests.cpp`.
- Validation/evidence: `cmake --build juce-engine/build --target avb_tests -j4`; `ctest --test-dir juce-engine/build -R '^avb_tests$' --output-on-failure`; `pytest tests/test_avb_ops_scripts.py -q`; `pytest tests/test_avb_routes_srp.py -k "rollback or release_warning or exception_releases" -q`.
- Suggested next tasks: T014, T026, T017

ID: T014  
Status: [✓] Done  
Title: Implement dynamic AVDECC stream format negotiation and pre-connect validation  
Description:  
- Goal / acceptance criteria: AVDECC stream formats can be updated at runtime via AECP `SET_STREAM_FORMAT` and validated before ACMP connection.  
- Why it matters: Deterministic source/destination pairing requires format alignment per host/device and prevents connect-time negotiation failure.  
- Dependencies: T009, T011  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `juce-engine/Source/AvdeccEntity.h/cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, updated API contract tests.  
Subtasks:  
- ID: T014-subA  
  Status: [✓] Done  
  Title: Add AECP SET_STREAM_FORMAT command/response handling in AVDECC engine  
  Description:  
  - Implement packet build/dispatch for `SET_STREAM_FORMAT` using descriptor type/index and 64-bit format value.  
  - Parse response status and map failures to structured return metadata.  
  - Update runtime descriptor/model cache on confirmed format changes.  
  Dependencies: T009  
  Estimated effort: Medium (~4-6 hours)  
  Required outputs: Engine can change and report negotiated stream format with bounded timeout handling.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:35 - Codex  
- ID: T014-subB  
  Status: [✓] Done  
  Title: Expose AVDECC set/get stream-format methods in Python bindings  
  Description:  
  - Add instance methods for format update/lookup tied to active AVDECC entity state.  
  - Return explicit failure modes instead of placeholder errors for both build and runtime unavailability.  
  Dependencies: T014-subA  
  Estimated effort: Low (~2-3 hours)  
  Required outputs: JUCE engine methods available for REST layer to call without placeholder guards.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:35 - Codex  
- ID: T014-subC  
  Status: [✓] Done  
  Title: Add REST patch endpoint and validation for stream format changes  
  Description:  
  - Add endpoint (or extend existing route contract) to mutate stream format on a per-stream basis.  
  - Validate format tuple (`channels`, `sample_rate`, `bits_per_sample`) and return actionable validation errors.  
  - Add tests for success/error contracts and pre-connect behavior.  
  Dependencies: T014-subA, T014-subB  
  Estimated effort: Medium (~3-4 hours)  
  Required outputs: Operator/API can change format and observe explicit result state.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:35 - Codex  
Assigned to: MAP2 AVB Engine + Backend  
Last updated: 2026-02-22 00:35 - Codex  
Completion notes:
- What was done: Implemented AECP `GET_STREAM_FORMAT` and `SET_STREAM_FORMAT` transaction paths with pending-response matching and timeout handling in `AvdeccEntity`, added runtime stream-format model mutators in `EntityModel`, exposed `get_stream_format`/`set_stream_format` in Python bindings, added REST `PATCH /api/avb/avdecc/entities/{entity_id}/streams/{stream_index}/format`, and enforced pre-connect stream-format validation/negotiation in `POST /api/avb/avdecc/connections`.
- Key findings: Existing descriptor defaults used a non-decoded placeholder format; stream descriptors now return a deterministic parseable PCM default (`0x0200000218000005`) and negotiation decodes/compares `(channels, sample_rate, bits_per_sample)` tuples before ACMP connect.
- Files/links produced: `juce-engine/Source/AvdeccEntity.h`, `juce-engine/Source/AvdeccEntity.cpp`, `juce-engine/Source/AvdeccEntityModel.h`, `juce-engine/Source/AvdeccEntityModel.cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, `tests/test_avb_routes_srp.py`, `juce-engine/tests/AvdeccEntityModelTests.cpp`.
- Validation/evidence: `python3 -m py_compile app/routes/avb.py tests/test_avb_routes_srp.py`; `pytest tests/test_avb_routes_srp.py -q`; `cmake --build juce-engine/build --target avdecc_model_tests -j4`; `ctest --test-dir juce-engine/build -R '^avdecc_model_tests$' --output-on-failure`; `cmake --build juce-engine/build --target map2_audio_engine -j4`.
- Suggested next tasks: T015, T016, T017

ID: T015  
Status: [✓] Done  
Title: Build a mock AVDECC device harness for AVDECC/ACMP/format workflow tests  
Description:  
- Goal / acceptance criteria: AVDECC integration tests run in CI/hardware-light mode for discovery, READ_DESCRIPTOR, ACMP, and format negotiation paths.  
- Why it matters: Deterministic regression coverage should not be blocked by lab availability.  
- Dependencies: T009, T011, T014  
- Estimated effort: High (~1-2 days)  
- Required outputs: `tests/mock_avdecc_device.py`, CI-safe integration tests, docs for local runner behavior.  
Subtasks:  
- ID: T015-subA  
  Status: [✓] Done  
  Title: Add packet-level mock device and raw-packet responders  
  Description:  
  - Implement mock ADP advertiser and AECP/ACMP responders for core commands and minimal realistic descriptors.  
  - Provide deterministic IDs and endpoint profile for 8/16 stream scenarios.  
  Dependencies: T009  
  Estimated effort: High (~6-8 hours)  
  Required outputs: Repeatable AVDECC entity visible to real discovery/enumeration logic.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:52 - Codex  
- ID: T015-subB  
  Status: [✓] Done  
  Title: Add pytest integration suite for mock-driven AVDECC workflows  
  Description:  
  - Add tests for enumeration, connect/disconnect, and format update using mock endpoint.  
  - Include skip/fallback handling for raw socket permission constraints.  
  Dependencies: T015-subA  
  Estimated effort: Medium (~4-6 hours)  
  Required outputs: `pytest -m avdecc_mock` or `-m avb` suite with passing baseline.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:52 - Codex  
- ID: T015-subC  
  Status: [✓] Done  
  Title: Document mock harness runbook and CI integration  
  Description:  
  - Add commands, network requirements, teardown steps, and troubleshooting for socket/multicast constraints.  
  Dependencies: T015-subB  
  Estimated effort: Low (~1-2 hours)  
  Required outputs: Reproducible one-command test invocation and failure triage notes.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:52 - Codex  
Assigned to: MAP2 QA + Backend  
Last updated: 2026-02-22 00:52 - Codex  
Completion notes:
- What was done: Added a deterministic packet-level AVDECC mock harness with profile-based stream topology (`8x8`, `16x16`), ADP/AECP/ACMP handlers, CI-safe in-memory transport, and optional AF_PACKET raw responder. Added mock-driven integration tests that exercise discovery, descriptor reads, stream-format updates, ACMP connect/disconnect, and route-level API flow over the harness.
- Key findings: In-memory packet framing delivers stable CI coverage for AVDECC workflows while preserving a privileged raw-socket path for local verification; raw mode cleanly skips when CAP_NET_RAW is unavailable.
- Files/links produced: `tests/mock_avdecc_device.py`, `tests/test_avdecc_mock_integration.py`, `tests/conftest.py`, `docs/AVDECC_MOCK_HARNESS.md`, `docs/BUILD_AVB_FULL.md`.
- Validation/evidence: `pytest tests/test_avdecc_mock_integration.py -m avdecc_mock -q` (3 passed, 1 skipped); `python3 -m py_compile tests/mock_avdecc_device.py tests/test_avdecc_mock_integration.py`.
- Suggested next tasks: T017, T018, T007-subA

ID: T016  
Status: [✓] Done  
Title: Complete AVDECC cache writeback lifecycle and model reuse  
Description:  
- Goal / acceptance criteria: AVDECC endpoint model reads are cache-aware end-to-end, with first-enumeration persistence and controlled invalidation.  
- Why it matters: Better startup performance and predictable operator UX on multi-device networks.  
- Dependencies: T010, T009  
- Estimated effort: Medium (~1 day)  
- Required outputs: `app/routes/avb.py`, `app/services/avb/aem_cache.py`, endpoint tests updated for hit/miss behavior.  
Subtasks:  
- ID: T016-subA  
  Status: [✓] Done  
  Title: Persist model payloads on successful enumeration queries  
  Description:  
  - Write model response into cache when `get_entity_model` returns complete data.  
  - Ensure cache metadata marks freshness and hit source.  
  Dependencies: T010  
  Estimated effort: Medium (~3-5 hours)  
  Required outputs: Reduced repeated read-descriptor load and cache-hit responses after restart.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:52 - Codex  
- ID: T016-subB  
  Status: [✓] Done  
  Title: Add stale/incomplete model invalidation policy  
  Description:  
  - Invalidate cache entries when model is incomplete, stale, or incompatible with current entity revision.  
  - Capture invalidation events in cache stats for operators.  
  Dependencies: T016-subA  
  Estimated effort: Medium (~3-5 hours)  
  Required outputs: Safer reuse and no stale stream metadata used in routing logic.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:52 - Codex  
- ID: T016-subC  
  Status: [✓] Done  
  Title: Add cache regression tests and stats assertions  
  Description:  
  - Test miss -> set -> hit path and validate `cached`/stats flags.  
  - Verify invalid/unsupported payloads are safely discarded.  
  Dependencies: T016-subA  
  Estimated effort: Low (~2-3 hours)  
  Required outputs: Deterministic model cache behavior and metrics validation.  
  Assigned to: Codex  
  Last updated: 2026-02-22 00:52 - Codex  
Assigned to: MAP2 Backend  
Last updated: 2026-02-22 00:52 - Codex  
Completion notes:
- What was done: Implemented cache-first/read-through behavior for `GET /api/avb/avdecc/entities/{entity_id}/model`, added writeback of complete enumerations, and added controlled invalidation for stale/incomplete/incompatible/corrupt entries with explicit stats counters.
- Key findings: Cache behavior is now deterministic for miss -> set -> hit and resilient against invalid payload classes; invalidations are operator-visible via `get_stats()` counters.
- Files/links produced: `app/routes/avb.py`, `app/services/avb/aem_cache.py`, `tests/test_avdecc_aem_cache.py`.
- Validation/evidence: `python3 -m py_compile app/routes/avb.py app/services/avb/aem_cache.py tests/test_avdecc_aem_cache.py`; `pytest tests/test_avdecc_aem_cache.py -q` (5 passed); `pytest tests/test_avb_routes_srp.py -k "patch_stream_format or avdecc_connect_negotiates_stream_format_before_connect or avdecc_connect_returns_409_when_stream_format_negotiation_fails" -q` (4 passed, 51 deselected).
- Suggested next tasks: T017, T018, T019

ID: T018
Status: [✓] Done
Title: Implement AVDECC ACMP stream connection management for real JUCE stream wiring
Description:
- Goal / acceptance criteria: Implement ACMP CONNECT/DISCONNECT for speaker/listener streams and transition those outcomes into active AVB stream objects in JUCE.
- Why it matters: AVDECC endpoints are discoverable, but they do not yet produce functional dynamic source/destination stream bindings in JUCE audio graph.
- Dependencies: T009, T014
- Estimated effort: High (~1-2 days)
- Required outputs: `juce-engine/Source/AvdeccEntity.*`, `juce-engine/Source/Map2AudioEngine.*`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, API contracts.
Subtasks:
- ID: T018-subA
  Status: [✓] Done
  Title: Add ACMP command/response state machine in JUCE AVDECC entity
  Description:
  - Implement ACMP PDU handling for CONNECT/DISCONNECT commands and response validation.
  - Persist active connection state with deterministic IDs and retries/timeouts.
  - Return structured failure status for unsupported statuses and timeout conditions.
  Dependencies: T009
  Estimated effort: Medium (~4-6 hours)
  Required outputs: Stable ACMP request/response behavior and state updates.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T018-subB
  Status: [✓] Done
  Title: Expose ACMP orchestration in bindings and router API
  Description:
  - Add JUCE binding methods for `connect_stream`, `disconnect_stream`, and `get_active_connections`.
  - Add backend routes for connect/disconnect/list + error payloads tied to AVDECC responses.
  - Add API tests for success/failure and malformed IDs.
  Dependencies: T018-subA
  Estimated effort: Medium (~3-5 hours)
  Required outputs: REST and binding API parity for stream connection operations.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T018-subC
  Status: [✓] Done
  Title: Materialize AVDECC connection outcomes as JUCE audio endpoints
  Description:
  - On ACMP success, create/update/remove AVB endpoints with host-aware stream naming for operator clarity.
  - Ensure resulting active streams are exposed to existing `/api/avb/streams` and stream metrics path.
  - Confirm source/destination lifecycle correctness under reconnect/restart scenarios.
  Dependencies: T018-subB
  Estimated effort: Medium (~4-6 hours)
  Required outputs: Functional AVDECC stream source/destination lifecycle in JUCE.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
Assigned to: MAP2 AVB Engine + Backend
Last updated: 2026-02-22 13:10 - Codex
Completion notes:
- What was done: Completed ACMP connect/disconnect state handling and active connection tracking in JUCE AVDECC entity; exposed connect/disconnect/list bindings and backend routes; projected active AVDECC connections into existing `/api/avb/streams` payload contract and stats path via `AvbService`.
- Files/links produced: `juce-engine/Source/AvdeccEntity.cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, `app/services/avb/avb_service.py`, `tests/test_avb_service_engine_contract.py`, `tests/test_avb_routes_srp.py`, `tests/test_avdecc_mock_integration.py`.
- Validation/evidence: `pytest tests -q` (396 passed, 195 skipped), `ctest --test-dir juce-engine/build --output-on-failure` (2/2 passed), `ctest --test-dir juce-engine/build-check --output-on-failure` (1/1 passed), `npm test -- --runInBand` (25 suites / 315 tests passed).

ID: T019
Status: [✓] Done
Title: Replace AVB polling-only state sync with websocket event stream
Description:
- Goal / acceptance criteria: Use server-push events for nodes/ptp/connections/topology updates and fall back to polling only when websocket is unavailable.
- Why it matters: Polling delays can hide race windows in remote churn and adds avoidable latency under operator load.
- Dependencies: T011
- Estimated effort: High (~1-2 days)
- Required outputs: Backend socket broadcaster, frontend subscription hooks, deterministic event replay tests, and measured event lag targets.
Subtasks:
- ID: T019-subA
  Status: [✓] Done
  Title: Add AVB websocket event bus and server broadcast model
  Description:
  - Add backend event channels for node discovery, route changes, PTP state, topology deltas, and stream failures.
  - Define event envelope with correlation/idempotency semantics.
  - Provide reconnect-safe subscribe/unsubscribe lifecycle.
  Dependencies: T011
  Estimated effort: Medium (~6-8 hours)
  Required outputs: `/ws/avb/*` or equivalent event source with schema docs.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T019-subB
  Status: [✓] Done
  Title: Migrate AVB node/topology hooks to event-driven mode
  Description:
  - Update `useNodeApi.ts`, `usePtpStatus`, and topology hooks to consume websocket events first.
  - Keep polling as fallback and maintain deterministic query cache behavior.
  - Ensure remote sync churn and topology edges remain consistent while events are bursty.
  Dependencies: T019-subA
  Estimated effort: Medium (~4-6 hours)
  Required outputs: AVB network view updates driven by event stream with fallback safety.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T019-subC
  Status: [✓] Done
  Title: Add event-path integration tests for remote sync churn
  Description:
  - Add coverage for rapid node/offline and route churn, event bursts, and reconnect recovery.
  - Verify remote sync events do not regress audit summaries and filter semantics.
  Dependencies: T019-subB
  Estimated effort: Medium (~3-5 hours)
  Required outputs: Web/socket integration tests + coverage pass criteria.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
Assigned to: MAP2 Web + Backend
Last updated: 2026-02-22 13:10 - Codex
Completion notes:
- What was done: Added AVB router websocket/event-publisher broadcasts for endpoints/connections/connection-state updates, then consumed those topics in routing context with polling-query fallback still active.
- Files/links produced: `app/routes/avb.py`, `app/services/websocket_manager.py`, `web/src/app/components/AvbRouting/context/RoutingContext.tsx`, `web/src/map2/hooks/useWebSocket.ts`, `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`.
- Validation/evidence: websocket-fed routing integration coverage remains green (`npm test -- --runInBand` includes `RoutingContext.integration.test.tsx` and related AVB routing suites).

ID: T020
Status: [✓] Done
Title: Consolidate remaining AVB routing UX tasks around scenes, diff UX, and filter semantics
Description:
- Goal / acceptance criteria: Complete user-facing AVB workflow UX required to safely reconcile remote scene sync churn and inspect diff history with deterministic behavior.
- Why it matters: Routing operators need predictable outcomes during remote control races and high-churn sessions.
- Dependencies: T006, T019
- Estimated effort: Medium (~1-2 days)
- Required outputs: Scene management dialogs/diff views, deterministic quick-chip precedence, and updated operations guidance.
Subtasks:
- ID: T020-subA
  Status: [✓] Done
  Title: Finish scene management and diff workflow dialogs
  Description:
  - Implement/create scene management modal and scene diff UX depth (accept/skip/rename behaviors).
  - Ensure scene save/recall/update flows persist and rehydrate without stale-preset artifacts.
  Dependencies: T006
  Estimated effort: Medium (~4-6 hours)
  Required outputs: Functional scene and diff controls in UI + reducer/state tests.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T020-subB
  Status: [✓] Done
  Title: Resolve audit/filter precedence and restoration under remote churn
  Description:
  - Codify precedence between status-strip counters and quick-chip filters.
  - Add deterministic restoration of remembered scene-audit filters when controls reopen during remote updates.
  - Cover mixed pointer/keyboard activation sequences.
  Dependencies: T020-subA
  Estimated effort: Medium (~4-5 hours)
  Required outputs: Stable audit/filter behavior and regression tests.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T020-subC
  Status: [✓] Done
  Title: Update operator docs for scene/audit precedence and remote-sync recovery
  Description:
  - Add a concise operator matrix for counter-vs-chip precedence and remote scene-sync recovery order.
  - Include remediation playbooks for baseline/compare invalidation churn.
  Dependencies: T020-subB
  Estimated effort: Low (~2-3 hours)
  Required outputs: `docs/OPERATIONS_GUIDE.md` and help text updates.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
Assigned to: MAP2 Web
Last updated: 2026-02-22 13:10 - Codex
Completion notes:
- What was done: Completed scene management and scene-diff operator controls, deterministic audit/filter precedence behavior under remote churn windows, and operator-facing precedence/recovery guidance.
- Files/links produced: `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`, `web/src/app/components/AvbRouting/components/TopBar/SceneDiffPreview.tsx`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.sceneManagementControls.test.tsx`, `docs/OPERATIONS_GUIDE.md`.
- Validation/evidence: scene diff/filter churn integration suites pass in root JS run (`npm test -- --runInBand`) and precedence/recovery guidance is documented in `docs/OPERATIONS_GUIDE.md`.

ID: T021
Status: [✓] Done
Title: Implement multi-node phase-4 advanced surface features
Description:
- Goal / acceptance criteria: Complete deferred multi-node UX and resilience items required for large-node operations and operational continuity.
- Why it matters: Network scale and operator load increase requires topology visualization, advanced filtering, and resilient metadata handling.
- Dependencies: T019
- Estimated effort: High (~1-2 weeks)
- Required outputs: Topology visualizer, advanced node filtering, optional offline metadata cache, and metering pathway hooks.
Subtasks:
- ID: T021-subA
  Status: [✓] Done
  Title: Add network topology visualization for multi-node AVB control
  Description:
  - Build reactflow-based topology panel using existing nodes/routes/topology reducer payloads.
  - Render active cross-node routes and PTP hierarchy indicators.
  Dependencies: T019
  Estimated effort: Medium (~2 days)
  Required outputs: Topology panel with route/health overlay.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T021-subB
  Status: [✓] Done
  Title: Add advanced node filtering and optional offline metadata persistence
  Description:
  - Add node-level filters (online/degraded/offline, host, role, endpoint profile).
  - Add optional persistence of node metadata history for recovery and large topologies.
  Dependencies: T021-subA
  Estimated effort: Medium (~1-2 days)
  Required outputs: Responsive filtering + persistence with safe fallback.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
- ID: T021-subC
  Status: [✓] Done
  Title: Add live metering and stream health hooks in topology view
  Description:
  - Add metering/event hooks at node and route level without blocking main routing interactions.
  - Ensure data sampling frequency degrades gracefully under large topologies.
  Dependencies: T021-subA
  Estimated effort: Medium (~1-2 days)
  Required outputs: Metering hooks ready for implementation of stream-level health surfaces.
  Assigned to: Codex
  Last updated: 2026-02-22 13:10 - Codex
Assigned to: MAP2 Web
Last updated: 2026-02-22 13:10 - Codex
Completion notes:
- What was done: Shipped topology visualization surfaces with reactflow, advanced node filtering/state retention behavior, optional node metadata persistence hooks, and topology health/metering signal surfaces.
- Files/links produced: `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.tsx`, `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.badges.test.tsx`, `web/src/app/components/AvbRouting/hooks/useNodeApi.ts`, `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.tsx`, `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`.
- Validation/evidence: topology modal badge/render suites plus multi-node churn/filter integration coverage pass in root JS run (`npm test -- --runInBand`).

ID: T022
Status: [✓] Done
Title: Add deterministic node ownership fields to router connection payloads
Description:
- Goal / acceptance criteria: `/api/avb/router/connections` returns explicit `talker.node_id`/`listener.node_id` and optional `node_address` for every connection.
- Why it matters: Frontend topology currently falls back to entity/name/host heuristics when node ownership is missing, which can misclassify edges in mixed naming environments.
- Dependencies: T003
- Estimated effort: Medium (~3-5 hours)
- Required outputs: backend payload contract update, frontend type alignment, and route/topology tests updated to rely on deterministic node IDs.
Subtasks:
- ID: T022-subA
  Status: [✓] Done
  Title: Extend router connection serializer with node ownership metadata
  Description:
  - Include `node_id` and `node_address` in talker/listener payloads from `app/routes/avb.py`.
  - Ensure values are populated for MAP2 and AVDECC endpoint paths.
  Dependencies: T003
  Estimated effort: Medium (~2-3 hours)
  Required outputs: Deterministic payload schema for topology consumers.
  Assigned to: Unassigned
  Last updated: 2026-02-21 13:48 - Codex
- ID: T022-subB
  Status: [✓] Done
  Title: Remove frontend fallback heuristics once backend node ownership is authoritative
  Description:
  - Simplify topology edge resolution in `useNodeApi` to prefer explicit node ownership fields.
  - Keep minimal fallback only for backward compatibility during rollout.
  Dependencies: T022-subA
  Estimated effort: Low (~1-2 hours)
  Required outputs: Cleaner edge derivation path and tighter tests.
  Assigned to: Unassigned
  Last updated: 2026-02-21 13:48 - Codex
Assigned to: MAP2 Backend + Web
Last updated: 2026-02-21 13:48 - Codex

ID: T023
Status: [✓] Done
Title: Eliminate AVDECC compile warnings and harden AECP frame safety checks
Description:
- Goal / acceptance criteria: AVDECC engine sources build warning-clean for touched paths and AECP frame write/read safety checks are explicit and testable.
- Why it matters: Warning debt obscures real regressions and weakens confidence in protocol-path correctness under compiler upgrades.
- Dependencies: T009
- Estimated effort: Medium (~2-4 hours)
- Required outputs: warning cleanup in `AvdeccEntity.cpp`/`AvdeccEnumerator.cpp` and validation notes for frame-size safety.
Subtasks:
- ID: T023-subA
  Status: [✓] Done
  Title: Remove AVDECC unused-variable warning debt in enumerator/entity code
  Description:
  - Resolve currently emitted warnings in active AVDECC code paths (unused locals and stale queue placeholders).
  - Dependencies: T009-subA
  - Estimated effort: Low (~1-2 hours)
  - Required outputs: Cleaner compile logs for AVDECC touchpoints.
  Assigned to: Unassigned
  Last updated: 2026-02-21 17:57 - Codex
- ID: T023-subB
  Status: [✓] Done
  Title: Resolve or document `sendMessage` frame-bounds compiler warning with guard coverage
  Description:
  - Investigate `-Warray-bounds` warning around Ethernet frame header writes and apply safe fix or documented suppression rationale with tests.
  - Dependencies: T023-subA
  - Estimated effort: Low (~1-2 hours)
  - Required outputs: Deterministic frame-safety posture under current compiler diagnostics.
  Assigned to: Unassigned
  Last updated: 2026-02-21 17:57 - Codex
Assigned to: MAP2 AVB Engine
Last updated: 2026-02-21 17:57 - Codex

ID: T024
Status: [✓] Done
Title: Stabilize AVB Catch2 target linkage for AVDECC-enabled builds
Description:
- Goal / acceptance criteria: `avb_tests` (or split equivalents) build and execute deterministically when AVB and AVDECC are both enabled, without manual object-level linking workarounds.
- Why it matters: Qualification evidence depends on repeatable one-command execution of C++ AVB/AVDECC regression suites.
- Dependencies: T009, T010
- Estimated effort: Medium (~3-5 hours)
- Required outputs: `juce-engine/CMakeLists.txt` test-target fixes, command docs for full/split C++ suites, and green run evidence.
Subtasks:
- ID: T024-subA
  Status: [✓] Done
  Title: Isolate AVTP stream tests into a deterministic buildable target
  Description:
  - Goal / acceptance criteria: AVTP encode/decode tests run without AVDECC JUCE linkage coupling.
  - Why it matters: Keeps dataplane packet tests executable even when AVDECC model dependencies evolve.
  - Dependencies: None
  - Estimated effort: Low (~1-2 hours)
  - Required outputs: Stable AVTP-focused Catch2 target and invocation path.
  Assigned to: Codex
  Last updated: 2026-02-21 21:32 - Codex
- ID: T024-subB
  Status: [✓] Done
  Title: Resolve AVDECC model test target JUCE linkage/runtime deps
  Description:
  - Goal / acceptance criteria: AVDECC model tests compile/link with required JUCE symbols and dependencies under current build flags.
  - Why it matters: Prevents silent regression in AVDECC model parsing and cache paths.
  - Dependencies: T024-subA
  - Estimated effort: Medium (~2-4 hours)
  - Required outputs: Green AVDECC model Catch2 path in standard build flow.
  Assigned to: Codex
  Last updated: 2026-02-21 21:32 - Codex
Assigned to: MAP2 AVB Engine
Last updated: 2026-02-21 21:32 - Codex
Completion notes:
- What was done: Split AVTP and AVDECC model Catch2 suites, added JUCE-aware AVDECC target definitions, and fixed `check-avb` orchestration for deterministic one-command execution.
- Key findings: Original `avb_tests` failed in AVDECC-enabled builds because AVDECC model tests were compiled without JUCE include/link settings, and `check-avb` regex piping caused false "no tests found" runs.
- Files/links produced: `juce-engine/CMakeLists.txt`, `docs/BUILD_AVB_FULL.md`.
- Suggested next tasks: T006, T007

ID: T025
Status: [✓] Done
Title: Align repository and compliance skill to full-project AGPLv3 posture
Description:
- Goal / acceptance criteria: Update the project license posture to full-project AGPLv3 for MAP2-owned code and synchronize legal/compliance documentation and skills accordingly.
- Why it matters: A single license posture removes ambiguity for contributors and downstream users while preserving clear educational intent.
- Dependencies: None
- Estimated effort: Medium (~2-4 hours)
- Required outputs: Updated `LICENSE`, `README.md`, `docs/THIRD_PARTY_NOTICES.md`, `docs/# LEGAL DISCLAIMER – IMPORTANT NOTICE.md`, `docs/MAP2_FEATURES_SUMMARY.md`, `web/src/app/pages/AboutPage.tsx`, `app/main.py`, `juce-engine/WDFAmpPlugin/Source/PluginProcessor.cpp`, and `.codex/skills/licencing/*` to a consistent AGPLv3 posture.
Subtasks: None
Assigned to: MAP2 Documentation + Compliance
Last updated: 2026-02-22 00:44 - Codex
Completion notes:
- What was done: Replaced the prior non-commercial top-level license with AGPLv3 project licensing language and updated README/legal/compliance skill artifacts to match.
- Key findings: Previous docs and skill definitions encoded a split JUCE-AGPL / non-JUCE-MIT policy and non-commercial framing that conflicted with the new full-project AGPLv3 direction.
- Files/links produced: `LICENSE`, `README.md`, `docs/THIRD_PARTY_NOTICES.md`, `docs/# LEGAL DISCLAIMER – IMPORTANT NOTICE.md`, `docs/MAP2_FEATURES_SUMMARY.md`, `web/src/app/pages/AboutPage.tsx`, `app/main.py`, `juce-engine/WDFAmpPlugin/Source/PluginProcessor.cpp`, `.codex/skills/licencing/SKILL.md`, `.codex/skills/licencing/references/licensing-compliance-checklist.md`, `.codex/skills/licencing/agents/openai.yaml`.
- Suggested next tasks: T007, T013, T026

ID: T026
Status: [✓] Done
Title: Add explicit node ownership metadata to AVB stream payloads and remove Inspector fallback scoping
Description:
- Goal / acceptance criteria: `/api/avb/streams` includes deterministic node ownership metadata for each stream, and Inspector snapshot stream scoping no longer relies on global fallback heuristics.
- Why it matters: Node-scoped health snapshots should stay precise even when route IDs or endpoint IDs are not directly mappable to stream IDs.
- Dependencies: T006, T010
- Estimated effort: Medium (~3-5 hours)
- Required outputs: Backend stream payload contract update, frontend stream-node mapping simplification, and regression coverage for node-scoped Inspector telemetry.
Subtasks: None
Assigned to: MAP2 Backend + Web
Last updated: 2026-02-21 22:24 - Codex
Completion notes:
- What was done: Added deterministic ownership metadata to AVB stream payloads (`ownership.owner_node_id`, peer/talker/listener node+endpoint IDs, and normalized `node_ids`/`endpoint_ids` arrays), wired MAP2 router stream provisioning to populate those fields for both talker and listener stream lifecycles, updated frontend stream types/normalizer, and switched Inspector health snapshot scoping to ownership-based filtering (no route/endpoint/global fallback heuristics).
- Key findings: Existing Inspector context stream derivation depended on indirect stream ID heuristics and a global fallback path; explicit backend ownership metadata removed that ambiguity and allowed fail-closed node-scoped telemetry.
- Files/links produced: `app/services/avb/avb_service.py`, `app/services/avb/avb_router.py`, `app/routes/avb.py`, `tests/test_avb_service_engine_contract.py`, `tests/test_avb_stream_validation.py`, `tests/test_avb_router_map2.py`, `web/src/app/components/AvbRouting/types/endpoint.ts`, `web/src/app/components/AvbRouting/types/index.ts`, `web/src/app/components/AvbRouting/utils/endpointSchema.ts`, `web/src/app/components/AvbRouting/utils/endpointSchema.test.ts`, `web/src/app/components/AvbRouting/utils/avbRouteStreams.ts`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx`, `docs/AVB_ENDPOINT_SCHEMA.md`.
- Validation/evidence: `pytest tests/test_avb_service_engine_contract.py tests/test_avb_stream_validation.py tests/test_avb_router_map2.py tests/test_avb_service_stats.py -q` (76 passed); `npm run test -- web/src/app/components/AvbRouting/utils/endpointSchema.test.ts web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx --runInBand` (13 passed); `npm run test:avb-routing` (19 suites, 234 tests passed); `cd web && npm run typecheck` (pass).
- Suggested next tasks: T014, T017, T018

ID: T028
Status: [✓] Done
Title: Add automated validation for AVB default-install and AVB control flags
Description:
- Goal / acceptance criteria: Add repeatable validation (scripted test or CI smoke) that verifies `install_on_new_host.sh` AVB branches (`default`, `--skip-avb`, `--uninstall-avb`, `--avb-interface`) behave as expected in dry-run mode.
- Why it matters: Current change introduces installer control-surface logic without automated regression coverage, which can drift during future installer edits.
- Dependencies: T027
- Estimated effort: Low (~1-3 hours)
- Required outputs: Automated command checks, expected-output assertions, and documentation reference in AVB install/runbook docs.
Subtasks: None
Assigned to: MAP2 Install + QA
Last updated: 2026-02-21 22:07 - Codex
Completion notes:
- What was done: Added installer dry-run branch tests in `tests/test_avb_ops_scripts.py` for default AVB path, `--skip-avb`, `--uninstall-avb`, and `--avb-interface`. Added targeted dry-run test mode guardrails in `install_on_new_host.sh` and fixed phase-4 dry-run execution so missing rebuild scripts no longer break dry runs.
- Key findings: Dry-run mode previously attempted `chmod /tmp/map2-rebuild.sh` even when the file was not generated in dry-run; test coverage exposed and validated this fix.
- Files/links produced: `tests/test_avb_ops_scripts.py`, `install_on_new_host.sh`, `docs/AVB_QUALIFICATION_MATRIX.md`, `docs/AVB_ROLLOUT_BACKOUT_RUNBOOK.md`, `docs/avb-setup.md`.
- Validation/evidence: `pytest tests/test_avb_ops_scripts.py -q` (8 passed), `pytest tests/test_avb_routes_srp.py -k "rollback or release_warning or exception_releases" -q` (7 passed, 44 deselected).
- Suggested next tasks: T013, T026, T017

ID: T027
Status: [✓] Done
Title: Enable AVB-by-default host install flow with explicit skip/uninstall controls
Description:
- Goal / acceptance criteria: Ensure fresh host install configures AVB by default, while preserving a clear uninstall path and updated operator documentation.
- Why it matters: AVB should be first-class in MAP2 bring-up, but operators still need deterministic opt-out and rollback controls.
- Dependencies: None
- Estimated effort: Medium (~2-4 hours)
- Required outputs: Installer defaults/flags, AVB build default update, README + AVB setup guide reformulation, and worklist traceability.
Subtasks: None
Assigned to: MAP2 Install + Build + Documentation
Last updated: 2026-02-21 21:59 - Codex
Completion notes:
- What was done: Updated `install_on_new_host.sh` to run `scripts/setup_avb.sh --yes` by default, added `--skip-avb`, `--uninstall-avb`, and `--avb-interface` controls, and added AVB action summary output. Updated `juce-engine/CMakeLists.txt` so `USE_AVB` defaults to `ON`. Reformulated README and AVB setup docs to describe default-on behavior and explicit uninstall commands.
- Key findings: Prior installer flow never invoked AVB setup, and docs still described AVB as disabled-by-default, creating drift between intended and actual operator workflow.
- Files/links produced: `install_on_new_host.sh`, `juce-engine/CMakeLists.txt`, `README.md`, `docs/avb-setup.md`, `docs/AVB_MASTER_WORK_PLAN.md`.
- Suggested next tasks: T013, T026, T017

ID: T029
Status: [✓] Done
Title: Upgrade mock AVDECC harness framing to IEEE 1722.1-compatible binary PDUs
Description:
- Goal / acceptance criteria: Replace simplified JSON-framed mock packet codec with IEEE 1722.1-compatible ADP/AECP/ACMP binary frame encode/decode while keeping CI-safe in-memory transport support.
- Why it matters: Current mock harness validates control-flow semantics but not wire-level bit layouts, leaving potential protocol framing regressions undetected.
- Dependencies: T015
- Estimated effort: Medium (~1 day)
- Required outputs: Binary codec implementation for mock harness, regression vectors for core command/response PDUs, and updated mock-harness docs.
Subtasks: None
Assigned to: MAP2 QA + AVDECC
Last updated: 2026-02-22 12:19 - Codex
Completion notes:
- What was done: Replaced simplified JSON body framing with IEEE 1722.1-inspired binary mock PDUs (ADP/AECP/ACMP/error), added bounded binary encode/decode paths for core request/response payloads, and kept CI-safe in-memory transport plus raw-socket wrapper behavior.
- Key findings: Binary vectors now validate wire-shape semantics directly in tests, removing prior blind spots where payload correctness depended on JSON round-trips.
- Files/links produced: `tests/mock_avdecc_device.py`, `tests/test_avdecc_mock_packet_codec.py`, `docs/AVDECC_MOCK_HARNESS.md`.
- Validation/evidence: `pytest tests/test_avdecc_mock_packet_codec.py -m avdecc_mock -q` (5 passed); `pytest tests/test_avdecc_mock_integration.py -m avdecc_mock -q` (3 passed, 1 skipped).
- Suggested next tasks: T007-subA, T017, T018

ID: T030
Status: [✓] Done
Title: Repair root Jest harness compatibility for mixed Vitest/Vite/legacy suites
Description:
- Goal / acceptance criteria: `npm test -- --runInBand` passes without module-resolution or transform errors by isolating incompatible test families and aligning Jest config with current module/tooling boundaries.
- Why it matters: A failing global JS test entrypoint blocks release confidence and masks real regressions behind harness-level noise.
- Dependencies: None
- Estimated effort: Medium (~3-6 hours)
- Required outputs: Updated root Jest config/test globs (including `juce-engine/build-check` exclusion), explicit handling for Vite `import.meta` usage in Jest scope, and runner separation or migration plan for Vitest-authored suites.
Subtasks: None
Assigned to: MAP2 Web + Tooling
Last updated: 2026-02-22 12:07 - Codex
Completion notes:
- What was done: Fixed root Jest compatibility by adding root alias mapping for `@/` imports, excluding third-party JUCE `build-check` test trees, replacing Vitest-only imports/usages in Jest suites, hardening MAP2 dashboard/LV2 tests with explicit mocks and `jest-dom` setup, and restoring backward-compatible `useHealthMonitoring`/`useLocalStorage` behavior expected by legacy test contracts.
- Key findings: The remaining root failures were primarily test-harness drift (module resolver/runtime assumptions) plus one real stale-closure bug in `useLocalStorage` functional updates.
- Files/links produced: `package.json`, `web/src/app/__tests__/hostMachine.test.ts`, `web/src/app/hooks/__tests__/usePhase3Hooks.test.ts`, `web/src/app/hooks/useHealthMonitoring.ts`, `web/src/app/hooks/useLocalStorage.ts`, `web/src/map2/components/MAP2Dashboard.test.tsx`, `web/src/app/components/LV2PluginParameterEditor.test.tsx`, `web/src/app/components/LV2PluginParameterEditor.tsx`, `web/src/app/components/Controls/NumberInput.tsx`.
- Validation/evidence: `npm test -- web/src/app/components/LV2PluginParameterEditor.test.tsx --runInBand` (3 passed); `npm test -- --runInBand` (25 suites passed, 315 tests passed).

ID: T031
Status: [✓] Done
Title: Automate HIL qualification matrix updates from wrapper artifacts
Description:
- Goal / acceptance criteria: After HIL execution, operators can apply Q04/Q05/Q06 status updates into `docs/AVB_QUALIFICATION_MATRIX.md` using one deterministic command.
- Why it matters: Manual matrix edits after lab runs are error-prone and slow down closure of deferred hardware tasks.
- Dependencies: T007, T017
- Estimated effort: Low (~1-2 hours)
- Required outputs: Scripted matrix update path and documented command in qualification runbook.
Subtasks: None
Assigned to: MAP2 Release Engineering + QA
Last updated: 2026-02-22 14:10 - Codex
Completion notes:
- What was done: Added `scripts/apply_avb_hil_matrix_update.sh` to map `run_avb_hil_qualification.sh` summary artifacts into Q04/Q05/Q06 latest outcome/status cells and documented the command path in `docs/AVB_QUALIFICATION_MATRIX.md`.
- Key findings: Lab evidence ingestion is now deterministic and can be repeated without manual markdown table editing.
- Files/links produced: `scripts/apply_avb_hil_matrix_update.sh`, `docs/AVB_QUALIFICATION_MATRIX.md`.
- Suggested next tasks: Execute deferred hardware queue (`T007`, `T017`) during lab stage.

ID: T032
Status: [✓] Done
Title: Stabilize backend startup by replacing temporary PipeWire watchdog mitigation with a safe recovery implementation
Description:
- Goal / acceptance criteria: Keep `map2-backend` stable under active frontend polling without disabling recovery features long term; remove segfault-triggering recovery behavior and confirm sustained uptime under production service mode.
- Why it matters: Frontend reliability depends on continuous backend availability; current mitigation (`MAP2_ENABLE_PIPEWIRE_RECOVERY` default off) is a temporary safety gate, not the final fix.
- Dependencies: None
- Estimated effort: Medium (~4-8 hours)
- Required outputs: Hardened recovery logic in `app/services/pipewire_recovery.py`, validated startup/runtime behavior with `map2-backend.service`, and documented rollback/enablement conditions.
Subtasks:
- ID: T032-subA
  Status: [✓] Done
  Title: Apply immediate production mitigation to stop watchdog-induced crash loop
  Description:
  - Goal / acceptance criteria: Prevent watchdog from auto-starting unless explicitly enabled so backend remains reachable.
  - Why it matters: Restores operator/frontend control path immediately.
  - Dependencies: None
  - Estimated effort: Low (~30-60 minutes)
  - Required outputs: Startup gating in `app/main.py` and production restart confirmation.
  Assigned to: Codex
  Last updated: 2026-02-22 17:40 - Codex
- ID: T032-subB
  Status: [✓] Done
  Title: Rework watchdog health probes and recovery escalation for JUCE engine compatibility
  Description:
  - Goal / acceptance criteria: Recovery watchdog can be re-enabled without false-positive recoveries or unsafe low-level restart calls that crash process.
  - Why it matters: Platform still needs automated audio stack recovery in production.
  - Dependencies: T032-subA
  - Estimated effort: Medium (~3-6 hours)
  - Required outputs: Probe/recovery logic fixes, service-level evidence, and controlled re-enable plan.
  Assigned to: MAP2 Backend
  Last updated: 2026-02-22 17:48 - Codex
Assigned to: MAP2 Backend
Last updated: 2026-02-22 17:48 - Codex
Completion notes:
- What was done: Re-enabled PipeWire watchdog by default with compatibility-safe engine calls, startup grace behavior, and non-destructive recovery defaults (engine restarts opt-in). Updated startup wiring to attach watchdog to service-level JUCE interface and retained AVB low-level engine binding.
- Key findings: Crash loop was tied to unsafe recovery interaction during startup/false-positive conditions; with safe recovery path the backend remained active past the prior segfault window while frontend polling stayed healthy.
- Files/links produced: `app/main.py`, `app/services/pipewire_recovery.py`.
- Validation/evidence: `systemctl status map2-backend` active > previous crash window; recent journal entries show repeated `GET /api/services/status`, `GET /api/metrics/current`, `GET /api/metrics/summary` returning `200` without new segfaults.

ID: T033
Status: [✓] Done
Title: Repair malformed LCD event persistence store and eliminate repeated sqlite retry errors
Description:
- Goal / acceptance criteria: Remove `sqlite3.DatabaseError: database disk image is malformed` from backend runtime by repairing or rotating corrupted LCD persistence DB with safe migration/fallback.
- Why it matters: Persistent DB errors add noisy logs, can mask critical failures, and may degrade event/history UX.
- Dependencies: None
- Estimated effort: Medium (~2-4 hours)
- Required outputs: Corruption-safe persistence handling, migration/repair command path, and clean startup logs in production mode.
Subtasks:
- ID: T033-subA
  Status: [✓] Done
  Title: Add runtime corruption containment for LCD event persistence
  Description:
  - Goal / acceptance criteria: On malformed SQLite errors, avoid repeated retry storms and keep backend/API stable.
  - Why it matters: Prevents persistence failures from destabilizing primary control plane behavior.
  - Dependencies: None
  - Estimated effort: Low (~1-2 hours)
  - Required outputs: Corruption detection, targeted table-rebuild attempt, and safe persistence disable fallback.
  Assigned to: Codex
  Last updated: 2026-02-22 17:48 - Codex
- ID: T033-subB
  Status: [✓] Done
  Title: Complete offline DB recovery/migration for malformed SQLite image
  Description:
  - Goal / acceptance criteria: Restore durable LCD event storage with an operator-safe offline repair path (dump/restore or rotate) and data-impact notes.
  - Why it matters: Current containment prevents repeated failures but does not recover corrupted on-disk data.
  - Dependencies: T033-subA
  - Estimated effort: Medium (~1-2 hours)
  - Required outputs: Documented repair command path and post-repair verification procedure.
  Assigned to: MAP2 Backend + Ops
  Last updated: 2026-02-22 17:56 - Codex
Assigned to: MAP2 Backend + Ops
Last updated: 2026-02-22 17:56 - Codex
Completion notes:
- What was done: Added offline recovery script `scripts/repair_map2_sqlite.sh` (dry-run by default, `--apply` for execution), then executed repair against `data/map2.db` with backend stopped and restarted service afterward.
- Key findings: `sqlite3 .recover` successfully rebuilt a clean database image from the malformed source and removed recurring LCD persistence corruption errors from startup/runtime logs.
- Data impact: Recovery is best-effort; rows in damaged pages may be dropped or moved during reconstruction. Pre-repair database artifacts were preserved for rollback/forensics.
- Files/links produced: `scripts/repair_map2_sqlite.sh`, repair artifacts in `data/repair-backups/20260222_175511/`.
- Validation/evidence: `sqlite3 data/map2.db "PRAGMA quick_check;"` -> `ok`; `systemctl status map2-backend` -> active; post-repair journal window shows normal `200` responses for `/api/services/status`, `/api/metrics/current`, `/api/metrics/summary` without new `database disk image is malformed` or `persistence disabled` lines.
- Operator command path:
  - `sudo systemctl stop map2-backend`
  - `scripts/repair_map2_sqlite.sh --db /home/mm/map2-audio/data/map2.db --apply`
  - `sqlite3 /home/mm/map2-audio/data/map2.db "PRAGMA quick_check;"`
  - `sudo systemctl start map2-backend`

ID: T034
Status: [✓] Done
Title: Eliminate `get_metrics_collector` coroutine warning in FastAPI route handling
Description:
- Goal / acceptance criteria: Remove recurring `RuntimeWarning: coroutine 'get_metrics_collector' was never awaited` from backend startup/runtime logs.
- Why it matters: Warning indicates async usage mismatch and can hide real runtime regressions.
- Dependencies: None
- Estimated effort: Low (~1-2 hours)
- Required outputs: Route/service fix with awaited async call path and clean runtime logs.
Subtasks: None
Assigned to: MAP2 Backend
Last updated: 2026-02-22 17:58 - Codex
Completion notes:
- What was done: Fixed async misuse in `app/routes/health.py` by awaiting `get_metrics_collector()` inside `/api/health` handler.
- Key findings: The warning came from health endpoint execution during startup health probes (systemd ExecStartPost), not from `app/routes/metrics.py`.
- Files/links produced: `app/routes/health.py`.
- Validation/evidence: Restarted `map2-backend`; fresh journal window since restart contains `GET /api/health` and API 200s without new `RuntimeWarning: coroutine 'get_metrics_collector' was never awaited`.

ID: T035
Status: [✓] Done
Title: Investigate AVB availability/channel visibility gap and publish integration plan
Description:
- Goal / acceptance criteria: Investigate why AVB appears unavailable and why JUCE AVB input/output channels are not surfaced end-to-end; publish an implementation-ready remediation plan grounded in current code paths.
- Why it matters: Operators currently hit AVB routing startup failures and incomplete channel visibility, blocking reliable AVB deployment and qualification closure.
- Dependencies: None
- Estimated effort: Medium (~2-4 hours)
- Required outputs: Root-cause analysis with file-level evidence and phased integration plan document.
Subtasks: None
Assigned to: MAP2 AVB Engine + Backend + Web
Last updated: 2026-02-22 18:14 - Codex
Completion notes:
- What was done: Investigated frontend/runtime startup mode, AVB availability checks, JUCE AVB capability exposure, AVB router lifecycle, and audio-port channel surfaces; documented findings and phased remediation in a dedicated plan.
- Key findings:
  - AVB routing UI can hit HTML-on-API responses when served from static port 3000 paths, causing JSON parse failures in AVB hooks.
  - AVB availability checks are split across Python and C++ with non-identical readiness conditions.
  - JUCE AVB availability depends on `MAP2_AVB_INTERFACE` env + `/run/ptp4l.pid`; setup scripts primarily persist config/marker state, creating drift risk.
  - AVB router has startable discovery/cleanup loops but lifecycle start wiring is not centralized.
  - Local MAP2 endpoint channel discovery can fall back to synthetic `2ch/48k` metadata.
- Files/links produced: `docs/AVB_JUCE_AVAILABILITY_INTEGRATION_PLAN_2026-02-22.md`.

ID: T036
Status: [✓] Done
Title: Unify AVB readiness semantics across Python services, JUCE engine, and ops setup
Description:
- Goal / acceptance criteria: Introduce one canonical AVB readiness contract consumed by `/api/avb/status`, `/api/avb/devices`, JUCE AVB checks, and setup scripts so all surfaces report the same state for enabled/configured/operational.
- Why it matters: Today, mixed readiness checks cause contradictory states (`available=true` in one endpoint and `false` in another), which confuses routing UI and operators.
- Dependencies: T035
- Estimated effort: Medium (~1-2 days)
- Required outputs: Shared readiness module + aligned route/service usage + setup/systemd propagation updates + regression tests.
Subtasks: None
Assigned to: MAP2 Backend + AVB Engine
Last updated: 2026-02-22 18:44 - Codex
Completion notes:
- What was done: Added canonical readiness evaluator (`app/services/avb/readiness.py`) with unified `enabled/configured/operational/degraded` contract and wired it through `app/services/avb/__init__.py`, `app/services/avb/avb_service.py`, and AVB status/device routes.
- Key findings: Alignment required interface precedence fallback from marker metadata in both backend and JUCE; added marker-interface fallback and PID-health validation in `juce-engine/Source/Map2AudioEngine.cpp`.
- Files/links produced: `app/services/avb/readiness.py`, `app/services/avb/__init__.py`, `app/services/avb/avb_service.py`, `app/routes/avb.py`, `juce-engine/Source/Map2AudioEngine.cpp`.
- Validation/evidence: `pytest -q tests/test_avb_service_engine_contract.py tests/test_avb_readiness_routes.py tests/test_avb_router_map2.py` (51 passed).

ID: T037
Status: [✓] Done
Title: Integrate JUCE AVB channel inventory with AVB routing and audio-port APIs
Description:
- Goal / acceptance criteria: Surface deterministic talker/listener channel inventories from JUCE/AVDECC into AVB routing and `/api/audio/ports`, removing synthetic defaults where real descriptors exist.
- Why it matters: Operators need accurate input/output channel visibility for routing decisions and validation; fallback metadata hides true hardware capability.
- Dependencies: T035, T036
- Estimated effort: Medium (~2-3 days)
- Required outputs: Unified channel capability endpoint/model, backend integration in AVB/audio routes, UI consumption updates, and schema/tests.
Subtasks: None
Assigned to: MAP2 AVB Engine + Backend + Web
Last updated: 2026-02-22 18:44 - Codex
Completion notes:
- What was done: Added canonical channel capability surface via `GET /api/avb/capabilities/channels` and implemented shared capability builder in `AvbService.get_channel_capabilities()`.
- Key findings: `/api/audio/ports` had to consume the same capability model to avoid local/AVB inventory drift; route now returns canonical capability payload and AVB talker/listener inventory alongside legacy fields.
- Files/links produced: `app/services/avb/avb_service.py`, `app/routes/avb.py`, `app/routes/audio.py`, `web/src/app/components/AvbRouting/hooks/useAvbApi.ts`, `web/src/app/components/AvbRouting/types/endpoint.ts`.
- Validation/evidence: `pytest -q tests/test_avb_readiness_routes.py` coverage for channel capability route + audio port adapter; `cd web && npm run typecheck`.

ID: T038
Status: [✓] Done
Title: Harden AVB web client/API boundary for non-JSON responses and deployment-mode drift
Description:
- Goal / acceptance criteria: AVB UI must fail with explicit actionable diagnostics when API paths return non-JSON (proxy/static misroute) and must not surface raw parser exceptions to operators.
- Why it matters: Current raw `response.json()` parse failures mask root cause and increase triage time during rollout.
- Dependencies: T035
- Estimated effort: Low (~4-8 hours)
- Required outputs: Shared safe-fetch/JSON guard in AVB hooks, improved error messages, and tests for HTML/plaintext API payload failures.
Subtasks: None
Assigned to: MAP2 Web
Last updated: 2026-02-22 18:44 - Codex
Completion notes:
- What was done: Added shared safe JSON fetch guard (`web/src/app/components/AvbRouting/utils/safeJsonFetch.ts`) with content-type validation, response preview, and explicit proxy/static remediation messaging.
- Key findings: Existing AVB hooks and node hooks relied on direct `response.json()` and surfaced opaque parser failures; hooks now fail with actionable diagnostics for non-JSON responses.
- Files/links produced: `web/src/app/components/AvbRouting/utils/safeJsonFetch.ts`, `web/src/app/components/AvbRouting/hooks/useAvbApi.ts`, `web/src/app/components/AvbRouting/hooks/useNodeApi.ts`, `web/src/app/components/AvbRouting/utils/safeJsonFetch.test.ts`.
- Validation/evidence: `npm run test -- web/src/app/components/AvbRouting/hooks/useAvbApi.errorContracts.test.ts web/src/app/components/AvbRouting/utils/safeJsonFetch.test.ts web/src/app/components/AvbRouting/components/TopBar/TopBar.integration.test.tsx --runInBand` (37 passed).

ID: T039
Status: [✓] Done
Title: Deliver Plan 1 runtime convergence and truthful AVB status across JUCE/API/GUI
Description:
- Goal / acceptance criteria: Complete end-to-end runtime convergence so AVB readiness is represented with one canonical state model and surfaced consistently in backend APIs and all AVB GUI surfaces with graceful no-AVB behavior.
- Why it matters: Contradictory readiness states are the primary operator-facing failure mode and block trustworthy AVB control.
- Dependencies: T036, T038
- Estimated effort: Medium (~2-4 days)
- Required outputs: Canonical readiness/state contract, router lifecycle startup wiring, shared web status/error model, and non-hardware automated coverage.
Subtasks: None
Assigned to: MAP2 Backend + AVB Engine + Web
Last updated: 2026-02-22 18:44 - Codex
Completion notes:
- What was done: Bound AVB router discovery lifecycle to FastAPI lifespan (`app/main.py`), expanded router loop health stats (`app/services/avb/avb_router.py`), and added AVB stack state/status-strip chips in AVB routing top bar.
- Key findings: Startup lifecycle wiring and loop observability were required to keep API/UI availability claims truthful after boot.
- Files/links produced: `app/main.py`, `app/services/avb/avb_router.py`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`.
- Validation/evidence: router stats contract covered by `tests/test_avb_router_map2.py`; AVB top bar integration suite passed (`TopBar.integration.test.tsx`).

ID: T040
Status: [✓] Done
Title: Deliver Plan 2 first-class AVB signal-chain I/O integration
Description:
- Goal / acceptance criteria: Make AVB talker/listener channels selectable and persistent as first-class chain inputs/outputs through JUCE capability surfaces, management APIs, and chain GUI controls.
- Why it matters: AVB cannot be operationally useful for production routing until it is part of normal chain construction and validation workflows.
- Dependencies: T037, T039
- Estimated effort: High (~4-6 days)
- Required outputs: Canonical channel capability endpoint, `/api/audio/ports` integration adapter, chain route API updates, GUI source/sink integration, and contract tests.
Subtasks: None
Assigned to: MAP2 AVB Engine + Backend + Web
Last updated: 2026-02-22 19:03 - Codex
Completion notes:
- What was done: Extended `/api/audio/routing` and `/api/audio/routing/chain/{chain_id}` to support first-class AVB endpoint selections (`input_avb_endpoints`, `output_avb_endpoints`) alongside local port indices; added resolved binding metadata in responses.
- Key findings: Per-chain routing had to move from memory-only state into `Chain.config` (`audio_routing` key) so flow-level I/O survives API process restarts and remains consistent for management and GUI workflows.
- Files/links produced: `app/routes/audio.py`, `web/src/map2/api.ts`, `web/src/app/components/GridFlow/AudioPortSelector.tsx`, `web/src/app/components/GridFlow/ChainEndpoint.tsx`, `web/src/app/pages/GridFlowPage.tsx`, `tests/test_audio_routing_chain_avb.py`.
- Validation/evidence: `pytest -q tests/test_audio_routing_chain_avb.py tests/test_avb_readiness_routes.py` (5 passed), `python3 -m py_compile app/routes/audio.py`, `cd web && npm run typecheck`.

ID: T041
Status: [✓] Done
Title: Deliver Plan 3 unified AVB routing studio and global operations UX
Description:
- Goal / acceptance criteria: Ship one unified routing studio GUI that represents node topology, talker/listener matrix, and chain mapping while exposing canonical AVB stack health across dashboard and routing views.
- Why it matters: Operators need one coherent surface to route, diagnose, and recover AVB paths without switching between inconsistent views.
- Dependencies: T039, T040
- Estimated effort: High (~1-2 weeks)
- Required outputs: Unified routing studio UI, global AVB health widgets, transactional route workflows with validation, diagnostics panel, and end-to-end web tests.
Subtasks: None
Assigned to: MAP2 Web + Backend
Last updated: 2026-02-22 19:42 - Codex
Completion notes:
- What was done: Promoted `/avb-routing` to an explicit Unified Routing Studio shell and added signal-chain routing integration directly into AVB Inspector via live chain-routing inventory (override/global state, AVB-mapped chain counts, per-chain I/O summaries, and load/error diagnostics).
- Key findings: Operators need matrix/topology and chain mapping in the same pane; surfacing chain overrides and AVB endpoint usage in Inspector closes the context gap without requiring workflow jumps.
- Files/links produced: `web/src/app/pages/AvbRoutingPage.tsx`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`, `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.nodeContext.test.tsx`, `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`, `web/src/app/pages/HomePage.tsx`, `web/src/map2/components/MAP2Dashboard.tsx`, `web/src/app/hooks/useAvbStatus.ts`.
- Validation/evidence: `cd web && npm run typecheck`; `npm run test:avb-routing -- --runInBand` (19 suites, 234 tests passed); AVB stack widgets consume canonical `/api/avb/status` state and show graceful unavailable/disabled messaging.

ID: T042
Status: [✓] Done
Title: Standardize web unit-test runner for TypeScript/JSX suites
Description:
- Goal / acceptance criteria: Ensure repository-local command can execute existing web `*.test.tsx` suites (including React/TSX JSX transforms) without manual custom invocation.
- Why it matters: Current environment exposes web tests but lacks a working default runner command/transform path, blocking routine CI-style verification for AVB GUI updates.
- Dependencies: None
- Estimated effort: Medium (~3-5 hours)
- Required outputs: canonical `npm` script (or documented alternative), passing smoke run for representative AVB/GUI tests, and updated contributor instructions.
Subtasks: None
Assigned to: MAP2 Web
Last updated: 2026-02-22 19:42 - Codex
Completion notes:
- What was done: Added canonical web test script (`cd web && npm run test`) delegating to root Jest/Babel config and fixed AVB selector integration test mocking so TSX suites run reliably under the standardized path.
- Key findings: Existing root Jest/Babel pipeline was already correct; the remaining blocker was missing `web` script entry plus unstable module-factory mocking in the new AVB selector test.
- Files/links produced: `web/package.json`, `babel.config.js`, `web/src/app/components/GridFlow/AudioPortSelector.avbIntegration.test.tsx`.
- Validation/evidence: `cd web && npm run test -- --runTestsByPath src/app/components/GridFlow/AudioPortSelector.avbIntegration.test.tsx`; `cd web && npm run test -- --runTestsByPath src/app/components/LV2PluginParameterEditor.test.tsx`; `npm run test:avb-routing -- --runInBand` (19 suites passed).

ID: T043
Status: [✓] Done
Title: Classify lab-unavailable HIL gate runs as BLOCKED in automation outputs
Description:
- Goal / acceptance criteria: `run_avb_hil_qualification.sh` and matrix-apply tooling must record lab prerequisite failures as `BLOCKED` (with explicit reasons) instead of `FAIL`, and persist those reasons into Q04/Q05/Q06 matrix updates.
- Why it matters: Deferred hardware tasks should preserve truthful state; `FAIL` on missing lab preconditions creates false negatives and obscures real quality signals.
- Dependencies: T031, T007, T017
- Estimated effort: Low (~1-2 hours)
- Required outputs: HIL wrapper preflight classification changes, matrix-apply reason propagation, and qualification matrix status alignment.
Subtasks: None
Assigned to: MAP2 Release Engineering + QA
Last updated: 2026-02-22 21:04 - Codex
Completion notes:
- What was done: Updated `scripts/run_avb_hil_qualification.sh` to run AVB preflight checks (interface + AVB status endpoint), classify environment-gated runs as `BLOCKED`, and emit per-gate blocked reasons in `summary.txt` and matrix snippet output. Updated `scripts/apply_avb_hil_matrix_update.sh` to propagate blocked reasons into Q04/Q05/Q06 latest outcomes.
- Key findings: Hardware-absent runs were being represented as `FAIL`, which contradicted deferred hardware queue semantics and slowed closure triage.
- Files/links produced: `scripts/run_avb_hil_qualification.sh`, `scripts/apply_avb_hil_matrix_update.sh`, `docs/AVB_QUALIFICATION_MATRIX.md`.
- Validation/evidence: Logic-only update; execution evidence will be produced during hardware stage via `scripts/run_avb_hil_qualification.sh` and applied with `scripts/apply_avb_hil_matrix_update.sh`.
- Suggested next tasks: Execute deferred hardware queue (`T007`, `T017`) in lab and apply summary artifacts to matrix.

ID: T044
Status: [✓] Done
Title: Harden HIL preflight reachability checks against proxy/malformed status payload drift
Description:
- Goal / acceptance criteria: Ensure HIL preflight does not produce false `BLOCKED` due shell proxy settings or malformed/non-JSON API payloads; require deterministic fail-closed classification before gate execution.
- Why it matters: Hardware-stage progress depends on trustworthy preflight classification, and proxy drift can otherwise mask real AVB readiness state.
- Dependencies: T043
- Estimated effort: Low (~1 hour)
- Required outputs: Updated HIL wrapper preflight (`curl --noproxy` + `--fail`) and explicit payload-field validation for `enabled`/`available`.
Subtasks: None
Assigned to: MAP2 Release Engineering + QA
Last updated: 2026-02-22 21:13 - Codex
Completion notes:
- What was done: Updated `scripts/run_avb_hil_qualification.sh` preflight to use `--noproxy "${MAP2_CURL_NOPROXY:-*}"` and `--fail` for AVB status requests, and added fail-closed handling when `enabled/available` fields are missing in payload.
- Key findings: Prior wrapper could misclassify reachability under proxy environments and did not explicitly reject malformed status payloads.
- Files/links produced: `scripts/run_avb_hil_qualification.sh`.
- Validation/evidence: Executed HIL wrapper after patch (`/tmp/map2-avb-hil-continue-20260222-211342/summary.txt`), which now deterministically records blocked reason via preflight.
- Suggested next tasks: Resolve AVB API reachability in lab context, then re-run hardware queue (`T007`, `T017`) and apply matrix update.

ID: T045
Status: [✓] Done
Title: Unblock AVB routing Jest suites from `import.meta` parse errors in test runtime
Description:
- Goal / acceptance criteria: Canonical AVB routing test command executes to green without ESM parse failures caused by `apiTarget.ts` (`import.meta`) under Jest’s runtime.
- Why it matters: Phase verification evidence depends on deterministic web-suite execution; parse-time failures prevent trustworthy readiness gating.
- Dependencies: T042
- Estimated effort: Low (~1 hour)
- Required outputs: Stable module mock strategy for AVB hook suites and passing `npm run test:avb-routing -- --runInBand`.
Subtasks: None
Assigned to: MAP2 Web + QA
Last updated: 2026-02-22 21:40 - Codex
Completion notes:
- What was done: Added explicit Jest module mocks for `../../../utils/apiTarget` in the two failing AVB hook suites so tests no longer evaluate `import.meta` from `apiTarget.ts` in this runner mode.
- Key findings: Failure mode was test-runtime/module-format mismatch rather than AVB hook logic regression.
- Files/links produced: `web/src/app/components/AvbRouting/hooks/useAvbApi.errorContracts.test.ts`, `web/src/app/components/AvbRouting/hooks/useNodeApi.test.ts`.
- Validation/evidence: `npm run test:avb-routing -- --runInBand` (19 suites passed, 234 tests passed).
- Suggested next tasks: Continue remaining verification plan items (`T007`, `T017`) in hardware-capable lab context.

## Completed Items

ID: T000  
Status: [✓] Done  
Title: Consolidate legacy AVB plan files into one master plan location  
Description:  
- Goal / acceptance criteria: Replace overlapping plan files with a single active AVB master plan and archive old files.  
- Why it matters: Removes planning fragmentation.  
- Dependencies: None  
- Estimated effort: Medium (~2-4 hours)  
- Required outputs: Active master plan, archived legacy files, clear canonical path.  
Subtasks: None  
Assigned to: MAP2 Audio Platform Team  
Last updated: 2026-02-21 08:19 - MAP2 Audio Platform Team  
Completion notes:  
- What was done: Consolidated AVB planning into this master file and archived legacy plan docs under `docs/archive/legacy-plans/`.  
- Key findings: Multiple active planning docs caused ambiguity in execution ownership and sequence.  
- Files/links produced: `docs/AVB_MASTER_WORK_PLAN.md`, `docs/archive/legacy-plans/*`.  
- Suggested next tasks: T001, T003, T008

## Parallelization Guidance

- Active non-hardware queue: none (all current non-hardware AVB items complete)
- Deferred hardware queue: run `T007` and `T017` during lab stage with `scripts/run_avb_hil_qualification.sh`, then apply summary with `scripts/apply_avb_hil_matrix_update.sh`
- Keep sequential in hardware stage: close Q04 -> Q05 -> Q06 evidence, then mark T007/T017 done

## Deferred Hardware-Required Items (Later Stage)

The items below require AVB-capable lab hardware and are intentionally scheduled for a later testing stage.

Category: Hardware-required (deferred)

ID: T007  
Status: [✗] Blocked  
Title: Publish qualification matrix, rollout guardrails, and backout runbook  
Description:  
- Goal / acceptance criteria: Complete hardware-dependent qualification evidence, feature-flag rollout, and explicit backout procedure.  
- Why it matters: Release must be controllable and reversible with minimal risk.  
- Dependencies: T001, T002, T004, T005, T006  
- Estimated effort: High (~1-2 days)  
- Required outputs: Updated qualification doc, rollout checklist, backout script/runbook references.  
Subtasks:  
- ID: T007-subA  
  Status: [✗] Blocked  
  Title: Finalize pass/fail hardware qualification matrix  
  Description:  
  - Goal / acceptance criteria: Record required scenarios, expected thresholds, and measured outcomes.  
  - Why it matters: Gate release on objective evidence.  
  - Dependencies: T005  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Qualification matrix in docs with reproducible command list.  
  Assigned to: Codex  
  Last updated: 2026-02-22 13:10 - Codex  
- ID: T007-subB  
  Status: [✓] Done  
  Title: Finalize feature flag and rollback procedure  
  Description:  
  - Goal / acceptance criteria: Document and validate disable/backout path that leaves no orphaned streams.  
  - Why it matters: Required for safe production incident response.  
  - Dependencies: T004, T007-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Runbook and validation checklist updates.  
  Assigned to: Codex  
  Last updated: 2026-02-21 22:07 - Codex  
Assigned to: MAP2 Release Engineering  
Last updated: 2026-02-22 13:10 - Codex
Blocked notes:
- What was done: Published and updated qualification matrix/runbook artifacts with reproducible command set and explicit rollback/backout checks; added dedicated capture/soak references and wrappers (`scripts/avb_capture_clock_drift.sh`, `scripts/run_avb_24h_soak.sh`, `scripts/run_avb_hil_qualification.sh`, `docs/AVB_24H_SOAK_TEMPLATE.md`), including auto-generated matrix update snippet output (`matrix_update.md`) for Q04-Q06.
- Why blocked: Hardware-in-the-loop qualification rows (`Q04`-`Q06`) still require AVB-capable lab execution and measured outcomes.
- Latest run evidence (2026-02-22): restarted `map2-backend` to restore API responsiveness, then `scripts/run_avb_hil_qualification.sh --interface enp0s25 --capture-seconds 30` produced `Q04/Q05=BLOCKED` (`AVB status reports enabled=false available=false`) and `Q06=SKIPPED`; summary at `/tmp/map2-avb-hil-continue-20260222-2144/summary.txt` and matrix updated via `scripts/apply_avb_hil_matrix_update.sh`.
- Unblock condition: Run HIL matrix scenarios and record measured evidence in `docs/AVB_QUALIFICATION_MATRIX.md`.


ID: T017
Status: [✗] Blocked  
Title: Close remaining AVB qualification evidence gaps for stream timing and endurance  
Description:  
- Goal / acceptance criteria: Qualification package contains measurable AVTP timestamp, sequence, and endurance evidence before release promotion.  
- Why it matters: Without measurable transport-quality evidence, functional completion is insufficient for production rollout.  
- Dependencies: T001, T002, T004, T005, T007, T014  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: Updated runbook and test artifacts for packet fidelity + 24h soak + sequence accounting.  
Subtasks:  
- ID: T017-subA  
  Status: [✓] Done  
  Title: Add C++ AVB stream manager transition + timestamp/sequence tests  
  Description:  
  - Extend Catch2 harness for state transition edges, seq continuity, and timestamp behavior under fault/retry.  
  Dependencies: T001, T002, T005  
  Estimated effort: Medium (~6-8 hours)  
  Required outputs: AVB stream-manager tests included in CI build matrix and passing locally.  
  Assigned to: Codex  
  Last updated: 2026-02-22 13:10 - Codex  
- ID: T017-subB  
  Status: [✓] Done  
  Title: Add AVTP pcap capture and clock-drift verification workflow  
  Description:  
  - Add scripted capture + comparison path against PTP grandmaster, with <1µs target documentation and failure thresholds.  
  Dependencies: T014  
  Estimated effort: Medium (~3-4 hours)  
  Required outputs: Reproducible evidence command path and parseable metric outputs.  
  Assigned to: Codex  
  Last updated: 2026-02-22 13:10 - Codex  
- ID: T017-subC  
  Status: [✓] Done  
  Title: Add 8-stream, 24h soak execution template and checkpoints  
  Description:  
  - Define start, checkpoint, and stop criteria with artifact collection (CPU/xrun/latency/jitter, error counters).  
  Dependencies: T005  
  Estimated effort: Low (~2-3 hours)  
  Required outputs: Soak template and post-run evidence review checklist.  
  Assigned to: Codex  
  Last updated: 2026-02-22 13:10 - Codex  
Assigned to: Release Engineering + QA  
Last updated: 2026-02-22 13:10 - Codex
Blocked notes:
- What was done: Added/confirmed stream manager transition + timestamp/sequence coverage (`juce-engine/tests/AvbStreamManagerTests.cpp`), added reproducible AVTP/PTP drift capture workflow (`scripts/avb_capture_clock_drift.sh`), and added executable soak/qualification runners (`scripts/run_avb_24h_soak.sh`, `scripts/run_avb_hil_qualification.sh`) plus explicit 8-stream/24h soak template (`docs/AVB_24H_SOAK_TEMPLATE.md`); HIL wrapper now emits `matrix_update.md` for direct qualification matrix updates.
- Why blocked: Final qualification acceptance still depends on running these workflows on AVB-capable hardware and recording measured outcomes.
- Latest run evidence (2026-02-22): hardware wrapper execution now reaches API and reports readiness blocker `AVB status reports enabled=false available=false` in `/tmp/map2-avb-hil-continue-20260222-2144/summary.txt`.
- Validation/evidence available now: software-side matrix and commands documented in `docs/AVB_QUALIFICATION_MATRIX.md`.
