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

## Recorder golden parity (T2459-H5 Slice 13)

The MIDI recorder (`app/services/midi_hub/recorder.py`) writes per-session
JSON artifacts under `Map2Paths.midi_hub_recordings_dir()`. The on-disk
shape — `session_id` / `name` / wall-clock timestamps / per-event
`timestamp_ns` / `source_port` / `destination_port` / `raw_hex` /
`metadata` — is locked: callers across the platform (recorder UI, SMF
exporter, snapshot replay) depend on it.

T2459-H5 migrates the recorder's input from the pre-H1 Python hub
subscriber path onto the host-owned path (events arrive over the IPC
surface from `map2-controller-host`). The locked artifact format must
survive that move byte-for-byte.

Parity is enforced by `tests/test_midi_recorder_golden_parity_t2459h5.py`:
two `MidiRecorder` instances (one driven by the legacy in-process hub
subscriber callback, one by the same `MidiMessage` payloads relifted
from the host-owned IPC shape) record an identical event sequence under
a pinned wall clock; the two persisted JSON blobs are compared
byte-for-byte. Per-event timestamps are passed through unchanged so the
artifact bytes remain deterministic.

Per-event `timestamp_ns` is preserved end-to-end: the host pushes the
producer-side `monotonicNanos()` into the shm slot's `tsNanos` field
(see `juce-engine/Source/ControllerHost/EventRing/ShmEventRing.h`), the
host's IPC consumer relays it as the `MidiMessage.timestamp_ns` the
recorder sees. No clock translation, no floating-point drift.
