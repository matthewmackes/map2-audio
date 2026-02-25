## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

## Top Tasks (Show 5-10 First)

ID: T001  
Status: [✓] Done  
Title: Add "Reset to Default, Rejoin" clone reset flow in Cluster Dashboard advanced menu  
Description:  
- Goal / acceptance criteria: Provide a backend API and Cluster Dashboard advanced UI action that resets clone-specific node identity state and re-registers the node into a cluster; return clear success/error payloads.  
- Why it matters: Cloned MAP2 nodes need a deterministic, operator-safe onboarding path to avoid identity collisions and speed cluster expansion.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: New cluster reset/rejoin service, API endpoints, advanced-menu UI tab/action, updated worklist status evidence.  
Subtasks:  
ID: T001-subA  
Status: [✓] Done  
Title: Implement backend clone reset + rejoin service and API routes  
Description:  
- Goal / acceptance criteria: Add reset/rejoin logic with structured response and guardrails in cluster API.  
- Why it matters: Enables one-command operational recovery from cloned identity state.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: Service module + route handlers.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
ID: T001-subB  
Status: [✓] Done  
Title: Add Cluster Dashboard advanced menu UI for reset/rejoin operation  
Description:  
- Goal / acceptance criteria: Add a clear advanced action panel with confirmation and result rendering.  
- Why it matters: Operators need direct GUI access without shell intervention.  
- Dependencies: T001-subA  
- Estimated effort: Medium  
- Required outputs: New tab/component wired into Cluster Dashboard advanced category.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
Assigned to: Codex  
Last updated: 2026-02-23 00:00 - Codex
- Completion notes:
  - What was done: Added backend clone reset/rejoin service (`app/services/cluster/clone_reset.py`), exposed preview + execute APIs (`/api/cluster/node/reset-default-rejoin/preview`, `/api/cluster/node/reset-default-rejoin`), and added Cluster Dashboard advanced-menu tab (`advanced-ops`) with guarded execution UI.
  - Key findings: Clone onboarding failures are primarily persisted identity/trust artifacts, not source-code differences; reset can preserve audio content while regenerating identity.
  - Files/links produced: `app/services/cluster/clone_reset.py`, `app/routes/cluster_admin.py`, `web/src/app/components/ClusterDashboard/ClusterAdvancedOperationsTab.tsx`, `web/src/app/pages/ClusterDashboardPage.tsx`.
  - Suggested next tasks: T002, T003, T005

ID: T002  
Status: [✓] Done  
Title: Add targeted tests for clone reset/rejoin API behavior  
Description:  
- Goal / acceptance criteria: Validate success path and failure payload semantics for reset/rejoin API without hardware dependency.  
- Why it matters: Prevent regressions in cluster onboarding controls.  
- Dependencies: T001  
- Estimated effort: Medium  
- Required outputs: Backend/API test coverage for new endpoints and payload contract.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 09:09 - Codex
- Completion notes:
  - What was done: Added targeted route tests for clone reset preview/execute endpoints, including success payloads, partial-status mapping, request bool coercion, and exception-to-HTTP 500 behavior.
  - Key findings: Route-level testing with monkeypatched service functions gives deterministic contract coverage without requiring cluster hardware.
  - Files/links produced: `tests/test_cluster_admin_clone_reset_routes.py`.
  - Suggested next tasks: T005, T008, T900

ID: T003  
Status: [✓] Done  
Title: Document operator runbook for clone reset + cluster rejoin  
Description:  
- Goal / acceptance criteria: Publish GUI/API runbook with pre-checks, expected outcomes, and rollback guidance.  
- Why it matters: Ensures repeatable field operations and lower support burden.  
- Dependencies: T001  
- Estimated effort: Low  
- Required outputs: Documentation update in `docs/`.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 09:09 - Codex
- Completion notes:
  - What was done: Published an operator runbook covering prerequisites, API/GUI procedures, expected responses, verification commands, and rollback/recovery guidance.
  - Key findings: The execute endpoint intentionally returns HTTP 200 with structured partial-failure details, so operators should treat `status: partial` as actionable recovery state.
  - Files/links produced: `docs/CLUSTER_CLONE_RESET_REJOIN_RUNBOOK.md`.
  - Suggested next tasks: T005, T008, T900

ID: T004  
Status: [✗] Blocked  
Title: Complete hardware AVB qualification gates Q04-Q06  
Description:  
- Goal / acceptance criteria: Run HIL discovery/churn, PTP timing, and soak tests and record pass/fail evidence.  
- Why it matters: Required for production AVB readiness claims.  
- Dependencies: AVB-capable lab availability  
- Estimated effort: High  
- Required outputs: Updated qualification matrix and archived artifacts.  
Subtasks: None  
Assigned to: Lab + Codex  
Last updated: 2026-02-23 00:00 - Codex

ID: T005  
Status: [✓] Done  
Title: Wire AVB auto-connect config into runtime behavior  
Description:  
- Goal / acceptance criteria: Ensure `avb.auto_connect` drives connection orchestration on startup, not status-only reporting.  
- Why it matters: Needed for hands-off multi-node AVB startup.  
- Dependencies: T001  
- Estimated effort: Medium  
- Required outputs: Backend integration and regression checks.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 09:09 - Codex
- Completion notes:
  - What was done: Wired `avb.auto_connect` into AVB router startup via a background auto-connect orchestrator with deterministic endpoint pairing and retry attempts, added router stats for auto-connect visibility, and added regression tests for enabled/disabled startup behavior.
  - Key findings: Startup auto-connect can run as best-effort background orchestration without blocking service startup while still honoring config-driven enable/disable control.
  - Files/links produced: `app/services/avb/avb_router.py`, `tests/test_avb_router_auto_connect.py`.
  - Suggested next tasks: T008, T004 (when hardware available), T900

ID: T006  
Status: [✓] Done  
Title: Deliver SynthForge Phase 1 core scaffold integrated into JUCE engine and backend API  
Description:  
- Goal / acceptance criteria: Add Phase 1 SynthForge skeleton with 16-part MIDI routing and voice tracking stubs in JUCE (`juce-engine/Source/SynthForge/*`), integrate with `Map2AudioEngine` + Python bindings, and expose `/api/synthforge/*` routes returning deterministic part/voice/patch state.  
- Why it matters: Establishes the minimum viable integration seam for the larger SynthForge roadmap without waiting for full DSP implementation.  
- Dependencies: None  
- Estimated effort: High  
- Required outputs: New SynthForge C++ scaffold, engine/service/route wiring, route tests, updated worklist status and completion notes.  
Subtasks:  
ID: T006-subA  
Status: [✓] Done  
Title: Implement JUCE SynthForge core classes and engine integration hooks  
Description:  
- Goal / acceptance criteria: Add processor/part/router/voice allocator scaffolding and wire prepare/process + control methods into `Map2AudioEngine` and CMake.  
- Why it matters: Provides real C++ integration boundary and RT-safe shape for subsequent phases.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: New files under `juce-engine/Source/SynthForge/`, `Map2AudioEngine` method integration, build source registration.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 00:45 - Codex
ID: T006-subB  
Status: [✓] Done  
Title: Expose SynthForge controls through Python service and FastAPI routes  
Description:  
- Goal / acceptance criteria: Add pybind methods, `juce_engine_service` wrappers, and `/api/synthforge/*` endpoints for parts/patches/parameters/voice metrics.  
- Why it matters: Makes SynthForge controllable from MAP2 backend/frontend layers immediately.  
- Dependencies: T006-subA  
- Estimated effort: Medium  
- Required outputs: `PythonBindings.cpp` additions, service wrappers, new route module, route registration.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 00:45 - Codex
ID: T006-subC  
Status: [✓] Done  
Title: Add route-level validation tests for SynthForge API contract  
Description:  
- Goal / acceptance criteria: Cover success and input-validation cases for core SynthForge route endpoints with deterministic mocks.  
- Why it matters: Prevents endpoint regressions during rapid Phase 1 iteration.  
- Dependencies: T006-subB  
- Estimated effort: Low  
- Required outputs: New pytest module for SynthForge route behavior.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 00:45 - Codex
Assigned to: Codex  
Last updated: 2026-02-24 00:45 - Codex
- Completion notes:
  - What was done: Implemented the SynthForge Phase 1 JUCE scaffold (part/midi/voice core), integrated it into `Map2AudioEngine` and pybind, added `juce_engine_service` wrappers, created `/api/synthforge/*` routes, registered the route in app bootstrap, and added route contract tests.
  - Key findings: A non-audio SynthForge core can be integrated immediately for deterministic control/metrics, allowing frontend/backend integration to proceed while DSP voice rendering is developed in Phase 2.
  - Files/links produced: `juce-engine/Source/SynthForge/*`, `juce-engine/Source/Map2AudioEngine.{h,cpp}`, `juce-engine/Source/PythonBindings.cpp`, `app/services/juce_engine_service.py`, `app/routes/synthforge.py`, `app/main.py`, `app/deployment/juce_processors.json`, `tests/test_synthforge_routes.py`, `app/routes/plugins.py`.
  - Suggested next tasks: T007, T002, T003

ID: T007  
Status: [✓] Done  
Title: Implement SynthForge Phase 2 basic subtractive synthesis voices  
Description:  
- Goal / acceptance criteria: Add audible single-oscillator synth voice path with parameter control and polyphony validation according to Phase 2 goals.  
- Why it matters: Converts Phase 1 integration scaffold into functional instrument output.  
- Dependencies: T006  
- Estimated effort: High  
- Required outputs: Synth voice DSP classes, parameter wiring, voice CPU validation notes.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 07:56 - Codex
- Completion notes:
  - What was done: Added a real SynthForge Phase 2 voice path with single-oscillator synthesis (sine/saw/square/triangle), ADSR envelope, low-pass filter, and per-part audio rendering/mixing; added lock-free MIDI handoff from `MidiHandler` thread into the audio callback so note/control/program events reach SynthForge in real time.
  - Key findings: The existing engine had MIDI callback plumbing but no audio-thread MIDI queue feed; adding this bridge enabled both SynthForge processing and downstream graph MIDI usage in the callback path.
  - Files/links produced: `juce-engine/Source/SynthForge/Sound/SynthVoice.{h,cpp}`, `juce-engine/Source/SynthForge/Core/Part.{h,cpp}`, `juce-engine/Source/SynthForge/SynthForgeProcessor.cpp`, `juce-engine/Source/Map2AudioEngine.{h,cpp}`, `juce-engine/CMakeLists.txt`.
  - Suggested next tasks: T008, T002, T003

ID: T008  
Status: [✓] Done  
Title: Validate SynthForge live-audio polyphony and CPU behavior at Tier A settings  
Description:  
- Goal / acceptance criteria: Run runtime validation of SynthForge note triggering and polyphony under locked settings (`48kHz`, `64` buffer), confirm clean note-on/off behavior and measure CPU headroom at increasing voice counts.  
- Why it matters: Compile-time success confirms integration, but production readiness needs measured runtime behavior and stress evidence.  
- Dependencies: T007  
- Estimated effort: Medium  
- Required outputs: Reproducible validation commands, measured results (voice counts/CPU/xruns), and follow-up fixes/tasks for any observed artifacts.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 12:05 - Codex
- Completion notes:
  - What was done: Re-ran SynthForge runtime validation at `48kHz/64` after callback-path remediation and captured refreshed JSON/markdown evidence with injected note bursts (`8/16/32/64`).
  - Key findings: Audio callback path is now active on this host; voice metrics track requested notes (`8/16/32/64`) with clean note-off return to `0`, engine-wide CPU remained ~`35-38%`, and xruns stayed `0`.
  - Files/links produced: `docs/fit-for-purpose-evidence/20260224/SYNTHFORGE_T008_VALIDATION.md`, `docs/fit-for-purpose-evidence/20260224/synthforge-runtime-validation.json`.
  - Suggested next tasks: T010, T004, T900

ID: T009  
Status: [✓] Done  
Title: Restore real callback path for SynthForge validation host and re-run T008 measurements  
Description:  
- Goal / acceptance criteria: Configure a working JACK/PipeWire or concrete ALSA callback device so SynthForge voice and CPU metrics become non-zero under injected note bursts, then re-run T008 and capture updated evidence.  
- Why it matters: Without an active callback path, runtime polyphony/CPU conclusions are invalid and Tier A readiness cannot be assessed.  
- Dependencies: T008  
- Estimated effort: Medium  
- Required outputs: Host audio-backend remediation notes, successful non-zero voice metric capture at 48kHz/64 buffer, updated `docs/fit-for-purpose-evidence/...` artifacts, and T008 status update.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 12:05 - Codex
- Completion notes:
  - What was done: Re-enabled default JUCE device types, hardened callback channel/sample bounds, root-caused post-`start_audio()` segfault to `H3000Processor` glide-zero math, added fast-math-safe guardrails in pitch/delay code, set default SynthForge part MIDI channels to `1..16`, and added subprocess regression coverage for start/stop stability.
  - Key findings: Crash root cause was undefined behavior in `H3000Processor::PitchShifter::process` triggered by `glide=0` (invalid coefficient path), not the device manager callback itself; after fix, ASAN and Release runs are stable and callback metrics are non-zero.
  - Files/links produced: `juce-engine/Source/JuceAudioIO.cpp`, `juce-engine/Source/Map2AudioEngine.cpp`, `juce-engine/Source/H3000Processor.cpp`, `juce-engine/Source/SynthForge/SynthForgeProcessor.cpp`, `juce-engine/CMakeLists.txt`, `tests/test_juce_engine_audio_start_stability.py`.
  - Suggested next tasks: T010, T004, T900

ID: T010  
Status: [✓] Done  
Title: Run sustained Tier A SynthForge stress profiling and jitter/xrun qualification  
Description:  
- Goal / acceptance criteria: Execute sustained (`>=30 min`) SynthForge stress sessions at `48kHz/64` with controlled note patterns and capture callback jitter, xrun rate, and CPU headroom trends suitable for enterprise deployment sign-off.  
- Why it matters: Short validation confirms callback functionality, but production claims need longer-run stability and timing characterization under realistic load.  
- Dependencies: T008, T009  
- Estimated effort: Medium  
- Required outputs: Reproducible soak scripts, archived evidence under `docs/fit-for-purpose-evidence/`, and pass/fail summary against Tier A thresholds.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 19:35 - Codex
- Completion notes:
  - What was done: Implemented a reusable soak harness (`scripts/run_synthforge_tier_a_soak.py`) and executed a full 30-minute Tier A run (`1800s`, `1s` sampling, 8/16/32/64 voice cycling), then archived JSON + markdown evidence.
  - Key findings: Functional stability is good (no callback crash, voice tracking and note injection reliability high), but this host fails strict Tier A timing gates with `2579` xruns and `38.40ms` worst-case jitter; CPU headroom/utilization gates passed.
  - Files/links produced: `scripts/run_synthforge_tier_a_soak.py`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-30m.json`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-30m.md`.
  - Suggested next tasks: T011, T004, T900

ID: T011  
Status: [✗] Blocked  
Title: Remediate host real-time jitter/xrun behavior and re-qualify SynthForge soak gates  
Description:  
- Goal / acceptance criteria: Apply host-level real-time tuning/remediation (scheduler, IRQ affinity, backend/device path, isolation) and re-run `T010` until xrun/jitter thresholds pass or blockers are explicitly documented.  
- Why it matters: Current soak evidence shows functional correctness but fails enterprise timing requirements; production-grade sign-off needs sustained pass under the same harness.  
- Dependencies: T010  
- Estimated effort: High  
- Required outputs: Remediation change log, before/after soak evidence comparison, updated threshold pass/fail matrix, and final recommendation (go/no-go).  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 16:50 - Codex
- Completion notes:
  - What was done: Executed host RT diagnostics (`verify_rt_config.sh --quick`) and multiple remediation soak runs (pinned RT, pw-jack wrapper, steady-clock callback timing patch), then captured comparison artifacts and reran start/stop regression tests.
  - Key findings: Best short remediation run (`rtpin + steady_clock`, 5m) improved xrun rate from `85.96/min` baseline (`T010` 30m) to `35.98/min`, but strict gates still fail (`xruns > 0`, peak jitter `23.38ms` > `0.2ms`). Extended 10-minute rerun remained unstable (`24094` xruns, fails headroom/budget gates). Forced JACK backend remains unstable (`MAP2_AUDIO_PREFER_JACK=1` reproduces `SIGSEGV`, exit code `139`).
  - Files/links produced: `juce-engine/Source/JuceAudioIO.cpp`, `juce-engine/Source/JuceAudioIO.h`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-5m.json`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-pwjack-5m.json`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-steadyclock-5m.json`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-rtpin-steadyclock-10m.json`, `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-remediation-t011.md`.
  - Suggested next tasks: T012, T013, T004

ID: T012  
Status: [>] In Progress  
Title: Root-cause and fix forced JACK backend SIGSEGV under SynthForge callback load  
Description:  
- Goal / acceptance criteria: Reproduce `MAP2_AUDIO_PREFER_JACK=1` crash path in a deterministic harness, implement lifecycle/threading/DSP fix, and validate no segfault across repeated initialize/start/stop and a 5-minute JACK soak.  
- Why it matters: Enterprise-grade low-latency deployment requires a stable JACK callback path; current forced JACK mode crashes (`RC=139`) and blocks backend-selection hardening.  
- Dependencies: T011  
- Estimated effort: High  
- Required outputs: Root-cause analysis notes, C++ fix, regression tests (subprocess/JACK path), and updated evidence artifacts.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 16:59 - Codex

ID: T013  
Status: [ ] Todo  
Title: Execute privileged host RT remediation and full-duration Tier A re-qualification  
Description:  
- Goal / acceptance criteria: Apply root-required host tuning (USB autosuspend, IRQ affinity/service priorities as needed), then run full-duration Tier A soak (`>=30m`) and archive final pass/fail evidence against strict thresholds.  
- Why it matters: Current remediation reduced xrun density but did not meet Tier A gates; remaining improvements require host-level controls not available in unprivileged command sessions.  
- Dependencies: T011  
- Estimated effort: High  
- Required outputs: Privileged tuning change log, full-duration soak artifacts, final go/no-go recommendation.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 16:50 - Codex

## Backlog

ID: T900  
Status: [✓] Done  
Title: Consolidate historical AVB planning docs into canonical worklist references  
Description:  
- Goal / acceptance criteria: Cross-link legacy planning docs and keep this worklist as the execution source of truth.  
- Why it matters: Reduces planning drift and duplicate status reporting.  
- Dependencies: None  
- Estimated effort: Low  
- Required outputs: Cross-reference note set in `docs/PROJECT_WORKLIST.md`.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 09:16 - Codex
- Completion notes:
  - What was done: Consolidated legacy planning/evidence docs into explicit reference pointers below and reaffirmed this file as the canonical execution tracker.
  - Key findings: Historical docs remain useful as evidence/context, but task state must stay centralized here to avoid drift.
  - Files/links produced: `docs/PROJECT_WORKLIST.md`.
  - Reference pointers:
    - `docs/FIT_FOR_PURPOSE_EVALUATION_PACK_2026-02-23.md`
    - `docs/RUNBOOK_EVALUATION.md`
    - `docs/fit-for-purpose-evidence/20260223/`
    - `docs/fit-for-purpose-evidence/20260224/SYNTHFORGE_T008_VALIDATION.md`
    - `docs/fit-for-purpose-evidence/20260224/synthforge-runtime-validation.json`
  - Suggested next tasks: T009, T004
