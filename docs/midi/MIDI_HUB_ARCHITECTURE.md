# MAP2 Native MIDI Hub Architecture

Date: 2026-03-19  
Canonical tasks: `T203-subA` through `T203-subI`

## Scope

This document defines the shipped MIDI Hub v2 architecture across:

- Backend services under `app/services/midi_hub/`
- API routes in `app/routes/midi_hub.py`
- Routed frontend shell and area pages under `web/src/app/pages/MidiHubShell.tsx` and `web/src/app/pages/midi-hub/*`

## Frontend Route Architecture

The canonical operator entry point is `/midi-hub`, implemented as a sidebar-routed shell with deep-linkable child routes:

- `/midi-hub/connections`
- `/midi-hub/presets`
- `/midi-hub/transport`
- `/midi-hub/events`
- `/midi-hub/processing`
- `/midi-hub/network`
- `/midi-hub/lab`

Shared route infrastructure:

- `MidiHubShell.tsx`
  - Sidebar navigation
  - Theme/layout ownership
  - Persistent bottom status bar
- `MidiHubAreaLayout.tsx`
  - Shared hero frame, tag row, and route scroll persistence
- `midiHubNavStore.ts`
  - Per-route scroll state and panel navigation continuity

## Backend Service Topology

### Core routing and transport

- `hub.py`
  - Central MIDI message bus and subscriber dispatch
- `router.py`
  - Route graph, routing rules, transform execution, and destination fanout
- `traffic_monitor.py`
  - Snapshot, stats, and export for message telemetry
- `network.py`
  - RTP/UDP sessions
  - OSC server/client bridge
  - Mesh peer routing
  - `/map2/*` namespace packet ingress and implicit-output fanout
- `osc_namespace.py`
  - Hierarchical `/map2/*` address router
  - Current-value catalog for the namespace browser
  - Implicit output event log and dispatch feedback

### Show-control services

- `preset_service.py`
  - Preset snapshots
  - Default preset and program-change slots
  - Preset chains and timed chain traversal
- `event_list_service.py`
  - Event lists
  - Cue/event execution
  - Learn mode capture
  - MSC message generation
- `clock_engine.py`
  - BPM state
  - Start/stop/continue/tap transport controls
- `recorder.py`
  - MIDI capture, playback, and export

### Processing and automation

- `script_engine.py`
  - Python scripting runtime and console capture
- `macros.py`
  - Trigger/action bundles across routing and preset workflows
- `scheduler.py`
  - Delayed and absolute-time MIDI event scheduling
- `midi2.py`
  - MIDI-CI discovery
  - Property exchange state
  - UMP translation helpers

### Device and protocol integration

- `tesira_client.py`
  - In-memory Tesira Text Protocol facade
  - Alias browser, command history, subscriptions, preset actions
- `virtual_gpio.py`
  - 12 virtual inputs
  - 12 virtual outputs
  - State/event tracking
- `string_interface.py`
  - UDP-style string-command configuration and logging
- `device_registry.py`
  - Device inventory
  - Shadow state and drift logging

## Network and Protocol Architecture

The Network area is now a composite of six protocol surfaces:

- RTP-MIDI sessions
- OSC bridge
- `/map2/*` namespace browser and direct dispatch
- MIDI 2.0 workspace
- Tesira TTP integration
- Virtual GPIO
- String interface

### OSC namespace flow

1. OSC UDP packet arrives at `MidiNetworkBridge`.
2. If the address starts with `/map2/`, the bridge dispatches to `OscNamespaceRouter`.
3. The namespace router calls the owning service:
   - clock
   - presets/chains
   - event lists/cues
   - macros
   - GPIO
   - plugin state placeholder store
4. Namespace side effects emit implicit output events.
5. The bridge fans those implicit outputs back to known OSC clients and exposes the same history to the frontend browser.

Legacy non-namespace OSC mappings still use the earlier address-to-MIDI translation table and continue to coexist with the namespace router.

## Lab Architecture

The Lab area no longer uses one monolithic innovation panel. It is split into three Carbon panels:

- `AiLearnPanel.tsx`
  - AI-assisted mapping suggestions
  - Carbon `AILabel`
  - Confidence `ProgressBar`
- `MeshNetworkPanel.tsx`
  - Peer CRUD
  - Mesh forwarding toggle
  - Route-publication workflow
- `DeviceShadowPanel.tsx`
  - Shadow-state sync
  - Drift-event review
  - Severity-tagged table

## Test and Validation Model

Dedicated page tests now exist for all active MIDI Hub area pages:

- `MidiHubConnectionsPage.test.tsx`
- `MidiHubPresetsPage.test.tsx`
- `MidiHubTransportPage.test.tsx`
- `MidiHubEventsPage.test.tsx`
- `MidiHubProcessingPage.test.tsx`
- `MidiHubNetworkPage.test.tsx`
- `MidiHubLabPage.test.tsx`

Dedicated backend service tests exist for new protocol and integration services:

- `tests/test_tesira_client.py`
- `tests/test_virtual_gpio.py`
- `tests/test_string_interface.py`
- `tests/test_osc_namespace.py`

## Remaining Non-Architectural Work

- Real Tesira hardware validation remains tracked separately under `T203-subK`.
- Documentation/conformance rollup remains under `T203-subJ`.
