# MAP2 Audio Platform - Hardware & Software Architecture

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAP2 DISTRIBUTED AUDIO PLATFORM                      │
│                              Version 2.0 - FEB2025                             │
└─────────────────────────────────────────────────────────────────────────────┘

HARDWARE LAYER
==============

┌──────────────────────────────┐    ┌──────────────────────────────┐
│    AUDIO NODE (Physical)      │    │   CONTROL NODE (Physical)     │
├──────────────────────────────┤    ├──────────────────────────────┤
│                              │    │                              │
│  🎸 Audio Interface          │    │  ⚙️  System Controller        │
│  ├─ USB/MIDI Input           │    │  ├─ Monitoring              │
│  ├─ Analog In/Out            │    │  ├─ Configuration           │
│  ├─ S/PDIF I/O               │    │  └─ Cluster Coordination    │
│                              │    │                              │
│  🔊 LV2 Plugin Engine        │    │  📊 LCD Display (optional)   │
│  ├─ Real-time DSP            │    │  ├─ 20x4 Character LCD      │
│  ├─ Low-latency JACK         │    │  ├─ I2C/Serial Interface    │
│  └─ 512-sample buffer        │    │  └─ Event display           │
│                              │    │                              │
│  🎚️  Hardware Controller      │    │  🌐 Network Interface        │
│  ├─ MIDI keyboard            │    │  ├─ Ethernet (1Gbps)        │
│  ├─ Expression pedals        │    │  ├─ mDNS discovery          │
│  └─ Footswitches             │    │  └─ SSH tunneling           │
│                              │    │                              │
│  💾 Storage                  │    │  💾 Storage                  │
│  ├─ SSD (audio samples)      │    │  ├─ SSD (database, presets) │
│  └─ 128GB+ capacity          │    │  └─ 512GB+ capacity          │
│                              │    │                              │
│  🖥️  CPU/Memory              │    │  🖥️  CPU/Memory              │
│  ├─ 4-8 cores               │    │  ├─ 2-4 cores               │
│  ├─ 8-16GB RAM              │    │  ├─ 4-8GB RAM               │
│  └─ Real-time kernel        │    │  └─ Standard kernel         │
│                              │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
         ↑                                    ↑
         │ PCM/MIDI (real-time)              │ HTTP/WebSocket (soft real-time)
         │ 44.1kHz, 16-bit                   │ 8080/api/lcd
         │                                   │
         └───────────────────┬───────────────┘
                             │
                    🌐 LAN (Ethernet)
                    Peer Discovery via mDNS
                             │
         ┌───────────────────┼───────────────┐
         ↓                   ↓               ↓
    ┌─────────┐        ┌─────────┐    ┌──────────┐
    │ Node 1  │        │ Node 2  │    │ Node N   │
    │ (Audio) │        │ (Audio) │    │(Control) │
    │ Cluster │        │ Cluster │    │ Cluster  │
    └─────────┘        └─────────┘    └──────────┘
         ↓                   ↓               ↓
         └───────────────────┼───────────────┘
                             │
                      Event Stream
                      (WebSocket/HTTP)


SOFTWARE ARCHITECTURE LAYERS
============================

┌────────────────────────────────────────────────────────────────────────────┐
│                            PRESENTATION LAYER                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📱 Web UI (React/TypeScript)      🖥️  TUI (Terminal User Interface)       │
│  ├─ LCD Dashboard                  ├─ LCD Control Screen                   │
│  ├─ Node Status Page               ├─ Event Monitoring                     │
│  ├─ Settings Panel                 ├─ System Status                        │
│  ├─ Event Viewer                   └─ Interactive Menu System              │
│  └─ Real-time Charts                                                       │
│                                                                             │
│  🎮 Hardware Control               📊 Monitoring & Metrics                  │
│  ├─ MIDI Mapping                   ├─ Prometheus Scrape                    │
│  ├─ Preset Management              ├─ System Health                        │
│  └─ Audio Settings                 └─ Performance Analytics                │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION LAYER (FastAPI)                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  API Routes (REST + WebSocket)                                              │
│  ├─ /api/lcd/*              - LCD Event System                             │
│  ├─ /api/audio/*            - Audio Engine Control                         │
│  ├─ /api/midi/*             - MIDI Configuration                           │
│  ├─ /api/chains/*           - Effect Chain Management                      │
│  ├─ /api/presets/*          - Preset Save/Load                             │
│  ├─ /api/health             - Health Checks (→ Load Balancer)             │
│  ├─ /api/status             - System Status & Metrics                      │
│  ├─ /api/metrics            - Prometheus Metrics                           │
│  └─ /ws/lcd/events          - WebSocket Event Stream                       │
│                                                                             │
│  Service Orchestrator                                                       │
│  ├─ Lifecycle Management                                                   │
│  ├─ Service Startup/Shutdown                                               │
│  └─ Error Handling & Recovery                                              │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                    CORE SERVICES & EVENT SYSTEM                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LCD Event System                       Audio Engine                        │
│  ├─ Event Bus (in-process pubsub)      ├─ JUCE Framework                   │
│  ├─ Event Router (multi-node)          ├─ LV2 Plugin Loader                │
│  ├─ Persistence Layer (SQLite)         ├─ Real-time DSP                    │
│  ├─ mDNS Peer Discovery                └─ Latency Compensation             │
│  └─ WebSocket Broadcasts                                                   │
│                                                                             │
│  Event Producers (5 types)              MIDI System                         │
│  ├─ Audio Producer                      ├─ MIDI Learn                       │
│  ├─ System Health Producer              ├─ CC Mapping                       │
│  ├─ Network/Cluster Producer            ├─ Program Change                   │
│  ├─ Plugin Event Producer               └─ Note Binding                     │
│  └─ Database Producer                                                      │
│                                                                             │
│  Hardware Drivers                       Performance Monitoring              │
│  ├─ LCD Display (I2C/Serial)           ├─ CPU Meter                        │
│  ├─ Hardware Interface (USB/MIDI)      ├─ Memory Usage                      │
│  └─ Serial Communication                └─ Event Latency                    │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                         DATA & PERSISTENCE LAYER                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SQLite Database (SQLAlchemy ORM)                                           │
│  ├─ LCD Events Table (24h history)                                         │
│  ├─ Presets Table (chains, effects)                                        │
│  ├─ User Settings                                                          │
│  ├─ MIDI Mappings                                                          │
│  └─ Device Configuration                                                   │
│                                                                             │
│  Connection Pool Management                                                │
│  ├─ Async SQLite connections                                               │
│  ├─ 10 pool size (configurable)                                            │
│  └─ Connection pooling & recycling                                         │
│                                                                             │
│  File Storage                                                               │
│  ├─ Audio Samples (IR, WAV)                                                │
│  ├─ Preset Files (JSON)                                                    │
│  ├─ Configuration Files                                                    │
│  └─ Backup Archives                                                        │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌────────────────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE & UTILITIES LAYER                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Networking                             Security                            │
│  ├─ mDNS Discovery (_map2-node._tcp)   ├─ SSH Key Trust                     │
│  ├─ WebSocket Management               ├─ Firewall Rules                    │
│  ├─ Event Routing & Forwarding         ├─ SSL/TLS Ready                     │
│  └─ Exponential Backoff Reconnect      └─ Node Authentication              │
│                                                                             │
│  Monitoring & Diagnostics              Rate Limiting & Protection           │
│  ├─ Health Metrics Collection          ├─ Token Bucket (per endpoint)       │
│  ├─ Performance Counters               ├─ 429 Rate Limit Responses         │
│  ├─ Logging & Tracing                  ├─ Event Storm Prevention            │
│  └─ Status Reporting                   └─ DoS Protection                    │
│                                                                             │
│  Deployment & Configuration                                                │
│  ├─ Systemd Service Management                                             │
│  ├─ Docker Support                                                         │
│  ├─ Configuration Files (.conf)                                            │
│  ├─ Environment Variables                                                  │
│  └─ Node Identity Management                                               │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘


CLUSTER COMMUNICATION FLOW
===========================

Audio Node 1          Control Node         Audio Node 2
(AUDIO-NODE-A1B2)     (CONTROL-NODE-C3D4)  (AUDIO-NODE-X9Y8)

     │                     │                    │
     │ mDNS Announce       │ mDNS Announce      │
     ├────────────────────→│←───────────────────┤
     │   _map2-node._tcp   │                    │
     │
     │ WebSocket Connect (with backoff)
     ├─────────────────────────────────────────→│
   │ ws://audio-2:8080/api/lcd/ws/events      │
     │←─────────────────────────────────────────┤
     │ Connection established                   │
     │
     │ Event Broadcast                          │
     ├─ Event: "AUDIO_PLUGIN_LOADED"            │
     │  ├→ Local display                        │
     │  ├→ Database (persist)                   │
     │  ├→ Control Node (WebSocket)             │
     │  └→ Peer Audio Nodes (WebSocket)         │
     │
     │ Event from Control Node                  │
     │←─────────────────────────────────────────┤
     │ Event: "SYSTEM_SHUTDOWN_INITIATED"       │
     │  ├→ Local acknowledgment                 │
     │  ├→ Display on LCD                       │
     │  └→ Broadcast to peers                   │
     │


DEPLOYMENT SCENARIOS
====================

Single Node (AUDIO-NODE):
  ┌─────────────────┐
  │  Audio Node     │
  │  - LCD Display  │
  │  - Audio Engine │
  │  - Web UI       │
  │  - TUI          │
  └─────────────────┘

Dual Node Cluster (Audio + Control):
  ┌──────────────┐      ┌──────────────┐
  │ Audio Node   │◄────→│Control Node  │
  │- LV2 Plugins │      │- Monitoring  │
  │- MIDI I/O    │      │- LCD Display │
  │- Audio I/O   │      │- Web UI      │
  └──────────────┘      └──────────────┘

Multi-Node Cluster (3+ nodes):
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Audio 1   │◄─┼─Control  │─→│Audio 2   │
  └──────────┘  └──────────┘  └──────────┘
       ↓             ↓              ↓
    Event Stream (WebSocket + mDNS)


TECHNOLOGY STACK
================

Backend:
  • FastAPI (async web framework)
  • SQLAlchemy (ORM)
  • SQLite (database)
  • aiohttp (async HTTP client)
  • websockets (real-time events)
  • asyncio (async runtime)

Audio Engine:
  • JUCE Framework (C++)
  • LV2 Plugin Specification
  • JACK Audio Connection Kit
  • Real-time kernel (optional)

Frontend:
  • React 18+ (web UI)
  • TypeScript (type safety)
  • TUI Components (terminal UI)
  • Vite (build tool)

Infrastructure:
  • Systemd (service management)
  • Docker (containerization)
  • mDNS/Avahi (peer discovery)
  • Prometheus (metrics)

Security:
  • SSH Key Trust
  • Rate Limiting (token bucket)
  • Firewall Integration
  • SSL/TLS Ready


DATA FLOW EXAMPLE: Plugin Load Event
====================================

1. User loads LV2 plugin via Web UI
   ↓
2. API Request: POST /api/plugins/load
   ↓
3. Audio Engine loads plugin (real-time)
   ↓
4. Plugin Loaded Event created
   {
     event_id: "evt-plugin-load-001",
     source_node: "AUDIO-NODE-A1B2",
     event_type: "PLUGIN_LOADED",
     title: "Guitar Amp Loaded",
     message: "Archetype Nolly v2.1",
     timestamp: "2025-02-04T12:34:56Z"
   }
   ↓
5. Event Bus publishes to local subscribers
   ├─ LCD Manager (display on 4x20 LCD)
   ├─ Database Producer (persist to SQLite)
   ├─ Remote Aggregator (broadcast to peers)
   └─ Web UI (real-time via WebSocket)
   ↓
6. Event Router broadcasts via WebSocket to peers
   ├─ AUDIO-NODE-X9Y8 (audio node)
   ├─ CONTROL-NODE-C3D4 (control node)
   └─ Reconnect + queue if offline
   ↓
7. Peers receive event
   ├─ Update remote event cache
   ├─ Display on their LCD (if configured)
   └─ Broadcast to their peers (prevent loop)
   ↓
8. Event persisted in database (24h history)
   ↓
9. Monitoring systems alert if load time > threshold
   ↓
10. Prometheus metrics updated
    • lcd_events_total
    • lcd_latency_ms
    • lcd_connected_peers
