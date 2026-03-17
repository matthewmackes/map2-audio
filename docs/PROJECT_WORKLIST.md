## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

Last updated: 2026-03-17 11:46 - Codex

## Active Blockers Only

Archive: Completed and otherwise non-blocked work has been moved to `docs/archive/PROJECT_WORKLIST_ARCHIVE_20260316.md`.

## AVB

ID: T004
Status: [✗] Blocked
Title: AVB hardware qualification and release gating
Description:
- Goal / acceptance criteria: Complete the remaining AVB hardware-in-the-loop qualification gates formerly tracked under `T004`, including discovery/churn, active-stream validation, PTP timing, and soak evidence.
- Why it matters: MAP2 cannot claim production AVB readiness until the real lab matrix passes.
- Dependencies: AVB-capable lab availability, active AVB entities/streams, stable PTP grandmaster lock
- Estimated effort: High
- Required outputs: Updated qualification matrix, archived evidence artifacts, and pass/fail summary for the AVB gates.
Subtasks: None
Assigned to: Lab + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Software prep, wrappers, and false-pass hardening are complete in the archive.
  - Current host still shows no discovered AVB devices, no active streams, and `INITIALIZING` PTP state.
  - Source archive references: `T004` in `docs/archive/PROJECT_WORKLIST_ARCHIVE_20260316.md`.

## Tesira

ID: T030
Status: [✗] Blocked
Title: Tesira effects-loop HIL latency and soak qualification
Description:
- Goal / acceptance criteria: Execute the must-pass Tesira effects-loop HIL qualification for latency, churn, and multi-loop stability.
- Why it matters: Effects-loop production claims need real Tesira hardware evidence.
- Dependencies: Tesira hardware on-site, active effects-loop topology, T024/T026/T027/T028/T029 work from archive
- Estimated effort: High
- Required outputs: Qualification artifacts under `docs/fit-for-purpose-evidence/` and final gate summary.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Runner, runbook, and tests are complete in the archive.
  - Remaining blocker is strictly live Tesira hardware and loop topology availability.
  - Source archive references: `T030`, `T030-subA`.

ID: T065
Status: [✗] Blocked
Title: Tesira full-stack parity program release closure
Description:
- Goal / acceptance criteria: Close the remaining parity program blockers for the Tesira replacement effort and issue release-ready go/no-go status.
- Why it matters: Most implementation is complete, but release closure still depends on real hardware proof.
- Dependencies: T030, T004, archived completed implementation slices `T065-subA` through `T065-subF`
- Estimated effort: High
- Required outputs: Final parity validation packet, migration/cutover sign-off, and release unblock decision.
Subtasks:
ID: T065-subG
Status: [✗] Blocked
Title: Produce full parity validation matrix with automation and HIL evidence
Description:
- Goal / acceptance criteria: Finish the parity matrix by combining completed automated validation with the missing Tesira and AVB HIL evidence.
- Why it matters: Parity claims require measurable proof, not implementation-only completion.
- Dependencies: T030, T004, archived `T065-subD`, `T065-subE`, `T065-subF`
- Estimated effort: High
- Required outputs: Validation matrix, artifact bundle, and waiver list if needed.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Automated checks are already complete in the archive.
  - Remaining blocker is missing live Tesira/AVB/PTP lab evidence.
ID: T065-subH
Status: [✗] Blocked
Title: Execute migration, cutover, and release sign-off for Tesira replacement
Description:
- Goal / acceptance criteria: Finalize the migration checklist, rollback packet, staged rollout, and release sign-off once the parity matrix passes.
- Why it matters: Production adoption depends on a verified migration path.
- Dependencies: T065-subG
- Estimated effort: Medium
- Required outputs: Migration checklist, release notes, rollback runbook, and signed acceptance packet.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Blocked entirely by `T065-subG`.
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - All non-HIL Tesira parity implementation work is archived as complete.
  - Remaining closure is now isolated to hardware validation and release sign-off.

ID: T072
Status: [✗] Blocked
Title: Tesira full-parity HIL certification matrix
Description:
- Goal / acceptance criteria: Execute the full Tesira HIL certification matrix covering AVB routing, PTP behavior, live DSP control, compile/deploy lifecycle, and multi-unit reliability.
- Why it matters: Final parity and release claims remain blocked until this matrix passes.
- Dependencies: T065-subG, T030, T004, archived `T069`, `T070`, `T071`
- Estimated effort: High
- Required outputs: HIL evidence bundle, waiver log, and unblock decision for Tesira release.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Precheck runner and runbook are complete in the archive.
  - Current host still lacks connected Tesira devices in scope, active AVB streams, and stable AVB/PTP lock.

ID: T076
Status: [✗] Blocked
Title: Tesira deploy-chain HIL certification
Description:
- Goal / acceptance criteria: Validate the supported Tesira deployment workflow on real hardware and archive release-grade evidence.
- Why it matters: The deployment UX is not release-ready without two-unit HIL confirmation.
- Dependencies: T075 from archive, T004
- Estimated effort: High
- Required outputs: HIL evidence bundle and final go/no-go criteria update for deployment workflow.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Manual-package deployment runner and runbook are complete in the archive.
  - Remaining blocker is the real two-unit Tesira deployment session.

## MIDI

ID: T066
Status: [✗] Blocked
Title: MIDI Hub hardware validation and final closure
Description:
- Goal / acceptance criteria: Close the remaining MIDI Hub program work by completing the hardware-dependent compatibility and full integration validation gates.
- Why it matters: The implementation is broad and largely complete, but final production confidence depends on physical adapter and long-run validation.
- Dependencies: Archived implementation subtasks through `T066-subP`, plus live hardware access
- Estimated effort: High
- Required outputs: Completed hardware compatibility matrix, final regression/performance evidence, and program closure notes.
Subtasks:
ID: T066-subQ
Status: [✗] Blocked
Title: USB-to-DIN adapter support and external interface integration guide
Description:
- Goal / acceptance criteria: Verify MAP2 MIDI Hub against real class-compliant USB-to-DIN adapters and finish the compatibility guide with measured results.
- Why it matters: The hardware-agnostic claim needs physical adapter evidence.
- Dependencies: Archived `T066-subA`, `T066-subF`, attached USB-MIDI hardware, ALSA sequencer access
- Estimated effort: Medium
- Required outputs: Compatibility matrix, adapter notes, and completed `docs/midi/USB_DIN_ADAPTER_COMPATIBILITY.md`.
Subtasks: None
Assigned to: User + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Qualification runner, runbook, and doc scaffold are complete in the archive.
  - Current environment still has no `/dev/snd/seq` access and no attached adapters.
ID: T066-subR
Status: [✗] Blocked
Title: Comprehensive MIDI Hub integration testing and regression validation
Description:
- Goal / acceptance criteria: Finish the end-to-end regression, performance, and soak validation of the complete MIDI Hub stack.
- Why it matters: MIDI Hub is foundational to multiple MAP2 systems and needs final proof under realistic conditions.
- Dependencies: T066-subQ, archived `T066-subP`, long-duration hardware-backed validation window
- Estimated effort: High
- Required outputs: Regression matrix, performance benchmarks, soak evidence, and pass/fail report.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Unified qualification runner is complete in the archive.
  - Remaining blocker is real hardware and soak execution rather than software gaps.
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - All non-HIL MIDI Hub implementation work is archived as complete.
  - Program closure now depends only on physical adapter validation and full-system performance evidence.

ID: T102
Status: [✗] Blocked
Title: MIDI Hub external operator field study
Description:
- Goal / acceptance criteria: Run the redesigned `/midi-hub` workflow study with at least three external operators and archive anonymized results plus remediation decisions.
- Why it matters: Real operator evidence is still required beyond implementation and self-validation.
- Dependencies: Archived `T101`, external participant scheduling
- Estimated effort: Medium
- Required outputs: Participant results, issue log, and follow-up remediation decisions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Protocol, templates, and collation tooling are complete in the archive.
  - Remaining blocker is external participant access and moderated study execution.

ID: T202
Status: [✓] Done
Title: MIDI Hub full IBM Carbon and workflow refactor
Description:
- Goal / acceptance criteria: Fully refactor `/midi-hub` and its connected MIDI Hub surfaces into an advanced operator workspace that is Carbon-first end to end, uses industry-standard MIDI terminology, presents basic routing and validation workflows before deeper controls, increases spacing/readability in dense areas, removes touched MUI control patterns, and updates the supporting design/MIDI documentation to match the shipped information architecture and Carbon compliance posture.
- Why it matters: The current MIDI Hub surface mixes Carbon and non-Carbon UI systems, carries inconsistent MIDI concepts, and exposes dense controls without a consistent operational workflow, which blocks the user's stated requirement for a total Carbon-compliant refactor.
- Dependencies: Existing MIDI Hub backend APIs, `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`, `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md`
- Estimated effort: High
- Required outputs: Refactored `web/src/app/pages/MidiHubPage.tsx` route shell and connected MIDI Hub components, updated route-local Carbon styling/tests as needed, refreshed MIDI Hub design/content documentation, updated Carbon conformance notes/checklist evidence, and final validation notes.
Subtasks:
ID: T202-subA
Status: [✓] Done
Title: Audit MIDI Hub route structure and define Carbon-first advanced operator IA
Description:
- Goal / acceptance criteria: Inventory the current `/midi-hub` shell plus connected panels, normalize the target terminology and section model, and encode the new route structure in implementation notes/docs before broad UI edits begin.
- Why it matters: A total refactor needs one source of truth for terminology, grouping, and workflow order.
- Dependencies: T202
- Estimated effort: Medium
- Required outputs: Updated MIDI Hub documentation and implementation-ready IA decisions tied to the actual route/component files.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Replaced the earlier guided-help redesign direction with an advanced-operator IA centered on sequential workflow bands: Signal path, Show control, Network and protocol, Message processing and automation, and Advanced and experimental.
  - Normalized route-local terminology toward standard MIDI/operator concepts such as Port matrix, Patchbay graph, Event Monitor, Message Filtering, Message Mapping, Presets and Program Change, Clock and Transport, RTP-MIDI, and MIDI 2.
  - Updated `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md` and `docs/midi/MIDI_HUB_GUIDED_UX_REDESIGN_BRIEF.md` to match the implementation target and remove contextual-help assumptions that conflict with the user directive and Carbon standards.
ID: T202-subB
Status: [✓] Done
Title: Replace MIDI Hub route shell and primary workflows with Carbon grid and progressive depth
Description:
- Goal / acceptance criteria: Rebuild the `/midi-hub` page shell so routing and validation are primary, deeper automation/diagnostics controls follow later in the page, and spacing/layering align to Carbon grid and tokens only.
- Why it matters: Page composition is the main source of current workflow and density problems.
- Dependencies: T202-subA
- Estimated effort: High
- Required outputs: Updated `MidiHubPage` structure/CSS and any route-shell tests needed.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Refactored `web/src/app/pages/MidiHubPage.tsx` from a tabbed shell into a sequential advanced workspace with a Carbon-style hero, workflow tiles, spaced section bands, and routing-first information architecture.
  - Replaced dense route composition with tokenized Carbon spacing in `web/src/app/pages/MidiHubPage.css`, including new section grids, panel surfaces, empty states, record lists, route matrix helpers, and patchbay framing.
  - Updated `web/src/app/pages/MidiHubPage.test.tsx` so the test surface matches the new simultaneous section model rather than the old tabbed navigation.
ID: T202-subC
Status: [✓] Done
Title: Migrate connected MIDI Hub panels from mixed MUI/custom controls to Carbon patterns
Description:
- Goal / acceptance criteria: Refactor the touched routing, patchbay, traffic, preset, network, script, clock, recorder, macro, scheduler, MIDI 2.0, and related operator panels to Carbon controls/patterns with consistent spacing and semantics.
- Why it matters: The route cannot be fully Carbon compliant while key child panels retain non-Carbon control systems and ad hoc dense layouts.
- Dependencies: T202-subA
- Estimated effort: High
- Required outputs: Updated MIDI Hub component implementations and styles with no silent non-Carbon exceptions in touched surfaces.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Migrated touched MIDI Hub panels away from MUI/custom mixed controls toward Carbon components and Carbon-tokenized custom surfaces, including routing, patchbay, traffic monitor, preset management, network, clock, recorder, scheduler, scripts, macros, MIDI 2, innovation, and workbench cards.
  - Removed route-local summary copy and contextual-help framing from `web/src/app/components/MidiHub/MidiHubHelpPrimitives.tsx` so panel headers now align with the advanced operator brief and Carbon route standards.
  - Kept the custom SVG patchbay and route matrix where the workflow requires specialized visualization, but rebuilt the surrounding interaction model with Carbon actions, tags, modal/dialog patterns, and spacing tokens.
ID: T202-subD
Status: [✓] Done
Title: Publish updated MIDI Hub and Carbon conformance documentation for the shipped refactor
Description:
- Goal / acceptance criteria: Update the relevant MIDI Hub inventory/brief and Carbon conformance artifacts so they accurately describe the delivered route structure, terminology, compliance status, validation evidence, and any explicit exceptions.
- Why it matters: The user requested document updates and the repo requires current conformance evidence for UI changes.
- Dependencies: T202-subB, T202-subC
- Estimated effort: Medium
- Required outputs: Updated docs under `docs/midi/` and `docs/design/` plus checklist evidence in final notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Updated `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md` and `docs/design/CARBON_CONFORMANCE_MATRIX.md` so `/midi-hub` is recorded as a sequential operational workspace with the second-pass Carbon refactor noted in conformance tracking.
  - Validated the shipped surface with `npm --prefix web run typecheck`, `npm --prefix web run test -- src/app/pages/MidiHubPage.test.tsx --runInBand`, and `npm --prefix web run build`.
  - Reviewed repository licensing posture for the touched MAP2-owned UI/docs files and found no additional AGPL or third-party notice work required.
Assigned to: Codex
Last updated: 2026-03-17 11:46 - Codex
- Completion notes:
  - Delivered a full `/midi-hub` route refactor and updated the connected MIDI Hub component subtree under `web/src/app/components/MidiHub/` to a Carbon-first, advanced-operator surface with routing-first workflow order and normalized MIDI terminology.
  - Scope note: the legacy `/midi` route in `web/src/app/pages/MIDIPage.tsx` was not refactored in this task because `/midi-hub` no longer depends on that embedded surface after the route-shell rewrite.
  - Remaining MIDI program blockers stay in `T066`, `T102`, and related hardware-study tasks; `T202` closes the UI/doc refactor slice only.

## Latency And Evaluation

ID: T055
Status: [✗] Blocked
Title: UA-1000 analog loopback latency measurement
Description:
- Goal / acceptance criteria: Run the physical tuned-vs-rollback analog loopback test on the UA-1000 and publish repeated RTT measurements.
- Why it matters: Real round-trip latency proof is still missing for the UA-1000 tuning decision.
- Dependencies: Archived `T054`, physical UA-1000 loopback cabling, device access
- Estimated effort: Medium
- Required outputs: Repeated RTT result set, average/p95 comparison, and keep/rollback recommendation.
Subtasks: None
Assigned to: Codex + Lab
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Matrix runner and runbook are complete in the archive.
  - Remaining blocker is the physical loopback session.

ID: T099
Status: [✗] Blocked
Title: Dynamic response blind A/B validation
Description:
- Goal / acceptance criteria: Execute the formal blind A/B validation of MAP2 NAM dynamic response versus a reference amp and competitor modeler, then publish the final evidence packet.
- Why it matters: MAP2 still lacks external proof for stage-competitive dynamic response claims.
- Dependencies: Archived prep/tooling subtasks, reference amp/modeler, recording interface, evaluators
- Estimated effort: Medium
- Required outputs: Recorded samples, subjective results, quantitative summary, evidence document, and evaluation-report update.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Protocol, analysis tooling, and evidence-draft prep are complete in the archive.
  - Remaining blocker is the live recording and evaluator session.

## Repo Hygiene

ID: T082-subD
Status: [✗] Blocked
Title: Repo history cleanup for tracked bloat
Description:
- Goal / acceptance criteria: Remove tracked build/dependency artifacts from git history and complete the coordinated force-push cleanup window.
- Why it matters: Repository size and clone/tooling penalties persist until history is rewritten.
- Dependencies: Archived `T082-subC`, mirror-clone rewrite environment, collaborator coordination
- Estimated effort: Medium
- Required outputs: Rewritten history on both remotes, collaborator notice, and post-rewrite verification.
Subtasks:
ID: T082-subD-subB
Status: [✗] Blocked
Title: Execute coordinated history rewrite and force-push for repo bloat removal
Description:
- Goal / acceptance criteria: Run the prepared mirror-clone rewrite and force-push both remotes during a coordinated maintenance window.
- Why it matters: This is the actual destructive step that shrinks the repository.
- Dependencies: Archived `T082-subD-subA`, archived `T082-subD-subC`, mirror clone, `git-filter-repo`, force-push window
- Estimated effort: Medium
- Required outputs: Rewritten remotes and collaborator migration notice.
Subtasks: None
Assigned to: Matthew + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Prep helper, runbook, and notice template are complete in the archive.
  - Remaining blocker is a real rewrite window with `git-filter-repo` available.
Assigned to: Matthew + Codex
Last updated: 2026-03-16 00:00 - Codex
- Blocked notes:
  - Ignore guardrails and rewrite prep are complete in the archive.
  - Remaining work is only the coordinated destructive rewrite.

## JUCE Grid UI Polish

ID: T193
Status: [✓] Done
Title: JUCE Grid — Automation panel background matches page surface (seamless integration)
Description:
- Goal / acceptance criteria: The automation timeline panel and the signal-flow SVG diagram look visually seamless against the page background. All hardcoded hex/rgba fallbacks in the routing diagram replaced with Carbon tokens. Full SVG redesign: sharp-edge Carbon nodes, typographic terminal bookends, purple morph node with progress bar, gradient sweep wire animation on live paths, responsive spacing.
- Dependencies: None
- Estimated effort: Low–Medium
- Required outputs: See completion notes.
Subtasks: None
Assigned to: Claude
Last updated: 2026-03-16 - Claude
- Completion notes:
  - `.juce-grid-page__automation-panel` background changed from `var(--cds-layer)` to `var(--cds-background, #161616)` — matches outermost page surface.
  - `JuceGridRoutingVisualizer.tsx` fully redesigned: all hardcoded rgba/hex constants replaced with Carbon token constants (`C_BACKGROUND`, `C_LAYER`, `C_BORDER`, `C_LINK`, `C_PURPLE`, etc.). Flow nodes now sharp-edged (rx=0) with left-border stripe using `--flow-color`. Terminal nodes (Input/Output) replaced with typographic bookends (label + flanking `<line>` rules, no box). Morph block now uses `C_PURPLE` throughout with sharp edges and animated progress bar. Wire rendering split into base layer (low opacity) + animated gradient sweep layer (`juce-grid-routing-sweep` keyframe) on active paths only. `ArrowRight` from `@carbon/icons-react` imported and `WireArrow` helper exported for inline icon use.
  - `JuceGridPage.css` routing diagram section: `.juce-grid-page__routing-diagram` gets `background: var(--cds-background)` and increased padding/gap for airy spacing. Wire sweep `@keyframes` added. All `rgba(255,255,255,*)` label fallbacks replaced with named Carbon token fallbacks (`#c6c6c6`, `#f4f4f4`). Morph value uses `var(--cds-purple-30, #d4bbff)`. `.juce-grid-page__routing-morph-progress` gets `transition: width 240ms ease`.
  - Layout constants increased: node width 132px (was 116), height 62px (was 56), horizontal gap 56px (was 32), row gap 92px (was 78).
  - Validation: `npm run typecheck` → pass, `npm run build` → pass (19.47s, zero errors).
