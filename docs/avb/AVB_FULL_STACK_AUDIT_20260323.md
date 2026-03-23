# MAP2 AVB Full-Stack Audit Report

**Date**: 2026-03-23
**Auditor**: Claude Opus 4.6 (automated source-code audit)
**Codebase**: `master` branch, commit `3e3f17eb`
**Audit type**: Static source-code analysis + testbed status snapshot (no live hardware)

---

## Executive Summary

MAP2 has built a **substantial AVB software stack** spanning ~44,000 lines of code across C++ (3,881), Python services (13,087), API routes (5,806), setup scripts (3,362), Python tests (9,618), and frontend (14,183). The architecture covers IEEE 1722 AVTP audio transport, IEEE 1722.1 AVDECC device discovery/control via la_avdecc v4.3.1.1, JUCE AudioIODevice integration, Python service orchestration with SRP admission tracking, PTP monitoring, TSN qdisc management, a full N-to-M routing matrix UI, and Biamp Tesira TTP device control.

**However, the platform is NOT production-ready for AVB.**

### Critical findings

| Category | Count |
|----------|-------|
| **P0 blockers** (blocks basic AVB) | 6 |
| **P1 issues** (blocks compliance/interop) | 6 |
| **P2 gaps** (performance/resilience/cleanup) | 5 |
| **Total remediation tasks** | 17 |

### Key risks

1. **Zero live AVB audio observed** — no stream has ever carried audio on the testbed
2. **All HIL qualification gates BLOCKED** — Q04/Q05/Q06 cannot pass without hardware
3. **PTP stuck in INITIALIZING** — no grandmaster, no peer, no clock sync
4. **No discovered AVDECC entities** — controller wrapper exists but untested against real devices
5. **Biamp Tesira interop unverified** — TTP client works, AVB stream exchange never tested
6. **No SRP protocol implementation in C++** — Python service-level integration only
7. **Advanced TSN standards absent** — 802.1Qbv, 802.1Qbu, 802.1CB not implemented

### Readiness verdict

| Target | Ready? |
|--------|--------|
| MAP2 <-> MAP2 AVB audio | **NO** — unverified |
| MAP2 <-> Biamp Tesira AVB interop | **NO** — unverified |
| Production deployment | **NO** — blocked on hardware validation |

---

## Audit Scope and Test Context

### Scope
- All MAP2 source code related to AVB, AVTP, AVDECC, TSN, PTP, SRP, and Tesira
- Setup/deployment scripts and documentation
- Test infrastructure and qualification framework
- Frontend routing and observability surfaces

### Test environment (current testbed, 2026-03-23)
- **Host**: MAP2-TESTBED, Fedora 43, Linux 6.18.5
- **PTP state**: INITIALIZING (no peer)
- **Discovered nodes**: 0
- **Active streams**: 0
- **AVDECC entities**: 0
- **Tesira devices**: 0 connected

### Out of scope
- Runtime packet captures (no live traffic)
- Latency/jitter measurements (no streams)
- Multi-node cluster testing (single node only)
- Biamp Tesira hardware testing (no units available)

---

## Audit Methodology

1. **Source inventory**: Enumerated all AVB-related files by searching for AVB, AVTP, AVDECC, gPTP, SRP, TSN, Tesira keywords
2. **Code analysis**: Read all key implementation files, traced data flow from UI through API to C++ engine
3. **Standard mapping**: Mapped implementation against IEEE 802.1AS, 802.1Qav, 802.1Qat, 802.1Qbv, 802.1Qbu, 802.1CB, 1722, 1722.1
4. **Test analysis**: Counted and categorized all test functions, identified hardware-gated vs software-only tests
5. **Architecture tracing**: Traced AVB stream lifecycle from creation through transport to teardown
6. **Evidence classification**: Each finding labeled as VERIFIED / PARTIAL / MISSING / BROKEN / NOT TESTABLE / DELEGATED

---

## Layer 1: Hardware

### What exists
- **NIC detection**: `scripts/setup_avb.sh` (1,206 lines) enumerates `/sys/class/net/*`, calls `ethtool -T` to detect hardware timestamping, filters virtual interfaces
- **Hardware matrix**: `docs/avb-setup.md` documents tested NICs:
  - Intel I210 (I210-AT/IS) — 1 Gbps — Recommended
  - Intel I225 (I225-LM/IT) — 2.5 Gbps — Excellent
  - Intel I350-T4 — 1 Gbps — Limited
  - Marvell 88E6352 — Switch chip — Embedded only
- **Interface selection**: `MAP2_AVB_INTERFACE` env var or `/etc/map2/avb-enabled` marker file
- **Capability validation**: `AvbStream.h:246` `checkCapabilities()` verifies `CAP_NET_RAW` via libcap

### What works
- **VERIFIED**: NIC detection logic in setup scripts
- **VERIFIED**: ethtool-based TSN feature detection
- **VERIFIED**: Interface selection and validation chain

### What is missing / not testable
- **NOT TESTABLE**: No AVB-capable NIC currently connected to testbed
- **NOT TESTABLE**: Hardware timestamping not validated on live hardware
- **MISSING**: No automated NIC qualification test (only manual ethtool check)

### Evidence
- `scripts/setup_avb.sh` — hardware detection section
- `juce-engine/Source/AvbStream.h:246` — `checkCapabilities()`
- `docs/avb-setup.md` — NIC compatibility table

---

## Layer 2: Kernel / Drivers

### What exists
- **PTP monitoring**: `app/services/avb/ptp_monitor.py` (277 lines)
  - `PTPMonitor` class (line 39) with async `get_status()` (line 52)
  - Queries `pmc` tool, `systemctl`, and `journalctl` for ptp4l state
  - Returns `PTPStatus` dataclass (line 20): state, offset_ns, mean_path_delay_ns, grandmaster_id
- **PTP setup**: `scripts/setup_avb_ptp.sh` (390 lines)
  - Generates `/etc/ptp4l.conf` with gPTP profile (`transportSpecific 0x1`, `delay_mechanism P2P`)
  - Installs `map2-ptp4l.service` and `map2-phc2sys.service` systemd units
- **Clock drift capture**: `scripts/avb_capture_clock_drift.sh` (246 lines)
  - tcpdump + libavtp-based AVTP frame timing analysis
- **PTP clock read**: `Map2AudioEngine.cpp` `getCurrentPtpTimestampNs()` reads `CLOCK_TAI`, falls back to `system_clock`

### What works
- **VERIFIED**: PTP monitoring service runs and returns structured status
- **VERIFIED**: PTP setup script generates correct gPTP configuration
- **VERIFIED**: phc2sys service configured for system-to-hardware clock sync

### What is partial / delegated
- **DELEGATED**: gPTP participation entirely handled by external `ptp4l` daemon — MAP2 has no native 802.1AS implementation
- **DELEGATED**: Grandmaster election controlled by `ptp4l` `priority1` configuration, not by MAP2 application logic
- **PARTIAL**: PTP status is read-only; MAP2 cannot influence clock domain, priority, or boundary clock behavior at runtime

### What is blocked
- **NOT TESTABLE**: PTP currently stuck in `INITIALIZING` (no peer on network)
- **NOT TESTABLE**: Clock offset accuracy, grandmaster stability, path delay measurements
- **NOT TESTABLE**: phc2sys hardware clock synchronization

### Evidence
- `app/services/avb/ptp_monitor.py:39` — `PTPMonitor` class
- `app/services/avb/ptp_monitor.py:52` — `get_status()` method
- `scripts/setup_avb_ptp.sh` — ptp4l.conf generation
- `scripts/avb_capture_clock_drift.sh` — drift analysis script

---

## Layer 3: TSN / Networking

### What exists
- **TSN qdisc manager**: `app/services/avb/tsn_qdisc.py` (298 lines)
  - `TsnQdiscManager` class (line 50) with async `get_status()` (line 61)
  - Parses `tc qdisc show` output for mqprio, CBS, ETF configuration
  - Returns `TsnStatus` dataclass (line 19): interface, mqprio_configured, cbs_configured, etf_configured, vlan_configured
- **TSN setup**: `scripts/setup_avb_qdiscs.sh` (326 lines)
  - Configures mqprio (3 traffic classes), CBS (credit-based shaper), ETF (earliest-txtime-first)
  - Creates VLAN 2 for AVB Class A traffic isolation
  - CBS parameters: idleslope 10 Mbps, sendslope -990 Mbps for 1 Gbps link
- **SRP admission service**: `app/services/avb/srp_admission.py` (1,111 lines)
  - `SrpAdmissionService` class (line 562)
  - `SrpAdmissionResult` dataclass (line 99): decision, reason_code, daemon_type, reservation_id
  - Integrates with external SRP daemon (mrpd/msrpd) via UDP/UDS socket
- **SRP audit log**: `app/services/avb/srp_log_store.py` (163 lines) — SQLite persistence for admission decisions

### IEEE 802.1Qav (Credit-Based Shaper) — PARTIAL
- **VERIFIED**: CBS configuration via tc qdisc in setup scripts
- **VERIFIED**: Hardware offload attempted with software fallback
- **NOT TESTABLE**: No live traffic to validate shaping behavior

### IEEE 802.1Qat (SRP / Stream Reservation) — PARTIAL
- **VERIFIED**: Python service integrates with external SRP daemon
- **MISSING**: No C++ MSRP/MVRP protocol implementation — cannot make or withdraw reservations natively
- **MISSING**: No SRP participation in the JUCE engine layer

### IEEE 802.1Qbv (Time-Aware Shaper / TAS) — MISSING
- No code references found anywhere in the codebase
- No gate control list (GCL) configuration

### IEEE 802.1Qbu (Frame Preemption) — MISSING
- No code references found

### IEEE 802.1CB (Frame Replication and Elimination for Reliability / FRER) — MISSING
- No code references found
- No redundancy path support

### Evidence
- `app/services/avb/tsn_qdisc.py:50` — `TsnQdiscManager` class
- `app/services/avb/srp_admission.py:562` — `SrpAdmissionService` class
- `scripts/setup_avb_qdiscs.sh` — qdisc setup with CBS/ETF/VLAN

---

## Layer 4: AVTP (IEEE 1722)

### What exists
- **AVTP stream**: `juce-engine/Source/AvbStream.h` (312 lines) + `AvbStream.cpp` (657 lines)
  - IEEE 1722 AVTP AAF (Audio Format) — 24-byte header + interleaved float payload
  - AF_PACKET raw sockets (`ETH_P_TSN`) for deterministic <2ms latency
  - `sendFrame()` (line 183): talker transmit, RT-safe, no allocations
  - `receiveFrame()` (line 196): listener receive, RT-safe, no allocations
  - Hardware timestamping via `SO_TIMESTAMPING` (line 264: `configureTimestamping()`)
  - Sequence tracking: 0-255 wrap, gap detection, atomic stats counters
  - NSR codes for 8 kHz through 192 kHz; format codes for 16/24/32-bit
- **JUCE audio device**: `AvbAudioIODevice.h` (285 lines) + `.cpp` (449 lines)
  - Full `juce::AudioIODevice` implementation
  - Separate network thread for AVTP frame send/receive
  - SPSC ring buffers (`AvbRingBuffer.h`, 221 lines) decouple JUCE RT thread from network thread
  - Supports 44.1/48/88.2/96 kHz sample rates
- **JUCE device type**: `AvbAudioIODeviceType.h` (147 lines) + `.cpp` (347 lines)
  - Registers "AVB/TSN" device type with JUCE AudioDeviceManager
  - `scanForDevices()` lists local talker/listener + discovered mDNS devices
  - `isAvbAvailable()` checks config, interface, ptp4l
- **Tesira AVB node**: `TesiraAvbNode.h` (134 lines) + `.cpp` (166 lines)
  - RT-safe per-channel gain/mute for Biamp Tesira Forte (up to 5 devices, 128 channels each)
  - Atomic state for all controls, pre-allocated scratch buffer, metering ring buffer
- **Exception handling**: `AvbException.h` (62 lines)
  - Init-only exceptions: `AvbCapabilityException`, `AvbSocketException`, `AvbConfigException`, `AvbTimestampException`
- **Ring buffer**: `AvbRingBuffer.h` (221 lines)
  - SPSC lock-free, power-of-2 capacity, cache-line aligned atomics

### What works (code-verified)
- **VERIFIED**: AVTP AAF packet format construction and parsing
- **VERIFIED**: AF_PACKET raw socket creation and binding
- **VERIFIED**: RT-safe sendFrame/receiveFrame with pre-allocated buffers
- **VERIFIED**: Sequence number tracking and gap detection
- **VERIFIED**: Hardware timestamp capability detection
- **VERIFIED**: Ring buffer thread safety (SPSC acquire/release semantics)
- **VERIFIED**: JUCE AudioIODevice lifecycle (open/close/start/stop)
- **VERIFIED**: Tesira AVB node atomic gain/mute processing

### What is unverified
- **NOT TESTABLE**: Actual audio fidelity through AVTP transport
- **NOT TESTABLE**: End-to-end latency through ring buffer chain
- **NOT TESTABLE**: Timestamp accuracy under real network conditions
- **NOT TESTABLE**: Behavior under packet loss or reordering

### What is partial
- **PARTIAL**: Only AVTP AAF subtype implemented — no CRF (Clock Reference Format), CVF (Compressed Video Format), or ACF (Ancillary Control Format)
- **PARTIAL**: Presentation time offset is configurable but playout timing is not enforced by a media clock recovery loop

### Build status
- `USE_AVB=ON` (default) — `juce-engine/CMakeLists.txt:178`
- Requires: `libavtp-dev`, `libcap-dev`
- Compile flag: `HAS_AVB=1` when dependencies found

### Evidence
- `juce-engine/Source/AvbStream.h:183` — `sendFrame()` declaration
- `juce-engine/Source/AvbStream.h:196` — `receiveFrame()` declaration
- `juce-engine/Source/AvbStream.h:246` — `checkCapabilities()`
- `juce-engine/Source/AvbStream.h:264` — `configureTimestamping()`
- `juce-engine/Source/AvbAudioIODevice.h` — full JUCE device implementation
- `juce-engine/Source/AvbRingBuffer.h` — SPSC lock-free buffer
- `juce-engine/Source/TesiraAvbNode.h` — RT-safe Tesira node processing
- `juce-engine/CMakeLists.txt:178` — `USE_AVB` option

---

## Layer 5: AVDECC (IEEE 1722.1)

### What exists
- **AVDECC controller**: `juce-engine/Source/AvdeccController.h` (175 lines) + `.cpp` (560 lines)
  - Wraps la_avdecc v4.3.1.1 (L-Acoustics production AVDECC library)
  - Inherits `la::avdecc::controller::Controller::DefaultedObserver`
  - `onEntityOnline()` (line 136): populates entity cache after full AEM enumeration
  - `getDiscoveredEntities()` (line 109): returns cached entities
  - `getEntityModelJson()` (line 110): returns full AEM tree as JSON
  - `connectStream()` (line 112): ACMP CONNECT_TX with std::promise/std::future (5s timeout)
  - `disconnectStream()` (line 114): ACMP DISCONNECT_TX
  - `getStreamFormat()` (line 119) / `setStreamFormat()` (line 126): AECP GET/SET_STREAM_FORMAT
  - `getActiveConnections()` (line 117): returns connection list
- **Descriptors**: `AvdeccDescriptors.h` (366 lines)
  - IEEE 1722.1-2013 binary PDU structs: EntityDescriptor, ConfigurationDescriptor, StreamDescriptor
  - DescriptorType enum: ENTITY, CONFIGURATION, AUDIO_UNIT, STREAM_INPUT, STREAM_OUTPUT, CLOCK_SOURCE, CLOCK_DOMAIN
- **AEM cache**: `app/services/avb/aem_cache.py` (593 lines)
  - Caches AVDECC entity model descriptors, hit/miss stats, invalidation
- **Python bindings**: `juce-engine/Source/PythonBindings.cpp`
  - `is_avdecc_available()`, `get_avdecc_entities()`, `get_avdecc_entity_model()`
  - `connect_stream()`, `disconnect_stream()`, `get_active_connections()`
  - `get_stream_format()`, `set_stream_format()`
  - Fallback stubs when `HAS_AVDECC` disabled

### What works (code-verified)
- **VERIFIED**: Entity discovery observer pattern via la_avdecc
- **VERIFIED**: Async-to-sync bridge for ACMP operations (5s timeout)
- **VERIFIED**: AEM tree serialization to JSON
- **VERIFIED**: Python binding interface matches C++ API
- **VERIFIED**: Graceful fallback when AVDECC disabled (stub functions return empty)

### What is partial
- **PARTIAL**: Controller role only — MAP2 does not present itself as an AVDECC entity (no entity descriptors for MAP2 itself)
- **PARTIAL**: No AEM descriptor validation against remote devices (trusts la_avdecc parsing)
- **PARTIAL**: Stream format negotiation exists but conflict resolution is undefined

### What is unverified
- **NOT TESTABLE**: Entity discovery against real AVB devices
- **NOT TESTABLE**: ACMP connect/disconnect with real streams
- **NOT TESTABLE**: AEM tree completeness for Biamp Tesira entities
- **NOT TESTABLE**: Stream format set/get against Tesira devices

### Build status
- `USE_AVDECC=OFF` (default) — `juce-engine/CMakeLists.txt:205`
- Requires: `libpcap-devel`
- FetchContent pulls `la_avdecc` tag `v4.3.1.1`
- Compile flag: `HAS_AVDECC=1` when enabled and libpcap found

### Legacy files (not compiled)
- `AvdeccEntity.h/cpp` — old custom entity model
- `AvdeccEntityModel.h/cpp` — old AEM tree
- `AvdeccEnumerator.h/cpp` — old discovery
- Kept on disk for reference only; not in CMake sources list

### Evidence
- `juce-engine/Source/AvdeccController.h:109` — `getDiscoveredEntities()`
- `juce-engine/Source/AvdeccController.h:112` — `connectStream()`
- `juce-engine/Source/AvdeccController.h:136` — `onEntityOnline()`
- `juce-engine/Source/AvdeccDescriptors.h` — IEEE 1722.1 structs
- `juce-engine/CMakeLists.txt:205` — `USE_AVDECC` option
- `app/services/avb/aem_cache.py` — AEM caching service

---

## Layer 6: MAP2 Application Integration

### What exists

#### Engine integration
- `Map2AudioEngine.h:177` — `isAvbAvailable()`: checks HAS_AVB, env vars, interface, ptp4l
- `Map2AudioEngine.h:178` — `createAvbStream()`: creates AvbAudioIODevice
- `Map2AudioEngine.h:182-184` — `startAvbStream()`, `stopAvbStream()`, `deleteAvbStream()`
- `Map2AudioEngine.h:185` — `getAvbStreamStats()`: returns AvbStreamRuntimeStats
- `Map2AudioEngine.h:189` — `listAvbStreams()`: returns active stream IDs
- `Map2AudioEngine.h:196` — `getAvbInterfaceInfo()`: returns interface status
- `Map2AudioEngine.h:1293` — `getAvdeccController()`: access to AVDECC controller
- `Map2AudioEngine.h:1367` — `avdeccController_` member (unique_ptr)

#### Python services (7,281 lines total in `app/services/avb/`)
- **AvbService** (`avb_service.py:97`, 1,213 lines): stream lifecycle — create/delete/start/stop, engine binding, SRP binding
- **AvbRouter** (`avb_router.py:144`, 2,593 lines): N-to-M routing matrix, talker/listener discovery cache, connection state machine, SRP integration
- **AvbDiscovery** (`avb_discovery.py`, 529 lines): mDNS `_map2-avb._tcp` service discovery + AVDECC entity enumeration
- **PTPMonitor** (`ptp_monitor.py:39`, 277 lines): async ptp4l status monitoring
- **TsnQdiscManager** (`tsn_qdisc.py:50`, 298 lines): tc qdisc status/management
- **SrpAdmissionService** (`srp_admission.py:562`, 1,111 lines): SRP daemon integration + admission decisions
- **SrpAdmissionLogStore** (`srp_log_store.py`, 163 lines): SQLite audit trail
- **AvbReadiness** (`readiness.py:26`, 274 lines): multi-check readiness evaluation
- **AemCache** (`aem_cache.py`, 593 lines): AVDECC entity model descriptor caching

#### API routes (`app/routes/avb.py`, 4,017 lines)
- **Stream management**: GET/POST/DELETE `/streams`, `/streams/{id}/start`, `/streams/{id}/stop`, `/streams/{id}/stats`
- **AVDECC**: GET `/avdecc/entities`, `/avdecc/entities/{id}`, `/avdecc/connections`, POST `/avdecc/connections`, PATCH `/avdecc/entities/{id}/streams/{idx}/format`
- **Discovery**: GET `/discovery/nodes`, `/discovery/endpoints`
- **Router**: GET `/router/endpoints`, `/router/connections`, `/router/matrix`, POST `/router/connect`, `/router/disconnect`
- **PTP**: GET `/ptp/status`
- **TSN**: GET `/tsn/status`, `/tsn/calculate_cbs`
- **SRP**: GET `/srp/status`, `/srp/admissions`
- **Setup**: POST `/setup`, `/ptp/setup`
- All routes return graceful `available=false` responses when AVB unavailable

#### Configuration (`app/config.py`)
- 25+ AVB keys: `avb.enabled`, `avb.interface`, `avb.ptp_domain`, `avb.auto_connect`, `avb.max_streams`, `avb.presentation_offset_us`, `avb.failover_policy`, `avb.srp.*`
- 20+ Tesira keys: `tesira.enabled`, `tesira.devices`, `tesira.transport`, `tesira.ssh_*`, `tesira.sagevue_*`

#### Cluster integration
- `app/services/cluster/avb_cluster.py` (230 lines): `get_local_avb_metadata()` provides AVB fields for cluster node discovery

### What works (code-verified)
- **VERIFIED**: Complete stream lifecycle API (create → start → stats → stop → delete)
- **VERIFIED**: Graceful degradation when AVB unavailable (all routes return structured errors)
- **VERIFIED**: Multi-check readiness evaluation with specific failure reasons
- **VERIFIED**: SRP admission audit trail with SQLite persistence
- **VERIFIED**: N-to-M routing matrix with connection state tracking
- **VERIFIED**: mDNS service advertisement and discovery
- **VERIFIED**: Configuration schema with sensible defaults
- **VERIFIED**: Cluster metadata integration

### What is partial
- **PARTIAL**: Stream persistence across reboot — config exists but untested
- **PARTIAL**: Auto-connect on startup — config flag exists, implementation untested with real streams
- **PARTIAL**: Failover policy — config defines `none/prefer_primary/round_robin/manual`, auto-recovery orchestration not proven

### What is unverified
- **NOT TESTABLE**: Any of the above services with real AVB streams
- **NOT TESTABLE**: Router connection management with real talker/listener endpoints
- **NOT TESTABLE**: SRP admission with actual daemon responses

### Evidence
- `juce-engine/Source/Map2AudioEngine.h:177-196` — AVB methods
- `app/services/avb/avb_service.py:97` — `AvbService` class
- `app/services/avb/avb_router.py:144` — `AvbRouter` class
- `app/routes/avb.py` — 4,017 lines of API routes

---

## Layer 7: Interoperability

### MAP2 <-> MAP2

#### What exists
- mDNS discovery for `_map2-avb._tcp` service type
- Cluster node metadata with AVB fields (interface, PTP sync, stream counts)
- N-to-M routing matrix designed for multi-node operation
- Stream creation API supports `peer_node_id` and `owner_node_id` fields

#### Status: **NOT TESTABLE**
- No second MAP2 node available on testbed
- No MAP2-to-MAP2 audio stream has ever been established
- Discovery, connection, and routing behavior between nodes is entirely unverified

### MAP2 <-> Biamp Tesira

#### What exists
- **TTP client** (`app/services/tesira/ttp_client.py`, 486 lines): async TCP Telnet to Tesira port 23
- **TesiraDevice** (`app/services/tesira/tesira_device.py`, 610 lines): high-level wrapper for levels, mutes, EQ, crosspoints, presets, AVB streams, PTP status
- **TesiraFleet** (`app/services/tesira/tesira_fleet.py`, 497 lines): multi-device management
- **Discovery** (`app/services/tesira/discovery.py`, 524 lines): UDP broadcast + port 23 probe
- **DSP model** (`app/services/tesira/tesira_dsp_model.py`, 302 lines) + **block registry** (879 lines): comprehensive DSP block library
- **PTP coordinator** (`app/services/tesira/ptp_coordinator.py`, 178 lines): master/slave role management
- **Design tools**: compiler (314 lines), workspace (352 lines), orchestrator (468 lines)
- **API routes** (`app/routes/tesira.py`, 1,789 lines): full device control including AVB streams, PTP, DSP, presets, firmware, deploy
- **Frontend**: `TesiraAvbTab.tsx` — PTP status display + AVB stream table per device

#### Status: **PARTIAL — TTP verified, AVB unverified**
- **VERIFIED**: TTP protocol client can parse responses and handle subscriptions
- **VERIFIED**: Device wrapper provides structured access to levels, mutes, presets
- **VERIFIED**: Fleet management handles connection pooling and lifecycle
- **NOT TESTABLE**: AVB stream exchange between MAP2 and Tesira
- **NOT TESTABLE**: PTP clock coordination between MAP2 and Tesira
- **NOT TESTABLE**: AVDECC entity discovery of Tesira devices
- **NOT TESTABLE**: Bidirectional audio routing (MAP2 talker -> Tesira listener and reverse)

### General IEEE AVB interoperability
- **PARTIAL**: AVDECC controller uses production la_avdecc library (known to interoperate with Biamp, MOTU, QSC)
- **MISSING**: No MAP2 AVDECC entity descriptor — third-party controllers cannot discover MAP2 as an AVB entity
- **MISSING**: No interoperability test suite for non-Tesira AVB devices

### Evidence
- `app/services/tesira/ttp_client.py` — TTP protocol implementation
- `app/services/tesira/tesira_device.py` — device wrapper
- `app/routes/tesira.py` — 1,789 lines of API routes
- `web/src/app/components/Tesira/components/TesiraAvbTab.tsx` — frontend

---

## Layer 8: Observability / Diagnostics

### What exists

#### Frontend (14,183 lines in `web/src/app/components/AvbRouting/`)
- **AvbRoutingApp**: full routing matrix UI with grid, node tree, topology modal, inspector, batch actions
- **TesiraAvbTab**: per-device PTP status + AVB stream table
- **AVBNetworkTab**: cluster dashboard AVB network view
- **useAvbStatus hook**: React query-based AVB status polling

#### Backend diagnostics
- **Stream stats**: atomic counters — framesSent/Received, errors, underruns/overruns, latencyNs, sequenceErrors, timestampSkewEvents
- **PTP monitoring**: state, offset, delay, grandmaster identity
- **TSN status**: qdisc configuration, queue stats
- **SRP audit log**: admission decisions with timestamps and reasons
- **Readiness checks**: 10+ individual checks with pass/fail per check
- **Stream diagnostics endpoint**: GET `/streams/{id}/diagnostics` — consolidated status

#### Setup/ops tooling
- **HIL qualification**: `run_avb_hil_qualification.sh` (329 lines) — Q04/Q05/Q06 gates with BLOCKED/PASS/FAIL logic
- **24h soak**: `run_avb_24h_soak.sh` (327 lines) — hourly checkpoints via API polling
- **Clock drift capture**: `avb_capture_clock_drift.sh` (246 lines) — tcpdump + libavtp analysis
- **Latency optimizer**: `scripts/avb_latency_optimizer/` (10 Python modules) — codebase scanning, CBS analysis, patch generation

### What works
- **VERIFIED**: Frontend routing matrix renders correctly (Jest tests pass)
- **VERIFIED**: Stream stats collection via atomic counters (RT-safe)
- **VERIFIED**: PTP monitoring returns structured status
- **VERIFIED**: Readiness evaluation returns actionable check results
- **VERIFIED**: HIL qualification framework correctly marks gates as BLOCKED when hardware unavailable

### What is missing
- **MISSING**: WebSocket push for AVB stream state changes — uses HTTP polling (2s `refetchInterval`)
- **MISSING**: Direct `/api/avb/*` client functions in `web/src/map2/api.ts` — Tesira AVB hooks exist but core AVB API not wrapped in TypeScript
- **MISSING**: Real-time latency/jitter dashboard — stats collected but no visualization
- **MISSING**: Alert/notification system for AVB failures (no push alerts)
- **MISSING**: Structured logging for AVTP packet errors (stats tracked but no log events)

### What is not testable
- **NOT TESTABLE**: Any observability feature with live data (no active streams)
- **NOT TESTABLE**: HIL qualification gates Q04/Q05/Q06

### Evidence
- `web/src/app/components/AvbRouting/` — 14,183 lines of routing UI
- `app/routes/avb.py` — diagnostics endpoints
- `scripts/run_avb_hil_qualification.sh` — qualification framework
- `scripts/avb_latency_optimizer/` — latency analysis tooling

---

## Standards Compliance Matrix

| Standard | Description | Status | Evidence | Required Remediation |
|----------|-------------|--------|----------|---------------------|
| **IEEE 1722-2016** | AVTP audio transport | **PARTIAL** | `AvbStream.cpp` implements AAF subtype only | Add CRF subtype for clock reference; CVF/ACF optional |
| **IEEE 1722.1-2013** | AVDECC discovery/control | **PARTIAL** | `AvdeccController.cpp` via la_avdecc v4.3.1.1; controller role only | Add MAP2 entity descriptor for third-party discovery |
| **IEEE 802.1AS-2020** | gPTP time sync | **DELEGATED** | External `ptp4l` daemon; MAP2 reads but does not participate | Acceptable design — document dependency clearly |
| **IEEE 802.1Qav** | Credit-Based Shaper (FQTSS) | **PARTIAL** | `setup_avb_qdiscs.sh` configures CBS via tc; no runtime adjustment | Validate with live traffic |
| **IEEE 802.1Qat** | Stream Reservation (SRP) | **PARTIAL** | `srp_admission.py` integrates with external daemon; no C++ MSRP | Evaluate native MSRP need |
| **IEEE 802.1Qbv** | Time-Aware Shaper (TAS) | **MISSING** | No code | Evaluate need for professional audio |
| **IEEE 802.1Qbu** | Frame Preemption | **MISSING** | No code | Evaluate need — low priority for audio |
| **IEEE 802.1CB** | Frame Replication (FRER) | **MISSING** | No code | Evaluate for redundancy scenarios |

### AVB Role Compliance

| Role | Status | Evidence |
|------|--------|----------|
| **Talker** | IMPLEMENTED, UNVERIFIED | `AvbStream.cpp` sendFrame(), `AvbAudioIODevice` talker mode |
| **Listener** | IMPLEMENTED, UNVERIFIED | `AvbStream.cpp` receiveFrame(), `AvbAudioIODevice` listener mode |
| **AVDECC Controller** | IMPLEMENTED, UNVERIFIED | `AvdeccController.cpp` via la_avdecc |
| **AVDECC Entity** | MISSING | MAP2 does not present itself as discoverable entity |
| **gPTP Participant** | DELEGATED | ptp4l handles 802.1AS |
| **gPTP GM Candidate** | DELEGATED | ptp4l priority1 configuration |
| **SRP Participant** | PARTIAL | Python service-level only, no C++ protocol |
| **Bridge / Forwarding** | MISSING | No code — not applicable for endpoint |
| **Multi-Role Simultaneous** | UNVERIFIED | Architecture supports it, never tested |
| **Cluster-Aware AVB Node** | IMPLEMENTED, UNVERIFIED | `avb_cluster.py` metadata in cluster discovery |

---

## Performance Findings

### Methodology
No live performance data exists. The following assessment is based on code analysis and theoretical modeling.

### Theoretical latency budget
- AVTP packet: 256 samples / 48000 Hz = **5.33 ms** per packet
- Ring buffer depth: configurable, default allows ~170ms buffering at 8192 capacity
- Presentation offset: 2000 µs (2 ms) default
- **Expected end-to-end**: 5-10 ms (one-way, depending on ring buffer fill and network)

### RT-safety analysis (code-verified)
- **VERIFIED**: `sendFrame()` and `receiveFrame()` are RT-safe (no allocations, no locks)
- **VERIFIED**: Ring buffer is SPSC lock-free with cache-line aligned atomics
- **VERIFIED**: Stats counters use `std::atomic` with relaxed ordering
- **VERIFIED**: TesiraAvbNode uses atomic gain/mute controls
- **VERIFIED**: Exception handling is init-only, never in RT path

### What is not measured
- **NOT MEASURED**: Actual end-to-end latency (no live streams)
- **NOT MEASURED**: Jitter variance (no timestamp data)
- **NOT MEASURED**: Xrun rate under sustained load
- **NOT MEASURED**: Multi-stream scaling behavior (CPU impact)
- **NOT MEASURED**: Clock drift between MAP2 and Tesira PTP domains
- **NOT MEASURED**: CBS shaping effectiveness under real traffic

### Existing measurement tooling
- `scripts/avb_latency_optimizer/latency_model.py` — theoretical budget calculator
- `scripts/avb_capture_clock_drift.sh` — live drift measurement (requires tcpdump + AVTP traffic)
- `scripts/run_avb_24h_soak.sh` — 24-hour stability soak with hourly checkpoints
- `AvbStreamStats` atomic counters — maxLatencyNs, minLatencyNs, timestampSkewEvents

---

## Interoperability Findings

### MAP2 <-> MAP2
| Aspect | Status | Notes |
|--------|--------|-------|
| Discovery | IMPLEMENTED, UNVERIFIED | mDNS `_map2-avb._tcp` + cluster metadata |
| Stream setup | IMPLEMENTED, UNVERIFIED | Router connect/disconnect API |
| Audio transport | IMPLEMENTED, UNVERIFIED | AVTP AAF via AvbStream |
| Clock sync | DELEGATED, UNVERIFIED | Both nodes need ptp4l with shared GM |
| Routing matrix | IMPLEMENTED, UNVERIFIED | N-to-M UI with endpoint inspector |
| Recovery | UNKNOWN | No reconnect/failover tested |

### MAP2 <-> Biamp Tesira
| Aspect | Status | Notes |
|--------|--------|-------|
| Device discovery (TTP) | VERIFIED (code) | UDP probe + port 23 Telnet |
| AVDECC entity discovery | UNVERIFIED | la_avdecc should discover Tesira, never tested |
| AVB stream subscription | UNVERIFIED | ACMP connect/disconnect untested |
| Audio transport | UNVERIFIED | MAP2 talker/listener <-> Tesira stream |
| PTP coordination | UNVERIFIED | Tesira PTP status readable, coordination logic exists |
| DSP control | VERIFIED (code) | TTP commands for levels, mutes, EQ, crosspoints |
| Preset management | VERIFIED (code) | Recall/capture via TTP |
| Fleet management | VERIFIED (code) | Multi-device connection pooling |

### Known interoperability risks
1. **MAP2 has no AVDECC entity descriptor** — Biamp controllers cannot discover MAP2 as a device
2. **Stream format negotiation untested** — Tesira may require specific AAF format parameters
3. **VLAN 2 assumption** — Tesira may use different VLAN configuration for AVB
4. **PTP domain mismatch possible** — MAP2 defaults to domain 0, Tesira may differ
5. **la_avdecc compatibility** — v4.3.1.1 is known to work with Biamp, but MAP2's wrapper layer adds abstraction that may mask issues

---

## Architecture Gap Analysis

### Current-state architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React/TypeScript)                                  │
│  AvbRoutingApp (14K lines) │ TesiraAvbTab │ api.ts hooks     │
├─────────────────────────────────────────────────────────────┤
│ Python Backend (FastAPI)                                     │
│  avb.py routes (4K) │ tesira.py routes (1.8K)               │
│  AvbService │ AvbRouter │ Discovery │ PTP │ TSN │ SRP       │
│  TesiraDevice │ TesiraFleet │ TTP Client                    │
├─────────────────────────────────────────────────────────────┤
│ C++ JUCE Engine                                              │
│  Map2AudioEngine → AvbAudioIODevice → AvbStream (AVTP)      │
│                  → AvdeccController (la_avdecc)              │
│                  → TesiraAvbNode (gain/mute)                 │
├─────────────────────────────────────────────────────────────┤
│ System Services                                              │
│  ptp4l (gPTP) │ phc2sys │ mrpd/msrpd (SRP) │ tc (qdiscs)   │
├─────────────────────────────────────────────────────────────┤
│ Kernel / Hardware                                            │
│  AF_PACKET │ SO_TIMESTAMPING │ ETH_P_TSN │ CLOCK_TAI        │
└─────────────────────────────────────────────────────────────┘
```

### Target-state architecture (for production-grade AVB)

Same layered stack, plus:
1. **MAP2 AVDECC entity** — MAP2 presents itself as discoverable AVB device
2. **Native SRP participation** — C++ MSRP/MVRP or verified external daemon integration
3. **Media clock recovery** — Enforced playout timing synchronized to PTP
4. **WebSocket push** — Real-time stream state, PTP status, error alerts
5. **CRF subtype** — Clock reference for multi-stream synchronization
6. **Live validation evidence** — All HIL gates passed with hardware

### Architectural flaws
1. **AVDECC default OFF** — `USE_AVDECC=OFF` in CMakeLists.txt means default builds have no device interop
2. **No MAP2 entity descriptor** — one-way discovery only (MAP2 can find others, others cannot find MAP2)
3. **SRP at wrong layer** — Python service wraps external daemon; no protocol-level participation in C++
4. **Polling-based frontend** — 2s HTTP polling instead of WebSocket push for stream state

### Protocol-layer flaws
1. **AAF only** — no CRF means multi-stream clock alignment relies entirely on PTP (fragile)
2. **No media clock recovery loop** — presentation offset is configurable but not enforced at playout
3. **No SRP bandwidth accounting** — streams can be created without reservation verification in C++

### Product integration assessment
- **Strong**: API surface is comprehensive (30+ endpoints), graceful degradation, good config schema
- **Strong**: Frontend routing matrix is full-featured with filtering, inspection, batch operations
- **Weak**: No WebSocket push means UI can be up to 2s behind actual state
- **Weak**: Direct AVB API not exposed in TypeScript api.ts (only Tesira AVB hooks)
- **Weak**: No structured AVB event logging (only atomic counters)

---

## Global Worklist Additions

See **Global Worklist Entries** section below for structured task definitions.

### Summary by priority

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 6 | Blocks basic AVB functionality — hardware, streams, measurement, Tesira |
| P1 | 6 | Blocks standards compliance or interoperability — API, WebSocket, scaling, recovery |
| P2 | 5 | Performance, resilience, observability, cleanup |
| **Total** | **17** | |

### Dependency chain

```
T360 (HW + PTP) ──┬── T361 (AVDECC discovery)
                   │     └── T362 (E2E stream) ──┬── T363 (latency measurement)
                   │                              ├── T364 (24h soak)
                   │                              ├── T368 (multi-stream)
                   │                              ├── T369 (persistence/recovery)
                   │                              └── T370 (multi-role)
                   └── T365 (Tesira interop)
                   └── T371 (HIL Q04/Q05/Q06)

T366 (api.ts)     ── independent
T367 (WebSocket)  ── independent
T372-T376         ── independent evaluations/cleanup
```

---

## Recommended Remediation Order

### Phase 1: Hardware Unblock (T360)
Connect AVB-capable NIC, configure switch, achieve PTP grandmaster lock. This unblocks everything else.

### Phase 2: Core Validation (T361 → T362 → T363 → T364)
Discover AVDECC entity, establish first stream, measure latency, run soak test. This proves the stack works.

### Phase 3: Tesira Interop (T365)
Connect Tesira hardware, verify discovery + stream + control. This proves the interop story.

### Phase 4: Compliance Hardening (T366 → T371)
Add api.ts client, WebSocket push, run HIL gates. Parallel work on multi-stream, recovery, multi-role.

### Phase 5: Standards Extension (T372 → T376)
Evaluate advanced TSN standards, add CRF, clean up legacy code. Lower priority.

---

## Final Readiness Verdict

### Is MAP2 currently ready for production-grade AVB use with other MAP2 nodes?

**NO.**

Zero MAP2-to-MAP2 AVB audio streams have been established. The software stack is architecturally sound and comprehensively implemented, but entirely unverified with real hardware. PTP is stuck in INITIALIZING, no devices are discovered, no streams exist.

### Is MAP2 currently ready for Biamp AVB interoperability?

**NO.**

The Tesira TTP control layer is verified at the code level, but no AVB audio exchange between MAP2 and Tesira has ever occurred. AVDECC discovery of Tesira entities is unverified. Stream subscription is unverified. PTP coordination is unverified.

### What prevents approval?

1. No AVB-capable hardware connected to testbed
2. PTP unable to achieve grandmaster lock (no peer)
3. Zero AVDECC entities discovered
4. Zero AVB streams carrying audio
5. All HIL qualification gates BLOCKED
6. No latency/jitter measurements exist
7. No Tesira AVB interop evidence exists

### What minimum work is required to reach approval?

**Hardware prerequisite**: Connect at minimum one AVB-capable NIC + one AVB switch + one peer (second MAP2 node or Tesira unit).

**Then execute T360 → T362 → T363 → T364 → T365 → T371** (6 tasks in sequence):
1. Achieve PTP lock (T360)
2. Discover entity + establish stream (T361 + T362)
3. Measure latency/jitter (T363)
4. Run 24h soak (T364)
5. Verify Tesira interop (T365)
6. Pass HIL gates (T371)

**Estimated calendar time**: 2-3 weeks with dedicated hardware access.

### Software assessment

The software layer is **ready to support production use** once hardware validation passes. The architecture is sound, the API surface is comprehensive, test coverage is extensive (249+ Python test functions, 19+ C++ test sections, 240+ frontend test cases), and graceful degradation is well-implemented. The primary risk is not software quality but the complete absence of live validation evidence.

---

# Global Worklist Entries

```
[AVB-P0-001] T360
Title: Connect AVB-capable hardware and achieve PTP grandmaster lock
Layer: Hardware / Kernel
Priority: P0
Problem: No AVB-capable NIC is connected to the MAP2 testbed. PTP is stuck in INITIALIZING with no peer. Zero AVB functionality can be validated without hardware.
Evidence: /api/avb/ptp/status returns state=INITIALIZING; /api/avb/discovery/nodes returns empty; setup_avb.sh hardware detection finds no TSN-capable interface.
Impact: Blocks ALL downstream AVB validation — every other audit finding depends on this.
Required Implementation:
  - Acquire and install AVB-capable NIC (Intel I210 or I225 recommended)
  - Connect to AVB-capable switch (TSN support required)
  - Run setup_avb.sh to configure PTP, qdiscs, VLAN
  - Verify ptp4l achieves SLAVE or MASTER state
  - Verify phc2sys synchronizes system clock to PTP hardware clock
Acceptance Criteria: /api/avb/ptp/status shows state=SLAVE or state=MASTER with offset_ns < 1000
Validation Method: curl /api/avb/ptp/status; journalctl -u map2-ptp4l; pmc 'GET CURRENT_DATA_SET'
Dependencies: Lab hardware procurement
Risks if Deferred: ALL AVB production claims remain unsubstantiated
```

```
[AVB-P0-002] T361
Title: Discover at least one AVDECC entity and verify AEM enumeration
Layer: AVDECC / Control
Priority: P0
Problem: AVDECC controller wrapper (AvdeccController.cpp) has never discovered a real entity. The onEntityOnline() callback and AEM cache have never been exercised with real device descriptors.
Evidence: /api/avb/avdecc/entities returns empty list; USE_AVDECC=OFF by default in CMakeLists.txt.
Impact: Without entity discovery, no AVDECC-managed connections can be established. Biamp Tesira interop blocked.
Required Implementation:
  - Enable USE_AVDECC=ON in build
  - Connect AVB device (MAP2 peer or Tesira unit)
  - Verify entity appears in /api/avb/avdecc/entities
  - Verify AEM tree is complete via /api/avb/avdecc/entities/{id}/model
  - Verify entity_name, firmware_version, talker/listener counts are accurate
Acceptance Criteria: At least 1 entity with has_model=true and complete AEM descriptor tree
Validation Method: curl /api/avb/avdecc/entities; curl /api/avb/avdecc/entities/{id}/model
Dependencies: T360
Risks if Deferred: AVDECC integration remains theoretical; connection management blocked
```

```
[AVB-P0-003] T362
Title: Establish end-to-end MAP2 AVB audio stream (talker -> listener)
Layer: AVTP / Application
Priority: P0
Problem: No AVB audio stream has ever carried audio on the MAP2 platform. The entire AVTP transport layer (AvbStream.cpp sendFrame/receiveFrame, AvbAudioIODevice, ring buffers) is unverified with real audio.
Evidence: /api/avb/streams returns empty; listAvbStreams() returns empty; no stream stats ever recorded.
Impact: The core AVB product claim — sharing audio between MAP2 nodes — is completely unproven.
Required Implementation:
  - Create talker stream on node A: POST /api/avb/streams (direction=talker)
  - Create listener stream on node B: POST /api/avb/streams (direction=listener)
  - Start both streams
  - Inject known test signal (tone, impulse, chirp) into talker
  - Verify signal appears at listener output
  - Verify stream stats show framesSent > 0, framesReceived > 0, zero errors
Acceptance Criteria: Audio passes end-to-end with zero sequence errors and zero decode errors; stream stats confirm frames transferred
Validation Method: Test tone injection + output capture; curl /api/avb/streams/{id}/stats
Dependencies: T360, T361
Risks if Deferred: MAP2 cannot claim AVB audio transport works
```

```
[AVB-P0-004] T363
Title: Measure and document round-trip latency and jitter on live AVB stream
Layer: Performance
Priority: P0
Problem: No latency or jitter measurements exist for MAP2 AVB. RT-safe code patterns are verified but actual timing behavior is unknown.
Evidence: AvbStreamStats maxLatencyNs/minLatencyNs always zero; no drift capture data exists; latency optimizer has no real input data.
Impact: Cannot make any latency claims. Cannot compare to competitors. Cannot validate fitness for live performance use.
Required Implementation:
  - Establish loopback stream (talker -> switch -> listener on same or different node)
  - Measure one-way latency via AVTP timestamp analysis (avb_capture_clock_drift.sh)
  - Measure round-trip latency via impulse injection and capture
  - Calculate jitter (p50, p95, p99, max) over 10-minute window
  - Document methodology and results
  - Compare against target: < 10ms one-way, < 200us jitter
Acceptance Criteria: Documented latency < 10ms one-way; jitter p99 < 500us; methodology reproducible
Validation Method: avb_capture_clock_drift.sh output; stream stats maxLatencyNs/minLatencyNs
Dependencies: T362
Risks if Deferred: Performance claims remain qualitative; cannot validate fitness for live audio
```

```
[AVB-P0-005] T364
Title: Execute 24-hour AVB soak test with zero xruns
Layer: Stability
Priority: P0
Problem: Long-term stability of AVB streams is completely unknown. No soak test has been executed.
Evidence: run_avb_24h_soak.sh exists but has never produced results; Q06 gate permanently BLOCKED.
Impact: Cannot claim production stability. Real deployments require sustained operation.
Required Implementation:
  - Start 2+ AVB streams (mix of talker and listener)
  - Run run_avb_24h_soak.sh for 24 hours
  - Collect hourly checkpoints (frame counters, error rates, latency stats)
  - Verify zero xruns, zero sequence errors, monotonic frame counters
  - Archive evidence artifacts
Acceptance Criteria: 24 hours continuous operation; zero xruns; zero sequence error growth; stable latency
Validation Method: run_avb_24h_soak.sh output; archived checkpoint data
Dependencies: T362
Risks if Deferred: Stability claims unsupported; production deployment risky
```

```
[AVB-P0-006] T365
Title: Verify Biamp Tesira AVB interoperability (discover + stream + control)
Layer: Interoperability
Priority: P0
Problem: No MAP2 <-> Tesira AVB audio exchange has occurred. TTP control is code-verified but AVB stream interop is completely untested.
Evidence: No Tesira devices in /api/tesira/devices; T030 and T072 BLOCKED on hardware.
Impact: Biamp Tesira interoperability is a stated product goal. Without verification, the claim is empty.
Required Implementation:
  - Connect Tesira Forte AVB unit to same switch as MAP2
  - Verify TTP discovery finds Tesira device
  - Verify AVDECC discovers Tesira entity with correct AEM
  - Subscribe MAP2 listener to Tesira talker stream
  - Subscribe Tesira listener to MAP2 talker stream
  - Verify bidirectional audio with test tones
  - Verify PTP coordination (both nodes see same grandmaster)
  - Test preset recall, level control, mute during active stream
Acceptance Criteria: Bidirectional audio verified; AVDECC entity discovered; TTP control functional during streaming
Validation Method: Audio loopback test; curl /api/avb/avdecc/entities; curl /api/tesira/devices/{id}/avb/streams
Dependencies: T360
Risks if Deferred: Biamp interop claim unsupported; cannot position MAP2 as Tesira-compatible
```

```
[AVB-P1-001] T366
Title: Add /api/avb/* client functions to web/src/map2/api.ts
Layer: Frontend / API
Priority: P1
Problem: The core AVB API endpoints (/api/avb/streams, /api/avb/router, /api/avb/discovery, /api/avb/ptp, /api/avb/avdecc) are not wrapped in TypeScript client functions. Only Tesira AVB hooks exist in api.ts.
Evidence: grep for '/api/avb/' in api.ts shows only Tesira-scoped endpoints; AvbRouting components use raw fetch via useAvbApi.ts hook.
Impact: Inconsistent API access patterns; AvbRouting bypasses shared api.ts layer; harder to maintain type safety.
Required Implementation:
  - Add typed functions for stream CRUD, router operations, PTP status, AVDECC queries
  - Add TanStack Query hooks with appropriate staleTime/refetchInterval
  - Migrate AvbRouting hooks to use shared api.ts functions
Acceptance Criteria: All /api/avb/* endpoints callable via typed api.ts functions; existing AvbRouting behavior preserved
Validation Method: npm run typecheck; existing AvbRouting tests pass
Dependencies: None
Risks if Deferred: Continued API layer fragmentation; type safety gaps
```

```
[AVB-P1-002] T367
Title: Add WebSocket push for AVB stream state changes
Layer: Observability
Priority: P1
Problem: AVB stream state, PTP status, and AVDECC entity changes are delivered via HTTP polling (2s interval). This means UI can be up to 2 seconds behind actual state.
Evidence: AvbRouting components use refetchInterval: 2000; no /ws/avb namespace found in codebase.
Impact: Delayed state updates during critical operations (stream start/stop, device discovery, connection changes). Poor operator experience during active routing.
Required Implementation:
  - Add WebSocket namespace for AVB events (stream state changes, AVDECC entity online/offline, PTP state transitions)
  - Update frontend to subscribe to WS events with polling fallback
  - Ensure WS events fire from AvbService and AvdeccController callbacks
Acceptance Criteria: Stream state changes visible in UI within 200ms; PTP transitions push-notified
Validation Method: Frontend integration test; WS connection verified via browser devtools
Dependencies: None
Risks if Deferred: Operators see stale state during active routing; 2s polling creates unnecessary API load
```

```
[AVB-P1-003] T368
Title: Verify multi-stream scaling (4+ simultaneous AVB streams)
Layer: Performance / Application
Priority: P1
Problem: Stream scaling behavior is unknown. Single-stream operation may work but multiple simultaneous streams may reveal CPU contention, ring buffer starvation, or CBS bandwidth exhaustion.
Evidence: No multi-stream test evidence exists; avb_service.py supports max_streams config but untested.
Impact: Production use requires multiple simultaneous streams (e.g., 8-channel send + 8-channel receive minimum).
Required Implementation:
  - Create 4+ simultaneous streams (mix of talker and listener)
  - Monitor CPU usage, ring buffer fill levels, sequence errors
  - Verify no cross-stream interference
  - Document scaling limits and resource consumption
Acceptance Criteria: 4 simultaneous streams with zero errors; CPU < 70%; documented scaling curve
Validation Method: Stream stats monitoring; top/htop during test; CBS utilization check
Dependencies: T362
Risks if Deferred: Production deployments may hit undiscovered scaling limits
```

```
[AVB-P1-004] T369
Title: Verify stream persistence and recovery after network drop
Layer: Resilience
Priority: P1
Problem: Stream behavior after network interruption is unknown. Config includes auto_connect and failover_policy but recovery has never been tested.
Evidence: avb.auto_connect and avb.failover_policy config keys exist but are unexercised.
Impact: Production AVB systems must survive transient network issues without operator intervention.
Required Implementation:
  - Establish active streams
  - Disconnect and reconnect network cable
  - Verify streams recover automatically (or document manual recovery path)
  - Test with various interruption durations (1s, 10s, 60s, 5min)
  - Verify PTP re-locks after interruption
  - Document recovery time and any audio glitches
Acceptance Criteria: Streams recover within 10s of network restoration; PTP re-locks within 30s
Validation Method: Stream stats before/after interruption; PTP status monitoring
Dependencies: T362
Risks if Deferred: Network issues in production cause permanent stream loss requiring manual restart
```

```
[AVB-P1-005] T370
Title: Verify simultaneous talker + listener + controller roles on same node
Layer: Application / AVDECC
Priority: P1
Problem: MAP2 architecture supports all three roles but simultaneous operation has never been tested. Resource contention between roles is unknown.
Evidence: Map2AudioEngine has separate avdeccController_ and AVB stream members, but concurrent operation untested.
Impact: Real-world use requires a node that talks, listens, and controls AVDECC simultaneously.
Required Implementation:
  - Configure one MAP2 node as talker AND listener AND AVDECC controller
  - Establish streams in both directions while actively managing AVDECC connections
  - Verify no resource conflicts (sockets, CPU, memory)
  - Verify AVDECC callbacks fire during active streaming
Acceptance Criteria: All three roles operate simultaneously without errors for 1 hour
Validation Method: Stream stats + AVDECC entity list + connection management during test
Dependencies: T362
Risks if Deferred: Multi-role failure discovered only in production
```

```
[AVB-P1-006] T371
Title: Execute Q04/Q05/Q06 HIL qualification gates
Layer: Qualification
Priority: P1
Problem: All three hardware-in-loop qualification gates remain BLOCKED since creation. The qualification framework is ready but has never produced passing results.
Evidence: run_avb_hil_qualification.sh summary shows all gates BLOCKED; docs/fit-for-purpose-evidence/ contains BLOCKED artifacts only.
Impact: Cannot claim qualification-backed AVB readiness. Release gates cannot pass.
Required Implementation:
  - Q04: Run AVB integration pytest gate with live hardware
  - Q05: Run clock drift capture with active AVTP traffic (600s)
  - Q06: Run 24-hour soak test
  - Archive all evidence artifacts under docs/fit-for-purpose-evidence/
  - Update qualification matrix with PASS/FAIL results
Acceptance Criteria: All three gates show PASS; evidence archived with timestamps
Validation Method: run_avb_hil_qualification.sh summary.txt shows 3x PASS
Dependencies: T360, T362
Risks if Deferred: Release indefinitely blocked; no production qualification evidence
```

```
[AVB-P2-001] T372
Title: Evaluate IEEE 802.1Qbv (Time-Aware Shaper) need and feasibility
Layer: TSN / Networking
Priority: P2
Problem: Time-Aware Shaper (TAS) enables deterministic time-slot scheduling for AVB traffic. MAP2 uses CBS only. TAS may improve worst-case latency guarantees.
Evidence: No 802.1Qbv code or configuration found in codebase.
Impact: Without TAS, worst-case latency depends on CBS credit recovery timing, which is adequate but not deterministic.
Required Implementation:
  - Research TAS requirements for professional audio AVB (is it needed?)
  - Evaluate Linux kernel tc-taprio support on target NICs
  - If needed: add tc-taprio configuration to setup_avb_qdiscs.sh
  - If not needed: document rationale for CBS-only approach
Acceptance Criteria: Written evaluation with recommendation (implement or defer) and rationale
Validation Method: Document review
Dependencies: None (evaluation only)
Risks if Deferred: May miss determinism improvements; competitors may have TAS support
```

```
[AVB-P2-002] T373
Title: Evaluate IEEE 802.1Qbu (Frame Preemption) need and feasibility
Layer: TSN / Networking
Priority: P2
Problem: Frame preemption allows high-priority AVB frames to interrupt lower-priority traffic. Not implemented in MAP2.
Evidence: No 802.1Qbu code found.
Impact: Low — CBS provides sufficient prioritization for audio. Preemption mainly benefits mixed audio/video/data networks.
Required Implementation:
  - Evaluate whether frame preemption adds value for MAP2's audio-only AVB use case
  - Check NIC hardware support (Intel I210/I225 preemption capability)
  - Document recommendation
Acceptance Criteria: Written evaluation with recommendation
Validation Method: Document review
Dependencies: None
Risks if Deferred: Minimal for audio-only use case
```

```
[AVB-P2-003] T374
Title: Evaluate IEEE 802.1CB (Frame Replication/Elimination) for redundancy
Layer: TSN / Networking
Priority: P2
Problem: FRER enables seamless redundancy via duplicate frames over disjoint paths. MAP2 has no redundancy mechanism for AVB streams.
Evidence: No 802.1CB code found; avb.failover_interfaces config exists but is unused.
Impact: Production installations may need redundant AVB paths for reliability.
Required Implementation:
  - Evaluate FRER requirements for MAP2 deployment scenarios
  - Assess kernel support (tc-frer or custom)
  - Assess switch requirements (dual-path topology)
  - Document recommendation with deployment scenarios
Acceptance Criteria: Written evaluation with recommended redundancy strategy
Validation Method: Document review
Dependencies: None
Risks if Deferred: No redundancy path — single point of failure for AVB audio
```

```
[AVB-P2-004] T375
Title: Add AVTP CRF (Clock Reference Format) subtype support
Layer: AVTP
Priority: P2
Problem: MAP2 only implements AVTP AAF (Audio Format). CRF provides clock reference distribution for multi-stream synchronization independent of PTP.
Evidence: AvbStream.cpp handles AAF only; no CRF packet construction or parsing.
Impact: Multi-stream deployments rely solely on PTP for synchronization. CRF provides an additional synchronization mechanism used by some AVB implementations.
Required Implementation:
  - Evaluate CRF need for MAP2 use cases (multi-channel, multi-device)
  - If needed: add CRF stream type to AvbStream with dedicated send/receive
  - Add CRF subscription and clock recovery logic
Acceptance Criteria: CRF evaluation complete; if implemented, CRF streams interoperate with Tesira
Validation Method: Wireshark CRF packet validation; clock recovery measurement
Dependencies: T362
Risks if Deferred: Multi-stream sync relies solely on PTP (acceptable for most cases)
```

```
[AVB-P2-005] T376
Title: Clean up legacy AVDECC files (AvdeccEntity, AvdeccEntityModel, AvdeccEnumerator)
Layer: Codebase hygiene
Priority: P2
Problem: Six legacy AVDECC files (AvdeccEntity.h/cpp, AvdeccEntityModel.h/cpp, AvdeccEnumerator.h/cpp) are kept on disk but not compiled. They add confusion and maintenance burden.
Evidence: Files exist in juce-engine/Source/ but are not listed in CMakeLists.txt sources.
Impact: Low — files are dead code. Risk of accidental re-inclusion or developer confusion.
Required Implementation:
  - Archive legacy files to a docs/archive/ or remove entirely
  - Add code comment in AvdeccController.h noting replacement history
  - Update any documentation referencing old files
Acceptance Criteria: Legacy files removed from Source/; no build impact; AvdeccController.h has migration note
Validation Method: cmake --build build succeeds; grep confirms no remaining references
Dependencies: None
Risks if Deferred: Minimal — cosmetic/maintenance only
```
