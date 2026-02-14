# MAP2 Audio Platform - Node Types & Deployment Architectures

**Comprehensive Guide to Service Distribution, AVB/TSN Capabilities, and Use Case Scenarios**

---

## 📊 Node Type Comparison Matrix

| Feature / Service | ALL-IN-ONE | AUDIO-NODE | CONTROL-NODE | FRONTEND-ONLY | Notes |
|-------------------|------------|------------|--------------|---------------|-------|
| **Core Audio** |
| JUCE Audio Engine | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | ❌ DISABLED | Real-time DSP processing |
| Audio I/O (JACK/ALSA) | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | ❌ DISABLED | PipeWire/JACK bridge |
| Plugin Loader (LV2) | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | ❌ DISABLED | Dynamic plugin loading |
| **User Interfaces** |
| Web Dashboard (React) | ✅ ENABLED | ❌ DISABLED | ✅ ENABLED | ✅ ENABLED | Port 3000 (Vite dev) |
| Terminal UI (Textual) | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | SSH-accessible console |
| LCD Display Manager | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | ❌ DISABLED | I2C hardware display |
| **Backend Services** |
| FastAPI Server | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ⚠️ DEGRADED | API routes & orchestration |
| Database (SQLite) | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | Presets, config, state |
| **Cluster Services** |
| mDNS Discovery | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | Automatic node detection |
| RAFT Consensus | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ⚠️ DEGRADED | Distributed state mgmt |
| Health Monitor | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ⚠️ DEGRADED | Real-time health checks |
| Config Distributor | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | Cluster-wide config sync |
| Event Producer | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | ⚠️ DEGRADED | Telemetry & events |
| **Performance** |
| Audio Latency | 4-5ms | <3ms | N/A | N/A | Lower latency on AUDIO-NODE |
| CPU Overhead | Medium | Low | Low | Minimal | AUDIO-NODE optimized for RT |
| Memory Footprint | ~800MB | ~400MB | ~300MB | ~150MB | Approximate RSS |

**Legend:**
- ✅ **ENABLED**: Fully operational
- ⚠️ **DEGRADED**: Running with reduced functionality
- ❌ **DISABLED**: Not running

---

## 🌐 AVB/TSN Network Audio Services (Intel I210-T1 Required)

When an **Intel I210/I225 Ethernet Controller** is detected and AVB is enabled:

| Service | ALL-IN-ONE + I210 | AUDIO-NODE + I210 | CONTROL-NODE + I210 | Purpose |
|---------|-------------------|-------------------|---------------------|---------|
| **gPTP (IEEE 802.1AS)** | ✅ ENABLED | ✅ ENABLED | ⚠️ MONITOR-ONLY | Sub-μs clock synchronization |
| **ptp4l Daemon** | ✅ RUNNING | ✅ RUNNING | ⚠️ OPTIONAL | PTP v2 grandmaster/slave |
| **phc2sys Service** | ✅ RUNNING | ✅ RUNNING | ❌ DISABLED | Sync PTP to system clock |
| **AVTP Talker** | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | IEEE 1722 audio TX |
| **AVTP Listener** | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | IEEE 1722 audio RX |
| **AVDECC Entity** | ✅ ENABLED | ✅ ENABLED | ⚠️ MONITOR-ONLY | IEEE 1722.1 discovery |
| **AEM Enumerator** | ✅ ENABLED | ✅ ENABLED | ⚠️ READ-ONLY | Entity model caching |
| **TSN Traffic Shaping** | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | mqprio + CBS qdiscs |
| **VLAN Configuration** | ✅ ENABLED | ✅ ENABLED | ❌ DISABLED | VLAN 2 for Class A streams |
| **AVB Router** | ✅ ENABLED | ✅ ENABLED | ⚠️ MONITOR-ONLY | N-to-M stream routing |
| **PTP Monitor Service** | ✅ ENABLED | ✅ ENABLED | ✅ ENABLED | Offset/health monitoring |

### AVB Service Details:

**1. gPTP Synchronization (IEEE 802.1AS)**
- **File:** `app/services/avb/ptp_monitor.py`
- **Purpose:** Monitor PTP clock offset, sync status
- **Config:** `MAP2_AVB_INTERFACE=eth0` (or auto-detect I210)
- **Systemd:** `map2-ptp4l.service`, `map2-phc2sys.service`
- **Performance:** <1μs offset between nodes

**2. AVTP Audio Streams (IEEE 1722 AAF)**
- **File:** `juce-engine/Source/AvbStream.cpp` (C++)
- **Purpose:** Real-time audio over Ethernet (Layer 2)
- **Latency:** <2ms end-to-end
- **Capacity:** Up to 64 channels per stream @ 48kHz/24-bit

**3. AVDECC Discovery (IEEE 1722.1 ADP/AECP/ACMP)**
- **Files:** `juce-engine/Source/AvdeccEntity.cpp`, `AvdeccEnumerator.cpp`
- **Purpose:** Discover and enumerate network audio devices
- **Cache:** `app/services/avb/aem_cache.py` (SQLite persistent cache)
- **Compatibility:** MOTU 828es, PreSonus NSB, MOTU AVB Switch, Luminex GigaCore

**4. TSN Traffic Shaping (IEEE 802.1Qav CBS)**
- **File:** `app/services/avb/tsn_qdisc.py`
- **Purpose:** Guaranteed bandwidth and bounded latency
- **qdiscs:** mqprio (3 traffic classes), CBS on Class A, ETF if supported
- **Config:** `/var/lib/map2/qdisc-backup-<iface>.json` (auto-backup)

**5. AVB Router**
- **File:** `app/services/avb/avb_router.py`
- **Purpose:** N-to-M talker/listener routing matrix
- **Features:** Auto-discovery, format negotiation, connection management

---

## 📐 Deployment Architecture Patterns

### 1. **Studio Recording Setup**

```
┌─────────────────────────────────────────────────────────────────┐
│                        Studio Network                           │
│                    (10 GbE + AVB/TSN)                           │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  CONTROL-NODE  │  │  AUDIO-NODE 1  │  │  AUDIO-NODE 2  │
│   (Producer)   │  │   (Tracking)   │  │    (Mixing)    │
├────────────────┤  ├────────────────┤  ├────────────────┤
│ Web Dashboard  │  │ JUCE Engine    │  │ JUCE Engine    │
│ API Server     │  │ USB Interface  │  │ AVB I/O        │
│ Database       │  │ Plugin Chain   │  │ Reverb/Master  │
│ RAFT Leader    │  │ gPTP Sync      │  │ gPTP Sync      │
│ Config Mgmt    │  │ <3ms latency   │  │ <2ms latency   │
└────────────────┘  └────────────────┘  └────────────────┘
        │                    │                    │
        └────────────────────┴────────────────────┘
                   Cluster Communication
                   (mDNS, RAFT, Health)
```

**Use Case:**
- **Producer Workstation:** Control panel, preset management, visual monitoring
- **Tracking Room:** Low-latency input processing, plugin effects
- **Mix Room:** Final processing, mastering chain, AVB network routing

**Hardware Requirements:**
- CONTROL-NODE: Intel NUC, Mac Mini, standard Ethernet
- AUDIO-NODE 1: High-end workstation, Intel I210 (AVB optional), USB audio interface
- AUDIO-NODE 2: High-end workstation, Intel I210 (AVB required), networked I/O

---

### 2. **Live Performance Rig**

```
┌───────────────────────────────────────────────────────────┐
│              Stage Network (AVB/TSN)                      │
│           (Intel I210 on all audio nodes)                 │
└───────────────────────────────────────────────────────────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ ALL-IN-  │  │  AUDIO-  │  │  AUDIO-  │  │ FRONT-   │
│   ONE    │  │  NODE 1  │  │  NODE 2  │  │  ONLY    │
│ (FOH)    │  │ (Guitar) │  │  (Keys)  │  │ (Monitor)│
├──────────┤  ├──────────┤  ├──────────┤  ├──────────┤
│ Web UI   │  │ JUCE Eng │  │ JUCE Eng │  │ Web UI   │
│ JUCE Eng │  │ AVB I/O  │  │ AVB I/O  │  │ Minimal  │
│ AVB I/O  │  │ Guitar FX│  │ Synth/FX │  │ Monitor  │
│ Master   │  │ <3ms     │  │ <3ms     │  │ Display  │
│ LCD Disp │  │ LCD Disp │  │ LCD Disp │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Use Case:**
- **FOH Engineer:** Master mix, web interface control, LCD hardware display
- **Guitarist:** Dedicated processing node, low-latency effects chain
- **Keyboardist:** Dedicated processing, networked audio routing
- **Monitor Engineer:** Lightweight monitoring interface (laptop/tablet)

**Hardware Requirements:**
- ALL-IN-ONE: Rack-mount server, Intel I210, LCD display, USB interface
- AUDIO-NODEs: Compact PCs (Intel NUC), Intel I210, foot pedal LCD
- FRONTEND-ONLY: Laptop/tablet, standard Ethernet (WiFi acceptable)

---

### 3. **Distributed Processing Cluster**

```
┌──────────────────────────────────────────────────────────────┐
│                  Data Center Network                         │
│              (1 GbE management, 10 GbE audio)                │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐      ┌──────────────┐
│ CONTROL-NODE │    │ AUDIO-NODE 1 │ ...  │ AUDIO-NODE N │
│  (Master)    │    │  (Worker 1)  │      │  (Worker N)  │
├──────────────┤    ├──────────────┤      ├──────────────┤
│ Web UI       │    │ JUCE Engine  │      │ JUCE Engine  │
│ API Gateway  │    │ Plugin Load  │      │ Plugin Load  │
│ Database     │    │ AVB Optional │      │ AVB Optional │
│ RAFT Leader  │    │ RAFT Follow  │      │ RAFT Follow  │
│ Job Queue    │    │ CPU Cores    │      │ CPU Cores    │
│ Load Balance │    │ 4-5 Isolated │      │ 4-5 Isolated │
└──────────────┘    └──────────────┘      └──────────────┘
```

**Use Case:**
- **Massive Parallel Processing:** Distribute plugin processing across multiple nodes
- **Render Farm:** Batch audio processing, stem generation, format conversion
- **Cloud Audio:** Remote processing with local I/O redirection

**Hardware Requirements:**
- CONTROL-NODE: 4-8 core CPU, 16GB RAM, SSD storage, standard network
- AUDIO-NODEs: 6-12 core CPUs, 32GB RAM, NVMe storage, isolated RT cores
- Network: 10 GbE for audio data transfer, 1 GbE for management

---

### 4. **Hybrid Cloud Deployment**

```
                    ┌─────────────┐
                    │   Cloud     │
                    │ CONTROL-NODE│
                    └──────┬──────┘
                           │ VPN/Internet
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ALL-IN-ONE   │  │ AUDIO-NODE   │  │ AUDIO-NODE   │
│ (Studio 1)   │  │ (Studio 2)   │  │ (Studio 3)   │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ Local I/O    │  │ Local I/O    │  │ Local I/O    │
│ Web UI       │  │ Headless     │  │ Headless     │
│ JUCE Engine  │  │ JUCE Engine  │  │ JUCE Engine  │
│ RAFT Follw   │  │ RAFT Follw   │  │ RAFT Follw   │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Use Case:**
- **Multi-Site Production:** Centralized control panel, distributed audio processing
- **Remote Collaboration:** Share presets/config across geographic locations
- **Cloud Management:** Monitor all sites from single dashboard

**Hardware Requirements:**
- CONTROL-NODE: Cloud VM (4 vCPU, 8GB RAM), PostgreSQL for multi-site DB
- ALL-IN-ONE/AUDIO-NODEs: On-premises hardware with local audio I/O
- Network: VPN tunnel, low-latency internet connection

---

### 5. **Edge Processing (IoT Audio)**

```
┌────────────────────────────────────────────────────────┐
│                   Edge Network                         │
│            (Local WiFi + AVB where needed)             │
└────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌────────────┐      ┌────────────┐      ┌────────────┐
│ FRONTEND-  │      │ ALL-IN-ONE │      │ ALL-IN-ONE │
│   ONLY     │      │ (Room 1)   │      │ (Room 2)   │
│ (Tablet)   │      │ RPi 4/5    │      │ RPi 4/5    │
├────────────┤      ├────────────┤      ├────────────┤
│ Monitor UI │      │ JUCE Eng   │      │ JUCE Eng   │
│ Minimal    │      │ USB Audio  │      │ USB Audio  │
│ <150MB RAM │      │ Compact FX │      │ Compact FX │
│            │      │ LCD Disp   │      │ LCD Disp   │
└────────────┘      └────────────┘      └────────────┘
```

**Use Case:**
- **Smart Home Audio:** Distributed audio zones with central monitoring
- **Small Venue:** Compact processing nodes per room/stage
- **Portable Rig:** Raspberry Pi-based processing units

**Hardware Requirements:**
- FRONTEND-ONLY: Tablet/phone with browser
- ALL-IN-ONE: Raspberry Pi 4/5 (8GB RAM), USB audio interface, optional LCD
- Network: Local WiFi or Ethernet, mDNS for auto-discovery

---

## 🔧 Hardware-Specific Service Matrix

### Standard Ethernet (No AVB Hardware)

| Node Type | Services | Use Case |
|-----------|----------|----------|
| ALL-IN-ONE | JUCE + Web UI + Cluster | Single workstation, small studio |
| AUDIO-NODE | JUCE + TUI + Cluster | Headless processing node |
| CONTROL-NODE | Web UI + API + Cluster | Management/monitoring only |
| FRONTEND-ONLY | Web UI (minimal) | Lightweight monitoring client |

**Network Features:**
- ✅ mDNS discovery
- ✅ RAFT consensus
- ✅ HTTP/REST API communication
- ❌ AVB/TSN audio streaming
- ❌ gPTP synchronization

---

### Intel I210/I225 Ethernet Controller

| Node Type | Services | AVB Services | Use Case |
|-----------|----------|--------------|----------|
| ALL-IN-ONE | Full stack | gPTP + AVTP + AVDECC + TSN | AVB-capable workstation |
| AUDIO-NODE | JUCE + Cluster | gPTP + AVTP + AVDECC + TSN | Network audio processor |
| CONTROL-NODE | Web UI + API | gPTP Monitor + AVDECC Browser | AVB network monitor |
| FRONTEND-ONLY | Web UI | None | Standard monitoring |

**Network Features:**
- ✅ All standard features
- ✅ IEEE 802.1AS gPTP (<1μs sync)
- ✅ IEEE 1722 AVTP streaming
- ✅ IEEE 1722.1 AVDECC
- ✅ IEEE 802.1Qav CBS traffic shaping
- ✅ Hardware timestamping
- ✅ Deterministic latency (<2ms)

**AVB Audio Streams:**
- **Talker:** Up to 8 concurrent streams (64 channels total)
- **Listener:** Up to 8 concurrent streams (64 channels total)
- **Format:** 48kHz/24-bit AAF (Audio Audio Format)
- **Latency:** <2ms end-to-end (includes network + processing)

---

## 🎯 Service Distribution by Use Case

### **Low-Latency Audio Processing**

**Goal:** <3ms round-trip latency

**Configuration:**
- **Node Type:** AUDIO-NODE
- **Services:** JUCE Engine, Audio I/O, Plugin Loader, TUI only
- **Hardware:** Dedicated audio workstation, RT kernel, isolated CPU cores
- **Network:** Optional AVB for distributed processing

**Services Disabled:**
- Web UI (reduces CPU overhead)
- Database writes (buffered/async)
- Heavy cluster operations

---

### **Remote Monitoring & Control**

**Goal:** Centralized management of distributed nodes

**Configuration:**
- **Node Type:** CONTROL-NODE (manager) + multiple AUDIO-NODEs (workers)
- **Services:** Web UI, API, Database, full cluster stack
- **Hardware:** Standard server, no audio hardware required

**Services Enabled:**
- Full cluster visibility
- mDNS discovery
- RAFT consensus (Leader role)
- Config distribution
- Health aggregation

---

### **Professional AVB Studio**

**Goal:** Network audio with hardware sync

**Configuration:**
- **Node Types:** Mix of ALL-IN-ONE + AUDIO-NODEs
- **Services:** Full stack + AVB/TSN services
- **Hardware:** Intel I210 on all audio nodes, AVB-capable switches

**AVB Services:**
- gPTP grandmaster on most stable node
- AVTP streams between nodes
- AVDECC for third-party device compatibility (MOTU, PreSonus)
- TSN traffic shaping for guaranteed bandwidth

---

## 📋 Service Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                     Core Dependencies                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   JUCE Engine   │ (Audio Processing)
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│  Audio I/O   │   │ Plugin Loader│    │ Preset Mgmt  │
│ (PipeWire)   │   │    (LV2)     │    │  (Database)  │
└──────────────┘   └──────────────┘    └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   Cluster Dependencies                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ mDNS Discovery  │ (Node Detection)
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│    RAFT      │   │Health Monitor│    │Config Distrib│
│  Consensus   │   │   Service    │    │   Service    │
└──────────────┘   └──────────────┘    └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    AVB/TSN Dependencies                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Intel I210 NIC │ (Hardware Req)
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│ gPTP (ptp4l) │   │AVTP Streaming│    │   AVDECC     │
│ + phc2sys    │   │  (AvbStream) │    │   Entity     │
└──────┬───────┘   └──────┬───────┘    └──────┬───────┘
       │                  │                    │
       └──────────────────┴────────────────────┘
                          │
                          ▼
                 ┌──────────────┐
                 │  AVB Router  │ (Stream Matrix)
                 └──────────────┘
```

---

## 💡 Recommendations by Deployment Size

### **Single Node (Home Studio)**
- **Configuration:** ALL-IN-ONE
- **Hardware:** Desktop workstation, USB audio interface
- **AVB:** Not required (single node)

### **Small Cluster (2-4 Nodes)**
- **Configuration:** 1x CONTROL-NODE + 2-3x AUDIO-NODE
- **Hardware:** Mixed (1 workstation, 2-3 compact PCs)
- **AVB:** Optional (useful for network I/O routing)

### **Medium Cluster (5-10 Nodes)**
- **Configuration:** 1x CONTROL-NODE + 4-9x AUDIO-NODE
- **Hardware:** Dedicated CONTROL-NODE, rack-mount AUDIO-NODEs
- **AVB:** Recommended (Intel I210 on audio nodes)

### **Large Cluster (11+ Nodes)**
- **Configuration:** 2-3x CONTROL-NODE (HA) + Nx AUDIO-NODE
- **Hardware:** Redundant controllers, standardized audio nodes
- **AVB:** Required (full TSN network with AVB switches)

---

## 🔐 Security & Isolation Considerations

### Network Segmentation:

**Management Network (VLAN 1):**
- HTTP/HTTPS (ports 8080, 3000)
- mDNS (port 5353)
- SSH (port 22)

**AVB Audio Network (VLAN 2):**
- AVTP streams (Ethertype 0x22F0)
- AVDECC (UDP ports 17221)
- gPTP (UDP ports 319, 320)

**Best Practice:** Separate management and AVB traffic using VLANs, prioritize AVB with IEEE 802.1p QoS.

---

## 📊 Performance Comparison

| Metric | ALL-IN-ONE | AUDIO-NODE | CONTROL-NODE | FRONTEND-ONLY |
|--------|------------|------------|--------------|---------------|
| Audio Latency | 4-5ms | <3ms | N/A | N/A |
| CPU Load (idle) | 15-20% | 5-10% | 2-5% | <1% |
| Memory Usage | ~800MB | ~400MB | ~300MB | ~150MB |
| Boot Time | ~60s | ~40s | ~30s | ~10s |
| Network Bandwidth | Medium | High (if AVB) | Low | Minimal |

---

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Maintainer:** MAP2 Audio Engineering Team
