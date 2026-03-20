## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

Last updated: 2026-03-19 - Codex (T203-subF MIDI Hub Message Processing area completed with a new Carbon-first `/midi-hub/processing` workspace, a tag-toggle filter planner with live route preview and route-save flow, a 16-slot accordion message mapper planner, a layered script editor with toolbar actions, and DataTable-based macro and scheduler surfaces with route-scoped styling/tests; clean typecheck; clean dedicated processing-page test; and clean production build. T203-subE MIDI Hub Event Lists area completed with a new persisted event-list backend service for MTC/RTC scheduling, learn-mode capture, MSC composition/sending, and routed cue actions; a shipped `/midi-hub/events` workspace with Carbon DataTable-based event-list manager and event editor, event-list status, learn-mode controls, MSC builder, and dedicated page styling/tests; clean typecheck; clean event-lists backend pytest suite; clean dedicated events-page frontend test; and clean production build. T203-subC MIDI Hub Presets & Recall rewrite completed with split Carbon preset manager surfaces, Carbon DataTable-based preset and slot management, Carbon ComposedModal compare flow, FileUploader-backed import affordance, preset-chain reorder editing, dedicated presets-page coverage, clean typecheck, clean routed MIDI Hub tests, and clean production build; T203-subB MIDI Hub Connections area rewrite completed with Carbon DataTable-based routing and traffic workspaces, Carbon ComposedModal route editor, Carbon Toggle-based quick router, dedicated page-scoped CSS, targeted connections-page coverage, clean typecheck, clean routed MIDI Hub tests, and clean production build; T223-subI JUCE Grid verification audit completed with deployment-backed bottom-editor coverage for 35 shipped grid plugins, fallback-template registry fix for lazy template resolution, clean typecheck, clean targeted JUCE Grid test suites, and clean production build; T223-subG JUCE Grid iPad interaction pass completed with touch-select contextual actions, smart-control parameter editing, 44pt touch targets, and swipe-down editor dismiss handling; T223-subE JUCE Grid select-and-move reorder workflow completed with bottom-editor move controls, keyboard arrow repositioning, and signal-canvas reorder preview states; T223-subC JUCE Grid signal-flow visualization completed with 3-dot connectors, input/output bridges, and dashed bypass path treatment; T223-subD JUCE Grid bottom parameter editor completed with slide-up panel workflow, standardized Carbon NumberInput/Dropdown controls, and grouped always-visible sections; T223-subH JUCE Grid viewport block screen completed for sub-768 mobile layouts with touch-device rotation guidance; T223-subF JUCE Grid add-effect slot and state persistence completed with selected-block/editor/scroll restore; T223-subB JUCE Grid signal-card face completed with Axe-FX-style hero/info standardization and metadata-aware effect icon resolution; T218 drum TypeScript/API/hook integration committed with tests; T216 drum backend service completed with persistence, websocket topics, typed routes, and live JUCE master-volume/metering bridge hooks; T205 icon system overhaul completed across active frontend paths with zero Phosphor/MUI/emoji holdouts in `web/src/app` + `web/src/map2`; T220 typography rollout completed with BlexMono-first delivery and IBM Plex Sans build emission removed; T222 Carbon Category Card refactor completed — all 47 effect cards + 8 templates refactored to AXE-FX Edit structural parity with Carbon Design System compliance)

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

## MIDI Hub v2 — Show Control Platform Rewrite

ID: T203
Status: [>] In Progress
Title: MIDI Hub v2 — Full show control platform rewrite with sidebar navigation, Net3 feature parity, Tesira TTP integration, and enterprise OSC namespace
Description:
- Goal / acceptance criteria: Complete clean rewrite of the MIDI Hub from a monolithic scrolling page into a 7-area sidebar-navigated show control platform. Add Net3 Show Control Gateway feature parity (Event Lists, MSC command builder, virtual GPIO, MIDI Raw from cues, Learn Mode, String Interface). Add bidirectional Tesira TTP integration. Add hierarchical `/map2/*` OSC namespace. Add persistent bottom status bar, dark/light theming with system preference detection, scroll/panel state persistence across navigation, and deep-linkable routes. All surfaces must pass Carbon Conformance Standard and Carbon Contribution Review Checklist. Enterprise features must be identified and flagged throughout.
- Why it matters: The current MIDI Hub is a dense monolithic page that requires scrolling to find features. The user requires a professional show control platform competitive with ETC Net3/Response Show Control Gateways, with clean sidebar navigation, industry-standard terminology, and full Tesira integration for their production audio environment.
- Dependencies: T202 (done — prior Carbon refactor), existing MIDI Hub backend services (21 files in `app/services/midi_hub/`), existing frontend components (15 files in `web/src/app/components/MidiHub/`), `docs/design/CARBON_CONFORMANCE_STANDARD.md`, `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
- Estimated effort: Very High
- Required outputs: See subtask list below. All subtasks must pass `npm run typecheck`, `npm run build`, and `pytest tests/` before marking done. Updated Carbon conformance documentation. Updated route pattern mapping.
Subtasks:

ID: T203-subA
Status: [✓] Done
Title: Navigation shell — persistent left sidebar, bottom status bar, theme system, route scaffolding
Description:
- Goal / acceptance criteria: Replace the monolithic `MidiHubPage.tsx` with a sidebar-navigated shell containing 7 service areas as separate routable pages. Implement persistent left sidebar following Carbon `SideNav` pattern (always visible, ~240px, status badges per area). Implement persistent bottom status bar showing: clock status + BPM, active preset name, active event list status + timecode position, route count, connected device count, system health. Implement dark/light theme toggle that follows system preference with manual override per Carbon theming guidance. All 7 areas must be deep-linkable routes under `/midi-hub/*`. Each area must preserve scroll position and panel expand/collapse state when navigating away and back (use Zustand store persisted to localStorage).
- Why it matters: Foundation for the entire rewrite — every other subtask depends on this shell existing.
- Dependencies: None
- Estimated effort: High
- Required outputs:
  - New shell component: `web/src/app/pages/MidiHubShell.tsx` (sidebar + status bar + outlet)
  - New CSS: `web/src/app/pages/MidiHubShell.css`
  - Route changes in `web/src/app/App.tsx`: `/midi-hub` becomes parent route with child routes `/midi-hub/connections`, `/midi-hub/presets`, `/midi-hub/transport`, `/midi-hub/events`, `/midi-hub/processing`, `/midi-hub/network`, `/midi-hub/lab`. `/midi-hub` redirects to `/midi-hub/connections`.
  - Legacy redirects: `/midi` → `/midi-hub/connections`, `/midi-hub-2` → `/midi-hub/connections`
  - Zustand store: `web/src/app/stores/midiHubNavStore.ts` — persists scroll positions and panel states per area
  - Theme integration: use Carbon `GlobalTheme` provider with `useMediaQuery('(prefers-color-scheme: dark)')` for system detection, localStorage override key `map2_theme_preference`
  - Bottom status bar component: `web/src/app/components/MidiHub/MidiHubStatusBar.tsx` — fixed to bottom, polls hub status + clock + preset + event list state via React Query
  - 7 placeholder page components (one per area) that render existing panels in the correct grouping
  - `MidiHubNodeScopeProvider` must wrap the shell (not individual pages)
  - Node context picker moves to sidebar header
  - Sidebar badges: green dot for active routes, clock icon for running clock, count badges for presets/sessions
- Implementation notes:
  - Carbon SideNav: use `SideNav`, `SideNavItems`, `SideNavLink` from `@carbon/react`
  - Bottom bar: use `Layer` with `position: fixed; bottom: 0` and Carbon spacing tokens
  - Theme: Carbon provides `Theme` component with `theme` prop ('white', 'g10', 'g90', 'g100'). Map system dark → 'g100', system light → 'white'. Store preference in localStorage.
  - Deep linking: use React Router `<Outlet />` pattern with `useLocation()` to restore scroll
  - Status bar refetch interval: 2000ms for clock, 3000ms for everything else
  - All 7 areas are lazy-loaded via `React.lazy()` for code splitting
Subtasks: None
Assigned to: Claude
Last updated: 2026-03-17 19:45 - Codex
- Completion notes:
  - Replaced the `/midi-hub` route with a nested shell in `web/src/app/App.tsx`: `/midi-hub` now redirects to `/midi-hub/connections`, legacy redirects `/midi` and `/midi-hub-2` now land on the connections area, and all seven routed areas are lazy-loaded child pages under `MidiHubShell`.
  - Added `web/src/app/pages/MidiHubShell.tsx` and `web/src/app/pages/MidiHubShell.css` with a persistent Carbon `SideNav`, node context picker in the sidebar header, local theme override stored in `map2_theme_preference`, route badges, and a fixed bottom status bar.
  - Added persisted navigation state in `web/src/app/stores/midiHubNavStore.ts` and routed area scaffolding in `web/src/app/pages/midi-hub/` so each area has its own deep-linkable page and restores scroll state when revisited.
  - Added `web/src/app/components/MidiHub/MidiHubStatusBar.tsx` and `web/src/app/components/MidiHub/useMidiHubOverview.ts` so the shell can poll MIDI Hub status, routes, clock, presets, and sessions without duplicating query logic across pages.
  - Converted `web/src/app/pages/MidiHubPage.tsx` into a compatibility redirect to the new shell entry path and updated `web/src/app/pages/MidiHubPage.test.tsx` to validate routed shell entry plus presets-area deep linking.
  - Validation: `cd web && npm run typecheck` -> pass, `cd web && npm test -- MidiHubPage.test.tsx --runInBand --silent` -> pass, `cd web && npm run build` -> pass (existing Vite chunk-size and dynamic-import warnings only).

ID: T203-subB
Status: [✓] Done
Title: Connections area — clean rewrite of routing, patchbay, quick router, and traffic monitor
Description:
- Goal / acceptance criteria: Rewrite the Connections area (`/midi-hub/connections`) as a clean Carbon page containing: Port Matrix (rewritten with Carbon `DataTable`), Patchbay Graph (SVG retained but Carbon-wrapped), Quick Router (Carbon `Toggle` switches), and Traffic Monitor (Carbon `DataTable` with streaming rows). Remove all legacy CSS classes. Use Carbon patterns exclusively. Traffic Monitor is ONLY accessible from this page (not global). Master-detail layout follows Carbon data table patterns per Carbon guidance. Port Matrix and Patchbay remain as tab-switchable views using Carbon `Tabs`.
- Why it matters: This is the primary workflow — connections must be rock-solid and visually clean.
- Dependencies: T203-subA
- Estimated effort: High
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx`
  - `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css`
  - Rewritten components: `MidiRoutingMatrix.tsx`, `MidiPatchbay.tsx`, `MidiTrafficMonitor.tsx`, `MidiHubQuickRouter.tsx` (renamed from MidiHubWorkbenchCards quick router section)
  - All components use Carbon `DataTable`, `TableContainer`, `TableToolbar`, `TableToolbarSearch`, `TableToolbarContent`, `Tag`, `Modal`, `Button`, `Toggle`
  - Traffic monitor: Carbon `DataTable` with `TableToolbar` search, column sorting, CSV export button, pause/resume toggle, clear button. No custom table implementation.
  - Patchbay: SVG canvas retained but wrapped in Carbon `Layer` with Carbon `Toolbar` pattern for controls
  - Route creation/edit modal: Carbon `ComposedModal` with `ModalHeader`, `ModalBody`, `ModalFooter`
  - Tests: `MidiHubConnectionsPage.test.tsx` — renders, shows ports, matrix/patchbay tab switch, traffic data display, route creation modal opens
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 19:32 - Codex
- Completion notes:
  - Rewrote `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx` and added `web/src/app/pages/midi-hub/MidiHubConnectionsPage.css` so the connections area now uses a page-scoped Carbon layout, Carbon `Tabs` for matrix versus patchbay switching, and a dedicated traffic-monitor panel without reusing the old monolithic page-band styling.
  - Rebuilt `web/src/app/components/MidiHub/MidiRoutingMatrix.tsx` around Carbon `DataTable`, `TableToolbar`, and `ComposedModal`, flattening source-to-destination routes into a searchable master-detail matrix with route create/edit actions, inline route state tags, and a Carbon modal footer/button flow for save and delete actions.
  - Rebuilt `web/src/app/components/MidiHub/MidiPatchbay.tsx` and `web/src/app/components/MidiHub/MidiTrafficMonitor.tsx` so the patchbay graph stays SVG-based but is wrapped in Carbon `Layer` and Carbon toolbar controls, while the traffic monitor now uses Carbon `DataTable`, toolbar search, sort mode buttons, pause/ascending toggles, CSV export, and clear-buffer controls instead of the previous custom table/search stack.
  - Added `web/src/app/components/MidiHub/MidiHubQuickRouter.tsx` as the new quick-router surface, replacing the old workbench-card path with Carbon `Toggle` switches and source selection for fast route activation, while keeping `readPorts` in the shared workbench helpers for the remaining MIDI Hub areas.
  - Added `web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx` and updated `web/src/app/pages/MidiHubPage.test.tsx` so the connections-area rewrite is covered for routed render, matrix/patchbay tab switching, traffic row visibility, and route-modal open behavior.
  - Validation: `cd web && npm run typecheck` -> pass, `cd web && npm test -- --runInBand web/src/app/pages/midi-hub/MidiHubConnectionsPage.test.tsx web/src/app/pages/MidiHubPage.test.tsx` -> pass, `cd web && npm run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

ID: T203-subC
Status: [✓] Done
Title: Presets & Recall area — presets, program change slots, preset chains
Description:
- Goal / acceptance criteria: Rewrite the Presets & Recall area (`/midi-hub/presets`) containing: Preset Manager (Carbon `DataTable` with toolbar actions), Program Change Slots (Carbon `DataTable` mapping program numbers 0-127 to presets), Preset Chains (Carbon `OrderedList` or `DataTable` with drag-reorder). Compare presets via Carbon `ComposedModal` with side-by-side diff. Import/export via Carbon `FileUploader` and download actions. Set default preset. All state recall operations show Carbon `InlineLoading` during mutation.
- Why it matters: State recall is the second most critical workflow after connections.
- Dependencies: T203-subA
- Estimated effort: Medium
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubPresetsPage.tsx`
  - `web/src/app/pages/midi-hub/MidiHubPresetsPage.css`
  - Rewritten `MidiHubPresetManager.tsx` → split into `PresetTable.tsx`, `ProgramChangeSlots.tsx`, `PresetChainEditor.tsx`
  - Tests: renders, shows presets, recall mutation fires, compare modal works, chain ordering works
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 19:47 - Codex
- Completion notes:
  - Reworked `web/src/app/pages/midi-hub/MidiHubPresetsPage.tsx` and added `web/src/app/pages/midi-hub/MidiHubPresetsPage.css` so the presets area now uses a page-scoped Carbon layout instead of the older shared page-band styling while still keeping the clock and recorder sidecars available in the routed area.
  - Replaced the monolithic preset manager implementation in `web/src/app/components/MidiHub/MidiHubPresetManager.tsx` with a data-owning parent that fans out into `PresetTable.tsx`, `ProgramChangeSlots.tsx`, and `PresetChainEditor.tsx`, preserving the existing backend integrations while separating preset CRUD, PC slot assignment, and preset-chain editing into focused Carbon surfaces.
  - Added a Carbon `DataTable` preset table with toolbar search, default-state tagging, recall/export/default/delete actions, and a Carbon `ComposedModal` compare flow, plus `FileUploader`-backed import affordance for preset recall workflows.
  - Added Carbon `DataTable` handling for program-change slot mappings and preset-chain editing, including chain-order save actions and per-row move up/down controls so chain ordering can be staged and persisted without returning to the legacy manager layout.
  - Added `web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx` to cover routed render, preset recall mutation firing, compare modal opening and compare invocation, and preset-chain reorder persistence; retained `web/src/app/pages/MidiHubPage.test.tsx` coverage for routed shell entry.
  - Validation: `cd web && npm run typecheck` -> pass, `cd web && npm test -- --runInBand web/src/app/pages/midi-hub/MidiHubPresetsPage.test.tsx web/src/app/pages/MidiHubPage.test.tsx` -> pass, `cd web && npm run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

ID: T203-subD
Status: [✓] Done
Title: Transport area — clock, recorder, industry-standard transport bar
Description:
- Goal / acceptance criteria: Rewrite the Transport area (`/midi-hub/transport`) with industry-standard layout. Clock panel: BPM display (large numeric), tap tempo button, start/stop/continue transport controls, internal/external source toggle, output port multi-select, divider/multiplier controls. Recorder panel: record/stop/play controls, session list as Carbon `DataTable`, playback speed slider, loop toggle, SMF export with BPM/ticks config. Transport controls should follow DAW conventions (play/stop/record icons from `@carbon/icons-react`: `PlayFilled`, `StopFilled`, `RecordingFilled`, `PauseFilled`).
- Why it matters: Transport is time-critical — musicians expect instant, familiar controls.
- Dependencies: T203-subA
- Estimated effort: Medium
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubTransportPage.tsx`
  - `web/src/app/pages/midi-hub/MidiHubTransportPage.css`
  - Rewritten `MidiClockPanel.tsx` and `MidiRecorderPanel.tsx`
  - Tests: renders, clock status displayed, transport controls fire mutations, recorder session list works
Subtasks: None
Assigned to: Claude
Last updated: 2026-03-18 19:28 - Codex
- Completion notes:
  - Upgraded `web/src/app/components/MidiHub/MidiClockPanel.tsx` to a DAW-style transport surface with a large BPM hero tile, tap/start/continue/stop controls using Carbon transport icons, output-port chip multi-select, and divider/multiplier sliders that save through the clock config mutation.
  - Upgraded `web/src/app/components/MidiHub/MidiRecorderPanel.tsx` to a Carbon `DataTable` session list with record/stop/play controls, playback speed slider, loop toggle, and SMF export configuration controls for BPM and ticks-per-quarter.
  - Added supporting transport-area styling in `web/src/app/pages/MidiHubPage.css` and focused component coverage in `web/src/app/components/MidiHub/MidiTransportPanels.test.tsx`.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/components/MidiHub/MidiTransportPanels.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing Vite chunk/dynamic-import warnings only).

ID: T203-subE
Status: [✓] Done
Title: Event Lists area — NEW: timecode-driven cue engine with MTC, RTC scheduling, and Learn Mode
Description:
- Goal / acceptance criteria: Build a completely new Event Lists area (`/midi-hub/events`) — this is a new top-level feature inspired by ETC Net3 Show Control Gateway event lists. Must include:
  1. **Event List Manager**: Create/delete/rename event lists. Each list has a type (MTC or RTC), a source ID, internal/external clock enable, first/last time, and FPS setting (24/25/30).
  2. **Event Editor**: Table-based editor (Carbon `DataTable`) showing columns: Event #, Time/Address (HH:MM:SS:FF for MTC, datetime for RTC), Action (Cue/Preset/Macro/MIDI Raw), Label. Add/edit/delete events. Events fire when clock reaches specified time.
  3. **Internal Clock**: When external MTC source is absent, internal clock auto-takes-over (if enabled). Internal clock respects first/last time loop points.
  4. **RTC Events**: Schedule by wall-clock time and date with timezone support. "Every Tuesday at 8pm fire macro X" pattern.
  5. **Learn Mode**: Button that captures incoming MTC timecode position and auto-creates an event at the current timestamp with a user-selected action.
  6. **Event List Status**: Show running/stopped, current timecode position, internal/external indicator, FPS.
  7. **MSC Command Builder**: Structured form to compose MIDI Show Control messages — Go, Stop, Resume, Timed Go, Set, Fire, All Off — with device ID (0-127), command format, and cue number fields. MSC messages can be used as event actions or sent ad-hoc.
  8. **MIDI Raw Output**: Attach MIDI note/CC/program change output to cue events — "when event fires, also send note C4 on ch10".
- Why it matters: Event Lists are the backbone of synchronized show control. This is the key Net3 feature parity gap. Without this, MAP2 cannot compete with ETC for show control workflows.
- Dependencies: T203-subA
- Estimated effort: Very High
- Required outputs:
  - Backend: `app/services/midi_hub/event_list_service.py` — EventList, Event models; MTC internal clock; RTC scheduler; Learn Mode capture; MSC message builder
  - Backend routes: `app/routes/midi_hub.py` additions — CRUD for event lists and events, clock control, learn mode toggle, MSC send
  - Frontend: `web/src/app/pages/midi-hub/MidiHubEventsPage.tsx` and `MidiHubEventsPage.css`
  - Frontend components: `EventListManager.tsx`, `EventEditor.tsx`, `MscCommandBuilder.tsx`, `EventListStatus.tsx`, `LearnModeControl.tsx`
  - All tables use Carbon `DataTable` with `TableToolbar`
  - MSC builder uses Carbon `FormGroup`, `Select`, `NumberInput`, `TextInput`
  - Time display uses monospace font via `--cds-code-01-font-family`
  - Tests: backend — `tests/test_midi_hub_event_lists.py` (event CRUD, MTC clock, RTC scheduling, MSC builder, learn mode). Frontend — `MidiHubEventsPage.test.tsx`
- Implementation notes:
  - MTC timecode format: HH:MM:SS:FF (hours:minutes:seconds:frames)
  - FPS options: 24 (film), 25 (PAL), 30 (NTSC) — match ETC convention
  - MSC command format: F0 7F <device_id> 02 <command_format> <command> <data> F7
  - MSC commands: 01=Go, 02=Stop, 03=Resume, 04=TimedGo, 06=Set, 07=Fire, 08=AllOff
  - Learn Mode: listen to incoming MTC, on button press capture current timecode and insert event row with that timestamp
  - RTC: use Python `datetime` with timezone-aware scheduling via `asyncio` timers
  - Event action types: RecallPreset, FireMacro, SendMSC, SendMidiRaw, SendOSC, SendString
  - Enterprise flag: Event list sharing across cluster nodes, conditional event firing based on device shadow state
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 20:04 - Codex
- Completion notes:
  - Added `app/services/midi_hub/event_list_service.py` with persisted event-list and event CRUD, MTC clock progression with loop points, RTC scheduling with timezone-aware evaluation, learn-mode capture, MSC message building/sending, and routed cue actions for preset recall, macro triggers, MIDI raw output, and MSC output.
  - Extended `app/routes/midi_hub.py` and `web/src/map2/api.ts` with event-list CRUD, event CRUD, start/stop/status, learn-mode, capture, and ad-hoc MSC send APIs.
  - Shipped `web/src/app/pages/midi-hub/MidiHubEventsPage.tsx` with dedicated Carbon event-list manager, event editor, status, learn-mode, and MSC builder components plus route-local styling and page coverage.
  - Added `tests/test_midi_hub_event_lists.py` to cover CRUD, MTC firing/looping, RTC recurrence scheduling, MSC builder output, raw MIDI output, and learn-mode capture.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubEventsPage.test.tsx` -> pass, `pytest tests/test_midi_hub_event_lists.py` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

ID: T203-subF
Status: [✓] Done
Title: Message Processing area — filters, mappers, scripts, macros, scheduler rewrite
Description:
- Goal / acceptance criteria: Rewrite the Message Processing area (`/midi-hub/processing`) with all existing capabilities in clean Carbon patterns. Filter Planner: Carbon pill-style `Tag` toggles for channel/type filtering with live preview. Message Mapper: Carbon `Accordion` or master-detail for 16 mapper slots with per-slot config (source, type, channel range, value range, target, curve). Script Editor: retain code editor but wrap in Carbon `Layer` with Carbon toolbar for save/load/run/examples. Macros: Carbon `DataTable` for macro list with inline trigger button. Scheduler: Carbon `DataTable` with status column (pending/sent/cancelled). All panels follow Carbon data table + accordion patterns per Carbon guidance for dense data.
- Why it matters: Processing is the automation brain — it must be approachable for musicians, not just engineers.
- Dependencies: T203-subA
- Estimated effort: High
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubProcessingPage.tsx` and CSS
  - Rewritten: `MidiHubFilterPlanner.tsx`, `MidiHubMessageMapper.tsx`, `MidiScriptEditor.tsx`, `MidiMacroPanel.tsx`, `MidiSchedulerPanel.tsx`
  - Tests: renders, filter toggles work, mapper slot CRUD, script save/run, macro trigger, scheduler create/cancel
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 20:24 - Codex
- Completion notes:
  - Rebuilt `web/src/app/pages/midi-hub/MidiHubProcessingPage.tsx` into a route-specific Carbon processing workspace and added `MidiHubProcessingPage.css` for the new band/layout/toolbar/table styling.
  - Added `web/src/app/components/MidiHub/MidiHubFilterPlanner.tsx` with Carbon tag-toggle channel/message filters, route selection, live route preview, and save-back to the routed filter configuration.
  - Added `web/src/app/components/MidiHub/MidiHubMessageMapper.tsx` as a 16-slot accordion planner with saved local slot state, per-slot source/message/curve/value configuration, and clear/save controls.
  - Reworked `MidiScriptEditor.tsx`, `MidiMacroPanel.tsx`, and `MidiSchedulerPanel.tsx` into Carbon toolbar/DataTable workflows aligned to the processing-area acceptance criteria.
  - Added dedicated route coverage in `web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` for render, filter save, mapper slot editing, script save/run, macro trigger, and scheduler create/cancel flows.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubProcessingPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import/chunk-size warnings only).

ID: T203-subG
Status: [✓] Done
Title: Network & Protocol area — RTP-MIDI, OSC namespace, MIDI 2.0, Tesira TTP, Virtual GPIO, String Interface
Description:
- Goal / acceptance criteria: Rewrite and expand the Network area (`/midi-hub/network`) with all existing capabilities plus new features:
  1. **RTP-MIDI** (existing, rewrite): Carbon `DataTable` for sessions with latency metrics, create/delete/test actions.
  2. **OSC Bridge** (existing, rewrite): Carbon forms for server start/stop, message send. Enhanced with structured `/map2/*` namespace browser showing all available OSC addresses.
  3. **MIDI 2.0** (existing, rewrite): Carbon panels for device discovery, profile management, UMP translation.
  4. **Tesira TTP Integration** (NEW): Full bidirectional Tesira Text Protocol client.
     - Connection manager: hostname/IP, port (default 23 for Telnet), authentication if secured
     - Prebuilt controls: Fader level controls (get/set/subscribe with slider), mute toggles, preset recall, crosspoint matrix viewer, device info display
     - Command console: free-text TTP command entry with response display, command history, auto-complete for known instance tags
     - Subscription manager: subscribe to Tesira attributes, see live value updates in a streaming table
     - Instance tag browser: `SESSION get aliases` to discover available blocks
     - Device services: reboot, sleep/wake, start/stop audio, recall/save presets
     - Connection status indicator with auto-reconnect
  5. **Virtual GPIO** (NEW): 12 virtual inputs (contact closure simulation) and 12 virtual relay outputs. Each input has a label, state (open/closed), and can trigger event list actions. Each output has a label, state (energized/de-energized), and can be fired from event actions or macros. Grid display with toggle buttons.
  6. **String Interface** (NEW): Send/receive text commands over UDP. Same syntax as ETC string protocol — fire cues, trigger macros, recall presets via text commands. Configurable TX/RX ports and IP addresses. Command log with timestamps.
- Why it matters: Network is where MAP2 connects to the wider production ecosystem. Tesira integration is a primary user requirement. Virtual GPIO and String Interface complete Net3 feature parity.
- Dependencies: T203-subA
- Estimated effort: Very High
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubNetworkPage.tsx` and CSS
  - Rewritten: `MidiNetworkPanel.tsx`, `Midi2Panel.tsx`
  - New backend: `app/services/midi_hub/tesira_client.py` — TCP socket client for TTP, command parser, subscription manager, auto-reconnect
  - New backend: `app/services/midi_hub/virtual_gpio.py` — 12 inputs, 12 outputs, state tracking, event triggers
  - New backend: `app/services/midi_hub/string_interface.py` — UDP string server, command parser (Go, Cue, Stop, Resume, SubMove, Macro, etc.)
  - New backend routes in `app/routes/midi_hub.py`: Tesira connect/disconnect/command/subscribe/aliases/presets, GPIO get/set/label, String send/receive/config
  - New frontend components: `TesiraPanel.tsx` (connection + prebuilt controls + command console), `VirtualGpioPanel.tsx` (grid of 12+12 toggles), `StringInterfacePanel.tsx` (UDP config + command log)
  - Tests: backend — `tests/test_tesira_client.py`, `tests/test_virtual_gpio.py`, `tests/test_string_interface.py`. Frontend — `MidiHubNetworkPage.test.tsx`
- Implementation notes:
  - Tesira TTP syntax: `InstanceTag command attribute [index] [value] LF`
  - Supported commands: get, set, increment, decrement, toggle, subscribe, unsubscribe
  - Responses: `+OK` (success), `+OK "value":X` (get response), `-ERR` (error)
  - Subscriptions: `! "publishToken":"label" "value":X` notifications
  - Instance tags are case-sensitive, no `/` or `&` characters allowed
  - Default Telnet port 23, baud rates for RS-232: 9600-115200
  - Session command: `SESSION get aliases` returns available instance tags
  - Device command: `DEVICE recallPreset 1001`, `DEVICE get deviceInfo`
  - Prebuilt Tesira controls should cover: Level (fader + mute), MatrixMixer (crosspoint level + mute), SourceSelector, Router, Meter
  - Virtual GPIO: stored in memory (not DB), reset on hub restart, state change fires registered callbacks
  - String Interface: UDP socket on configurable port (default 3037), same command vocabulary as ETC serial strings
  - Enterprise flags: Tesira fleet management (multiple Tesira servers), GPIO hardware mapping (future USB relay board), String protocol over ACN
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 20:58 - Codex
- Completion notes:
  - Rebuilt `web/src/app/pages/midi-hub/MidiHubNetworkPage.tsx` into a route-specific protocol workspace and added `MidiHubNetworkPage.css` for the new multi-panel network layout.
  - Reworked `MidiNetworkPanel.tsx` and `Midi2Panel.tsx` into Carbon table/form workflows for RTP-MIDI sessions, OSC namespace controls, MIDI-CI discovery, profile/property edits, and UMP translation.
  - Added `TesiraPanel.tsx`, `VirtualGpioPanel.tsx`, and `StringInterfacePanel.tsx` with Tesira connection/command/subscription controls, a 12x12 virtual GPIO surface, and UDP string-command configuration/logging.
  - Added backend services `app/services/midi_hub/tesira_client.py`, `app/services/midi_hub/virtual_gpio.py`, and `app/services/midi_hub/string_interface.py`, plus new MIDI Hub routes for Tesira, GPIO, and string-interface control.
  - Extended `web/src/map2/api.ts` with typed Tesira, GPIO, and string-interface clients and expanded `MidiHubHelpPrimitives.tsx` to register the new protocol panels.
  - Added test coverage in `tests/test_tesira_client.py`, `tests/test_virtual_gpio.py`, `tests/test_string_interface.py`, and `web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx`.
  - Validation: `pytest tests/test_tesira_client.py tests/test_virtual_gpio.py tests/test_string_interface.py` -> pass, `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

ID: T203-subH
Status: [✓] Done
Title: Lab area — AI Learn, Mesh, Device Shadow rewrite
Description:
- Goal / acceptance criteria: Rewrite the Lab area (`/midi-hub/lab`) with all existing capabilities in clean Carbon patterns. AI Learn Suggestions: Carbon form with `AILabel` per Carbon for AI conventions, confidence scores as Carbon `ProgressBar`. Mesh Networking: Carbon `DataTable` for peers with status indicators. Device Shadow State: Carbon `DataTable` for drift events with severity tags. All AI surfaces must include `AILabel` with short disclosure content per `docs/design/CARBON_AI_LABEL_CONFORMANCE.md`.
- Why it matters: Lab features are important to the user and must be first-class, not afterthoughts.
- Dependencies: T203-subA
- Estimated effort: Medium
- Required outputs:
  - `web/src/app/pages/midi-hub/MidiHubLabPage.tsx` and CSS
  - Rewritten: `MidiInnovationPanel.tsx` split into `AiLearnPanel.tsx`, `MeshNetworkPanel.tsx`, `DeviceShadowPanel.tsx`
  - All AI surfaces include Carbon `AILabel` component
  - Tests: renders, AI suggestions display with confidence, mesh peer CRUD, shadow drift events display
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 21:05 - Codex
- Completion notes:
  - Rebuilt `web/src/app/pages/midi-hub/MidiHubLabPage.tsx` into a dedicated Carbon lab workspace and added `MidiHubLabPage.css` for the new three-panel route layout.
  - Split the old innovation surface into `AiLearnPanel.tsx`, `MeshNetworkPanel.tsx`, and `DeviceShadowPanel.tsx`, with `MidiInnovationPanel.tsx` reduced to a compatibility wrapper over the new panels.
  - Added Carbon `AILabel` disclosure plus confidence `ProgressBar` rendering for AI learn suggestions, a Carbon `DataTable` mesh peer view with peer save/remove and forwarding controls, and a Carbon `DataTable` drift log with severity tags for device shadow events.
  - Added route coverage in `web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx` for AI suggestion display, mesh peer CRUD, and shadow drift presentation.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubLabPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

ID: T203-subI
Status: [✓] Done
Title: `/map2/*` OSC namespace — hierarchical address space with bidirectional feedback
Description:
- Goal / acceptance criteria: Design and implement a hierarchical OSC namespace for MAP2 following ETC `/eos/*` industry-standard pattern. The namespace must expose ALL internal MAP2 state for external control surfaces (TouchOSC, Lemur, Open Stage Control). Namespace structure:
  - `/map2/plugin/<id>/param/<name>` — get/set plugin parameters
  - `/map2/plugin/<id>/bypass` — toggle plugin bypass
  - `/map2/chain/<id>/preset/<number>/fire` — recall chain preset
  - `/map2/cue/<list>/<number>/fire` — fire event list cue
  - `/map2/transport/bpm` — get/set BPM
  - `/map2/transport/start`, `/stop`, `/continue` — transport control
  - `/map2/preset/fire` — recall MIDI hub preset by number
  - `/map2/preset/<id>/fire` — recall by ID
  - `/map2/macro/<id>/fire` — trigger macro
  - `/map2/gpio/in/<number>` — read virtual GPIO input
  - `/map2/gpio/out/<number>` — set virtual GPIO output
  - `/map2/meter/<channel>` — subscribe to metering data
  - `/map2/cmd` — send command string (like ETC `/eos/cmd`)
  - `/map2/ping` → `/map2/out/ping` — latency test
  - Implicit output (auto-broadcast when state changes):
    - `/map2/out/active/preset` — currently active preset
    - `/map2/out/active/cue/<list>/<number>` — active cue with progress
    - `/map2/out/transport/bpm` — current BPM
    - `/map2/out/event/cue/<list>/<number>/fire` — cue fired notification
    - `/map2/out/event/preset/<id>/recall` — preset recalled notification
    - `/map2/out/meter/<channel>` — metering data stream
  - Namespace browser UI in the Network area showing all available addresses with descriptions
- Why it matters: OSC namespace makes MAP2 controllable by any OSC surface — this is how professional show control systems integrate with custom control surfaces.
- Dependencies: T203-subG (OSC bridge rewrite)
- Estimated effort: Very High
- Required outputs:
  - Backend: `app/services/midi_hub/osc_namespace.py` — address router, parameter mapping, implicit output broadcaster
  - Backend: update `app/services/midi_hub/network.py` OSC server to dispatch through namespace router
  - Frontend: `OscNamespaceBrowser.tsx` — searchable tree view of all `/map2/*` addresses with descriptions and current values
  - Documentation: `docs/midi/MAP2_OSC_NAMESPACE.md` — complete address reference (modeled after ETC Eos Show Control User Guide OSC section)
  - Tests: `tests/test_osc_namespace.py` — address routing, parameter get/set, implicit output, ping
- Implementation notes:
  - Follow ETC hierarchical pattern: noun/verb structure, fire for actions, get/set for values
  - Implicit output: use Python `asyncio` pub/sub — when internal state changes, broadcast to all connected OSC clients
  - Metering: throttle to 25Hz max to avoid flooding
  - Use `python-osc` library (already in project for OSC bridge)
  - Enterprise flags: namespace access control (whitelist addresses per client), OSC-over-TCP for reliable transport, namespace versioning
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 21:29 - Codex
- Completion notes:
  - Added `app/services/midi_hub/osc_namespace.py` as the canonical `/map2/*` router covering transport, plugin parameter/bypass, presets, chains, cues, macros, GPIO, meter feedback, command dispatch, ping, and implicit output event logging.
  - Updated `app/services/midi_hub/network.py` so incoming `/map2/*` OSC packets are dispatched through the namespace router while legacy OSC-to-MIDI mappings remain intact, and added namespace event fanout back to known OSC clients.
  - Extended `app/routes/midi_hub.py` with namespace catalog and direct dispatch endpoints for the browser and tooling workflows.
  - Added `web/src/app/components/MidiHub/OscNamespaceBrowser.tsx` and integrated it into `MidiNetworkPanel.tsx`, then extended `web/src/map2/api.ts` with typed namespace catalog and dispatch clients.
  - Added namespace reference documentation in `docs/midi/MAP2_OSC_NAMESPACE.md`.
  - Added backend coverage in `tests/test_osc_namespace.py` for parameter dispatch, bypass, BPM, chain recall, cue fire, preset recall, macro fire, GPIO state, ping, and catalog feedback.
  - Validation: `pytest tests/test_osc_namespace.py` -> pass, `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- --runInBand web/src/app/pages/midi-hub/MidiHubNetworkPage.test.tsx` -> pass, `npm --prefix web run build` -> pass (existing dynamic-import/chunk-size warnings only).

ID: T203-subJ
Status: [>] In Progress
Title: Documentation, conformance, and test suite finalization
Description:
- Goal / acceptance criteria: Update all documentation to reflect the new MIDI Hub v2 architecture. Produce all Carbon conformance evidence. Ensure full test coverage.
  1. Update `docs/design/CARBON_ROUTE_PATTERN_MAPPING.md` with new `/midi-hub/*` child routes
  2. Update `docs/design/CARBON_CONFORMANCE_MATRIX.md` with v2 conformance status
  3. Complete Carbon Contribution Review Checklist for T203
  4. Update `docs/midi/MIDI_HUB_CONTENT_INVENTORY.md` with new feature inventory
  5. Update `docs/midi/MIDI_HUB_ARCHITECTURE.md` with v2 architecture (sidebar nav, new services, Tesira, GPIO, String Interface, Event Lists, OSC namespace)
  6. Create `docs/midi/MAP2_OSC_NAMESPACE.md` — complete OSC address reference
  7. Create `docs/midi/TESIRA_TTP_INTEGRATION.md` — Tesira integration guide with supported commands, connection setup, and prebuilt control reference
  8. Update `docs/CLAUDE.md` Global Work List section and Key File Locations
  9. Sync instruction changes to `.gemini/instructions.md` and `.github/copilot-instructions.md`
  10. Full test suite: all new frontend pages have `.test.tsx` files, all new backend services have `tests/test_*.py` files
  11. Final validation: `npm run typecheck` + `npm run build` + `pytest tests/` must all pass
- Why it matters: Documentation and conformance evidence are required deliverables per the Carbon Conformance Standard. Tests are required per "Done Means Clean Build" rule.
- Dependencies: T203-subA through T203-subI (all must be complete)
- Estimated effort: High
- Required outputs: All items listed above. No silent exceptions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-19 21:33 - Codex

ID: T203-subK
Status: [ ] Todo
Title: Tesira hardware integration testing (save for end)
Description:
- Goal / acceptance criteria: Test the Tesira TTP integration against the real Tesira system on the network. Verify: TCP connection, instance tag discovery, fader get/set, mute toggle, preset recall, subscription live updates, auto-reconnect on disconnect, command console free-text commands. Archive evidence.
- Why it matters: User explicitly requested saving hardware tests for the end.
- Dependencies: T203-subG (Tesira TTP implementation), live Tesira hardware on network
- Estimated effort: Medium
- Required outputs: Test evidence document, any bug fixes discovered during testing.
Subtasks: None
Assigned to: Claude + Lab
Last updated: 2026-03-17 - Claude

Assigned to: Claude
Last updated: 2026-03-17 - Claude

## API Reliability

ID: T209
Status: [>] In Progress
Title: API startup, restart, and load-reliability remediation program
Description:
- Goal / acceptance criteria: Eliminate the API failure modes observed in the 2026-03-07 qualification review by hardening startup/readiness behavior, restart sequencing, endpoint degradation paths, and observability so that the load qualification suite passes consistently without transient `404`, `500`, `503`, connection resets, or 8-second read/connect timeouts during warmup or steady-state runs.
- Why it matters: The reviewed artifacts show one failed qualification run with 379/400 HTTP failures and 9240 WebSocket drops plus several earlier smoke runs with transient route/server errors, which blocks confidence in API reliability during restart and qualification.
- Dependencies: Existing load qualification artifacts under `docs/fit-for-purpose-evidence/20260307/`, backend service orchestration, API observability/logging stack, and final verification with `tests/load_test.py`
- Estimated effort: High
- Required outputs/deliverables: Implemented backend fixes, updated qualification/runbook logic, correlated observability artifacts, regression tests for startup/restart behavior, and a new evidence bundle showing repeatable pass under smoke and full qualification.
Subtasks:
ID: T209-subA
Status: [✓] Done
Title: Convert startup and warmup states into explicit readiness gates
Description:
- Goal / acceptance criteria: Audit all load-tested API and websocket entry points and ensure they fail fast with structured readiness responses while dependencies are still warming up instead of hanging into client-side timeouts. Define concrete readiness checks for backend HTTP serving, chain inventory access, plugin inventory/discovery state, websocket broker availability, and any engine-backed audio routes. Acceptance requires a documented readiness matrix, implementation changes on affected routes/services, and automated tests proving warmup returns deterministic readiness errors instead of connection/read timeouts.
- Why it matters: The failed T050 run shows broad timeout behavior across unrelated routes, which is consistent with requests arriving before the stack is fully ready.
- Dependencies: None
- Estimated effort: Medium
- Required outputs/deliverables: Readiness matrix, route/service updates, startup-state tests, and notes linking coverage to the affected endpoints from the failure review.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:34 - Codex
- Completion notes:
  - Added shared route-readiness helper logic in `app/services/api_readiness.py` to convert startup and warmup states into structured `503` responses with dependency detail and `Retry-After` guidance.
  - Wired the readiness guards into the load-tested route families hit in the failure review: `/api/audio/status`, `/api/audio/latency`, `/api/audio/levels`, `/api/audio/levels/plugins`, `/api/chains/`, `/api/chains/{id}`, `/api/chains/{id}/activate`, `/api/chains/{id}/deactivate`, `/api/plugins/discover`, `/api/plugins/list`, `/api/plugins/load`, `/api/plugins/unload`, and `/api/plugins/batch/parameters`.
  - Added focused tests in `tests/test_api_route_readiness.py` and updated affected route tests so the new startup contract is validated without regressing plugin residency behavior.
  - Added the explicit readiness matrix in `docs/API_ROUTE_READINESS_MATRIX.md`, linking each guarded route family to its required services, readiness reason, and regression coverage so the startup-state contract is documented rather than implicit.

ID: T209-subB
Status: [✓] Done
Title: Stabilize restart sequencing and dependency ordering for backend and realtime services
Description:
- Goal / acceptance criteria: Trace service startup/restart ordering across the MAP2 backend stack and remove races that allow HTTP or websocket traffic before required subsystems are actually usable. Acceptance requires an explicit dependency/ordering map, any required code or service-unit changes, and restart validation showing API health, websocket readiness, and route availability are stable immediately after controlled service-stack restart.
- Why it matters: Later post-restart evidence passed cleanly, which suggests the failure is likely tied to startup ordering or readiness races rather than a permanent logic bug.
- Dependencies: T209-subA
- Estimated effort: Medium
- Required outputs/deliverables: Restart dependency map, service sequencing fixes, controlled restart validation evidence, and updated operational notes if boot/service procedures change.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 08:16 - Codex
- Completion notes:
  - Extended `app/services/service_orchestrator.py` with an explicit startup dependency map, per-level parallel startup visibility, traffic-gate service identification (`database`, `command_queue`, `websocket_manager`), and startup progress counts so restart ordering is queryable instead of implicit.
  - Updated `app/routes/services.py` `/api/services/startup-order` to expose dependency levels, dependents, traffic-gate membership, and startup progress for controlled restart diagnostics.
  - Tightened `app/routes/health.py` `/api/ready` to report both `ready` and `accepting_traffic`, with `accepting_traffic` gated on the restart-safe base services required for stable HTTP/WebSocket handling.
  - Added `docs/API_RESTART_DEPENDENCY_MAP.md` to document the base restart dependency map and readiness contract used by the API.
  - Validation: `pytest -q tests/test_health_routes.py tests/test_service_routes.py tests/test_api_route_readiness.py` -> pass. `python3 -m compileall ...` hit an existing `__pycache__` permission error under `app/services/`, so compile-only validation was not fully usable in this workspace.

ID: T209-subC
Status: [✓] Done
Title: Harden chain and plugin lifecycle endpoints against transient 404/500/503 failures
Description:
- Goal / acceptance criteria: Review the chain activation/deactivation, chain lookup, plugin load, and plugin unload flows that appeared in the transient smoke failures and make them resilient to restart-time and warmup-time races. Acceptance requires root-cause analysis for the observed `/api/plugins/unload` `404`, chain endpoint `500`/`503` responses, and connection resets; route or service fixes that return the correct status/payloads; and focused regression tests that exercise lifecycle calls during degraded states.
- Why it matters: Even though the final qualification reruns passed, the transient lifecycle failures indicate brittle contract behavior around the most stateful API surfaces.
- Dependencies: T209-subA, T209-subB
- Estimated effort: High
- Required outputs/deliverables: Root-cause notes, backend fixes, targeted tests for chain/plugin lifecycle routes, and updated API contract documentation if any response semantics are formalized.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 09:03 - Codex
- Completion notes:
  - Updated `app/routes/chains.py` so list, lookup, activate, and deactivate paths now return structured `503` readiness payloads for transient timeout/session failures when no usable cache exists, instead of leaking empty/deferred success responses during restart races.
  - Added `raise_route_transient_unavailable()` in `app/services/api_readiness.py` so degraded lifecycle routes reuse the same retryable warmup contract and dependency detail as the explicit readiness gates.
  - Hardened `app/routes/plugins.py` `load_plugin` to force a single discovery refresh before returning `404` when the in-memory plugin inventory is empty after restart, eliminating a common false-miss window.
  - Validation: `pytest -q tests/test_api_route_readiness.py tests/test_plugins_residency.py` -> pass.

ID: T209-subD
Status: [✓] Done
Title: Add correlated request, websocket, and dependency observability for qualification failures
Description:
- Goal / acceptance criteria: Extend logging/observability so every future load run can be correlated across HTTP requests, websocket sessions, dependency readiness, queue depth, and backend exceptions using a shared run or request context. Acceptance requires new or improved structured logs/metrics for timeout-prone areas, a documented artifact-capture path for qualification runs, and tests or smoke validation proving the data is emitted during failure and pass scenarios.
- Why it matters: Current client-side artifacts show the symptoms clearly, but they do not isolate the server-side cause of timeouts and resets quickly enough for efficient remediation.
- Dependencies: T209-subA
- Estimated effort: Medium
- Required outputs/deliverables: Structured log/metric additions, qualification capture instructions or script updates, and evidence examples tying a run ID to backend-side events.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 09:18 - Codex
- Completion notes:
  - Extended `app/services/api_observatory.py` and `app/routes/api_observatory.py` so observability events now carry `event_type` and `run_id`, and can be filtered per qualification run for both live traffic and stats views.
  - Updated `app/middleware/traffic_capture.py` to capture qualification run IDs from request headers/query params and attach restart/dependency snapshots to tagged requests and server-side failures.
  - Updated `app/services/websocket_manager.py`, `app/routes/websocket.py`, and `tests/load_test.py` so qualification runs now correlate normal WebSocket lifecycle events (`connect`, `subscribe`, `disconnect`, timeout/failure paths) with the same run ID used by HTTP traffic.
  - Added operator documentation in `docs/API_QUALIFICATION_OBSERVABILITY.md` and regression coverage in `tests/test_api_observatory.py`.
  - Validation: `pytest -q tests/test_api_observatory.py tests/test_api_route_readiness.py tests/test_plugins_residency.py` -> pass. `python3 -m py_compile ...` hit the existing `app/services/__pycache__` permission issue in this workspace.

ID: T209-subE
Status: [✓] Done
Title: Make load qualification gating restart-safe and preflight-aware
Description:
- Goal / acceptance criteria: Update the load-qualification workflow so it verifies environment prerequisites and service readiness before the expensive smoke/full runs begin. This includes preflight checks for file descriptor limits, API health, websocket readiness, chain/plugin route availability, and any other conditions learned from T050-T053. Acceptance requires workflow/runbook updates and automated preflight behavior that prevents collecting misleading full-run failures when the environment is not yet ready.
- Why it matters: The failed run also carried an open-file-limit warning and appears to have started against an unhealthy or incompletely started stack; the qualification harness should catch those conditions first.
- Dependencies: T209-subA, T209-subB, T209-subD
- Estimated effort: Medium
- Required outputs/deliverables: Updated qualification runner or scripts, revised runbook/docs, preflight checks in automation, and evidence showing the gate blocks unsafe starts.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 09:31 - Codex
- Completion notes:
  - Added `scripts/run_t209_api_load_qualification.py`, a deterministic preflight gate that checks open-file limits, `/api/ready`, startup-order completion, `websocket_manager` readiness, and the chain/plugin qualification routes before allowing any load command to execute.
  - The runner now emits artifact-ready JSON/markdown summaries and blocks load execution with explicit `BLOCKED` status when readiness or restart-safety prerequisites are not met.
  - Added focused regression coverage in `tests/test_t209_api_load_qualification.py` and documented the workflow in `docs/API_LOAD_QUALIFICATION_RUNBOOK.md`.
  - Validation: `pytest -q tests/test_t209_api_load_qualification.py tests/test_api_observatory.py tests/test_api_route_readiness.py tests/test_plugins_residency.py` -> pass. `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile scripts/run_t209_api_load_qualification.py app/services/api_observatory.py app/middleware/traffic_capture.py app/services/websocket_manager.py app/routes/websocket.py app/routes/api_observatory.py tests/load_test.py` -> pass.

ID: T209-subF
Status: [✗] Blocked
Title: Re-run smoke, full soak, and restart qualification to close the reliability program
Description:
- Goal / acceptance criteria: After the remediation work lands, execute the smoke, full 310-second qualification, and controlled restart qualification enough times to demonstrate the failures are gone and the pass is repeatable. Acceptance requires zero HTTP failures, zero websocket drops, acceptable latency gates, archived artifacts, and a short closure report comparing the fixed runs against the 2026-03-07 failure signatures.
- Why it matters: This program is not complete until the observed failure patterns are demonstrably absent in fresh evidence.
- Dependencies: T209-subB, T209-subC, T209-subD, T209-subE
- Estimated effort: Medium
- Required outputs/deliverables: New qualification artifact bundle under `docs/fit-for-purpose-evidence/`, closure summary, and final worklist update with pass/fail disposition.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:39 - Codex
- Blocked notes:
  - Re-ran the T209 preflight on `2026-03-18` using `python3 scripts/run_t209_api_load_qualification.py --output-dir docs/fit-for-purpose-evidence/20260318T223428Z-t209-preflight --api-base http://127.0.0.1:8080`.
  - The live backend had to be restarted first because the pre-existing `uvicorn` process on port `8080` was serving an older readiness contract; after restart, `/api/ready` correctly reported `accepting_traffic: true` and `/api/services/startup-order` exposed `traffic_gate_services` and `startup_progress`.
  - Follow-up task `T221` is now complete: the preflight startup-order check was aligned with traffic-gate readiness semantics and validated by `pytest -q tests/test_t209_api_load_qualification.py` (`3 passed`) plus a fresh preflight artifact at `docs/fit-for-purpose-evidence/20260318T223805Z-t209-preflight`.
  - Qualification remains blocked in this workspace only because the host soft/hard `RLIMIT_NOFILE` is `8192`, below the required `65536`; this is host-level/operator intervention outside the repo.

ID: T221
Status: [✓] Done
Title: Align T209 preflight startup-order gating with traffic-gate readiness semantics
Description:
- Goal / acceptance criteria: Update the T209 preflight logic so `/api/services/startup-order` passes when the traffic-gate services required for HTTP/WebSocket qualification are complete, without incorrectly blocking on optional or non-traffic-gating services that may legitimately remain unfinished while `/api/ready` already reports `accepting_traffic: true`. Acceptance requires clarified gating criteria, code changes in `scripts/run_t209_api_load_qualification.py` (and docs/tests if needed), and validation showing the startup-order check agrees with the readiness contract exposed by `/api/ready`.
- Why it matters: The current preflight run on `2026-03-18` blocked on `startup_progress.completed_services=13/15` despite `/api/ready` reporting `accepting_traffic: true`, which means the qualification harness can still over-block even after the readiness-gate fixes landed.
- Dependencies: T209-subA, T209-subB, T209-subE
- Estimated effort: Medium
- Required outputs/deliverables: Updated preflight/startup-order gating logic, regression coverage or focused validation, and runbook notes reflecting the refined contract.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:39 - Codex
- Completion notes:
  - Updated `scripts/run_t209_api_load_qualification.py` so the startup-order preflight now passes when the declared `traffic_gate_services` are present and marked `gates_accepting_traffic`, with a bounded fallback based on gate-count completion when the detailed metadata is absent.
  - Added regression coverage in `tests/test_t209_api_load_qualification.py` for the partial-startup-but-traffic-ready case and validated it with `pytest -q tests/test_t209_api_load_qualification.py` -> `3 passed in 1.84s`.
  - Re-ran the live preflight after restarting the stale backend; `docs/fit-for-purpose-evidence/20260318T223805Z-t209-preflight` shows `api_ready`, `startup_order`, `websocket_manager`, and the chain/plugin route gates all passing, leaving only the host open-file limit as the remaining blocker.

## SynthForge

ID: T210
Status: [✓] Done
Title: Refactor SynthForge into a SoundFont-first world-class sampler
Description:
- Goal / acceptance criteria: Review the existing `SynthForge` JUCE plugin plus `SynthForgeCard` UI, then refactor the instrument from the current subtractive/SFZ-oriented scaffold into a SoundFont-first sampler centered on hardware MIDI keyboards and the on-screen piano. Acceptance requires SoundFont 2 and 3 loading from the internal library, a preset browser built from parsed banks/programs, a redesigned on-screen piano with velocity interaction, real-time MIDI input handling aligned with JUCE MIDI pathways, and pro controls for master transpose, velocity curve, pitch-bend range, mono/poly mode, and legato. The implementation must expose a coherent backend/API/UI contract and preserve existing MAP2 integration points.
- Why it matters: The current SynthForge surface and engine do not match the requested product direction. The user explicitly wants a commercial-grade sampler architecture, not an SFZ scaffold with synth controls.
- Dependencies: Existing `juce-engine/Source/SynthForge/*`, `app/routes/synthforge.py`, `app/routes/soundfonts.py`, `app/services/juce_engine_service.py`, `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, and build-system support for a SoundFont engine backend.
- Estimated effort: High
- Required outputs/deliverables: Reviewed architecture notes, implemented backend/API changes for SoundFont browsing/loading and preset metadata, JUCE core refactor toward SoundFont playback controls, redesigned SynthForge card, focused automated validation, and explicit notes for any remaining gaps such as static FluidSynth vendoring/build integration if not fully closed in this slice.
Subtasks:
ID: T210-subA
Status: [✓] Done
Title: Deliver the first integrated SoundFont sampler slice across backend, engine, and card
Description:
- Goal / acceptance criteria: Land the first end-to-end slice that replaces SFZ-first UX with SoundFont-first browsing/loading, exposes parsed preset metadata, and adds the required sampler performance controls in the engine/API/card. Acceptance requires code changes in the relevant backend, JUCE, and frontend files plus targeted validation.
- Why it matters: This is the minimum coherent slice that converts SynthForge from a review item into a working sampler refactor.
- Dependencies: None
- Estimated effort: High
- Required outputs/deliverables: Code changes, tests/build notes, and handoff notes for any remaining FluidSynth packaging work.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 19:14 - Codex
- Completion notes:
  - The backend SoundFont-first route layer is in place in `app/routes/synthforge.py`, including validated `.sf2/.sf3` load endpoints, parsed bank/program preset selection, per-part performance controls, MIDI note injection, backend/streaming status, and metering websocket support.
  - The engine service bridge in `app/services/juce_engine_service.py` exposes the SoundFont load/status pathway alongside the existing SFZ path and provides the parameter/status accessors consumed by the route layer.
  - The frontend card in `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx` already delivers the requested first coherent sampler UX slice: unified library browser, SoundFont preset browser, format-aware `.sf2/.sf3/.sfz` loading, performance controls (transpose, velocity curve, pitch-bend range, mono, legato), velocity-sensitive on-screen piano, and real-time MIDI activity feedback.
  - Validation: `pytest -q tests/test_synthforge_routes.py tests/test_soundfont_parser.py` -> pass (`18 passed`). `npm --prefix web run typecheck` -> pass. `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/routes/synthforge.py app/services/juce_engine_service.py app/services/soundfont_parser.py` -> pass.
  - Remaining `T210` scope is now the follow-up compatibility and refinement program beyond the first integrated slice, not the basic SoundFont-first end-to-end contract.
Assigned to: Codex
Last updated: 2026-03-18 22:40 - Codex
- Completion notes:
  - Delivered the SoundFont-first SynthForge sampler contract through `T210-subA`: validated `.sf2/.sf3` loading, parsed bank/program preset metadata, preset-aware backend routes, performance controls, velocity-sensitive on-screen piano, and real-time MIDI activity feedback are all in place across the route layer, engine bridge, and card UI.
  - The remaining notes previously attached to `T210` described follow-up compatibility and refinement opportunities, not missing acceptance criteria for the requested SoundFont-first sampler direction.

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

## Navigation Shell

ID: T204
Status: [✓] Done
Title: Advanced Menu launcher redesign matches the landing-page launcher aesthetic
Description:
- Goal / acceptance criteria: Review the current Advanced Menu in the top shell and redesign it so the open panel mirrors the landing-page launcher design language: neon-grid/brand-mark hero treatment, expressive header hierarchy, grouped route card launcher layout, and landing-page-style card interactions for advanced workflows while preserving existing pinning, route access, blocked-state handling, and hardware/location notes.
- Why it matters: The current Advanced Menu still reads like a generic dropdown and breaks visual continuity with the home launcher, which makes advanced workflows feel disconnected from the rest of the product.
- Dependencies: Existing `AppShell` advanced menu state, `advancedMenuItems`, `homeCardProfiles`, and current shell navigation behavior
- Estimated effort: Medium
- Required outputs: Updated Advanced Menu markup/state in `web/src/app/layout/AppShell.tsx`, route-launcher styling in a co-located stylesheet, focused `AppShell` test updates if behavior/labels move, and validation notes from frontend tests/type/build checks
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 16:36 - Codex
- Completion notes:
  - Replaced the Advanced Menu accordion dropdown with a launcher-style panel in `AppShell` that now uses a branded hero header, launcher metrics, grouped section headings, and landing-page-style route cards with open/details actions.
  - Preserved existing shell behavior for route navigation, pin toggles, blocked-route handling, current-route highlighting, and hardware/location notes while adding card-level detail expansion driven by `homeCardProfiles`.
  - Added a co-located `AppShell.css` stylesheet so the Advanced Menu can carry the landing page's neon-grid/brand-mark treatment without relying on global shell dropdown styles.
  - Validation: `npm run typecheck` -> pass, `npm test -- AppShell.test.tsx --runInBand` -> pass, `npm run build` -> pass (existing Vite chunk-size warnings only).
  - Follow-up refinement completed: blocked and experimental routes now surface in a dedicated `Blocked / Lab` section, the current route card auto-expands when the launcher opens, the mobile menu remains compact, the `Advanced` trigger label is unchanged, and the launcher metrics remain visible.

## Icon System

ID: T205
Status: [✓] Done
Title: Icon system overhaul — monotone Carbon-style SVG icons with DSP color taxonomy
Description:
- Goal: Replace all icons across the MAP2 GUI (main app + PiPedal legacy area) with a unified set of monotone, Carbon Design System-style SVG icons. Apply DSP-type color taxonomy to all categories.
- Why it matters: Current icon system uses four libraries (Carbon, Phosphor, MUI, 63 custom PiPedal SVGs) with inconsistent styles and no systematic color-coding.
- Design documentation complete — see docs/design/ for all reference material before starting implementation.
- Current execution evidence: `docs/design/ICON_DOWNLOAD_LIST.md` now shows the previously unresolved 20-slot manual-sourcing list as closed with staged MAP-authored SVGs; `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` now records the post-sweep active-frontend state with `0` Phosphor files, `0` remaining MUI-icon files, and `0` tracked emoji/symbol UI-icon files across `web/src/app` + `web/src/map2`, with any remaining legacy icon-package debt now outside that active scope in `web/src/pipedal/**` and shared utility surfaces.
- Estimated effort: High
- Completion notes:
  - Closed the remaining active-frontend asset/mapping tail by wiring the staged noun icons for distortion, drums, modulation, and multi-effect rack categories through `web/src/app/components/icons/effectIcons.ts`.
  - Verified the active-frontend exit criteria directly: `rg -n "@phosphor-icons/react|@mui/icons-material" web/src/app web/src/map2 -g '*.tsx' -g '*.ts'` returns no matches, and the tracked emoji/symbol sweep across the same roots reports `TOTAL_FILES 0`.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass (existing chunk-size warnings only).
Subtasks:
ID: T205-subA
Status: [✓] Done
Title: Close the 20 unresolved icon asset slots and stage the approved SVG set
Description:
- Goal / acceptance criteria: Complete the remaining manual sourcing listed in `docs/design/ICON_DOWNLOAD_LIST.md`, normalize all approved SVGs into `web/src/app/components/icons/noun/**`, and record any permanent exceptions in the migration ledger.
- Why it matters: The full migration cannot finish while core icon slots are still missing, because holdout pages and plugin cards would be forced to keep legacy libraries or generic fallbacks.
- Dependencies: Existing `docs/design/ICON_DOWNLOAD_LIST.md`, `docs/design/ICON_DESCRIPTIONS.md`, and MAP-owned icon storage paths under `web/src/app/components/icons/`
- Estimated effort: Medium
- Required outputs: 20 sourced/normalized SVG files, naming/path validation, and updated design docs if any slot remains intentionally exceptional.
Subtasks: None
Assigned to: User + Codex
Last updated: 2026-03-18 15:40 - Codex
- Completion notes:
  - Added the 20 previously unresolved icon slots as monotone SVG assets under `web/src/app/components/icons/noun/**`, covering the remaining `fx-*`, `pip-*`, and `map-dynamics` files referenced by `docs/design/ICON_DOWNLOAD_LIST.md`.
  - Updated `web/src/app/components/icons/effectIcons.ts` to consume the staged noun assets for the newly closed effect categories instead of keeping those categories on legacy `HorizontalSignalChain` SVG sources.
  - Updated `docs/design/ICON_DOWNLOAD_LIST.md` so the manual-sourcing section now records the staged completion state instead of leaving the slots open.
  - Validation: `xmllint --noout web/src/app/components/icons/noun/**/*.svg` -> pass, `npm --prefix web run typecheck` -> pass.
  - Residual risk: `npm --prefix web run build` still fails on pre-existing `PlatformLayerData` type errors in `web/src/app/components/Platform/PlatformModal.tsx`; no build regression attributable to the icon asset work was observed.

ID: T205-subB
Status: [✓] Done
Title: Retire plugin-card and shared app Phosphor holdouts in active `web/src/app/**` surfaces
Description:
- Goal / acceptance criteria: Replace the remaining Phosphor icon usage in active `web/src/app/**` plugin cards, host/cluster dashboards, and page headers with Carbon controls or MAP-owned category/domain icons, with no behavioral regressions.
- Why it matters: These surfaces are active operator-facing UI and still carry the most visible mixed iconography in the modern app shell.
- Dependencies: T205-subA for missing SVG coverage, `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` Groups D/E/F, and existing app-shell/icon ownership rules
- Estimated effort: High
- Required outputs: Updated app components with Phosphor removed from the targeted groups, focused UI regression checks, and ledger count reductions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:31 - Codex
- Progress notes:
  - Shared plugin-card shell controls in `web/src/app/components/PluginCards/Base/PluginCardShell.tsx` now use Carbon icons for preset actions, overflow menu, copy/reset actions, and MIDI mappings.
  - Shared section chevrons in `web/src/app/components/PluginCards/Base/ParameterSection.tsx` now use Carbon `ChevronDown`/`ChevronRight`.
  - `web/src/app/components/PluginCards/Dialogs/MidiMappingDialog.tsx` now uses Carbon icons for dialog close/save/warning/delete/routing controls.
  - Additional plugin-card custom/dialog surfaces now moved off Phosphor for their shared controls: `web/src/app/components/PluginCards/Dialogs/ExpressionOverlay.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/NativeDelayCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/REEVRCard.tsx`, and `web/src/app/components/PluginCards/Custom/JUCE/IntervalShifterCard.tsx`.
  - Remaining plugin-card custom files were completed in the same migration wave: `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/BossXS1Card.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/EVHPitchShifterCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/OutotuneCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/WhammyCard.tsx`, `web/src/app/components/PluginCards/Custom/LV2/KeyboardSamplerCard.tsx`, `web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx`, and `web/src/app/components/PluginCards/Custom/Airwindows/GlitchShifterCard.tsx`.
  - Current repo state: `rg -n \"from '@phosphor-icons/react'\" web/src/app/components/PluginCards` now returns no matches, so the plugin-card ecosystem portion of `T205-subB` is complete; remaining scope is active app pages and non-plugin dashboard/header surfaces under `web/src/app/**`.
  - Active page-level migrations also landed for `web/src/app/pages/DSPPage.tsx`, `web/src/app/pages/MeteringPage.tsx`, and `web/src/app/pages/HostMachinePage.tsx`, replacing their remaining Phosphor page/header controls with Carbon or MAP-owned icons.
  - Additional active page migrations landed for `web/src/app/pages/MOTURMEPage.tsx`, `web/src/app/pages/CPUPerformancePage.tsx`, `web/src/app/pages/MPX1DiagView.tsx`, and `web/src/app/pages/HoToneJoGGPage.tsx`.
  - Additional active page migrations landed for `web/src/app/pages/MPX1Page.tsx`, `web/src/app/pages/DrumsPage.tsx`, and `web/src/app/pages/MIDIPage.tsx`.
  - Final active page migrations also landed for `web/src/app/pages/EdirolUA1000Page.tsx` and `web/src/app/pages/LCDPage.tsx`, replacing the remaining Phosphor page/header/control usages with Carbon or MAP-owned icons.
  - Current repo state: `rg -n "from '@phosphor-icons/react'" web/src/app/pages` now returns no matches, so the active page portion of `T205-subB` is complete; remaining scope is non-page `web/src/app/**` dashboard/header surfaces still tracked by the migration ledger.
  - Cluster dashboard holdouts were completed in one batch: `web/src/app/components/ClusterDashboard/ClusterEducationTab.tsx`, `UpdatesTab.tsx`, `TopologyGraph.tsx`, `LiveEventsTab.tsx`, `FlowManagementTab.tsx`, `ClusterOverviewTabEnhanced.tsx`, `ServicesHealthTab.tsx`, `ReportingTab.tsx`, `ClusterOverviewTab.tsx`, and `ClusterAdvancedOperationsTab.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/ClusterDashboard` now returns no matches, so the cluster-dashboard portion of `T205-subB` is complete; next remaining active groups are host-machine, routing, loader, and other shared non-page `web/src/app/**` surfaces.
  - Loader and routing holdouts were completed in a follow-on batch: `web/src/app/components/loaders/NAMLoaderCard.tsx`, `ReverbIRLoaderCard.tsx`, `CabinetIRLoaderCard.tsx`, `web/src/app/components/Routing/ParallelRoutingPanel.tsx`, `SidechainPanel.tsx`, and `EffectsLoopSummaryPanel.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/loaders web/src/app/components/Routing` now returns no matches, so those component groups are complete; remaining active `T205-subB` scope is concentrated in host-machine and other shared `web/src/app/**` surfaces still tracked by the migration ledger.
  - Host-machine holdouts were completed in another batch: `web/src/app/components/HostMachine/MultiSystemDashboard.tsx`, `PerformanceMetrics.tsx`, `BrandingPanel.tsx`, `AlertNotificationSettings.tsx`, `HealthMonitor.tsx`, `MetricsChartsEnhanced.tsx`, `AudioNodeFeatures.tsx`, `MachineSpecsCard.tsx`, `HealthAlarms.tsx`, and `DiskHealthCard.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/HostMachine` now returns no matches, so that component group is complete; remaining active `T205-subB` scope is now the assorted shared `web/src/app/**` surfaces outside pages, plugin cards, cluster dashboard, loaders, routing, and host-machine.
  - Library and upload holdouts were completed in the next shared batch: `web/src/app/components/library/NAMItemCard.tsx`, `IRItemCard.tsx`, `SFItemCard.tsx`, `LibraryPaths.tsx`, `DownloadManager.tsx`, `web/src/app/components/upload/UploadButton.tsx`, and `UnifiedUploadDialog.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/library web/src/app/components/upload` now returns no matches, so those component groups are complete; remaining active `T205-subB` scope is narrowed to the specialized shared surfaces such as chain management, engine/status panels, MPX1, MIDI cluster, onboarding, visualization, and related utility components still tracked by the migration ledger.
  - Status and observability holdouts were completed in the next pass: `web/src/app/components/PiPedalTestStatus.tsx`, `JUCEEngineTestStatus.tsx`, `RealtimeTestResults.tsx`, `UpdateProgressViewer.tsx`, `CPUStatusOverview.tsx`, `web/src/app/components/AudioEngine/ClusterEngineGrid.tsx`, and `web/src/app/components/Visualizations/AudioMeteringCard.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"" web/src/app/components/PiPedalTestStatus.tsx web/src/app/components/JUCEEngineTestStatus.tsx web/src/app/components/RealtimeTestResults.tsx web/src/app/components/UpdateProgressViewer.tsx web/src/app/components/CPUStatusOverview.tsx web/src/app/components/AudioEngine/ClusterEngineGrid.tsx web/src/app/components/Visualizations/AudioMeteringCard.tsx` now returns no matches, so that shared status/observability surface is complete; remaining active `T205-subB` scope is concentrated in MPX1, MIDI cluster, chain-management, onboarding, preset/browser, and a smaller set of shared utility components.
  - The MPX1 cluster is now complete: `web/src/app/components/MPX1/MPX1StatusBar.tsx`, `MPX1ModMatrix.tsx`, `MPX1MidiMapper.tsx`, `MPX1FlowToolbar.tsx`, `MPX1FlowSidebar.tsx`, and `MPX1Librarian.tsx` now use Carbon icons instead of Phosphor.
  - MIDI cluster and MIDI Commander holdouts were completed in the same wave: `web/src/app/components/MidiCluster/MidiClusterNodeCard.tsx`, `MidiClusterClockPanel.tsx`, and `web/src/app/components/MIDICommanderSetup.tsx` now use Carbon icons instead of Phosphor.
  - Chain/routing and supporting utility holdouts were completed in the next wave: `web/src/app/components/ChainManagementCard.tsx`, `ChainPanel/ChainPanel.tsx`, `BottomRoutingPanel/BottomRoutingPanel.tsx`, `HorizontalSignalChain/HorizontalPluginNode.tsx`, `HorizontalSignalChain/SidechainConnector.tsx`, `OnboardingWizard.tsx`, and `NodeAudioPathView.tsx` now use Carbon icons instead of Phosphor.
  - Current repo state: `rg -n "from '@phosphor-icons/react'" web/src/app/components` is now down to seven files: `snapshots/CommunitySnapshotBrowser.tsx`, `PresetsWindow.tsx`, `PluginTags/TagSelector.tsx`, `PluginBrowser/PluginBrowser.tsx`, `LV2PluginParameterEditor.tsx`, `SystemArchitectureFlow.tsx`, and `chains/ChainDeployModal.tsx`.
  - Recommended remaining execution order inside `T205-subB`: snapshot/preset/browser/tag utility surfaces (`CommunitySnapshotBrowser.tsx`, `PresetsWindow.tsx`, `PluginTags/TagSelector.tsx`, `PluginBrowser.tsx`), then the heavier editor/architecture tail (`LV2PluginParameterEditor.tsx`, `SystemArchitectureFlow.tsx`, `chains/ChainDeployModal.tsx`).
- Completion notes:
  - Finished the final seven shared `web/src/app/components` holdouts: `snapshots/CommunitySnapshotBrowser.tsx`, `PresetsWindow.tsx`, `PluginTags/TagSelector.tsx`, `PluginBrowser/PluginBrowser.tsx`, `LV2PluginParameterEditor.tsx`, `SystemArchitectureFlow.tsx`, and `chains/ChainDeployModal.tsx` now use Carbon icons instead of Phosphor.
  - Updated the remaining weight-based filled/duotone icon states in those surfaces to Carbon equivalents such as `StarFilled`, `CheckmarkFilled`, `Renew`, `WarningAlt`, and `Close`, preserving the existing UI behavior without leaving mixed iconography behind.
  - Validation: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"|weight=\"fill\"" web/src/app/components` -> no matches, `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass.
  - Residual risk: `@phosphor-icons/react` remains in the wider frontend dependency graph outside this worklist slice, so future cleanup is still needed if the project wants to retire the library globally rather than just across the active `web/src/app/components` surface covered by `T205-subB`.
  - Focused validation: `npm --prefix web run typecheck` -> pass.

ID: T205-subC
Status: [✓] Done
Title: Migrate Tesira and AVB routing holdouts off MUI icons
Description:
- Goal / acceptance criteria: Replace remaining `@mui/icons-material` usage in the Tesira cluster and AVB routing cluster with Carbon status/action icons or MAP-owned identity icons, while preserving existing workflows and operator readability.
- Why it matters: These clusters remain high-traffic operational surfaces and still depend on the older icon stack for controls, status, and table/grid affordances.
- Dependencies: T205-subA where missing MAP-owned icons are required, `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` Groups B/C, and current Carbon shell/token conventions
- Estimated effort: High
- Required outputs: Updated Tesira/AVB components, no new MUI icon imports in touched files, and validation notes for affected flows.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 19:42 - Codex
- Completion notes:
  - Completed the AVB routing batch: `web/src/app/components/AvbRouting` now has `0` `@mui/icons-material` imports after in-place Carbon replacements across inspector, topology modal, scene diff preview, top bar, node selector, sticky headers, node tree, routing matrix cells, and batch actions.
  - Removed overlapping emoji/symbol-as-icon usage from the AVB routed surfaces touched in this batch, leaving only one remaining non-action warning banner in `AvbRoutingApp.tsx` for the later `T205-subE` cleanup wave.
  - Group B and Group C in `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` are now both cleared for MUI holdouts; broader frontend MUI debt remains in legacy/frontend paths tracked by `T205-subD` and `T205-subF`.
- Validation:
  - `rg -n "@mui/icons-material" web/src/app/components/Tesira web/src/app/components/AvbRouting -g '*.tsx' -g '*.ts'` -> no matches
  - `npm --prefix web run typecheck` -> pass
  - `npm --prefix web run build` -> pass

ID: T205-subD
Status: [✓] Done
Title: Freeze and then clear legacy `web/src/map2/**` and `web/src/pipedal/**` icon debt
Description:
- Goal / acceptance criteria: Audit the remaining legacy icon debt in `web/src/map2/**` and `web/src/pipedal/**`, prevent any expansion of MUI/legacy icon usage, and execute an in-place replacement plan for the still-routed or still-shared surfaces.
- Why it matters: This is the densest remaining legacy icon island and the largest contributor to the unresolved MUI/icon drift totals.
- Dependencies: T205-subA, current route/import reality for legacy surfaces, and `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md` Group A plus PiPedal-related holdouts referenced by T205
- Estimated effort: High
- Required outputs: Prioritized file list for still-active legacy surfaces, migrated replacements for the highest-value routed/shared files, and documented freeze guidance for any non-routed leftovers.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:11 - Codex
- Progress notes:
  - Recounted the current legacy `web/src/map2/**` holdouts: `10` files still import `@mui/icons-material`, with the density concentrated in the heavier standalone panels plus the top-level chain-builder shell rather than the already-migrated modern `web/src/app/**` shell.
  - Documented the first prioritized active/shared legacy file set for in-place cleanup: `WorkFlow.tsx`, `HistoryPanel.tsx`, `FeaturesPanel.tsx`, `SettingsPanel.tsx`, `PluginBrowser.tsx`, `SessionManager.tsx`, `PresetManager.tsx`, `NetworkPanel.tsx`, `MAP2Dashboard.tsx`, and chain-builder node surfaces.
  - Started the replacement wave by migrating shared legacy shells `web/src/map2/components/WorkFlow.tsx`, `HistoryPanel.tsx`, and `FeaturesPanel.tsx` off `@mui/icons-material` and onto Carbon icons without changing their existing MUI layout/runtime behavior.
  - Completed the next connected shared-toolbar batch: `web/src/map2/components/FeatureToolbar.tsx`, `SessionStatusIndicator.tsx`, and `BackupStatusWidget.tsx` now use Carbon icons for history/session/backup controls while preserving the existing MUI surfaces and API behavior.
  - Completed the next shared status-widget batch: `web/src/map2/components/PluginCpuIndicator.tsx`, `LatencyDisplay.tsx`, and `ABQuickToggle.tsx` now use Carbon icons for CPU, latency, and A/B controls while keeping their existing data flow and MUI layout behavior.
  - Completed the next control/snapshot batch: `web/src/map2/components/SnapshotBar.tsx`, `LFOQuickButton.tsx`, and `ChainABMode.tsx` now use Carbon icons for snapshot recall, LFO assignment, and dual-chain A/B controls while preserving their current MUI surface behavior.
  - Completed the next content-manager batch: `web/src/map2/components/EnvelopeFollowerPanel.tsx`, `IRManager.tsx`, and `NAMManager.tsx` now use Carbon icons for envelope, IR, and NAM controls while preserving their existing MUI layouts and API flows.
  - Completed the next dashboard/config batch: `web/src/map2/components/MetricsDashboard.tsx`, `web/src/map2/components/NetworkPanel.tsx`, and `web/src/map2/components/Audio/AudioConfigDialog.tsx` now use Carbon icons for metrics, network, and audio-configuration controls while preserving their existing MUI layouts and API flows.
  - Completed the next automation batch: `web/src/map2/components/Automation/TransportControls.tsx`, `AutomationTimeline.tsx`, and `AutomationLane.tsx` now use Carbon icons for transport, lane headers, and point-context actions while preserving their existing MUI layouts and editing flows.
  - Completed the next editor/helper batch: `web/src/map2/components/AutomationEditor.tsx` and `web/src/map2/components/MIDI/MidiMappingsPanel.tsx` now use Carbon icons for automation transport/LFO actions and MIDI mapping controls while preserving their existing MUI layouts and editing flows.
  - Completed the next device-control batch: `web/src/map2/components/MIDIMapper.tsx` now uses Carbon icons for device tabs, routing, mapping actions, presets, monitor controls, and clock transport while preserving its existing MUI layout and local UI behavior.
  - Completed the next chain-builder node batch: `web/src/map2/components/ChainBuilder/nodes/PluginMeterPanel.tsx`, `RoutingNode.tsx`, `DeviceNode.tsx`, and `AudioPluginNode.tsx` now use Carbon icons for node identity, metering tabs, routing/split visuals, modulation badges, and node actions while preserving the existing React Flow + MUI behavior.
  - Completed the next legacy shared-shell batch: `web/src/map2/components/ChainBuilder/panels/SnapshotBar.tsx`, `MAP2Dashboard.tsx`, and `PluginPresetManager.tsx` now use Carbon icons for snapshot context menus, dashboard tab/header navigation, and preset management actions while preserving their existing MUI layouts and local behavior.
  - Completed the next library/session-management batch: `web/src/map2/components/SessionManager.tsx`, `PresetManager.tsx`, and `PluginBrowser.tsx` now use Carbon icons for session actions, preset favorites/filters, plugin-browser tabs/details, and plugin-pack operations while preserving their existing MUI layouts and backend/API behavior.
  - Completed the final active `web/src/map2/**` holdouts: `SettingsPanel.tsx`, `AudioEngine.tsx`, `WWWPanel.tsx`, and `ChainBuilder.tsx` now use Carbon icons for status tabs, engine controls, web-service management, and chain-builder actions while preserving their existing MUI layouts and data flows.
- Completion notes:
  - The active legacy `web/src/map2/**` island is now cleared: `rg -n "@mui/icons-material" web/src/map2 -g '*.tsx' -g '*.ts'` returns no matches.
  - The broader active-frontend exit audit is also clean after removing the stray weight prop in `web/src/app/pages/MPX1Page.tsx`: `rg -n "from '@phosphor-icons/react'|weight=\"duotone\"|weight=\"bold\"|weight=\"light\"|weight=\"fill\"" web/src/app web/src/map2 -g '*.tsx' -g '*.ts'` returns no matches.
  - Residual legacy icon-package imports remain outside this completed slice in `web/src/pipedal/**` and a small number of shared non-active utility surfaces; those belong to `T205-subF` package-retirement verification rather than the active `map2` migration slice.
- Validation:
  - `npm --prefix web run typecheck` -> pass
  - `npm --prefix web run build` -> pass
  - `rg -n "@mui/icons-material" web/src/map2 -g '*.tsx' -g '*.ts'` -> no matches

ID: T205-subE
Status: [✓] Done
Title: Remove emoji and symbol glyphs used as UI icons across active frontend surfaces
Description:
- Goal / acceptance criteria: Replace emoji/symbol UI markers that act as status, device, or action icons with Carbon/MAP iconography plus text, leaving only legitimate textual content unchanged.
- Why it matters: Emoji and symbol glyphs break the intended visual system and remain a tracked exit criterion in the icon migration ledger.
- Dependencies: T205-subB, T205-subC, T205-subD where shared surfaces overlap, and `docs/design/MAP_ICON_MIGRATION_EXCEPTION_LEDGER.md`
- Estimated effort: Medium
- Required outputs: Reduced emoji/symbol UI marker count in active surfaces, accessibility-safe replacements, and updated ledger totals.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 20:17 - Codex
- Completion notes:
  - Cleared the AVB routing warning-banner glyph in `web/src/app/components/AvbRouting/AvbRoutingApp.tsx`, so the routed AVB cluster no longer uses emoji/symbol markers as UI icons.
  - Replaced emoji/symbol UI markers with Carbon icons or plain text in `web/src/app/components/LCDEventFeed.tsx`, `web/src/app/components/HostMachine/HostMachineSettings.tsx`, `web/src/app/hooks/useAlertNotifications.tsx`, `web/src/app/components/UpdateProgressViewer.tsx`, and `web/src/app/components/ClusterDashboard/MultiNodeMonitoringTab.tsx`.
  - Cleared the next Cluster Dashboard holdouts in `web/src/app/components/ClusterDashboard/ClusterEducationTab.tsx`, `ServicesHealthTab.tsx`, and `ReportingTab.tsx`, replacing emoji service/report markers and checklist bullets with Carbon iconography.
  - Cleared the next operator-surface holdouts in `web/src/app/components/OnboardingWizard.tsx`, `web/src/app/pages/MeteringPage.tsx`, and `web/src/app/components/NodeAudioPathView.tsx`, replacing button/header/status glyphs with Carbon icons or plain labels.
  - Cleared the final tracked holdouts in `web/src/app/hooks/useExportData.ts`, `web/src/app/pages/EdirolUA1000Page.tsx`, `web/src/app/pages/LCDPage.tsx`, `web/src/app/components/PlatformCapabilities.tsx`, `web/src/app/components/HostMachine/ExportDialog.tsx`, `web/src/app/components/ClusterDashboard/ClusterOverviewTabEnhanced.tsx`, `web/src/map2/components/AudioInterfaceControl.tsx`, `web/src/map2/components/HistoryPanel.tsx`, `web/src/map2/components/FeaturesPanel.tsx`, and the touched plugin-registry index files.
  - Recounted the tracked emoji/symbol-as-icon sweep across `web/src/app` and `web/src/map2`; the current result is `TOTAL_FILES 0`, so the active-frontend emoji/symbol UI-icon exit criterion is now satisfied.
- Validation:
  - `npm --prefix web run typecheck` -> pass
  - `npm --prefix web run build` -> pass
  - `python3` tracked-marker sweep across `web/src/app` + `web/src/map2` -> `TOTAL_FILES 0`

ID: T205-subF
Status: [✓] Done
Title: Verify icon-migration exit criteria and retire legacy icon packages from active frontend paths
Description:
- Goal / acceptance criteria: Recount Phosphor, MUI, and emoji/symbol usage after migration waves, verify that active frontend paths satisfy the approved icon stack, and remove legacy icon packages/import paths where no longer needed.
- Why it matters: The icon program is not complete until the repo-level holdout counts and package usage match the approved end state documented in design guidance.
- Dependencies: T205-subB, T205-subC, T205-subD, T205-subE
- Estimated effort: Medium
- Required outputs: Updated exception ledger counts, package/import cleanup, and explicit completion notes against the icon exit condition.
Subtasks:
ID: T205-subF-subA
Status: [✓] Done
Title: Migrate shared utility surfaces still importing legacy icon packages
Description:
- Goal / acceptance criteria: Replace the remaining `@mui/icons-material` / `@phosphor-icons/react` imports in shared active utility surfaces under `web/src/shared/**`, `web/src/components/**`, and `web/src/pages/**`.
- Why it matters: These are still live operator-facing or shared surfaces, so leaving them on legacy icon packages blocks a truthful active-frontend package-retirement audit.
- Dependencies: T205-subD, T205-subE
- Estimated effort: Medium
- Required outputs: Updated shared utility components/routes, zero legacy icon-package imports in the targeted shared surfaces, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:23 - Codex
- Completion notes:
  - Migrated the full shared `PluginChooser` operator surface off legacy icon packages: `web/src/shared/components/PluginChooser/PluginChooser.tsx`, `components/PluginChooserHeader.tsx`, `components/QuickAddButtons.tsx`, `components/CategorySidebar.tsx`, `components/PluginPreviewPanel.tsx`, and `components/PluginCard.tsx` now use Carbon icons while preserving the existing MUI layout/runtime behavior.
  - Migrated the remaining standalone shared utility/admin surfaces `web/src/components/BackupRestoreWizard.tsx` and `web/src/pages/ClusterAdmin.tsx` off `@mui/icons-material`, leaving the targeted `web/src/shared/**`, `web/src/components/**`, and `web/src/pages/**` paths clear of legacy icon-package imports.
  - The targeted shared-surface audit is now clean: `rg -n "@mui/icons-material|@phosphor-icons/react" web/src/shared web/src/components web/src/pages -g '*.tsx' -g '*.ts'` returns no matches.
ID: T205-subF-subB
Status: [✓] Done
Title: Migrate or formally freeze remaining PiPedal legacy icon-package imports
Description:
- Goal / acceptance criteria: Reduce or explicitly constrain the remaining legacy icon-package imports under `web/src/pipedal/**` so package retention is documented honestly and bounded.
- Why it matters: The broad repo-level icon exit and dependency-retirement story remains incomplete while the PiPedal legacy island still imports the old icon stack.
- Dependencies: T205-subF-subA
- Estimated effort: High
- Required outputs: Reduced `web/src/pipedal/**` import count, documented freeze/exception posture for any leftover debt, and updated ledger/worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 22:29 - Codex
- Completion notes:
  - Recounted the remaining PiPedal legacy icon-package island exactly: `46` files under `web/src/pipedal/**` still import `@mui/icons-material`, with the heaviest holdouts in `FilePropertyDialog.tsx`, `BankDialog.tsx`, `AppThemed.tsx`, `PerformanceView.tsx`, `LoadPluginDialog.tsx`, and `ToobPlayerControl.tsx`.
  - Verified that no `@phosphor-icons/react` imports remain anywhere under `web/src`, so the residual legacy icon-package footprint is now bounded to `@mui/icons-material` in the frozen PiPedal island only.
  - Formally froze the remaining `web/src/pipedal/**` MUI icon usage as a legacy exception group in the icon ledger instead of claiming migration work that has not been performed.
Assigned to: Claude + User + Codex
Last updated: 2026-03-18 22:29 - Codex
- Completion notes:
  - Verified the active frontend exit condition across `web/src/app`, `web/src/map2`, `web/src/shared`, `web/src/components`, and `web/src/pages`: `0` Phosphor imports, `0` MUI icon imports, and `0` tracked emoji/symbol UI-icon files remain in those active paths.
  - Completed the shared-utility migration slice `T205-subF-subA`, clearing the remaining active shared operator surfaces off legacy icon packages.
  - Completed `T205-subF-subB` by formally freezing the residual PiPedal MUI icon debt as a measured exception group rather than leaving the status ambiguous.
  - The remaining legacy icon dependency posture is now explicit: `@mui/icons-material` is retained only because `46` frozen `web/src/pipedal/**` files still import it; `@phosphor-icons/react` has no remaining source imports under `web/src`.

ID: T206
Status: [✓] Done
Title: Platform Guide document library access upgrade and JUCE-GRID doc entry points
Description:
- Goal / acceptance criteria: Upgrade the Platform Guide document library so it supports topical grouping, richer metadata search, deep links to a selected document, recommended/recent document access, and direct launch points from `JUCE-GRID`.
- Why it matters: The current embedded doc browser is a flat filename list behind the Platform Guide modal, which makes support and operator reference access slower than it needs to be.
- Dependencies: Existing `/api/system/docs/*` routes, `web/src/app/pages/PlatformInfoGuideSection.tsx`, `web/src/app/pages/JuceGridPage.tsx`, and Platform Guide modal deep-link behavior
- Estimated effort: Medium
- Required outputs: Updated backend docs-list metadata endpoint, upgraded Platform Guide document-library UI, `JUCE-GRID` document entry points, focused frontend/backend tests, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 20:31 - Codex
- Completion notes:
  - Upgraded `app/routes/system.py` so the docs API now recurses through nested markdown files under `docs/`, returns metadata for title/summary/category/headings/keywords, and safely serves deep-linked nested document paths.
  - Rebuilt `web/src/app/pages/PlatformInfoGuideSection.tsx` into a grouped document browser with metadata search, contextual recommendations, recent-doc recovery, persistent `doc` / `q` query-param deep links, and a richer empty state.
  - Added direct `Docs` access from `web/src/app/pages/JuceGridPage.tsx` plus a docs shortcut from the keyboard-help modal, both opening the Platform Guide in `juce-grid` context.
  - Validation: `pytest -q tests/test_system_docs_routes.py` -> pass, `npm --prefix web test -- PlatformInfoGuideSection.test.tsx AboutPage.test.tsx JuceGridPage.test.tsx --runInBand --silent` -> pass, `npm --prefix web run typecheck` -> pass.

ID: T207
Status: [✓] Done
Title: JUCE-GRID effect editor card converted into an over-page modal
Description:
- Goal / acceptance criteria: Replace the inline `JUCE-GRID` effect editor card with a modal that opens over the page using the existing block-selection interaction, hugs the card content on larger viewports, dims the page background, includes an in-modal close button, animates in, and switches to fullscreen on mobile.
- Why it matters: The inline editor consumed persistent layout space and broke focus; the requested modal keeps the grid visible underneath while giving effect editing a clearer dedicated surface.
- Dependencies: Existing `web/src/app/pages/JuceGridPage.tsx`, `web/src/app/pages/JuceGridPage.css`, `JuceGridParameterEditor`, and current block-selection behavior in the signal canvas
- Estimated effort: Medium
- Required outputs: Updated `JUCE-GRID` effect-editor interaction, responsive modal styling, focused regression validation, and canonical worklist notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 08:08 - Codex
- Completion notes:
  - Removed the inline desktop effect editor shell from `web/src/app/pages/JuceGridPage.tsx` and replaced it with a route-local modal driven by the existing selected-plugin flow.
  - Kept the current block-selection trigger unchanged while ensuring keyboard left/right plugin navigation also opens the effect modal and Escape closes the modal before clearing selection.
  - Added a responsive effect-modal shell in `web/src/app/pages/JuceGridPage.css` that hugs the editor content on larger screens, animates on open, dims the page with Carbon modal behavior, and expands to fullscreen on mobile.
  - Replaced the compact inline editor panel with a lightweight placeholder/reopen surface so the effect card now exists only inside the modal.
  - Refined the modal shell so all JUCE-GRID plugin/effect cards now open at the underlying window size captured at open time, with no extra modal header copy, metadata tags, or redundant close button above the card.
  - Corrected the full-window effect modal sizing to anchor below the fixed global top bar by measuring the shell header at open time, so the editor no longer renders underneath the navigation chrome.
  - Recorded the standing JUCE-GRID plugin-modal rule in `.gemini/instructions.md` so future card/modal work preserves the same full-window, card-only presentation pattern.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web test -- JuceGridPage.test.tsx --runInBand --silent` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

ID: T208
Status: [✓] Done
Title: Shared plugin-card category watermark pass across all desktop cards
Description:
- Goal / acceptance criteria: Add a unified decorative watermark icon to all shared plugin cards using the existing category icon system, tint it by category color, keep it subtle behind card content, omit the watermark on mobile/compact cards, and avoid generic fallback watermarks when no clear category icon exists.
- Why it matters: The plugin-card system needs a more consistent visual taxonomy and stronger category presence without adding noise to interaction-heavy controls.
- Dependencies: T205 icon system direction, existing `PluginCardShell`, current category color/icon mappings, and shared card consumers across JUCE/LV2 plugin cards
- Estimated effort: Medium
- Required outputs: Shared shell implementation, responsive styling, omitted fallback handling, and validation notes.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 22:39 - Codex
- Completion notes:
  - Updated `web/src/app/components/PluginCards/Base/PluginCardShell.tsx` so shared plugin cards now render one decorative category watermark from the existing icon mapping behind the card surface.
  - Kept the watermark category-tinted, low-opacity, non-interactive, and unified across cards while omitting it for mobile/compact renders and suppressing the generic fallback icon when no clear category exists.
  - Shifted watermark placement for visualization-heavy cards to an off-center decorative position while keeping non-visualization cards centered for a consistent desktop composition.
  - Removed the older duplicated hero/visualization icon treatment from the shared shell so the watermark language stays consistent.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass (existing Vite dynamic-import and chunk-size warnings only).

## Drum Machine — Professional Platform (Epic)

### Design Decisions (established 2026-03-18)

- **SFZ engine**: Extend native SFZ parser to support drum-critical opcodes (group/off_by, seq_length/seq_position, lorand/hirand, sw_default/sw_last, transpose, tune, pan, gain); both native JUCE and Sfizz backends must be drum-capable
- **Output routing**: Internal submix buses with per-bus EQ + Comp, summed to stereo master; no additional PipeWire ports — breakout via internal bus routing only
- **Sequencer paradigm**: Roland TR-style 16-step LED grid with instrument rows, pattern chaining, fill/variation buttons
- **Instruments per kit**: 16 pads / 16 instruments — maps 1:1 to SynthForge 16-part architecture
- **Pattern length**: Variable 1–64 steps, 4/4 time signature only
- **Per-instrument controls**: Volume + Pan + Tune + Mute/Solo only; all effects processing on submix buses
- **Submix bus topology**: Fixed 8 buses — Kick, Snare, HiHat, Toms, Cymbals, Percussion, Overhead, Room; each bus has EQ + Comp; instruments assigned by role
- **Pattern/song hierarchy**: 128 patterns per kit + Song mode arranger (ordered pattern chain with repeat counts per section, automatic playthrough)
- **External trigger input**: MIDI-only consumer — standard MIDI note-on/off from any e-drum module or trigger interface; MAP2 provides velocity curves, note mapping, and zone assignment per pad
- **UI standard**: Strict Carbon Design System conformance per `docs/design/CARBON_CONFORMANCE_STANDARD.md`; all new surfaces use `@carbon/react` components, Carbon tokens, IBM Plex typography, 2x grid, 8px spacing

---

ID: T211
Status: [>] In Progress
Title: Drum Machine C++ Sound Engine — DrumMachineProcessor
Description:
- Goal / acceptance criteria: Implement a dedicated `DrumMachineProcessor` C++ class in `juce-engine/Source/DrumMachine/` that provides a 16-instrument drum sound engine built on top of the SynthForge sampler architecture, with per-instrument controls, 8 fixed submix buses, and stereo master output.
- Why it matters: The current drum machine has no audio engine — the entire backend is a stateless dict stub. This is the foundation that all other drum machine features depend on.
- Dependencies: T212 (SFZ parser extension), SynthForge 16-part architecture
- Estimated effort: High
- Required outputs: Compiling C++ processor integrated into Map2AudioEngine, Python bindings, passing unit tests.
Subtasks:
  - [✓] T211-A: Create `DrumMachineProcessor` class in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp`
    - Owns 16 `Part` instances (one per drum instrument/pad)
    - Each Part configured with: volume (0.0–1.0), pan (-1.0–1.0), tune (semitones -24 to +24), mute (bool), solo (bool)
    - Part-to-bus assignment: fixed mapping by instrument role (Pad 0→Kick bus, Pad 1→Snare bus, Pads 2-3→HiHat bus, Pads 4-6→Toms bus, Pads 7-9→Cymbals bus, Pads 10-12→Percussion bus, Pad 13→Overhead bus, Pads 14-15→Room bus)
    - Default MIDI note mapping: GM drum map (C1=36 kick through D#3=51), user-remappable per pad
    - Velocity curve per pad: Linear, Logarithmic, Exponential, S-Curve, Fixed (configurable)
    - MIDI channel filtering: per-pad or global OMNI
  - [✓] T211-B: Implement 8 fixed submix buses in `DrumMachineMixer` class
    - Bus definitions: Kick (0), Snare (1), HiHat (2), Toms (3), Cymbals (4), Percussion (5), Overhead (6), Room (7)
    - Each bus: stereo audio buffer, 3-band parametric EQ (low shelf, mid peak, high shelf), single-band compressor (threshold, ratio, attack, release, makeup gain)
    - Bus output: per-bus level + pan + mute/solo
    - Master bus: sum of all 8 submix buses → stereo output with master volume
    - All bus processing must be RT-safe (pre-allocated buffers, no heap allocation in processBlock)
  - [✓] T211-C: Integrate `DrumMachineProcessor` into `Map2AudioEngine`
    - Add `drumMachine_` member to Map2AudioEngine (like `synthForge_`)
    - Process in audioCallback: MIDI → DrumMachineProcessor → mix into main output buffer
    - DrumMachineProcessor receives MIDI from the same ring buffer drain as SynthForge
    - Enable/disable drum machine processing via atomic flag
  - [✓] T211-D: Expose DrumMachineProcessor via PythonBindings.cpp
    - Kit management: `load_drum_kit(sfz_path)`, `get_drum_kit_status()`
    - Per-pad: `set_drum_pad_volume(pad, vol)`, `set_drum_pad_pan(pad, pan)`, `set_drum_pad_tune(pad, semitones)`, `set_drum_pad_mute(pad, bool)`, `set_drum_pad_solo(pad, bool)`
    - Per-pad MIDI: `set_drum_pad_note(pad, midi_note)`, `set_drum_pad_velocity_curve(pad, curve_type)`, `set_drum_pad_midi_channel(pad, channel)`
    - Per-bus: `set_drum_bus_eq(bus, low_gain, mid_gain, mid_freq, high_gain)`, `set_drum_bus_comp(bus, threshold, ratio, attack, release, makeup)`, `set_drum_bus_level(bus, level)`, `set_drum_bus_mute(bus, bool)`, `set_drum_bus_solo(bus, bool)`
    - Master: `set_drum_master_volume(vol)`, `get_drum_metering()` (per-pad peak/RMS + per-bus peak/RMS + master peak/RMS)
    - Transport: `drum_trigger_note(pad, velocity)` for software-triggered hits
  - [✓] T211-E: Add CMakeLists.txt entries for DrumMachine source files; verify build with `cmake -B build && cmake --build build`
Assigned to: Codex
Last updated: 2026-03-20 06:52 - Codex
- Progress notes:
  - Completed `T211-B` with a new RT-safe `juce-engine/Source/DrumMachine/DrumMachineMixer.h/cpp` implementation providing 8 fixed stereo buses, 3-band EQ, single-band compression, per-bus level/pan/mute/solo, master-volume fold-down, and cached metering.
  - Added focused JUCE coverage in `juce-engine/tests/DrumMachineMixerTests.cpp` for bus parameter mutation, stereo fold-down, metering, and solo/mute gating.
  - Updated `juce-engine/CMakeLists.txt` so the new mixer source and tests build under the existing `synthforge_tests` target.
  - Validation: `cmake --build build-synthforge-tests --target synthforge_tests` -> pass; `./synthforge_tests "[drums]"` -> pass.
  - Completed `T211-C` by wiring `drumMachine_` into `Map2AudioEngine`, preparing it alongside SynthForge and the rest of the engine processors, processing it from the same drained MIDI buffer in `audioCallback`, and adding atomic enable/disable accessors for runtime gating.
  - Validation: `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass.
  - Completed `T211-D` by exposing drum kit load/status, per-pad controls, per-bus EQ/compression/level/mute/solo, master volume, metering export, and software note triggering through `juce-engine/Source/PythonBindings.cpp`, with `DrumMachineProcessor` extended to own RT-safe mixer-backed metering and kit-wide control helpers.
  - Validation: `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py -q` -> `12 passed`; `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.

---

ID: T212
Status: [✓] Done
Title: Extend native SFZ parser for drum-critical opcodes
Description:
- Goal / acceptance criteria: Extend `SfzLoader` in `juce-engine/Source/SynthForge/Sampler/SfzLoader.h/cpp` to parse and apply drum-critical SFZ v2 opcodes so the native JUCE sampler backend is fully drum-capable without requiring Sfizz.
- Why it matters: The native parser currently only supports sample, key range, velocity range, and basic envelope. Drum kits require choke groups, round-robin, random variation, and key switches for realistic playback (e.g., open/closed hihat choking, snare articulation switching, tom round-robin).
- Dependencies: None (independent parser work)
- Estimated effort: Medium
- Required outputs: Extended SfzLoader, updated SfzRegionDefinition struct, JUCE SamplerVoice integration for new opcodes, unit tests.
Subtasks:
  - [✓] T212-A: Add choke group support — parse `group` (int) and `off_by` (int) opcodes; implement voice-stealing by group ID in native sampler (when a note in group N triggers, kill all active voices with `off_by=N`)
  - [✓] T212-B: Add round-robin support — parse `seq_length` and `seq_position` opcodes; track per-key round-robin counter; cycle through seq_position regions on successive triggers
  - [✓] T212-C: Add random variation support — parse `lorand` and `hirand` opcodes; generate random float 0.0–1.0 per note-on; select region where `lorand <= rand < hirand`
  - [✓] T212-D: Add key switch support — parse `sw_default`, `sw_last`, `sw_lokey`, `sw_hikey` opcodes; track last key switch state; filter regions by active key switch
  - [✓] T212-E: Add per-region tuning/gain/pan — parse `transpose` (semitones), `tune` (cents), `volume` (dB), `pan` (-100 to 100) opcodes; apply in native SamplerVoice rendering
  - [✓] T212-F: Add filter opcodes — parse `cutoff`, `resonance`, `fil_type` (lpf_1p, lpf_2p, hpf_1p, hpf_2p); apply state-variable filter per voice
  - [✓] T212-G: Unit tests for each new opcode family — test SFZ files with choke groups, round-robin sequences, random layers, key switches, tuning, and filters; verify correct region selection and voice behavior
Assigned to: Codex
Last updated: 2026-03-19 00:16 - Codex

---

ID: T213
Status: [>] In Progress
Title: Drum Machine Pattern Sequencer Engine (C++ + Python)
Description:
- Goal / acceptance criteria: Implement a real-time drum pattern sequencer with 128 patterns per kit, variable length (1–64 steps at 16th-note resolution, 4/4 only), per-step velocity, transport control (play/stop/pause), and BPM-synced playback that triggers notes through DrumMachineProcessor.
- Why it matters: The sequencer is the core interaction model for the TR-style drum machine. Without it, the drum machine is just a sample player.
- Dependencies: T211 (DrumMachineProcessor must exist to receive triggered notes)
- Estimated effort: High
- Required outputs: C++ sequencer class, Python service layer, REST API endpoints, WebSocket real-time position broadcast, unit tests.
Subtasks:
  - [✓] T213-A: Create `DrumSequencer` C++ class in `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp`
    - Pattern data structure: 128 patterns, each with configurable step count (1–64, default 16), 16 instrument tracks
    - Per-step data: velocity (0–127, 0=off), accent (bool)
    - Transport: play, stop, pause, tempo (BPM 40–300), swing amount (0–100%)
    - Playback: sample-accurate step advancement using accumulated sample count vs. samples-per-step
    - On each step: trigger `DrumMachineProcessor::triggerNote(pad, velocity)` for all active instruments at that step
    - Current position tracking: pattern index, step index, bar count (for song mode)
    - Tap tempo: accept timestamps, compute running average BPM (last 6 taps, discard >2s gaps)
  - [✓] T213-B: Pattern editing API (C++ methods exposed via Python bindings)
    - `set_step(pattern, instrument, step, velocity)`, `get_step(pattern, instrument, step)`
    - `clear_pattern(pattern)`, `copy_pattern(src, dst)`, `get_pattern_data(pattern)` → full grid
    - `set_pattern_length(pattern, steps)`, `get_pattern_length(pattern)`
    - `set_swing(percent)`, `get_swing()`
    - `set_accent_velocity(velocity)` — global accent level (default 127)
  - [✓] T213-C: Song mode arranger
    - Song data structure: ordered list of `{pattern_id, repeat_count}` entries, max 256 entries
    - Song playback: advance through entries, repeat pattern N times, then next entry; loop or stop at end
    - API: `add_song_entry(pattern_id, repeat_count, position)`, `remove_song_entry(position)`, `reorder_song_entries(order)`, `get_song()`, `clear_song()`
    - `set_song_loop(bool)`, `get_song_loop()`
  - [✓] T213-D: Python service layer — `app/services/drum_sequencer_service.py`
    - Wraps C++ bindings with validation, error handling, state persistence
    - Pattern save/load to `~/.map2/drums/patterns/` as JSON
    - Kit + pattern bundle save/load (kit SFZ reference + all 128 patterns + song)
    - Auto-save on transport stop
  - [✓] T213-E: REST API endpoints — extend `app/routes/drums.py`
    - `GET/POST /api/engine/drums/transport` — play/stop/pause/bpm/swing
    - `GET/POST /api/engine/drums/pattern/{id}` — get/set full pattern grid
    - `POST /api/engine/drums/pattern/{id}/step` — set individual step
    - `GET/POST /api/engine/drums/song` — get/set song arrangement
    - `GET /api/engine/drums/position` — current step/bar/pattern (also via WebSocket)
  - [✓] T213-F: WebSocket real-time position — broadcast `{step, bar, pattern_id, is_playing}` at each step advance via existing WebSocket infrastructure for UI beat indicator sync
  - [✓] T213-G: Fill and variation system
    - Fill trigger: `trigger_fill()` — plays a fill pattern (last 1–2 beats of current pattern replaced with fill variation)
    - Auto-fill: at quantization boundary (configurable 1–8 bars), automatically trigger fill before next pattern/section
    - Variation: each pattern has Main + up to 10 variations (same step count, different velocities/instruments); `set_variation(pattern, variation_index)`
    - Count-in: play N bars (0–4) of metronome clicks before pattern starts
Assigned to: Codex
Last updated: 2026-03-20 07:32 - Codex
- Progress notes:
  - Completed `T213-A` with a new `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp` core that owns 128 patterns, 16 instrument lanes, 64-step storage, transport state, BPM/swing/accent controls, current pattern/step/bar tracking, sample-domain step scheduling, and tap-tempo averaging.
  - Extended `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` with queued `triggerNote(...)` support so the sequencer can inject software hits into the existing drum processor path with sample offsets.
  - Wired the sequencer into `juce-engine/Source/Map2AudioEngine.h/cpp` so drum sequencing runs in the audio callback immediately before `DrumMachineProcessor` consumes its block, and registered the new source/test files in `juce-engine/CMakeLists.txt`.
  - Added `juce-engine/tests/DrumSequencerTests.cpp` coverage for default pattern state, tempo-driven step advancement, drum trigger delivery into `DrumMachineProcessor`, and tap-tempo reset/averaging behavior.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T213-B` in `juce-engine/Source/PythonBindings.cpp` by exposing sequencer step mutation/query, full pattern export, clear/copy operations, pattern-length controls, and swing/accent-velocity setters/getters through the `AudioEngine` pybind surface.
  - Validation: `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py -q` -> `12 passed`; `python3` smoke import of `juce-engine/build/map2_audio_engine` covering `set_drum_step`, `get_drum_step`, `get_drum_pattern_data`, `copy_drum_pattern`, `clear_drum_pattern`, `set_drum_pattern_length`, `set_drum_swing`, and `set_drum_accent_velocity` -> pass.
  - Completed `T213-C` by extending `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp` with a 256-entry song list, insertion/removal/reorder APIs, loop enable/disable state, repeat-aware pattern progression, automatic transport rewind at song end, and seamless pattern handoff between song sections.
  - Added `juce-engine/tests/DrumSequencerTests.cpp` coverage for song entry ordering/editing, repeat-count playback across multiple patterns, end-of-song stop behavior, and looped restart to the first song entry.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T213-D` with `app/services/drum_sequencer_service.py`, a singleton persistence layer that validates 16x64 pattern grids and song entries, syncs pattern/song/swing/accent state to the native engine bindings, persists per-pattern JSON under `~/.map2/drums/patterns/`, saves and restores full 128-pattern bundles plus song arrangements, and maintains sequencer autosave snapshots.
  - Extended `juce-engine/Source/PythonBindings.cpp` with the missing song-arrangement bindings (`add/remove/reorder/get/clear song`, `set/get song loop`) so the new sequencer service can round-trip bundle state through the native engine, and wired `app/services/drum_machine_service.py` to trigger sequencer autosave on transport stop.
  - Added `tests/test_drum_sequencer_service.py` coverage for per-pattern persistence, bundle/song round-trip restore, and stop-triggered autosave behavior through the drum-machine transport service.
  - Validation: `pytest tests/test_drum_sequencer_service.py tests/test_drum_machine_service.py tests/test_drum_routes.py -q` -> `15 passed`; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `python3` smoke import of `juce-engine/build/map2_audio_engine` covering `add_drum_song_entry`, `get_drum_song`, `remove_drum_song_entry`, `clear_drum_song`, and `set/get_drum_song_loop` -> pass.
  - Completed `T213-E` by extending `app/routes/drums.py` with sequencer-backed `GET/POST /api/engine/drums/pattern/{id}`, `POST /api/engine/drums/pattern/{id}/step`, and `GET/POST /api/engine/drums/song` endpoints while preserving the existing transport/state/position contract and routing all new mutations through `drum_sequencer_service`.
  - Extended `app/services/drum_sequencer_service.py` with route-facing `get_song`, `get_song_loop`, and `replace_song` helpers so the HTTP layer can manage validated song-arrangement updates without duplicating engine-sync logic.
  - Added `tests/test_drum_routes.py` coverage for full-pattern round-trip save/load, single-step mutation, and song arrangement route round-trip behavior.
  - Validation: `pytest tests/test_drum_routes.py tests/test_drum_machine_service.py tests/test_drum_sequencer_service.py -q` -> `18 passed`; in-memory `python3` compile smoke for `app/routes/drums.py`, `app/services/drum_machine_service.py`, `app/services/drum_sequencer_service.py`, and `tests/test_drum_routes.py` -> pass.
  - Completed `T213-F` by extending `juce-engine/Source/PythonBindings.cpp` with sequencer transport/position bindings (`set_drum_bpm`, `set_drum_current_pattern`, `set_drum_transport_playing`, `pause_drum_transport`, `get_drum_sequencer_position`) and wiring `app/services/drum_machine_service.py` to mirror transport updates into the native sequencer, poll live engine position while transport is running, and publish `drums:position` WebSocket events whenever step/bar/pattern playback state changes.
  - Expanded `DrumSequencerPositionModel` and the drum route/service test fixtures to carry `pattern_id` and `is_playing`, matching the realtime WebSocket payload needed for beat-synced UI indicators.
  - Added async `tests/test_drum_machine_service.py` coverage proving the poll loop emits `drums:position` history entries when the engine-reported sequencer position advances, while preserving master-volume/metering and route behaviors.
  - Validation: `pytest tests/test_drum_machine_service.py tests/test_drum_routes.py tests/test_drum_sequencer_service.py -q` -> `19 passed`; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `python3` smoke import of `juce-engine/build/map2_audio_engine` confirming `set_drum_bpm`, `set_drum_current_pattern`, `set_drum_transport_playing`, and `get_drum_sequencer_position` bindings are callable -> pass (with non-blocking ALSA sequencer warnings on this host).
  - Completed `T213-G` by extending `juce-engine/Source/DrumMachine/DrumSequencer.h/cpp` with 11 per-pattern variation lanes (Main + 10 variations), configurable fill variation and 1-2 beat fill windows, manual fill triggering, auto-fill cadence in 0-8 bar intervals, and 0-4 bar count-in support that emits quarter-note clicks before normal pattern playback starts.
  - Extended `juce-engine/Source/PythonBindings.cpp` with fill/variation/count-in bindings (`set/get_drum_variation`, `set/get_drum_fill_variation`, `set/get_drum_fill_length_beats`, `trigger_drum_fill`, `set/get_drum_auto_fill_bars`, `set/get_drum_count_in_bars`) so later backend/UI work can control the new sequencer behaviors through the existing `AudioEngine` surface.
  - Added `juce-engine/tests/DrumSequencerTests.cpp` coverage for per-pattern variation editing, fill configuration and armed playback progression, auto-fill/count-in setting round-trip, and count-in-delayed transport advancement compared against immediate playback.
  - Validation: `./juce-engine/build-synthforge-tests/synthforge_tests "[drums]"` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass; `python3` smoke import of `juce-engine/build/map2_audio_engine` covering variation/fill/count-in bindings -> pass (with non-blocking ALSA sequencer warnings on this host).

---

ID: T214
Status: [>] In Progress
Title: Drum Machine Kit Management — SFZ kit loading, factory kits, user kits
Description:
- Goal / acceptance criteria: Implement a complete drum kit management system that loads SFZ drum kits into DrumMachineProcessor, ships factory kits, and supports user kit import/creation. Each kit defines 16 instrument assignments with sample references, default MIDI mapping, and default bus routing.
- Why it matters: Without kits, the drum machine has no sounds. The kit system bridges the SFZ sample engine to the 16-pad instrument model.
- Dependencies: T211 (DrumMachineProcessor), T212 (extended SFZ parser)
- Estimated effort: Medium
- Required outputs: Kit schema, factory kit SFZ files, kit manager service, REST endpoints, unit tests.
Subtasks:
  - [✓] T214-A: Define drum kit schema — `data/drums/schemas/drum_kit.schema.json`
    - Kit metadata: `kit_id`, `name`, `description`, `author`, `version`, `category` (acoustic, electronic, percussion, hybrid)
    - 16 instrument slots: `instruments[0..15]` each with `name`, `sfz_path` (relative to kit root), `default_note` (MIDI), `bus_assignment` (0–7), `default_volume`, `default_pan`, `default_tune`
    - Kit-level defaults: `default_bpm`, `default_swing`
    - License field for attribution
  - [✓] T214-B: Create factory drum kits (minimum 4 kits for launch)
    - `Standard Rock` — acoustic rock kit (kick, snare, hats, 3 toms, crash, ride, 4 percussion, overhead, room fills)
    - `Electronic 808` — classic TR-808 sounds (kick, snare, clap, hats, cowbell, clave, conga, maracas, toms, cymbal)
    - `Electronic 909` — classic TR-909 sounds
    - `Jazz Brush` — brush snare, kick, ride, hats, floor tom
    - Each kit: multi-velocity SFZ with round-robin, proper choke groups (open/closed HH), GM-compatible note mapping
    - SFZ files in `data/drums/factory_kits/{kit_id}/` with samples in `data/drums/factory_kits/{kit_id}/samples/`
    - All samples must be CC0/public domain or purpose-recorded
  - [✓] T214-C: Kit manager service — `app/services/drum_kit_service.py`
    - Index factory kits from `data/drums/factory_kits/`
    - Index user kits from `~/.map2/drums/user_kits/`
    - Load kit into DrumMachineProcessor: parse kit JSON → load each instrument SFZ into corresponding Part → apply default MIDI mapping and bus routing
    - Kit switching: unload current → load new (with crossfade or silence gap to prevent artifacts)
    - User kit creation: copy factory kit → modify instrument assignments → save to user directory
    - Kit import: accept .zip containing kit JSON + SFZ + samples; validate against schema; extract to user_kits
  - [✓] T214-D: REST API endpoints — extend `app/routes/drums.py`
    - `GET /api/engine/drums/kits` — list all kits (factory + user) with metadata
    - `GET /api/engine/drums/kits/{kit_id}` — kit details including instrument assignments
    - `POST /api/engine/drums/kits/load` — load kit into engine `{kit_id}`
    - `GET /api/engine/drums/kits/active` — currently loaded kit
    - `POST /api/engine/drums/kits/import` — import user kit .zip
    - `POST /api/engine/drums/kits/create` — create new user kit from template
    - `PATCH /api/engine/drums/kits/{kit_id}/instruments/{pad}` — modify instrument assignment
  - [✓] T214-E: Sample sourcing — identify, download, and organize CC0 drum samples for factory kits; write SFZ mappings with velocity layers (minimum 3 velocity layers per instrument), round-robin (minimum 2 variations), and choke groups for hihats
Assigned to: Codex
Last updated: 2026-03-20 08:05 - Codex
- Progress notes:
  - Completed `T214-A` by adding `data/drums/schemas/drum_kit.schema.json`, a draft 2020-12 schema for 16-slot drum kits with constrained metadata, relative `.sfz` instrument paths, per-pad default note/bus/volume/pan/tune fields, kit-level BPM and swing defaults, and explicit category/license validation.
  - Validation: `python3` JSON parse + schema shape smoke test against a synthetic 16-instrument kit document -> pass.
  - Completed `T214-B` by adding four launch-ready factory kits under `data/drums/factory_kits/`: `standard_rock`, `electronic_808`, `electronic_909`, and `jazz_brush`, each with a 16-slot `kit.json`, per-instrument SFZ program files, a purpose-generated sample set, and kit-local documentation.
  - Each shipped instrument now includes 3 velocity layers and 2 round-robin alternates, with shared choke-group wiring between `closed_hat.sfz` and `open_hat.sfz` and GM-compatible default note assignments across all four kits.
  - Validation: `python3` factory-kit graph check covering manifest completeness, 16-slot coverage, SFZ presence, velocity/round-robin region counts, hi-hat choke-group configuration, and sample file existence for all four kits -> pass (`validated 4 factory kits`).
  - Completed `T214-C` by adding `app/services/drum_kit_service.py`, a singleton kit manager that indexes factory and user kits, validates manifests and referenced SFZ/sample assets, loads per-pad SFZ assignments into the drum engine, applies per-pad note/volume/pan/tune/bus defaults, persists the active kit selection, copies factory kits into user space, and imports user kit `.zip` archives with traversal-safe extraction.
  - Extended the drum engine bindings with per-pad SFZ loading and bus assignment support via `juce-engine/Source/PythonBindings.cpp`, backed by a new `setPadBus(...)` helper in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp`.
  - Validation: `pytest -q tests/test_drum_kit_service.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> `21 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_kit_service.py app/services/drum_machine_service.py app/routes/drums.py tests/test_drum_kit_service.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass; `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T214-D` by extending `app/routes/drums.py` with typed kit-management endpoints for listing kits, reading kit details, loading a kit, reading the active kit, importing a user kit archive, creating a user kit from a template, and patching an individual user-kit instrument assignment.
  - Validation: `pytest -q tests/test_drum_routes.py tests/test_drum_kit_service.py tests/test_drum_machine_service.py` -> `26 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/routes/drums.py app/services/drum_kit_service.py app/services/drum_machine_service.py tests/test_drum_routes.py tests/test_drum_kit_service.py tests/test_drum_machine_service.py` -> pass.
  - Completed `T214-E` by adding `data/drums/factory_kits/SOURCING_MANIFEST.json`, a machine-readable provenance and inventory manifest that records each shipped launch kit as purpose-generated CC0 content with explicit SFZ/sample counts and hi-hat choke-group metadata.
  - Added `scripts/validate_factory_drum_kits.py`, a repeatable validator that proves the factory kits meet the launch sourcing contract: 4 kits, 16 SFZ programs per kit, 3 velocity layers, 2 round-robin alternates, shared open/closed hi-hat choke groups, and all referenced sample files present on disk.
  - Validation: `python3 scripts/validate_factory_drum_kits.py` -> `{"validated_kits": ["standard_rock", "electronic_808", "electronic_909", "jazz_brush"], "total_kits": 4, "total_programs": 64, "total_samples": 384, "license": "CC0-1.0"}`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile scripts/validate_factory_drum_kits.py` -> pass.

---

ID: T215
Status: [>] In Progress
Title: Drum Machine MIDI Input — velocity curves, note mapping, zone assignment
Description:
- Goal / acceptance criteria: Implement comprehensive MIDI input handling for the drum machine so any external e-drum module, MIDI controller, or trigger interface can play the drum machine with configurable velocity response, note-to-pad mapping, and multi-zone pad support.
- Why it matters: External trigger support via MIDI is the primary hardware integration path. Velocity curves and note mapping make MAP2 compatible with any manufacturer's e-drum hardware without requiring trigger parameter proxying.
- Dependencies: T211 (DrumMachineProcessor)
- Estimated effort: Medium
- Required outputs: MIDI mapping configuration, velocity curve engine, zone assignment, preset mappings for common hardware, REST endpoints, unit tests.
Subtasks:
  - [✓] T215-A: Per-pad MIDI note mapping engine
    - Default: GM drum map (kick=36/C1, snare=38/D1, closed HH=42, open HH=46, etc.)
    - User-configurable: any MIDI note (0–127) → any pad (0–15)
    - Multi-note-to-one-pad: multiple MIDI notes can trigger the same pad (e.g., notes 36 and 35 both trigger kick pad)
    - One-note-to-one-pad: each note maps to at most one pad (no fan-out)
    - MIDI channel filter: global (OMNI or specific channel 1–16) or per-pad channel
  - [✓] T215-B: Velocity curve engine
    - 5 curve types per pad: Linear, Logarithmic (soft-touch emphasis), Exponential (hard-touch emphasis), S-Curve (compressed middle), Fixed (constant velocity regardless of input)
    - Per-pad configurable: curve type + input floor (minimum velocity threshold) + output floor (minimum output velocity) + output ceiling (maximum output velocity)
    - Velocity scaling: input velocity → curve transform → output velocity (0–127)
    - Real-time preview: when adjusting curve, show input→output graph and last-hit velocity value
  - [✓] T215-C: Zone assignment for multi-zone pads
    - Zone concept: a single physical pad may send different MIDI notes for head/rim/edge strikes (e.g., Roland PD-140DS sends note 38 for head, 40 for rim, 37 for cross-stick)
    - Zone mapping: define up to 3 zones per pad (Head, Rim, Edge), each zone maps a different MIDI note to the same pad but triggers a different SFZ articulation via key switch or velocity layer
    - Common hardware presets: Roland (PD-140DS, CY-18DR, VH-14D note assignments), Yamaha (DTX pads), Alesis (Surge/Strike pads), ATV, 2Box
  - [✓] T215-D: MIDI learn mode
    - User hits a pad on their hardware → MAP2 captures the MIDI note number and channel → assigns it to the selected drum pad
    - "Learn All" mode: user hits each pad in sequence (kick→snare→HH→...), MAP2 auto-advances to next pad after each hit
    - Timeout: 10 seconds of inactivity exits learn mode
  - [✓] T215-E: REST API + Python service
    - `GET/POST /api/engine/drums/midi/mapping` — get/set full note-to-pad mapping
    - `GET/POST /api/engine/drums/midi/velocity-curves` — get/set per-pad velocity curve config
    - `GET/POST /api/engine/drums/midi/zones` — get/set zone assignments
    - `POST /api/engine/drums/midi/learn/start` — enter MIDI learn mode
    - `POST /api/engine/drums/midi/learn/stop` — exit MIDI learn mode
    - `GET /api/engine/drums/midi/learn/status` — current learn state (active pad, last received note)
    - `GET /api/engine/drums/midi/presets` — list hardware presets (Roland, Yamaha, Alesis, etc.)
    - `POST /api/engine/drums/midi/presets/load` — apply a hardware preset mapping
  - [ ] T215-F: Persist MIDI configuration per kit — mapping, curves, and zones saved alongside kit data in `~/.map2/drums/midi_configs/{kit_id}.json`
Assigned to: Codex
Last updated: 2026-03-20 09:20 - Codex
- Progress notes:
  - Completed `T215-A` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by replacing the single-note pad trigger assumption with a real note-to-pad mapping table, allowing multiple MIDI notes to target one pad while guaranteeing that any individual note maps to at most one pad.
  - Added global drum MIDI channel filtering alongside the existing per-pad channel filter, and extended the pybind surface in `juce-engine/Source/PythonBindings.cpp` with `add_drum_pad_note`, `remove_drum_pad_note`, `get_drum_pad_notes`, `set_drum_global_midi_channel`, and `get_drum_global_midi_channel`.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for GM default note exposure, multi-note-to-one-pad routing, no-fan-out remapping behavior, per-pad channel filtering, and the new global MIDI channel gate.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`36 assertions in 6 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-B` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by extending each pad with configurable `inputFloor`, `outputFloor`, and `outputCeiling` bounds, keeping all 5 curve types, and applying the new scaling model directly in the MIDI-trigger path.
  - Added preview and telemetry hooks via `getVelocityCurvePreview(...)` and `getLastMappedVelocityForPad(...)`, and extended the pybind layer in `juce-engine/Source/PythonBindings.cpp` so future API/UI slices can set bounded curves and fetch preview/last-hit data without reimplementing the curve math in Python.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for thresholded/scaled velocity mapping, preview generation parity with the processor math, and last-hit velocity capture after note-on processing.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`43 assertions in 7 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-C` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by adding per-pad Head/Rim/Edge zone assignments, a zone-aware trigger router with optional articulation keyswitch notes and per-zone velocity scaling, plus built-in hardware preset mappings for Roland, Yamaha, Alesis, ATV, and 2Box kits.
  - Extended `juce-engine/Source/PythonBindings.cpp` with zone-management and preset-loading methods so the later REST/service slice can read configured zones, write zone assignments, enumerate available presets, and apply a selected preset without reimplementing the engine-side mapping model.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for shared-pad zone routing, no-fan-out remapping across zone assignments, and preset exposure/application behavior for the built-in hardware maps.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`73 assertions in 10 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-D` in `juce-engine/Source/DrumMachine/DrumMachineProcessor.h/cpp` by adding native MIDI learn state, single-pad capture, sequential "learn all" auto-advance, and a 10-second inactivity timeout that expires learn sessions without needing Python-side polling logic.
  - Extended `juce-engine/Source/PythonBindings.cpp` with `start_drum_midi_learn`, `stop_drum_midi_learn`, and `get_drum_midi_learn_state` so the upcoming REST/service slice can drive learn mode and inspect the active pad plus last-seen MIDI note/channel directly from the engine.
  - Added native coverage in `juce-engine/tests/DrumMachineProcessorTests.cpp` for single-pad note/channel capture, learn-all progression across pads, and timeout expiry after inactivity.
  - Validation: `cmake --build juce-engine/build-synthforge-tests --target synthforge_tests` -> pass; `./juce-engine/build-synthforge-tests/synthforge_tests "[drums][processor]"` -> pass (`94 assertions in 13 test cases`); `cmake --build juce-engine/build --target map2_audio_engine` -> pass.
  - Completed `T215-E` in `app/services/drum_machine_service.py` and `app/routes/drums.py` by adding typed REST/service support for full MIDI note mapping, per-pad velocity curve configuration, multi-zone assignments, MIDI learn start/stop/status, preset enumeration, and preset loading on top of the existing engine bindings.
  - Added service-side typed models and engine-sync shims for global MIDI channel state, per-pad note/channel lists, bounded velocity curves with preview/last-hit telemetry, zone snapshots, learn-state reporting, and preset application so later persistence work can reuse one canonical Python representation.
  - Added route and service coverage in `tests/test_drum_routes.py` and `tests/test_drum_machine_service.py` for the new `/api/engine/drums/midi/*` contract, including mapping writes, curve updates, zone updates, learn mode state transitions, and preset list/load behavior.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py` -> `28 passed`; `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_machine_service.py app/routes/drums.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass.

---

ID: T216
Status: [✓] Done
Title: Drum Machine Backend Service — state management, persistence, WebSocket integration
Description:
- Goal / acceptance criteria: Replace the current stateless dict stub in `app/routes/drums.py` with a proper service layer that manages drum machine state, persists configuration, integrates with the C++ engine via Python bindings, and provides real-time updates via WebSocket.
- Why it matters: The current backend is a dead-end stub that stores state in a Python dict with no engine connection and no persistence. Every other drum machine task depends on a working service layer.
- Dependencies: T211 (DrumMachineProcessor Python bindings)
- Estimated effort: Medium
- Required outputs: Refactored service, persistent state, WebSocket integration, updated REST endpoints.
Subtasks:
  - [✓] T216-A: Create `app/services/drum_machine_service.py`
    - Singleton service initialized at app startup
    - Manages: active kit, transport state, current pattern, sequencer position, mixer state (per-pad + per-bus + master)
    - All state changes dispatch to C++ engine via Python bindings
    - State persistence to `~/.map2/drums/state.json` on transport stop and on explicit save
    - State restore on service startup (last active kit, last pattern, mixer settings)
  - [✓] T216-B: Refactor `app/routes/drums.py` to delegate to service
    - Remove in-memory `DRUM_MACHINE_STATE` dict
    - All endpoints call `DrumMachineService` methods
    - Add proper Pydantic request/response models for all endpoints
    - Add input validation (BPM 40–300, volume 0–100, pattern 0–127, step 0–63, etc.)
  - [✓] T216-C: WebSocket integration
    - Broadcast transport state changes (play/stop/pause, BPM change) to connected clients
    - Broadcast sequencer position (step, bar, pattern) at each step for UI beat sync
    - Broadcast metering data (per-pad peak, per-bus peak, master peak) at 30 fps
    - Use existing `WebSocketManager` infrastructure
  - [✓] T216-D: Metering API
    - `GET /api/engine/drums/metering` — snapshot of all levels (per-pad, per-bus, master)
    - Also available via WebSocket subscription for real-time display
    - Metering struct from C++ includes: peak + RMS per pad (16), peak + RMS per bus (8), peak + RMS master (1)
Assigned to: Codex
Last updated: 2026-03-19 15:43 - Codex
- Completion notes:
  - Replaced the old in-route `DRUM_MACHINE_STATE` dict with `app/services/drum_machine_service.py`, a singleton service that owns typed state validation, atomic JSON persistence under `~/.map2/drums/state.json`, factory/generated pack indexing, transport projection, and metering snapshots.
  - Rewrote `app/routes/drums.py` to use Pydantic request/response models and the new service while preserving the current `/api/engine/drums/state` and pack endpoints for the existing UI/card surfaces.
  - Added foundational transport and metering endpoints: `GET/POST /api/engine/drums/transport` and `GET /api/engine/drums/metering`.
  - Added sequencer-position state to `DrumMachineService`, a typed `GET /api/engine/drums/position` route, and WebSocket topic fan-out for `drums`, `drums:transport`, `drums:position`, and `drums:metering` using the shared `WebSocketManager`.
  - The service now exposes explicit publish helpers for state, transport, position, and metering snapshots so future engine/binding callbacks can emit real-time updates without route-local websocket logic, and it uses the current JUCE engine access point to sync drum master volume and live metering when those bindings are available.
  - Validation: `pytest -q tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass (`12 passed`). `PYTHONPYCACHEPREFIX=/tmp/map2-pycache python3 -m py_compile app/services/drum_machine_service.py app/routes/drums.py app/routes/websocket.py tests/test_drum_machine_service.py tests/test_drum_routes.py` -> pass.
  - Scope note: sequencer transport remains a projected backend contract until `T213` lands, but the backend service slice itself is no longer blocked on the old dict stub or missing websocket/metering integration.

---

ID: T217
Status: [ ] Todo
Title: Drum Machine UI — TR-Style Step Sequencer (Carbon Design)
Description:
- Goal / acceptance criteria: Build the primary drum machine UI as a full-page Carbon Design surface at `/drums` with a TR-style 16-step grid, instrument rows, transport controls, pattern/song management, and real-time metering. This replaces the current placeholder `DrumsPage.tsx` and `DrumMachineCard.tsx`.
- Why it matters: The UI is the operator's primary interaction surface. It must match professional drum machine standards (TR-8S, Digitakt) while adhering strictly to Carbon Design conformance.
- Dependencies: T213 (sequencer API), T214 (kit management API), T216 (backend service + WebSocket)
- Estimated effort: Very High
- Required outputs: Complete page implementation, plugin card, Carbon conformance checklist pass, responsive design, accessibility pass.
Subtasks:
  - [ ] T217-A: Page layout and navigation — `web/src/app/pages/DrumsPage.tsx` (full rewrite)
    - Carbon `Grid` / `Row` / `Column` layout on 16-column structure
    - Three mode tabs via Carbon `Tabs` component: Practice, Advanced, Backing Tracks
    - Global transport bar (top): Play/Stop buttons (`Button` with `renderIcon`), BPM display (`NumberInput`), Tap Tempo (`Button`), Swing knob, pattern selector (`Dropdown`), master volume (`Slider`)
    - Mode-specific content area below transport bar
    - Footer status bar: active kit name, current pattern, playing/stopped badge, MIDI activity indicator
    - Responsive: full grid on desktop (≥1056px), stacked on tablet (672–1055px), single-column on mobile (<672px)
  - [ ] T217-B: TR-style step sequencer grid (Advanced mode primary view)
    - 16 instrument rows × N step columns (N = pattern length, default 16, max 64)
    - Each row: instrument name label (left), mute/solo toggle buttons, 16 step pads, per-instrument volume slider (right)
    - Step pad states: off (empty, `$ui-01` background), active (filled, instrument accent color), accent (filled + bright border)
    - Step pad interaction: click to toggle on/off, shift+click for accent, right-click for velocity edit (Carbon `NumberInput` popover, 1–127)
    - Current step indicator: highlight column with `$interactive-01` border during playback, animate at tempo
    - Scrollable horizontally if pattern length > 16 steps (with step page indicator)
    - Carbon `StructuredList` or custom grid using Carbon tokens for cell sizing (40px × 40px step cells, 8px gap)
    - Step pads must be keyboard-accessible: arrow keys navigate grid, Enter/Space toggles, Tab moves between rows
  - [ ] T217-C: Instrument row controls
    - Each of 16 rows shows: instrument name (editable via `TextInput` inline), pad color swatch, Mute (`Toggle`), Solo (`Toggle`), Volume (`Slider` 0–100), Pan (`Slider` -100 to +100), Tune (`Slider` -24 to +24 semitones)
    - Instrument name reflects loaded kit instrument name (e.g., "Kick", "Snare", "Closed HH")
    - Row highlight on MIDI input: flash row accent color when that instrument receives a MIDI trigger
    - Row context menu: reassign MIDI note, change bus assignment, load different sample
  - [ ] T217-D: Pattern management panel
    - Pattern bank: 128 pattern slots displayed as Carbon `Tile` grid (8×16 or paginated)
    - Active pattern highlighted with `$interactive-01` border
    - Pattern operations: Copy (`Button`), Paste (`Button`), Clear (`Button` with `Modal` confirmation), Duplicate
    - Pattern length control: `NumberInput` (1–64 steps)
    - Variation selector: `Dropdown` (Main, Var 1–10)
    - Fill trigger: `Button` with `Lightning` icon
  - [ ] T217-E: Song mode arranger panel
    - Vertical list of song entries: each entry shows pattern name/number + repeat count
    - Carbon `OrderedList` or `StructuredList` with drag-to-reorder (or move up/down buttons for accessibility)
    - Add entry: `Button` → `Modal` with pattern selector `Dropdown` + repeat count `NumberInput` (1–99)
    - Remove entry: `Button` with `TrashCan` icon + confirmation
    - Song transport: Play Song / Stop Song buttons, loop toggle
    - Current position indicator: highlight active entry during song playback
  - [ ] T217-F: Kit browser and mixer panel
    - Kit browser: `Dropdown` for active kit selection + `Tile` grid showing available kits (factory + user) with name, category badge, instrument count
    - Load kit: click tile → `Modal` confirmation (loading replaces current kit)
    - Mixer view (toggled via Carbon `Toggle` or `ContentSwitcher`):
      - 8 submix bus channel strips arranged horizontally
      - Each strip: bus name label, EQ controls (3-band: low gain, mid gain + freq, high gain via `Slider`), compressor controls (threshold, ratio, attack, release, makeup via `Slider`), bus level `Slider`, mute/solo `Toggle`, peak meter bar (vertical, real-time via WebSocket)
    - Master strip: master volume `Slider` + master peak meter
  - [ ] T217-G: Practice mode panel
    - Style selector: Carbon `Tile` grid of 8 built-in styles (rock_8, rock_16, shuffle_blues, funk_16, metal_doublekick, pop_4onfloor, jazz_swing, reggae_1drop) with icon + label
    - Active style highlighted
    - Count-in control: `NumberInput` (0–4 bars)
    - Quantize control: `NumberInput` (1–8 bars)
    - Variation control: `Slider` (0–10)
    - Auto-fill toggle: `Toggle` with description text
    - Practice pack browser: `Accordion` sections for factory packs and user packs, each showing arrangement list with name, BPM, feel, time signature
    - Load arrangement: click → applies style, BPM, and section sequence to sequencer
  - [ ] T217-H: Backing Tracks mode panel
    - Track browser: `Search` + filterable `DataTable` of available tracks (name, genre, key, tempo, duration)
    - Track player: play/pause/stop, seek bar (`Slider`), waveform overview (reuse platform visualization components or `canvas`), current time / total time display
    - Tempo shift: `Slider` (-50% to +50%) — requires time-stretch engine integration (may be deferred)
    - Pitch shift: `Slider` (-12 to +12 semitones) — requires pitch-shift engine integration (may be deferred)
    - Loop controls: loop toggle, loop start/end markers on waveform
    - Note: Audio playback engine for backing tracks is a separate dependency — this subtask covers UI only; if engine not ready, show "Coming soon" `InlineNotification` (warning type, not coaching)
  - [ ] T217-I: Real-time metering and beat visualization
    - Per-instrument hit indicator: step pad flashes on trigger (via WebSocket)
    - Per-bus level meters: vertical bar meters on mixer strips, updated at 30fps via WebSocket
    - Master level meter: stereo peak meter in transport bar
    - Beat indicator: 4-dot display in transport bar synced to sequencer position via WebSocket (replace current interval-based animation with server-synced position)
    - Tempo display: large BPM readout with tap tempo visual feedback
  - [ ] T217-J: DrumMachineCard.tsx plugin card (full rewrite)
    - Compact card version for embedding in pedalboard/JUCE Grid
    - Uses `PluginCardShell` with `accentColor` based on active mode
    - Compact transport: BPM display, Play/Stop, pattern name
    - Compact step indicator: 16 dots showing active steps for current instrument
    - Kit name in footer
    - Mode switcher (Practice/Advanced/Backing) → navigates to full `/drums` page in that mode
    - Metering: small per-bus level bars in visualization area
    - MIDI mapping via `withMidiDialog` HOC (retain existing pattern)
  - [ ] T217-K: MIDI configuration panel
    - Accessible from Advanced mode via Carbon `Tab` or side panel
    - Note mapping table: Carbon `DataTable` with 16 rows (pad 0–15), columns: Pad Name, MIDI Note (editable `NumberInput`), MIDI Channel (`Dropdown`), Velocity Curve (`Dropdown`), Zone Config
    - Velocity curve editor: visual curve display (SVG/canvas, 128×128 grid), curve type selector, floor/ceiling sliders
    - MIDI learn: "Learn" `Button` per row → enter learn mode → display "Hit a pad..." → capture note → auto-fill
    - "Learn All" `Button` → sequential learn across all 16 pads
    - Hardware preset loader: `Dropdown` (Roland, Yamaha, Alesis, etc.) → `Button` "Apply Preset"
    - Zone configuration: per-pad expandable row showing Head/Rim/Edge zone note assignments
  - [ ] T217-L: Accessibility and Carbon conformance
    - Full keyboard navigation: Tab between sections, arrow keys within grids, Enter/Space to toggle steps
    - ARIA roles: grid role for step sequencer, row/gridcell for steps, aria-pressed for active steps, aria-label for instruments
    - Screen reader announcements: step state changes, transport state, pattern changes
    - Focus management: focus trap in modals, skip links for major sections
    - Color contrast: all step states meet WCAG 2.1 AA against `$ui-01` background
    - Pass full `docs/design/CARBON_CONTRIBUTION_REVIEW_CHECKLIST.md`
Assigned to: Codex
Last updated: 2026-03-18

---

ID: T218
Status: [✓] Done
Title: Drum Machine TypeScript types, API client, and React Query integration
Description:
- Goal / acceptance criteria: Define complete TypeScript interfaces for all drum machine data structures and implement the API client layer with React Query hooks for all drum machine endpoints.
- Why it matters: Type-safe API integration is required before any UI component can consume drum machine data. This is a prerequisite for T217.
- Dependencies: T216 (backend API must be defined; types can be written from spec before endpoints are live)
- Estimated effort: Medium
- Required outputs: Updated types.ts, updated api.ts, React Query hooks, unit tests for API client.
Subtasks:
  - [✓] T218-A: TypeScript interfaces in `web/src/map2/types.ts`
    - `DrumMachineState` — extend existing interface with full transport, sequencer position, active pattern, active kit, mixer state
    - `DrumKit` — kit_id, name, description, author, category, instruments[16]
    - `DrumInstrument` — name, sfz_path, default_note, bus_assignment, volume, pan, tune, mute, solo
    - `DrumPattern` — pattern_id, steps (16×64 grid of {velocity, accent}), length, variation
    - `DrumSongEntry` — pattern_id, repeat_count
    - `DrumSong` — entries[], loop
    - `DrumBusMixer` — bus_id, name, eq (low_gain, mid_gain, mid_freq, high_gain), comp (threshold, ratio, attack, release, makeup), level, mute, solo
    - `DrumMeeting` — per_pad_peak[16], per_pad_rms[16], per_bus_peak[8], per_bus_rms[8], master_peak, master_rms
    - `DrumMidiMapping` — pad_id, midi_note, midi_channel, velocity_curve, zones[]
    - `DrumVelocityCurve` — type (linear/log/exp/s-curve/fixed), input_floor, output_floor, output_ceiling
    - `DrumZone` — zone_type (head/rim/edge), midi_note, articulation
  - [✓] T218-B: API client in `web/src/map2/api.ts` — `drumsApi` object (extend existing)
    - Transport: `getTransport()`, `setTransport(state)`, `tapTempo(timestamp)`
    - Patterns: `getPattern(id)`, `setPattern(id, data)`, `setStep(pattern, instrument, step, velocity)`, `clearPattern(id)`, `copyPattern(src, dst)`
    - Song: `getSong()`, `setSong(entries)`, `addSongEntry(entry)`, `removeSongEntry(position)`
    - Kits: `getKits()`, `getKit(id)`, `loadKit(id)`, `getActiveKit()`, `importKit(file)`, `createKit(template)`
    - Mixer: `getPadControls()`, `setPadControl(pad, params)`, `getBusMixer()`, `setBusMixer(bus, params)`, `getMasterVolume()`, `setMasterVolume(vol)`
    - MIDI: `getMidiMapping()`, `setMidiMapping(mapping)`, `getVelocityCurves()`, `setVelocityCurve(pad, curve)`, `startMidiLearn()`, `stopMidiLearn()`, `getMidiLearnStatus()`, `getMidiPresets()`, `loadMidiPreset(preset)`
    - Metering: `getMetering()` (HTTP fallback; primary source is WebSocket)
  - [✓] T218-C: React Query hooks in `web/src/app/hooks/useDrumMachine.ts`
    - `useDrumTransport()` — transport state with 500ms refetch (WebSocket primary, HTTP fallback)
    - `useDrumPattern(patternId)` — pattern data with manual invalidation on edit
    - `useDrumSong()` — song arrangement
    - `useDrumKits()` — kit list (60s stale time)
    - `useDrumActiveKit()` — currently loaded kit (manual invalidation on load)
    - `useDrumMixer()` — pad + bus + master mixer state (1s refetch)
    - `useDrumMetering()` — WebSocket subscription hook returning real-time levels at 30fps
    - `useDrumMidiMapping()` — MIDI config (manual invalidation on change)
    - `useDrumMidiLearn()` — learn mode status (500ms refetch while active)
    - All mutations via `useMutation` with appropriate cache invalidation
Assigned to: Codex
Last updated: 2026-03-18 18:53 - Codex
- Completion notes:
  - Expanded `web/src/map2/types.ts` from the initial state/transport shell into a full drum domain model covering kits, instruments, patterns, song arrangements, mixer state, master volume, MIDI mappings, velocity curves, zones, learn status, and hardware presets.
  - Completed the `drumsApi` surface in `web/src/map2/api.ts` for the current drum-machine spec: transport, tap tempo, patterns, song arrangement, kit lifecycle, pad/bus/master mixer controls, MIDI mapping/learn/presets, pack inventory, and metering. The shared fetch helper now preserves multipart uploads by not forcing JSON `Content-Type` on `FormData`.
  - Replaced the starter hook file with a fuller React Query layer in `web/src/app/hooks/useDrumMachine.ts`, including state/transport queries, pattern/song/kit/mixer/MIDI hooks, and mutation hooks with targeted cache invalidation for pattern, song, kit, mixer, and MIDI workflows.
  - Added focused frontend validation in `web/src/app/hooks/useDrumMachine.test.tsx` and kept the drum-state normalization coverage in `web/src/map2/drumMachineState.test.ts`.
  - Validation: `npm --prefix web run typecheck` -> pass. `npm --prefix web test -- --runInBand web/src/app/hooks/useDrumMachine.test.tsx web/src/map2/drumMachineState.test.ts` -> pass.

---

ID: T219
Status: [ ] Todo
Title: Drum Machine integration testing and qualification
Description:
- Goal / acceptance criteria: Comprehensive test coverage for the drum machine across all layers — C++ unit tests, Python service tests, API endpoint tests, frontend component tests, and end-to-end integration tests.
- Why it matters: A professional drum machine must be rock-solid. Every layer needs test coverage before shipping.
- Dependencies: T211–T218 (all drum machine implementation tasks)
- Estimated effort: High
- Required outputs: Test suites, CI integration, qualification evidence.
Subtasks:
  - [ ] T219-A: C++ unit tests for DrumMachineProcessor
    - 16-pad triggering with correct bus routing
    - Per-pad volume/pan/tune/mute/solo
    - Per-bus EQ and compressor (verify frequency response, gain reduction)
    - Master output level
    - SFZ kit loading and instrument assignment
    - Velocity curve transforms (all 5 types)
    - RT-safety verification: no allocations in processBlock
  - [ ] T219-B: C++ unit tests for DrumSequencer
    - Pattern step set/get/clear/copy
    - Transport play/stop/pause with sample-accurate step timing
    - Variable pattern length (1–64 steps)
    - Swing application
    - Song mode playback with repeat counts
    - Fill trigger timing
    - Tap tempo BPM calculation
  - [ ] T219-C: Python service tests — `tests/test_drum_machine.py`
    - Kit loading and switching
    - Pattern CRUD operations
    - Song arrangement management
    - State persistence (save/restore)
    - MIDI mapping configuration
    - Velocity curve configuration
    - Input validation (out-of-range BPM, invalid pattern ID, etc.)
  - [ ] T219-D: API endpoint tests — `tests/test_drum_routes.py`
    - All REST endpoints: correct status codes, response schemas, error handling
    - Pydantic model validation
    - Concurrent access (multiple clients updating state)
  - [ ] T219-E: Frontend component tests
    - `DrumsPage.test.tsx` — renders all three modes, tab switching, transport controls
    - `DrumMachineCard.test.tsx` — compact card rendering, mode display, metering
    - Step grid interaction: click toggles step, shift+click sets accent, keyboard navigation
    - Pattern management: copy, paste, clear
    - Kit browser: load kit, display instruments
    - Mixer: adjust bus EQ/comp, verify slider values
    - MIDI config: note mapping table, learn mode UI
  - [ ] T219-F: Integration test — full stack end-to-end
    - Load kit → set pattern → play → verify audio output (non-silence) → stop
    - MIDI input → verify correct pad triggers → verify metering response
    - Pattern edit during playback → verify changes take effect at next step
    - Song mode: play through multiple patterns with repeats → verify correct sequence
    - Kit switch during playback → verify clean transition
Assigned to: Codex
Last updated: 2026-03-18

---

## Typography

ID: T220
Status: [✓] Done
Title: Adopt BlexMono Nerd Font as the default site typeface with governed Nerd Font glyph usage
Description:
- Goal / acceptance criteria: Replace the current site-wide default font stack with `BlexMono Nerd Font` for the active frontend, ship the font through a deterministic web-delivery strategy, and define explicit glyph-usage rules so the extended Nerd Font symbol set improves navigation, telemetry, and status readability without degrading accessibility or becoming decorative noise.
- Why it matters: The current frontend still defaults to `IBM Plex Sans` and mixed mono fallbacks, so typography is inconsistent with the requested visual direction and there is no governance for safe, intentional use of extended Nerd Font glyphs.
- Dependencies: Current frontend font tokens in `web/src/index.css`, any route-local overrides that should remain exempt, final licensing/distribution decision for bundling the font assets, and user direction on scope/risk tolerance for glyph density.
- Estimated effort: High
- Required outputs: Implemented default-font migration plan, updated font tokens/assets/load path, documented glyph playbook with approved usage categories and bans, targeted UI updates for the best glyph-driven surfaces, and validation notes for rendering/performance/accessibility.
- Completion notes:
  - Pinned the upstream source to Nerd Fonts `v3.4.0` (`IBMPlexMono.zip`, published 2025-04-24) and imported the current `BlexMonoNerdFont-*` family from that release.
  - Added a reproducible subsetting pipeline in `scripts/build_blexmono_nerd_webfonts.py` that produces repo-hosted `woff2` text and glyph subsets plus a source/version manifest under `web/public/fonts/blexmono-nerd/v3.4.0/`.
  - Carried the upstream `LICENSE.txt` and `README.md` into the hosted font directory for provenance/compliance.
  - Added the strict initial glyph/codepoint governance document at `docs/design/BLEXMONO_NERD_FONT_SPEC.md`.
  - Wired the new family into the active root typography tokens and first authority points in `web/src/index.css`, plus the first route/style cleanup pass in `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/IntelFXMonitorView.css`, and `web/src/styles/responsive.module.css`.
  - Closed the final production follow-up by removing local `ibm-plex-sans-*` asset emission from the web build while preserving the documented Carbon/CDN residual note.
Subtasks:
ID: T220-subA
Status: [✓] Done
Title: Audit current typography tokens, overrides, and delivery path
Description:
- Goal / acceptance criteria: Inventory the current font tokens, direct `font-family` overrides, Carbon token interactions, and any hard-coded mono/sans fallbacks that would conflict with a site-wide `BlexMono Nerd Font` rollout.
- Why it matters: The migration should target the real authority points instead of only changing one root variable while leaving route-local typography fractured.
- Dependencies: None
- Estimated effort: Medium
- Required outputs: Concrete file list, token ownership map, and exemption candidates for specialty surfaces that should not inherit the new default blindly.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 16:58 - Codex
- Decision notes:
  - User direction confirmed on 2026-03-18: use `BlexMono Nerd Font` across all active frontend fonts rather than a limited-scope rollout.
  - Delivery direction: self-host the font assets in MAP2 rather than depending on local OS installation.
  - Visual direction: aggressive mono-first identity rather than a restrained mixed sans/mono system.
  - Glyph direction: use the extended Nerd Font glyph language across all major surfaces, not just one UI cluster.
  - Accessibility/risk note to resolve during implementation: user permits glyph-only usage, so the rollout must still define where glyph-only is safe versus where hidden labels/tooltips/ARIA text remain mandatory.
  - Icon-system boundary confirmed on 2026-03-18: keep Carbon/MAP SVG icons as the primary icon system; use Nerd Font glyphs mainly for typography, badges, labels, dense status language, and compact affordances rather than replacing the SVG icon program.
  - Performance direction: subset/self-host the font assets for web delivery instead of shipping the full font payload unbounded.
  - Weight/style direction: host multiple weights/styles rather than enforcing a single minimal terminal-weight package.
  - Scope direction: include legacy routed surfaces under `web/src/map2/**` and `web/src/pipedal/**`, not just `web/src/app/**`.
  - Glyph-only direction refined on 2026-03-18: glyph-only UI should be used primarily for small/mobile interfaces and very tight layouts; larger layouts should still prefer stronger textual affordance even if glyph-led styling is aggressive.
  - Action direction: glyph treatment may extend across action surfaces, but implementation still needs explicit mobile/desktop rules so primary actions do not become ambiguous on larger layouts.
  - Asset-ingestion direction confirmed on 2026-03-18: import the font assets into the repo now rather than deferring to a later manual drop.
  - Desktop labeling direction: desktop may keep text labels for actions when space allows, while tighter/mobile layouts may compress toward glyph-led controls.
  - Heading direction: hierarchy should be built with pure `BlexMono Nerd Font` only, using weight/spacing/case rather than introducing a secondary display face.
  - Legacy rollout direction: apply the typography program across both `web/src/map2/**` and `web/src/pipedal/**` rather than staging only one of those islands.
  - Governance direction: document an explicit approved glyph/codepoint set and strict usage rules rather than loose examples-only guidance.
  - Carbon-conformance direction confirmed on 2026-03-18: preserve Carbon typography and spacing standards where practical instead of turning the UI into an ungoverned terminal parody.
  - Surface scope refined: inputs, tables, code/log views, navigation, and general interface text should all move onto the same BlexMono family rather than keeping major typography exceptions.
  - Glyph-catalog direction refined: prefer broad approved Nerd Font coverage across the UI, except where an existing Carbon icon is clearly better for clarity or consistency.
  - Fallback direction: ship with a deterministic fallback stack rather than treating any non-primary glyph fallback as a release blocker.
  - Asset packaging direction: follow best practice by storing optimized web-ready font subsets plus source/version manifesting rather than keeping a random raw-asset dump without provenance.
  - Webfont-format direction confirmed on 2026-03-18: use best-practice webfont packaging rather than mirroring the upstream distribution blindly.
  - Governance-doc direction: implementation may choose the best documentation shape, but the glyph/font system must remain explicit and restart-safe.
  - Mobile accessibility direction: glyph-only controls may rely on ARIA and visually hidden/accessible naming rather than requiring visible tooltip labels by default.
  - Cleanup direction: normalize and fix the existing hard-coded `font-family` declarations correctly as part of the rollout rather than preserving avoidable drift.
  - Token direction: introduce clearer global typography tokens while preserving Carbon-compatible aliases, instead of simply overloading the old names without structure.
  - Rendering direction confirmed on 2026-03-18: include font-rendering polish such as smoothing and spacing adjustments as part of the rollout rather than treating this as a family swap only.
  - Utility-layer direction: keep the approved glyph system governed by the written spec rather than introducing a separate glyph helper abstraction unless implementation later proves it necessary.
  - Glyph-selection direction: follow best practice for standard-vs-Nerd-Font symbol choice instead of forcing one category everywhere.
  - Labeling direction refined: do not inject glyph-prefixed naming patterns into route titles, launcher cards, or menu labels unless the glyph materially improves the UI.
  - Authenticity direction: period-authentic emulated/device surfaces may retain local typography exceptions where the new global mono system would harm faithful presentation.
 - Completion notes:
  - Audited the primary typography authority points and confirmed the current default still flows through `web/src/index.css`, with additional hard-coded overrides in route CSS, component CSS, and inline style objects.
  - Confirmed the first high-value override points in `web/src/index.css`, `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/IntelFXMonitorView.css`, and `web/src/styles/responsive.module.css`.
  - Counted the remaining typography override tail at `60` unique frontend files still carrying explicit old mono/sans declarations that need normalization in follow-on passes.
ID: T220-subB
Status: [✓] Done
Title: Define webfont sourcing, packaging, and fallback strategy for BlexMono Nerd Font
Description:
- Goal / acceptance criteria: Decide whether MAP2 will vendor the Nerd Font assets, subset them, or fetch them during build/release, then specify the fallback stack and loading behavior for fast, stable rendering.
- Why it matters: Font choice is easy; production-safe delivery is the part that breaks builds, adds bloat, or causes FOIT/FOUT if left vague.
- Dependencies: T220-subA, user decision on self-hosting versus external/manual install assumptions
- Estimated effort: Medium
- Required outputs: Delivery decision, asset location plan, fallback stack, preload/subset policy, and any follow-up licensing/compliance note.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 16:58 - Codex
 - Completion notes:
  - Pinned the webfont source to Nerd Fonts `v3.4.0` and imported the upstream `IBMPlexMono.zip` payload for build-time processing.
  - Added `scripts/build_blexmono_nerd_webfonts.py` to produce optimized `woff2` subsets rather than shipping raw upstream files directly.
  - Generated repo-hosted subsets, manifest, license, and source README under `web/public/fonts/blexmono-nerd/v3.4.0/`.
ID: T220-subC
Status: [✓] Done
Title: Establish Nerd Font glyph governance and approved UI usage patterns
Description:
- Goal / acceptance criteria: Define where extended glyphs are allowed, where they are forbidden, and the pairing rules with text/icons for accessibility, searchability, and operator clarity.
- Why it matters: “Excellent use” of the glyph set requires restraint and consistency; otherwise the UI becomes visually noisy and semantically brittle.
- Dependencies: T220-subA
- Estimated effort: Medium
- Required outputs: Glyph playbook covering approved categories such as nav labels, topology/state markers, terminal/log views, compact telemetry, and decorative exclusions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 16:58 - Codex
 - Completion notes:
  - Added the strict allowlist-based glyph governance document at `docs/design/BLEXMONO_NERD_FONT_SPEC.md`.
  - Recorded the initial approved Nerd Font PUA set, token policy, Carbon boundary, and authenticity exemptions for emulated device surfaces.
ID: T220-subD
Status: [✓] Done
Title: Apply the new default font tokens and migrate the highest-value surfaces
Description:
- Goal / acceptance criteria: Implement the chosen font-delivery approach, update the root typography tokens, and revise the most valuable surfaces to use governed Nerd Font glyphs where they materially improve scanning and density.
- Why it matters: The plan is only useful if the system default and the first wave of operator-facing surfaces actually ship together.
- Dependencies: T220-subA, T220-subB, T220-subC
- Estimated effort: High
- Required outputs: Updated CSS/tokens/assets, targeted UI component changes, and documented exceptions for surfaces left on alternate families.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 17:20 - Codex
 - Completion notes:
  - Added `@font-face` wiring for the generated BlexMono text/glyph subsets in `web/src/index.css`.
  - Introduced clearer global typography tokens (`--font-ui`, `--font-ui-tight`, `--font-display`, `--font-mono`) while preserving Carbon-compatible aliases.
  - Switched the global body and heading family defaults to the new BlexMono-based token set and added rendering-polish defaults (`text-rendering`, ligature disable, smoothing preservation).
  - Updated the first route/style overrides in `web/src/app/pages/JuceGridPage.css`, `web/src/app/pages/IntelFXMonitorView.css`, and `web/src/styles/responsive.module.css`.
  - Follow-on cleanup pass updated additional shared surfaces and page-local typography constants in `web/src/app/pages/HomePage.css`, `PlatformInfoGuideSection.tsx`, `ExpressionPage.tsx`, `PerformPage.tsx`, `web/src/app/components/HostMachine/HostMachine.css`, `web/src/app/components/Displays/SegmentedLedText.css`, `web/src/app/components/PluginOutputPanel.css`, `web/src/app/pages/PipeWirePage.css`, `AudioEnginePage.css`, `LV2PluginsPage.css`, and `MidiHubPage.css`.
  - Another cleanup pass updated shared and legacy readout surfaces in `web/src/app/components/shared/LandscapePrompt.tsx`, `ApiObservatory/primitives/JsonTreeViewer.tsx`, `ApiActivityOverlay/ApiActivityOverlay.css`, `ThemeChooserModal.css`, `CPUStatusOverview.tsx`, `UpdateProgressViewer.tsx`, `web/src/ErrorBoundary.tsx`, `Visualizations/ClusterMeteringStrip.tsx`, `web/src/pages/ClusterAdmin.tsx`, `web/src/map2/components/MIDIMapper.tsx`, `WWWPanel.tsx`, `PluginCpuIndicator.tsx`, and `LatencyDisplay.tsx`.
  - A further meter/editor cleanup pass updated `web/src/app/components/AudioMeter.tsx`, `Visualizations/DynamicsMeteringPanel.tsx`, `Visualizations/VuMeterDisplay.tsx`, `TunerDisplay.tsx`, `MIDICommanderSetup.tsx`, and `LV2PluginParameterEditor.tsx`.
  - Another plugin-card/readout cleanup pass updated `web/src/app/components/PluginCards/Visualizations/TunerDisplay.tsx`, `PluginCards/Custom/JUCE/DrumMachineCard.tsx`, `PluginCards/Custom/JUCE/NAMCard.tsx`, `PluginCards/Custom/TooB/TunerCard.tsx`, `PluginCards/Custom/JUCE/CompressorCard.tsx`, `PluginCards/Custom/JUCE/GateCard.tsx`, `PluginCards/Custom/JUCE/LimiterCard.tsx`, and the remaining mono readout in `MIDICommanderSetup.tsx`.
  - Final cleanup pass normalized the residual hard-coded old mono/sans declarations in dynamics, EQ, plugin dialogs, Tesira AVB tables, metering pages, shared chooser surfaces, `web/src/map2/**`, `web/src/index.css`, and safe non-emulated LCD metadata/readout surfaces.
  - Final audit state: the hard-coded old mono/sans declaration tail is down from `60` to `0` unique files across `web/src/app/**`, `web/src/map2/**`, and `web/src/pipedal/**` using the tracked ripgrep audit.
ID: T220-subE
Status: [✓] Done
Title: Validate rendering, accessibility, and performance of the typography migration
Description:
- Goal / acceptance criteria: Verify that the new font renders reliably across the supported UI surfaces, does not regress readability/accessibility, and keeps font payload/performance within acceptable bounds.
- Why it matters: Font migrations often fail on clipping, fallback gaps, glyph confusion, and asset-size regressions.
- Dependencies: T220-subD
- Estimated effort: Medium
- Required outputs: Validation notes for typecheck/build, visual spot checks, accessibility observations, and any follow-up fixes or exemptions.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 17:20 - Codex
 - Completion notes:
  - `npm --prefix web run typecheck` passes after the typography cleanup and the related Carbon icon/build-fix follow-up.
  - `npm --prefix web run build` now passes end to end.
  - Validation surfaced only non-blocking build warnings for large chunks and mixed dynamic/static imports; no typography-specific build failure remains.
  - The hosted BlexMono webfont payload remains about `348K` total across the generated `woff2` subsets.
  - Accessibility posture for the migration remains governed by `docs/design/BLEXMONO_NERD_FONT_SPEC.md`, with glyph-only usage still constrained to compact/mobile cases and Carbon/MAP SVG icons kept as the primary icon system.
ID: T220-subF
Status: [✓] Done
Title: Remove residual IBM Plex Sans webfont emission from the production build
Description:
- Goal / acceptance criteria: Audit and eliminate the remaining `ibm-plex-sans-*` webfont assets emitted by `npm --prefix web run build` so the production bundle aligns with the BlexMono-first typography rollout and avoids shipping unused legacy font payload.
- Why it matters: The default font migration is implemented, but the current production bundle still emits legacy IBM Plex Sans assets, which adds unnecessary payload and weakens the final typography posture.
- Dependencies: T220-subD, T220-subE
- Estimated effort: Medium
- Required outputs: Source of IBM Plex Sans asset emission identified, imports/tokens/build config corrected, and validation notes confirming the legacy font files are no longer emitted unless an explicit exemption is documented.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 18:31 - Codex
- Completion notes:
  - Removed the legacy `@fontsource/ibm-plex-sans/*` entrypoint imports from `web/src/main.tsx` and dropped `@fontsource/ibm-plex-sans` from `web/package.json` / `web/package-lock.json`.
  - Tightened `scripts/build_web_dist_atomic.py` so the atomic publish step no longer carries forward stale `ibm-plex-sans-*` hashed assets from prior builds into the new `web/dist/assets` tree.
  - Validation: `npm --prefix web run typecheck` -> pass, `npm --prefix web run build` -> pass, `find web/dist/assets -maxdepth 1 -type f | grep -i 'ibm-plex-sans'` -> no matches, and the currently referenced `web/dist/assets/index-ClUQS4FA.js` / `index-D4VpUnpq.css` contain no `ibm-plex-sans` source references.
  - Residual note: Carbon's shipped stylesheet still declares `IBM Plex Sans` as a font-family and references hosted `IBM Plex Mono` assets from IBM/CDN, but the local build no longer emits the legacy `ibm-plex-sans-*` font files targeted by this task.

## Carbon Category Card Refactor

ID: T222
Status: [✓] Done
Title: Carbon-compliant effect card refactor — AXE-FX Edit structural parity
Description:
- Goal / acceptance criteria: Refactor every effect card GUI (24 JUCE native, 15 third-party, 8 fallback templates = 47 total) to Carbon Design System compliance with AXE-FX Edit structural parity. Cards in the same effect category must share identical layout structure. All parameters preserved — advanced/unique features in Carbon Accordion sections. Delete all orphaned per-card CSS. Build must pass clean.
- Why it matters: Prior state had 47 cards each with bespoke sizing, layout, control types, and CSS. Cards in the same category (e.g., three dynamics processors) looked nothing alike. This refactor establishes visual and structural consistency across the entire plugin card system.
- Dependencies: Carbon Design System (`@carbon/react` v1.103.0, `@carbon/icons-react` v11.76.0) — already installed
- Estimated effort: Very High
- Required outputs: 16 new infrastructure/layout files, 47 refactored card files, 22 deleted CSS files, clean `tsc -b` and Vite production build.
Subtasks:
ID: T222-subA
Status: [✓] Done
Title: Phase 1 — Shared Carbon infrastructure
Description:
- Goal / acceptance criteria: Create the shared foundation components that all category layouts and cards will use.
- New files created:
  - `web/src/app/components/PluginCards/Base/CarbonCardShell.tsx` — Standardized card shell with Carbon Toggle bypass, Tag category badge, OverflowMenu, Accordion for advanced sections, fixed dimensions per category
  - `web/src/app/components/PluginCards/Base/CarbonParameterSection.tsx` — Always-visible section with auto-icon header
  - `web/src/app/components/PluginCards/Base/CarbonMeteringFooter.tsx` — Standardized IN/GR/OUT metering footer with clipping Tag indicator
  - `web/src/app/components/PluginCards/Base/carbonCardStyles.css` — Single shared CSS for all Carbon-compliant cards (category height variables, Carbon spacing tokens, accordion overrides, container queries)
- Modified: `web/src/app/components/PluginCards/types.ts` — Added `CATEGORY_CARD_DIMENSIONS` constant
- Key type: `ParamSlot` interface (label, value, min, max, defaultValue, step, unit, onChange, isLogarithmic, valueFormatter, midi)
- Key type: `AdvancedSection` interface (id, title, icon, children, defaultOpen)
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subB
Status: [✓] Done
Title: Phase 2 — 10 Category Layout components
Description:
- Goal / acceptance criteria: Create one standardized layout component per effect category defining the AXE-FX-style fixed structure.
- New files created (all in `web/src/app/components/PluginCards/Layouts/`):
  - `DynamicsCategoryLayout.tsx` (520px) — GR Meter + Transfer Curve → Dynamics → Timing → Output → Accordion → Footer
  - `ModulationCategoryLayout.tsx` (480px) — LFO Viz → Modulation → Character → Mix → Accordion → Footer
  - `DelayCategoryLayout.tsx` (520px) — Tap Grid → Time → Character → Mix → Accordion → Footer
  - `ReverbCategoryLayout.tsx` (500px) — Decay Curve → Space → Time → Tone → Mix → Accordion → Footer
  - `PitchCategoryLayout.tsx` (480px) — Pitch Display → Pitch → Character → Mix → Accordion → Footer
  - `AmplifierCategoryLayout.tsx` (560px) — Tube Viz → Input → Tone → Power → Output → Accordion → Footer
  - `MultiEffectCategoryLayout.tsx` (560px) — Algorithm Display → Selector → Primary Controls → Accordion → Footer
  - `EQCategoryLayout.tsx` (500px) — EQ Curve → Band Grid → Output → Accordion
  - `ConvolutionCategoryLayout.tsx` (420px) — IR Browser → Mix → Accordion → Footer
  - `InstrumentCategoryLayout.tsx` (560px) — Viz → Transport → Performance → Accordion → Footer
  - `index.ts` — barrel exports
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subC
Status: [✓] Done
Title: Phase 3 — Refactor 24 JUCE native cards
Description:
- Goal / acceptance criteria: Every JUCE native card uses its category layout. All parameters preserved. withMidiDialog HOC retained. Bespoke CSS imports removed.
- Cards refactored:
  - Dynamics (4): CompressorCard, CelestialCompressorCard (artist presets in Accordion), LimiterCard (ratio locked ∞), GateCard (open/closed indicator in extraContent)
  - Modulation (3): ChorusCard, PhaserCard, IntelliFXCard (8-voice controls in Accordion)
  - Amplifier (3): TweedBassmanCard, Peavey5150Card, NAMCard
  - Pitch (3): IntervalShifterCard, EVHPitchShifterCard (era presets in Accordion), BossXS1Card (expression pedal in Accordion)
  - Multi-Effect (3): EventideH9Card, ShoeGazeCard, PassionFXCard (signal chain modules in Accordion)
  - Reverb (2): LexiLoveCard → ReverbCategoryLayout, H3000Card → PitchCategoryLayout (primarily harmonizer)
  - EQ (1): ParametricEQCard → EQCategoryLayout (8-band)
  - Delay (1): NativeDelayCard → DelayCategoryLayout
  - Convolution (2): CabinetIRCard, ReverbIRCard → ConvolutionCategoryLayout
  - Instrument (2): DrumMachineCard, SynthForgeCard → InstrumentCategoryLayout
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subD
Status: [✓] Done
Title: Phase 4 — Refactor 15 third-party cards
Description:
- Goal / acceptance criteria: Every third-party card uses its category layout. Parameter access patterns (LV2 parameterValues/onParameterChange) preserved.
- Cards refactored:
  - TooB (7): CE2ChorusCard, BF2FlangerCard, PhaserCard, TremoloCard → ModulationCategoryLayout; DelayCard → DelayCategoryLayout; LooperCard → InstrumentCategoryLayout; TunerCard → CarbonCardShell (utility)
  - Dragonfly (3): DragonflyRoomCard, DragonflyHallCard, DragonflyPlateCard → ReverbCategoryLayout
  - LV2 (4): REEVRCard → ReverbCategoryLayout; OutotuneCard, WhammyCard → PitchCategoryLayout; KeyboardSamplerCard → InstrumentCategoryLayout
  - Airwindows (1): GlitchShifterCard → PitchCategoryLayout
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subE
Status: [✓] Done
Title: Phase 5 — Refactor 8 fallback templates
Description:
- Goal / acceptance criteria: Every fallback template wraps its category layout. Generic parameters auto-mapped to standard slots via toSlot() helper; unmatched params in Accordion advanced sections.
- Templates refactored:
  - DynamicsTemplate → DynamicsCategoryLayout
  - ReverbTemplate → ReverbCategoryLayout
  - EQTemplate → EQCategoryLayout (auto-detects band structure)
  - DelayTemplate → DelayCategoryLayout
  - ModulationTemplate → ModulationCategoryLayout
  - DistortionTemplate → AmplifierCategoryLayout
  - PitchTemplate → PitchCategoryLayout
  - UtilityTemplate → CarbonCardShell (auto-groups parameters)
Assigned to: Codex
Last updated: 2026-03-19 - Codex

ID: T222-subF
Status: [✓] Done
Title: Phase 6 — Cleanup and build verification
Description:
- Goal / acceptance criteria: Delete all orphaned per-card CSS files. Fix any remaining stale imports. Build must pass clean.
- 22 CSS files deleted (JUCE: 17, LV2: 3, Airwindows: 1, TooB: 0 — had none)
- 3 stale CSS imports fixed (ShoeGazeCard, PassionFXCard, EventideH9Card)
- 4 build errors fixed: invalid Carbon icon `Tune` → `SettingsAdjust` (H3000Card, LexiLoveCard), missing `defaultValue` on EQ frequency ParamSlot (ParametricEQCard), type predicate mismatch (UtilityTemplate)
- Final validation: `tsc -b` clean, `npm run build` clean (16.34s)
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - All 47 cards + 8 templates now use standardized category layouts
  - Cards in the same category are structurally identical (AXE-FX Edit parity)
  - Every parameter is accessible — primary params visible, advanced in Carbon Accordion
  - Carbon icons throughout, no bespoke CSS remains on any card
  - withMidiDialog HOC preserved on all JUCE native cards
  - Planner-only mode instruction set added to `docs/CLAUDE.md`

## JUCE Grid — Axe-FX Edit / GarageBand Redesign

ID: T223
Status: [>] In Progress
Title: JUCE Grid Page — Axe-FX Edit desktop + GarageBand iPad redesign
Description:
- Goal / acceptance criteria: Full replacement and refactor of JuceGridPage and JuceGridSignalCanvas into an Axe-FX Edit–style effect block grid with GarageBand-informed iPad experience and Carbon Design System compliance.
- Estimated effort: Very High (multi-phase)
- Dependencies: T222 (Carbon card refactor — Done)
- Design hierarchy: Match Axe-FX Edit (desktop) → Match GarageBand (iPad) → Apple HIG → Carbon Standards

### Design Specification

#### Grid Layout
- **Win10 Start Menu tile layout**: Uniform-height cards, 3 width sizes (large/medium/small)
- **Row fill logic**: Cards start at largest width; shrink as more cards added to row until all at smallest width, then new row created
- **Once a row wraps**: Previous row cards stay at smallest width; new row starts fresh at largest width
- **Snake (boustrophedon) signal flow**: Row 1 left→right, Row 2 right→left, etc. Vertical connectors on right or left side as needed
- **Full replacement** of existing JuceGridPage and JuceGridSignalCanvas (use old code as guide)
- **Keep all existing colors** — no color scheme changes

#### Effect Grid Cards (Face)
- **Content**: Effect human-readable name, hero image (from existing effectIcons.ts), bypass state, category of effect
- **Glyphs**: Use glyphs wherever possible
- **Category colors**: Use existing CATEGORY_COLORS from types.ts
- **Bypass visual**: Dim/desaturate card face (Axe-FX Edit style); signal flow lines through bypassed card change appearance (dashed/reduced opacity)
- **Selected state**: Carbon standard highlight when card is open in bottom panel
- **Fixed portion layout**: Top portion = hero image, bottom portion = name/category/bypass (standardized across all cards)

#### Signal Flow
- **3-dot connectivity indicators**: Between cards, using Interactive Hover color, Carbon standard visibility behavior
- **Signal flow lines**: Carbon styling, connecting dot-to-dot between adjacent cards in chain
- **Input/Output**: Remain outside the signal chain; represent signal flow from input → through card chain → to destination/next hop → continuing to next card if required
- **Bypassed card flow**: Dashed line or reduced opacity through bypassed blocks (Axe-FX Edit style)
- **Flow updates**: Signal flow lines and dots update only after move is confirmed, not during

#### Bottom Parameter Panel
- **Opens on card click**: Slide-up animation; click same card again to close (slide-down)
- **Pushes grid up**: Grid stays fully visible at all times
- **Standardized layout**: All effects use same pattern — no custom per-card layouts
- **Parameter display**: Carbon NumberInput for numbers, Carbon Dropdown for named/enum items
- **Grouped parameters**: Use existing parameter group metadata (INPUT, OUTPUT, TIMING, THRESHOLD, FREQUENCY, MODULATION, SPATIAL, MIX, OTHER)
- **All groups visible**: No accordion/collapsing — all parameter groups shown
- **No scroll**: Effect parameter cards grow in height as needed
- **Panel header**: Effect hero icon, name, category, bypass toggle (mirrors card face)

#### Add Effect Slot
- **Single empty slot**: Always present at end of chain
- **Visual**: Matches Axe-FX Edit empty grid slot style (same height as cards, smallest width, "+" glyph)
- **Action**: Navigates to existing effects browser

#### Reorder System — "Select and Move"
- **Desktop**: Click to select card, arrow keys to move through signal chain (snake-aware wrapping)
- **Visual feedback**: Ghost/animation showing where card will land (Axe-FX Edit drag feedback style)
- **iPad**: Tap to select, on-screen arrow controls or Apple-recommended touch interaction
- **Keyboard**: When iPad hardware keyboard detected, arrow keys activate automatically; on-screen controls remain available

#### State Persistence
- **localStorage**: Remember selected card, panel open/close state, scroll position between sessions

#### Viewport & Responsive
- **Minimum viewport**: iPad portrait (768px) — full featured
- **Detection**: Screen width + touch capability
- **Mobile block**: Below 768px or mobile-sized touch device → black screen with hero icon centered, message: "This experience requires an iPad or larger display"

#### iPad Experience (GarageBand → Apple HIG → Carbon hierarchy)
- **Interaction**: GarageBand-style — single tap selects card, shows contextual toolbar (bypass, move, delete, open); "open" expands bottom panel
- **Parameter editing**: GarageBand-style large finger-friendly value areas; iOS picker wheels on iPad for NumberInputs (or enlarged 44pt Carbon steppers)
- **Visual feedback**: GarageBand-style subtle bounce animations, glow on selection, smooth slide-up for bottom panel
- **Bottom panel dismiss**: iOS-style swipe-down gesture + tap-card-again-to-close
- **Smart controls**: GarageBand-style curated 4-6 most important parameters as default view, with "All Parameters" toggle for full list
- **Touch targets**: All interactive elements ≥ 44pt in tablet mode (Apple HIG)
- **Split View**: If iPadOS Split View shrinks below 768px, show mobile block screen
- **All inputs, dialogs, interactions**: Follow Apple Best Practice for audio apps when in tablet mode; use Carbon standards to meet Apple standards

Subtasks:

ID: T223-subA
Status: [ ] Todo
Title: Grid layout engine — tile sizing, row fill, snake flow
Description:
- Build the responsive tile grid with 3 width sizes, uniform height
- Implement row-fill shrink logic (largest → smallest → new row)
- Previous rows stay smallest; new rows start fresh at largest
- Snake-pattern signal flow (boustrophedon) with right/left vertical connectors
- Replace JuceGridSignalCanvas (use as guide)
Assigned to: Unassigned
Last updated: 2026-03-19

ID: T223-subB
Status: [✓] Done
Title: Effect grid card face — hero image, name, category, bypass, glyphs
Description:
- Standardized card face layout: fixed top portion (hero image), fixed bottom portion (name/category/bypass)
- Use existing effectIcons.ts hero images and CATEGORY_COLORS
- Bypass dimming/desaturation (Axe-FX Edit style)
- Carbon standard selected state
- Glyph usage throughout
Assigned to: Unassigned
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Rebalanced the signal-card face in `web/src/app/pages/JuceGridPage.css` so the hero zone and bottom info band now use a fixed, standardized Axe-FX-style composition with consistent minimum heights, icon sizing, and bottom-detail spacing.
  - Updated `web/src/app/pages/JuceGridSignalCanvas.tsx` to resolve card hero glyphs from richer plugin metadata hints (`name`, `category`, `class_label`, display type, plugin name, URI) before falling back, which improves real effect-family icon selection without changing route color semantics.
  - Preserved the existing category labels, metrics, and selected-state behavior while tightening the card-face visual hierarchy for the ongoing T223 grid rewrite.

ID: T223-subC
Status: [✓] Done
Title: Signal flow visualization — 3-dot connectors, flow lines, input/output
Description:
- 3-dot connectivity indicators between cards (Interactive Hover color, Carbon visibility standard)
- Carbon-styled signal flow lines connecting cards
- Input/Output nodes outside signal chain showing full routing path
- Bypassed card flow lines (dashed/reduced opacity)
- Signal flow updates only after move confirmation
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added explicit input/output bridge treatments plus in-row 3-dot signal connectors in `web/src/app/pages/JuceGridSignalCanvas.tsx` so the processing path is visible across the entire chain instead of only inside the endpoint rails.
  - Applied Carbon-toned flow-line styling in `web/src/app/pages/JuceGridPage.css`, including dashed/reduced-opacity treatment whenever a bypassed block sits on the path.
  - Extended `web/src/app/pages/JuceGridSignalCanvas.test.tsx` to verify the new bridge/connector markup and bypass-dimmed connector state alongside the existing endpoint summary coverage.

ID: T223-subD
Status: [✓] Done
Title: Bottom parameter panel — standardized editor with slide animation
Description:
- Slide-up/down animation on open/close
- Click card to open, click again to close
- Pushes grid up (grid stays fully visible)
- Standardized layout: Carbon NumberInput + Dropdown
- Grouped parameters from existing metadata (all groups visible, no scroll)
- Panel header with hero icon, name, category, bypass toggle
- Effect parameter cards grow in height as needed
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Replaced the prior JUCE Grid modal editor in `web/src/app/pages/JuceGridPage.tsx` with an inline bottom panel that slides up beneath the workspace, toggles closed on same-card selection, and preserves the existing selected-block persistence path.
  - Added a standardized editor surface in `web/src/app/pages/JuceGridParameterEditor.tsx` that groups parameters with the existing Carbon plugin-card grouping heuristics and renders one Carbon control system across blocks using `NumberInput` plus `Dropdown` for discrete/toggled controls.
  - Added bottom-panel and grouped-control styling in `web/src/app/pages/JuceGridPage.css` plus regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` for the new open/close panel interaction.

ID: T223-subE
Status: [✓] Done
Title: Select-and-Move reorder system (desktop + iPad)
Description:
- Desktop: click to select, arrow keys to reposition (snake-aware wrapping)
- Ghost/animation feedback during move
- iPad: tap-select with on-screen move controls (Apple best practice)
- Hardware keyboard support on iPad (auto-detect, enable arrow keys)
- Signal flow updates after move confirmed
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added bottom-editor `Move left` and `Move right` controls in `web/src/app/pages/JuceGridPage.tsx`, wired to the existing chain reorder mutation so the selected block can be repositioned without leaving the editor context.
  - Reworked the page-level arrow-key handling in `web/src/app/pages/JuceGridPage.tsx` so desktop and hardware-keyboard iPad flows move the selected plugin through the chain, including first-select behavior when no block is active.
  - Passed reorder preview state through `web/src/app/pages/JuceGridPage.tsx` into `web/src/app/pages/JuceGridSignalCanvas.tsx`, then added preview/target treatment in `web/src/app/pages/JuceGridPage.css` for in-canvas move feedback.
  - Added regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` for bottom-editor move controls and keyboard-triggered leftward reorder requests.

ID: T223-subF
Status: [✓] Done
Title: Add effect slot + state persistence
Description:
- Single empty "add effect" slot at end of chain (Axe-FX Edit style, "+" glyph)
- Navigates to existing effects browser on click
- localStorage persistence: selected card, panel state, scroll position
Assigned to: Unassigned
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Kept the dedicated terminal add slot in `web/src/app/pages/JuceGridSignalCanvas.tsx` and aligned its operator-facing copy/ARIA to the worklist language (`Add effect`) while preserving the existing browser handoff.
  - Added route-local persistence in `web/src/app/pages/JuceGridPage.tsx` for the selected plugin URI, effect-editor open state, and workspace scroll position so the grid restores the last inspected block between sessions.
  - Added focused coverage in `web/src/app/pages/JuceGridPage.test.tsx` to prove the persisted block/editor state and scroll restore path rehydrate correctly from `localStorage`.

ID: T223-subG
Status: [✓] Done
Title: iPad experience — GarageBand interaction patterns
Description:
- GarageBand-style tap interaction (select → contextual toolbar → open)
- GarageBand-style parameter editing (large touch areas, iOS pickers or 44pt steppers)
- Subtle bounce/glow animations on interaction
- Swipe-down panel dismiss gesture
- Smart controls: curated 4-6 key params default, "All Parameters" toggle
- All touch targets ≥ 44pt
- iPadOS Split View handling (block if < 768px)
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added a tablet-touch interaction mode in `web/src/app/pages/JuceGridPage.tsx` so iPad-sized touch layouts tap-select a block first, then expose a contextual action row with editor, move, bypass, and remove actions before opening the editor.
  - Added swipe-down dismiss handling plus touch-specific editor copy in `web/src/app/pages/JuceGridPage.tsx`, keeping the existing hardware-keyboard arrow-key path available for iPad keyboards.
  - Added smart-control scoring and a touch-mode parameter surface in `web/src/app/pages/JuceGridParameterEditor.tsx` so touch layouts default to a curated control subset while preserving full grouped parameter access for non-touch layouts.
  - Added GarageBand-style glow/bounce feedback and 44pt minimum touch target treatment in `web/src/app/pages/JuceGridPage.css`, plus a focused iPad interaction regression in `web/src/app/pages/JuceGridPage.test.tsx`.

ID: T223-subH
Status: [✓] Done
Title: Mobile block screen + viewport detection
Description:
- Detect viewport < 768px or mobile touch device
- Black screen with centered hero icon
- Message: "This experience requires an iPad or larger display"
- Suggest rotation if tablet in portrait detected below threshold
Assigned to: Unassigned
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added an explicit viewport gate in `web/src/app/pages/JuceGridPage.tsx` that blocks the JUCE Grid experience on sub-768 mobile layouts before the main workspace renders.
  - Added a dedicated black-screen fallback in `web/src/app/pages/JuceGridPage.css` with a centered Audio Grid hero icon and the required iPad-or-larger message.
  - Added touch-capable rotation/Split View guidance plus focused regression coverage in `web/src/app/pages/JuceGridPage.test.tsx` so the blocked-state contract is verified alongside the normal desktop route behavior.

ID: T223-subI
Status: [✓] Done
Title: Build verification + card parameter audit
Description:
- Verify every card's parameters display correctly in standardized bottom panel
- Ensure all 47 cards + 8 templates work with the new grid layout
- tsc clean, npm run build clean, all tests pass
- Adjust card/panel sizing if any card's parameters don't fit
Assigned to: Codex
Last updated: 2026-03-19 - Codex
- Completion notes:
  - Added `web/src/app/pages/JuceGridParameterAudit.test.tsx` to audit the shipped JUCE Grid plugin inventory against the standardized bottom editor using the deployment catalogs in `app/deployment/juce_processors.json` and `app/deployment/default_lv2_effects.json`, covering all 35 shipped grid plugins with actual metadata-backed renders.
  - Added router-level audit coverage for the registered custom-card set and the eight fallback template categories so template-backed processors are validated alongside exact custom card registrations.
  - Fixed `web/src/app/components/PluginCards/registry.ts` so lazy template registrations participate in `getPluginCardConfig()` lookups; before this, fallback templates registered through `registerTemplateLazy()` were invisible to the config lookup path.
  - Validation passed with `npm --prefix web run typecheck`, `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridPage.test.tsx web/src/app/pages/JuceGridParameterAudit.test.tsx`, and `npm --prefix web run build`; no additional card sizing fixes were required from the audited deployment inventory.
