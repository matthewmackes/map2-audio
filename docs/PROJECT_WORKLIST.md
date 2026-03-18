## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

Last updated: 2026-03-18 - Codex (T210 SoundFont sampler refactor started for SynthForge review + implementation)

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
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 17:02 - Codex

ID: T203-subC
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

ID: T203-subD
Status: [ ] Todo
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
Last updated: 2026-03-17 - Claude

ID: T203-subE
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

ID: T203-subF
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

ID: T203-subG
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

ID: T203-subH
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

ID: T203-subI
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

ID: T203-subJ
Status: [ ] Todo
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
Assigned to: Claude
Last updated: 2026-03-17 - Claude

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
Status: [ ] Todo
Title: API startup, restart, and load-reliability remediation program
Description:
- Goal / acceptance criteria: Eliminate the API failure modes observed in the 2026-03-07 qualification review by hardening startup/readiness behavior, restart sequencing, endpoint degradation paths, and observability so that the load qualification suite passes consistently without transient `404`, `500`, `503`, connection resets, or 8-second read/connect timeouts during warmup or steady-state runs.
- Why it matters: The reviewed artifacts show one failed qualification run with 379/400 HTTP failures and 9240 WebSocket drops plus several earlier smoke runs with transient route/server errors, which blocks confidence in API reliability during restart and qualification.
- Dependencies: Existing load qualification artifacts under `docs/fit-for-purpose-evidence/20260307/`, backend service orchestration, API observability/logging stack, and final verification with `tests/load_test.py`
- Estimated effort: High
- Required outputs/deliverables: Implemented backend fixes, updated qualification/runbook logic, correlated observability artifacts, regression tests for startup/restart behavior, and a new evidence bundle showing repeatable pass under smoke and full qualification.
Subtasks:
ID: T209-subA
Status: [>] In Progress
Title: Convert startup and warmup states into explicit readiness gates
Description:
- Goal / acceptance criteria: Audit all load-tested API and websocket entry points and ensure they fail fast with structured readiness responses while dependencies are still warming up instead of hanging into client-side timeouts. Define concrete readiness checks for backend HTTP serving, chain inventory access, plugin inventory/discovery state, websocket broker availability, and any engine-backed audio routes. Acceptance requires a documented readiness matrix, implementation changes on affected routes/services, and automated tests proving warmup returns deterministic readiness errors instead of connection/read timeouts.
- Why it matters: The failed T050 run shows broad timeout behavior across unrelated routes, which is consistent with requests arriving before the stack is fully ready.
- Dependencies: None
- Estimated effort: Medium
- Required outputs/deliverables: Readiness matrix, route/service updates, startup-state tests, and notes linking coverage to the affected endpoints from the failure review.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 00:04 - Codex
- Progress notes:
  - Added shared route-readiness helper logic in `app/services/api_readiness.py` to convert startup and warmup states into structured `503` responses with dependency detail and `Retry-After` guidance.
  - Wired the readiness guards into the load-tested route families hit in the failure review: `/api/audio/status`, `/api/audio/latency`, `/api/audio/levels`, `/api/audio/levels/plugins`, `/api/chains/`, `/api/chains/{id}`, `/api/chains/{id}/activate`, `/api/chains/{id}/deactivate`, `/api/plugins/discover`, `/api/plugins/list`, `/api/plugins/load`, `/api/plugins/unload`, and `/api/plugins/batch/parameters`.
  - Added focused tests in `tests/test_api_route_readiness.py` and updated affected route tests so the new startup contract is validated without regressing plugin residency behavior.

ID: T209-subB
Status: [ ] Todo
Title: Stabilize restart sequencing and dependency ordering for backend and realtime services
Description:
- Goal / acceptance criteria: Trace service startup/restart ordering across the MAP2 backend stack and remove races that allow HTTP or websocket traffic before required subsystems are actually usable. Acceptance requires an explicit dependency/ordering map, any required code or service-unit changes, and restart validation showing API health, websocket readiness, and route availability are stable immediately after controlled service-stack restart.
- Why it matters: Later post-restart evidence passed cleanly, which suggests the failure is likely tied to startup ordering or readiness races rather than a permanent logic bug.
- Dependencies: T209-subA
- Estimated effort: Medium
- Required outputs/deliverables: Restart dependency map, service sequencing fixes, controlled restart validation evidence, and updated operational notes if boot/service procedures change.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 23:10 - Codex

ID: T209-subC
Status: [ ] Todo
Title: Harden chain and plugin lifecycle endpoints against transient 404/500/503 failures
Description:
- Goal / acceptance criteria: Review the chain activation/deactivation, chain lookup, plugin load, and plugin unload flows that appeared in the transient smoke failures and make them resilient to restart-time and warmup-time races. Acceptance requires root-cause analysis for the observed `/api/plugins/unload` `404`, chain endpoint `500`/`503` responses, and connection resets; route or service fixes that return the correct status/payloads; and focused regression tests that exercise lifecycle calls during degraded states.
- Why it matters: Even though the final qualification reruns passed, the transient lifecycle failures indicate brittle contract behavior around the most stateful API surfaces.
- Dependencies: T209-subA, T209-subB
- Estimated effort: High
- Required outputs/deliverables: Root-cause notes, backend fixes, targeted tests for chain/plugin lifecycle routes, and updated API contract documentation if any response semantics are formalized.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 23:10 - Codex

ID: T209-subD
Status: [ ] Todo
Title: Add correlated request, websocket, and dependency observability for qualification failures
Description:
- Goal / acceptance criteria: Extend logging/observability so every future load run can be correlated across HTTP requests, websocket sessions, dependency readiness, queue depth, and backend exceptions using a shared run or request context. Acceptance requires new or improved structured logs/metrics for timeout-prone areas, a documented artifact-capture path for qualification runs, and tests or smoke validation proving the data is emitted during failure and pass scenarios.
- Why it matters: Current client-side artifacts show the symptoms clearly, but they do not isolate the server-side cause of timeouts and resets quickly enough for efficient remediation.
- Dependencies: T209-subA
- Estimated effort: Medium
- Required outputs/deliverables: Structured log/metric additions, qualification capture instructions or script updates, and evidence examples tying a run ID to backend-side events.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 23:10 - Codex

ID: T209-subE
Status: [ ] Todo
Title: Make load qualification gating restart-safe and preflight-aware
Description:
- Goal / acceptance criteria: Update the load-qualification workflow so it verifies environment prerequisites and service readiness before the expensive smoke/full runs begin. This includes preflight checks for file descriptor limits, API health, websocket readiness, chain/plugin route availability, and any other conditions learned from T050-T053. Acceptance requires workflow/runbook updates and automated preflight behavior that prevents collecting misleading full-run failures when the environment is not yet ready.
- Why it matters: The failed run also carried an open-file-limit warning and appears to have started against an unhealthy or incompletely started stack; the qualification harness should catch those conditions first.
- Dependencies: T209-subA, T209-subB, T209-subD
- Estimated effort: Medium
- Required outputs/deliverables: Updated qualification runner or scripts, revised runbook/docs, preflight checks in automation, and evidence showing the gate blocks unsafe starts.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 23:10 - Codex

ID: T209-subF
Status: [ ] Todo
Title: Re-run smoke, full soak, and restart qualification to close the reliability program
Description:
- Goal / acceptance criteria: After the remediation work lands, execute the smoke, full 310-second qualification, and controlled restart qualification enough times to demonstrate the failures are gone and the pass is repeatable. Acceptance requires zero HTTP failures, zero websocket drops, acceptable latency gates, archived artifacts, and a short closure report comparing the fixed runs against the 2026-03-07 failure signatures.
- Why it matters: This program is not complete until the observed failure patterns are demonstrably absent in fresh evidence.
- Dependencies: T209-subB, T209-subC, T209-subD, T209-subE
- Estimated effort: Medium
- Required outputs/deliverables: New qualification artifact bundle under `docs/fit-for-purpose-evidence/`, closure summary, and final worklist update with pass/fail disposition.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-17 23:10 - Codex
Assigned to: Codex
Last updated: 2026-03-17 23:10 - Codex

## SynthForge

ID: T210
Status: [>] In Progress
Title: Refactor SynthForge into a SoundFont-first world-class sampler
Description:
- Goal / acceptance criteria: Review the existing `SynthForge` JUCE plugin plus `SynthForgeCard` UI, then refactor the instrument from the current subtractive/SFZ-oriented scaffold into a SoundFont-first sampler centered on hardware MIDI keyboards and the on-screen piano. Acceptance requires SoundFont 2 and 3 loading from the internal library, a preset browser built from parsed banks/programs, a redesigned on-screen piano with velocity interaction, real-time MIDI input handling aligned with JUCE MIDI pathways, and pro controls for master transpose, velocity curve, pitch-bend range, mono/poly mode, and legato. The implementation must expose a coherent backend/API/UI contract and preserve existing MAP2 integration points.
- Why it matters: The current SynthForge surface and engine do not match the requested product direction. The user explicitly wants a commercial-grade sampler architecture, not an SFZ scaffold with synth controls.
- Dependencies: Existing `juce-engine/Source/SynthForge/*`, `app/routes/synthforge.py`, `app/routes/soundfonts.py`, `app/services/juce_engine_service.py`, `web/src/app/components/PluginCards/Custom/JUCE/SynthForgeCard.tsx`, and build-system support for a SoundFont engine backend.
- Estimated effort: High
- Required outputs/deliverables: Reviewed architecture notes, implemented backend/API changes for SoundFont browsing/loading and preset metadata, JUCE core refactor toward SoundFont playback controls, redesigned SynthForge card, focused automated validation, and explicit notes for any remaining gaps such as static FluidSynth vendoring/build integration if not fully closed in this slice.
Subtasks:
ID: T210-subA
Status: [>] In Progress
Title: Deliver the first integrated SoundFont sampler slice across backend, engine, and card
Description:
- Goal / acceptance criteria: Land the first end-to-end slice that replaces SFZ-first UX with SoundFont-first browsing/loading, exposes parsed preset metadata, and adds the required sampler performance controls in the engine/API/card. Acceptance requires code changes in the relevant backend, JUCE, and frontend files plus targeted validation.
- Why it matters: This is the minimum coherent slice that converts SynthForge from a review item into a working sampler refactor.
- Dependencies: None
- Estimated effort: High
- Required outputs/deliverables: Code changes, tests/build notes, and handoff notes for any remaining FluidSynth packaging work.
Subtasks: None
Assigned to: Codex
Last updated: 2026-03-18 07:10 - Codex
- Progress notes:
  - Follow-up compatibility slice started to reconcile SynthForge against the full internal library inventory by making the browser format-aware instead of SoundFont-only.
  - Target behavior: one unified library browser that can route `.sf2/.sf3` through the SoundFont path and `.sfz` through the existing SFZ path while keeping the same keyboard/performance surface.
Assigned to: Codex
Last updated: 2026-03-18 06:20 - Codex

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
Status: [ ] Todo
Title: Icon system overhaul — monotone Carbon-style SVG icons with DSP color taxonomy
Description:
- Goal: Replace all icons across the MAP2 GUI (main app + PiPedal legacy area) with a unified set of monotone, Carbon Design System-style SVG icons. Apply DSP-type color taxonomy to all categories.
- Why it matters: Current icon system uses four libraries (Carbon, Phosphor, MUI, 63 custom PiPedal SVGs) with inconsistent styles and no systematic color-coding.
- Design documentation complete — see docs/design/ for all reference material before starting implementation.
- Estimated effort: High
Subtasks: None yet — awaiting SVG assets
Assigned to: Claude + User
Last updated: 2026-03-17 - Claude

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
Last updated: 2026-03-18 07:17 - Codex
- Completion notes:
  - Removed the inline desktop effect editor shell from `web/src/app/pages/JuceGridPage.tsx` and replaced it with a route-local modal driven by the existing selected-plugin flow.
  - Kept the current block-selection trigger unchanged while ensuring keyboard left/right plugin navigation also opens the effect modal and Escape closes the modal before clearing selection.
  - Added a responsive effect-modal shell in `web/src/app/pages/JuceGridPage.css` that hugs the editor content on larger screens, animates on open, dims the page with Carbon modal behavior, and expands to fullscreen on mobile.
  - Replaced the compact inline editor panel with a lightweight placeholder/reopen surface so the effect card now exists only inside the modal.
  - Refined the modal shell so all JUCE-GRID plugin/effect cards now open at the underlying window size captured at open time, with no extra modal header copy, metadata tags, or redundant close button above the card.
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
