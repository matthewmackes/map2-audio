# Biamp Tesira Forte CI Full-Stack Replacement Platform Specification

> **Full-stack replacement platform for the Biamp Tesira Forte CI and related family devices within MAP2 Audio.**
>
> This specification covers frontend, backend, APIs, state models, device integration, AVB modeling, signal diagrams, diagnostics, and delivery planning. It is implementation-ready — a capable engineering team can begin building directly from this document.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Manufacturer Tool Analysis](#2-manufacturer-tool-analysis)
3. [Current System Analysis](#3-current-system-analysis)
4. [Target Architecture](#4-target-architecture)
5. [Domain Model](#5-domain-model)
6. [Capability Model](#6-capability-model)
7. [State Model](#7-state-model)
8. [AVB-First Architecture](#8-avb-first-architecture)
9. [Information Architecture](#9-information-architecture)
10. [Screen-by-Screen UI Specification](#10-screen-by-screen-ui-specification)
11. [Component System](#11-component-system)
12. [Backend Service Design](#12-backend-service-design)
13. [Device Integration Layer](#13-device-integration-layer)
14. [API Design](#14-api-design)
15. [Extended API Support Plan](#15-extended-api-support-plan)
16. [Realtime Model](#16-realtime-model)
17. [Diagnostics and Observability](#17-diagnostics-and-observability)
18. [Signal and Block Diagram Model](#18-signal-and-block-diagram-model)
19. [Workflow Definitions](#19-workflow-definitions)
20. [Persistence and Storage](#20-persistence-and-storage)
21. [Security and Safety](#21-security-and-safety)
22. [Migration and Replacement Plan](#22-migration-and-replacement-plan)
23. [Testing Strategy](#23-testing-strategy)
24. [Performance and Scalability](#24-performance-and-scalability)
25. [Delivery Roadmap](#25-delivery-roadmap)
26. [Final Implementation-Ready Specification](#26-final-implementation-ready-specification)

---

## 1. Product Vision

### Mission

Replace the Biamp Tesira Software desktop application as the primary management and control interface for Tesira Forte CI (and family) devices, fully integrated within the MAP2 Audio Platform. Tesira devices become first-class citizens in the MAP2 audio chain — not a bolt-on.

### Audience

| Role | Needs |
|------|-------|
| **Operator** | Recall presets, monitor levels, bypass/unmute, basic routing |
| **Integrator** | Configure fleet, wire AVB streams, create effects loops, set up interlock rules |
| **Technician** | Diagnose faults, inspect PTP sync, verify AVB stream health, probe DSP blocks |
| **Advanced user** | Script via API, automate preset changes, export diagnostics, build custom workflows |

### Goals

- **Full feature parity** with existing Tesira integration (100% keep existing backend services)
- **Runtime DSP introspection** — discover and control Tesira DSP blocks without requiring Windows Tesira Software
- **Unified routing** — MAP2 signal chains and Tesira DSP paths visible in one signal flow
- **AVB as first-class citizen** — stream health, PTP topology, routing matrix for all AVB devices
- **Automation-ready API** — every operation available via REST + WebSocket for external integration
- **Family-wide support** — model-aware capability system for Forte CI, VI, DAN, TI, SERVER, SERVER-IO

### Parity Commitment

- All operational and integrator-facing capabilities available in Biamp Tesira Software must be mirrored in MAP2.
- Where proprietary file formats or undocumented compiler workflows prevent direct file-level parity, MAP2 provides equivalent native workflows (runtime discovery, editable canvas, parameter orchestration, scene snapshots, validation gates).
- Biamp Tesira Software remains migration fallback only, not a required day-to-day dependency once rollout phases complete.

### Non-Goals

- Direct read/write of proprietary `.tsc` design files as an implementation mechanism
- Firmware update execution (requires Biamp Tesira Software; MAP2 monitors version only)
- Direct ALSA/JACK audio processing of Tesira I/O (all audio transport is AVB)

### Quality Bar

The platform must feel like a **manufacturer-grade operational environment** — not a demo, dashboard, or thin wrapper. Every screen must show real device state, every action must provide feedback, and every error must be actionable.

---

## 2. Manufacturer Tool Analysis

### Biamp Tesira Software — Capabilities

| Feature | Tesira Software | MAP2 Current | MAP2 Target |
|---------|----------------|-------------|-------------|
| Visual DSP block editor | Full drag-and-drop design | Limited tab controls only | MAP-native editable canvas + runtime declaration/probing (no `.tsc` dependency) |
| Block-level DSP control | All parameters | Level, mute, crosspoint, EQ freq | All discoverable parameters |
| Multi-partition programming | Up to 4 DSP partitions | Device-level only | Device-level (adequate) |
| Device discovery | Automatic via proprietary protocol | mDNS + port-61451 scan | Same (proven effective) |
| Firmware update | Full update workflow | Version check only | Version check + URL guidance |
| Preset management | Create/edit/recall | List + recall only | List + recall + scene snapshots |
| AEC tuning | Specialized UI | Not implemented | Parametric controls via TTP |
| Room combining | Multi-room partition logic | Not implemented | Crosspoint matrix + presets |
| AVB stream management | Basic stream list | Full stream enumeration | Full + health + routing matrix |
| GPIO control | Read/write with logic blocks | Not implemented | GPIO read/write via TTP |
| Metering | Basic level display | Real-time TTP subscriptions | Real-time + history + peak tracking |
| Multi-user access | Single-user desktop | Web-based multi-client | Web-based multi-client |
| API for automation | None | REST + WebSocket (30+ endpoints) | REST + WebSocket (45+ endpoints) |
| Effects loop integration | Not applicable | Full effects loop builder | Full + signal chain insertion |

### Patterns to Preserve (from Tesira Software)

- **Instance tag naming conventions**: `LevelControl1`, `Mixer1`, `PEQ1`, etc. — MAP2 uses these directly via TTP
- **1-based preset indexing**: Tesira presets are 1-indexed; MAP2 already matches this
- **Channel numbering**: 1-based in TTP commands; MAP2 wraps to 0-based internally where needed
- **Device identity model**: hostname + serial + model + firmware version — MAP2's `TesiraDeviceInfo` matches

### Patterns to Improve

| Tesira Software Weakness | MAP2 Improvement |
|--------------------------|-----------------|
| Desktop-only (Windows) | Web-based, any browser |
| No real-time metering in routing matrix | WebSocket-driven live meters everywhere |
| No API for automation | Full REST + WebSocket API |
| No multi-user concurrent access | Multiple browser clients, WS broadcast |
| No preset interlock with external systems | MAP2 preset ↔ Tesira preset interlock (DB-backed) |
| No effects loop routing across AVB | Full AVB effects loop builder with calibration |
| Single-device focus | Fleet management for up to 16 devices |
| No PTP monitoring | PTP topology visualization with offset tracking |

---

## 3. Current System Analysis

### Backend Architecture (KEEP — proven production code)

```
app/services/tesira/
├── __init__.py                  # Singleton accessors
├── ttp_client.py                # Async TCP TTP client (391 lines)
│   └── TTPClient: connect, disconnect, send, subscribe, unsubscribe, on_push
│   └── TTPResponse: ok, value, error_code, error_detail, raw
├── tesira_device.py             # High-level device wrapper (462 lines)
│   └── TesiraDevice: level, mute, crosspoint, EQ, presets, AVB streams, PTP, metering, faults
│   └── TesiraDeviceInfo, TesiraStreamInfo, TesiraPresetInfo, TesiraMeterValue
├── tesira_fleet.py              # Fleet manager, 5 devices (406 lines)
│   └── TesiraFleet: start, stop, get_device, list_devices, is_healthy
│   └── Background: PTP poll (1s), offline retry (30s), metering push
├── discovery.py                 # mDNS + port-61451 scan (525 lines)
│   └── TesiraDiscoveryService: start_scan, get_status, adopt_device
├── ptp_coordinator.py           # PTP priority arbitration (179 lines)
│   └── TesiraPTPCoordinator: demotes MAP2 priority when Tesira is master
├── preset_interlock.py          # MAP2→Tesira preset sync (200 lines)
│   └── TesiraPresetInterlock: on_preset_loaded_event, add_rule, remove_rule
├── firmware_service.py          # Biamp release notes scraper
│   └── TesiraFirmwareService: get_latest_version, compare_versions
└── port61451_probe.py           # Experimental TTP enable probe
    └── probe_and_enable_ttp: attempt Telnet enable via undocumented port
```

### Routes (app/routes/tesira.py — ~30 endpoints)

| Category | Endpoints | Status |
|----------|-----------|--------|
| Fleet management | GET/POST devices, connect, disconnect, reboot, reconnect | Complete |
| Level control | GET/PUT level, mute per channel per instance tag | Complete |
| Crosspoint matrix | PUT crosspoint gain | Partial (missing mute, matrix read) |
| Parametric EQ | PUT freq per band | Partial (missing gain, Q, band read) |
| Presets | GET list, POST recall | Complete |
| AVB streams | GET streams, GET PTP | Complete |
| Metering | GET snapshot, POST start/stop subscription | Complete |
| Faults | GET fault list | Complete |
| Preset interlock | GET/POST/DELETE rules | Complete |
| Discovery | POST start, GET status, POST adopt, POST manual add | Complete |
| Firmware | GET latest, GET device status | Complete |

### Frontend (web/src/app/components/Tesira/ — 21 files)

| Component | Lines | Status | Notes |
|-----------|-------|--------|-------|
| TesiraApp.tsx | 56 | Complete | Root container |
| TesiraPage.tsx | ~40 | Complete | Branded theme (#E31837) |
| TesiraControlPanel.tsx | ~200 | **Needs refactor** | Tab-based → route-based |
| TesiraLevelsTab.tsx | ~300 | Complete | Per-channel gain + mute |
| TesiraMixerTab.tsx | ~250 | **Needs enhancement** | No interactive grid |
| TesiraEQTab.tsx | ~200 | **Needs enhancement** | No visual curve |
| TesiraPresetsTab.tsx | ~250 | Complete | Preset list + recall + interlock rules |
| TesiraAvbTab.tsx | ~150 | **Needs enhancement** | Simple table, needs health indicators |
| TesiraFaultsTab.tsx | ~100 | Complete | Fault list display |
| TesiraFirmwareTab.tsx | ~150 | Complete | Version check + update guidance |
| TesiraLoopBuilderTab.tsx | 850 | Complete | **Not wired into ControlPanel tabs** |
| TesiraDeviceCard.tsx | ~100 | Complete | Device status badge |
| TesiraDeviceHeader.tsx | ~80 | Complete | Hostname, serial, connection |
| TesiraFleetPanel.tsx | ~150 | Complete | Device list sidebar |
| TesiraTopBar.tsx | ~60 | Complete | Breadcrumb + PTP badge |
| DiscoveryDialog.tsx | ~200 | Complete | mDNS scan UI |
| ManualAddDialog.tsx | ~100 | Complete | IP + port form |
| TesiraContext.tsx | ~80 | **Needs extension** | Add DSP block state |
| useTesiraApi.ts | ~300 | **Needs extension** | Add DSP/GPIO/scene queries |
| useTesiraWebSocket.ts | ~100 | Complete | Metering + device state + PTP |

### C++ Layer (KEEP — no changes needed)

- `TesiraAvbNode.h/cpp`: RT-safe per-channel gain/mute for 5 devices × 128 channels, lock-free atomics, metering ring buffer
- `AvdeccController.h/cpp`: la_avdecc v4.3.1.1 wrapper, entity discovery, ACMP connect/disconnect, AECP stream format
- `Map2AudioEngine`: AVB stream lifecycle (create/start/stop/delete), 256-sample AVTP packets

### AVB Python Services (KEEP — extend)

- `avb_router.py`: N-to-M routing matrix with Tesira endpoint registration
- `avb_discovery.py`: mDNS for MAP2 nodes
- `aem_cache.py`: SQLite LRU cache for AVDECC entity models
- `readiness.py`: System readiness (disabled→enabled→configured→degraded→operational)
- `ptp_monitor.py`: gPTP status via pmc/journalctl
- `srp_admission.py`: Stream reservation protocol
- `tsn_qdisc.py`: CBS/TAS traffic shaping

### Identified Gaps

| Gap | Impact | Phase |
|-----|--------|-------|
| No DSP block discovery | Cannot control most Tesira DSP blocks | Phase 1 |
| EQ routes missing gain/Q | Incomplete EQ control | Phase 1 |
| Crosspoint missing mute + matrix read | Limited mixer control | Phase 1 |
| No GPIO endpoints | Cannot read/write GPIO | Phase 1 |
| No metering history | No trend analysis | Phase 1 |
| No bulk parameter operations | Slow multi-param updates | Phase 1 |
| Tab-based navigation | Siloed experience | Phase 2 |
| LoopBuilder not wired into UI | Users can't find it | Phase 2 |
| No DSP block explorer | Cannot browse/control DSP | Phase 2 |
| No interactive mixer grid | Poor mixer UX | Phase 2 |
| No visual EQ curve | Poor EQ UX | Phase 2 |
| AVB tab is simple table | No stream health visibility | Phase 3 |
| No Tesira-to-Tesira routing | Multi-unit installs limited | Phase 3 |
| No PTP topology view | PTP issues hard to diagnose | Phase 3 |
| No SSH TTP transport | Configured units with Telnet disabled | Phase 4 |
| No reverse preset sync | Drift undetected | Phase 4 |
| No scene snapshots | No DSP state backup/recall | Phase 4 |

---

## 4. Target Architecture

### Service Boundary Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                    │
│                                                           │
│  /tesira ─────── Fleet Overview (device cards + health)   │
│  /tesira/:id ─── Device Dashboard + sub-route views       │
│  /avb-routing ── Unified AVB Routing Matrix               │
│  /audio-engine ─ GridFlow (chain + Tesira insertion)      │
│                                                           │
│  State: React Query (server) + TesiraContext (client)     │
│  Realtime: WebSocket subscriptions                        │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP + WebSocket
┌───────────────────────┴─────────────────────────────────┐
│                  FastAPI Backend (Python)                  │
│                                                           │
│  Routes:                                                  │
│  ├── app/routes/tesira.py          (existing + extended)  │
│  ├── app/routes/tesira_dsp.py      (NEW: block ops)       │
│  └── app/routes/avb.py             (existing + extended)  │
│                                                           │
│  Services:                                                │
│  ├── tesira/ttp_client.py          (existing)             │
│  ├── tesira/ttp_ssh_client.py      (NEW)                  │
│  ├── tesira/tesira_device.py       (existing + extended)  │
│  ├── tesira/tesira_dsp_model.py    (NEW)                  │
│  ├── tesira/tesira_fleet.py        (existing + extended)  │
│  ├── tesira/tesira_metrics.py      (NEW)                  │
│  ├── tesira/capabilities.py        (NEW)                  │
│  ├── tesira/discovery.py           (existing)             │
│  ├── tesira/ptp_coordinator.py     (existing)             │
│  ├── tesira/preset_interlock.py    (existing + extended)  │
│  ├── tesira/firmware_service.py    (existing)             │
│  ├── tesira/port61451_probe.py     (existing)             │
│  └── avb/*                         (existing + extended)  │
│                                                           │
│  Persistence:                                             │
│  ├── SQLite (existing: interlock rules, loop templates)   │
│  └── SQLite (NEW: block declarations, scene snapshots)    │
│                                                           │
│  Config: ~/.map2/config.json (tesira.* keys)              │
└───────────────────────┬─────────────────────────────────┘
                        │ pybind11
┌───────────────────────┴─────────────────────────────────┐
│                  JUCE C++ Audio Engine                     │
│                                                           │
│  ├── TesiraAvbNode.h/cpp     (RT-safe gain/mute/meter)   │
│  ├── AvdeccController.h/cpp  (la_avdecc v4.3.1.1)        │
│  └── Map2AudioEngine         (AVB stream lifecycle)       │
│                                                           │
│  No changes required — existing design is adequate.       │
└─────────────────────────────────────────────────────────┘
```

### Key Architecture Decisions

**D1: DSP Block Model via Runtime Discovery**
MAP2 does not depend on `.tsc` file parsing. The `TesiraDspModel` service probes standard Tesira block naming conventions (`LevelControl{1..N}`, `Mixer{1..N}`, `PEQ{1..N}`, etc.) using TTP `get` commands. Users can also manually declare blocks. Results persist in the `TesiraBlockDeclaration` database table and drive a MAP-native editable DSP canvas.

**D2: SSH TTP Transport**
`TTPSSHClient` (asyncssh) provides TTP over SSH for devices where Telnet is disabled. `TesiraDevice` auto-selects transport: Telnet (port 23) first, SSH (port 22) fallback. Same API surface as `TTPClient`.

**D3: Route-Based Navigation**
Tab-based `TesiraControlPanel` replaced with React Router sub-routes:
- `/tesira` → Fleet overview
- `/tesira/:id` → Device dashboard
- `/tesira/:id/dsp` → DSP block explorer
- `/tesira/:id/levels|mixer|eq|presets|loops|faults|settings`

**D4: AVB Unification**
Tesira-to-Tesira routing visible in the existing AvbRouting matrix. Stream health indicators in device views. PTP topology visualization across all fleet devices + MAP2.

**D5: Visibility-Gated Polling**
Apply existing `useRealtimePollingGating` hook to Tesira queries. Stop React Query polling when components are not visible (using `document.hidden`). WebSocket-driven for metering (existing pattern).

---

## 5. Domain Model

### Entity Relationship Diagram

```
TesiraFleet (1) ──────── (N) TesiraDevice
TesiraDevice (1) ─────── (N) TesiraDspBlock
TesiraDevice (1) ─────── (N) TesiraStreamInfo (AVB)
TesiraDevice (1) ─────── (N) TesiraPresetInfo
TesiraDevice (1) ─────── (1) TesiraCapabilities
TesiraDevice (1) ─────── (N) TesiraSceneSnapshot

TesiraDspBlock (1) ───── (N) TesiraParam

TesiraDevice (N) ─────── (N) AudioEndpoint (via AvbRouter)
AudioEndpoint (N) ─────── (N) StreamConnection (routing matrix)

TesiraInterlockRule (N) → TesiraDevice + MAP2 Preset
TesiraLoopTemplate (N) → TesiraDevice
```

### Core Entities

#### TesiraDevice (extends existing `TesiraDeviceInfo`)

```python
@dataclass
class TesiraDeviceInfo:
    # Existing fields (keep):
    hostname: str
    serial_number: str
    firmware_version: str
    mac_address: str
    model: str
    ip_address: str

    # New fields:
    model_family: TesiraModelFamily   # Derived from model string
    transport: str                     # "telnet" | "ssh"
    capabilities: TesiraCapabilities   # Static lookup by model
```

**Lifecycle**: Configured → Connected → (Operational | Offline | Reconnecting)
**Identity**: `device_id = f"tesira_{serial_number}"` (existing pattern)

#### TesiraDspBlock (NEW)

```python
@dataclass
class TesiraDspBlock:
    block_id: str          # Instance tag, e.g. "LevelControl1"
    block_type: str        # "level_control" | "mixer" | "router" | "peq" | etc.
    channel_count: int     # Number of channels this block handles
    parameter_map: Dict[str, TesiraParam]  # Discovered parameters
    is_probed: bool        # Whether TTP probing has been attempted
    is_user_declared: bool # User manually added vs auto-discovered
    last_probed_at: Optional[datetime]
```

**Lifecycle**: Undiscovered → Probing → Discovered | Partial
**Block types**: `level_control`, `mixer`, `router`, `peq`, `geq`, `fbd_eq`, `compressor`, `limiter`, `gate`, `ducker`, `leveler`, `anc`, `delay`, `aec`, `noise_reduction`, `crossover`, `source_selector`, `room_combiner`, `logic_state`, `command_string`, `tone_generator`, `noise_generator`, `measurement`, `avb_in_stream`, `avb_out_stream`

#### TesiraParam (NEW)

```python
@dataclass
class TesiraParam:
    name: str              # TTP attribute name, e.g. "level", "mute", "frequency"
    value_type: str        # "float" | "bool" | "int" | "string" | "array"
    current_value: Any     # Last known value
    min_value: Optional[float]
    max_value: Optional[float]
    step: Optional[float]
    unit: str              # "dB", "Hz", "ms", "%", ""
    is_subscribable: bool  # Can use TTP SUBSCRIBE for live updates
```

#### TesiraCapabilities (NEW)

```python
@dataclass
class TesiraCapabilities:
    analog_inputs: int
    analog_outputs: int
    usb_channels: int       # Bidirectional USB audio channels
    avb_max_channels: int   # Maximum AVB stream channels
    aec_channels: int       # Channels with AEC support
    gpio_count: int         # Bidirectional GPIO pins
    rs232: bool
    dsp_partitions: int
    has_dante: bool
    has_avb: bool
```

#### TesiraSceneSnapshot (NEW)

```python
@dataclass
class TesiraSceneSnapshot:
    scene_id: str           # UUID
    device_id: str
    name: str
    block_states: Dict[str, Dict[str, Any]]  # {instance_tag: {param: value, ...}}
    created_at: datetime
```

**Lifecycle**: Create (capture all block params) → Store → Recall (write all params back)

#### AudioEndpoint (existing in avb_router.py)

```python
@dataclass
class AudioEndpoint:
    endpoint_id: str
    device_type: str        # "map2" | "tesira" | "avdecc"
    entity_id: str          # AVDECC entity ID or synthesized
    direction: str          # "talker" | "listener"
    node_id: str            # device_id for grouping
    host: str
    channels: int
    sample_rate: int
    available: bool
```

#### StreamConnection (existing in avb_router.py)

```python
@dataclass
class StreamConnection:
    talker: AudioEndpoint
    listener: AudioEndpoint
    state: str              # "disconnected" | "connecting" | "connected" | "disconnecting" | "error"
    connection_role: str    # "effects_loop_send" | "effects_loop_return" | "general_route"
    loop_id: Optional[str]
```

---

## 6. Capability Model

### Device Family Registry

| Model String | Family | Analog In | Analog Out | USB | AVB | AEC | GPIO | Dante |
|-------------|--------|-----------|------------|-----|-----|-----|------|-------|
| `TesiraFORTE CI` | FORTE_CI | 12 mic/line | 8 line | 8×8 | 32×32 | 12 | 4 | No |
| `TesiraFORTE VI` | FORTE_VI | 4 mic/line + VoIP | 4 + VoIP | 8×8 | 32×32 | 4 | 4 | No |
| `TesiraFORTE DAN CI` | FORTE_DAN | 12 mic/line | 8 line | 8×8 | 0 | 12 | 4 | 32×32 |
| `TesiraFORTE TI` | FORTE_TI | 12 mic/line | 8 line | 8×8 | 0 | 12 | 4 | 32×32 |
| `TesiraSERVER` | SERVER | 0 | 0 | 0 | 32×32 | 0 | 0 | No |
| `TesiraSERVER-IO` | SERVER_IO | Varies | Varies | 0 | 32×32 | 0 | Varies | No |

### Runtime Capability Detection

```python
# In capabilities.py
def get_capabilities(model: str) -> Optional[TesiraCapabilities]:
    """Lookup static capabilities by model string from TTP 'device get model'."""
    return TESIRA_CAPABILITIES.get(model)

# Fallback: if model string not in registry, probe capabilities:
# 1. Try 'LevelControl1 get level 1' to detect analog inputs
# 2. Try 'ExplicitAVBOutStream1 get numChannels' to detect AVB
# 3. Try 'LogicState1 get state 1' to detect GPIO
```

### Capability-Driven UI

The frontend uses capabilities to show/hide UI sections:

```typescript
// In TesiraDeviceView
const caps = device.capabilities;

return (
  <TesiraDeviceNav>
    <NavLink to="dashboard">Dashboard</NavLink>
    <NavLink to="levels">Levels</NavLink>
    <NavLink to="dsp">DSP Blocks</NavLink>
    <NavLink to="mixer">Mixer</NavLink>
    <NavLink to="eq">EQ</NavLink>
    <NavLink to="presets">Presets</NavLink>
    {caps.avb_max_channels > 0 && <NavLink to="avb">AVB</NavLink>}
    {caps.gpio_count > 0 && <NavLink to="settings">GPIO & Settings</NavLink>}
    <NavLink to="loops">Effects Loops</NavLink>
    <NavLink to="faults">Diagnostics</NavLink>
  </TesiraDeviceNav>
);
```

---

## 7. State Model

### Device Connection State Machine

```
                    ┌──────────────┐
                    │ UNCONFIGURED │
                    └──────┬───────┘
                           │ adopt / manual add
                    ┌──────▼───────┐
              ┌────►│  CONFIGURED  │◄────┐
              │     └──────┬───────┘     │
              │            │ TTP connect  │ user disconnect
              │     ┌──────▼───────┐     │
              │     │  CONNECTING  ├─────┘
              │     └──────┬───────┘
              │            │
              │     ┌──────┴──────────────┐
              │     │                     │
              │  TTP OK              TTP fail/timeout
              │     │                     │
              │ ┌───▼──────┐      ┌───────▼──────┐
              │ │ CONNECTED │      │   OFFLINE    │
              │ └───┬──────┘      └───────┬──────┘
              │     │                     │
              │  TCP drop           retry (30s backoff)
              │     │                     │
              │ ┌───▼──────────┐          │
              │ │ RECONNECTING ├──────────┘
              │ └───┬──────────┘
              │     │ backoff reconnect
              │     │
              │     ├── TTP OK → CONNECTED
              │     └── timeout → OFFLINE
              │
              └── user remove → UNCONFIGURED
```

### DSP Block Discovery State Machine

```
┌──────────────┐
│ UNDISCOVERED │ (block not yet probed)
└──────┬───────┘
       │ probe start
┌──────▼───────┐
│   PROBING    │ (TTP queries in flight)
└──────┬───────┘
       │
  ┌────┴────┐
  │         │
All OK   Some errors
  │         │
┌─▼────┐ ┌─▼───────┐
│FOUND │ │ PARTIAL │ (some params discovered, some failed)
└──┬───┘ └─────────┘
   │
   │ staleness timeout (5 min)
┌──▼───┐
│STALE │ (needs re-probe)
└──┬───┘
   │ re-probe
   └──→ PROBING
```

### Preset Interlock State Machine

```
┌──────┐
│ IDLE │
└──┬───┘
   │ MAP2 preset loaded event
┌──▼─────┐
│SYNCING │ (recalling Tesira presets per rules)
└──┬─────┘
   │
   ├── all recalls OK ──→ SYNCED
   └── any recall fails ─→ PARTIAL_SYNC

SYNCED ──(Tesira preset changes externally)──→ DRIFT_DETECTED
DRIFT_DETECTED ──(user acknowledges)──→ IDLE
```

### AVB Stream Connection States

```
DISCONNECTED →(connect request)→ CONNECTING →(ACMP OK)→ CONNECTED
CONNECTED →(disconnect request)→ DISCONNECTING →(ACMP OK)→ DISCONNECTED
CONNECTING →(timeout)→ ERROR
CONNECTED →(stream lost)→ ERROR →(auto-retry)→ CONNECTING
```

---

## 8. AVB-First Architecture

### Principle

AVB is treated as a first-class system concept at **every layer** whenever it is present, active, supported, or configured. When AVB is not active, the system represents this explicitly with disabled/greyed-out controls.

### Backend AVB Integration Points

| Integration Point | File | What Happens |
|-------------------|------|--------------|
| Device connect | `tesira_fleet.py` | Register Tesira AVB streams as `AudioEndpoint` in `AvbRouter` |
| Stream routing | `avb_router.py` | N-to-M talker/listener connections via ACMP |
| RT audio | `TesiraAvbNode.cpp` | Per-channel gain/mute in JUCE audio callback |
| PTP coordination | `ptp_coordinator.py` | Yield PTP master to Tesira via ptp4l SIGHUP |
| Effects loops | `avb_router.py` | AVB send/return stream provisioning |
| Stream health | `avb_service.py` | Transport stats, underrun/overrun tracking |
| SRP admission | `srp_admission.py` | Bandwidth reservation for AVB streams |

### New AVB Extensions

**8a. Tesira-to-Tesira Routing**

When multiple Tesira units are in the fleet, their talker/listener streams are cross-routable. The `AvbRouter` already supports AVDECC connections; the enhancement makes these visible in the routing matrix UI.

```
Example: Forte CI #1 (12 inputs) → AVB → Forte CI #2 (processing) → AVB → MAP2 (monitoring)
```

**8b. Stream Health Dashboard**

Merge existing `AvbStreamDiagnostics` type into the Tesira device view:

```typescript
interface AvbStreamHealth {
  stream_id: string;
  direction: 'talker' | 'listener';
  ptp_locked: boolean;
  ptp_offset_ns: number;
  frames_sent: number;
  frames_received: number;
  underruns: number;
  overruns: number;
  timestamp_errors: number;
  max_latency_ns: number;
}
```

**8c. PTP Topology View**

All PTP participants shown with master/slave roles and clock offsets:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Forte CI #1 │     │  Forte CI #2 │     │   MAP2 Host  │
│  PTP: MASTER │────▶│  PTP: SLAVE  │     │  PTP: SLAVE  │
│  offset: 0ns │     │  offset: 42ns│     │  offset: 18ns│
└──────────────┘     └──────────────┘     └──────────────┘
```

**8d. AVB Unavailable States**

When AVB is not configured, offline, or unsupported, the UI shows:

| Condition | UI Presentation |
|-----------|----------------|
| AVB not configured on device | AVB tab greyed out, "No AVB streams configured" message |
| AVB streams exist but PTP not locked | Yellow warning badge, "PTP: Unlocking" status |
| AVB stream in error state | Red error badge, transport error details |
| Device offline | All AVB controls disabled, "Device offline" overlay |
| Model has no AVB (Dante models) | AVB tab hidden, Dante tab shown instead (future) |

---

## 9. Information Architecture

### Navigation Hierarchy

```
MAP2 Audio Platform
│
├── Audio Engine (/audio-engine)
│   └── GridFlow signal chain
│       ├── ChainEndpoint (INPUT) ← Tesira AVB endpoints selectable
│       ├── Plugin chain
│       ├── Effects Loop insertion points ← Tesira loop integration
│       └── ChainEndpoint (OUTPUT) ← Tesira AVB endpoints selectable
│
├── Tesira Fleet (/tesira)                           ◄── ENHANCED
│   │
│   ├── Fleet Overview                                (device cards grid)
│   │   ├── Per-device: name, model badge, connection state, PTP role,
│   │   │   fault count, AVB stream count, firmware indicator
│   │   ├── "Scan Network" button → DiscoveryDialog
│   │   └── "Add Device" button → ManualAddDialog
│   │
│   └── Device Control (/tesira/:deviceId)           ◄── Route-based
│       │
│       ├── Dashboard (/tesira/:id)                   ◄── NEW
│       │   ├── Connection card (transport, uptime, reconnects)
│       │   ├── Audio card (AVB streams, peak levels)
│       │   └── Health card (faults, PTP, firmware)
│       │
│       ├── Levels (/tesira/:id/levels)               (existing, enhanced)
│       │   └── Channel strips with gain slider + mute + meter
│       │
│       ├── DSP Blocks (/tesira/:id/dsp)              ◄── NEW
│       │   ├── Block tree sidebar (by category)
│       │   ├── Block parameter panel
│       │   └── "Probe Device" auto-discovery
│       │
│       ├── Mixer (/tesira/:id/mixer)                 (existing, enhanced)
│       │   └── Interactive crosspoint grid
│       │
│       ├── EQ (/tesira/:id/eq)                       (existing, enhanced)
│       │   └── Visual frequency response curve
│       │
│       ├── Presets (/tesira/:id/presets)              (existing)
│       │   └── Preset list + recall + interlock rules
│       │
│       ├── Effects Loops (/tesira/:id/loops)          (relocated from tab)
│       │   └── Loop builder + chain insertion
│       │
│       ├── Diagnostics (/tesira/:id/faults)           (existing, enhanced)
│       │   ├── Fault list
│       │   ├── TTP connection stats
│       │   ├── PTP diagnostics
│       │   └── AVB stream health
│       │
│       └── Settings (/tesira/:id/settings)           ◄── NEW
│           ├── Firmware info + update guidance
│           ├── Network config (IP, MAC, transport)
│           └── GPIO control (read/write pins)
│
├── AVB Routing (/avb-routing)                        (existing, enhanced)
│   ├── Routing Matrix (talker × listener grid)
│   │   └── Now includes Tesira-to-Tesira connections
│   ├── Node Tree (MAP2 + Tesira + AVDECC devices)
│   ├── Inspector (selected connection details)
│   ├── PTP Topology                                  ◄── NEW
│   └── Stream Health                                 ◄── NEW
│
├── Plugins (/plugins)
├── MPX-1 (/mpx1)
└── Settings (/settings)
```

### Cross-Navigation Links

| From | To | Trigger |
|------|----|---------|
| Fleet Overview → Device Dashboard | Click device card | Navigation |
| Device Dashboard → AVB Routing | Click AVB stream count | Deep link with device filter |
| Device Loops → GridFlow | "Insert into chain" button | Navigate to `/audio-engine` with loop pre-selected |
| GridFlow ChainEndpoint → AVB Routing | Click endpoint AVB badge | Deep link to endpoint in routing matrix |
| AVB Routing → Device Dashboard | Click Tesira node in tree | Navigate to `/tesira/:id` |

---

## 10. Screen-by-Screen UI Specification

### Screen 1: Fleet Overview (`/tesira`)

**Purpose**: At-a-glance status of all Tesira devices in the fleet.

**Layout**: Grid of device cards (responsive: 3 columns desktop, 2 tablet, 1 mobile).

**Data required**:
- `GET /api/tesira/devices` — device list with connection state
- `GET /api/tesira/fleet/health` — aggregated fleet health (NEW)

**Per-device card contents**:

| Element | Source | Visual |
|---------|--------|--------|
| Device name | `device.info.hostname` | Bold title |
| Model family | `device.info.model` | Chip badge (e.g., "Forte CI") |
| Connection state | Fleet WS event | Color-coded dot (green/yellow/red) |
| PTP role | `tesira:ptp` WS topic | "Master" or "Slave" badge |
| Fault count | `device.faults.length` | Red counter badge (if > 0) |
| AVB stream count | `device.avb_streams.length` | "4 TX / 2 RX" text |
| Firmware | `device.info.firmware_version` | Version text + update indicator |

**Primary actions**:
- Click card → navigate to `/tesira/:id`
- "Scan Network" button → opens `DiscoveryDialog` (existing)
- "Add Device" button → opens `ManualAddDialog` (existing)

**Empty state**: "No Tesira devices configured" with prominent "Scan Network" button.

**Loading state**: Skeleton cards during initial fetch.

**Reuses**: `TesiraDeviceCard` (existing, enhanced), `TesiraFleetPanel` (existing), `DiscoveryDialog` (existing), `ManualAddDialog` (existing).

---

### Screen 2: Device Dashboard (`/tesira/:id`)

**Purpose**: Summary view of a single device — connection, audio, and health at a glance.

**Layout**: Full-width device header + 3 summary cards + quick-access links.

**Data required**:
- `GET /api/tesira/devices/:id` — full device detail
- `tesira:ptp` WS topic — PTP status
- `tesira:meters` WS topic — live metering summary

**Header**:
- Hostname, serial number, model, firmware version
- Connection status indicator (green dot + "Connected via Telnet" / "Connected via SSH" / "Offline")
- Action buttons: Disconnect, Reboot (with confirmation)

**Summary cards**:

| Card | Contents |
|------|----------|
| **Connection** | Transport type, connection duration, reconnect attempts, TTP latency |
| **Audio** | Active AVB streams count, peak input level, peak output level (animated meters) |
| **Health** | Fault count (expandable list), PTP state + offset, firmware update availability |

**Quick-access links**: Grid of navigation tiles for all sub-views (Levels, DSP, Mixer, EQ, Presets, Loops, Diagnostics, Settings).

**Unavailable state**: When device is offline, show last-known data with "Offline since {timestamp}" banner. All action buttons disabled except "Reconnect".

**NEW component**: `TesiraDeviceDashboard.tsx`

---

### Screen 3: DSP Block Explorer (`/tesira/:id/dsp`)

**Purpose**: Discover, browse, and control all DSP processing blocks on the device.

**Layout**: Left sidebar (block tree by category, 240px) + right panel (block detail/parameters).

**Data required**:
- `GET /api/tesira/devices/:id/dsp/blocks` — discovered blocks (NEW)
- `GET /api/tesira/devices/:id/dsp/blocks/:tag/params` — block parameters (NEW)

**Block tree sidebar**:

```
▾ Level Controls (4)
  ├── LevelControl1
  ├── LevelControl2
  ├── LevelControl3
  └── LevelControl4
▾ Mixers (1)
  └── Mixer1
▾ Equalizers (8)
  ├── PEQ1
  ├── PEQ2
  └── ...
▾ Dynamics (2)
  ├── Compressor1
  └── Gate1
▾ AVB Streams (6)
  ├── ExplicitAVBOutStream1
  └── ExplicitAVBInStream1
▸ Undiscovered (0)
```

**Block detail panel**:
- Block name, type badge, channel count
- Parameter table: name, current value, edit control (slider/toggle/input), unit, range
- "Refresh" button to re-read all parameters
- Live value updates for subscribable parameters

**Auto-discovery**: "Probe Device" button triggers `POST /api/tesira/devices/:id/dsp/probe` → progress indicator → results populate tree.

**Manual declaration**: "Add Block" dialog: enter instance tag + select type → saved to DB.

**Empty state**: "No blocks discovered. Click 'Probe Device' to scan for DSP blocks."

**NEW components**: `TesiraDspExplorer.tsx`, `TesiraDspBlockPanel.tsx`, `TesiraDspProbeDialog.tsx`

---

### Screen 4: Enhanced Levels (`/tesira/:id/levels`)

**Purpose**: Per-channel level control with visual metering.

**Layout**: Horizontal row of channel strips.

**Enhancement over existing `TesiraLevelsTab`**:
- Add VU meters using the existing `AudioMeter` component from `web/src/app/components/AudioMeter.tsx`
- Channel strip layout: vertical strip with gain slider, mute toggle, meter bar, channel label
- Group controls: link channels (stereo pair), group mute, group gain offset

**Data**: Level/mute via existing REST + metering via `tesira:meters` WS topic.

**Reuses**: Existing `TesiraLevelsTab.tsx` (extended), `AudioMeter.tsx`.

---

### Screen 5: Enhanced Mixer Matrix (`/tesira/:id/mixer`)

**Purpose**: Interactive crosspoint gain matrix for Mixer/Router blocks.

**Layout**: Grid with input channels as rows, output channels as columns.

**Enhancement over existing `TesiraMixerTab`**:
- Click cell to open gain edit popover
- Double-click cell to toggle mute
- Select entire row/column for batch operations
- Metering overlay: input/output levels alongside the matrix
- Color-coded cells: gain level mapped to color intensity

**Data required**:
- `GET /api/tesira/devices/:id/crosspoint/:tag` — full matrix read (NEW)
- `PUT /api/tesira/devices/:id/crosspoint/:tag` — set gain
- `PUT /api/tesira/devices/:id/crosspoint/:tag/mute` — set mute (NEW)

**Reuses**: Existing `TesiraMixerTab.tsx` (enhanced), cell pattern from `AvbRouting/RoutingGrid/`.

---

### Screen 6: Enhanced EQ (`/tesira/:id/eq`)

**Purpose**: Parametric EQ control with visual frequency response.

**Layout**: Frequency response graph (top) + band controls (bottom).

**Enhancement over existing `TesiraEQTab`**:
- SVG frequency response curve showing all bands
- Per-band controls: Frequency (Hz), Gain (dB), Q, Type selector
- Drag handles on the frequency curve for direct manipulation
- Bypass per band

**Data required**:
- `GET /api/tesira/devices/:id/eq/:tag/band/:band` — band params (NEW: returns freq, gain, Q)
- `PUT /api/tesira/devices/:id/eq/:tag/band/:band/freq|gain|q` — set params

**Reuses**: Existing `TesiraEQTab.tsx` (extended).

---

### Screen 7: Effects Loops (`/tesira/:id/loops`)

**Purpose**: Create and manage effects loops using Tesira as external DSP insert.

**Layout**: Loop list + creation wizard + chain insertion controls.

**Relocation**: Moved from tab 7 of `TesiraControlPanel` to its own route.

**Enhancement**: "Insert into GridFlow chain" button navigates to `/audio-engine` with the loop pre-selected for insertion.

**Reuses**: Existing `TesiraLoopBuilderTab.tsx` (838 lines, fully functional — relocate).

---

### Screen 8: Device Settings (`/tesira/:id/settings`)

**Purpose**: Firmware, network, and GPIO management.

**Layout**: Accordion sections.

**Sections**:

| Section | Contents |
|---------|----------|
| **Firmware** | Current version, latest available (cached), update path calculator link, update availability badge |
| **Network** | IP address, MAC address, TTP transport (Telnet/SSH), port, connection latency |
| **GPIO** | Per-pin read/write controls (4 pins), current state indicators, logic block info |
| **Identity** | Hostname (editable via TTP `device set hostname`), serial number (read-only) |
| **Danger Zone** | Reboot button (with confirmation dialog), Disconnect button |

**Data required**:
- `GET /api/tesira/devices/:id` — existing
- `GET /api/tesira/devices/:id/firmware` — existing
- `GET /api/tesira/devices/:id/gpio` — NEW

**NEW component**: `TesiraDeviceSettings.tsx`

---

### Screen 9: Diagnostics (`/tesira/:id/faults`)

**Purpose**: Comprehensive device diagnostics and health information.

**Layout**: Tabbed sections within the view.

**Sections**:

| Section | Data Source |
|---------|------------|
| **Faults** | `GET /api/tesira/devices/:id/faults` (existing) |
| **TTP Stats** | Command latency, timeout count, reconnect history |
| **PTP Status** | State, offset history (chart), grandmaster ID, domain |
| **AVB Streams** | Per-stream transport stats (frames, errors, latency) |
| **Metering History** | Peak levels over time chart (from `TesiraMetricsStore`) |

**Reuses**: Existing `TesiraFaultsTab.tsx` (enhanced with additional sections).

---

## 11. Component System

### Component Hierarchy

```
TesiraFleetProvider (context: selected device, connection states, fleet health)
│
├── TesiraFleetView (/tesira)
│   ├── TesiraFleetHeader (breadcrumbs, scan button, add button)
│   ├── TesiraDeviceGrid (responsive card layout)
│   │   └── TesiraDeviceCard (per-device: status, model, PTP, faults, AVB count)
│   ├── DiscoveryDialog (existing)
│   └── ManualAddDialog (existing)
│
└── TesiraDeviceView (/tesira/:id) (route params → device lookup)
    ├── TesiraDeviceHeader (existing, enhanced: transport type, action buttons)
    ├── TesiraDeviceNav (sidebar/tab navigation for sub-views)
    └── <Outlet> (renders sub-view based on route)
        ├── TesiraDeviceDashboard (NEW: 3 summary cards + quick links)
        ├── TesiraLevelsView (existing TesiraLevelsTab, enhanced with AudioMeter)
        ├── TesiraDspExplorer (NEW: block tree + param panel)
        │   ├── TesiraDspBlockTree (categorized block list)
        │   ├── TesiraDspBlockPanel (NEW: parameter editor)
        │   └── TesiraDspProbeDialog (NEW: auto-discovery progress)
        ├── TesiraMixerView (existing TesiraMixerTab, enhanced with interactive grid)
        │   └── TesiraCrosspointCell (reusable matrix cell)
        ├── TesiraEQView (existing TesiraEQTab, enhanced with SVG curve)
        │   └── TesiraEqCurve (SVG frequency response)
        ├── TesiraPresetsView (existing TesiraPresetsTab)
        ├── TesiraLoopsView (existing TesiraLoopBuilderTab, relocated)
        ├── TesiraDiagnosticsView (existing TesiraFaultsTab, enhanced)
        │   ├── TesiraPtpStatusPanel (PTP state + offset chart)
        │   ├── TesiraAvbStreamHealthPanel (per-stream stats)
        │   └── TesiraMeteringHistoryChart (peak levels over time)
        └── TesiraSettingsView (NEW: firmware + network + GPIO)
            └── TesiraGpioPanel (NEW: 4-pin read/write controls)
```

### Shared Component Reuse

| Existing Component | Used In | Source |
|-------------------|---------|--------|
| `AudioMeter` | Levels view channel strips | `web/src/app/components/AudioMeter.tsx` |
| `ChainEndpoint` | Loop insertion visualization | `web/src/app/components/GridFlow/ChainEndpoint.tsx` |
| Matrix cell pattern | Mixer crosspoint grid | `web/src/app/components/AvbRouting/RoutingGrid/` |
| `useWebSocketTopic` | All real-time data | `web/src/map2/websocket.ts` |
| `useRealtimePollingGating` | Visibility-gated queries | `web/src/app/hooks/useRealtimePollingGating` |
| MUI `Chip`/`Badge` | Status indicators throughout | Material-UI v5 |
| Phosphor Icons | Navigation + status icons | Existing pattern |

### State Management (no changes to pattern)

- **React Query**: Server-side state for all REST data (existing pattern with `TESIRA_KEYS`)
- **WebSocket subscriptions**: Real-time metering, device state, PTP (existing hooks)
- **TesiraContext**: Extended with DSP block selection, navigation state
- **No Redux**: Keep lightweight context + React Query pattern

---

## 12. Backend Service Design

### New Service 1: `app/services/tesira/tesira_dsp_model.py`

**Purpose**: Runtime DSP block discovery and parameter control for one Tesira device.

**Responsibilities**:
- Probe device for known block naming patterns via TTP
- Cache discovered blocks in DB (`TesiraBlockDeclaration`)
- Bulk-read/write parameters for discovered blocks
- Track probe state per block

**Interface**:

```python
class TesiraDspModel:
    def __init__(self, device: TesiraDevice): ...

    async def probe_all(self, patterns: Optional[List[str]] = None) -> ProbeResult:
        """Probe device for DSP blocks using naming conventions.

        Default patterns: LevelControl{1..32}, Mixer{1..8}, Router{1..8},
        PEQ{1..32}, GEQ{1..8}, FBD{1..8}, Compressor{1..16}, Limiter{1..16},
        Gate{1..16}, Ducker{1..8}, Leveler{1..8}, ANC{1..8}, Delay{1..16},
        AEC{1..12}, NR{1..12}, SourceSelector{1..8}, RoomCombiner{1..4},
        LogicState{1..16}, ToneGenerator{1..4}

        Returns: ProbeResult(found: int, failed: int, blocks: List[TesiraDspBlock])
        """

    async def probe_block(self, instance_tag: str, block_type: str) -> Optional[TesiraDspBlock]:
        """Probe a specific block. Returns None if not found."""

    async def get_block_params(self, instance_tag: str) -> Dict[str, Any]:
        """Read all known parameters for a block via TTP."""

    async def set_block_param(self, instance_tag: str, param: str, value: Any) -> bool:
        """Set a single parameter on a block via TTP."""

    async def bulk_get(self, requests: List[Tuple[str, str]]) -> Dict[str, Dict[str, Any]]:
        """Bulk-read: list of (instance_tag, param) → {tag: {param: value}}"""

    async def bulk_set(self, updates: List[Tuple[str, str, Any]]) -> List[bool]:
        """Bulk-write: list of (instance_tag, param, value) → success flags"""
```

**Block type → parameter mapping** (used during probing):

```python
BLOCK_PARAM_MAP = {
    "level_control": {
        "level": {"type": "float", "unit": "dB", "min": -100, "max": 12},
        "mute": {"type": "bool"},
        "minLevel": {"type": "float", "unit": "dB"},
        "maxLevel": {"type": "float", "unit": "dB"},
    },
    "compressor": {
        "threshold": {"type": "float", "unit": "dB", "min": -60, "max": 0},
        "ratio": {"type": "float", "min": 1, "max": 20},
        "attack": {"type": "float", "unit": "ms", "min": 0.1, "max": 200},
        "release": {"type": "float", "unit": "ms", "min": 1, "max": 5000},
        "gain": {"type": "float", "unit": "dB"},
        "bypass": {"type": "bool"},
    },
    "delay": {
        "delay": {"type": "float", "unit": "ms", "min": 0, "max": 2000},
        "bypass": {"type": "bool"},
    },
    # ... more types
}
```

**Interactions**: Calls `TesiraDevice.send()` (via `TTPClient`). Persists results to `TesiraBlockDeclaration` table via SQLAlchemy session.

**Failure modes**: TTP timeout (2s per probe) → mark block as failed. Device offline → abort probe, return partial results.

---

### New Service 2: `app/services/tesira/ttp_ssh_client.py`

**Purpose**: SSH transport alternative for TTP commands on devices with Telnet disabled.

**Interface**: Same as `TTPClient` — drop-in replacement.

```python
class TTPSSHClient:
    def __init__(self, host: str, port: int = 22, username: str = "default",
                 password: str = "default"): ...

    async def connect(self) -> None: ...
    async def disconnect(self) -> None: ...
    @property
    def connected(self) -> bool: ...

    async def send(self, instance_tag: str, service: str, attribute: str,
                   *args) -> TTPResponse: ...
    async def subscribe(self, instance_tag: str, attribute: str,
                        interval_ms: int) -> None: ...
    async def unsubscribe(self, instance_tag: str, attribute: str) -> None: ...
    def on_push(self, callback: Callable) -> None: ...
```

**Implementation**: Uses `asyncssh` to open SSH session, sends TTP commands over the SSH channel. Response parsing reuses `TTPResponse` and parsing regexes from `ttp_client.py`.

**Transport selection in TesiraDevice**:

```python
class TesiraDevice:
    async def connect(self):
        if self._transport == "auto":
            try:
                self._client = TTPClient(self._host, port=23)
                await self._client.connect()
                self._active_transport = "telnet"
            except (ConnectionRefusedError, asyncio.TimeoutError):
                self._client = TTPSSHClient(self._host, port=22, ...)
                await self._client.connect()
                self._active_transport = "ssh"
        elif self._transport == "ssh":
            self._client = TTPSSHClient(self._host, port=22, ...)
            await self._client.connect()
            self._active_transport = "ssh"
        else:  # "telnet" (default, existing behavior)
            self._client = TTPClient(self._host, port=23)
            await self._client.connect()
            self._active_transport = "telnet"
```

---

### New Service 3: `app/services/tesira/tesira_metrics.py`

**Purpose**: Ring buffer for metering history (last N readings per channel per device).

```python
class TesiraMetricsStore:
    RING_SIZE = 300  # ~30 seconds at 10Hz metering

    def __init__(self): ...

    def push(self, device_id: str, instance_tag: str,
             levels_dbu: List[float], timestamp: float) -> None:
        """Add a meter reading to the ring buffer."""

    def get_history(self, device_id: str, instance_tag: str,
                    count: int = 300) -> List[MeterReading]:
        """Get last N readings. Returns oldest-first."""

    def get_peak(self, device_id: str, instance_tag: str,
                 window_s: float = 5.0) -> List[float]:
        """Get peak level per channel over the given time window."""

    def get_summary(self, device_id: str) -> Dict[str, MeterSummary]:
        """Get peak + RMS per instance_tag across all channels."""
```

**Storage**: In-memory `collections.deque(maxlen=300)` per `(device_id, instance_tag)`. No persistence — metering history is transient.

**Integration**: Wired into existing `TesiraFleet._on_meter_push()` callback:

```python
# In tesira_fleet.py, existing callback:
async def _on_meter_push(self, device_id, instance_tag, levels):
    # Existing: broadcast via WebSocket
    await self._ws_manager.broadcast("tesira:meters", {...})
    # NEW: store in metrics ring buffer
    self._metrics_store.push(device_id, instance_tag, levels, time.time())
```

---

### New Service 4: `app/services/tesira/capabilities.py`

**Purpose**: Static device family capability registry.

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class TesiraCapabilities:
    analog_inputs: int
    analog_outputs: int
    usb_channels: int
    avb_max_channels: int
    aec_channels: int
    gpio_count: int
    rs232: bool
    dsp_partitions: int
    has_dante: bool
    has_avb: bool

TESIRA_CAPABILITIES: Dict[str, TesiraCapabilities] = {
    "TesiraFORTE CI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=32, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraFORTE VI": TesiraCapabilities(
        analog_inputs=4, analog_outputs=4, usb_channels=8,
        avb_max_channels=32, aec_channels=4, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraFORTE DAN CI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=0, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=True, has_avb=False,
    ),
    "TesiraFORTE TI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=0, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=True, has_avb=False,
    ),
    "TesiraSERVER": TesiraCapabilities(
        analog_inputs=0, analog_outputs=0, usb_channels=0,
        avb_max_channels=32, aec_channels=0, gpio_count=0,
        rs232=False, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraSERVER-IO": TesiraCapabilities(
        analog_inputs=0, analog_outputs=0, usb_channels=0,
        avb_max_channels=32, aec_channels=0, gpio_count=0,
        rs232=False, dsp_partitions=0, has_dante=False, has_avb=True,
    ),
}

def get_capabilities(model: str) -> Optional[TesiraCapabilities]:
    """Lookup capabilities by model string from TTP 'device get model'."""
    return TESIRA_CAPABILITIES.get(model)
```

---

### Existing Service Extensions

**TesiraDevice** (`tesira_device.py`):
- Add `transport` constructor parameter (`"telnet"` | `"ssh"` | `"auto"`)
- Add `get_dsp_model() -> TesiraDspModel` accessor
- Add `get_gpio_state(pin: int) -> bool` via TTP `LogicState{pin} get state 1`
- Add `set_gpio_state(pin: int, value: bool)` via TTP `LogicState{pin} set state 1 {value}`
- Add `get_capabilities() -> Optional[TesiraCapabilities]` via model string lookup

**TesiraFleet** (`tesira_fleet.py`):
- Configurable `MAX_DEVICES` from config (`tesira.max_devices`, default 5, max 16)
- `get_fleet_health() -> Dict` with aggregated health across all devices
- Integration with `TesiraMetricsStore` for metering history

**TesiraPresetInterlock** (`preset_interlock.py`):
- Reverse sync detection: subscribe to Tesira `device activePreset` via TTP push
- Broadcast `tesira:preset_change` with `direction: "tesira_to_map2"` when external change detected

---

## 13. Device Integration Layer

### TTP Command Coverage Matrix

| DSP Block Type | GET Commands | SET Commands | SUBSCRIBE | Current Status | Target |
|---------------|-------------|-------------|-----------|----------------|--------|
| LevelControl | level, mute | level, mute | level | ✅ Implemented | Keep |
| Mixer | crosspointLevelOut, crosspointMute | crosspointLevelOut, crosspointMute | level | ⚠️ Partial (mute missing) | Complete |
| Router | output | output | — | ❌ Not implemented | Phase 1 |
| PEQ | eqBandFrequency, eqBandGain, eqBandQ, eqBandType | eqBandFrequency, eqBandGain, eqBandQ | — | ⚠️ Partial (freq only) | Complete |
| GEQ | bandLevel | bandLevel | — | ❌ Not implemented | Phase 1 |
| FBD (Feedback) | filterFreq, filterDepth, filterBW | — | — | ❌ Not implemented | Phase 1 |
| Compressor | threshold, ratio, attack, release, gain, bypass | threshold, ratio, attack, release, gain, bypass | — | ❌ Not implemented | Phase 1 |
| Limiter | threshold, attack, release, bypass | threshold, attack, release, bypass | — | ❌ Not implemented | Phase 1 |
| Gate | threshold, depth, attack, hold, release, bypass | threshold, depth, attack, hold, release, bypass | — | ❌ Not implemented | Phase 1 |
| Ducker | threshold, depth, attack, hold, release, bypass | threshold, depth, attack, hold, release, bypass | — | ❌ Not implemented | Phase 1 |
| Leveler | targetLevel, speed, bypass | targetLevel, speed, bypass | — | ❌ Not implemented | Phase 1 |
| ANC | ambientLevel, maxBoost, bypass | ambientLevel, maxBoost, bypass | — | ❌ Not implemented | Phase 1 |
| Delay | delay, bypass | delay, bypass | — | ❌ Not implemented | Phase 1 |
| AEC | aecEnabled, nlpMode, nlpLevel | aecEnabled, nlpMode, nlpLevel | — | ❌ Not implemented | Phase 1 |
| SourceSelector | sourceSelection | sourceSelection | — | ❌ Not implemented | Phase 1 |
| RoomCombiner | wallState, group | wallState, group | — | ❌ Not implemented | Phase 1 |
| LogicState (GPIO) | state | state | state | ❌ Not implemented | Phase 1 |
| Device | hostname, serialNumber, version, model, macAddress, presetList, faultList | recallPreset, reboot, hostname | — | ✅ Implemented | Keep |
| AVB streams | numChannels, streamName, ptpStatus, ptpOffset, ptpGrandmasterID | — | — | ✅ Implemented | Keep |

### TTP Probing Strategy

The `TesiraDspModel.probe_block()` method uses this approach:

```python
async def probe_block(self, instance_tag: str, block_type: str) -> Optional[TesiraDspBlock]:
    """Try to read a distinguishing attribute to confirm block exists."""

    # Each block type has a "canary" attribute that confirms existence
    CANARY_ATTRS = {
        "level_control": ("level", 1),       # LevelControl1 get level 1
        "mixer": ("crosspointLevelOut", (1, 1)),  # Mixer1 get crosspointLevelOut 1 1
        "peq": ("eqBandFrequency", 1),       # PEQ1 get eqBandFrequency 1
        "compressor": ("threshold", None),     # Compressor1 get threshold
        "delay": ("delay", None),              # Delay1 get delay
        "aec": ("aecEnabled", None),           # AEC1 get aecEnabled
        "logic_state": ("state", 1),           # LogicState1 get state 1
        # ... more types
    }

    canary_attr, canary_args = CANARY_ATTRS.get(block_type, ("bypass", None))

    try:
        if canary_args is not None:
            if isinstance(canary_args, tuple):
                resp = await self.device._client.send(instance_tag, "get", canary_attr, *canary_args)
            else:
                resp = await self.device._client.send(instance_tag, "get", canary_attr, canary_args)
        else:
            resp = await self.device._client.send(instance_tag, "get", canary_attr)

        if resp.ok:
            # Block exists — probe all known parameters
            return await self._probe_all_params(instance_tag, block_type)
        return None
    except Exception:
        return None
```

### Protocol Adapters

| Transport | Library | Port | Auth | Status |
|-----------|---------|------|------|--------|
| Telnet (TTP) | `asyncio` raw TCP | 23 | None (factory reset) | Existing |
| SSH (TTP over SSH) | `asyncssh` | 22 | Username/password | New (Phase 4) |
| Port 61451 (probe) | `asyncio` raw TCP | 61451 | None | Existing (experimental) |
| AVDECC (IEEE 1722.1) | `la_avdecc` via PCap | L2 Ethernet | None | Existing (C++) |

---

## 14. API Design

### New Endpoints

#### DSP Block Discovery & Control (`/api/tesira/devices/{device_id}/dsp/`)

```
POST   /dsp/probe
  Body: { "patterns": ["LevelControl{1..12}", "Mixer{1..4}"] }  (optional, default: all)
  Response: { "found": 15, "failed": 3, "blocks": [...] }

GET    /dsp/blocks
  Response: [ { "block_id": "LevelControl1", "block_type": "level_control", "channel_count": 12, "is_probed": true } ]

GET    /dsp/blocks/{instance_tag}
  Response: { "block_id": "LevelControl1", "block_type": "level_control", "params": {...} }

GET    /dsp/blocks/{instance_tag}/params
  Response: { "level": { "value": -6.0, "type": "float", "unit": "dB", "min": -100, "max": 12 }, "mute": { "value": false, "type": "bool" } }

PUT    /dsp/blocks/{instance_tag}/params/{param}
  Body: { "value": -12.0 }
  Response: { "ok": true, "value": -12.0 }

POST   /dsp/bulk-get
  Body: { "requests": [ ["LevelControl1", "level"], ["Mixer1", "crosspointLevelOut"] ] }
  Response: { "LevelControl1": { "level": -6.0 }, "Mixer1": { "crosspointLevelOut": 0.0 } }

POST   /dsp/bulk-set
  Body: { "updates": [ ["LevelControl1", "level", -12.0], ["Mixer1", "crosspointMute", true] ] }
  Response: { "results": [true, true] }
```

#### GPIO (`/api/tesira/devices/{device_id}/gpio/`)

```
GET    /gpio
  Response: { "pins": [ { "pin": 1, "state": true }, { "pin": 2, "state": false }, ... ] }

GET    /gpio/{pin}
  Response: { "pin": 1, "state": true }

PUT    /gpio/{pin}
  Body: { "state": true }
  Response: { "ok": true, "pin": 1, "state": true }
```

#### Scene Snapshots (`/api/tesira/devices/{device_id}/scenes/`)

```
POST   /scenes/capture
  Body: { "name": "Pre-show setup", "block_ids": ["LevelControl1", "PEQ1"] }  (block_ids optional = all)
  Response: { "scene_id": "uuid", "name": "Pre-show setup", "block_count": 2 }

GET    /scenes
  Response: [ { "scene_id": "uuid", "name": "Pre-show setup", "created_at": "..." } ]

GET    /scenes/{scene_id}
  Response: { "scene_id": "uuid", "name": "...", "block_states": { "LevelControl1": { "level": -6.0, "mute": false } } }

POST   /scenes/{scene_id}/recall
  Response: { "ok": true, "params_set": 24, "params_failed": 0 }

DELETE /scenes/{scene_id}
  Response: { "ok": true }
```

#### Metering History (`/api/tesira/devices/{device_id}/meters/`)

```
GET    /meters/{instance_tag}/history?count=300
  Response: [ { "timestamp": 1709..., "levels_dbu": [-12.0, -15.3] } ]

GET    /meters/{instance_tag}/peak?window_s=5
  Response: { "peak_levels_dbu": [-3.2, -5.1], "window_s": 5.0 }
```

#### Fleet Health

```
GET    /api/tesira/fleet/health
  Response: {
    "devices_total": 3,
    "devices_connected": 2,
    "devices_offline": 1,
    "total_faults": 1,
    "ptp_status": "all_locked" | "some_unlocked" | "no_ptp",
    "devices": [ { "device_id": "...", "connected": true, "faults": 0, "ptp_locked": true } ]
  }

GET    /api/tesira/fleet/ptp-topology
  Response: {
    "nodes": [
      { "device_id": "tesira_ABC", "role": "master", "offset_ns": 0, "grandmaster_id": "..." },
      { "device_id": "tesira_DEF", "role": "slave", "offset_ns": 42, "grandmaster_id": "..." },
      { "device_id": "map2", "role": "slave", "offset_ns": 18, "grandmaster_id": "..." }
    ]
  }
```

### Extended Existing Endpoints

#### EQ (add missing operations)

```
GET    /api/tesira/devices/{device_id}/eq/{tag}/band/{band}
  Response: { "frequency": 1000, "gain": 3.5, "q": 1.4, "type": "peaking" }

PUT    /api/tesira/devices/{device_id}/eq/{tag}/band/{band}/gain
  Body: { "gain_db": 3.5 }

PUT    /api/tesira/devices/{device_id}/eq/{tag}/band/{band}/q
  Body: { "q": 1.4 }
```

#### Crosspoint (add mute + full read)

```
GET    /api/tesira/devices/{device_id}/crosspoint/{tag}
  Response: { "rows": 12, "cols": 8, "matrix": [ [0.0, -inf, ...], [...] ], "mutes": [ [false, true, ...], [...] ] }

PUT    /api/tesira/devices/{device_id}/crosspoint/{tag}/mute
  Body: { "row": 1, "col": 1, "muted": true }
```

---

## 15. Extended API Support Plan

### Automation-Friendly Interface

Every endpoint is REST-ful with JSON request/response bodies. For external automation (OSC bridges, AMX/Crestron, custom scripts):

```bash
# Example: Mute all outputs on Forte CI before show
curl -X POST http://map2:8080/api/tesira/devices/tesira_ABC/dsp/bulk-set \
  -H "Content-Type: application/json" \
  -d '{"updates": [
    ["LevelControl1", "mute", true],
    ["LevelControl2", "mute", true],
    ["LevelControl3", "mute", true]
  ]}'

# Example: Recall Tesira preset + MAP2 preset atomically
curl -X POST http://map2:8080/api/tesira/devices/tesira_ABC/presets/3/recall
```

### WebSocket Topics (existing + new)

| Topic | Payload | Status |
|-------|---------|--------|
| `tesira:meters` | `{device_id, instance_tag, levels_dbu, timestamp}` | Existing |
| `tesira:device_state` | `{device_id, event: connected\|disconnected\|reconnecting, timestamp}` | Existing |
| `tesira:ptp` | `{device_id, state, offset_ns, grandmaster_id, timestamp}` | Existing |
| `tesira:discovery` | `{event: device_found\|scan_complete, device, total_found}` | Existing |
| `tesira:preset_change` | `{device_id, preset_index, direction: map2_to_tesira\|tesira_to_map2}` | Extended |
| `tesira:dsp_param_change` | `{device_id, instance_tag, param, value, timestamp}` | NEW |
| `tesira:gpio` | `{device_id, pin, state, timestamp}` | NEW |
| `tesira:fleet_health` | `{devices_connected, devices_offline, total_faults}` | NEW |

### Future Integration Points

- **Event webhooks**: Register HTTP callbacks for device events (architecture supports it via WS broadcast pattern)
- **Prometheus metrics**: `GET /api/tesira/fleet/metrics` → Prometheus-compatible text format
- **OpenAPI spec**: Auto-generated from FastAPI route definitions (existing)

---

## 16. Realtime Model

### Data Freshness Requirements

| Data Type | Source | Method | Target Latency | Status |
|-----------|--------|--------|----------------|--------|
| Level meters | TTP push | WS broadcast | <100ms | ✅ Existing (100ms TTP interval) |
| PTP status | TTP poll | WS broadcast | <1s | ✅ Existing (1s poll) |
| Device connection | TTP read loop | WS broadcast | <2s | ✅ Existing |
| Fault list | TTP poll | React Query | <30s | ✅ Existing (30s refetch) |
| DSP param values | TTP GET | React Query | <1s (on view) | ⬜ New |
| GPIO states | TTP subscription | WS broadcast | <200ms | ⬜ New |
| AVB stream health | AVDECC + PTP | WS broadcast | <2s | ⚠️ Partial |
| Fleet health | Aggregation | WS broadcast | <5s | ⬜ New |

### Optimistic Updates

For parameter changes (level, mute, EQ, crosspoint):
1. UI immediately reflects the new value (optimistic)
2. REST PUT fires in background
3. On success: no change needed (UI already correct)
4. On failure: revert to previous value + show error toast

### Reconnect Behavior

1. WebSocket disconnect → automatic reconnect with exponential backoff (existing `websocket.ts`)
2. On reconnect: React Query invalidates all Tesira queries → fresh data
3. TTP reconnect: handled by `TTPClient` auto-reconnect → fleet broadcasts `reconnecting`/`connected`

### Visibility-Gated Polling

```typescript
// Apply to all Tesira React Query hooks
const { data } = useQuery({
  queryKey: TESIRA_KEYS.deviceDetail(deviceId),
  queryFn: () => tesiraApi.getDevice(deviceId),
  refetchInterval: useRealtimePollingGating(5000), // Returns false when hidden
});
```

---

## 17. Diagnostics and Observability

### Device Diagnostics Surface (frontend)

| Section | Data Source | Visualization |
|---------|------------|---------------|
| Fault list | `GET .../faults` | Severity-colored list with timestamps |
| TTP stats | New field on device detail | Latency histogram, timeout count, reconnect history |
| PTP status | `tesira:ptp` WS + history | State badge + offset-over-time chart |
| AVB stream health | `GET .../avb/streams` + stats | Per-stream: frames, errors, latency table |
| Metering history | `GET .../meters/{tag}/history` | Peak levels over time (30s chart) |

### Backend Logging

| Event | Level | Format |
|-------|-------|--------|
| TTP command send/response | DEBUG | `[TTP] {device_id} {tag} {cmd} → {result} ({latency_ms}ms)` |
| Connection state change | INFO | `[Tesira] {device_id} state: {old} → {new}` |
| PTP role change | WARNING | `[PTP] {device_id} role changed: {old} → {new}` |
| DSP block probe result | INFO | `[DSP] {device_id} probe: found {n} blocks in {duration}s` |
| Fault detected | WARNING | `[Tesira] {device_id} fault: {fault_text}` |

### Prometheus Metrics (future)

```
# New endpoint: GET /api/tesira/fleet/metrics
map2_tesira_device_connected{device_id="tesira_ABC123"} 1
map2_tesira_device_faults{device_id="tesira_ABC123"} 0
map2_tesira_ptp_offset_ns{device_id="tesira_ABC123"} 42
map2_tesira_ttp_latency_ms{device_id="tesira_ABC123"} 12.5
map2_tesira_avb_streams_active{device_id="tesira_ABC123"} 4
map2_tesira_fleet_devices_connected 2
map2_tesira_fleet_devices_total 3
```

---

## 18. Signal and Block Diagram Model

### Representation Strategy

Since MAP2 cannot read `.tsc` design files, signal flow diagrams operate in two modes:

**Mode 1: Flat Block View (default)**

All discovered DSP blocks shown in a categorized list without wiring. Each block shows its type, channel count, and parameters. This is the `TesiraDspExplorer` component.

```
[Level Controls] → [Mixers] → [Processing] → [Routing] → [AVB Streams]
```

**Mode 2: Template-Based Signal Flow (optional)**

Users can define a block topology template that specifies connections. This uses the existing `TesiraLoopTemplate` DB model which already has `input_router_tag`, `output_router_tag`, `stream_in_tags`, `stream_out_tags`, etc.

When a template is applied, the UI renders a React Flow diagram:

```
┌────────┐     ┌─────────┐     ┌─────┐     ┌──────────┐     ┌────────────┐
│Analog  │────▶│ Level   │────▶│ PEQ │────▶│ AVB Out  │────▶│ MAP2 Chain │
│Input   │     │ Control │     │     │     │ Stream   │     │ (GridFlow) │
└────────┘     └─────────┘     └─────┘     └──────────┘     └────────────┘
```

**Backend data model** for templates:

```python
# Existing TesiraLoopTemplate (in database.py) — already has:
# - stream_in_tags, stream_out_tags (JSON lists)
# - crosspoint_tags (JSON list)
# - input_router_tag, output_router_tag
# - meter_tags, bypass_tags (JSON lists)
#
# This is sufficient for template-based signal flow rendering.
```

**Frontend rendering**: Reuse the existing `chainToFlow.ts` pattern (React Flow nodes and edges) adapted for Tesira DSP blocks. Each block becomes a React Flow node; connections become edges.

### AVB-Aware Signal Flow

When the signal path crosses AVB boundaries:

```
[Forte CI Analog In] ──▶ [AVB Talker] ══════▶ [MAP2 AVB Listener] ──▶ [MAP2 Plugin Chain]
                          ║ AVB Stream ║
                          ╚════════════╝
```

The `══▶` edge uses a distinct visual style (dashed, with AVB badge) to indicate network audio transport.

---

## 19. Workflow Definitions

### Workflow 1: First Connection (New Device)

```
1. User navigates to /tesira
2. Clicks "Scan Network" → DiscoveryDialog opens
3. System runs mDNS + port-61451 scan (existing)
4. Discovered devices appear in real-time (WS broadcast)
5. User clicks "Adopt" on desired device
6. Device persisted to config + hot-connected to fleet (existing)
7. Device card appears in fleet overview
8. User clicks card → navigates to /tesira/:id (dashboard)
9. System auto-probes DSP blocks (if tesira.auto_probe_dsp=true) [NEW]
10. Dashboard shows connection + audio + health summary
```

### Workflow 2: DSP Block Discovery

```
1. User navigates to /tesira/:id/dsp
2. If no blocks discovered: "No blocks discovered. Click 'Probe Device' to scan."
3. User clicks "Probe Device"
4. POST /api/tesira/devices/:id/dsp/probe fires
5. Progress indicator shows blocks being probed
6. Results populate the block tree sidebar
7. User clicks a block → parameter panel shows current values
8. User adjusts parameters → optimistic update + TTP SET in background
```

### Workflow 3: Effects Loop Creation

```
1. User on GridFlow page (/audio-engine)
2. Opens AudioPortSelector for chain input/output
3. Selects Tesira AVB endpoint (existing flow)
4. OR: navigates to /tesira/:id/loops
5. Creates new effects loop (topology, endpoints) — existing LoopBuilder
6. Clicks "Insert into chain" → navigates to /audio-engine with loop pre-selected
7. System creates AVB send/return streams (existing)
8. Signal chain shows Tesira loop insertion point
```

### Workflow 4: Preset Interlock

```
1. User navigates to /tesira/:id/presets
2. Creates interlock rule: MAP2 preset 3 → Tesira preset 5
3. Rule saved to DB (existing)
4. When MAP2 recalls preset 3:
   a. PluginPresetLifecycle fires event
   b. TesiraPresetInterlock receives event
   c. Tesira device recalls preset 5 via TTP
   d. WS broadcast: tesira:preset_change
5. [NEW] If Tesira preset changes externally:
   a. TTP subscription detects change
   b. WS broadcast: tesira:preset_change with direction=tesira_to_map2
   c. UI shows "drift detected" warning
```

### Workflow 5: Multi-Device AVB Routing

```
1. User navigates to /avb-routing
2. Node tree shows MAP2 + all Tesira devices
3. Click Tesira device node → shows talker/listener streams
4. Routing matrix allows connecting any talker to any listener
5. Tesira-to-Tesira connections visible (unit A → unit B) [NEW]
6. Scene save captures full routing state
7. Scene recall restores all connections
```

### Workflow 6: Diagnostics Investigation

```
1. Fleet overview shows red fault badge on device card
2. User clicks card → dashboard shows fault count
3. User navigates to /tesira/:id/faults
4. Fault list shows active faults with timestamps
5. PTP section shows offset history chart
6. AVB section shows per-stream transport stats
7. Metering history shows peak levels over last 30 seconds
8. User identifies issue (e.g., PTP offset spike correlating with audio dropout)
```

---

## 20. Persistence and Storage

### Database Tables (SQLAlchemy, SQLite)

**Existing (keep)**:

```python
class TesiraInterlockRule(Base):
    __tablename__ = "tesira_interlock_rules"
    id = Column(Integer, primary_key=True)
    map2_preset_id = Column(Integer, index=True)
    tesira_device_id = Column(String(64))
    tesira_preset_index = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class TesiraLoopTemplate(Base):
    __tablename__ = "tesira_loop_templates"
    id = Column(Integer, primary_key=True)
    template_id = Column(String(128), unique=True, index=True)
    tesira_device_id = Column(String(128), index=True)
    stream_in_tags = Column(JSON)
    stream_out_tags = Column(JSON)
    crosspoint_tags = Column(JSON)
    input_router_tag = Column(String(255))
    output_router_tag = Column(String(255))
    meter_tags = Column(JSON)
    bypass_tags = Column(JSON)
    channel_map_policy = Column(String(64), default="direct")
    validation_status = Column(String(32), default="unknown")
    validation_error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
```

**New**:

```python
class TesiraBlockDeclaration(Base):
    """Discovered or user-declared DSP block on a Tesira device."""
    __tablename__ = "tesira_block_declarations"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(128), nullable=False, index=True)
    instance_tag = Column(String(255), nullable=False)
    block_type = Column(String(64), nullable=False)
    channel_count = Column(Integer, default=1)
    discovered_at = Column(DateTime, default=datetime.utcnow)
    is_user_declared = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint('device_id', 'instance_tag'),
    )

class TesiraSceneSnapshot(Base):
    """Stored DSP parameter snapshot for recall."""
    __tablename__ = "tesira_scene_snapshots"

    id = Column(Integer, primary_key=True)
    scene_id = Column(String(128), unique=True, nullable=False, index=True)
    device_id = Column(String(128), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    block_states = Column(JSON, default=dict)  # {instance_tag: {param: value, ...}}
    created_at = Column(DateTime, default=datetime.utcnow)
```

### Config (`~/.map2/config.json`)

**Existing keys (keep)**:
- `tesira.enabled` — master enable/disable
- `tesira.devices` — device list `[{host, port, name, enabled, metering_tags}]`
- `tesira.metering_interval_ms` — TTP subscription interval (default 100)
- `tesira.ptp_slave_mode` — PTP coordination enable (default true)

**New keys**:
- `tesira.max_devices` — fleet size limit (default 5, max 16)
- `tesira.auto_probe_dsp` — auto-discover DSP blocks on connect (default true)
- `tesira.ssh_enabled` — allow SSH TTP transport (default true)
- `tesira.ssh_credentials` — `{username, password}` for SSH (default: `{default, default}`)
- `tesira.probe_interval_s` — re-probe DSP blocks interval (default 300)

### In-Memory Storage (not persisted)

| Data | Store | Lifetime |
|------|-------|----------|
| Metering history | `TesiraMetricsStore` (deque, 300 entries per tag) | Process lifetime |
| Probe state per block | `TesiraDspModel._probe_state` dict | Process lifetime |
| Connection stats (latency, reconnects) | `TTPClient._stats` | Per connection |

---

## 21. Security and Safety

### Authentication

| Transport | Auth Method | Notes |
|-----------|------------|-------|
| TTP (Telnet) port 23 | None | Factory-reset units have no password. Biamp design. |
| TTP over SSH port 22 | Username/password | Stored in config `tesira.ssh_credentials`. Never logged. |
| Port 61451 | None | Undocumented Biamp protocol, no auth. |
| MAP2 REST API | None (localhost) | Assumes secured network. Add auth hook if needed. |
| MAP2 WebSocket | None (localhost) | Same as REST. |

### Safety Guards

| Operation | Guard |
|-----------|-------|
| Device reboot | Confirmation dialog in UI + rate limit (1 per 60s) |
| Preset recall | Confirmation if chain is active (audio will change) |
| Crosspoint mute-all | Undo buffer (store previous matrix state before bulk mute) |
| Scene recall | Show diff of what will change before applying |
| GPIO write | Confirmation for each pin state change |
| Bulk-set | Validate all params before applying any (atomic fail-fast) |
| PTP master demotion | Automatic but has config kill-switch (`tesira.ptp_slave_mode=false`) |

### Rate Limiting

TTP commands are serialized per-device via `asyncio.Lock` in `TTPClient` (existing). Add configurable rate limit:

```python
# In ttp_client.py, after acquiring lock:
if self._rate_limiter:
    await self._rate_limiter.acquire()  # Token bucket, default 50 cmd/s
```

### Network Security

- TTP port 23 traffic is LAN-only (Tesira units on isolated audio VLAN)
- MAP2 FastAPI bound to localhost or LAN interface
- SSH passwords never appear in API responses or logs
- No credentials in WebSocket broadcasts

---

## 22. Migration and Replacement Plan

### Strategy: In-Place Enhancement

This is **not** a rewrite. All existing services are kept and extended. The migration is primarily a frontend navigation restructure + backend endpoint additions.

### Phase-by-Phase Migration

**Phase 1 (Backend)**:
- Add new services alongside existing ones
- New endpoints added to existing route files
- Database migration adds new tables (non-destructive)
- All existing API contracts preserved
- Zero breaking changes

**Phase 2 (Frontend)**:
- `TesiraControlPanel.tsx` refactored from tabs to `<Outlet>` router
- Existing tab components extracted to standalone route components
- Old tab URLs (`/tesira?tab=levels`) redirect to new routes (`/tesira/:id/levels`)
- All existing React Query keys preserved

**Phase 3 (AVB)**:
- Extend `AvbRouting` node tree to show Tesira-to-Tesira connections
- Add new components alongside existing ones
- No changes to `avb_router.py` API contracts

**Phase 4 (Advanced)**:
- SSH transport is additive (new class, existing interface)
- Reverse sync adds WS events (additive, no breaking changes)
- Scene snapshots are new DB table (non-destructive)

### Rollback Safety

- All database migrations are additive (new tables/columns, no drops)
- All new endpoints are additive (no existing endpoints modified or removed)
- Feature flags: `tesira.auto_probe_dsp`, `tesira.ssh_enabled` default off for conservative rollout
- Git branch per phase — independent merge and revert

### Validation Approach

After each phase:
1. Existing tests must pass (`tests/tesira/test_tesira_fleet.py`, `test_routes_tesira.py`)
2. New tests for new functionality
3. `tsc --noEmit` + `vite build` must pass
4. Manual verification: fleet discovery → device control → parameter edit

---

## 23. Testing Strategy

### Backend Tests (pytest)

**Existing (must continue passing)**:
- `tests/tesira/test_tesira_fleet.py` — fleet lifecycle, config, device lists
- `tests/tesira/test_routes_tesira.py` — API endpoint mocks

**New tests**:

| Test File | Coverage |
|-----------|----------|
| `tests/tesira/test_dsp_model.py` | Block probing with mock TTP responses, parameter read/write, bulk operations |
| `tests/tesira/test_metrics.py` | Ring buffer overflow, history queries, peak calculation |
| `tests/tesira/test_capabilities.py` | Model string lookup, fallback for unknown models |
| `tests/tesira/test_dsp_routes.py` | DSP endpoint validation (404/503/200 responses) |
| `tests/tesira/test_gpio_routes.py` | GPIO read/write endpoints |
| `tests/tesira/test_scene_routes.py` | Scene capture/recall/delete lifecycle |

**Mock strategy**: All TTP commands mocked via `AsyncMock` on `TTPClient.send()`. No real hardware required.

### Frontend Tests (Vitest + React Testing Library)

| Test | Coverage |
|------|----------|
| `TesiraDeviceCard.test.tsx` | Renders all connection states correctly |
| `TesiraDspExplorer.test.tsx` | Block tree filtering, parameter editing |
| `TesiraMixerView.test.tsx` | Crosspoint grid interaction (click, double-click) |
| `TesiraDeviceDashboard.test.tsx` | Summary cards with mock data |
| `TesiraSettingsView.test.tsx` | GPIO toggle, firmware display |

### Integration Tests

| Test | Scope |
|------|-------|
| Discovery → adopt → dashboard | Full fleet management flow with mock WS |
| DSP probe → param edit | Block discovery + parameter control |
| Preset interlock trigger | MAP2 preset → Tesira recall chain |
| Scene capture → recall | Full snapshot lifecycle |

### Device Simulation

For E2E testing without hardware, use a **mock TTP server**:

```python
# tests/tesira/mock_ttp_server.py
class MockTTPServer:
    """TCP server that speaks TTP protocol with canned responses."""

    CANNED_RESPONSES = {
        ("device", "get", "hostname"): '+OK value="MockForte"',
        ("device", "get", "serialNumber"): '+OK value="MOCK123456"',
        ("LevelControl1", "get", "level", "1"): '+OK value="-6.000000"',
        # ... more canned responses
    }
```

---

## 24. Performance and Scalability

### Backend Performance Targets

| Operation | Target | Bottleneck |
|-----------|--------|------------|
| TTP command round-trip | <50ms | Network latency (LAN) |
| DSP block probe (full device, 100 blocks) | <5s | Sequential TTP queries |
| Metering push → WS broadcast | <50ms | Python event loop |
| Fleet operations (5 devices, parallel) | <1s total | Concurrent TTP connections |
| Bulk-set (20 params) | <500ms | Sequential TTP per device |
| Scene capture (30 blocks × 5 params) | <3s | Sequential TTP reads |

### Frontend Performance Targets

| View | Render Target | Strategy |
|------|--------------|----------|
| Fleet overview (5 devices) | <100ms | React Query cache + memo'd cards |
| Device dashboard | <200ms | Parallel API calls via Promise.all |
| DSP block tree (100 blocks) | <100ms | Virtualized list if >50 items |
| Mixer matrix (12×8) | <50ms per interaction | Optimistic update, debounced PUT |
| Metering animation | 60fps | RequestAnimationFrame, canvas for history chart |

### Scalability Limits

| Dimension | Current | Target | Hard Limit |
|-----------|---------|--------|------------|
| Fleet devices | 5 | 16 (configurable) | TTP connection count |
| Metering subscriptions per device | ~10 | 64 | TTP push bandwidth |
| DSP blocks tracked per device | 0 | 500 | In-memory storage |
| Metering history per instance_tag | 0 | 300 readings (30s at 10Hz) | Memory |
| WebSocket clients | 10 | 10 | Existing WS manager |
| Concurrent TTP commands per device | 1 (lock-serialized) | 1 | TTP protocol limitation |

### Optimization Notes

- TTP is inherently serial per connection (one command at a time). Bulk operations help by reducing HTTP overhead but TTP commands are still sequential.
- DSP block probing parallelizes across devices (5 concurrent probes for 5 devices) but is sequential within a device.
- Metering history uses `collections.deque(maxlen=300)` — O(1) append, O(n) read, negligible memory (~50KB per instance_tag).

---

## 25. Delivery Roadmap

### Phase 1: Backend Foundations (Week 1-2)

**Week 1**:
- [ ] Create `app/services/tesira/tesira_dsp_model.py` with block probing
- [ ] Create `app/services/tesira/capabilities.py` with device family registry
- [ ] Add EQ gain/Q route endpoints to `app/routes/tesira.py`
- [ ] Add crosspoint mute + full matrix read endpoints
- [ ] Create `TesiraBlockDeclaration` DB table + Alembic migration

**Week 2**:
- [ ] Create `app/services/tesira/tesira_metrics.py` ring buffer
- [ ] Add bulk-get/bulk-set endpoints
- [ ] Add GPIO endpoints
- [ ] Add scene snapshot endpoints + `TesiraSceneSnapshot` DB table
- [ ] Add fleet health + PTP topology endpoints
- [ ] Write backend tests for all new services

### Phase 2: Frontend Unification (Week 3-4)

**Week 3**:
- [ ] Refactor `TesiraControlPanel.tsx` from tabs to React Router `<Outlet>`
- [ ] Add routes in `App.tsx`: `/tesira/:id/dashboard|dsp|levels|mixer|eq|presets|loops|faults|settings`
- [ ] Create `TesiraDeviceDashboard.tsx` (3 summary cards + quick links)
- [ ] Create `TesiraDeviceSettings.tsx` (firmware + network + GPIO)
- [ ] Enhance `TesiraLevelsTab` with `AudioMeter` component

**Week 4**:
- [ ] Create `TesiraDspExplorer.tsx` + `TesiraDspBlockPanel.tsx` + `TesiraDspProbeDialog.tsx`
- [ ] Enhance `TesiraMixerTab` with interactive crosspoint grid
- [ ] Enhance `TesiraEQTab` with SVG frequency response curve
- [ ] Relocate `TesiraLoopBuilderTab` to device sub-route
- [ ] Extend `useTesiraApi.ts` with DSP/GPIO/scene queries
- [ ] Write frontend component tests

### Phase 3: AVB Integration (Week 5)

- [ ] Extend AvbRouting node tree to show Tesira-to-Tesira connections
- [ ] Add stream health indicators to Tesira device views
- [ ] Create `TesiraPtpTopology.tsx` component
- [ ] Create `TesiraFleetHealth.tsx` aggregated fleet status view
- [ ] Add cross-navigation links (fleet → routing, device → routing, routing → device)
- [ ] Apply `useRealtimePollingGating` to all Tesira queries

### Phase 4: Advanced Features (Week 6)

- [ ] Create `app/services/tesira/ttp_ssh_client.py` (asyncssh)
- [ ] Add transport selection to `TesiraDevice` (auto/telnet/ssh)
- [ ] Implement reverse preset sync detection via TTP subscription
- [ ] Create scene capture/recall UI in `TesiraSettingsView`
- [ ] Create GPIO control UI in `TesiraSettingsView`
- [ ] Add metering history charts to `TesiraDiagnosticsView`
- [ ] End-to-end integration testing

---

## 26. Final Implementation-Ready Specification

### Summary of Deliverables

| Category | New | Modified | Kept As-Is |
|----------|-----|----------|------------|
| **Backend services** | 4 new files | 3 extended | 5 unchanged |
| **API endpoints** | ~15 new | ~5 extended | ~25 unchanged |
| **Frontend components** | ~8 new files | ~5 refactored | ~10 unchanged |
| **Database tables** | 2 new | 0 | 2 unchanged |
| **C++ engine** | 0 | 0 | 3 unchanged |
| **Config keys** | 5 new | 0 | 4 unchanged |
| **WebSocket topics** | 3 new | 1 extended | 4 unchanged |
| **Tests** | ~8 new test files | 0 | 2 unchanged |

### File Manifest

**Create**:
```
app/services/tesira/tesira_dsp_model.py
app/services/tesira/ttp_ssh_client.py
app/services/tesira/tesira_metrics.py
app/services/tesira/capabilities.py
app/routes/tesira_dsp.py  (or merge into tesira.py)
web/src/app/components/Tesira/components/TesiraDeviceDashboard.tsx
web/src/app/components/Tesira/components/TesiraDspExplorer.tsx
web/src/app/components/Tesira/components/TesiraDspBlockPanel.tsx
web/src/app/components/Tesira/components/TesiraDspProbeDialog.tsx
web/src/app/components/Tesira/components/TesiraDeviceSettings.tsx
web/src/app/components/Tesira/components/TesiraGpioPanel.tsx
web/src/app/components/Tesira/components/TesiraPtpTopology.tsx
web/src/app/components/Tesira/components/TesiraFleetHealth.tsx
web/src/app/components/Tesira/components/TesiraCrosspointCell.tsx
web/src/app/components/Tesira/components/TesiraEqCurve.tsx
tests/tesira/test_dsp_model.py
tests/tesira/test_metrics.py
tests/tesira/test_capabilities.py
tests/tesira/test_dsp_routes.py
tests/tesira/test_gpio_routes.py
tests/tesira/test_scene_routes.py
tests/tesira/mock_ttp_server.py
```

**Modify**:
```
app/services/tesira/tesira_device.py      — transport selection, DSP model accessor, GPIO, capabilities
app/services/tesira/tesira_fleet.py       — configurable max_devices, fleet health, metrics integration
app/services/tesira/preset_interlock.py   — reverse sync detection
app/routes/tesira.py                      — extended EQ/crosspoint/GPIO/scene/fleet endpoints
app/database.py                           — TesiraBlockDeclaration, TesiraSceneSnapshot tables
web/src/app/App.tsx                       — Tesira sub-routes
web/src/app/components/Tesira/components/TesiraControlPanel.tsx  — refactor to router outlet
web/src/app/components/Tesira/context/TesiraContext.tsx          — extend with DSP state
web/src/app/components/Tesira/hooks/useTesiraApi.ts             — add DSP/GPIO/scene queries
web/src/app/components/Tesira/components/TesiraLevelsTab.tsx     — add AudioMeter
web/src/app/components/Tesira/components/TesiraMixerTab.tsx      — interactive grid
web/src/app/components/Tesira/components/TesiraEQTab.tsx         — visual curve
web/src/app/components/Tesira/components/TesiraFaultsTab.tsx     — expanded diagnostics
```

**Keep unchanged**:
```
app/services/tesira/ttp_client.py
app/services/tesira/discovery.py
app/services/tesira/ptp_coordinator.py
app/services/tesira/firmware_service.py
app/services/tesira/port61451_probe.py
juce-engine/Source/TesiraAvbNode.h/cpp
juce-engine/Source/AvdeccController.h/cpp
juce-engine/Source/Map2AudioEngine.h/cpp
```

### Verification Checklist

After each phase:
- [ ] All existing tests pass: `pytest tests/tesira/`
- [ ] All new tests pass: `pytest tests/tesira/test_dsp_model.py tests/tesira/test_metrics.py ...`
- [ ] TypeScript compiles: `cd web && npx tsc --noEmit`
- [ ] Frontend builds: `cd web && npx vite build`
- [ ] Manual smoke test: discover device → dashboard → DSP explorer → parameter control → effects loop
- [ ] WebSocket events fire correctly in browser console

### Risk Areas

| Risk | Mitigation |
|------|-----------|
| TTP probing may miss non-standard block names | Allow manual block declaration; probe patterns are configurable |
| SSH transport may not work on all Tesira firmware versions | Feature flagged (`tesira.ssh_enabled`); Telnet remains primary |
| Large DSP configs (100+ blocks) may slow probing | Parallel probing across devices; sequential within device is TTP limitation |
| Crosspoint matrix read for large mixers (56x56) may be slow | Cache matrix state; incremental updates via WS |
| Scene snapshot recall may audibly glitch | Rate-limit TTP SET commands during recall; consider preset recall instead |

---
---

## Appendix A — Codex Spark Execution Guide

> **This appendix contains step-by-step implementation instructions with exact file paths, imports, class definitions, and code patterns.** Each task is self-contained and can be executed independently. Tasks are ordered by dependency — complete them in sequence within each phase.
>
> **Conventions**: All Python code uses `async/await`. All FastAPI routes use `APIRouter`. All React components use functional components with hooks. All database models use SQLAlchemy declarative base from `app/database.py`. Config uses `app/config.py`'s `config_get()` / `config_set()`.

---

### PHASE 1: Backend Foundations

---

#### Task 1.1: Create `app/services/tesira/capabilities.py`

**Purpose**: Static device family capability registry. No external dependencies.

**Create file** at `app/services/tesira/capabilities.py`:

```python
"""Biamp Tesira device family capability registry."""

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class TesiraCapabilities:
    analog_inputs: int
    analog_outputs: int
    usb_channels: int
    avb_max_channels: int
    aec_channels: int
    gpio_count: int
    rs232: bool
    dsp_partitions: int
    has_dante: bool
    has_avb: bool


TESIRA_CAPABILITIES: Dict[str, TesiraCapabilities] = {
    "TesiraFORTE CI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=32, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraFORTE AVB CI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=32, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraFORTE VI": TesiraCapabilities(
        analog_inputs=4, analog_outputs=4, usb_channels=8,
        avb_max_channels=32, aec_channels=4, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraFORTE AVB VI": TesiraCapabilities(
        analog_inputs=4, analog_outputs=4, usb_channels=8,
        avb_max_channels=32, aec_channels=4, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraFORTE DAN CI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=0, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=True, has_avb=False,
    ),
    "TesiraFORTE TI": TesiraCapabilities(
        analog_inputs=12, analog_outputs=8, usb_channels=8,
        avb_max_channels=0, aec_channels=12, gpio_count=4,
        rs232=True, dsp_partitions=4, has_dante=True, has_avb=False,
    ),
    "TesiraSERVER": TesiraCapabilities(
        analog_inputs=0, analog_outputs=0, usb_channels=0,
        avb_max_channels=32, aec_channels=0, gpio_count=0,
        rs232=False, dsp_partitions=4, has_dante=False, has_avb=True,
    ),
    "TesiraSERVER-IO": TesiraCapabilities(
        analog_inputs=0, analog_outputs=0, usb_channels=0,
        avb_max_channels=32, aec_channels=0, gpio_count=0,
        rs232=False, dsp_partitions=0, has_dante=False, has_avb=True,
    ),
}


def get_capabilities(model: str) -> Optional[TesiraCapabilities]:
    """Lookup capabilities by model string from TTP 'device get model'.

    Tries exact match first, then substring match for variants.
    """
    if model in TESIRA_CAPABILITIES:
        return TESIRA_CAPABILITIES[model]
    # Fuzzy match: "TesiraFORTE AVB CI" should match "TesiraFORTE CI" entry
    for key, caps in TESIRA_CAPABILITIES.items():
        if key in model or model in key:
            return caps
    return None
```

**Verification**: `python -c "from app.services.tesira.capabilities import get_capabilities; print(get_capabilities('TesiraFORTE CI'))"` should print the dataclass.

---

#### Task 1.2: Create `app/services/tesira/tesira_metrics.py`

**Purpose**: In-memory ring buffer for metering history.

**Create file** at `app/services/tesira/tesira_metrics.py`:

```python
"""Metering history ring buffer for Tesira devices."""

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class MeterReading:
    timestamp: float
    levels_dbu: List[float]


@dataclass
class MeterSummary:
    instance_tag: str
    peak_dbu: List[float]
    rms_dbu: List[float]
    reading_count: int


class TesiraMetricsStore:
    """Ring buffer storing last N meter readings per (device_id, instance_tag).

    Thread safety: designed for single-writer (fleet callback) / multi-reader (API).
    deque is thread-safe for append/iterate in CPython.
    """

    RING_SIZE = 300  # ~30 seconds at 10Hz

    def __init__(self, ring_size: int = RING_SIZE) -> None:
        self._ring_size = ring_size
        # Key: (device_id, instance_tag) -> deque of MeterReading
        self._buffers: Dict[Tuple[str, str], deque] = defaultdict(
            lambda: deque(maxlen=self._ring_size)
        )

    def push(
        self,
        device_id: str,
        instance_tag: str,
        levels_dbu: List[float],
        timestamp: Optional[float] = None,
    ) -> None:
        """Add a meter reading to the ring buffer."""
        ts = timestamp if timestamp is not None else time.time()
        key = (device_id, instance_tag)
        self._buffers[key].append(MeterReading(timestamp=ts, levels_dbu=list(levels_dbu)))

    def get_history(
        self,
        device_id: str,
        instance_tag: str,
        count: int = 300,
    ) -> List[MeterReading]:
        """Get last N readings, oldest first."""
        key = (device_id, instance_tag)
        buf = self._buffers.get(key)
        if not buf:
            return []
        readings = list(buf)
        return readings[-count:] if count < len(readings) else readings

    def get_peak(
        self,
        device_id: str,
        instance_tag: str,
        window_s: float = 5.0,
    ) -> List[float]:
        """Get peak level per channel over given time window."""
        key = (device_id, instance_tag)
        buf = self._buffers.get(key)
        if not buf:
            return []
        cutoff = time.time() - window_s
        peaks: Optional[List[float]] = None
        for reading in buf:
            if reading.timestamp < cutoff:
                continue
            if peaks is None:
                peaks = list(reading.levels_dbu)
            else:
                for i, lvl in enumerate(reading.levels_dbu):
                    if i < len(peaks):
                        peaks[i] = max(peaks[i], lvl)
                    else:
                        peaks.append(lvl)
        return peaks or []

    def get_summary(self, device_id: str) -> Dict[str, MeterSummary]:
        """Get peak + approximate RMS per instance_tag for a device."""
        result: Dict[str, MeterSummary] = {}
        for (dev_id, tag), buf in self._buffers.items():
            if dev_id != device_id or not buf:
                continue
            readings = list(buf)
            if not readings:
                continue
            ch_count = len(readings[0].levels_dbu)
            peaks = [-200.0] * ch_count
            sums = [0.0] * ch_count
            for r in readings:
                for i in range(min(ch_count, len(r.levels_dbu))):
                    peaks[i] = max(peaks[i], r.levels_dbu[i])
                    sums[i] += r.levels_dbu[i]
            n = len(readings)
            rms = [s / n for s in sums]  # Approximate: mean of dB values
            result[tag] = MeterSummary(
                instance_tag=tag,
                peak_dbu=peaks,
                rms_dbu=rms,
                reading_count=n,
            )
        return result

    def clear_device(self, device_id: str) -> None:
        """Remove all history for a device (e.g., on disconnect)."""
        keys_to_remove = [k for k in self._buffers if k[0] == device_id]
        for k in keys_to_remove:
            del self._buffers[k]
```

**Verification**: `python -c "from app.services.tesira.tesira_metrics import TesiraMetricsStore; s = TesiraMetricsStore(); s.push('d1', 'LevelControl1', [-6.0, -9.0]); print(s.get_history('d1', 'LevelControl1'))"` should print one MeterReading.

---

#### Task 1.3: Create `app/services/tesira/tesira_dsp_model.py`

**Purpose**: Runtime DSP block discovery via TTP probing.

**Dependencies**: Requires `TesiraDevice` from `tesira_device.py` (uses its `_client.send()` method).

**Create file** at `app/services/tesira/tesira_dsp_model.py`:

```python
"""Runtime DSP block discovery and parameter control for Tesira devices.

Probes standard Tesira block naming conventions via TTP to discover
what DSP blocks exist on a device, then provides bulk read/write access
to their parameters.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ── Block type → parameter definitions ──────────────────────────────────────

BLOCK_PARAM_MAP: Dict[str, Dict[str, Dict[str, Any]]] = {
    "level_control": {
        "level":    {"type": "float", "unit": "dB", "min": -100.0, "max": 12.0, "canary": True, "index_arg": True},
        "mute":     {"type": "bool", "unit": "", "index_arg": True},
        "minLevel": {"type": "float", "unit": "dB"},
        "maxLevel": {"type": "float", "unit": "dB"},
    },
    "mixer": {
        "crosspointLevelOut": {"type": "float", "unit": "dB", "min": -100.0, "max": 12.0, "canary": True, "matrix_arg": True},
        "crosspointMuteOut":  {"type": "bool", "unit": "", "matrix_arg": True},
    },
    "router": {
        "output": {"type": "int", "unit": "", "canary": True, "index_arg": True},
    },
    "peq": {
        "eqBandFrequency": {"type": "float", "unit": "Hz", "min": 20.0, "max": 20000.0, "canary": True, "index_arg": True},
        "eqBandGain":      {"type": "float", "unit": "dB", "min": -15.0, "max": 15.0, "index_arg": True},
        "eqBandQ":         {"type": "float", "unit": "", "min": 0.1, "max": 35.0, "index_arg": True},
        "eqBandType":      {"type": "int", "unit": "", "index_arg": True},
        "bypass":          {"type": "bool", "unit": ""},
    },
    "geq": {
        "bandLevel": {"type": "float", "unit": "dB", "min": -15.0, "max": 15.0, "canary": True, "index_arg": True},
        "bypass":    {"type": "bool", "unit": ""},
    },
    "compressor": {
        "threshold": {"type": "float", "unit": "dB", "min": -60.0, "max": 0.0, "canary": True},
        "ratio":     {"type": "float", "unit": "", "min": 1.0, "max": 20.0},
        "attack":    {"type": "float", "unit": "ms", "min": 0.1, "max": 200.0},
        "release":   {"type": "float", "unit": "ms", "min": 1.0, "max": 5000.0},
        "gain":      {"type": "float", "unit": "dB"},
        "bypass":    {"type": "bool", "unit": ""},
    },
    "limiter": {
        "threshold": {"type": "float", "unit": "dB", "min": -60.0, "max": 0.0, "canary": True},
        "attack":    {"type": "float", "unit": "ms", "min": 0.1, "max": 200.0},
        "release":   {"type": "float", "unit": "ms", "min": 1.0, "max": 5000.0},
        "bypass":    {"type": "bool", "unit": ""},
    },
    "gate": {
        "threshold": {"type": "float", "unit": "dB", "min": -80.0, "max": 0.0, "canary": True},
        "depth":     {"type": "float", "unit": "dB", "min": 0.0, "max": 80.0},
        "attack":    {"type": "float", "unit": "ms", "min": 0.01, "max": 200.0},
        "hold":      {"type": "float", "unit": "ms", "min": 0.0, "max": 4000.0},
        "release":   {"type": "float", "unit": "ms", "min": 1.0, "max": 5000.0},
        "bypass":    {"type": "bool", "unit": ""},
    },
    "ducker": {
        "threshold": {"type": "float", "unit": "dB", "min": -80.0, "max": 0.0, "canary": True},
        "depth":     {"type": "float", "unit": "dB", "min": 0.0, "max": 80.0},
        "attack":    {"type": "float", "unit": "ms", "min": 0.01, "max": 200.0},
        "hold":      {"type": "float", "unit": "ms", "min": 0.0, "max": 4000.0},
        "release":   {"type": "float", "unit": "ms", "min": 1.0, "max": 5000.0},
        "bypass":    {"type": "bool", "unit": ""},
    },
    "leveler": {
        "targetLevel": {"type": "float", "unit": "dB", "canary": True},
        "speed":       {"type": "float", "unit": ""},
        "bypass":      {"type": "bool", "unit": ""},
    },
    "anc": {
        "ambientLevel": {"type": "float", "unit": "dB", "canary": True},
        "maxBoost":     {"type": "float", "unit": "dB"},
        "bypass":       {"type": "bool", "unit": ""},
    },
    "delay": {
        "delay":  {"type": "float", "unit": "ms", "min": 0.0, "max": 2000.0, "canary": True},
        "bypass": {"type": "bool", "unit": ""},
    },
    "aec": {
        "aecEnabled": {"type": "bool", "unit": "", "canary": True},
        "nlpMode":    {"type": "int", "unit": ""},
        "nlpLevel":   {"type": "float", "unit": "dB"},
    },
    "source_selector": {
        "sourceSelection": {"type": "int", "unit": "", "canary": True},
    },
    "room_combiner": {
        "wallState": {"type": "bool", "unit": "", "canary": True, "index_arg": True},
        "group":     {"type": "int", "unit": "", "index_arg": True},
    },
    "logic_state": {
        "state": {"type": "bool", "unit": "", "canary": True, "index_arg": True},
    },
}

# ── Naming conventions: block_type → TTP instance tag prefix + max index ──

PROBE_PATTERNS: Dict[str, Tuple[str, int]] = {
    "level_control":    ("LevelControl", 32),
    "mixer":            ("Mixer", 8),
    "router":           ("Router", 8),
    "peq":              ("PEQ", 32),
    "geq":              ("GEQ", 8),
    "compressor":       ("Compressor", 16),
    "limiter":          ("Limiter", 16),
    "gate":             ("Gate", 16),
    "ducker":           ("Ducker", 8),
    "leveler":          ("Leveler", 8),
    "anc":              ("ANC", 8),
    "delay":            ("Delay", 16),
    "aec":              ("AEC", 12),
    "source_selector":  ("SourceSelector", 8),
    "room_combiner":    ("RoomCombiner", 4),
    "logic_state":      ("LogicState", 16),
}


# ── Data classes ────────────────────────────────────────────────────────────

@dataclass
class TesiraParam:
    name: str
    value_type: str
    current_value: Any = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    unit: str = ""
    is_subscribable: bool = False


@dataclass
class TesiraDspBlock:
    block_id: str           # Instance tag, e.g., "LevelControl1"
    block_type: str         # Key in BLOCK_PARAM_MAP
    channel_count: int = 1
    parameters: Dict[str, TesiraParam] = field(default_factory=dict)
    is_probed: bool = False
    is_user_declared: bool = False
    last_probed_at: Optional[float] = None


@dataclass
class ProbeResult:
    found: int = 0
    failed: int = 0
    blocks: List[TesiraDspBlock] = field(default_factory=list)
    duration_s: float = 0.0


# ── Main class ──────────────────────────────────────────────────────────────

class TesiraDspModel:
    """Runtime DSP block discovery and parameter control for one Tesira device.

    Usage:
        model = TesiraDspModel(device)
        result = await model.probe_all()
        params = await model.get_block_params("LevelControl1")
        await model.set_block_param("LevelControl1", "level", -12.0, channel=1)
    """

    def __init__(self, device: Any) -> None:
        """Args:
            device: TesiraDevice instance (must be connected).
        """
        self._device = device
        self._blocks: Dict[str, TesiraDspBlock] = {}

    @property
    def blocks(self) -> Dict[str, TesiraDspBlock]:
        return dict(self._blocks)

    async def probe_all(
        self,
        block_types: Optional[List[str]] = None,
    ) -> ProbeResult:
        """Probe device for DSP blocks using standard naming conventions.

        Args:
            block_types: List of block type keys (e.g., ["level_control", "peq"]).
                         If None, probes all types in PROBE_PATTERNS.

        Returns:
            ProbeResult with found/failed counts and list of discovered blocks.
        """
        start = time.monotonic()
        types_to_probe = block_types or list(PROBE_PATTERNS.keys())
        result = ProbeResult()

        for btype in types_to_probe:
            if btype not in PROBE_PATTERNS:
                logger.warning("Unknown block type for probing: %s", btype)
                continue
            prefix, max_idx = PROBE_PATTERNS[btype]
            # Probe sequentially; stop after 3 consecutive misses per type
            consecutive_misses = 0
            for idx in range(1, max_idx + 1):
                tag = f"{prefix}{idx}"
                block = await self.probe_block(tag, btype)
                if block:
                    result.found += 1
                    result.blocks.append(block)
                    consecutive_misses = 0
                else:
                    consecutive_misses += 1
                    if consecutive_misses >= 3:
                        break

        result.failed = sum(1 for _ in types_to_probe) - len(
            {b.block_type for b in result.blocks}
        )
        result.duration_s = time.monotonic() - start
        logger.info(
            "DSP probe complete for %s: found %d blocks in %.1fs",
            self._device.device_id if hasattr(self._device, 'device_id') else '?',
            result.found,
            result.duration_s,
        )
        return result

    async def probe_block(
        self,
        instance_tag: str,
        block_type: str,
    ) -> Optional[TesiraDspBlock]:
        """Probe a specific block by trying its canary attribute.

        Returns TesiraDspBlock if found, None if block doesn't exist.
        """
        param_defs = BLOCK_PARAM_MAP.get(block_type)
        if not param_defs:
            return None

        # Find canary attribute
        canary_attr = None
        for attr_name, attr_def in param_defs.items():
            if attr_def.get("canary"):
                canary_attr = attr_name
                break
        if canary_attr is None:
            canary_attr = next(iter(param_defs))

        # Build canary command args
        attr_def = param_defs[canary_attr]
        args: List[Any] = []
        if attr_def.get("index_arg"):
            args.append(1)  # Probe channel/band 1
        elif attr_def.get("matrix_arg"):
            args.extend([1, 1])  # Probe row 1, col 1

        try:
            resp = await self._device._client.send(
                instance_tag, "get", canary_attr, *args
            )
            if not resp.ok:
                return None
        except Exception:
            return None

        # Block exists — create entry
        block = TesiraDspBlock(
            block_id=instance_tag,
            block_type=block_type,
            is_probed=True,
            last_probed_at=time.time(),
        )

        # Populate parameter definitions (values not read yet — too slow during probe)
        for attr_name, attr_def in param_defs.items():
            block.parameters[attr_name] = TesiraParam(
                name=attr_name,
                value_type=attr_def.get("type", "float"),
                min_value=attr_def.get("min"),
                max_value=attr_def.get("max"),
                unit=attr_def.get("unit", ""),
            )

        self._blocks[instance_tag] = block
        return block

    async def get_block_params(
        self,
        instance_tag: str,
    ) -> Dict[str, Any]:
        """Read all known parameters for a block via TTP GET commands.

        Returns dict of {param_name: current_value}.
        """
        block = self._blocks.get(instance_tag)
        if not block:
            return {}

        param_defs = BLOCK_PARAM_MAP.get(block.block_type, {})
        result: Dict[str, Any] = {}

        for attr_name, attr_def in param_defs.items():
            args: List[Any] = []
            if attr_def.get("index_arg"):
                args.append(1)
            elif attr_def.get("matrix_arg"):
                args.extend([1, 1])

            try:
                resp = await self._device._client.send(
                    instance_tag, "get", attr_name, *args
                )
                if resp.ok:
                    result[attr_name] = resp.value
                    if attr_name in block.parameters:
                        block.parameters[attr_name].current_value = resp.value
            except Exception as e:
                logger.debug("Failed to read %s.%s: %s", instance_tag, attr_name, e)

        return result

    async def set_block_param(
        self,
        instance_tag: str,
        param: str,
        value: Any,
        channel: Optional[int] = None,
        row: Optional[int] = None,
        col: Optional[int] = None,
    ) -> bool:
        """Set a single parameter on a block via TTP SET command.

        Args:
            instance_tag: Block instance tag (e.g., "LevelControl1")
            param: Attribute name (e.g., "level", "mute")
            value: New value (float, bool, int)
            channel: Channel index for indexed params (1-based)
            row: Row index for matrix params (1-based)
            col: Column index for matrix params (1-based)

        Returns True on success.
        """
        args: List[Any] = []
        if row is not None and col is not None:
            args.extend([row, col])
        elif channel is not None:
            args.append(channel)
        args.append(value)

        try:
            resp = await self._device._client.send(
                instance_tag, "set", param, *args
            )
            if resp.ok:
                block = self._blocks.get(instance_tag)
                if block and param in block.parameters:
                    block.parameters[param].current_value = value
                return True
            logger.warning("SET failed: %s.%s = %s → %s", instance_tag, param, value, resp.error_detail)
            return False
        except Exception as e:
            logger.error("SET error: %s.%s = %s → %s", instance_tag, param, value, e)
            return False

    async def bulk_get(
        self,
        requests: List[Tuple[str, str]],
    ) -> Dict[str, Dict[str, Any]]:
        """Bulk-read: list of (instance_tag, param) → {tag: {param: value}}.

        Executes TTP GET commands sequentially (TTP is serial per connection).
        """
        result: Dict[str, Dict[str, Any]] = {}
        for tag, param in requests:
            try:
                resp = await self._device._client.send(tag, "get", param)
                if resp.ok:
                    result.setdefault(tag, {})[param] = resp.value
            except Exception:
                pass
        return result

    async def bulk_set(
        self,
        updates: List[Tuple[str, str, Any]],
    ) -> List[bool]:
        """Bulk-write: list of (instance_tag, param, value) → success flags.

        Executes TTP SET commands sequentially.
        """
        results: List[bool] = []
        for tag, param, value in updates:
            try:
                resp = await self._device._client.send(tag, "set", param, value)
                results.append(resp.ok)
            except Exception:
                results.append(False)
        return results

    def add_user_block(
        self,
        instance_tag: str,
        block_type: str,
        channel_count: int = 1,
    ) -> TesiraDspBlock:
        """Manually declare a block (user knows the instance tag)."""
        param_defs = BLOCK_PARAM_MAP.get(block_type, {})
        block = TesiraDspBlock(
            block_id=instance_tag,
            block_type=block_type,
            channel_count=channel_count,
            is_user_declared=True,
        )
        for attr_name, attr_def in param_defs.items():
            block.parameters[attr_name] = TesiraParam(
                name=attr_name,
                value_type=attr_def.get("type", "float"),
                min_value=attr_def.get("min"),
                max_value=attr_def.get("max"),
                unit=attr_def.get("unit", ""),
            )
        self._blocks[instance_tag] = block
        return block

    def to_dict_list(self) -> List[Dict[str, Any]]:
        """Serialize all discovered blocks for API response."""
        return [
            {
                "block_id": b.block_id,
                "block_type": b.block_type,
                "channel_count": b.channel_count,
                "is_probed": b.is_probed,
                "is_user_declared": b.is_user_declared,
                "last_probed_at": b.last_probed_at,
                "parameter_count": len(b.parameters),
            }
            for b in self._blocks.values()
        ]
```

**Verification**: Unit test — see Task 1.8.

---

#### Task 1.4: Add new DB tables to `app/database.py`

**Action**: Add two new SQLAlchemy model classes. Find the `TesiraInterlockRule` class (around line 899) and add the new classes AFTER it.

**Exact edit** — append after the `TesiraInterlockRule` class definition:

```python
class TesiraBlockDeclaration(Base):
    """Discovered or user-declared DSP block on a Tesira device."""
    __tablename__ = "tesira_block_declarations"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(128), nullable=False, index=True)
    instance_tag = Column(String(255), nullable=False)
    block_type = Column(String(64), nullable=False)
    channel_count = Column(Integer, default=1)
    discovered_at = Column(DateTime, default=datetime.utcnow)
    is_user_declared = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint('device_id', 'instance_tag', name='uq_tesira_block_device_tag'),
    )


class TesiraSceneSnapshot(Base):
    """Stored DSP parameter snapshot for recall."""
    __tablename__ = "tesira_scene_snapshots"

    id = Column(Integer, primary_key=True)
    scene_id = Column(String(128), unique=True, nullable=False, index=True)
    device_id = Column(String(128), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    block_states = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
```

**Required imports** — verify these exist at the top of `database.py` (add if missing):
- `from sqlalchemy import UniqueConstraint`
- `from sqlalchemy import Boolean` (should already be imported)

**Verification**: `python -c "from app.database import TesiraBlockDeclaration, TesiraSceneSnapshot; print('OK')"` should print OK.

---

#### Task 1.5: Add new config keys to `app/config.py`

**Action**: Find the `"tesira.ptp_slave_mode"` ConfigOption in the CONFIG_SCHEMA dict (around line 776) and add new entries AFTER it.

**Exact entries to add**:

```python
"tesira.max_devices": ConfigOption(
    key="tesira.max_devices",
    default=5,
    description="Maximum number of Tesira devices in fleet (1-16)",
    value_type=int,
    min_value=1,
    max_value=16,
),
"tesira.auto_probe_dsp": ConfigOption(
    key="tesira.auto_probe_dsp",
    default=True,
    description="Auto-discover DSP blocks when a device connects",
    value_type=bool,
),
"tesira.ssh_enabled": ConfigOption(
    key="tesira.ssh_enabled",
    default=False,
    description="Allow SSH as alternative TTP transport (port 22)",
    value_type=bool,
),
"tesira.probe_interval_s": ConfigOption(
    key="tesira.probe_interval_s",
    default=300,
    description="Interval to re-probe DSP blocks for staleness (seconds)",
    value_type=int,
    min_value=60,
    max_value=3600,
),
```

**Verification**: `python -c "from app.config import config_get; print(config_get('tesira.max_devices', 5))"` should print 5.

---

#### Task 1.6: Extend `app/routes/tesira.py` with new endpoints

**Action**: Add the following endpoints to the existing router. Add them AFTER the existing endpoints (before the file ends). Follow the exact same pattern as existing endpoints.

**New Pydantic models to add** (add near existing models at top of file):

```python
class SetEQBandGainRequest(BaseModel):
    gain_db: float = Field(..., ge=-15.0, le=15.0)

class SetEQBandQRequest(BaseModel):
    q: float = Field(..., ge=0.1, le=35.0)

class SetCrosspointMuteRequest(BaseModel):
    row: int = Field(..., ge=1)
    col: int = Field(..., ge=1)
    muted: bool

class SetGpioRequest(BaseModel):
    state: bool

class BulkGetRequest(BaseModel):
    requests: List[List[str]]  # [[instance_tag, param], ...]

class BulkSetRequest(BaseModel):
    updates: List[List[Any]]  # [[instance_tag, param, value], ...]

class CaptureSceneRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    block_ids: Optional[List[str]] = None
```

**New endpoints to add** (follow existing `_get_fleet()` / `_get_device()` pattern):

```python
# ── EQ band gain and Q ──────────────────────────────────────────────────

@router.put("/devices/{device_id}/eq/{instance_tag}/band/{band}/gain")
async def set_eq_band_gain(device_id: str, instance_tag: str, band: int, req: SetEQBandGainRequest):
    device = _get_device(device_id)
    _require_connected(device)
    await device.set_eq_band_gain(instance_tag, band, req.gain_db)
    return {"ok": True}


@router.put("/devices/{device_id}/eq/{instance_tag}/band/{band}/q")
async def set_eq_band_q(device_id: str, instance_tag: str, band: int, req: SetEQBandQRequest):
    device = _get_device(device_id)
    _require_connected(device)
    await device.set_eq_band_q(instance_tag, band, req.q)
    return {"ok": True}


@router.get("/devices/{device_id}/eq/{instance_tag}/band/{band}")
async def get_eq_band(device_id: str, instance_tag: str, band: int):
    device = _get_device(device_id)
    _require_connected(device)
    freq = await device._client.send(instance_tag, "get", "eqBandFrequency", band)
    gain = await device._client.send(instance_tag, "get", "eqBandGain", band)
    q = await device._client.send(instance_tag, "get", "eqBandQ", band)
    return {
        "frequency": freq.value if freq.ok else None,
        "gain": gain.value if gain.ok else None,
        "q": q.value if q.ok else None,
    }


# ── Crosspoint mute + full matrix read ──────────────────────────────────

@router.put("/devices/{device_id}/crosspoint/{instance_tag}/mute")
async def set_crosspoint_mute(device_id: str, instance_tag: str, req: SetCrosspointMuteRequest):
    device = _get_device(device_id)
    _require_connected(device)
    await device.set_crosspoint_mute(instance_tag, req.row, req.col, req.muted)
    return {"ok": True}


# ── GPIO ─────────────────────────────────────────────────────────────────

@router.get("/devices/{device_id}/gpio")
async def get_gpio(device_id: str):
    device = _get_device(device_id)
    _require_connected(device)
    pins = []
    for pin in range(1, 5):
        tag = f"LogicState{pin}"
        try:
            resp = await device._client.send(tag, "get", "state", 1)
            pins.append({"pin": pin, "state": bool(resp.value) if resp.ok else None})
        except Exception:
            pins.append({"pin": pin, "state": None})
    return {"pins": pins}


@router.get("/devices/{device_id}/gpio/{pin}")
async def get_gpio_pin(device_id: str, pin: int):
    device = _get_device(device_id)
    _require_connected(device)
    tag = f"LogicState{pin}"
    resp = await device._client.send(tag, "get", "state", 1)
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"GPIO read failed: {resp.error_detail}")
    return {"pin": pin, "state": bool(resp.value)}


@router.put("/devices/{device_id}/gpio/{pin}")
async def set_gpio_pin(device_id: str, pin: int, req: SetGpioRequest):
    device = _get_device(device_id)
    _require_connected(device)
    tag = f"LogicState{pin}"
    resp = await device._client.send(tag, "set", "state", 1, req.state)
    if not resp.ok:
        raise HTTPException(status_code=502, detail=f"GPIO write failed: {resp.error_detail}")
    return {"ok": True, "pin": pin, "state": req.state}


# ── DSP Block Discovery ─────────────────────────────────────────────────

@router.post("/devices/{device_id}/dsp/probe")
async def probe_dsp_blocks(device_id: str):
    device = _get_device(device_id)
    _require_connected(device)
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)
    result = await model.probe_all()
    return {
        "found": result.found,
        "failed": result.failed,
        "duration_s": round(result.duration_s, 1),
        "blocks": model.to_dict_list(),
    }


@router.get("/devices/{device_id}/dsp/blocks")
async def list_dsp_blocks(device_id: str):
    device = _get_device(device_id)
    _require_connected(device)
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)
    # If auto-probe hasn't run, return empty
    return model.to_dict_list()


@router.get("/devices/{device_id}/dsp/blocks/{instance_tag}/params")
async def get_dsp_block_params(device_id: str, instance_tag: str):
    device = _get_device(device_id)
    _require_connected(device)
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)
    # Probe this specific block to discover its type
    # Try common types until one works
    for btype in ["level_control", "mixer", "peq", "compressor", "limiter",
                   "gate", "delay", "aec", "leveler", "anc", "geq",
                   "router", "source_selector", "logic_state"]:
        block = await model.probe_block(instance_tag, btype)
        if block:
            params = await model.get_block_params(instance_tag)
            return {
                "block_id": instance_tag,
                "block_type": btype,
                "params": params,
            }
    raise HTTPException(status_code=404, detail=f"Block '{instance_tag}' not found on device")


@router.put("/devices/{device_id}/dsp/blocks/{instance_tag}/params/{param}")
async def set_dsp_block_param(device_id: str, instance_tag: str, param: str, req: dict = Body(...)):
    device = _get_device(device_id)
    _require_connected(device)
    value = req.get("value")
    channel = req.get("channel")
    row = req.get("row")
    col = req.get("col")
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)
    ok = await model.set_block_param(instance_tag, param, value, channel=channel, row=row, col=col)
    if not ok:
        raise HTTPException(status_code=502, detail=f"SET {instance_tag}.{param} failed")
    return {"ok": True, "value": value}


@router.post("/devices/{device_id}/dsp/bulk-get")
async def bulk_get_params(device_id: str, req: BulkGetRequest):
    device = _get_device(device_id)
    _require_connected(device)
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)
    tuples = [(r[0], r[1]) for r in req.requests if len(r) >= 2]
    result = await model.bulk_get(tuples)
    return result


@router.post("/devices/{device_id}/dsp/bulk-set")
async def bulk_set_params(device_id: str, req: BulkSetRequest):
    device = _get_device(device_id)
    _require_connected(device)
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)
    tuples = [(r[0], r[1], r[2]) for r in req.updates if len(r) >= 3]
    results = await model.bulk_set(tuples)
    return {"results": results}


# ── Scene Snapshots ──────────────────────────────────────────────────────

@router.post("/devices/{device_id}/scenes/capture")
async def capture_scene(device_id: str, req: CaptureSceneRequest):
    import uuid
    device = _get_device(device_id)
    _require_connected(device)
    from app.services.tesira.tesira_dsp_model import TesiraDspModel
    model = TesiraDspModel(device)

    # Probe all blocks first
    await model.probe_all()
    blocks_to_capture = req.block_ids or list(model.blocks.keys())

    block_states = {}
    for tag in blocks_to_capture:
        params = await model.get_block_params(tag)
        if params:
            block_states[tag] = params

    scene_id = str(uuid.uuid4())

    # Persist to DB
    from app.database import TesiraSceneSnapshot, get_session
    async with get_session() as session:
        snapshot = TesiraSceneSnapshot(
            scene_id=scene_id,
            device_id=device_id,
            name=req.name,
            block_states=block_states,
        )
        session.add(snapshot)
        await session.commit()

    return {"scene_id": scene_id, "name": req.name, "block_count": len(block_states)}


@router.get("/devices/{device_id}/scenes")
async def list_scenes(device_id: str):
    from app.database import TesiraSceneSnapshot, get_session
    from sqlalchemy import select
    async with get_session() as session:
        stmt = select(TesiraSceneSnapshot).where(
            TesiraSceneSnapshot.device_id == device_id
        ).order_by(TesiraSceneSnapshot.created_at.desc())
        result = await session.execute(stmt)
        scenes = result.scalars().all()
    return [
        {
            "scene_id": s.scene_id,
            "name": s.name,
            "block_count": len(s.block_states) if s.block_states else 0,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in scenes
    ]


@router.get("/devices/{device_id}/scenes/{scene_id}")
async def get_scene(device_id: str, scene_id: str):
    from app.database import TesiraSceneSnapshot, get_session
    from sqlalchemy import select
    async with get_session() as session:
        stmt = select(TesiraSceneSnapshot).where(
            TesiraSceneSnapshot.scene_id == scene_id,
            TesiraSceneSnapshot.device_id == device_id,
        )
        result = await session.execute(stmt)
        scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return {
        "scene_id": scene.scene_id,
        "name": scene.name,
        "block_states": scene.block_states,
        "created_at": scene.created_at.isoformat() if scene.created_at else None,
    }


@router.post("/devices/{device_id}/scenes/{scene_id}/recall")
async def recall_scene(device_id: str, scene_id: str):
    from app.database import TesiraSceneSnapshot, get_session
    from sqlalchemy import select
    async with get_session() as session:
        stmt = select(TesiraSceneSnapshot).where(
            TesiraSceneSnapshot.scene_id == scene_id,
            TesiraSceneSnapshot.device_id == device_id,
        )
        result = await session.execute(stmt)
        scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    device = _get_device(device_id)
    _require_connected(device)

    params_set = 0
    params_failed = 0
    for tag, params in (scene.block_states or {}).items():
        for param, value in params.items():
            try:
                resp = await device._client.send(tag, "set", param, value)
                if resp.ok:
                    params_set += 1
                else:
                    params_failed += 1
            except Exception:
                params_failed += 1

    return {"ok": True, "params_set": params_set, "params_failed": params_failed}


@router.delete("/devices/{device_id}/scenes/{scene_id}")
async def delete_scene(device_id: str, scene_id: str):
    from app.database import TesiraSceneSnapshot, get_session
    from sqlalchemy import select, delete as sa_delete
    async with get_session() as session:
        stmt = sa_delete(TesiraSceneSnapshot).where(
            TesiraSceneSnapshot.scene_id == scene_id,
            TesiraSceneSnapshot.device_id == device_id,
        )
        result = await session.execute(stmt)
        await session.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Scene not found")
    return {"ok": True}


# ── Metering History ─────────────────────────────────────────────────────

@router.get("/devices/{device_id}/meters/{instance_tag}/history")
async def get_meter_history(device_id: str, instance_tag: str, count: int = 300):
    fleet = _get_fleet()
    if not hasattr(fleet, '_metrics_store') or fleet._metrics_store is None:
        return []
    readings = fleet._metrics_store.get_history(device_id, instance_tag, count)
    return [{"timestamp": r.timestamp, "levels_dbu": r.levels_dbu} for r in readings]


@router.get("/devices/{device_id}/meters/{instance_tag}/peak")
async def get_meter_peak(device_id: str, instance_tag: str, window_s: float = 5.0):
    fleet = _get_fleet()
    if not hasattr(fleet, '_metrics_store') or fleet._metrics_store is None:
        return {"peak_levels_dbu": [], "window_s": window_s}
    peaks = fleet._metrics_store.get_peak(device_id, instance_tag, window_s)
    return {"peak_levels_dbu": peaks, "window_s": window_s}


# ── Fleet Health ─────────────────────────────────────────────────────────

@router.get("/fleet/health")
async def get_fleet_health():
    fleet = _get_fleet()
    devices = fleet.list_devices()
    connected = [d for d in devices if d.get("connected")]
    offline = [d for d in devices if not d.get("connected")]
    total_faults = sum(d.get("fault_count", 0) for d in devices)
    return {
        "devices_total": len(devices),
        "devices_connected": len(connected),
        "devices_offline": len(offline),
        "total_faults": total_faults,
        "devices": [
            {
                "device_id": d.get("device_id"),
                "connected": d.get("connected"),
                "faults": d.get("fault_count", 0),
                "ptp_state": d.get("ptp_state"),
            }
            for d in devices
        ],
    }
```

**Verification**: Start the backend (`uvicorn app.main:app`) and test:
- `curl http://localhost:8080/api/tesira/fleet/health` should return JSON
- `curl http://localhost:8080/api/tesira/devices/FAKE/gpio` should return 404

---

#### Task 1.7: Integrate `TesiraMetricsStore` into `TesiraFleet`

**Action**: Modify `app/services/tesira/tesira_fleet.py`.

**Edit 1** — Add import at top of file:
```python
from app.services.tesira.tesira_metrics import TesiraMetricsStore
```

**Edit 2** — In `TesiraFleet.__init__()`, add after `self._stopping = False`:
```python
        self._metrics_store = TesiraMetricsStore()
```

**Edit 3** — In the `_on_meter_push` method, find the line where it broadcasts via WebSocket (the `asyncio.create_task(self._broadcast('tesira:meters', ...))` call). Add this line BEFORE the broadcast:
```python
        self._metrics_store.push(device_id, instance_tag, levels_dbu)
```
where `levels_dbu` is the parsed list of float values from the TTP push (it's already extracted in the method as part of building the payload).

**Edit 4** — In `TesiraFleet.__init__()`, change `MAX_DEVICES = 5` to:
```python
    @property
    def MAX_DEVICES(self):
        from app.config import config_get
        return config_get("tesira.max_devices", 5)
```
Or simpler: just change the `_load_config` method to read it:
```python
    # In _load_config, replace the hardcoded 5-device limit check with:
    max_devices = config_get("tesira.max_devices", 5)
    self._configs = configs[:max_devices]
```

**Verification**: Existing tests must still pass: `pytest tests/tesira/test_tesira_fleet.py`

---

#### Task 1.8: Create backend tests

**Create file** `tests/tesira/test_dsp_model.py`:

```python
"""Tests for TesiraDspModel block probing."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.tesira.tesira_dsp_model import TesiraDspModel, ProbeResult


@pytest.fixture
def mock_device():
    device = MagicMock()
    device.device_id = "tesira_TEST123"
    device._client = AsyncMock()
    return device


@pytest.fixture
def dsp_model(mock_device):
    return TesiraDspModel(mock_device)


class TestProbeBlock:
    @pytest.mark.asyncio
    async def test_probe_existing_level_control(self, dsp_model, mock_device):
        mock_device._client.send.return_value = MagicMock(ok=True, value=-6.0)
        block = await dsp_model.probe_block("LevelControl1", "level_control")
        assert block is not None
        assert block.block_id == "LevelControl1"
        assert block.block_type == "level_control"
        assert block.is_probed is True
        assert "level" in block.parameters
        assert "mute" in block.parameters

    @pytest.mark.asyncio
    async def test_probe_nonexistent_block(self, dsp_model, mock_device):
        mock_device._client.send.return_value = MagicMock(ok=False, error_detail="not found")
        block = await dsp_model.probe_block("LevelControl99", "level_control")
        assert block is None

    @pytest.mark.asyncio
    async def test_probe_all_finds_blocks(self, dsp_model, mock_device):
        call_count = 0
        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            tag = args[0] if args else ""
            # Only LevelControl1 and PEQ1 exist
            if tag in ("LevelControl1", "PEQ1"):
                return MagicMock(ok=True, value=0.0)
            return MagicMock(ok=False, error_detail="not found")

        mock_device._client.send.side_effect = side_effect
        result = await dsp_model.probe_all(block_types=["level_control", "peq"])
        assert result.found == 2
        assert len(result.blocks) == 2


class TestSetBlockParam:
    @pytest.mark.asyncio
    async def test_set_level(self, dsp_model, mock_device):
        mock_device._client.send.return_value = MagicMock(ok=True)
        ok = await dsp_model.set_block_param("LevelControl1", "level", -12.0, channel=1)
        assert ok is True
        mock_device._client.send.assert_called_with("LevelControl1", "set", "level", 1, -12.0)

    @pytest.mark.asyncio
    async def test_set_crosspoint(self, dsp_model, mock_device):
        mock_device._client.send.return_value = MagicMock(ok=True)
        ok = await dsp_model.set_block_param("Mixer1", "crosspointLevelOut", -6.0, row=2, col=3)
        assert ok is True
        mock_device._client.send.assert_called_with("Mixer1", "set", "crosspointLevelOut", 2, 3, -6.0)


class TestBulkOps:
    @pytest.mark.asyncio
    async def test_bulk_get(self, dsp_model, mock_device):
        mock_device._client.send.return_value = MagicMock(ok=True, value=-6.0)
        result = await dsp_model.bulk_get([("LevelControl1", "level"), ("PEQ1", "eqBandFrequency")])
        assert "LevelControl1" in result
        assert "PEQ1" in result

    @pytest.mark.asyncio
    async def test_bulk_set(self, dsp_model, mock_device):
        mock_device._client.send.return_value = MagicMock(ok=True)
        results = await dsp_model.bulk_set([
            ("LevelControl1", "level", -12.0),
            ("LevelControl1", "mute", True),
        ])
        assert results == [True, True]
```

**Create file** `tests/tesira/test_metrics.py`:

```python
"""Tests for TesiraMetricsStore."""
import time
import pytest
from app.services.tesira.tesira_metrics import TesiraMetricsStore


class TestMetricsStore:
    def test_push_and_history(self):
        store = TesiraMetricsStore(ring_size=10)
        store.push("d1", "LevelControl1", [-6.0, -9.0])
        store.push("d1", "LevelControl1", [-3.0, -5.0])
        history = store.get_history("d1", "LevelControl1")
        assert len(history) == 2
        assert history[0].levels_dbu == [-6.0, -9.0]
        assert history[1].levels_dbu == [-3.0, -5.0]

    def test_ring_overflow(self):
        store = TesiraMetricsStore(ring_size=3)
        for i in range(5):
            store.push("d1", "tag", [float(i)])
        history = store.get_history("d1", "tag")
        assert len(history) == 3
        assert history[0].levels_dbu == [2.0]  # Oldest kept

    def test_peak(self):
        store = TesiraMetricsStore()
        now = time.time()
        store.push("d1", "tag", [-10.0, -20.0], timestamp=now - 1)
        store.push("d1", "tag", [-3.0, -15.0], timestamp=now)
        peaks = store.get_peak("d1", "tag", window_s=5.0)
        assert peaks == [-3.0, -15.0]

    def test_empty_device(self):
        store = TesiraMetricsStore()
        assert store.get_history("d1", "tag") == []
        assert store.get_peak("d1", "tag") == []

    def test_clear_device(self):
        store = TesiraMetricsStore()
        store.push("d1", "tag1", [-6.0])
        store.push("d1", "tag2", [-9.0])
        store.push("d2", "tag1", [-3.0])
        store.clear_device("d1")
        assert store.get_history("d1", "tag1") == []
        assert store.get_history("d1", "tag2") == []
        assert len(store.get_history("d2", "tag1")) == 1
```

**Create file** `tests/tesira/test_capabilities.py`:

```python
"""Tests for device capability registry."""
from app.services.tesira.capabilities import get_capabilities


class TestCapabilities:
    def test_exact_match(self):
        caps = get_capabilities("TesiraFORTE CI")
        assert caps is not None
        assert caps.analog_inputs == 12
        assert caps.analog_outputs == 8
        assert caps.avb_max_channels == 32
        assert caps.has_avb is True
        assert caps.has_dante is False

    def test_avb_variant(self):
        caps = get_capabilities("TesiraFORTE AVB CI")
        assert caps is not None
        assert caps.analog_inputs == 12

    def test_dan_model(self):
        caps = get_capabilities("TesiraFORTE DAN CI")
        assert caps is not None
        assert caps.has_dante is True
        assert caps.has_avb is False

    def test_unknown_model(self):
        caps = get_capabilities("UnknownDevice")
        assert caps is None

    def test_server(self):
        caps = get_capabilities("TesiraSERVER")
        assert caps is not None
        assert caps.analog_inputs == 0
        assert caps.dsp_partitions == 4
```

**Verification**: `pytest tests/tesira/test_dsp_model.py tests/tesira/test_metrics.py tests/tesira/test_capabilities.py -v`

---

### PHASE 1 COMPLETION CHECKLIST

Run these commands after completing all Phase 1 tasks:

```bash
# All existing tests still pass
pytest tests/tesira/ -v

# New tests pass
pytest tests/tesira/test_dsp_model.py tests/tesira/test_metrics.py tests/tesira/test_capabilities.py -v

# Python imports work
python -c "
from app.services.tesira.capabilities import get_capabilities
from app.services.tesira.tesira_metrics import TesiraMetricsStore
from app.services.tesira.tesira_dsp_model import TesiraDspModel
from app.database import TesiraBlockDeclaration, TesiraSceneSnapshot
print('All Phase 1 imports OK')
"
```

---

### PHASE 2-4: Frontend & Advanced (Execution Guide)

> **Note**: Phase 2-4 frontend tasks follow existing patterns exactly. The key files to study before starting:
>
> - **Route pattern**: `web/src/app/App.tsx` line 44 & 201 — lazy imports + `<Route>` elements
> - **Tab→Route refactor target**: `web/src/app/components/Tesira/components/TesiraControlPanel.tsx` — currently renders tabs 0-7 conditionally. Replace with React Router `<Outlet>`.
> - **Context pattern**: `web/src/app/components/Tesira/context/TesiraContext.tsx` — useState-based, extend with DSP state
> - **Query hook pattern**: `web/src/app/components/Tesira/hooks/useTesiraApi.ts` — `TESIRA_KEYS` object + `useQuery`/`useMutation` from `@tanstack/react-query`
> - **API client pattern**: `web/src/map2/api.ts` lines 3579-3728 — `tesiraApi` object with `fetch()` + `_json()` helper
> - **Component pattern**: All Tesira tabs use `deviceId: string` prop, MUI components, `useTesiraDevice()` for data
>
> Phase 2-4 frontend tasks are lower-risk and can be implemented iteratively. Each new component follows the exact same patterns as existing tabs. The critical backend work is all in Phase 1 above.
