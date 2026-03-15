# Overview IBM Refactor Brief

Date: 2026-03-14
Canonical task: T131-subA
Primary route: `web/src/app/pages/OverviewPage.tsx`

## Objective

Refactor `/overview` from a stacked collection of existing widgets into a restrained IBM-style operational landing page. The route should read as a first-scan node briefing, not as a mini dashboard and not as a marketing surface.

The required hierarchy for this route is:

1. Node health first
2. Audio-path readiness second
3. Operational KPIs third
4. Direct actions fourth
5. Supporting architecture/capabilities content last

## Current Route Audit

The current route already uses Carbon primitives, but it misses the second-pass IBM target in several concrete ways:

- The hero copy is generic platform description text (`"Neural amp modeler, LV2, convolution reverb, and realtime Linux"`) instead of an operational briefing.
- The page shell is a vertical flex stack, not a deliberate Carbon grid with clear top-of-page priority.
- `SystemArchitectureFlow` and `PlatformCapabilities` appear before the primary status summary on desktop, which pushes supporting content ahead of operational urgency.
- The KPI strip mixes real signals (`PipeWire`, `AVB stack`) with placeholder values (`Ready`, `Editable`, `Discover`, `Live`), which adds noise instead of reducing interpretation time.
- Network-share content only renders when SMB is enabled; there is no explicit loading, unavailable, empty, or failure state.
- The current route exposes almost no overview actions beyond SMB copy, so operators still have to navigate away to do basic follow-up work.
- Small-screen behavior is mostly omission via `desktopOnly`, not a deliberate collapsed model.
- Existing embedded components are useful as data sources, but in their current placement they read like full widgets dropped into a page rather than subordinate sections in a route-level narrative.

## Available Real Data Sources

The redesign should reuse current route data and existing helper surfaces rather than inventing placeholder copy:

- `usePipeWire()` for daemon state, latency, rate, and quantum
- `useAVBStatus()` for AVB/PTP availability and degradation reason
- `/api/folders/network-shares` for SMB availability, URLs, and share accessibility
- `CPUStatusOverview` as a source of system/CPU health context
- `PlatformCapabilities` as a lower-priority capability inventory
- `SystemArchitectureFlow` as a lower-priority architecture explainer

The refactor should elevate route-level summaries from those sources rather than letting the supporting widgets dominate first paint.

## Target Information Architecture

### Desktop / large tablet

Use a Carbon 16-column grid with five ordered bands:

1. Lead-space briefing
   - Left: route title, one-sentence node briefing, last-known operational posture
   - Right: compact action cluster for the most important follow-up tasks
   - Tone: product brief, sentence case, no decorative hype

2. Primary health band
   - Large node-health summary tile spanning the main visual focus
   - Secondary audio-readiness summary tile beside or beneath it
   - These two tiles should answer "Is this node healthy?" and "Can it pass audio now?" without scrolling

3. KPI band
   - Four first-scan KPI modules only:
     - Audio runtime
     - AVB/PTP readiness
     - CPU/system health
     - Content/share access
   - Each KPI must show a real state, severity, and short next-action sentence

4. Supporting operations band
   - Structured network-access section
   - Architecture summary section
   - Capability summary section
   - These should be subordinate and visually quieter than the first three bands

5. Deep detail handoff band
   - Keep richer embedded components only if they are reframed as expandable or secondary supporting content
   - They should never sit above the primary node and audio summaries

### Mobile / compact tablet

Do not attempt desktop parity. Use a collapsed priority-driven stack:

1. Lead-space summary
2. Node-health tile
3. Audio-readiness tile
4. Two-up or one-up KPI cards
5. Quick actions row
6. Collapsed accordions for network access, architecture, and capabilities

Compact layouts should preserve all critical information, but supporting sections should reduce to summary lines until opened.

## Carbon Component Mapping

- Route shell: Carbon grid/column composition with Carbon spacing tokens only
- Lead-space: `Layer`, `Tag`, `Button`, grouped action buttons
- Primary summaries: `Tile` or `Layer` with status tags and short metadata rows
- KPI band: consistent repeated route-local KPI card component using `Layer`, `Tag`, and explicit helper text
- Network access: structured list or data-table-like presentation with copy actions, not custom clickable cards
- Collapsed mobile sections: `Accordion` / `AccordionItem`
- Async state handling: `InlineLoading`, `InlineNotification`, and explicit empty-state copy

Avoid introducing new bespoke visual systems. The goal is stronger composition and information discipline, not a new theme.

## Direct Action Model

The route should expose direct actions for the operational follow-ups most likely after a first scan:

- Open audio engine
- Open AVB routing
- Open chains
- Open content/library
- Open host machine
- Copy SMB root or copy share path when available

These should be overview shortcuts, not destructive admin controls. Start/stop/restart service actions belong deeper in their dedicated surfaces unless a later requirement explicitly promotes them.

## Content Rules

- Replace generic KPI values such as `Ready`, `Editable`, `Discover`, and `Live` with measured or explicit unavailable states.
- Use sentence-case helper copy that explains why the state matters or what to do next.
- Keep the route voice restrained and operational.
- Avoid decorative capability bragging ahead of node status.
- If data is unavailable, say so plainly and preserve layout stability.

## Required State Handling

The redesigned route must explicitly render:

- network-share loading
- network-share unavailable/disabled
- network-share empty
- network-share fetch failure
- copied-success feedback for share actions
- AVB unavailable/degraded/operational distinctions
- audio daemon offline vs running distinctions

No important section should silently disappear just because data is absent.

## Implementation Direction For Follow-on Tasks

### T131-subB

- Replace the current flex-stack layout with a grid-led shell
- Move architecture/capabilities below the primary status bands
- Introduce route-local section framing and spacing based on Carbon tokens

### T131-subC

- Build four real KPI modules from existing route data sources
- Add severity and next-action messaging per KPI
- Remove placeholder labels entirely

### T131-subD

- Rebuild network access as structured operational content with explicit states
- Add overview quick actions in the lead-space or adjacent actions band
- Reframe architecture/capabilities into quieter supporting sections

### T131-subE

- Update `OverviewPage.test.tsx` to assert:
  - node-health-first hierarchy
  - audio-readiness summary
  - real KPI labels/content
  - quick-action labels
  - network loading/unavailable/empty states
- Re-run:
  - `npm --prefix web run test -- src/app/pages/OverviewPage.test.tsx --runInBand`
  - `npm --prefix web run typecheck`
  - `npm --prefix web run build`

## Anti-goals

- Do not turn `/overview` into a control-room dashboard.
- Do not keep desktop-only sections hidden on compact screens without replacement summaries.
- Do not let supporting architecture or capability widgets outrank node health.
- Do not introduce placeholder KPI language or route-level marketing copy.
