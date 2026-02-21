# AVB Canonical Worklist (Single Source of Truth)

Canonical file: `docs/AVB_MASTER_WORK_PLAN.md`  
Rule status: Active (disable only with `DISABLE WORKLIST RULE`)  
Last updated: 2026-02-21 11:48 - Codex

## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

## Top Tasks (Priority Order)

ID: T001  
Status: [>] In Progress  
Title: Harden engine stream lifecycle transition edges under stress  
Description:  
- Goal / acceptance criteria: Cover and stabilize edge transitions (`running->error`, repeated `start/stop`, `delete` after failure) with deterministic behavior and tests.  
- Why it matters: Stream lifecycle correctness is the core reliability gate for AVB runtime control.  
- Dependencies: None  
- Estimated effort: High (~1-2 days)  
- Required outputs: C++ transition fixes in `juce-engine/Source/Map2AudioEngine.cpp` and test updates in AVB state-machine suites.  
Subtasks:  
- ID: T001-subA  
  Status: [ ] Todo  
  Title: Add explicit transition matrix tests for failure and retry paths  
  Description:  
  - Goal / acceptance criteria: Add automated coverage for all legal/illegal transitions and retry semantics.  
  - Why it matters: Prevent regressions when control-plane code changes.  
  - Dependencies: None  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Updated C++ and/or Python tests with matrix assertions.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T001-subB  
  Status: [ ] Todo  
  Title: Enforce idempotency and consistent error payloads on repeated operations  
  Description:  
  - Goal / acceptance criteria: Repeated `start`, `stop`, and `delete` return stable results with no leaked state.  
  - Why it matters: API clients depend on safe retries.  
  - Dependencies: T001-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Engine method changes plus contract tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 08:33 - Codex

ID: T002  
Status: [ ] Todo  
Title: Add AVTP sequence/timestamp counters and structured diagnostics  
Description:  
- Goal / acceptance criteria: Track sequence gaps, timestamp skew, and decode anomalies; expose counters in exported stream stats and diagnostics endpoints.  
- Why it matters: Qualification requires measurable transport fidelity, not pass/fail only.  
- Dependencies: T001  
- Estimated effort: High (~1-2 days)  
- Required outputs: C++ stats structs, pybind exposure, backend payload updates, tests.  
Subtasks:  
- ID: T002-subA  
  Status: [ ] Todo  
  Title: Implement native counters in AVTP TX/RX paths  
  Description:  
  - Goal / acceptance criteria: Add monotonic counters for sequence gap/misalignment and timestamp skew in engine transport code.  
  - Why it matters: Establish source-of-truth telemetry at producer layer.  
  - Dependencies: T001  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Changes in `juce-engine/Source/AvbStream.*` and related stats structs.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T002-subB  
  Status: [ ] Todo  
  Title: Surface counters to Python/web diagnostics contract  
  Description:  
  - Goal / acceptance criteria: API returns new counters in stream and diagnostics payloads with schema tests.  
  - Why it matters: Operators need visibility in UI and service APIs.  
  - Dependencies: T002-subA  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: `PythonBindings.cpp`, `app/services/avb/avb_service.py`, route tests, type updates.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 AVB Engine + Backend  
Last updated: 2026-02-21 08:33 - Codex

ID: T003  
Status: [ ] Todo  
Title: Canonicalize host/device/source metadata schema across backend and UI  
Description:  
- Goal / acceptance criteria: Use one canonical endpoint schema with deterministic naming and host linkage across discovery, routing payloads, and frontend types.  
- Why it matters: Eliminates multi-node ambiguity and inconsistent rendering.  
- Dependencies: None  
- Estimated effort: Medium (~4-8 hours)  
- Required outputs: Shared schema updates in backend models and `web/src/app/components/AvbRouting/types/endpoint.ts`.  
Subtasks:  
- ID: T003-subA  
  Status: [ ] Todo  
  Title: Define canonical schema fields and backward-compatible mapping  
  Description:  
  - Goal / acceptance criteria: Document required fields (`host`, stable IDs, direction/source metadata) and adapter path.  
  - Why it matters: Prevent schema drift between services.  
  - Dependencies: None  
  - Estimated effort: Low (~1-2 hours)  
  - Required outputs: Schema decision note + code constants/types.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T003-subB  
  Status: [ ] Todo  
  Title: Apply schema end-to-end and update tests  
  Description:  
  - Goal / acceptance criteria: Discovery, API, and UI compile/tests pass with canonical type.  
  - Why it matters: Runtime and UX consistency depend on one contract.  
  - Dependencies: T003-subA  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Updated backend/UI code and related tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 Backend + Web  
Last updated: 2026-02-21 08:33 - Codex

ID: T004  
Status: [ ] Todo  
Title: Add control-plane back-pressure handling and sequence audit log  
Description:  
- Goal / acceptance criteria: Handle transient router/network failures without orphaned reservations; emit correlated sequence logs for `connect -> admit -> create -> start -> rollback`.  
- Why it matters: Operator debugging and safe recovery require deterministic orchestration traces.  
- Dependencies: T001, T002  
- Estimated effort: High (~1-2 days)  
- Required outputs: Backend orchestration updates, operator-facing diagnostic route/log integration, regression tests.  
Subtasks:  
- ID: T004-subA  
  Status: [ ] Todo  
  Title: Implement bounded retry/backoff and cleanup guarantees  
  Description:  
  - Goal / acceptance criteria: On transient failures, retries are bounded and rollback always releases resources.  
  - Why it matters: Prevent leaked SRP reservations and partial stream state.  
  - Dependencies: T001  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Router-service code changes + failure-injection tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T004-subB  
  Status: [ ] Todo  
  Title: Emit correlated critical-path sequence log IDs  
  Description:  
  - Goal / acceptance criteria: Every connect/disconnect flow includes traceable correlation ID and stage outcome.  
  - Why it matters: Speeds incident diagnosis and qualification evidence collection.  
  - Dependencies: T004-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Structured logs and docs/tests for log fields.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 Backend  
Last updated: 2026-02-21 08:33 - Codex

ID: T005  
Status: [ ] Todo  
Title: Expand AVTP fidelity validation and Catch2 stress coverage  
Description:  
- Goal / acceptance criteria: Add encode/decode edge-case tests, sequence/timestamp stress tests, and deterministic failure-injection coverage for AVB test targets.  
- Why it matters: Production transport behavior must be validated under fault scenarios.  
- Dependencies: T002  
- Estimated effort: High (~1-2 days)  
- Required outputs: Catch2 suites, CI or local scripted target for AVB failure-injection tests.  
Subtasks:  
- ID: T005-subA  
  Status: [ ] Todo  
  Title: Add endianness/format edge-case encode/decode assertions  
  Description:  
  - Goal / acceptance criteria: Test vectors cover boundary values and malformed payload behavior.  
  - Why it matters: Prevent silent corruption in packet parsing.  
  - Dependencies: T002  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: New/updated Catch2 tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T005-subB  
  Status: [ ] Todo  
  Title: Add deterministic stress and recovery tests with fault injection  
  Description:  
  - Goal / acceptance criteria: Reproducible runs generate stable metrics and pass/fail criteria.  
  - Why it matters: Qualification and release readiness depend on repeatability.  
  - Dependencies: T005-subA  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Catch2 test additions and test-run command documentation.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 AVB Engine QA  
Last updated: 2026-02-21 08:33 - Codex

ID: T006  
Status: [ ] Todo  
Title: Complete AVB web operator UX backlog with single-filter model and health snapshot  
Description:  
- Goal / acceptance criteria: Add host/issue/direction/quality filtering and inspector health snapshot without introducing split filter logic.  
- Why it matters: Operators need fast diagnosis and control in noisy multi-node environments.  
- Dependencies: T003  
- Estimated effort: Medium (~4-8 hours)  
- Required outputs: Web component updates, state/reducer tests, UX acceptance notes.  
Subtasks:  
- ID: T006-subA  
  Status: [ ] Todo  
  Title: Implement unified filter state model and query wiring  
  Description:  
  - Goal / acceptance criteria: All AVB filtering derives from one typed model and persists correctly in routing UI state.  
  - Why it matters: Avoid conflicting filter behavior and hidden results.  
  - Dependencies: T003  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Reducer/state updates and tests under `web/src/app/components/AvbRouting`.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T006-subB  
  Status: [ ] Todo  
  Title: Add inspector AVB health snapshot card with telemetry rollup  
  Description:  
  - Goal / acceptance criteria: Selected node inspector shows concise stream/host health summary in <=2 clicks.  
  - Why it matters: Reduce operator triage time during incidents.  
  - Dependencies: T002, T006-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: UI component updates and snapshot rendering tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 Web  
Last updated: 2026-02-21 08:33 - Codex

ID: T007  
Status: [ ] Todo  
Title: Publish qualification matrix, rollout guardrails, and backout runbook  
Description:  
- Goal / acceptance criteria: Complete hardware-dependent qualification evidence, feature-flag rollout, and explicit backout procedure.  
- Why it matters: Release must be controllable and reversible with minimal risk.  
- Dependencies: T001, T002, T004, T005, T006  
- Estimated effort: High (~1-2 days)  
- Required outputs: Updated qualification doc, rollout checklist, backout script/runbook references.  
Subtasks:  
- ID: T007-subA  
  Status: [ ] Todo  
  Title: Finalize pass/fail hardware qualification matrix  
  Description:  
  - Goal / acceptance criteria: Record required scenarios, expected thresholds, and measured outcomes.  
  - Why it matters: Gate release on objective evidence.  
  - Dependencies: T005  
  - Estimated effort: Medium (~3-5 hours)  
  - Required outputs: Qualification matrix in docs with reproducible command list.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T007-subB  
  Status: [ ] Todo  
  Title: Finalize feature flag and rollback procedure  
  Description:  
  - Goal / acceptance criteria: Document and validate disable/backout path that leaves no orphaned streams.  
  - Why it matters: Required for safe production incident response.  
  - Dependencies: T004, T007-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Runbook and validation checklist updates.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 Release Engineering  
Last updated: 2026-02-21 08:33 - Codex

ID: T008  
Status: [ ] Todo  
Title: Run and publish milestone build/test checkpoints with evidence links  
Description:  
- Goal / acceptance criteria: Execute core and qualification command sets at each milestone; publish pass/fail summary and artifact locations.  
- Why it matters: Keeps execution observable and reduces hidden regressions.  
- Dependencies: T001, T002, T004, T005, T006  
- Estimated effort: Medium (~2-4 hours per milestone)  
- Required outputs: Checkpoint notes with command outputs and artifact paths in docs/logs.  
Subtasks:  
- ID: T008-subA  
  Status: [ ] Todo  
  Title: Establish milestone evidence template  
  Description:  
  - Goal / acceptance criteria: Standard note format includes commands, durations, outcomes, and artifacts.  
  - Why it matters: Consistent reporting across threads and weeks.  
  - Dependencies: None  
  - Estimated effort: Low (~1 hour)  
  - Required outputs: Markdown template in docs.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
- ID: T008-subB  
  Status: [ ] Todo  
  Title: Execute checkpoint run for current AVB branch state  
  Description:  
  - Goal / acceptance criteria: Record current baseline pass/fail and top failing tests with ownership mapping.  
  - Why it matters: Sets starting point for priority execution.  
  - Dependencies: T008-subA  
  - Estimated effort: Medium (~2-3 hours)  
  - Required outputs: Logged results and updated statuses in this file.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 08:33 - Codex  
Assigned to: MAP2 QA + Integrations  
Last updated: 2026-02-21 08:33 - Codex

## Consolidated Backlog from Discovered Plan References

The items below were discovered in active implementation notes (`docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md`,
`docs/phase10-progress.md`, `docs/AVB_PLAN3_QUALIFICATION_2026-02-20.md`,
`docs/AVB_ROUTING_IMPLEMENTATION_STATUS.md`, `docs/AVB_MULTI_NODE_IMPLEMENTATION_SUMMARY.md`,
`docs/AVB_MULTI_NODE_ARCHITECTURE.md`) and active AVB code TODOs/placeholders.

Where items overlap with existing work, they are merged into a single consolidated task.

ID: T009  
Status: [ ] Todo  
Title: Remove AVDECC AEM command/response placeholders in JUCE and complete descriptor flow  
Description:  
- Goal / acceptance criteria: AECP command send/response path is real (not placeholder comments), with deterministic descriptor request/response handling for enumeration completion.  
- Why it matters: Current AEM pipeline uses placeholders for AECP TX and AEM command handling, limiting robust descriptor-driven behavior for AVDECC endpoints.  
- Dependencies: None  
- Estimated effort: High (~1-2 days)  
- Required outputs: `juce-engine/Source/AvdeccEntity.cpp`, `juce-engine/Source/AvdeccEnumerator.cpp`, regression tests for enum request/response lifecycle.  
Subtasks:  
- ID: T009-subA  
  Status: [ ] Todo  
  Title: Wire real send path for enumerator read-descriptor requests  
  Description:  
  - Replace placeholder lambda in `AvdeccEntity` constructor with a real `sendAecpCommand` flow that serializes AECP AEM frames and sends via socket.  
  - Remove "will be implemented" placeholders in `AvdeccEntity.cpp`/`AvdeccEnumerator.cpp`.  
  - Dependencies: None  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Functional AECP request transmit and callback path in logs/tests.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T009-subB  
  Status: [ ] Todo  
  Title: Implement AEM READ_DESCRIPTOR command + response extraction  
  Description:  
  - Replace `handleAecpAemCommand()` placeholder with request handlers for `READ_DESCRIPTOR` (and safe no-op for unsupported AECP types).  
  - Replace fixed-size placeholder response extraction in `handleAecpAemResponse()` with bounded payload parsing.  
  - Dependencies: T009-subA  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Descriptor sessions complete without placeholder branches.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T009-subC  
  Status: [ ] Todo  
  Title: Complete AEM response handling for missing descriptor categories and retries  
  Description:  
  - Ensure `retryRequest()` increments retry state correctly and does not silently mask backoff/retry conditions.  
  - Document/handle unsupported descriptor types with clear debug telemetry.  
  - Dependencies: T009-subB  
  - Estimated effort: Low (~2-3 hours)  
  - Required outputs: Retry behavior and unsupported-type behavior are deterministic and test-covered.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 09:00 - Codex  

ID: T010  
Status: [ ] Todo  
Title: Resolve AVDECC stream format metadata end-to-end and remove hardcoded AVB defaults  
Description:  
- Goal / acceptance criteria: Map2 and AVDECC endpoints expose accurate host-origin and format metadata (channels/sample rate) from discovered descriptor/model data, not placeholders.  
- Why it matters: This is required for deterministic AVDECC-to-JUCE routing and correct source/destination pairing in matrix workflows.  
- Dependencies: T009  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `app/services/avb/avb_router.py`, `app/routes/avb.py`, `web/src/app/components/AvbRouting` types/hooks, contract tests.  
Subtasks:  
- ID: T010-subA  
  Status: [ ] Todo  
  Title: Parse AVDECC stream format metadata into routing endpoint payload  
  Description:  
  - Decode stream `current_format`/descriptor fields when available and derive channels/sample rate/bit-depth.  
  - Replace defaults `channels=2`, `sample_rate=48000` used in AVDECC discovery fallback in `avb_router.py`.  
  - Dependencies: T009  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: AVDECC route endpoints include real `channels` and `sample_rate` values.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T010-subB  
  Status: [ ] Todo  
  Title: Add source host tagging for endpoint names and routing inventory  
  Description:  
  - Ensure AVDECC endpoints carry host origin label in discovery/engine sync payload and in response schemas (`host`, `device_name`).  
  - Include host label in UI-visible endpoint naming (for manual pairing and diagnostics).  
  - Dependencies: T010-subA  
  - Estimated effort: Medium (~2-4 hours)  
  - Required outputs: Deterministic `host` field and consistent endpoint naming in UI payloads.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T010-subC  
  Status: [ ] Todo  
  Title: Persist and validate entity-model serialization path  
  Description:  
  - Implement `AvdeccEntityModel::fromJSON()` (currently TODO placeholder).  
  - Add round-trip tests covering descriptor/format cache payloads when available.  
  - Dependencies: T009  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: JSON cache loading restores descriptor model deterministically.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 09:00 - Codex  

ID: T011  
Status: [ ] Todo  
Title: Close AVB web-node topology hook placeholders  
Description:  
- Goal / acceptance criteria: `useNodeApi` no longer returns hardcoded zero-count nodes/empty edges and resolves local identity from real backend/config inputs.  
- Why it matters: Topology/PTP health and local-host visibility are core for multi-node routing operations.  
- Dependencies: None  
- Estimated effort: Medium (~4-6 hours)  
- Required outputs: `web/src/app/components/AvbRouting/hooks/useNodeApi.ts`, tests for hook output shape and behavior.  
Subtasks:  
- ID: T011-subA  
  Status: [ ] Todo  
  Title: Compute synchronized/total PTP nodes from real backend state  
  Description:  
  - Replace hardcoded `synced_nodes` and `total_nodes` with values derived from `/api/avb/discovery` payload.  
  - Dependencies: None  
  - Estimated effort: Low (~1-2 hours)  
  - Required outputs: PTP status reflects observed node state.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T011-subB  
  Status: [ ] Todo  
  Title: Build topology edges from active router connections  
  Description:  
  - Query active router matrix/connections and derive AVB topology edges instead of returning an empty list.  
  - Include edge attributes for host/pairing direction.  
  - Dependencies: T011-subA  
  - Estimated effort: Medium (~4 hours)  
  - Required outputs: `topology.edges` drives graph and matrix views.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T011-subC  
  Status: [ ] Todo  
  Title: Resolve local node ID from backend/config with safe fallback  
  Description:  
  - Replace backend-placeholder local node logic with backend discovery/config-backed inference and deterministic fallback.  
  - Dependencies: T011-subB  
  - Estimated effort: Low (~1-2 hours)  
  - Required outputs: Stable local node identity for operator flows.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
Assigned to: MAP2 Web  
Last updated: 2026-02-21 09:00 - Codex  

ID: T012  
Status: [ ] Todo  
Title: Replace AVB/AVDECC module-level placeholder bindings with real engine-backed status contracts  
Description:  
- Goal / acceptance criteria: Module-level Python bindings return real data or explicit, structured unavailable/error states instead of hardcoded placeholders.  
- Why it matters: Backend/engine parity and operational observability depend on accurate binding contracts.  
- Dependencies: T009, T010  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `juce-engine/Source/PythonBindings.cpp`, API contract tests for disabled and enabled build paths.  
Subtasks:  
- ID: T012-subA  
  Status: [ ] Todo  
  Title: Implement AVB device/list/stream metrics from engine accessors  
  Description:  
  - Replace placeholder return paths in `get_avb_device_count`, `get_avb_device_names`, `get_avb_stream_stats`, `get_all_avb_stream_stats`, and `get_avb_interface_info`.  
  - Dependencies: T009  
  - Estimated effort: Medium (~4-5 hours)  
  - Required outputs: Runtime binding values reflect engine/device state.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T012-subB  
  Status: [ ] Todo  
  Title: Keep AVDECC placeholder removal for module-level functions in build variants  
  Description:  
  - Align `get_avdecc_*` module-level bindings with current engine instance behavior and clear disabled-mode behavior.  
  - Dependencies: T009  
  - Estimated effort: Medium (~3-4 hours)  
  - Required outputs: No placeholder text in AVDECC binding responses.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 09:00 - Codex  

ID: T013  
Status: [ ] Todo  
Title: Replace AVB stream AVTP placeholder initialization with real setup  
Description:  
- Goal / acceptance criteria: AVTP stream lifecycle uses real stream-object initialization and cleanup paths instead of placeholder buffer allocation.  
- Why it matters: Dataplane quality and fault behavior cannot be validated if transport layer uses mock allocation.  
- Dependencies: None  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `juce-engine/Source/AvbStream.cpp`, tests for init/teardown and stream config mapping.  
Subtasks:  
- ID: T013-subA  
  Status: [ ] Todo  
  Title: Implement real AVTP stream object initialization  
  Description:  
  - Replace placeholder in `AvbStream::initializeAvtp()` with real stream descriptor allocation/setup and field mapping.  
  - Dependencies: None  
  - Estimated effort: Medium (~4-6 hours)  
  - Required outputs: Streaming object exists with valid stream_id/format/timestamp config semantics.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
- ID: T013-subB  
  Status: [ ] Todo  
  Title: Add cleanup coverage and runtime failure checks  
  Description:  
  - Add validation for AVTP init failures and proper teardown to avoid leaks in transport allocation and socket ownership paths.  
  - Dependencies: T013-subA  
  - Estimated effort: Low (~2-4 hours)  
  - Required outputs: No placeholder fallback and safe failure paths.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 09:00 - Codex  
Assigned to: MAP2 AVB Engine  
Last updated: 2026-02-21 09:00 - Codex

ID: T014  
Status: [ ] Todo  
Title: Implement dynamic AVDECC stream format negotiation and pre-connect validation  
Description:  
- Goal / acceptance criteria: AVDECC stream formats can be updated at runtime via AECP `SET_STREAM_FORMAT` and validated before ACMP connection.  
- Why it matters: Deterministic source/destination pairing requires format alignment per host/device and prevents connect-time negotiation failure.  
- Dependencies: T009, T011  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: `juce-engine/Source/AvdeccEntity.h/cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, updated API contract tests.  
Subtasks:  
- ID: T014-subA  
  Status: [ ] Todo  
  Title: Add AECP SET_STREAM_FORMAT command/response handling in AVDECC engine  
  Description:  
  - Implement packet build/dispatch for `SET_STREAM_FORMAT` using descriptor type/index and 64-bit format value.  
  - Parse response status and map failures to structured return metadata.  
  - Update runtime descriptor/model cache on confirmed format changes.  
  Dependencies: T009  
  Estimated effort: Medium (~4-6 hours)  
  Required outputs: Engine can change and report negotiated stream format with bounded timeout handling.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T014-subB  
  Status: [ ] Todo  
  Title: Expose AVDECC set/get stream-format methods in Python bindings  
  Description:  
  - Add instance methods for format update/lookup tied to active AVDECC entity state.  
  - Return explicit failure modes instead of placeholder errors for both build and runtime unavailability.  
  Dependencies: T014-subA  
  Estimated effort: Low (~2-3 hours)  
  Required outputs: JUCE engine methods available for REST layer to call without placeholder guards.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T014-subC  
  Status: [ ] Todo  
  Title: Add REST patch endpoint and validation for stream format changes  
  Description:  
  - Add endpoint (or extend existing route contract) to mutate stream format on a per-stream basis.  
  - Validate format tuple (`channels`, `sample_rate`, `bits_per_sample`) and return actionable validation errors.  
  - Add tests for success/error contracts and pre-connect behavior.  
  Dependencies: T014-subA, T014-subB  
  Estimated effort: Medium (~3-4 hours)  
  Required outputs: Operator/API can change format and observe explicit result state.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
Assigned to: MAP2 AVB Engine + Backend  
Last updated: 2026-02-21 10:30 - Codex  

ID: T015  
Status: [ ] Todo  
Title: Build a mock AVDECC device harness for AVDECC/ACMP/format workflow tests  
Description:  
- Goal / acceptance criteria: AVDECC integration tests run in CI/hardware-light mode for discovery, READ_DESCRIPTOR, ACMP, and format negotiation paths.  
- Why it matters: Deterministic regression coverage should not be blocked by lab availability.  
- Dependencies: T009, T011, T014  
- Estimated effort: High (~1-2 days)  
- Required outputs: `tests/mock_avdecc_device.py`, CI-safe integration tests, docs for local runner behavior.  
Subtasks:  
- ID: T015-subA  
  Status: [ ] Todo  
  Title: Add packet-level mock device and raw-packet responders  
  Description:  
  - Implement mock ADP advertiser and AECP/ACMP responders for core commands and minimal realistic descriptors.  
  - Provide deterministic IDs and endpoint profile for 8/16 stream scenarios.  
  Dependencies: T009  
  Estimated effort: High (~6-8 hours)  
  Required outputs: Repeatable AVDECC entity visible to real discovery/enumeration logic.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T015-subB  
  Status: [ ] Todo  
  Title: Add pytest integration suite for mock-driven AVDECC workflows  
  Description:  
  - Add tests for enumeration, connect/disconnect, and format update using mock endpoint.  
  - Include skip/fallback handling for raw socket permission constraints.  
  Dependencies: T015-subA  
  Estimated effort: Medium (~4-6 hours)  
  Required outputs: `pytest -m avdecc_mock` or `-m avb` suite with passing baseline.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T015-subC  
  Status: [ ] Todo  
  Title: Document mock harness runbook and CI integration  
  Description:  
  - Add commands, network requirements, teardown steps, and troubleshooting for socket/multicast constraints.  
  Dependencies: T015-subB  
  Estimated effort: Low (~1-2 hours)  
  Required outputs: Reproducible one-command test invocation and failure triage notes.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
Assigned to: MAP2 QA + Backend  
Last updated: 2026-02-21 10:30 - Codex  

ID: T016  
Status: [ ] Todo  
Title: Complete AVDECC cache writeback lifecycle and model reuse  
Description:  
- Goal / acceptance criteria: AVDECC endpoint model reads are cache-aware end-to-end, with first-enumeration persistence and controlled invalidation.  
- Why it matters: Better startup performance and predictable operator UX on multi-device networks.  
- Dependencies: T010, T009  
- Estimated effort: Medium (~1 day)  
- Required outputs: `app/routes/avb.py`, `app/services/avb/aem_cache.py`, endpoint tests updated for hit/miss behavior.  
Subtasks:  
- ID: T016-subA  
  Status: [ ] Todo  
  Title: Persist model payloads on successful enumeration queries  
  Description:  
  - Write model response into cache when `get_entity_model` returns complete data.  
  - Ensure cache metadata marks freshness and hit source.  
  Dependencies: T010  
  Estimated effort: Medium (~3-5 hours)  
  Required outputs: Reduced repeated read-descriptor load and cache-hit responses after restart.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T016-subB  
  Status: [ ] Todo  
  Title: Add stale/incomplete model invalidation policy  
  Description:  
  - Invalidate cache entries when model is incomplete, stale, or incompatible with current entity revision.  
  - Capture invalidation events in cache stats for operators.  
  Dependencies: T016-subA  
  Estimated effort: Medium (~3-5 hours)  
  Required outputs: Safer reuse and no stale stream metadata used in routing logic.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T016-subC  
  Status: [ ] Todo  
  Title: Add cache regression tests and stats assertions  
  Description:  
  - Test miss -> set -> hit path and validate `cached`/stats flags.  
  - Verify invalid/unsupported payloads are safely discarded.  
  Dependencies: T016-subA  
  Estimated effort: Low (~2-3 hours)  
  Required outputs: Deterministic model cache behavior and metrics validation.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
Assigned to: MAP2 Backend  
Last updated: 2026-02-21 10:30 - Codex  

ID: T017
Status: [ ] Todo  
Title: Close remaining AVB qualification evidence gaps for stream timing and endurance  
Description:  
- Goal / acceptance criteria: Qualification package contains measurable AVTP timestamp, sequence, and endurance evidence before release promotion.  
- Why it matters: Without measurable transport-quality evidence, functional completion is insufficient for production rollout.  
- Dependencies: T001, T002, T004, T005, T007, T014  
- Estimated effort: Medium (~1-2 days)  
- Required outputs: Updated runbook and test artifacts for packet fidelity + 24h soak + sequence accounting.  
Subtasks:  
- ID: T017-subA  
  Status: [ ] Todo  
  Title: Add C++ AVB stream manager transition + timestamp/sequence tests  
  Description:  
  - Extend Catch2 harness for state transition edges, seq continuity, and timestamp behavior under fault/retry.  
  Dependencies: T001, T002, T005  
  Estimated effort: Medium (~6-8 hours)  
  Required outputs: AVB stream-manager tests included in CI build matrix and passing locally.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T017-subB  
  Status: [ ] Todo  
  Title: Add AVTP pcap capture and clock-drift verification workflow  
  Description:  
  - Add scripted capture + comparison path against PTP grandmaster, with <1µs target documentation and failure thresholds.  
  Dependencies: T014  
  Estimated effort: Medium (~3-4 hours)  
  Required outputs: Reproducible evidence command path and parseable metric outputs.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
- ID: T017-subC  
  Status: [ ] Todo  
  Title: Add 8-stream, 24h soak execution template and checkpoints  
  Description:  
  - Define start, checkpoint, and stop criteria with artifact collection (CPU/xrun/latency/jitter, error counters).  
  Dependencies: T005  
  Estimated effort: Low (~2-3 hours)  
  Required outputs: Soak template and post-run evidence review checklist.  
  Assigned to: Unassigned  
  Last updated: 2026-02-21 10:30 - Codex  
Assigned to: Release Engineering + QA  
Last updated: 2026-02-21 10:30 - Codex

ID: T018
Status: [ ] Todo
Title: Implement AVDECC ACMP stream connection management for real JUCE stream wiring
Description:
- Goal / acceptance criteria: Implement ACMP CONNECT/DISCONNECT for speaker/listener streams and transition those outcomes into active AVB stream objects in JUCE.
- Why it matters: AVDECC endpoints are discoverable, but they do not yet produce functional dynamic source/destination stream bindings in JUCE audio graph.
- Dependencies: T009, T014
- Estimated effort: High (~1-2 days)
- Required outputs: `juce-engine/Source/AvdeccEntity.*`, `juce-engine/Source/Map2AudioEngine.*`, `juce-engine/Source/PythonBindings.cpp`, `app/routes/avb.py`, API contracts.
Subtasks:
- ID: T018-subA
  Status: [ ] Todo
  Title: Add ACMP command/response state machine in JUCE AVDECC entity
  Description:
  - Implement ACMP PDU handling for CONNECT/DISCONNECT commands and response validation.
  - Persist active connection state with deterministic IDs and retries/timeouts.
  - Return structured failure status for unsupported statuses and timeout conditions.
  Dependencies: T009
  Estimated effort: Medium (~4-6 hours)
  Required outputs: Stable ACMP request/response behavior and state updates.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T018-subB
  Status: [ ] Todo
  Title: Expose ACMP orchestration in bindings and router API
  Description:
  - Add JUCE binding methods for `connect_stream`, `disconnect_stream`, and `get_active_connections`.
  - Add backend routes for connect/disconnect/list + error payloads tied to AVDECC responses.
  - Add API tests for success/failure and malformed IDs.
  Dependencies: T018-subA
  Estimated effort: Medium (~3-5 hours)
  Required outputs: REST and binding API parity for stream connection operations.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T018-subC
  Status: [ ] Todo
  Title: Materialize AVDECC connection outcomes as JUCE audio endpoints
  Description:
  - On ACMP success, create/update/remove AVB endpoints with host-aware stream naming for operator clarity.
  - Ensure resulting active streams are exposed to existing `/api/avb/streams` and stream metrics path.
  - Confirm source/destination lifecycle correctness under reconnect/restart scenarios.
  Dependencies: T018-subB
  Estimated effort: Medium (~4-6 hours)
  Required outputs: Functional AVDECC stream source/destination lifecycle in JUCE.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
Assigned to: MAP2 AVB Engine + Backend
Last updated: 2026-02-21 11:48 - Codex

ID: T019
Status: [ ] Todo
Title: Replace AVB polling-only state sync with websocket event stream
Description:
- Goal / acceptance criteria: Use server-push events for nodes/ptp/connections/topology updates and fall back to polling only when websocket is unavailable.
- Why it matters: Polling delays can hide race windows in remote churn and adds avoidable latency under operator load.
- Dependencies: T011
- Estimated effort: High (~1-2 days)
- Required outputs: Backend socket broadcaster, frontend subscription hooks, deterministic event replay tests, and measured event lag targets.
Subtasks:
- ID: T019-subA
  Status: [ ] Todo
  Title: Add AVB websocket event bus and server broadcast model
  Description:
  - Add backend event channels for node discovery, route changes, PTP state, topology deltas, and stream failures.
  - Define event envelope with correlation/idempotency semantics.
  - Provide reconnect-safe subscribe/unsubscribe lifecycle.
  Dependencies: T011
  Estimated effort: Medium (~6-8 hours)
  Required outputs: `/ws/avb/*` or equivalent event source with schema docs.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T019-subB
  Status: [ ] Todo
  Title: Migrate AVB node/topology hooks to event-driven mode
  Description:
  - Update `useNodeApi.ts`, `usePtpStatus`, and topology hooks to consume websocket events first.
  - Keep polling as fallback and maintain deterministic query cache behavior.
  - Ensure remote sync churn and topology edges remain consistent while events are bursty.
  Dependencies: T019-subA
  Estimated effort: Medium (~4-6 hours)
  Required outputs: AVB network view updates driven by event stream with fallback safety.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T019-subC
  Status: [ ] Todo
  Title: Add event-path integration tests for remote sync churn
  Description:
  - Add coverage for rapid node/offline and route churn, event bursts, and reconnect recovery.
  - Verify remote sync events do not regress audit summaries and filter semantics.
  Dependencies: T019-subB
  Estimated effort: Medium (~3-5 hours)
  Required outputs: Web/socket integration tests + coverage pass criteria.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
Assigned to: MAP2 Web + Backend
Last updated: 2026-02-21 11:48 - Codex

ID: T020
Status: [ ] Todo
Title: Consolidate remaining AVB routing UX tasks around scenes, diff UX, and filter semantics
Description:
- Goal / acceptance criteria: Complete user-facing AVB workflow UX required to safely reconcile remote scene sync churn and inspect diff history with deterministic behavior.
- Why it matters: Routing operators need predictable outcomes during remote control races and high-churn sessions.
- Dependencies: T006, T019
- Estimated effort: Medium (~1-2 days)
- Required outputs: Scene management dialogs/diff views, deterministic quick-chip precedence, and updated operations guidance.
Subtasks:
- ID: T020-subA
  Status: [ ] Todo
  Title: Finish scene management and diff workflow dialogs
  Description:
  - Implement/create scene management modal and scene diff UX depth (accept/skip/rename behaviors).
  - Ensure scene save/recall/update flows persist and rehydrate without stale-preset artifacts.
  Dependencies: T006
  Estimated effort: Medium (~4-6 hours)
  Required outputs: Functional scene and diff controls in UI + reducer/state tests.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T020-subB
  Status: [ ] Todo
  Title: Resolve audit/filter precedence and restoration under remote churn
  Description:
  - Codify precedence between status-strip counters and quick-chip filters.
  - Add deterministic restoration of remembered scene-audit filters when controls reopen during remote updates.
  - Cover mixed pointer/keyboard activation sequences.
  Dependencies: T020-subA
  Estimated effort: Medium (~4-5 hours)
  Required outputs: Stable audit/filter behavior and regression tests.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T020-subC
  Status: [ ] Todo
  Title: Update operator docs for scene/audit precedence and remote-sync recovery
  Description:
  - Add a concise operator matrix for counter-vs-chip precedence and remote scene-sync recovery order.
  - Include remediation playbooks for baseline/compare invalidation churn.
  Dependencies: T020-subB
  Estimated effort: Low (~2-3 hours)
  Required outputs: `docs/OPERATIONS_GUIDE.md` and help text updates.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
Assigned to: MAP2 Web
Last updated: 2026-02-21 11:48 - Codex

ID: T021
Status: [ ] Todo
Title: Implement multi-node phase-4 advanced surface features
Description:
- Goal / acceptance criteria: Complete deferred multi-node UX and resilience items required for large-node operations and operational continuity.
- Why it matters: Network scale and operator load increase requires topology visualization, advanced filtering, and resilient metadata handling.
- Dependencies: T019
- Estimated effort: High (~1-2 weeks)
- Required outputs: Topology visualizer, advanced node filtering, optional offline metadata cache, and metering pathway hooks.
Subtasks:
- ID: T021-subA
  Status: [ ] Todo
  Title: Add network topology visualization for multi-node AVB control
  Description:
  - Build reactflow-based topology panel using existing nodes/routes/topology reducer payloads.
  - Render active cross-node routes and PTP hierarchy indicators.
  Dependencies: T019
  Estimated effort: Medium (~2 days)
  Required outputs: Topology panel with route/health overlay.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T021-subB
  Status: [ ] Todo
  Title: Add advanced node filtering and optional offline metadata persistence
  Description:
  - Add node-level filters (online/degraded/offline, host, role, endpoint profile).
  - Add optional persistence of node metadata history for recovery and large topologies.
  Dependencies: T021-subA
  Estimated effort: Medium (~1-2 days)
  Required outputs: Responsive filtering + persistence with safe fallback.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
- ID: T021-subC
  Status: [ ] Todo
  Title: Add live metering and stream health hooks in topology view
  Description:
  - Add metering/event hooks at node and route level without blocking main routing interactions.
  - Ensure data sampling frequency degrades gracefully under large topologies.
  Dependencies: T021-subA
  Estimated effort: Medium (~1-2 days)
  Required outputs: Metering hooks ready for implementation of stream-level health surfaces.
  Assigned to: Unassigned
  Last updated: 2026-02-21 11:48 - Codex
Assigned to: MAP2 Web
Last updated: 2026-02-21 11:48 - Codex

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

- Run in parallel: T001-subA, T003-subA, T008-subA  
- Run in parallel after dependencies: T002-subA with T004-subA once T001 is stable  
- Keep sequential: T007-subB after T004 and T007-subA
