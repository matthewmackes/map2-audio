# MAP2 Audio Platform — Future State: Dual Raspberry Pi 5 Node Deployment

**Document Type:** Implementation Design Specification  
**Date:** February 11, 2026  
**Version:** 1.0.0  
**Status:** PLANNED — Not yet implemented  
**Purpose:** Complete blueprint for an AI assistant or developer to build the dual-node Raspberry Pi 5 deployment with MIDI pedalboard and LCD controller

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Current State vs Future State](#2-current-state-vs-future-state)
3. [Hardware Bill of Materials](#3-hardware-bill-of-materials)
4. [Physical Layout & Wiring](#4-physical-layout--wiring)
5. [Node Architecture](#5-node-architecture)
6. [Audio Node — Detailed Specification](#6-audio-node--detailed-specification)
7. [Management Node — Detailed Specification](#7-management-node--detailed-specification)
8. [MIDI Pedalboard + LCD — Detailed Specification](#8-midi-pedalboard--lcd--detailed-specification)
9. [Inter-Node Communication Protocol](#9-inter-node-communication-protocol)
10. [Service Distribution Map](#10-service-distribution-map)
11. [Network Configuration](#11-network-configuration)
12. [OS & Kernel Configuration](#12-os--kernel-configuration)
13. [Build System Changes](#13-build-system-changes)
14. [Deployment & Provisioning](#14-deployment--provisioning)
15. [Migration Path from Current Architecture](#15-migration-path-from-current-architecture)
16. [Signal Flow Specifications](#16-signal-flow-specifications)
17. [Performance Targets](#17-performance-targets)
18. [Failure Modes & Recovery](#18-failure-modes--recovery)
19. [Implementation Phases](#19-implementation-phases)
20. [File-by-File Change Inventory](#20-file-by-file-change-inventory)
21. [Testing Strategy](#21-testing-strategy)
22. [Open Questions & Decisions](#22-open-questions--decisions)

---

## 1. EXECUTIVE SUMMARY

### What We're Building

Transform the MAP2 Audio Platform from a **single-machine all-in-one deployment** (currently running on an x86_64 workstation) into a **dual-node Raspberry Pi 5 system** with a **physical MIDI pedalboard** as the primary live-performance interface.

### The Three Physical Components

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MIDI PEDALBOARD + LCD                             │
│   [SW1-4 Presets] [20x4 LCD Center] [SW5-10 Effects/Control]        │
│   [EXP1 Volume/Wah]               [EXP2 Parameter]                  │
└───────┬──────────────────────────────────────────┬───────────────────┘
        │ USB MIDI                                 │ I2C + USB MIDI
        ↓                                          ↓
┌───────────────────┐   Gigabit Ethernet   ┌───────────────────┐
│   AUDIO NODE      │◄═══════════════════►│  MANAGEMENT NODE  │
│   Raspberry Pi 5  │    10.0.0.0/24       │  Raspberry Pi 5   │
│   (8GB RAM)       │                      │  (8GB RAM)         │
│                   │                      │                    │
│   Real-time audio │                      │  Web UI, API,      │
│   processing only │                      │  Database, LCD     │
└───────────────────┘                      └───────────────────┘
        │                                          │
  USB Audio Interface                         WiFi/LAN → Clients
  (Edirol UA-1000)                           (laptop, phone, tablet)
```

### Why Two Nodes?

| Concern | Single Node Problem | Dual Node Solution |
|---------|--------------------|--------------------|
| **RT Latency** | Web server, DB writes, and audio RT compete for CPU | Audio RT gets dedicated hardware with isolated cores |
| **Thermal** | RPi 5 throttles under combined load | Each node runs lighter workload, stays cool |
| **Reliability** | One crash kills everything | Management node can restart audio node remotely |
| **Scalability** | Locked to one machine's resources | Can upgrade nodes independently |
| **Live Use** | Can't risk a web request causing an XRun | Audio path is physically separated from management |

---

## 2. CURRENT STATE VS FUTURE STATE

### Current State (February 2026)

- **Hardware:** Single x86_64 workstation (AMD/Intel, 16GB RAM)
- **OS:** Fedora Linux 39+ with optional RT kernel
- **Architecture:** All-in-one monolith
  - JUCE engine, PipeWire, FastAPI, React UI, SQLite — all on one machine
  - CPU isolation via `isolcpus` on cores 2-5 (of 8+)
  - Single Uvicorn process serves API + static web assets
- **Control:** Web browser only (no physical pedalboard)
- **LCD:** Connected directly to same machine's I2C GPIO (if present)
- **Build target:** `x86_64-linux-gnu` with `-march=native`

### Future State (Target)

- **Hardware:** 2× Raspberry Pi 5 (8GB each) + custom MIDI pedalboard
- **OS:** Fedora Linux 39+ aarch64 on both nodes
- **Architecture:** Distributed dual-node
  - Audio Node: JUCE engine + PipeWire + audio-critical services only
  - Management Node: FastAPI + React + SQLite + LCD driver + TUI
  - Gigabit Ethernet direct link between nodes (10.0.0.0/24)
- **Control:** MIDI pedalboard (primary), web browser (secondary), SSH/TUI (admin)
- **LCD:** On pedalboard, driven via I2C from Management Node GPIO
- **Build target:** `aarch64-linux-gnu` with ARM NEON SIMD

### What Changes

| Component | Current Location | Future Location |
|-----------|-----------------|-----------------|
| JUCE Audio Engine (.so) | Local process | **Audio Node** |
| PipeWire daemon | Local | **Audio Node** |
| JUCE Engine Service (pybind11) | Local | **Audio Node** |
| MIDI Service | Local | **Audio Node** |
| Metering Broadcast | Local | **Audio Node** |
| PipeWire Service | Local | **Audio Node** |
| FastAPI / Uvicorn | Local | **Management Node** |
| Service Orchestrator | Local | **Management Node** |
| Chain Service | Local | **Management Node** |
| Plugin Service | Local | **Management Node** |
| Backup Service | Local | **Management Node** |
| SQLite Database | Local | **Management Node** |
| React Web UI (static) | Local | **Management Node** |
| TUI (Textual) | Local | **Management Node** |
| LCD Controller | Local I2C | **Management Node** I2C → pedalboard |
| Cluster Manager | Local | **Management Node** |
| MIDI Pedalboard | N/A (new) | **Physical device** → USB to Audio Node |
| LCD Display | Local I2C | **Pedalboard** ← I2C from Mgmt Node |

---

## 3. HARDWARE BILL OF MATERIALS

### Required Components

| # | Component | Specification | Qty | Purpose |
|---|-----------|---------------|-----|---------|
| 1 | Raspberry Pi 5 | 8GB RAM, BCM2712 | 2 | Audio Node + Management Node |
| 2 | MicroSD Card (Audio) | 64GB+ A2 rated (Samsung EVO+) | 1 | Audio Node OS + plugins |
| 3 | MicroSD Card (Mgmt) | 32GB+ A2 rated | 1 | Management Node OS + DB |
| 4 | USB-C Power Supply | 27W (5.1V/5A) official RPi PSU | 2 | Power for each node |
| 5 | Ethernet Cable | Cat 6, 30cm-1m | 1 | Direct node-to-node link |
| 6 | USB Audio Interface | Edirol UA-1000 (10in/10out) | 1 | Audio I/O on Audio Node |
| 7 | RPi 5 Active Cooler | Official or Pimoroni | 2 | Thermal management |
| 8 | RPi 5 Case | Argon ONE or open-frame | 2 | Physical protection |

### MIDI Pedalboard Components

| # | Component | Specification | Qty | Purpose |
|---|-----------|---------------|-----|---------|
| 9 | Momentary Footswitches | SPST soft-touch, LED-capable | 10 | Preset/effect/control switching |
| 10 | LED Indicators | 3mm, red/green bi-color | 10 | Footswitch status display |
| 11 | Expression Pedal Jacks | TRS 1/4" jack | 2 | EXP1 + EXP2 inputs |
| 12 | 20x4 I2C LCD | HD44780 compatible, blue backlight | 1 | Center-mount status display |
| 13 | Arduino/Teensy MIDI Controller | Teensy 4.0 or Arduino Leonardo | 1 | Footswitch → USB MIDI conversion |
| 14 | I2C Level Shifter | 3.3V ↔ 5V bidirectional | 1 | RPi GPIO to LCD voltage match |
| 15 | I2C Cable | 4-wire (SDA, SCL, VCC, GND), 1-2m | 1 | Pedalboard LCD → Mgmt Node GPIO |
| 16 | USB Cable (MIDI) | USB-B or USB-C, 1-2m | 1 | Pedalboard → Audio Node USB |
| 17 | Enclosure | Aluminum pedalboard chassis, 50x20cm | 1 | Housing for switches + LCD |
| 18 | Expression Pedals | Standard guitar expression pedal | 2 | Volume/Wah + parameter control |
| 19 | Power Supply (Pedalboard) | 9V DC or USB-powered | 1 | LEDs + LCD + microcontroller |

### Optional / Recommended

| # | Component | Purpose |
|---|-----------|---------|
| 20 | USB WiFi Adapter (Audio Node) | If direct Ethernet isn't available |
| 21 | GPIO Ribbon Cable (Mgmt) | Easier I2C breakout |
| 22 | DIN MIDI adapter | If pedalboard uses 5-pin DIN instead of USB |
| 23 | Rack mount shelf | For mounting both RPi 5 units |
| 24 | UPS / Battery backup | Clean power for live performance |

---

## 4. PHYSICAL LAYOUT & WIRING

### Wiring Diagram

```
                         ┌─────────────────────────────────────┐
                         │       MIDI PEDALBOARD ENCLOSURE     │
                         │                                      │
                         │  [Teensy 4.0 MIDI Controller]        │
                         │    ├── 10x Footswitches (GPIO)       │
                         │    ├── 10x LEDs (GPIO)               │
                         │    ├── 2x Expression (Analog In)     │
                         │    └── USB-B out ──────────────────┐ │
                         │                                    │ │
                         │  [20x4 LCD HD44780]                │ │
                         │    ├── SDA ─────────────────────┐  │ │
                         │    ├── SCL ─────────────────────┤  │ │
                         │    ├── VCC (5V) ────────────────┤  │ │
                         │    └── GND ─────────────────────┤  │ │
                         └─────────────────────────────────┼──┼─┘
                                   I2C cable (4-wire)      │  │ USB MIDI cable
                                                           │  │
┌──────────────────────────────────────┐                   │  │
│  MANAGEMENT NODE (RPi 5 #2)          │                   │  │
│                                      │                   │  │
│  GPIO Header:                        │                   │  │
│    Pin 3 (SDA1) ◄────────────────────┤                   │  │
│    Pin 5 (SCL1) ◄────────────────────┤                   │  │
│    Pin 4 (5V)   ◄────────────────────┤                   │  │
│    Pin 6 (GND)  ◄────────────────────┘                   │  │
│                                      │                   │  │
│  Ethernet (eth0):                    │                   │  │
│    10.0.0.2/24 ◄════ Cat6 Cable ════►│ 10.0.0.1/24      │  │
│                                      │                   │  │
│  WiFi (wlan0):                       │                   │  │
│    192.168.1.x (LAN for web clients) │                   │  │
└──────────────────────────────────────┘                   │  │
                                                           │  │
┌──────────────────────────────────────┐                   │  │
│  AUDIO NODE (RPi 5 #1)              │                      │
│                                      │                      │
│  USB Ports:                          │                      │
│    USB 3.0 #1 ◄── Edirol UA-1000    │                      │
│    USB 2.0 #1 ◄──────────────────────────────────────────┘
│               (USB MIDI from pedalboard)                    │
│                                      │                      │
│  Ethernet (eth0):                    │                      │
│    10.0.0.1/24 ◄════ Cat6 Cable ════►│ (to Mgmt Node)      │
│                                      │                      │
│  Audio I/O:                          │
│    XLR In (via UA-1000) ◄── Guitar   │
│    XLR Out (via UA-1000) ──► Amp/Monitors                   │
└──────────────────────────────────────┘
```

### GPIO Pin Assignment — Management Node

| RPi 5 Pin | GPIO | Function | Connected To |
|-----------|------|----------|-------------|
| Pin 3 | GPIO 2 (SDA1) | I2C Data | LCD SDA (via level shifter) |
| Pin 5 | GPIO 3 (SCL1) | I2C Clock | LCD SCL (via level shifter) |
| Pin 4 | — | 5V Power | LCD VCC |
| Pin 6 | — | Ground | LCD GND |

### I2C Configuration

- **Bus:** `/dev/i2c-1` on RPi 5
- **Address:** `0x27` (PCF8574 I2C backpack, typical for HD44780)
- **Speed:** 100kHz (standard mode) or 400kHz (fast mode)
- **Cable length:** Max 2 meters with level shifter
- **Python library:** `smbus2` or `RPLCD` with I2C backend

---

## 5. NODE ARCHITECTURE

### Layer Distribution

```
                    ┌─────────────────────────────────────────────────┐
                    │        MIDI PEDALBOARD + LCD                    │
                    │        (Layer 5 — Physical)                     │
                    └───────┬────────────────────────────┬────────────┘
                            │                            │
              ┌─────────────▼──────────────┐  ┌─────────▼──────────────────┐
              │     AUDIO NODE (RPi 5)     │  │   MANAGEMENT NODE (RPi 5)  │
              │                            │  │                            │
              │  ┌──────────────────────┐  │  │  ┌──────────────────────┐  │
              │  │ Layer 3a:            │  │  │  │ Layer 4:             │  │
              │  │ Audio Services       │  │  │  │ User Interfaces      │  │
              │  │ • JUCE Engine Svc    │  │  │  │ • React Web UI       │  │
              │  │ • MIDI Service       │  │  │  │ • TUI (Textual)      │  │
              │  │ • Metering Broadcast │  │  │  └──────────────────────┘  │
              │  │ • PipeWire Service   │  │  │                            │
              │  └──────────────────────┘  │  │  ┌──────────────────────┐  │
              │                            │  │  │ Layer 3b:            │  │
              │  ┌──────────────────────┐  │  │  │ Management Services  │  │
              │  │ Layer 2:             │  │  │  │ • FastAPI + Uvicorn  │  │
              │  │ JUCE Audio Engine    │  │  │  │ • Service Orchestrator│ │
              │  │ (RT Core — CENTER)   │  │  │  │ • Chain Service      │  │
              │  │ • NAM Processor      │  │  │  │ • Plugin Service     │  │
              │  │ • IR Convolution     │  │  │  │ • Backup Service     │  │
              │  │ • LV2 Plugin Host    │  │  │  │ • LCD Controller     │  │
              │  │ • DSP Effects        │  │  │  │ • SQLite Database    │  │
              │  │ • Metering (FFT)     │  │  │  └──────────────────────┘  │
              │  └──────────────────────┘  │  │                            │
              │                            │  │  ┌──────────────────────┐  │
              │  ┌──────────────────────┐  │  │  │ Layer 0:             │  │
              │  │ Layer 1:             │  │  │  │ Fedora Linux aarch64 │  │
              │  │ PipeWire Audio Server│  │  │  │ (headless, no RT)    │  │
              │  │ • pipewire daemon    │  │  │  │ All 4 cores for svcs │  │
              │  │ • wireplumber        │  │  │  └──────────────────────┘  │
              │  │ • JACK compat layer  │  │  │                            │
              │  └──────────────────────┘  │  └────────────────────────────┘
              │                            │
              │  ┌──────────────────────┐  │
              │  │ Layer 0:             │  │
              │  │ Fedora Linux aarch64 │  │
              │  │ (RT kernel,          │  │
              │  │  isolcpus=2,3)       │  │
              │  └──────────────────────┘  │
              │                            │
              │  [USB Audio Interface]     │
              └────────────────────────────┘
```

---

## 6. AUDIO NODE — DETAILED SPECIFICATION

### Role

The Audio Node is a **dedicated real-time audio processor**. It runs the JUCE C++ engine, PipeWire, and only the Python services that require direct pybind11 access to the engine. It has **no web server, no database, no user-facing UI**. It is optimized for minimum latency and zero-allocation audio processing.

### OS Configuration

```bash
# /etc/default/grub additions
GRUB_CMDLINE_LINUX="isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 \
  irqaffinity=0,1 nosoftlockup processor.max_cstate=0 idle=poll \
  threadirqs audit=0"

# Kernel
kernel-rt (aarch64 build) or standard kernel with PREEMPT_RT patches

# CPU Governor
echo performance > /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Memory
vm.swappiness = 10
vm.overcommit_memory = 1
```

### Installed Software

```
# Audio Stack
pipewire >= 1.0
pipewire-jack
wireplumber
alsa-lib, alsa-utils

# Build Dependencies (for JUCE engine)
gcc-c++ (aarch64)
cmake, ninja-build
juce 8.0.0 (fetched by CMake)
eigen3 (ARM NEON optimized)
lilv, lv2 (LV2 plugin hosting)

# Python (for audio-side services)
python3.14
pybind11
# Minimal pip packages:
aiohttp          # For WebSocket to Management Node
alsa-midi        # ALSA MIDI Python bindings
psutil           # CPU/memory metrics
```

### Services Running on Audio Node

#### Systemd Services

```ini
# /etc/systemd/system/map2-audio-engine.service
[Unit]
Description=MAP2 Audio Engine (JUCE + PipeWire)
After=pipewire.service
Requires=pipewire.service

[Service]
Type=simple
ExecStart=/opt/map2/bin/map2-audio-node
User=map2
Group=audio
CPUAffinity=2 3
Nice=-20
IOSchedulingClass=realtime
IOSchedulingPriority=0
LimitRTPRIO=99
LimitMEMLOCK=infinity
Environment=PIPEWIRE_RUNTIME_DIR=/run/user/1000

[Install]
WantedBy=multi-user.target
```

#### Python Services (Layer 3a)

These run as a lightweight Python process on the Audio Node, communicating with the JUCE engine via pybind11 and with the Management Node via WebSocket/REST:

| Service | File | Purpose | Binding |
|---------|------|---------|---------|
| JUCE Engine Service | `juce_engine_service.py` | pybind11 bridge to C++ engine | Direct (same process) |
| MIDI Service | `midi_service.py` | ALSA MIDI from pedalboard | Local USB MIDI |
| MIDI Engine | `midi_engine.py` | MIDI → parameter routing | pybind11 |
| MIDI Learn | `midi_learn.py` | CC learn mode | pybind11 |
| Metering Broadcast | `metering_broadcast.py` | FFT/LUFS data streaming | pybind11 → WebSocket out |
| PipeWire Service | `pipewire_service.py` | pw-cli / pw-dump wrapper | Local subprocess |
| Audio Health Monitor | `audio_health_monitor.py` | XRun detection, CPU monitor | Local /proc |
| RT Monitor | `rt_monitor.py` | Real-time thread watchdog | Local /proc |

#### Audio Node Local API

The Audio Node exposes a **lightweight internal API** on the private Ethernet interface for the Management Node to call:

```
Host: 10.0.0.1:8081 (private, not exposed to LAN)
Framework: aiohttp (lightweight, no FastAPI overhead)

Endpoints:
  GET  /status              → engine status, CPU, latency
  GET  /metering            → current FFT/LUFS snapshot
  POST /engine/initialize   → start JUCE engine
  POST /engine/shutdown     → stop JUCE engine
  PUT  /engine/parameter    → set a parameter value
  POST /chain/load          → load a preset chain
  POST /chain/switch        → A/B chain morph
  GET  /plugins/active      → list active plugins
  POST /plugin/bypass       → bypass a plugin slot
  GET  /pipewire/status     → PipeWire graph info
  POST /midi/learn/start    → enter MIDI learn mode
  POST /midi/learn/stop     → exit MIDI learn mode
  GET  /midi/mappings       → current MIDI CC mappings

WebSocket:
  ws://10.0.0.1:8081/ws/metering   → real-time metering stream
  ws://10.0.0.1:8081/ws/events     → engine events (preset loaded, etc.)
  ws://10.0.0.1:8081/ws/midi       → MIDI events (CC, PC, etc.)
```

### C++ Engine Build for ARM64

```cmake
# Changes needed in juce-engine/CMakeLists.txt for aarch64
set(CMAKE_SYSTEM_PROCESSOR aarch64)

# Replace -march=native with ARM-specific flags
if(CMAKE_SYSTEM_PROCESSOR MATCHES "aarch64")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -mcpu=cortex-a76 -mtune=cortex-a76")
    # Eigen ARM NEON optimization
    add_definitions(-DEIGEN_DONT_VECTORIZE=0)
else()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -march=native")
endif()
```

### Existing Source Files on Audio Node

From `juce-engine/Source/`:

| Category | Files |
|----------|-------|
| **Core** | `Map2AudioEngine.cpp/.h`, `PythonBindings.cpp` |
| **Audio I/O** | `JuceAudioGraph.cpp/.h`, `JuceAudioIO.cpp/.h` |
| **Plugin Host** | `JucePluginHost.cpp/.h`, `PluginGraph.cpp/.h`, `PluginHost.cpp/.h` |
| **Amp Modeling** | `NAMProcessor.cpp/.h`, `Peavey5150Processor.cpp/.h`, `TweedBassmanProcessor.cpp/.h` |
| **Effects** | `ChorusProcessor`, `ConvolutionProcessor`, `DelayProcessor`, `CircularDelayProcessor`, `DynamicsProcessor`, `FilterProcessor`, `PhaserProcessor`, `PitchShifterProcessor` |
| **Specialty FX** | `BossXS1PolyShifterProcessor`, `EventideH9Processor`, `H3000Processor`, `IntelliFX8VoiceChorusProcessor`, `LexiLoveProcessor`, `PassionFXProcessor`, `ShoeGazeProcessor` |
| **Mixing** | `ParallelMixerProcessor.cpp/.h` |
| **Metering** | `LufsMeter`, `PhaseCorrelation`, `SpectrumAnalyzer`, `VuMeter`, `CPUMonitor` |
| **MIDI** | `MidiHandler.cpp/.h` |
| **Parameters** | `ParameterBridge.cpp/.h` |
| **Snapshots** | `SnapshotManager.cpp/.h` |
| **Common** | `Common.h` |

---

## 7. MANAGEMENT NODE — DETAILED SPECIFICATION

### Role

The Management Node handles **all non-real-time concerns**: web UI serving, REST API, database operations, preset management, LCD display, TUI, monitoring, backup, and inter-node orchestration. It has **no audio hardware attached** and runs no RT-priority threads.

### OS Configuration

```bash
# Standard Fedora aarch64 kernel (no RT needed)
# No isolcpus — all 4 Cortex-A76 cores available for services

# Headless mode
systemctl set-default multi-user.target

# Enable I2C for LCD
dtparam=i2c_arm=on
# In /boot/config.txt (or equivalent Fedora aarch64 config)

# Enable WiFi for LAN access
nmcli device wifi connect "StudioNetwork" password "..."
```

### Installed Software

```
# Python Application Stack
python3.14
uvicorn[standard]
fastapi
sqlalchemy
aiosqlite
pydantic
textual           # TUI framework
smbus2            # I2C LCD driver
RPLCD             # HD44780 LCD library (optional, higher-level)
aiohttp           # Client for Audio Node API
httpx             # Async HTTP client

# Web UI (pre-built static assets)
# No Node.js needed at runtime — just serve /opt/map2/web/dist/

# System
nginx (optional, for port 80 proxy)
```

### Services Running on Management Node

#### Systemd Services

```ini
# /etc/systemd/system/map2-management.service
[Unit]
Description=MAP2 Management Server (FastAPI + Web UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
WorkingDirectory=/opt/map2
User=map2
Group=map2
Restart=always
RestartSec=5
Environment=MAP2_NODE_ROLE=MANAGEMENT-NODE
Environment=MAP2_AUDIO_NODE_URL=http://10.0.0.1:8081

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/map2-lcd.service
[Unit]
Description=MAP2 LCD Controller (I2C to Pedalboard)
After=map2-management.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 -m app.services.lcd_controller_service
WorkingDirectory=/opt/map2
User=map2
Group=i2c
Restart=always
Environment=MAP2_LCD_I2C_BUS=1
Environment=MAP2_LCD_I2C_ADDR=0x27

[Install]
WantedBy=multi-user.target
```

#### Python Services (Layers 3b + 4)

| Service | File | Purpose |
|---------|------|---------|
| **FastAPI App** | `app/main.py` | REST API + WebSocket server |
| **Service Orchestrator** | `app/services/service_orchestrator.py` | Cross-node service coordination |
| **Chain Service** | `app/services/chain_service.py` | Preset/chain management |
| **Plugin Service** | `app/services/plugin_service.py` | Plugin catalog + metadata |
| **Backup Service** | `app/services/backup_service.py` | DB + config backups |
| **Session Manager** | `app/services/session_manager.py` | Multi-user sessions |
| **Health Checker** | `app/services/health_checker.py` | Both-node health monitoring |
| **LCD Controller** | `app/services/lcd_controller_service.py` | I2C LCD updates (NEW) |
| **LCD Event Router** | `app/services/lcd_event_router.py` | Routes events to LCD |
| **Event Publisher** | `app/services/event_publisher.py` | System event bus |
| **Cluster Manager** | `app/services/cluster_manager.py` | Node discovery + heartbeat |
| **Alert Services** | `app/services/alert_services.py` | Notification system |
| **Automation Engine** | `app/services/automation_engine.py` | Scheduled tasks |
| **Config Hot Reload** | `app/services/config_hot_reload.py` | Live config updates |
| **Upload Service** | `app/services/upload_service.py` | NAM/IR file uploads |
| **Preset Converter** | `app/services/preset_converter_service.py` | Format conversion |

#### Audio Node Proxy Layer (NEW)

The Management Node needs a **proxy client** that forwards audio-related API calls to the Audio Node:

```python
# app/services/audio_node_proxy.py (NEW FILE)

import httpx
import asyncio
from typing import Any

class AudioNodeProxy:
    """
    Proxies API calls from web clients to the Audio Node.
    Management Node acts as a gateway — clients never talk
    directly to the Audio Node's private API.
    """
    
    def __init__(self, audio_node_url: str = "http://10.0.0.1:8081"):
        self.base_url = audio_node_url
        self.client = httpx.AsyncClient(base_url=audio_node_url, timeout=5.0)
        self._ws_connections = {}  # WebSocket relay connections
    
    async def get_engine_status(self) -> dict:
        resp = await self.client.get("/status")
        return resp.json()
    
    async def set_parameter(self, param_id: str, value: float) -> dict:
        resp = await self.client.put("/engine/parameter", 
                                      json={"id": param_id, "value": value})
        return resp.json()
    
    async def load_chain(self, chain_data: dict) -> dict:
        resp = await self.client.post("/chain/load", json=chain_data)
        return resp.json()
    
    async def relay_metering_ws(self, client_ws):
        """Relay real-time metering from Audio Node WS to client WS."""
        async with self.client.stream("GET", "/ws/metering") as stream:
            async for chunk in stream.aiter_bytes():
                await client_ws.send_bytes(chunk)
```

### Database (SQLite on Management Node)

```
Location: /opt/map2/data/map2.db

Tables:
  - chains          (preset chain definitions)
  - presets          (individual preset snapshots)
  - plugins          (plugin catalog, synced from Audio Node)
  - midi_mappings    (CC/PC → parameter mappings)
  - user_settings    (per-user preferences)
  - node_status      (health metrics history)
  - audit_log        (change tracking)
```

### Web UI Serving

```python
# Static files served directly by Uvicorn/FastAPI
# Pre-built on development machine, copied to Management Node

# app/main.py mount:
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="/opt/map2/web/dist", html=True))
```

---

## 8. MIDI PEDALBOARD + LCD — DETAILED SPECIFICATION

### Overview

The MIDI pedalboard is a **custom-built floor controller** that the guitarist steps on during live performance. It contains footswitches, expression pedal jacks, LED indicators, and a centered LCD display. It communicates with the MAP2 system via USB MIDI (to Audio Node) and I2C (LCD from Management Node).

### Microcontroller: Teensy 4.0 (or Arduino Leonardo)

The pedalboard uses a Teensy 4.0 as a USB MIDI class-compliant controller:

```cpp
// Teensy 4.0 MIDI Controller Firmware (Arduino IDE)
// File: pedalboard_firmware/pedalboard_firmware.ino

#include <MIDI.h>
#include <Bounce2.h>

// Pin assignments
const int SWITCH_PINS[] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
const int LED_PINS[]    = {14, 15, 16, 17, 18, 19, 20, 21, 22, 23};
const int EXP1_PIN = A0;  // Expression pedal 1 (analog)
const int EXP2_PIN = A1;  // Expression pedal 2 (analog)

// MIDI CC assignments
const int SW_CC[] = {
    20, 21, 22, 23,   // SW1-4: Preset 1-4 (PC messages instead)
    24, 25,           // SW5-6: Effect toggle 1-2
    26,               // SW7: Chain A/B
    27,               // SW8: Tuner mode
    28,               // SW9: Tap tempo
    29                // SW10: Global bypass
};
const int EXP1_CC = 7;   // Volume (or CC#11 Expression)
const int EXP2_CC = 1;   // Modulation (MIDI-learnable)

// MIDI channel
const int MIDI_CHANNEL = 1;

Bounce switches[10];

void setup() {
    for (int i = 0; i < 10; i++) {
        pinMode(SWITCH_PINS[i], INPUT_PULLUP);
        switches[i].attach(SWITCH_PINS[i]);
        switches[i].interval(20); // 20ms debounce
        pinMode(LED_PINS[i], OUTPUT);
    }
    
    usbMIDI.begin();
}

void loop() {
    // Read footswitches
    for (int i = 0; i < 10; i++) {
        switches[i].update();
        if (switches[i].fell()) {
            if (i < 4) {
                // SW1-4: Send Program Change for preset selection
                usbMIDI.sendProgramChange(i, MIDI_CHANNEL);
            } else {
                // SW5-10: Send CC toggle (0 or 127)
                usbMIDI.sendControlChange(SW_CC[i], 127, MIDI_CHANNEL);
            }
        }
    }
    
    // Read expression pedals (10-bit ADC → 7-bit MIDI)
    static int lastExp1 = -1, lastExp2 = -1;
    int exp1 = analogRead(EXP1_PIN) >> 3; // 0-1023 → 0-127
    int exp2 = analogRead(EXP2_PIN) >> 3;
    
    if (abs(exp1 - lastExp1) > 1) {
        usbMIDI.sendControlChange(EXP1_CC, exp1, MIDI_CHANNEL);
        lastExp1 = exp1;
    }
    if (abs(exp2 - lastExp2) > 1) {
        usbMIDI.sendControlChange(EXP2_CC, exp2, MIDI_CHANNEL);
        lastExp2 = exp2;
    }
    
    // Process incoming MIDI (LED feedback from Audio Node)
    while (usbMIDI.read()) {
        if (usbMIDI.getType() == usbMIDI.ControlChange) {
            int cc = usbMIDI.getData1();
            int val = usbMIDI.getData2();
            // CC 110-119 = LED control for switches 1-10
            if (cc >= 110 && cc <= 119) {
                digitalWrite(LED_PINS[cc - 110], val > 63 ? HIGH : LOW);
            }
        }
    }
}
```

### Footswitch Assignment Table

| Switch | Label | MIDI Message | CC/PC | Action |
|--------|-------|-------------|-------|--------|
| SW1 | Preset 1 | Program Change 0 | PC#0 | Load preset slot 1 |
| SW2 | Preset 2 | Program Change 1 | PC#1 | Load preset slot 2 |
| SW3 | Preset 3 | Program Change 2 | PC#2 | Load preset slot 3 |
| SW4 | Preset 4 | Program Change 3 | PC#3 | Load preset slot 4 |
| SW5 | FX Toggle 1 | CC#24 (127) | Toggle | Bypass/enable effect slot 1 |
| SW6 | FX Toggle 2 | CC#25 (127) | Toggle | Bypass/enable effect slot 2 |
| SW7 | Chain A/B | CC#26 (127) | Toggle | Switch between Chain A and Chain B |
| SW8 | Tuner | CC#27 (127) | Toggle | Mute output + show tuner on LCD |
| SW9 | Tap Tempo | CC#28 (127) | Momentary | Set delay/mod tempo by tap interval |
| SW10 | Bypass All | CC#29 (127) | Toggle | Global bypass (dry signal only) |
| EXP1 | Volume/Wah | CC#7 (0-127) | Continuous | Volume control or wah sweep |
| EXP2 | Parameter | CC#1 (0-127) | Continuous | MIDI-learned parameter |

### LCD Display Specification

| Property | Value |
|----------|-------|
| Type | HD44780-compatible character LCD |
| Size | 20 columns × 4 rows |
| Interface | I2C via PCF8574 backpack |
| I2C Address | `0x27` (configurable via jumpers) |
| Backlight | Blue LED, always on |
| Text Color | White on blue |
| Viewing Angle | Wide (for floor-mounted viewing) |
| Update Rate | 10 Hz for metrics, instant for preset changes |

### LCD Display Modes

#### Mode 1: Normal Playing (default)

```
┌────────────────────┐
│MAP2 v2.0.0    Ch:A │  Line 1: Version + active chain
│5150 Clean     #001 │  Line 2: Preset name + number
│CPU:45% Lat:2.7ms   │  Line 3: Performance metrics
│In:-12dB Out: 0dB OK│  Line 4: Levels + status
└────────────────────┘
```

#### Mode 2: Tuner Mode (SW8 active)

```
┌────────────────────┐
│    *** TUNER ***    │  Line 1: Mode indicator
│       E2            │  Line 2: Detected note
│  ◄──────|──────►    │  Line 3: Tuning indicator bar
│   -20¢    0    +20¢ │  Line 4: Cents sharp/flat
└────────────────────┘
```

#### Mode 3: Preset Loading (transient, 2 seconds)

```
┌────────────────────┐
│  Loading Preset...  │  Line 1: Status
│  → 5150 Clean       │  Line 2: Target preset name
│  Chain A  [████░░]  │  Line 3: Chain + progress bar
│  8 plugins active   │  Line 4: Plugin count
└────────────────────┘
```

#### Mode 4: Error/Warning

```
┌────────────────────┐
│ !! XRUN DETECTED !! │  Line 1: Alert
│ Buffer: 128 @ 48kHz │  Line 2: Current settings
│ CPU: 89% OVERLOAD   │  Line 3: CPU status
│ Consider ↑ buffer   │  Line 4: Recommendation
└────────────────────┘
```

### LCD Controller Service (NEW — Management Node)

```python
# app/services/lcd_controller_service.py (NEW FILE)
# Runs on Management Node, drives LCD via I2C GPIO

import asyncio
import smbus2
from dataclasses import dataclass
from typing import Optional

# HD44780 commands
LCD_CMD = 0x00
LCD_DATA = 0x40
LCD_BACKLIGHT = 0x08
LCD_ENABLE = 0x04

@dataclass
class LCDState:
    line1: str = "MAP2 v2.0.0    Ch:A"
    line2: str = "No Preset     #---"
    line3: str = "CPU:--% Lat:--ms  "
    line4: str = "In:---  Out:--- --"
    mode: str = "normal"  # normal, tuner, loading, error

class LCDControllerService:
    """
    Drives the 20x4 I2C LCD mounted in the MIDI pedalboard.
    Connects to LCD via RPi 5 GPIO I2C bus on Management Node.
    Receives status updates from Audio Node via inter-node WebSocket.
    """
    
    def __init__(self, i2c_bus: int = 1, i2c_addr: int = 0x27):
        self.bus = smbus2.SMBus(i2c_bus)
        self.addr = i2c_addr
        self.state = LCDState()
        self._running = False
    
    async def start(self):
        """Initialize LCD and start update loop."""
        self._init_lcd()
        self._running = True
        asyncio.create_task(self._update_loop())
        asyncio.create_task(self._listen_audio_node_events())
    
    async def stop(self):
        self._running = False
        self._clear()
        self.bus.close()
    
    def _init_lcd(self):
        """Send HD44780 initialization sequence over I2C."""
        # 4-bit mode init, display on, cursor off
        for cmd in [0x33, 0x32, 0x28, 0x0C, 0x06, 0x01]:
            self._send_command(cmd)
    
    def _send_command(self, cmd: int):
        high = cmd & 0xF0
        low = (cmd << 4) & 0xF0
        self.bus.write_byte(self.addr, high | LCD_BACKLIGHT | LCD_ENABLE)
        self.bus.write_byte(self.addr, high | LCD_BACKLIGHT)
        self.bus.write_byte(self.addr, low | LCD_BACKLIGHT | LCD_ENABLE)
        self.bus.write_byte(self.addr, low | LCD_BACKLIGHT)
    
    def _write_line(self, line_num: int, text: str):
        """Write a string to a specific LCD line (0-3)."""
        addresses = [0x80, 0xC0, 0x94, 0xD4]  # HD44780 line addresses
        self._send_command(addresses[line_num])
        for char in text.ljust(20)[:20]:
            # Send character data
            data = ord(char)
            high = data & 0xF0
            low = (data << 4) & 0xF0
            self.bus.write_byte(self.addr, high | LCD_BACKLIGHT | LCD_DATA | LCD_ENABLE)
            self.bus.write_byte(self.addr, high | LCD_BACKLIGHT | LCD_DATA)
            self.bus.write_byte(self.addr, low | LCD_BACKLIGHT | LCD_DATA | LCD_ENABLE)
            self.bus.write_byte(self.addr, low | LCD_BACKLIGHT | LCD_DATA)
    
    def _refresh_display(self):
        """Write all 4 lines to LCD."""
        self._write_line(0, self.state.line1)
        self._write_line(1, self.state.line2)
        self._write_line(2, self.state.line3)
        self._write_line(3, self.state.line4)
    
    def _clear(self):
        self._send_command(0x01)
    
    async def _update_loop(self):
        """Refresh LCD at 10Hz for metrics, instant for events."""
        while self._running:
            self._refresh_display()
            await asyncio.sleep(0.1)  # 100ms = 10Hz
    
    async def _listen_audio_node_events(self):
        """
        Connect to Audio Node's WebSocket and update LCD state
        based on real-time events (preset changes, metering, etc.)
        """
        import aiohttp
        audio_node_ws = "ws://10.0.0.1:8081/ws/events"
        
        while self._running:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(audio_node_ws) as ws:
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                data = msg.json()
                                self._handle_event(data)
            except Exception:
                await asyncio.sleep(2)  # Reconnect after 2s
    
    def _handle_event(self, event: dict):
        """Update LCD state based on Audio Node events."""
        event_type = event.get("type")
        
        if event_type == "preset_loaded":
            self.state.line2 = f"{event['name'][:14]} #{event['number']:03d}"
            self.state.mode = "normal"
        
        elif event_type == "chain_switched":
            chain = event.get("chain", "A")
            self.state.line1 = f"MAP2 v2.0.0    Ch:{chain}"
        
        elif event_type == "metering":
            cpu = event.get("cpu", 0)
            latency = event.get("latency_ms", 0)
            in_db = event.get("input_db", -99)
            out_db = event.get("output_db", -99)
            self.state.line3 = f"CPU:{cpu:2.0f}% Lat:{latency:.1f}ms"
            self.state.line4 = f"In:{in_db:+.0f}dB Out:{out_db:+.0f}dB OK"
        
        elif event_type == "xrun":
            self.state.mode = "error"
            self.state.line1 = "!! XRUN DETECTED !!"
```

---

## 9. INTER-NODE COMMUNICATION PROTOCOL

### Network Topology

```
Audio Node                              Management Node
┌─────────────────┐                    ┌─────────────────┐
│ eth0: 10.0.0.1  │◄═══ Cat6 ════════►│ eth0: 10.0.0.2  │
│                 │  (direct link)      │                 │
│ No WiFi/LAN     │                    │ wlan0: DHCP     │◄── LAN clients
│ No external     │                    │ (192.168.x.x)   │
│ access          │                    │                 │
└─────────────────┘                    └─────────────────┘
```

### Communication Channels

| Channel | From | To | Protocol | Port | Purpose | Latency |
|---------|------|----|----------|------|---------|---------|
| Engine API | Mgmt → Audio | REST (aiohttp) | 8081 | Parameter changes, chain loading | <1ms |
| Metering Stream | Audio → Mgmt | WebSocket | 8081 | FFT, LUFS, CPU data @ 30Hz | <1ms |
| MIDI Events | Audio → Mgmt | WebSocket | 8081 | CC/PC notifications for LCD | <1ms |
| Engine Events | Audio → Mgmt | WebSocket | 8081 | Preset loaded, XRun, etc. | <1ms |
| Health Heartbeat | Audio → Mgmt | REST | 8081 | Periodic /status poll | 1s interval |
| External API | Clients → Mgmt | REST/WS | 8080 | All web UI traffic | <5ms |

### Message Formats

```json
// Audio Node → Management Node: Metering Update
{
    "type": "metering",
    "timestamp": 1739289600.123,
    "cpu": 45.2,
    "latency_ms": 2.67,
    "input_db": -12.3,
    "output_db": -0.5,
    "spectrum": [/* 512 float values */],
    "lufs": -14.2,
    "xruns": 0
}

// Audio Node → Management Node: Preset Loaded Event
{
    "type": "preset_loaded",
    "name": "5150 Clean",
    "number": 1,
    "chain": "A",
    "plugins": ["NoiseGate", "NAM:5150", "IR:Mesa4x12", "EQ", "Compressor"]
}

// Management Node → Audio Node: Load Chain Command
{
    "action": "load_chain",
    "chain_id": "abc123",
    "preset_data": {
        "name": "5150 Clean",
        "plugins": [/* plugin config */],
        "parameters": {/* param values */}
    }
}

// Management Node → Audio Node: Set Parameter
{
    "action": "set_parameter",
    "plugin_slot": 2,
    "param_id": "gain",
    "value": 0.75
}
```

### Failover Behavior

| Scenario | Audio Node | Management Node | User Experience |
|----------|------------|-----------------|-----------------|
| Mgmt Node crash | **Continues playing** — audio unaffected | Restarts via systemd | Web UI temporarily unavailable, LCD frozen |
| Audio Node crash | JUCE engine stops | Detects via heartbeat, logs alert | Audio stops, LCD shows error, web shows offline |
| Ethernet disconnect | Continues playing, no LCD updates | API returns stale data | Pedalboard still works (USB MIDI direct), no LCD |
| Both nodes up | Normal operation | Normal operation | Full functionality |

---

## 10. SERVICE DISTRIBUTION MAP

### Current → Future Service Mapping

```
CURRENT (single node):                  FUTURE (dual node):

app/main.py ──────────────────────────► MANAGEMENT NODE (unchanged, add proxy)
app/services/service_orchestrator.py ──► MANAGEMENT NODE (add inter-node coord)
app/services/juce_engine_service.py ──► AUDIO NODE (must be co-located with .so)
app/services/midi_service.py ──────────► AUDIO NODE (local USB MIDI)
app/services/midi_engine.py ──────────► AUDIO NODE (direct pybind11)
app/services/midi_learn.py ───────────► AUDIO NODE (direct pybind11)
app/services/midi_mapping_service.py ─► MANAGEMENT NODE (DB storage)
app/services/midi_device_profiles.py ─► AUDIO NODE (local device access)
app/services/metering_broadcast.py ───► AUDIO NODE (pybind11 data, WS relay out)
app/services/pipewire_service.py ─────► AUDIO NODE (local PipeWire)
app/services/audio_health_monitor.py ─► AUDIO NODE (local /proc monitoring)
app/services/rt_monitor.py ──────────► AUDIO NODE (local RT thread monitoring)
app/services/chain_service.py ────────► MANAGEMENT NODE (DB operations)
app/services/plugin_service.py ───────► MANAGEMENT NODE (metadata/catalog)
app/services/backup_service.py ───────► MANAGEMENT NODE (DB backup)
app/services/health_checker.py ───────► MANAGEMENT NODE (aggregate both nodes)
app/services/event_publisher.py ──────► MANAGEMENT NODE (event bus)
app/services/lcd_event_bus.py ────────► MANAGEMENT NODE (LCD driving)
app/services/lcd_event_router.py ─────► MANAGEMENT NODE (LCD event routing)
app/services/cluster_manager.py ──────► MANAGEMENT NODE (node management)
app/services/session_manager.py ──────► MANAGEMENT NODE (user sessions)
app/services/config_hot_reload.py ────► MANAGEMENT NODE (config management)
app/services/upload_service.py ───────► MANAGEMENT NODE (file upload → sync)
app/services/ir_loader.py ───────────► AUDIO NODE (loads IR files for engine)
app/services/nam_processor.py ───────► AUDIO NODE (loads NAM models for engine)
app/services/nam_library.py ─────────► MANAGEMENT NODE (catalog/metadata)
app/services/dsp_manager.py ─────────► AUDIO NODE (DSP parameter management)
app/services/usb_audio_manager.py ───► AUDIO NODE (local USB device management)
app/services/jack_audio.py ──────────► AUDIO NODE (JACK/PipeWire interaction)
app/services/latency_compensation.py ► AUDIO NODE (PDC calculation)
app/services/lv2_discovery.py ───────► AUDIO NODE (local plugin scanning)

NEW FILES:
app/services/audio_node_proxy.py ────► MANAGEMENT NODE (proxy client to Audio Node)
app/services/audio_node_server.py ───► AUDIO NODE (aiohttp server on :8081)
app/services/lcd_controller_service.py ► MANAGEMENT NODE (I2C LCD driver)
pedalboard_firmware/ ────────────────► TEENSY 4.0 (Arduino sketch)
```

---

## 11. NETWORK CONFIGURATION

### Audio Node — `/etc/NetworkManager/system-connections/audio-link.nmconnection`

```ini
[connection]
id=audio-link
type=ethernet
interface-name=eth0
autoconnect=true

[ipv4]
method=manual
addresses=10.0.0.1/24
dns=
never-default=true

[ipv6]
method=disabled
```

### Management Node — `/etc/NetworkManager/system-connections/audio-link.nmconnection`

```ini
[connection]
id=audio-link
type=ethernet
interface-name=eth0
autoconnect=true

[ipv4]
method=manual
addresses=10.0.0.2/24
dns=
never-default=true

[ipv6]
method=disabled
```

### Management Node — WiFi (LAN access for clients)

```ini
[connection]
id=studio-wifi
type=wifi
interface-name=wlan0
autoconnect=true

[wifi]
ssid=StudioNetwork

[ipv4]
method=auto

[ipv6]
method=auto
```

### Firewall Rules

```bash
# Audio Node — only allow Management Node
firewall-cmd --zone=trusted --add-source=10.0.0.2/32 --permanent
firewall-cmd --zone=trusted --add-port=8081/tcp --permanent
# Block all other incoming
firewall-cmd --zone=public --set-target=DROP --permanent

# Management Node — allow LAN clients + Audio Node
firewall-cmd --zone=public --add-port=8080/tcp --permanent   # Web UI
firewall-cmd --zone=public --add-port=22/tcp --permanent     # SSH
firewall-cmd --zone=trusted --add-source=10.0.0.1/32 --permanent
```

---

## 12. OS & KERNEL CONFIGURATION

### Audio Node — Kernel Parameters

```bash
# /etc/default/grub
GRUB_CMDLINE_LINUX="isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 \
  irqaffinity=0,1 nosoftlockup processor.max_cstate=0 idle=poll \
  threadirqs audit=0 mitigations=off"

# /etc/sysctl.d/99-map2-audio.conf
vm.swappiness = 10
vm.overcommit_memory = 1
kernel.sched_rt_runtime_us = -1
kernel.sched_latency_ns = 500000
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216

# /etc/security/limits.d/99-map2-audio.conf
map2    -    rtprio    99
map2    -    memlock   unlimited
map2    -    nice      -20

# Disable transparent huge pages
echo never > /sys/kernel/mm/transparent_hugepage/enabled

# CPU governor
echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

### Management Node — Standard Configuration

```bash
# /etc/sysctl.d/99-map2-mgmt.conf
vm.swappiness = 30
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216

# Enable I2C
echo "i2c-dev" >> /etc/modules-load.d/i2c.conf
# Add user to i2c group
usermod -aG i2c map2
```

### PipeWire Configuration (Audio Node Only)

```ini
# /etc/pipewire/pipewire.conf.d/99-map2.conf
context.properties = {
    default.clock.rate          = 48000
    default.clock.quantum       = 128
    default.clock.min-quantum   = 64
    default.clock.max-quantum   = 256
    default.clock.force-quantum = 128
}

context.modules = [
    { name = libpipewire-module-rt
      args = {
          nice.level    = -11
          rt.prio       = 85
          rt.time.soft  = -1
          rt.time.hard  = -1
      }
    }
]
```

---

## 13. BUILD SYSTEM CHANGES

### Cross-Compilation (build on x86_64, target aarch64)

```cmake
# juce-engine/cmake/aarch64-toolchain.cmake (NEW)
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_C_COMPILER aarch64-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++)
set(CMAKE_FIND_ROOT_PATH /usr/aarch64-linux-gnu)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
```

### Native Build on RPi 5

```bash
# On the Audio Node RPi 5 itself:
cd /opt/map2/juce-engine
mkdir build-arm64 && cd build-arm64
cmake .. -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_FLAGS="-mcpu=cortex-a76 -mtune=cortex-a76 -ffast-math"
ninja -j3  # Leave 1 core free for system
```

### Python Extension Module

```bash
# The pybind11 .so module must be built for aarch64
# Output: map2_audio_engine.cpython-314-aarch64-linux-gnu.so
# (currently it's cpython-314-x86_64-linux-gnu.so)
```

---

## 14. DEPLOYMENT & PROVISIONING

### Deployment Script Outline

```bash
#!/bin/bash
# deploy-pi-nodes.sh — Deploy MAP2 to dual RPi 5 nodes

AUDIO_NODE="map2@10.0.0.1"
MGMT_NODE="map2@10.0.0.2"

# --- AUDIO NODE ---
echo "=== Deploying Audio Node ==="
ssh $AUDIO_NODE "sudo mkdir -p /opt/map2"
rsync -avz --exclude='web/' --exclude='data/' \
    ./app/ $AUDIO_NODE:/opt/map2/app/
rsync -avz ./juce-engine/ $AUDIO_NODE:/opt/map2/juce-engine/
rsync -avz ./systemd/map2-audio-engine.service \
    $AUDIO_NODE:/etc/systemd/system/
ssh $AUDIO_NODE "cd /opt/map2/juce-engine && mkdir -p build && cd build && \
    cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Release && ninja -j3"
ssh $AUDIO_NODE "sudo systemctl daemon-reload && \
    sudo systemctl enable --now map2-audio-engine"

# --- MANAGEMENT NODE ---
echo "=== Deploying Management Node ==="
ssh $MGMT_NODE "sudo mkdir -p /opt/map2"
rsync -avz ./app/ $MGMT_NODE:/opt/map2/app/
rsync -avz ./web/dist/ $MGMT_NODE:/opt/map2/web/dist/
rsync -avz ./data/ $MGMT_NODE:/opt/map2/data/
rsync -avz ./systemd/map2-management.service \
    $MGMT_NODE:/etc/systemd/system/
rsync -avz ./systemd/map2-lcd.service \
    $MGMT_NODE:/etc/systemd/system/
ssh $MGMT_NODE "sudo systemctl daemon-reload && \
    sudo systemctl enable --now map2-management map2-lcd"

echo "=== Deployment Complete ==="
echo "Audio Node: http://10.0.0.1:8081/status"
echo "Management Node: http://10.0.0.2:8080"
```

### Configuration — `cluster.conf`

The existing `config/cluster.conf.template` already supports `node_role`:

```ini
# Audio Node: /etc/map2/cluster.conf
[cluster]
name = map2-studio
node_id = audio-node-1
node_role = AUDIO-NODE
environment = production

[server]
host = 10.0.0.1
port = 8081

[network]
peer_nodes = 10.0.0.2:8080

# Management Node: /etc/map2/cluster.conf
[cluster]
name = map2-studio
node_id = mgmt-node-1
node_role = MANAGEMENT-NODE
environment = production

[server]
host = 0.0.0.0
port = 8080

[network]
audio_node = 10.0.0.1:8081
peer_nodes = 10.0.0.1:8081
```

---

## 15. MIGRATION PATH FROM CURRENT ARCHITECTURE

### Phase Approach

The migration should be incremental so the system keeps working at each step:

```
PHASE 0 (Current): All-in-one on x86_64 workstation
    ↓
PHASE 1: Add node_role detection to app/main.py
    - If AUDIO-NODE: only start audio services
    - If MANAGEMENT-NODE: only start management services
    - If ALL-IN-ONE: start everything (backward compatible)
    ↓
PHASE 2: Build audio_node_proxy.py and audio_node_server.py
    - Test on same machine (two processes, different ports)
    ↓
PHASE 3: Cross-compile JUCE engine for aarch64
    - Test on single RPi 5 (all-in-one mode)
    ↓
PHASE 4: Deploy to two RPi 5 boards
    - Audio Node + Management Node
    - Verify inter-node communication
    ↓
PHASE 5: Build and integrate MIDI pedalboard
    - Teensy firmware
    - LCD controller service
    - End-to-end MIDI → engine → LCD flow
    ↓
PHASE 6: Production hardening
    - Failover testing
    - Thermal stress testing
    - Live performance validation
```

### Key Code Changes for Phase 1 (Node Role Detection)

```python
# app/main.py — Add at startup:
import os

NODE_ROLE = os.environ.get("MAP2_NODE_ROLE", "ALL-IN-ONE")
# Values: "AUDIO-NODE", "MANAGEMENT-NODE", "ALL-IN-ONE"

@asynccontextmanager
async def lifespan(app: FastAPI):
    if NODE_ROLE in ("MANAGEMENT-NODE", "ALL-IN-ONE"):
        # Start management services
        await start_management_services()
    
    if NODE_ROLE in ("AUDIO-NODE", "ALL-IN-ONE"):
        # Start audio services
        await start_audio_services()
    
    yield
    
    # Shutdown in reverse
    if NODE_ROLE in ("AUDIO-NODE", "ALL-IN-ONE"):
        await stop_audio_services()
    if NODE_ROLE in ("MANAGEMENT-NODE", "ALL-IN-ONE"):
        await stop_management_services()
```

---

## 16. SIGNAL FLOW SPECIFICATIONS

### Audio Signal Path (Audio Node Only)

```
Guitar → XLR Cable → Edirol UA-1000 Input 1
    ↓ (USB 3.0 to RPi 5)
ALSA Driver (hw:UA1000)
    ↓
PipeWire Input Node (map2_engine:capture_1)
    ↓ Quantum: 128 samples @ 48kHz
JUCE AudioDeviceManager (RT thread, SCHED_FIFO 85, CPU 2-3)
    ↓
AudioProcessorGraph:
    Input Buffer (128 samples)
    → Pre-Gain (+/- 12dB)
    → Noise Gate (threshold: -60dB)
    → NAM Processor (Peavey 5150 model, 0.32ms inference)
    → IR Convolution (Mesa 4x12 cab, 512 taps)
    → Parametric EQ (4-band)
    → Compressor (ratio 4:1, -20dB threshold)
    → Delay (350ms, 40% feedback)
    → Reverb (Hall, 2.5s decay)
    → Post-Gain (0dB)
    Output Buffer (128 samples)
    ↓
PipeWire Output Node (map2_engine:playback_1, playback_2)
    ↓
ALSA Driver → Edirol UA-1000 Output 1+2 → Monitors/Headphones

Total latency: 2.67ms (input) + 0.32ms (NAM) + 2.67ms (output) = ~5.66ms round-trip
```

### MIDI Signal Path (Pedalboard → Audio Node → Management Node → LCD)

```
Guitarist stomps SW1 (Preset 1)
    ↓ Physical footswitch closes
Teensy 4.0 detects GPIO falling edge (20ms debounce)
    ↓ USB MIDI
Program Change #0, Channel 1
    ↓ USB cable to Audio Node RPi 5
ALSA MIDI input (/dev/midi1)
    ↓
midi_service.py (Audio Node Layer 3a)
    ↓ Internal routing
midi_engine.py → pybind11 → JUCE MidiHandler
    ↓ C++ engine
SnapshotManager::loadPreset("5150 Clean")
    ↓ Reconfigures AudioProcessorGraph
    ↓ Engine emits "preset_loaded" event
juce_engine_service.py → WebSocket → Management Node
    ↓ Ethernet (10.0.0.1 → 10.0.0.2)
event_publisher.py (Management Node Layer 3b)
    ↓ Routes to subscribers
lcd_controller_service.py → I2C bus
    ↓ GPIO pins 3,5
LCD Display Line 2 → "5150 Clean     #001"

Total latency: ~15ms (footswitch debounce + USB + processing + Ethernet + I2C)
```

### Management Signal Path (Web Browser → Management Node → Audio Node)

```
User clicks "Load Preset" in React Web UI
    ↓ HTTP POST
Browser → WiFi → Management Node :8080
    ↓ FastAPI route handler
chain_service.py (reads preset from SQLite)
    ↓ Formats chain data
audio_node_proxy.py → HTTP POST to Audio Node
    ↓ Ethernet (10.0.0.2 → 10.0.0.1)
audio_node_server.py (Audio Node :8081)
    ↓ Routes to JUCE Engine Service
juce_engine_service.py → pybind11 → JUCE Engine
    ↓ Response propagates back
Audio Node → Ethernet → Management Node → WebSocket → Browser

Total latency: <50ms (network + DB read + engine load)
```

---

## 17. PERFORMANCE TARGETS

### Audio Node

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Round-trip latency | <6ms (128 samples @ 48kHz) | PipeWire latency measurement |
| NAM inference time | <0.5ms per buffer (ARM64) | JUCE CPU monitor |
| XRun rate | 0 per hour (normal operation) | PipeWire XRun counter |
| CPU usage (RT cores) | <60% average | /proc/stat on cores 2-3 |
| CPU usage (system cores) | <30% average | /proc/stat on cores 0-1 |
| RAM usage | <4GB of 8GB | /proc/meminfo |
| Boot to audio ready | <30 seconds | Systemd timing |
| MIDI response time | <5ms (footswitch to engine) | Oscilloscope measurement |

### Management Node

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| API response (p95) | <10ms | FastAPI middleware timing |
| WebSocket relay latency | <2ms | Timestamp comparison |
| LCD update latency | <20ms (Ethernet + I2C) | Logic analyzer |
| Web page load | <2s (initial), <100ms (SPA nav) | Browser DevTools |
| Database query (p95) | <5ms | SQLAlchemy logging |
| Concurrent web sessions | 5+ simultaneous | Load testing |
| Boot to API ready | <15 seconds | Systemd timing |

### Inter-Node

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Ethernet latency (RTT) | <0.3ms | ping -c 100 10.0.0.1 |
| Metering stream rate | 30 updates/sec sustained | WebSocket frame counter |
| Health heartbeat | Every 1 second | Timestamp monitoring |
| Failover detection | <5 seconds | Heartbeat timeout test |

---

## 18. FAILURE MODES & RECOVERY

| Failure | Detection | Impact | Recovery |
|---------|-----------|--------|----------|
| Audio Node crash | Mgmt heartbeat timeout (5s) | Audio stops | Mgmt Node sends SSH reboot command |
| Management Node crash | Audio Node WS disconnect | No LCD, no web UI | Systemd auto-restart (5s) |
| Ethernet cable disconnect | Both nodes detect link down | No LCD updates, no web proxy | Audio continues standalone, reconnect cable |
| USB Audio unplug | ALSA device removal event | Audio stops | PipeWire auto-reconnects on replug |
| USB MIDI disconnect | MIDI service detects device gone | No pedalboard control | Web UI still works, replug MIDI |
| I2C LCD failure | smbus2 IOError exception | LCD frozen/blank | LCD service restarts, reinitializes |
| SD card corruption | Boot failure or read errors | Node won't start | Swap SD card, deploy from backup |
| Thermal throttle (RPi 5) | CPU freq drops below 2.0GHz | Increased latency, possible XRuns | Improve cooling, reduce plugin count |
| Power loss | Immediate shutdown | Everything stops | UPS battery backup, auto-start on power |

---

## 19. IMPLEMENTATION PHASES

### Phase 1: Node Role Abstraction (1-2 days)
- [ ] Add `MAP2_NODE_ROLE` environment variable to `app/main.py`
- [ ] Create `start_audio_services()` and `start_management_services()` functions
- [ ] Modify service orchestrator to respect node role
- [ ] Test: single machine in ALL-IN-ONE mode still works identically

### Phase 2: Audio Node Server + Management Proxy (2-3 days)
- [ ] Create `app/services/audio_node_server.py` (aiohttp on :8081)
- [ ] Create `app/services/audio_node_proxy.py` (httpx client)
- [ ] Implement WebSocket relay for metering/events
- [ ] Modify existing API routes to proxy through when `MANAGEMENT-NODE`
- [ ] Test: two processes on same machine, different ports

### Phase 3: ARM64 Cross-Compilation (2-3 days)
- [ ] Create `cmake/aarch64-toolchain.cmake`
- [ ] Resolve any x86-specific code in JUCE engine (SSE → NEON)
- [ ] Build `map2_audio_engine.cpython-314-aarch64-linux-gnu.so`
- [ ] Test: single RPi 5 in ALL-IN-ONE mode

### Phase 4: Dual-Node Deployment (1-2 days)
- [ ] Flash two MicroSD cards with Fedora aarch64
- [ ] Configure networking (static IPs, firewall)
- [ ] Configure Audio Node (RT kernel, isolcpus, PipeWire)
- [ ] Configure Management Node (headless, I2C enabled)
- [ ] Deploy application code to both nodes
- [ ] Test: web UI on Management Node controls Audio Node engine

### Phase 5: MIDI Pedalboard Build (3-5 days)
- [ ] Build pedalboard enclosure (aluminum chassis)
- [ ] Wire 10 footswitches + LEDs to Teensy 4.0
- [ ] Wire 2 expression pedal jacks to Teensy analog inputs
- [ ] Flash Teensy with MIDI controller firmware
- [ ] Mount 20x4 LCD in center cutout
- [ ] Wire I2C cable from LCD to Management Node GPIO
- [ ] Create `app/services/lcd_controller_service.py`
- [ ] Test: footswitch → MIDI → engine → LCD end-to-end

### Phase 6: Production Hardening (2-3 days)
- [ ] Thermal stress testing (run NAM + IR + 8 effects for 8 hours)
- [ ] XRun stability testing (must achieve 0 XRuns in 4-hour session)
- [ ] Failover testing (kill each node, verify recovery)
- [ ] LCD display mode testing (all 4 modes)
- [ ] Live performance rehearsal with real guitar rig
- [ ] Document final deployment procedure

### Total Estimated Time: 11-18 days

---

## 20. FILE-BY-FILE CHANGE INVENTORY

### New Files to Create

| File | Node | Purpose |
|------|------|---------|
| `app/services/audio_node_server.py` | Audio | Lightweight aiohttp API server (:8081) |
| `app/services/audio_node_proxy.py` | Management | HTTP client to proxy requests to Audio Node |
| `app/services/lcd_controller_service.py` | Management | I2C LCD driver for pedalboard display |
| `juce-engine/cmake/aarch64-toolchain.cmake` | Build | ARM64 cross-compilation toolchain |
| `systemd/map2-audio-engine.service` | Audio | Systemd unit for Audio Node |
| `systemd/map2-management.service` | Management | Systemd unit for Management Node |
| `systemd/map2-lcd.service` | Management | Systemd unit for LCD controller |
| `config/audio-node.conf` | Audio | Audio Node-specific cluster.conf |
| `config/management-node.conf` | Management | Management Node-specific cluster.conf |
| `pedalboard_firmware/pedalboard_firmware.ino` | Pedalboard | Teensy 4.0 MIDI controller firmware |
| `pedalboard_firmware/README.md` | Pedalboard | Build instructions for firmware |
| `scripts/deploy-pi-nodes.sh` | Dev machine | Deployment automation script |
| `scripts/setup-audio-node.sh` | Audio | First-boot configuration script |
| `scripts/setup-management-node.sh` | Management | First-boot configuration script |
| `docs/PI_NODE_SETUP_GUIDE.md` | Docs | Step-by-step setup documentation |

### Existing Files to Modify

| File | Change |
|------|--------|
| `app/main.py` | Add `MAP2_NODE_ROLE` detection, split service startup |
| `app/services/service_orchestrator.py` | Add inter-node coordination, role-based service lists |
| `app/services/metering_broadcast.py` | Add WebSocket relay output to Management Node |
| `app/services/health_checker.py` | Add remote node health checking via HTTP |
| `app/services/event_publisher.py` | Add cross-node event forwarding |
| `app/services/lcd_event_router.py` | Route events to LCD controller service |
| `app/config.py` | Add node role config, inter-node URLs |
| `app/config/settings.py` | Add `AUDIO_NODE_URL`, `NODE_ROLE` settings |
| `juce-engine/CMakeLists.txt` | Add aarch64 CPU flags, conditional SIMD |
| `config/cluster.conf.template` | Add `audio_node_url`, `node_role` documentation |
| `app/routes/*.py` | Add proxy pass-through for audio endpoints |

### Files That Don't Change

All JUCE C++ source files (`.cpp`, `.h`) remain unchanged — they're platform-independent. The pybind11 bindings also remain the same; only the compiled `.so` changes from x86_64 to aarch64.

---

## 21. TESTING STRATEGY

### Unit Tests

```python
# tests/test_audio_node_proxy.py
async def test_proxy_forwards_status():
    """Verify proxy correctly calls Audio Node /status."""

async def test_proxy_handles_audio_node_down():
    """Verify proxy returns graceful error when Audio Node offline."""

# tests/test_lcd_controller.py
def test_lcd_line_truncation():
    """Verify lines are padded/truncated to exactly 20 chars."""

def test_lcd_event_handling():
    """Verify preset_loaded event updates line 2."""
```

### Integration Tests

```bash
# Run on two processes, same machine
MAP2_NODE_ROLE=AUDIO-NODE python3 -m app.audio_node_server &
MAP2_NODE_ROLE=MANAGEMENT-NODE python3 -m uvicorn app.main:app --port 8080 &

# Test inter-node communication
curl http://localhost:8080/api/engine/status  # Should proxy to :8081
curl http://localhost:8081/status             # Direct audio node
```

### Hardware-in-the-Loop Tests

```bash
# On actual RPi 5 hardware
# 1. Verify audio latency
pw-top  # Should show <3ms graph latency

# 2. Verify MIDI response
amidi -p hw:1,0 --send-hex "C0 00"  # Send PC#0, verify preset loads

# 3. Verify LCD update
i2cdetect -y 1  # Should show device at 0x27

# 4. Verify thermal stability
stress-ng --cpu 2 --cpu-method matrixprod --timeout 3600s &
# Run audio engine simultaneously, check for XRuns

# 5. Verify inter-node latency
ping -c 1000 10.0.0.1 | tail -1  # Should show <0.3ms avg
```

---

## 22. OPEN QUESTIONS & DECISIONS

### Questions to Resolve Before Implementation

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **MIDI controller chip** | Teensy 4.0 vs Arduino Leonardo vs Pi Pico | Teensy 4.0 (fastest USB, native MIDI) |
| 2 | **LCD I2C cable length** | 0.5m, 1m, 2m | 1m (keep nodes close to pedalboard) |
| 3 | **Audio Node API framework** | aiohttp vs FastAPI-lite vs raw asyncio | aiohttp (lightweight, no Pydantic overhead) |
| 4 | **File sync (NAM/IR models)** | rsync, NFS mount, or copy-on-upload | rsync on upload trigger from Mgmt Node |
| 5 | **Shared storage** | Each node has own SD vs shared NFS | Separate SD cards (simpler, more reliable) |
| 6 | **Power supply** | 2 separate PSUs vs single 5V/10A shared | 2 separate (isolation, simpler wiring) |
| 7 | **Enclosure** | Rack mount vs desktop vs under-pedalboard | Under pedalboard shelf (compact rig) |
| 8 | **WiFi vs Ethernet for LAN** | Mgmt Node WiFi vs second Ethernet | WiFi (simpler, RPi 5 has good WiFi 6) |
| 9 | **Tuner implementation** | JUCE FFT-based vs external tuner pedal | JUCE FFT (already have spectrum analyzer) |
| 10 | **LED feedback protocol** | MIDI SysEx from Audio Node vs separate GPIO | MIDI CC (simpler, uses existing USB cable) |
| 11 | **Backup power / UPS** | None vs small USB UPS | Small USB UPS for live gigs |
| 12 | **Cross-compile vs native build** | Build on x86 (cross) vs build on RPi 5 | Native build on RPi 5 (simpler, slower) |
| 13 | **Ethernet direct vs switch** | Cat6 direct vs through a switch | Direct (lowest latency, simplest) |
| 14 | **Expression pedal calibration** | Fixed range vs auto-calibrate | Auto-calibrate on boot (Teensy firmware) |

### Design Decisions Already Made

- ✅ **Two RPi 5 nodes** (not one, not three)
- ✅ **Audio Node = RT workload only** (no web server, no DB)
- ✅ **Management Node = everything else** (API, DB, LCD, web)
- ✅ **Gigabit Ethernet direct link** (10.0.0.0/24 private subnet)
- ✅ **MIDI pedalboard with centered LCD** (single physical unit)
- ✅ **I2C LCD driven from Management Node** (not Audio Node — keep Audio Node clean)
- ✅ **USB MIDI to Audio Node** (lowest latency for real-time control)
- ✅ **Fedora aarch64** on both nodes (same OS as current x86 deployment)
- ✅ **Backward compatible** — ALL-IN-ONE mode still works on single machine

---

## APPENDIX A: EXISTING CODEBASE REFERENCE

### Repository Structure (relevant portions)

```
map2-audio/
├── app/
│   ├── main.py                          # FastAPI entry point (547 lines)
│   ├── config.py                        # Config system (817 lines)
│   ├── models.py                        # SQLAlchemy models
│   ├── database.py                      # DB connection setup
│   ├── services/
│   │   ├── juce_engine_service.py       # pybind11 bridge → AUDIO NODE
│   │   ├── midi_service.py              # MIDI handling → AUDIO NODE
│   │   ├── midi_engine.py               # MIDI routing → AUDIO NODE
│   │   ├── midi_learn.py                # MIDI learn → AUDIO NODE
│   │   ├── metering_broadcast.py        # Metering WS → AUDIO NODE
│   │   ├── pipewire_service.py          # PipeWire control → AUDIO NODE
│   │   ├── service_orchestrator.py      # Service coord → MODIFY
│   │   ├── chain_service.py             # Chain mgmt → MANAGEMENT NODE
│   │   ├── plugin_service.py            # Plugin catalog → MANAGEMENT NODE
│   │   ├── backup_service.py            # Backup → MANAGEMENT NODE
│   │   ├── health_checker.py            # Health → MANAGEMENT NODE
│   │   ├── cluster_manager.py           # Cluster → MANAGEMENT NODE
│   │   ├── event_publisher.py           # Events → MANAGEMENT NODE
│   │   ├── lcd_event_bus.py             # LCD events → MANAGEMENT NODE
│   │   ├── lcd_event_router.py          # LCD routing → MANAGEMENT NODE
│   │   ├── audio_health_monitor.py      # Audio health → AUDIO NODE
│   │   ├── rt_monitor.py                # RT monitoring → AUDIO NODE
│   │   └── ... (100+ total service files)
│   ├── lcd_models/
│   │   ├── lcd_controller.py            # LCD driver → MANAGEMENT NODE
│   │   ├── lcd_event.py
│   │   └── lcd_event_db.py
│   ├── config/
│   │   └── settings.py
│   └── routes/                          # FastAPI route handlers
├── juce-engine/
│   ├── CMakeLists.txt                   # Build config (needs aarch64 support)
│   ├── Source/
│   │   ├── Map2AudioEngine.cpp/.h       # Main engine
│   │   ├── PythonBindings.cpp           # pybind11 bindings
│   │   ├── NAMProcessor.cpp/.h          # Neural Amp Modeler
│   │   ├── ConvolutionProcessor.cpp/.h  # IR Convolution
│   │   ├── MidiHandler.cpp/.h           # MIDI processing
│   │   └── ... (37+ processor files)
│   └── Modules/
│       └── NeuralAmpModelerCore/        # NAM dependency (Eigen, nlohmann)
├── web/                                 # React 18 + Vite (pre-built → Mgmt Node)
├── config/
│   ├── cluster.conf.template            # Cluster config (468 lines, has node_role)
│   └── system-templates/                # OS tuning configs
├── systemd/                             # Service definitions
├── scripts/                             # Deployment scripts
└── data/                                # SQLite DB + presets
```

### Existing Cluster Config Support

The `config/cluster.conf.template` already defines:
- `node_role = MANAGEMENT-NODE | AUDIO-NODE | STANDBY-NODE`
- `health_check_interval`, `failover_timeout`, `discovery_interval`
- Network topology settings (`latency_threshold_ms`, `multicast_enabled`)
- TLS/SSL for inter-node security

This infrastructure is already partially built — the dual-node deployment builds on existing cluster foundations.

---

## APPENDIX B: RASPBERRY PI 5 HARDWARE SPECIFICATIONS

| Spec | Value |
|------|-------|
| **SoC** | Broadcom BCM2712 |
| **CPU** | Quad-core ARM Cortex-A76 @ 2.4GHz |
| **GPU** | VideoCore VII (not used for MAP2) |
| **RAM** | 8GB LPDDR4X-4267 |
| **Storage** | MicroSD (UHS-I SDR104), M.2 via HAT |
| **USB** | 2× USB 3.0, 2× USB 2.0 |
| **Ethernet** | Gigabit (true GbE, not USB-attached) |
| **WiFi** | 802.11ac (WiFi 5), dual-band |
| **Bluetooth** | 5.0, BLE |
| **GPIO** | 40-pin header (I2C, SPI, UART, PWM) |
| **I2C** | 2× I2C buses available (bus 1 recommended) |
| **Power** | USB-C, 5V/5A (27W) |
| **Dimensions** | 85mm × 56mm × 17mm |
| **TDP** | ~12W typical, 27W peak |
| **OS Support** | Fedora, Ubuntu, Raspberry Pi OS (all aarch64) |

### ARM NEON SIMD Notes

- Eigen automatically detects ARM NEON and vectorizes matrix operations
- NAM inference benefits from NEON 128-bit SIMD (comparable to SSE4.2)
- JUCE DSP module uses NEON intrinsics when available
- Compiler flag: `-mcpu=cortex-a76` enables all Cortex-A76 features including NEON

---

**END OF DOCUMENT**

---

*This document is a complete implementation blueprint. An AI assistant or developer should be able to read this document and build the entire dual-node Raspberry Pi 5 deployment from scratch, including hardware wiring, firmware, OS configuration, code changes, and deployment automation.*

*Reference: See `GOOGLE_AI_ARCHITECTURAL_DIAGRAM_PROMPT.md` for the visual diagram specification of this architecture.*
