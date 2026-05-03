# MIDI Hub → controller-host Absorption Audit (T2459-H5)

**Last updated:** 2026-05-03
**Owner:** T2459-H5 (MIDI Hub v2 absorption into `map2-controller-host`)
**Purpose:** Per-module scope decision for the 30 files in `app/services/midi_hub/`. Each module is classified as **Python stays**, **Host-eligible (Python today, C++ port queued)**, or **Hardware-bound (gate is bench, not code)**. This audit replaces ad-hoc judgment in future H5 slices.

## Classification Rules

A module belongs to **Python stays** when:
- It's database-backed (CRUD on rows in `app/database.py`).
- It's HTTP-facing without an audio-rate hot path (REST handler glue, JSON serialization).
- It owns operator-facing state that has no value being inside the audio process.
- It's a thin adapter to an external service (Tesira TTP, OSC, RTP-MIDI peers).

A module is **Host-eligible** when:
- It runs on the audio-rate hot path (sample-accurate triggers, clock alignment).
- It allocates memory or holds locks that block the audio callback.
- It's the canonical authority for MIDI ingestion (libremidi I/O, port enumeration).
- Moving it into the host process closes a Common Pitfall ("Don't allow multiple MIDI clock masters in the same rig").

A module is **Hardware-bound** when:
- Acceptance requires real hardware traffic (USB MIDI, DIN, AVB-MIDI).
- The Python implementation is already correct; the gate is bench validation.

## Per-Module Audit

| Module | LOC | Classification | Rationale |
|---|---|---|---|
| `__init__.py` | small | Python stays | Re-export surface; trivial. |
| `hub.py` | medium | **Host-eligible** | The `MidiHub` aggregates all subscribers; in the host, this becomes the libremidi observer + shm event-ring producer. Currently routes all MIDI through Python — replace with thin host-client facade once H1's libremidi adapter handles port enumeration in production (already done). |
| `ports.py` | medium | **Host-eligible** (already partly migrated) | T2459-H1 retired the rtmidi enumeration in favour of host's libremidi. The Python `AlsaMidiPort` class today is a host-routed wrapper (iter-85). Full retirement once host owns the entire I/O loop on the bench. |
| `clock_engine.py` | medium | **Host-eligible** | MIDI clock master election + dispatch sits on the audio-rate hot path. Closes the Common Pitfall about multiple clock masters when ported into the host's single process. |
| `recorder.py` | 343 | Python stays | JSON-on-disk persistence of operator recordings. Storage at `~/.map2/midi_hub_recordings/` is correct per Configuration Authority Model (user/operator/session-scoped state). The `_on_message` subscriber callback rides the existing `MidiHub.subscribe()` plumbing — once `hub.py` is host-routed, the recorder picks up events from the host transparently with no recorder code changes. |
| `router.py` | 752 | **Host-eligible** | Routing matrix decisions are RT-relevant (a slow lookup blocks every event); the operator-visible surface stays Python (CRUD on routes), but the dispatch core moves to the host. Today it's already callable from a non-RT context only. |
| `device_registry.py` | 1139 | Python stays | Operator-facing device profiles (the M1/M2 device-pack wiring lives here). Profile registration / lookup / persistence has no audio-rate concern. |
| `event_list_service.py` | medium | Python stays | Event-list authoring + persistence is a UI surface, not a hot path. |
| `gateway.py` | medium | Python stays | RTP-MIDI / network gateway adapter glue. The hot-path MIDI ingestion isn't routed through this module. |
| `cluster_gateway.py` | ~480 | Python stays today / **Host-eligible long-term** | Shipped in T2459-H7. Production C++ port is deferred per H7's completion note ("queued for a future T2459-H sub-task"). |
| `cluster_router.py` | 1046 | Python stays | Cluster routing decisions are not audio-rate. |
| `cluster_clock.py` | 624 | **Host-eligible** | Clock-cluster election is RT-adjacent; same single-master principle as `clock_engine.py`. |
| `inbound_traffic_bridge.py` | medium | Python stays | WS broadcast bridge for the operator UI traffic monitor. Not RT. |
| `macros.py` | medium | Python stays | Operator-authored macros; not RT. |
| `message_mapper.py` | medium | **Host-eligible** | The mapping engine itself is already in the host (T2459-H2 `Map2MappingEngine`). The Python module is the *configuration* surface (CRUD on mapping descriptors); that stays Python, but it routes through the host's mapping engine via `mapping_activate` IPC (T2459-H3 Slice 3 wired this end-to-end). |
| `midi2.py` | 1876 | Mixed: Python stays for MIDI-CI / ProfileNegotiation REST glue + UMP / MIDI 2.0 message types are **Host-eligible** | T2459-H5 Slice 13 shipped the host-side UMP classifier + `pushUmpMessage` test seam. The Python `midi2.py` MIDI-CI session orchestration stays in Python (database-backed); the byte-level UMP I/O lives in the host. |
| `midi_discovery.py` | medium | Python stays | mDNS / network peer discovery. Not RT. |
| `network.py` | 869 | Python stays | RTP-MIDI session orchestration. Hot-path packet handling could move to the host, but the existing implementation is correct and the C++ port is deferred. |
| `osc_namespace.py` | medium | Python stays | OSC ↔ MIDI bridge config + REST surface. |
| `preset_service.py` | 616 | Python stays | DB-backed preset library. |
| `ring_buffer.py` | small | **Host-eligible** | The Python ring buffer was the pre-H1 RT-safety hack. Once `hub.py` is fully host-routed, this becomes dead code. Keep until H5 closeout. |
| `rtp_transport.py` | 613 | Python stays | RTP-MIDI transport. Same call as `network.py`. |
| `scheduler.py` | medium | **Host-eligible** | Sample-accurate scheduling needs to live alongside the audio callback to avoid IPC jitter. Move when host gains a scheduler. |
| `script_engine.py` | medium | **Host-eligible** | The host already runs QuickJS (T2459-B1/B2/H2). The Python module today is a config + CRUD surface; once the host gains a per-script execution context surfaced through IPC, the Python module collapses to a host-client. |
| `string_interface.py` | medium | Python stays | NRPN / aftertouch string-controller adapter. Not RT. |
| `tesira_client.py` | medium | Python stays | Biamp Tesira TTP TCP client. Already an external-service adapter. |
| `traffic_monitor.py` | medium | Python stays | Ring-buffered traffic snapshots for the operator UI. |
| `transforms.py` | 683 | **Host-eligible** | MIDI message transforms (curves, velocity, channel rewrites) are RT. The H4 curve consolidation collapsed the duplicated CurveType definitions onto one canonical `app/midi/curves.py` (Slice 1) — the runtime behavior of `transforms.py` is host-eligible once the mapping engine grows the matching transform primitives in C++. |
| `virtual_gpio.py` | medium | Python stays | Virtual GPIO state mapping + REST surface. Not RT. |

## Summary

| Classification | Modules | LOC ballpark |
|---|---|---|
| **Host-eligible** | hub, ports, clock_engine, router, cluster_clock, message_mapper (UMP slice), ring_buffer, scheduler, script_engine (runtime slice), transforms (runtime slice), midi2 (UMP slice) | ~6,500 |
| **Python stays** | __init__, recorder, device_registry, event_list_service, gateway, cluster_router, inbound_traffic_bridge, macros, message_mapper (config), midi2 (MIDI-CI), midi_discovery, network, osc_namespace, preset_service, rtp_transport, string_interface, tesira_client, traffic_monitor, virtual_gpio, midi2 (CI), script_engine (config), transforms (config) | ~7,800 |
| **Hardware-bound** | (none — every Python module is software-tractable; what's hardware-gated is bench acceptance, not the modules themselves) | 0 |

**Total:** ~14,530 LOC across 30 files. About 45% is host-eligible (the RT path); 55% is Python-stays (config / DB / REST).

## What Each Remaining H5 Slice Should Touch

| Slice | Scope | Modules |
|---|---|---|
| H5 next: **clock-master election in host** | Move single-master election logic into host process (closes Common Pitfall) | `clock_engine.py`, `cluster_clock.py` |
| H5 next: **transforms in host** | Replicate curve / velocity / channel-rewrite primitives in C++ alongside `Map2MappingEngine` | `transforms.py` |
| H5 next: **scheduler in host** | Sample-accurate scheduler in the host's main loop | `scheduler.py` |
| H5 deferred: **router core in host** | Move dispatch core; keep CRUD in Python | `router.py` |
| H5 deferred: **MIDI 2.0 / UMP HIL** | Hardware-gated on libremidi UMP-capable build + a real MIDI 2.0 device | (no Python module change needed — host-side already plumbed) |
| H5 closeout: **delete `ring_buffer.py`** | Once `hub.py` is fully host-routed | `ring_buffer.py` |

## What This Audit Does NOT Cover

- **Per-route deletion plan for `app/routes/midi_*.py`**: tracked separately under H5 Slices 11+12 (deprecated mounts + `MAP2_MIDI_LEGACY_RETIRED` 410-Gone gate, both shipped 2026-04-28).
- **HIL acceptance gates** for H3/H4: tracked in `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h*` (pending bench access).
- **C++ porting effort estimates**: each Host-eligible module's actual port effort depends on the IPC contract additions needed; queued as separate per-slice estimates rather than in this audit.

## Cross-References

- Worklist: `docs/PROJECT_WORKLIST.md` — T2459-H, T2459-H1..H7 entries
- Architecture: `docs/midi/MIDI_BACKEND.md`, `docs/midi/MIDI_HUB_ARCHITECTURE.md`
- Cluster wire spec: `docs/midi/CLUSTER_MIDI_PROTOCOL.md` (T2459-H7 shipped)
- Retirement runbook: `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` (T2459-H6)
- Configuration Authority Model: `docs/architecture/CONFIGURATION_AUTHORITY_MODEL.md`
