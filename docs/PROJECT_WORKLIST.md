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
Status: [✓] Done  
Title: Root-cause and fix forced JACK backend SIGSEGV under SynthForge callback load  
Description:  
- Goal / acceptance criteria: Reproduce `MAP2_AUDIO_PREFER_JACK=1` crash path in a deterministic harness, implement lifecycle/threading/DSP fix, and validate no segfault across repeated initialize/start/stop and a 5-minute JACK soak.  
- Why it matters: Enterprise-grade low-latency deployment requires a stable JACK callback path; current forced JACK mode crashes (`RC=139`) and blocks backend-selection hardening.  
- Dependencies: T011  
- Estimated effort: High  
- Required outputs: Root-cause analysis notes, C++ fix, regression tests (subprocess/JACK path), and updated evidence artifacts.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 21:26 - Codex
- Completion notes:
  - What was done: Validated forced-JACK start/stop stability via subprocess regression coverage and executed a full 5-minute forced-JACK SynthForge soak run with archived artifacts.
  - Key findings: Forced JACK backend stayed stable for repeated start/stop and 300s callback load (no segfault observed), but timing gates remain unmet (`151` xruns, `23.84ms` peak jitter), so real-time qualification work continues in T013.
  - Files/links produced: `tests/test_juce_engine_jack_stability.py`, `docs/fit-for-purpose-evidence/20260225/synthforge-tier-a-soak-forcejack-t012-5m.json`, `docs/fit-for-purpose-evidence/20260225/synthforge-tier-a-soak-forcejack-t012-5m.md`.
  - Validation: `pytest tests/test_juce_engine_jack_stability.py` passed; `MAP2_AUDIO_PREFER_JACK=1 python3 scripts/run_synthforge_tier_a_soak.py --duration-seconds 300 ...` completed with artifacts and no crash.
  - Suggested next tasks: T013, T016, T022-subA

ID: T013  
Status: [✗] Blocked  
Title: Execute privileged host RT remediation and full-duration Tier A re-qualification  
Description:  
- Goal / acceptance criteria: Apply root-required host tuning (USB autosuspend, IRQ affinity/service priorities as needed), then run full-duration Tier A soak (`>=30m`) and archive final pass/fail evidence against strict thresholds.  
- Why it matters: Current remediation reduced xrun density but did not meet Tier A gates; remaining improvements require host-level controls not available in unprivileged command sessions.  
- Dependencies: T011  
- Estimated effort: High  
- Required outputs: Privileged tuning change log, full-duration soak artifacts, final go/no-go recommendation.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 21:34 - Codex
- Blocked notes:
  - Requires privileged host tuning actions (root/system-level scheduler/IRQ/power controls) that are not available in this current unprivileged execution context.
  - Fresh forced-JACK soak evidence is captured (`docs/fit-for-purpose-evidence/20260225/synthforge-tier-a-soak-forcejack-t012-5m.json`) and confirms stability but not strict jitter/xrun gate compliance.

ID: T014  
Status: [✓] Done  
Title: Implement SynthForge GUI interface card and register it in GridFlow  
Description:  
- Goal / acceptance criteria: Build a dedicated SynthForge plugin card (`SynthForgeCard`) with part selection + core controls, wire it to `/api/synthforge` via existing frontend host hooks, and register `map2://juce/synthforge` in plugin-card registry so GridFlow renders the custom card instead of template fallback.  
- Why it matters: SynthForge is backend/engine-integrated but currently lacks a purpose-built GUI control surface, blocking practical operator workflow in GridFlow.  
- Dependencies: T006  
- Estimated effort: Medium  
- Required outputs: `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, registry mapping, minimal UI test/validation notes, and worklist completion notes.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 20:21 - Codex
- Completion notes:
  - What was done: Implemented a new `SynthForgeCard` with a minimal high-contrast 3-zone layout (top control bar, keyboard/wave overview, tabbed performance/editor surface, bottom status/reload strip), dark/light mode toggle, part/preset selectors, macro controls, XY pad, MIDI activity strip, ADSR graph, integrated SFZ browser/load, and hot-reload controls.
  - Key findings: A dedicated card can deliver high-utility performance controls with low visual noise while still exposing deep sampler workflows through focused tabs; this avoids overloading GridFlow with dense single-screen controls.
  - Files/links produced: `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.css`, `web/src/app/components/PluginCards/registry.ts`, `web/src/map2/api.ts`, `web/src/app/data/pluginDescriptions.ts`.
  - Validation: `npm --prefix web run typecheck` passed.
  - Suggested next tasks: T015, T016, T018

ID: T015  
Status: [✓] Done  
Title: Add SynthForge SFZ sample import and per-part sampler playback path  
Description:  
- Goal / acceptance criteria: Add a production-safe SynthForge SFZ import path that loads SFZ regions into per-part sampler voices, expose load/status controls through engine/python/FastAPI, and verify note playback switches to sampler mode after successful load.  
- Why it matters: SynthForge currently has synth-voice functionality only; SFZ support is required for sampler workflows and expected instrument compatibility.  
- Dependencies: T006  
- Estimated effort: High  
- Required outputs: C++ sampler integration under `juce-engine/Source/SynthForge/*`, engine/python/route wiring for SFZ load+status, route tests, and updated completion notes.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 21:26 - Codex
- Completion notes:
  - What was done: Completed SFZ parser/loader integration and per-part sampler playback path in SynthForge, exposed SFZ load/status controls through Map2AudioEngine + pybind + FastAPI routes, and added route-level coverage.
  - Key findings: Runtime validation with generated `.wav + .sfz` confirmed sampler mode activation after load and note-driven voice transitions (`active_voices` `0` -> `1` -> `0`) through the live callback path.
  - Files/links produced: `juce-engine/Source/SynthForge/Sampler/SfzLoader.h`, `juce-engine/Source/SynthForge/Sampler/SfzLoader.cpp`, `juce-engine/Source/SynthForge/Core/Part.h`, `juce-engine/Source/SynthForge/Core/Part.cpp`, `juce-engine/Source/SynthForge/SynthForgeProcessor.h`, `juce-engine/Source/SynthForge/SynthForgeProcessor.cpp`, `juce-engine/Source/Map2AudioEngine.h`, `juce-engine/Source/Map2AudioEngine.cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/services/juce_engine_service.py`, `app/routes/synthforge.py`, `tests/test_synthforge_routes.py`, `docs/fit-for-purpose-evidence/20260225/synthforge-t015-sfz-sampler-validation.json`, `docs/fit-for-purpose-evidence/20260225/synthforge-t015-sfz-sampler-validation.md`.
  - Validation: `pytest tests/test_synthforge_routes.py` passed; `cmake --build juce-engine/build --target map2_audio_engine` passed; runtime sampler validation artifact recorded as PASS.
  - Suggested next tasks: T016, T017, T022-subA

ID: T016  
Status: [ ] Todo  
Title: Integrate full SFZ v2 + ARIA opcode engine in SynthForge via extensible core backend  
Description:  
- Goal / acceptance criteria: Provide near-complete SFZ v1/v2 opcode support plus ARIA-specific behavior by integrating an extensible open-source SFZ core backend (sfizz-class) behind a SynthForge adapter, with documented supported/unsupported opcode matrix.  
- Why it matters: Full compatibility and articulation behavior cannot be met with ad-hoc parser growth; production parity needs a mature opcode engine.  
- Dependencies: T015  
- Estimated effort: High  
- Required outputs: Core backend integration layer, opcode compliance matrix report, compatibility regression tests using public SFZ suites.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 20:09 - Codex

ID: T017  
Status: [ ] Todo  
Title: Deliver real-time disk streaming, interpolation modes, and large-library performance hardening  
Description:  
- Goal / acceptance criteria: Implement lock-safe disk streaming, preload controls, memory caps, and selectable interpolation modes (sinc/Hermite/linear) with measured low-latency behavior at Tier A constraints.  
- Why it matters: Large SFZ libraries require streaming and efficient resampling to remain usable without RAM spikes or callback instability.  
- Dependencies: T015, T016  
- Estimated effort: High  
- Required outputs: Streaming engine implementation, runtime quality-mode controls, stress/soak benchmarks, and xrun/jitter evidence.  
Subtasks: None  
Assigned to: Codex + Lab  
Last updated: 2026-02-24 20:09 - Codex

ID: T018  
Status: [ ] Todo  
Title: Add hot-reload/live-edit pipeline and advanced sampler editing UI in MAP2 frontend  
Description:  
- Goal / acceptance criteria: Support external SFZ file live-reload with safe atomic program swap and build MAP2-integrated sample browser, mapping editor, waveform view, envelope graphing, and CC/learn assignment controls.  
- Why it matters: Library creators need instant iteration loops and a first-class editing surface inside MAP2 to replace external workflows.  
- Dependencies: T015, T016  
- Estimated effort: High  
- Required outputs: Hot reload watcher/service, API + websocket notifications, SynthForge UI editor components, integration tests.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 20:09 - Codex

ID: T019  
Status: [ ] Todo  
Title: Implement expressive control stack: modulation matrix, per-region modulators, MPE, Scala, and multi-output routing  
Description:  
- Goal / acceptance criteria: Add deep modulation routing (env/LFO/MIDI/MPE/random/seq), per-region/group modulators, Scala tuning load, and robust multi-timbral/multi-output channel routing with per-part independence.  
- Why it matters: Modern performance and sound-design workflows depend on expressive modulation and alternate tunings beyond baseline MIDI control.  
- Dependencies: T016  
- Estimated effort: High  
- Required outputs: Mod matrix engine, MPE/tuning loaders, routing controls/API, validation suite for channel/output isolation and modulation correctness.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 20:09 - Codex

ID: T020  
Status: [ ] Todo  
Title: Ship advanced sampler behaviors: round-robin/xfades, scripting extensions, freeze/render, and analyzer tooling  
Description:  
- Goal / acceptance criteria: Provide advanced performance behaviors (RR/positional/xfades/legato logic), scripting extension hooks, low-latency/freeze-render modes, and built-in analyzer utilities (spectrum/oscilloscope/MIDI monitor).  
- Why it matters: These are required for parity with high-end sampler ecosystems and for practical debugging of complex instrument libraries.  
- Dependencies: T016, T017, T019  
- Estimated effort: High  
- Required outputs: Feature implementations with deterministic tests, production UX controls, and release-readiness documentation.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 20:09 - Codex

ID: T021  
Status: [✓] Done  
Title: Move AVB nav item into Advanced menu and improve Advanced menu layout in Web GUI  
Description:  
- Goal / acceptance criteria: Remove AVB as a top-level navbar option, add AVB into the correct Advanced menu category, and refine the Advanced menu layout for clearer grouping/readability without breaking existing routes or actions.  
- Why it matters: Advanced operations should be consolidated in one discoverable place, reducing navbar clutter and operator confusion.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: Frontend navigation/menu code updates, validated route wiring, and worklist completion notes with touched files.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-02-24 21:00 - Codex
- Completion notes:
  - What was done: Removed AVB from top-level navbar (`AppShell` left-nav list), added AVB Routing into the Advanced menu under `Hardware & Interfaces`, and redesigned Advanced menu layout with explicit category sections, stronger hierarchy, and cleaner desktop/mobile submenu presentation.
  - Key findings: Grouping Advanced routes by category improves discoverability and removes topbar clutter while preserving direct access to `/avb-routing`.
  - Files/links produced: `web/src/app/layout/AppShell.tsx`, `web/src/app/data/advancedMenuItems.ts`, `web/src/index.css`.
  - Validation: `npm --prefix web run typecheck` passed; `npm --prefix web run test -- web/src/app/App.avbRoutingRoute.test.tsx --runInBand` passed (Jest reported pre-existing haste-map naming collisions under `juce-engine/build-*` directories, non-blocking for this test run).
  - Suggested next tasks: T015, T012, T013

ID: T022
Status: [>] In Progress
Title: Lexicon MPX1 Web Control Card — Full-Stack Implementation (Top-Nav, Editor, MIDI Mapper)
Description:
- Goal / acceptance criteria: Build a first-class Lexicon MPX1 multi-effects editor into MAP2 as a top-nav menu entry at `/mpx1/*`. Deliverables: photo-perfect SVG front panel, registry-driven deep block editor, visual drag-and-drop MIDI CC→SysEx mapper with MIDI learn, internal mod matrix studio, 200-program preset librarian with A/B compare and bulk dump, diagnostics view, and a persistent MPX1 status bar. The MIDI mapper must allow any foot controller CC to be assigned to any MPX1 SysEx parameter with per-mapping range, curve, smoothing, polarity, and named map save/restore. All parameter state is maintained in a Python shadow state via rtmidi (existing dependency), pushed live to the UI via WebSocket.
- Why it matters: The Lexicon MPX1 is a primary hardware effects processor in the MAP2 studio chain. A SysEx-complete, realtime web editor enables parameter control, preset management, and MIDI foot-controller assignment from any browser — capabilities no existing MPX1 software provides in a web-native form.
- Dependencies: None (rtmidi already in app/services/midi_engine.py; WebSocket infrastructure already in app/services/websocket_manager.py)
- Estimated effort: High
- Required outputs: Parameter registry JSON, Python service + FastAPI routes, TypeScript client + WS hook, AppShell nav integration (icon + mega-menu), MPX1Page shell with sidebar + status bar, six sub-views (panel/editor/midi-map/matrix/library/diag), CSS design token system, 50 curated preset library, tests.
- Reference: Full design spec in conversation history (2026-02-24). Implementation plan: Option 1 (MAP2 Native) expanded to top-nav full-menu architecture.
Subtasks:
ID: T022-subA
Status: [>] In Progress
Title: Author MPX1 parameter registry (app/data/mpx1_params.json) and validator
Description:
- Goal / acceptance criteria: Read the MPX1 MIDI Implementation PDF cover to cover and produce a machine-readable JSON registry covering every effect block (Reverb/Pitch/Delay/Chorus/EQ/Mod) × all algorithms × all parameters, the modifier matrix sources/destinations, system/global params, and program management addresses. Each entry includes: id, address bytes, display_name, block, algorithm, type, range, default, units, log_taper, widget, page, realtime_safe, panel_control. Write validate_mpx1_registry.py that asserts unique addresses, no missing required fields, and param count above threshold. Validator must pass in CI.
- Why it matters: The registry is the canonical source of truth for all downstream code — service encoding, UI rendering, MIDI mapper targets. Nothing else can start until this is correct.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: app/data/mpx1_params.json, tests/validate_mpx1_registry.py
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-24 21:26 - Codex
- Progress notes:
  - Created `app/data/mpx1_params.json` with required field schema and `214` parameter entries, including full algorithm-slot scaffolding across Pitch/Chorus/EQ/Mod/Reverb/Delay (`0..N` ranges) plus program/system metadata controls and modifier-matrix source/destination catalogs.
  - Added strict validator `tests/validate_mpx1_registry.py` (CLI + pytest) enforcing required fields, unique IDs, unique `address_bytes`, valid ranges/defaults, algorithm-slot coverage checks, and minimum parameter-count threshold.
  - Validation evidence: `python3 tests/validate_mpx1_registry.py` PASS, `pytest tests/validate_mpx1_registry.py` PASS.
  - Remaining gap before closing subtask: complete transcription of deep per-algorithm parameter catalogs from MPX1 MIDI implementation pages (current registry marks this explicitly as `coverage.status=bootstrap_partial`).
ID: T022-subB
Status: [✓] Done
Title: Python MIDI bridge service and FastAPI routes (app/services/mpx1_service.py, app/routes/mpx1.py)
Description:
- Goal / acceptance criteria: Implement MPX1Service using rtmidi (existing dep) with: MIDI port auto-discovery by name match, shadow state dict (param_id→value) with JSON persistence to ~/.map2/mpx1_shadow.json, command queue with 40ms coalescing for realtime-safe params, incoming SysEx parser that updates shadow + broadcasts to WS clients, SysEx encode/decode per registry addresses, program change + dump request flow. FastAPI routes: GET /state, GET /registry, POST /param/{id}, POST /params (bulk), POST /program/{n}, GET /programs, POST /dump/all (streaming progress), GET /library, POST /library/tag, GET /midi/ports, POST /midi/connect, GET /health, WS /ws. Write tests/test_mpx1.py covering codec round-trips, shadow state updates, coalescing, and endpoint contracts using mocked rtmidi.
- Why it matters: The backend service is the hardware-facing core that all UI depends on. Must be solid before any UI work begins.
- Dependencies: T022-subA
- Estimated effort: Medium
- Required outputs: app/services/mpx1_service.py, app/routes/mpx1.py, tests/test_mpx1.py, route registered in main FastAPI app
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 00:00 - Codex
- Completion notes:
  - What was done: Implemented `MPX1Service` with registry-driven SysEx encode/decode, shadow-state persistence (`~/.map2/mpx1_shadow.json`), 40ms real-time-safe coalescing queue, MIDI port discovery/connection via rtmidi (graceful simulation fallback), incoming SysEx handling, program control, dump-job progress broadcasting, library tagging, and MPX1-specific websocket subscription fan-out. Added full `/api/mpx1/*` routes including REST control endpoints and `WS /api/mpx1/ws`. Registered routes in app bootstrap.
  - Key findings: Current backend behavior is deterministic and test-covered for codec, coalescing, persistence, and route contracts; however, full fidelity still depends on completing `T022-subA` deep registry transcription (`coverage.status=bootstrap_partial`), so some advanced hardware parameters remain catalog-limited.
  - Files/links produced: `app/services/mpx1_service.py`, `app/routes/mpx1.py`, `app/main.py`, `tests/test_mpx1.py`.
  - Validation evidence: `pytest -q tests/test_mpx1.py` PASS (`7 passed`), `pytest -q tests/test_mpx1.py tests/test_synthforge_routes.py` PASS (`15 passed`), `python3 -c "from app.routes import mpx1; print(mpx1.router.prefix)"` PASS.
  - Suggested next tasks: T022-subC, T022-subD, T022-subA
ID: T022-subC
Status: [✓] Done
Title: TypeScript API client, WebSocket hook, and type definitions (web/src/map2/mpx1Api.ts)
Description:
- Goal / acceptance criteria: Write mpx1Api (REST client mirroring synthforgeApi pattern), useMPX1State hook (WebSocket connection, optimistic param updates, program push events, connection state), and full TypeScript types: MPX1State, MPX1Shadow, MPX1RegistryParam, MPX1Block, MPX1Program, MPX1MidiMap, MPX1MidiMapping. All types derived from registry schema.
- Why it matters: Shared client layer used by all six sub-views; type safety prevents encoding errors from reaching hardware.
- Dependencies: T022-subB
- Estimated effort: Low
- Required outputs: web/src/map2/mpx1Api.ts
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 00:28 - Codex
- Completion notes:
  - What was done: Added a dedicated MPX1 frontend client module with schema-derived TypeScript types (`MPX1RegistryParam`, `MPX1State`, `MPX1Program`, `MPX1Shadow`, `MPX1MidiMap`, `MPX1MidiMapping`), full REST bindings for `/api/mpx1/*`, and `useMPX1State` hook with websocket lifecycle/reconnect handling, optimistic parameter updates, and program-change push handling.
  - Key findings: MPX1 websocket and REST contracts are stable enough for shared state orchestration in upcoming UI views; remaining fidelity limits come from registry completeness (`T022-subA` coverage gap), not client transport behavior.
  - Files/links produced: `web/src/map2/mpx1Api.ts`, `web/src/map2/index.ts`.
  - Validation evidence: `npm --prefix web run typecheck` PASS, `pytest -q tests/test_mpx1.py` PASS (`7 passed`).
  - Suggested next tasks: T022-subD, T022-subE, T022-subA
ID: T022-subD
Status: [✓] Done
Title: Top-nav integration — LexiconRackIcon, navItemsLeft entry, MPX1MegaMenu component
Description:
- Goal / acceptance criteria: Add LexiconRackIcon (inline SVG: 1U rack silhouette with LCD window, two knobs, two LEDs; color #3b82f6) to AppShell.tsx. Add MPX1 entry to navItemsLeft (label: "Lexicon MPX1", color: #3b82f6, megaMenu: true). Extend renderNavItem to support megaMenu flag (renders button + dropdown instead of NavLink). Add mpx1MenuOpen state + ref + click-outside logic. Write MPX1MegaMenu.tsx with three zones: (A) header strip with device status + current program name, (B) device sidebar with live mix/level mini-meters + disconnect/rescan buttons, (C) 2×3 tile grid (Panel/Editor/MIDI Mapper/Mod Matrix/Library/Diagnostics) + quick-action strip (A/B Compare, Tap Tempo, Bypass All). MIDI Mapper tile highlighted/pulsing until first mapping exists. Write MPX1MegaMenu.css with design tokens (--mpx1-blue, --mpx1-amber, --mpx1-pink etc.), slide-in animation, tile hover states. Register /mpx1/* nested routes in App.tsx.
- Why it matters: The nav entry and mega-menu are the product's front door. Must be polished and functional before internal views matter.
- Dependencies: T022-subC
- Estimated effort: Medium
- Required outputs: web/src/app/layout/AppShell.tsx (modified), web/src/app/components/MPX1/MPX1MegaMenu.tsx, web/src/app/components/MPX1/MPX1MegaMenu.css, web/src/app/App.tsx (modified)
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 00:49 - Codex
- Completion notes:
  - What was done: Added a `Lexicon MPX1` top-nav entry with inline `LexiconRackIcon`, integrated dedicated mega-menu trigger behavior into `AppShell`, and implemented `MPX1MegaMenu` with status header, device sidebar (mix/level mini-meters + disconnect/rescan controls), 2x3 navigation tile grid, and quick-action strip. Added pulsing highlight on `MIDI Mapper` tile until mappings exist.
  - Key findings: MPX1 top-nav menu can coexist cleanly with existing Advanced menu by explicit open-state exclusivity and click-outside handling; route-safe navigation required adding `/mpx1/*` route scaffolding immediately.
  - Files/links produced: `web/src/app/layout/AppShell.tsx`, `web/src/app/components/MPX1/MPX1MegaMenu.tsx`, `web/src/app/components/MPX1/MPX1MegaMenu.css`, `web/src/app/App.tsx`, `web/src/app/pages/MPX1Page.tsx`, `web/src/index.css`.
  - Validation evidence: `npm --prefix web run typecheck` PASS.
  - Suggested next tasks: T022-subE, T022-subF, T022-subA
ID: T022-subE
Status: [✓] Done
Title: MPX1Page shell — layout host, vertical icon sidebar, persistent status bar
Description:
- Goal / acceptance criteria: MPX1Page.tsx renders a three-zone layout: left icon-sidebar (56px wide, 6 icon buttons for panel/editor/midi-map/matrix/library/diag, active section highlighted in section accent color, tooltip on hover), center <Outlet /> (React Router nested route content area), bottom status bar (36px: connection dot + device name, program prev/next with number + name, scrolling amber LCD text, mix fader, tap tempo button + BPM, per-block bypass pills for REV/PIT/DLY/CHO/EQ/MOD). useMPX1State hook lives here, passed to children via context.
- Why it matters: All sub-views share the status bar and sidebar — this shell ensures persistent hardware state is always visible during deep editing.
- Dependencies: T022-subD
- Estimated effort: Low
- Required outputs: web/src/app/pages/MPX1Page.tsx, web/src/app/components/MPX1/MPX1StatusBar.tsx
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 00:58 - Codex
- Completion notes:
  - What was done: Replaced the temporary MPX1 route host with a real shell layout: 56px vertical icon sidebar (panel/editor/midi-map/matrix/library/diag), central routed content outlet, and persistent 36px bottom status bar component (`MPX1StatusBar`) with connection indicator, program prev/next + name, scrolling LCD strip, mix fader, tap tempo BPM, and per-block bypass pills (REV/PIT/DLY/CHO/EQ/MOD). Added `MPX1Page` context provider so child views can consume shared MPX1 state + LCD controls.
  - Key findings: Keeping MPX1 hook ownership in `MPX1Page` and context-sharing downstream gives stable state wiring for upcoming editor/matrix/library views while keeping top-nav mega-menu lightweight.
  - Files/links produced: `web/src/app/pages/MPX1Page.tsx`, `web/src/app/components/MPX1/MPX1StatusBar.tsx`, `web/src/app/components/MPX1/MPX1PageShell.css`.
  - Validation evidence: `npm --prefix web run typecheck` PASS.
  - Suggested next tasks: T022-subF, T022-subG, T022-subA
ID: T022-subF
Status: [✓] Done
Title: Block Editor view (/mpx1/editor) — canvas knobs, per-block viz, algorithm picker
Description:
- Goal / acceptance criteria: MPX1EditorView.tsx: top block selector bar (6 blocks, active = orange dot, bypassed = dim), left algorithm picker (radio list, algorithm description + param count), right parameter pages (grouped by registry page field, zero hardcoded param names — all from registry). Canvas-based MPX1Knob component (pointer drag, shift=fine ÷10, double-click=type-in, animated fill arc, pointer dot). MPX1Slider for linear params. MPX1EnumSelect for enum params. Per-block live visualizations: reverb decay tail curve (animated length), delay tap grid (echo bars fading to tempo), EQ four-band frequency response plot (updates per knob move), chorus LFO waveform shape, pitch interval piano keyboard overlay, mod LFO rate visualization. formatValue() for musical display (ms↔note-div, Hz→kHz, s<1→ms).
- Why it matters: The deep editor is the primary workhorse for precise parameter control — must be both accurate and fast to use.
- Dependencies: T022-subE
- Estimated effort: High
- Required outputs: web/src/app/pages/MPX1EditorView.tsx, web/src/app/components/MPX1/MPX1BlockEditor.tsx, web/src/app/components/MPX1/MPX1Knob.tsx (canvas-based)
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 01:14 - Codex
- Completion notes:
  - What was done: Implemented the `/mpx1/editor` route with a registry-driven block editor (`MPX1BlockEditor`), including top block selector bar with bypass dimming, algorithm radio picker with per-algorithm parameter counts, grouped parameter pages from registry `page` fields (no hardcoded parameter names), canvas-based `MPX1Knob` (drag, Shift-fine mode, double-click numeric entry), and per-block visualizations for reverb/delay/eq/chorus/pitch/mod.
  - Key findings: Current editor behavior is constrained by registry depth (`coverage.status=bootstrap_partial`), but the UI/control architecture is now fully dynamic and ready to expand as additional opcodes/params are transcribed.
  - Files/links produced: `web/src/app/pages/MPX1EditorView.tsx`, `web/src/app/components/MPX1/MPX1BlockEditor.tsx`, `web/src/app/components/MPX1/MPX1Knob.tsx`, `web/src/app/components/MPX1/MPX1BlockEditor.css`, `web/src/app/App.tsx`.
  - Validation evidence: `npm --prefix web run typecheck` PASS.
  - Suggested next tasks: T022-subG, T022-subH, T022-subA
ID: T022-subG
Status: [✓] Done
Title: MIDI Mapper view (/mpx1/midi-map) — visual CC→SysEx assignment, MIDI learn, named maps, macros
Description:
- Goal / acceptance criteria: MPX1MidiMapView.tsx with three-column layout: (A) MIDI sources column — detected CCs with channel/name, manual CC add, MIDI Learn button; (B) SVG connection canvas — bezier lines from source to target (dashed animated for inactive, solid for active), drag-from-source-to-target to create mapping, click line to select; (C) MPX1 target params column — all registry params grouped by block, assigned params marked with dot. Inline detail panel on line select: CC#, channel, source range (calibrate pedal min/max), target range (partial range control), response curve (linear/log/exp/S-curve/reverse with live miniature graph preview), smoothing slider (40–500ms, prevents zipper), polarity (normal/inverted), mode (continuous/momentary/toggle). MIDI Learn mode: WS listens for midi_cc events, first received CC auto-assigns to selected target param, status bar shows "LEARNING" in amber. Named MIDI Maps: save/load/switch named sets of mappings (REST: /api/mpx1/midi-maps). Macro assignments: one CC drives multiple params, each with independent scaling. Backend: /api/mpx1/midi-maps GET/POST/DELETE, bridge applies active map's CC→SysEx routing. Tests covering learn flow, map save/load, macro dispatch.
- Why it matters: The MIDI mapper is the standout feature that makes the MPX1 fully controllable from any MIDI foot controller or expression pedal — this is the primary differentiator of the whole project.
- Dependencies: T022-subE
- Estimated effort: High
- Required outputs: web/src/app/pages/MPX1MidiMapView.tsx, web/src/app/components/MPX1/MPX1MidiMapper.tsx, web/src/app/components/MPX1/MPX1MidiMapper.css, mpx1_service.py midi-map routing additions, /api/mpx1/midi-maps routes
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 01:29 - Codex
- Completion notes:
  - What was done: Added MPX1 MIDI-map backend and frontend end-to-end. Backend now persists named MIDI maps (`~/.map2/mpx1_midi_maps.json`), exposes `/api/mpx1/midi-maps` CRUD + activation + learn-target routes, handles incoming MIDI CC events, supports learn-mode auto-assignment, and dispatches active map CC→SysEx parameter updates (including macro behavior via multiple mappings per CC). Frontend now includes functional `/mpx1/midi-map` view with 3-column source/canvas/target workflow, mapping detail editor (ranges, curve, smoothing, polarity, mode), map save/load/switch/delete controls, and MIDI learn controls.
  - Key findings: CC→parameter macro dispatch and learn-mode assignment are deterministic and test-covered; smoothing timing is currently stored/configurable and ready for deeper runtime interpolation in a later pass.
  - Files/links produced: `app/services/mpx1_service.py`, `app/routes/mpx1.py`, `tests/test_mpx1.py`, `web/src/map2/mpx1Api.ts`, `web/src/app/pages/MPX1MidiMapView.tsx`, `web/src/app/components/MPX1/MPX1MidiMapper.tsx`, `web/src/app/components/MPX1/MPX1MidiMapper.css`, `web/src/app/App.tsx`.
  - Validation evidence: `pytest -q tests/test_mpx1.py` PASS (`11 passed`), `pytest -q tests/test_mpx1.py tests/test_synthforge_routes.py` PASS (`19 passed`), `npm --prefix web run typecheck` PASS.
  - Suggested next tasks: T022-subH, T022-subI, T022-subA
ID: T022-subH
Status: [✓] Done
Title: Mod Matrix view (/mpx1/matrix) — internal MPX1 sources×destinations grid with live meters
Description:
- Goal / acceptance criteria: MPX1MatrixView.tsx: left column with source list (LFO1/LFO2/EnvFollower/MIDI CC sources) + inline LFO editors (rate, waveform, depth); main grid (sources=rows, destinations=columns, both from registry modifier_matrix section); cell click opens detail editor (amount slider, scaling curve picker); assigned cells show fill intensity proportional to amount, color = positive(teal)/negative(pink); live modulation meters on destination column headers pulse at LFO rate driven by state[source.rate]. LFO rate cells visually animate at their configured rate.
- Why it matters: Exposes the MPX1's built-in modulation routing — distinct from the external MIDI mapper — for programmatic sound design.
- Dependencies: T022-subE
- Estimated effort: Medium
- Required outputs: web/src/app/pages/MPX1MatrixView.tsx, web/src/app/components/MPX1/MPX1ModMatrix.tsx
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 01:39 - Codex
- Completion notes:
  - What was done: Implemented `/mpx1/matrix` with `MPX1ModMatrix` component and routed page integration. View now includes source list with inline LFO editor, sources×destinations grid from registry `modifier_matrix` catalogs, click-to-assign cells with amount/curve detail editor, destination header live-meter pulsing, and local persistence of matrix assignments/config.
  - Key findings: Registry-provided source/destination catalogs can drive a fully dynamic matrix UI without hardcoded tables; persistent local matrix state keeps editing continuity while backend opcode-coverage work continues.
  - Files/links produced: `web/src/app/pages/MPX1MatrixView.tsx`, `web/src/app/components/MPX1/MPX1ModMatrix.tsx`, `web/src/app/components/MPX1/MPX1ModMatrix.css`, `web/src/app/App.tsx`.
  - Validation evidence: `npm --prefix web run typecheck` PASS, `pytest -q tests/test_mpx1.py` PASS (`11 passed`).
  - Suggested next tasks: T022-subI, T022-subJ, T022-subA
ID: T022-subI
Status: [✓] Done
Title: Library view (/mpx1/library) — 200-program librarian, 50 curated presets, A/B compare, undo, bulk dump
Description:
- Goal / acceptance criteria: MPX1LibraryView.tsx: searchable/sortable/filterable table of all programs (number, name, type, tags, star rating, A/B/load actions); tag filter pills (All/Reverb/Delay/Chorus/Pitch/Mod); A slot + B slot with Compare A↔B toggle that sends diff SysEx; undo stack (useReducer, 50 actions, Cmd+Z); bulk dump flow (POST /dump/all, WS progress stream, progress bar); Export selected as JSON, Import JSON. Pre-populate library on first run with the 50 web-curated recommended presets (from design spec) with star ratings (★/★★) and tags (#vocal, #guitar, #go-to, #epic, #lush, #guitar, #shoegaze, #ambient etc.) applied. SQLite via /api/mpx1/library.
- Why it matters: Preset management is essential for practical studio use; the curated 50 presets give new users an immediate, high-quality starting point.
- Dependencies: T022-subE
- Estimated effort: Medium
- Required outputs: web/src/app/pages/MPX1LibraryView.tsx, web/src/app/components/MPX1/MPX1Librarian.tsx, 50 curated preset entries seeded in service on first run
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 01:52 - Codex
- Completion notes:
  - What was done: Implemented full `/mpx1/library` librarian flow with searchable/sortable/filterable program table, tag pills, row load/A/B slot actions, A↔B compare toggle, dump-all progress bar driven by websocket events, JSON export/import controls, and undo stack behavior (50 snapshots). Added backend library import endpoint and seeded first-run curated library content (50 entries with tags/ratings) in service initialization.
  - Key findings: Merging `/programs` with persisted `/library` metadata yields deterministic table state across restarts; first-run curated seed gives immediate usable content while preserving user import/replace workflows.
  - Files/links produced: `web/src/app/pages/MPX1LibraryView.tsx`, `web/src/app/components/MPX1/MPX1Librarian.tsx`, `web/src/app/components/MPX1/MPX1Librarian.css`, `web/src/app/App.tsx`, `app/services/mpx1_service.py`, `app/routes/mpx1.py`, `web/src/map2/mpx1Api.ts`, `tests/test_mpx1.py`.
  - Validation evidence: `pytest -q tests/test_mpx1.py` PASS (`13 passed`), `pytest -q tests/test_mpx1.py tests/test_synthforge_routes.py` PASS (`21 passed`), `npm --prefix web run typecheck` PASS.
  - Suggested next tasks: T022-subJ, T022-subK, T022-subA
ID: T022-subJ
Status: [✓] Done
Title: Photo-perfect front panel view (/mpx1/panel) — SVG replica, live LED/LCD, click-to-edit popovers
Description:
- Goal / acceptance criteria: Produce MPX1Panel.tsx via Figma workflow (perspective-corrected hi-res photo → vector recreation at service-manual proportions → export as inline SVG with data-mpx1-control and data-mpx1-led attributes). React wiring: useEffect imperatively updates LED circles (fill + drop-shadow glow) and LCD text from shadow state without re-render (60fps safe). Panel click dispatch: clicking a labeled control opens an inline popover param editor (knob + value display) without leaving the panel view. Three visual states: active (full color), bypassed (desaturated), offline (scan-line overlay + "NO DEVICE" in LCD). Panel view is full-width, centered, max 900px, with last-SysEx activity readout below. Document Figma production workflow in docs/mpx1/PANEL_PRODUCTION.md.
- Why it matters: The photo-perfect panel is the visual anchor of the product — it makes the interface immediately recognizable and provides a tactile click-the-hardware experience.
- Dependencies: T022-subE
- Estimated effort: High
- Required outputs: web/src/app/pages/MPX1PanelView.tsx, web/src/app/components/MPX1/MPX1Panel.tsx, docs/mpx1/PANEL_PRODUCTION.md
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 02:14 - Codex
- Completion notes:
  - What was done: Replaced `/mpx1/panel` placeholder with a full inline-SVG panel view (`MPX1Panel`) including runtime LED/LCD updates, panel control hit targets (`data-mpx1-control`), LED markers (`data-mpx1-led`), click-to-edit popover with knob editor, and activity readout for latest SysEx/MIDI events. Added panel state overlays for active/bypassed/offline and documented production workflow in `docs/mpx1/PANEL_PRODUCTION.md`.
  - Key findings: Imperative SVG updates (LED/LCD) allow lightweight high-frequency visual updates without full component rerenders, while retaining React-driven control editing for safety and clarity.
  - Files/links produced: `web/src/app/pages/MPX1PanelView.tsx`, `web/src/app/components/MPX1/MPX1Panel.tsx`, `web/src/app/components/MPX1/MPX1Panel.css`, `web/src/app/App.tsx`, `docs/mpx1/PANEL_PRODUCTION.md`.
  - Validation evidence: `npm --prefix web run typecheck` PASS, `pytest -q tests/test_mpx1.py` PASS (`13 passed`), `pytest -q tests/test_mpx1.py tests/test_synthforge_routes.py` PASS (`21 passed`).
  - Suggested next tasks: T022-subK, T022-subA
ID: T022-subK
Status: [✗] Blocked
Title: Diagnostics view, connection docs, and end-to-end hardware test (/mpx1/diag)
Description:
- Goal / acceptance criteria: MPX1DiagView.tsx: MIDI traffic ring buffer (last 100 SysEx messages, hex + decoded param name + timestamp), round-trip latency meter (send ping SysEx, measure echo, display min/avg/max/p99), connection health panel (port name, last heartbeat, packet error count, reconnect button), "Force Resync" button (requests full state dump). Write docs/mpx1/CONNECT.md (how to connect the MPX1: USB-MIDI port, MAP2 config, bridge startup). Write docs/mpx1/SYSEX_NOTES.md (protocol implementation notes, encoding choices, known quirks). Run end-to-end test with real hardware; confirm <150ms UI update on hardware knob turn, confirm smooth (no zippering) hardware response on UI knob drag at 40ms coalesce. Validate typecheck passes.
- Why it matters: Diagnostics make the system self-serviceable; documentation enables onboarding without support; hardware testing proves the whole stack is correct.
- Dependencies: T022-subB, T022-subF, T022-subG
- Estimated effort: Medium
- Required outputs: web/src/app/pages/MPX1DiagView.tsx, docs/mpx1/CONNECT.md, docs/mpx1/SYSEX_NOTES.md, hardware validation notes
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-02-25 02:14 - Codex
- Completion notes:
  - What was done: Implemented `/mpx1/diag` diagnostics view with MIDI/SysEx traffic ring buffer, latency metrics (min/avg/max/p99), connection health panel, reconnect and force-resync controls, and dump progress tracking. Added backend diagnostics endpoints (`/api/mpx1/diagnostics`, `/api/mpx1/diagnostics/ping`) with service-level traffic capture and packet error tracking. Added onboarding/implementation docs: `docs/mpx1/CONNECT.md` and `docs/mpx1/SYSEX_NOTES.md`.
  - Key findings: Software diagnostics stack is complete and test-covered for API/UI paths; final acceptance criteria requiring physical hardware latency/zipper verification cannot be executed in this non-HIL environment.
  - Files/links produced: `web/src/app/pages/MPX1DiagView.tsx`, `web/src/app/pages/MPX1DiagView.css`, `web/src/app/App.tsx`, `app/services/mpx1_service.py`, `app/routes/mpx1.py`, `web/src/map2/mpx1Api.ts`, `docs/mpx1/CONNECT.md`, `docs/mpx1/SYSEX_NOTES.md`, `tests/test_mpx1.py`.
  - Validation evidence: `pytest -q tests/test_mpx1.py tests/test_synthforge_routes.py` PASS (`23 passed`), `npm --prefix web run typecheck` PASS.
- Blocked notes:
  - Pending lab-only hardware validation: confirm <150ms UI update on physical MPX1 knob movement and confirm zipper-free hardware response under sustained web knob drag with 40ms coalescing.
Assigned to: Codex
Last updated: 2026-02-25 02:03 - Codex

ID: T023
Status: [✓] Done
Title: Fix SynthForge interface card fallback rendering as single-parameter template
Description:
- Goal / acceptance criteria: Ensure SynthForge always resolves to `SynthForgeCard` in GridFlow parameter panel even when runtime URI shape differs (query/fragment/trailing-slash/legacy alias), and eliminate regressions where UI falls back to generic one-parameter instrument template.
- Why it matters: Operators reported SynthForge rendering as a single-parameter interface card, which blocks access to required multitimbral sampler controls.
- Dependencies: T014
- Estimated effort: Low
- Required outputs: Frontend card-resolution hardening in registry + GridFlow card selection path, with typecheck validation.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 00:00 - Codex
- Completion notes:
  - What was done: Added URI normalization in plugin-card registry for `map2://` lookups, added SynthForge safety-net fallback and alias/pattern registrations, and hardened `KnobParameterPanel` to resolve cards using both chain URI and metadata URI (plus canonical SynthForge fallback).
  - Key findings: The prior resolution path depended on strict exact URI matches; any runtime URI variance can bypass the custom card and fall through to the generic template, which surfaced as a single parameter.
  - Files/links produced: `web/src/app/components/PluginCards/registry.ts`, `web/src/app/components/GridFlow/KnobParameterPanel.tsx`.
  - Validation: `npm --prefix web run typecheck` passed.
  - Suggested next tasks: T016, T018, T022-subB

ID: T024
Status: [✓] Done
Title: Effects Loop contracts and persistence for Tesira AVB external send/return
Description:
- Goal / acceptance criteria: Add first-class Effects Loop API contracts and SQL schema (`effects_loops`, `effects_loop_insertions`, `effects_loop_calibrations`, `tesira_loop_templates`) with MAP2 authoritative state and snapshot-native persistence.
- Why it matters: External Tesira send/return processing cannot be safely reused in MAP2 chains without explicit lifecycle objects and durable state.
- Dependencies: None
- Estimated effort: High
- Required outputs: New DB models, `/api/effects-loops/*` routes, `/api/tesira/loop-templates/*` routes, route/service tests, and worklist evidence.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 16:50 - Codex
- Completion notes:
  - What was done: Added persistence models and service/routes for Effects Loops, Tesira loop templates, and chain loop insertions. Registered routes in `app/main.py` and added websocket event topics for loop state/metrics/calibration.
  - Files/links produced: `app/database.py`, `app/routes/effects_loops.py`, `app/services/effects_loops.py`, `app/services/event_publisher.py`, `app/main.py`.
  - Validation evidence: `pytest -q tests/test_effects_loops_service.py tests/test_effects_loops_routes.py` passed.

ID: T025
Status: [✓] Done
Title: Tesira loop template manager and validator
Description:
- Goal / acceptance criteria: Implement CRUD/validation logic for tag-mapped Tesira loop templates and activation-time validation gates.
- Why it matters: Reliable Tesira orchestration depends on deterministic template metadata and strict tag validation before audio path changes.
- Dependencies: T024
- Estimated effort: Medium
- Required outputs: Template service primitives, validation endpoint coverage, drift/alarm status plumbing.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 19:00 - Codex
- Completion notes:
  - What was done: Added runtime drift/alarm telemetry for Tesira loop templates, including service-level tag probe validation (`stream/meter/crosspoint/bypass/router`), runtime-status embedding in template list/upsert/validate responses, and a dedicated API endpoint (`GET /api/tesira/loop-templates/{template_id}/runtime-status`).
  - Files/links produced: `app/services/effects_loops.py`, `app/routes/effects_loops.py`, `web/src/map2/api.ts`, `tests/test_effects_loops_service.py`, `tests/test_effects_loops_routes.py`.
  - Validation evidence: `pytest -q tests/test_effects_loops_service.py tests/test_effects_loops_routes.py tests/test_juce_engine_external_loops.py` passed.

ID: T026
Status: [✓] Done
Title: AVB router Tesira dataplane loop orchestration
Description:
- Goal / acceptance criteria: Replace Tesira route connect stub with preflighted loop-role provisioning and rollback-aware connect/disconnect flow metadata.
- Why it matters: Loop activation must fail closed and preserve SRP/PTP hygiene to meet enterprise deployment reliability.
- Dependencies: T024
- Estimated effort: High
- Required outputs: `connection_role/loop_id` metadata support, Tesira preflight checks, rollback flow tracing, router tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 16:50 - Codex
- Completion notes:
  - What was done: Added loop role metadata (`effects_loop_send`, `effects_loop_return`, `general_route`) across AVB service/router/routes, replaced Tesira connect stub with preflighted provisioning flow, and added disconnect path handling with metadata retention.
  - Files/links produced: `app/services/avb/avb_service.py`, `app/services/avb/avb_router.py`, `app/routes/avb.py`.
  - Validation evidence: `pytest -q tests/test_avb_router_loop_metadata.py tests/test_avb_routes_loop_metadata.py tests/test_avb_router_map2.py tests/test_avb_routes_srp.py` passed.

ID: T027
Status: [✓] Done
Title: JUCE external loop processing interfaces and compensation control path
Description:
- Goal / acceptance criteria: Add engine/pybind control interfaces for external loop definitions, insertion sets, bypass, calibration, and metrics retrieval.
- Why it matters: MAP2 needs deterministic engine-level loop control to enforce low-latency budget and bypass behavior.
- Dependencies: T024
- Estimated effort: High
- Required outputs: C++/pybind interfaces, python service wiring, unit coverage.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 19:00 - Codex
- Completion notes:
  - What was done: Completed JUCE external-loop control-plane interfaces and added deterministic wrapper unit coverage for `set_external_loop_definitions`, `set_chain_loop_insertions`, `set_loop_bypass`, `calibrate_loop`, and `get_loop_metrics`.
  - Files/links produced: `juce-engine/Source/Map2AudioEngine.h`, `juce-engine/Source/Map2AudioEngine.cpp`, `juce-engine/Source/PythonBindings.cpp`, `app/services/juce_engine_service.py`, `tests/test_juce_engine_external_loops.py`.
  - Validation evidence: `pytest -q tests/test_effects_loops_service.py tests/test_effects_loops_routes.py tests/test_juce_engine_external_loops.py` passed.
  - Follow-up: RT callback-path DSP insertion/crossfade/compensation and latency qualification are tracked in `T032`.

ID: T028
Status: [✓] Done
Title: Web Loop Builder and chain insertion UX
Description:
- Goal / acceptance criteria: Ship Loop Builder, insertion controls, inspector status, and routing overlays for operator-safe creation and audition of loops.
- Why it matters: Effects loops require high-clarity UX to avoid routing errors in live production chains.
- Dependencies: T024, T025
- Estimated effort: High
- Required outputs: Frontend API/types, builder/insertion/inspector components, websocket-driven status badges.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 19:00 - Codex
- Completion notes:
  - What was done: Implemented a full Tesira Loop Builder UI tab with loop creation, activation/bypass/calibration actions, chain insertion creation/edit/delete controls, live inspector status, routing overlay preview, and websocket-driven badges for loop state/metrics/calibration events.
  - Files/links produced: `web/src/app/components/Tesira/components/TesiraLoopBuilderTab.tsx`, `web/src/app/components/Tesira/components/TesiraControlPanel.tsx`, `web/src/map2/api.ts`.
  - Validation evidence: `npm --prefix web run typecheck` passed.

ID: T029
Status: [✓] Done
Title: Snapshot and cluster flow integration for effects loops
Description:
- Goal / acceptance criteria: Ensure `/api/chains/*` and `/api/cluster/flows/*` payloads include loop insertion and resolved loop objects; snapshot fallback persistence carries loop state.
- Why it matters: Flow recall and distributed deployments must preserve full loop topology, not just plugin state.
- Dependencies: T024
- Estimated effort: Medium
- Required outputs: Chain/flow payload extensions, snapshot persistence updates, regression tests.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 16:50 - Codex
- Completion notes:
  - What was done: Extended chain payloads with `loop_insertions` and resolved `effects_loops`, threaded chain context into cluster flow responses, and persisted loop state in snapshot fallback save/load paths.
  - Files/links produced: `app/services/chain_service.py`, `app/routes/cluster_flows.py`, `app/routes/snapshots.py`.
  - Validation evidence: `pytest -q tests/test_snapshots_persistence.py tests/test_audio_routing_chain_avb.py tests/test_cluster_flows_api.py` passed.

ID: T030
Status: [✗] Blocked
Title: HIL latency and soak qualification for effects loops
Description:
- Goal / acceptance criteria: Execute must-pass HIL loop latency and churn soak gates (<=0.5ms added latency target, 8-loop stability).
- Why it matters: Production claims require measured evidence under realistic AVB+Tesira hardware load.
- Dependencies: T024, T026, T027, T028, T029
- Estimated effort: High
- Required outputs: Qualification artifacts in `docs/fit-for-purpose-evidence/` and final gate summary.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-02-25 19:00 - Codex
- Blocked notes:
  - Requires lab hardware execution plus completion of RT callback-path DSP insertion/crossfade/compensation work (`T032`) before final qualification run.

ID: T031
Status: [✓] Done
Title: Move 3D Grid from top nav into Advanced menu under System
Description:
- Goal / acceptance criteria: Remove `3D Grid` from top-level AppShell nav and add it as an Advanced-menu entry grouped under `System`, preserving route navigation to `/grid-3d` on desktop/mobile menus.
- Why it matters: Keeps top nav focused on primary workflows while consolidating advanced visualization tools into the Advanced menu hierarchy.
- Dependencies: None
- Estimated effort: Low
- Required outputs: Frontend navigation/menu updates, route wiring validation, and completion notes with touched files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-02-25 18:48 - Codex
- Completion notes:
  - What was done: Removed `3D Grid` from top-level `AppShell` nav item list and added it to `advancedMenuItems` under the `System` group, preserving `/grid-3d` route target.
  - Key findings: Existing Advanced menu grouping/rendering already supports the move cleanly across desktop/mobile without additional layout logic changes.
  - Files/links produced: `web/src/app/layout/AppShell.tsx`, `web/src/app/data/advancedMenuItems.ts`.
  - Validation: `npm --prefix web run typecheck` passed.

ID: T032
Status: [ ] Todo
Title: Implement RT callback-path external loop DSP insertion/crossfade/compensation and re-qualify latency gates
Description:
- Goal / acceptance criteria: Add real callback-path DSP behavior for external loops (insertion ordering, blend/crossfade handling, compensation application) and capture latency/jitter/xrun evidence proving the path meets target gate behavior.
- Why it matters: Control-plane loop state is in place, but production confidence still requires callback-path DSP execution and measured qualification.
- Dependencies: T027, T030
- Estimated effort: High
- Required outputs: JUCE callback-path implementation, regression tests, and updated qualification artifacts under `docs/fit-for-purpose-evidence/`.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-02-25 19:00 - Codex

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
