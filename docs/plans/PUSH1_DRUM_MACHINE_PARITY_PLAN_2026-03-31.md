# Push 1 Drum Machine Parity Plan

Date: 2026-03-31
Related task: T605

## Scope

This plan targets Ableton Push 1 style Drum Rack parity for MAP2's drum-machine workflow only.
Included scope:

- Push-driven drum-machine control
- Labs full-screen drum workflow integration
- Snapshot Editor compact drum-machine card integration
- Multi-instance drum-machine support inside snapshot signal chains
- Cluster-wide discovery and banking across eligible drum-machine instances

Explicitly out of scope for this plan:

- Session View parity
- Melodic/scales workflows
- Generic Push parity outside the drum-machine surface
- Automatic device binding without operator assignment

## Current MAP2 Baseline

Relevant existing seams already present in the repo:

- Push surface subsystem with manager, profiles, parser, renderer, pages, simulator, diagnostics, and direct/REST bridge support in `app/services/push_surface/`.
- Persistence-backed drum state and transport service in [app/services/drum_machine_service.py](/home/mm/map2-audio/app/services/drum_machine_service.py).
- Drum sequencer backend in `app/services/drum_sequencer_service.py` and JUCE engine code under `juce-engine/Source/DrumMachine/`.
- Compact Snapshot Editor / JUCE Grid drum plugin card in [web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx](/home/mm/map2-audio/web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx).
- Dedicated full-screen drum workflow in `web/src/app/pages/DrumsPage.tsx`.
- Push surface route/UI already published through `app/routes/push_surface.py` and `web/src/app/pages/PushSurfacePage.tsx`.

## Gap Summary

The platform already has the two big halves of the problem:

1. A generic Push surface subsystem.
2. A drum-machine runtime and UI surface.

The main missing layer is an instance-safe orchestration path between them. Today the Push subsystem is mostly page-driven and device-global, while the drum stack is mostly service-global. True Push 1 drum parity requires the controller to target a specific drum-machine instance, preserve that binding safely across cluster nodes, and expose pad/step/edit operations through a single low-latency command model.

## Target Architecture

### 1. Runtime Ownership Model

Introduce a new `Push Drum Machine Session` runtime object keyed by:

- `device_fingerprint`
- `assignment_role`
- `selected_instance_id`
- `selected_node_id`
- `bank_index`
- `pending_confirmation`

This runtime should live alongside the existing Push surface manager, not inside the drum service singleton. The Push manager remains device-facing. The drum session runtime becomes the controller-to-instance orchestration layer.

### 2. Instance Model

Represent each controllable drum-machine target as a cluster-visible descriptor:

- `instance_id`
- `node_id`
- `snapshot_id`
- `chain_id`
- `plugin_instance_id`
- `display_name`
- `live_state`
- `audible_state`
- `capability_flags`
- `last_seen_at`

This descriptor must be emitted by the backend that already knows snapshot/chain/plugin topology. Do not infer it in the frontend.

### 3. Assignment and Safety Flow

On first detection of a Push-like device, the operator chooses one of:

- `Push Drum Machine`
- `Generic Push Surface`
- `Midi Hub generic controller`
- `Ignore this device`

Persist that assignment cluster-wide by a fingerprint derived from MIDI descriptors. If a second device collides on the same fingerprint, leave it disabled and surface a clear operator warning instead of guessing.

### 4. Command Plane

Add a typed backend command surface specifically for Push drum workflows:

- `select_instance`
- `confirm_instance_switch`
- `trigger_pad`
- `stop_pad`
- `set_pad_velocity_mode`
- `set_64_pad_bank`
- `set_repeat`
- `set_fixed_length`
- `set_quantize`
- `set_loop_selector`
- `set_step`
- `clear_step`
- `set_step_automation`
- `browse_pad_source`
- `load_pad_source`
- `request_surface_state`

This should be a first-class API contract, not a collection of ad hoc service calls. The Push manager publishes intent through this command plane; drum runtimes publish normalized state back.

### 5. State Projection

Expose a normalized Push-consumable state snapshot for the selected instance:

- transport state
- tempo
- pad names/colors/mute/solo/armed/loading state
- current 16-pad window / 64-pad bank
- step-grid state
- repeat/fixed-length/quantize status
- loop selector extents
- automation lane summary
- browser state
- confirmation state

This projection should come from a dedicated adapter so the Push layer does not need to understand raw drum-service internals.

## Backend Work Breakdown

### Reuse As-Is

- MIDI port discovery and profile selection in the Push surface subsystem.
- Push parser/renderer diagnostics and simulation tooling.
- Existing drum transport/state persistence model.
- Existing Labs drum page and compact card entry points.

### Extend Existing Code

- `app/services/push_surface/manager.py`
  - add assignment-aware mode switching and drum-session attachment
- `app/services/push_surface/map2_bridge.py`
  - add drum-instance discovery, selection, confirmation, and state projection endpoints
- `app/services/drum_machine_service.py`
  - split service-global state from per-instance runtime state
- `app/routes/push_surface.py`
  - expose operator assignment, instance banking, and confirmation APIs
- `web/src/app/pages/PushSurfacePage.tsx`
  - add assignment visibility and drum-mode diagnostics

### Net-New Backend Modules

- `app/services/push_surface/drum_runtime.py`
  - device-to-instance orchestration runtime
- `app/services/push_surface/drum_projection.py`
  - normalized Push-facing state payload builder
- `app/services/push_surface/device_assignment_service.py`
  - cluster-wide fingerprint assignment persistence and collision policy
- `app/services/drum_instance_registry.py`
  - authoritative list of cluster-visible drum instances
- `app/services/drum_machine_instances.py`
  - per-instance service facade instead of singleton-global behavior

## UI Integration Model

### Labs / Full Editor

The full drum editor remains the place for deep editing. Push interactions should open or focus the existing drum workflow rather than creating a second full editor.

### Snapshot Editor Card

The compact card remains intentionally compact:

- transport
- current kit / pattern summary
- live status
- `Open Full Editor`

Do not move grid editing onto the card. Push parity belongs in hardware + full editor, not the compact embed.

## Feature Mapping

### Phase 1: Core Attachment and Live Control

- cluster-visible drum instance registry
- Push assignment persistence by fingerprint
- explicit instance banking and selection
- guarded auto-live behavior on selection
- Push-side confirmation flow for risky switches
- pad triggering and transport control

### Phase 2: Drum Rack Performance Parity

- pad browse/load from MAP2 drum library
- 16 velocities mode
- 64-pad navigation
- repeat
- quantize
- fixed length
- loop selector

### Phase 3: Sequencing and Automation Depth

- step-grid editing
- per-step automation entry/edit
- richer display text/status if Push 1 display transport is confirmed safe
- deeper browser metadata and workflow shortcuts

## Risks

- The current drum service shape is still largely singleton-oriented; multi-instance support is the biggest structural change.
- Push 1 display transport remains an implementation risk because the repository explicitly treats parts of that protocol as unverified.
- Cluster-wide instance banking adds safety complexity whenever selection can replace an already-audible remote target.
- Confirmation UX must be satisfiable entirely from hardware, which means the Push command/state model must include explicit pending-action semantics.

## Recommended Next Tasks

1. Land the per-instance backend spine: registry, instance descriptors, and drum runtime facade.
2. Add cluster-wide Push device assignment persistence with fingerprint collision handling.
3. Add the typed Push drum command/state contract, then wire pad transport and instance banking before deeper parity features.

## Validation Strategy

- Backend unit tests for fingerprint assignment, instance registry ordering, and collision policy.
- Push simulator scenarios for instance selection, guarded remote confirmations, and banking.
- Drum runtime tests proving per-instance isolation across multiple snapshot/plugin instances.
- Focused integration tests for the compact drum card and Push Surface page assignment/status rendering.

