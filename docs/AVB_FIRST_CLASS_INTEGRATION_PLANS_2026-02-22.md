# AVB First-Class Integration Plans

Date: 2026-02-22
Owner: MAP2 AVB Engine + Backend API + Web UI
Scope: Non-hardware implementation and automated validation only

## Baseline Already in Place

- AVB router, endpoint inventory, and connection APIs exist under `/api/avb/router/*`.
- AVB status and device inventory APIs exist under `/api/avb/status` and `/api/avb/devices`.
- AVB routing GUI exists at `/avb-routing` with topology, matrix, and inspector surfaces.
- JUCE AVB and AVDECC bindings exist through `juce-engine/Source/PythonBindings.cpp` and `Map2AudioEngine` AVB APIs.
- Canonical remaining backlog already tracks readiness, channel capability, and web/API hardening as `T036`, `T037`, `T038`.

## Plan 1: Runtime Convergence and Truthful Status

Objective: Make AVB status consistent across JUCE, API, and all GUIs, with graceful no-AVB behavior.

### Workstreams

1. JUCE and backend readiness convergence
- Implement one canonical readiness model with states: `enabled`, `configured`, `operational`, `degraded`.
- Replace fragmented checks with shared evaluator consumed by `/api/avb/status`, `/api/avb/devices`, and AVB service gating.
- Align interface source precedence: config store, persisted AVB marker metadata, env override.

2. API reliability and lifecycle correctness
- Bind AVB router discovery/cleanup startup and shutdown to FastAPI lifespan.
- Add health counters for discovery loop state and endpoint counts by source.
- Return deterministic JSON error envelopes for unavailable AVB stack paths.

3. GUI status unification and graceful fallback
- Add shared AVB status model in web state so all AVB views render from the same contract.
- Replace raw JSON parse failures with actionable diagnostics (proxy/static mismatch, non-JSON API response).
- If AVB is absent, show explicit degraded cards and disabled actions (not stack traces).

### Acceptance Criteria (No Hardware)

- `/api/avb/status` and `/api/avb/devices` report coherent availability states in all simulated states.
- No AVB GUI shows raw parser exceptions; each failure state includes operator remediation text.
- Startup and shutdown tests verify router loop lifecycle wiring.

### Dependencies

- Delivers and closes: `T036`, `T038`
- Enables: `T037` and deep signal-chain integration

## Plan 2: AVB as First-Class Signal-Chain I/O

Objective: Treat AVB inputs/outputs like native chain I/O endpoints throughout engine, API, and UI.

### Workstreams

1. JUCE capability surface for chain-level routing
- Expose canonical AVB channel capabilities from JUCE/AVDECC descriptors:
  - `local_inputs[]`, `local_outputs[]`, `avb_talkers[]`, `avb_listeners[]`
- Remove synthetic defaults when authoritative descriptor data exists.
- Preserve explicit unknown values when data is not yet discoverable.

2. Management API unification
- Add canonical endpoint `GET /api/avb/capabilities/channels`.
- Refactor `/api/audio/ports` to consume canonical capability model (or strict adapter).
- Add signal-chain route semantics so AVB endpoints can be selected in chain input/output assignment APIs.

3. GUI chain integration
- Extend chain editor and routing controls to include AVB endpoints in source/sink pickers.
- Surface channel counts, sample rates, format, ownership, and availability in chain UX.
- Add preflight validation warnings for incompatible channel count or sample-rate mismatches.

### Acceptance Criteria (No Hardware)

- Capability endpoint returns deterministic schema in mocked JUCE/AVDECC states.
- AVB endpoints appear in chain source/sink selectors and are persisted in chain payloads.
- Audio ports and AVB routing views reflect the same channel counts and directionality.

### Dependencies

- Depends on: Plan 1 readiness/status convergence
- Delivers and closes: `T037`

## Plan 3: Unified Routing Studio and Operations-Grade AVB UX

Objective: Provide one coherent GUI for all routing concepts plus fleet-visible AVB health across management views.

### Workstreams

1. Unified routing studio GUI
- Build a dedicated routing studio view that combines:
  - Node topology graph (MAP2 + AVDECC entities)
  - Talker/listener matrix
  - Signal-chain mapping panel (chain input/output to AVB endpoints)
  - Connection lifecycle timeline (connect, admit, create, start, rollback)
- Make all edits transactional with explicit dry-run validation and rollback messaging.

2. Global AVB health surfaces across GUI
- Add an AVB status widget to main dashboard/header with canonical runtime states.
- Add AVB section to node/engine health pages with readiness, PTP lock, TSN/qdisc state, and stream counts.
- Keep all pages resilient when AVB is disabled or unavailable.

3. Operations and diagnostics UX
- Add guided troubleshooting panel linked to known remediation actions.
- Expose per-connection trace IDs and stream health counters in inspector/detail panes.
- Add exportable diagnostics bundle metadata (JSON summary for incident handoff).

### Acceptance Criteria (No Hardware)

- Routing studio can represent and validate all existing routing concepts from current requirements.
- Dashboard, AVB routing, and chain management surfaces all consume the same AVB status contract.
- Operator can complete route create/change/remove workflows with deterministic feedback and no hidden state drift.

### Dependencies

- Depends on: Plan 1 and Plan 2
- Drives follow-on release readiness for deferred hardware qualification (`T007`, `T017`)

## Recommended Execution Order

1. Plan 1 (stabilize truth and lifecycle)
2. Plan 2 (first-class chain I/O integration)
3. Plan 3 (unified studio and full GUI ops integration)

This order minimizes rework and keeps each GUI change grounded on stable contracts.
