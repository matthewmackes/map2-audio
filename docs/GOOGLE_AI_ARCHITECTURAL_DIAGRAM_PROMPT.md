# MAP2 Audio Platform - Architectural Diagram Generation Prompt

**Target AI:** Google Gemini / ImageFX / Vertex AI Image Generation  
**Date:** February 11, 2026  
**Purpose:** Generate a professional, comprehensive architectural diagram of the MAP2 Audio Platform deployment

---

## PROMPT FOR GOOGLE AI

Generate a **large-format, professional architectural diagram** (landscape, minimum 3000x2000px) showing the complete MAP2 Audio Platform system architecture deployed across **two Raspberry Pi 5 nodes** with a **MIDI Pedalboard + LCD** controller above. The diagram must be technically accurate, visually clear, and suitable for professional documentation.

---

## CORE ARCHITECTURAL PRINCIPLES

### 1. **DUAL-NODE RASPBERRY PI 5 DEPLOYMENT WITH MIDI PEDALBOARD**

The diagram MUST show **two Raspberry Pi 5 single-board computers placed SIDE BY SIDE**, each running specific layers. Above both nodes, a **MIDI Pedalboard with centered LCD display** acts as the physical user interface. The layout is:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                    MIDI PEDALBOARD (Physical Floor Controller)                       │
│                                                                                      │
│    [SW1] [SW2] [SW3] [SW4]  ┌────────────────┐  [SW5] [SW6] [SW7] [SW8]            │
│    Preset Bank   Chain A/B  │  20x4 I2C LCD  │  Effects  Tuner  Tap    Bypass       │
│                             │  (Center Mount) │  Toggle   Mode   Tempo              │
│                             └────────────────┘                                       │
│         [EXP1 - Volume/Wah]                          [EXP2 - Parameter Control]      │
└────────────┬─────────────────────────────────────────────┬────────────────────────────┘
             │ USB MIDI                                    │ I2C (LCD) + USB MIDI
             ↓                                             ↓
┌──────────────────────────────────┐  ◄── ETH ──►  ┌──────────────────────────────────┐
│     🔴 AUDIO NODE (RPi 5)       │   (Gigabit)    │   🔵 MANAGEMENT NODE (RPi 5)     │
│                                  │               │                                   │
│  Layer 3a: Audio Services        │               │  Layer 4: Web UI / TUI / LCD Drv  │
│  (JUCE Engine Svc, MIDI Svc,     │               │  (React Dashboard, Textual TUI,   │
│   Metering, PipeWire Svc)        │               │   LCD Controller Driver)           │
│                                  │               │                                   │
│  Layer 2: JUCE Audio Engine (RT) │ ◄── CENTER    │  Layer 3b: Management Services    │
│  (NAM, IR, LV2, DSP, Metering)   │    OF DESIGN  │  (FastAPI, Chain Svc, Plugin Svc, │
│                                  │               │   Orchestrator, Database)          │
│  Layer 1: PipeWire Audio Server  │               │                                   │
│  (pipewire, wireplumber, JACK)   │               │  Layer 0: Fedora Linux (RPi 5)    │
│                                  │               │  (Headless, no audio HW needed)   │
│  Layer 0: Fedora Linux (RPi 5)   │               │                                   │
│  (RT kernel, isolcpus, ALSA)     │               │                                   │
│                                  │               │                                   │
│  ┌──────────────────────────┐    │               │                                   │
│  │ USB Audio Interface      │    │               │                                   │
│  │ (Edirol UA-1000 / MOTU)  │    │               │                                   │
│  └──────────────────────────┘    │               │                                   │
└──────────────────────────────────┘               └───────────────────────────────────┘
```

**Emphasis:** The JUCE Audio Engine on the Audio Node is the heart of the system - make this visually prominent. The two RPi 5 boards should be drawn as distinct physical units side by side, connected by Gigabit Ethernet. The MIDI Pedalboard spans across the top, connecting to both nodes.

---

## DETAILED COMPONENT SPECIFICATIONS

### **LAYER 0: Operating System Foundation (Bottom of BOTH Nodes)**
**Color Scheme:** Dark blue/gray foundation  
**Position:** Bottom 15% of each node column

#### **Audio Node — Layer 0 (LEFT side):**
- **Raspberry Pi 5** (8GB RAM, Broadcom BCM2712 quad-core Cortex-A76)
- **Fedora Linux 39+ (aarch64)** (Base OS)
  - Real-Time Kernel (`kernel-rt` for aarch64)
  - CPU Isolation (`isolcpus=2,3` - 2 of 4 cores dedicated to audio)
  - IRQ Balancing disabled on audio cores
  - Memory locking (`mlockall()` for RT memory)
  
- **ALSA (Advanced Linux Sound Architecture)**
  - Kernel-level audio drivers
  - Hardware device access (`hw:0,0`, `hw:UA1000`, etc.)
  - Direct USB audio interface communication via USB 3.0
  
- **Hardware Devices** (icons at bottom of Audio Node):
  - USB Audio Interfaces: Edirol UA-1000 (10in/10out), Hotone Jogg (2in/2out), MOTU M4
  - RPi 5 CPU cores visualization (4x Cortex-A76: 2 isolated, 2 system)
  - Physical I/O ports (XLR, TRS, S/PDIF, ADAT via USB interface)
  - Gigabit Ethernet port (to Management Node)

#### **Management Node — Layer 0 (RIGHT side):**
- **Raspberry Pi 5** (8GB RAM, Broadcom BCM2712 quad-core Cortex-A76)
- **Fedora Linux 39+ (aarch64)** (Base OS, headless)
  - Standard kernel (no RT required)
  - All 4 CPU cores available for services
  - No audio hardware attached
  
- **Hardware Connections:**
  - Gigabit Ethernet port (to Audio Node)
  - I2C GPIO header → LCD display on MIDI pedalboard
  - USB port → MIDI pedalboard (for MIDI relay to Audio Node)
  - WiFi/Ethernet → LAN for web client access

**Visual Style:** Two solid foundation bars side by side, each shaped like a Raspberry Pi 5 board outline with GPIO header pins visible

---

### **LAYER 1: PipeWire Audio Server (Audio Node Only — Left Side)**
**Color Scheme:** Purple/violet gradient  
**Position:** 15-35% from bottom of the AUDIO NODE column  
**Size:** Prominent band within the Audio Node

**NOTE:** This layer exists ONLY on the Audio Node. The Management Node does NOT run PipeWire.

**Components to show:**

1. **PipeWire Core Services:**
   - **PipeWire Daemon** (`pipewire`)
     - Session manager
     - Graph engine
     - Port routing matrix
     - Quantum/buffer management (64-256 samples)
     - Sample rate negotiation (44.1/48/96/192 kHz)
   
   - **WirePlumber**
     - Policy manager
     - Automatic device routing
     - Hot-plug device detection
     - Session persistence

2. **JACK Compatibility Layer:**
   - `pipewire-jack` library
   - JACK API emulation
   - Transparent JACK client support
   - `/usr/lib64/pipewire-0.3/jack/libjack.so`

3. **PipeWire Graph Nodes:**
   - Input nodes (USB devices)
   - Output nodes (monitors, DAW)
   - Filter nodes (applications)
   - Link connections between nodes

4. **Metrics Display:**
   - Current quantum: "128 samples"
   - Sample rate: "48000 Hz"
   - Graph latency: "2.67 ms"
   - XRun count monitoring

**Visual Style:** Sophisticated routing graph with visible connections, flow indicators

---

### **LAYER 2: JUCE Audio Engine - Real-Time Core (Audio Node Only — LEFT, CENTER OF DESIGN)**
**Color Scheme:** Bright green/cyan (indicates "active processing")  
**Position:** 35-60% from bottom of the AUDIO NODE column  
**Size:** LARGEST and most detailed section within the Audio Node - the system's heart

**This layer runs ONLY on the Audio Node (RPi 5 #1).** Make this section PROMINENT with clear subsystems.
**Show the RPi 5's Cortex-A76 cores pinned to this workload.**

#### **A. JUCE Framework Integration**
- **JUCE 8.0.0 Framework**
  - `juce_audio_basics`, `juce_audio_devices`, `juce_audio_processors`
  - `juce_dsp`, `juce_audio_formats`, `juce_core`
  
#### **B. Audio I/O Layer**
- **JuceAudioIO** component
  - JACK/PipeWire device connection
  - `AudioDeviceManager` with RT priority
  - `SCHED_FIFO` thread scheduling (priority 85)
  - Buffer size: 64-256 samples
  - CPU core affinity (pinned to isolated cores 2-3 on RPi 5)

#### **C. Audio Processing Graph (AudioProcessorGraph)**
Show as a flowchart within JUCE engine:

```
Audio Input → Pre-Gain → [Processing Chain] → Post-Gain → Audio Output
                              ↓
                    ┌─────────┴─────────┐
                    │   A/B Morphing    │
                    │   Chain Router    │
                    └─────────┬─────────┘
                              ↓
              ┌───────────────┴───────────────┐
              │   Plugin Host (LV2/NAM/IR)    │
              │   - Neural Amp Modeler (NAM)  │
              │   - Impulse Response (IR)     │
              │   - LV2 Plugin Chain          │
              │   - Custom DSP Processors     │
              └───────────────────────────────┘
```

#### **D. Built-in DSP Processors** (show as plugin slots):
1. **Neural Amp Modeling:**
   - NAM Processor (Eigen-based inference)
   - `.nam` model loading
   - Real-time parameter modulation
   
2. **Convolution Engine:**
   - IR Loader (Convolution Processor)
   - Cabinet simulation
   - Stereo/mono modes
   - Zero-latency/low-latency modes

3. **Effects Processors:**
   - Dynamics: Compressor, Limiter, Gate, Expander
   - Time-based: Chorus, Phaser, Reverb, Delay
   - Modulation: Pitch Shifter, Ultra-Harmonizer
   - Filter Bank: EQ, HPF, LPF, Parametric
   - Vintage Emulations: Peavey 5150, Tweed Bassman

4. **Analysis & Metering:**
   - Spectrum Analyzer (FFT-based)
   - LUFS Meter (loudness)
   - VU Meters (RMS/Peak)
   - Phase Correlation
   - CPU Load Monitor

#### **E. Plugin Host Infrastructure:**
- **LV2 Plugin Host** (`lilv` library)
  - Plugin discovery & scanning
  - Plugin instantiation
  - Parameter automation
  - Plugin state management
  
- **MIDI Handler:**
  - ALSA MIDI input/output
  - MIDI learn system
  - CC/PC message routing
  - MIDI clock sync

#### **F. Performance Management:**
- **CPU Monitor** 
  - Per-core utilization tracking
  - RT thread CPU usage
  - Overrun detection
  
- **Memory Manager**
  - `mlockall()` for RT safety
  - Pre-allocated audio buffers
  - Zero-allocation RT path

**Visual Style:** Complex, interconnected graph showing signal flow with green "active" indicators

---

### **LAYER 3: Application Services & APIs (SPLIT ACROSS BOTH NODES)**
**Color Scheme:** Blue gradient  

Layer 3 is **split across both Raspberry Pi 5 nodes**. Services that require direct access to the JUCE engine or audio hardware run on the **Audio Node**. All other management, API, and database services run on the **Management Node**. The two halves communicate over Gigabit Ethernet via REST/WebSocket.

---

#### **LAYER 3a: Audio-Side Services (Audio Node — LEFT side)**
**Position:** Top 25% of the Audio Node column (above JUCE Engine)

**These services run on the Audio Node because they need direct, low-latency access to the JUCE C++ engine via pybind11:**

1. **JUCE Engine Service** (`juce_engine_service.py`)
   - Python↔C++ bridge (pybind11) — must be co-located with engine
   - Engine initialization/shutdown
   - Parameter control proxy
   - Audio routing commands

2. **MIDI Service** (`midi_service.py`)
   - ALSA MIDI device enumeration (local USB MIDI from pedalboard)
   - MIDI learn functionality
   - CC mapping storage
   - MIDI routing to JUCE engine

3. **Metering Broadcast** (`metering_broadcast.py`)
   - Real-time spectrum data from JUCE FFT
   - LUFS loudness streaming
   - CPU metrics broadcast
   - Forwards data to Management Node via WebSocket

4. **PipeWire Service** (`pipewire_service.py`)
   - PipeWire daemon control (local to Audio Node)
   - Graph introspection (`pw-cli`, `pw-dump`)
   - Node/port management
   - Latency monitoring

**Visual Style:** Blue boxes within the Audio Node, with green arrows down to JUCE Engine

---

#### **LAYER 3b: Management Services (Management Node — RIGHT side)**
**Position:** 40-70% from bottom of the Management Node column

**These services run on the Management Node, offloading non-RT work from the Audio Node:**

##### **A. FastAPI Backend Server**
- **Uvicorn ASGI Server**
  - Host: `0.0.0.0:8080`
  - Async Python services
  - REST API endpoints
  - Proxies audio commands to Audio Node over Ethernet
  
- **Service Orchestrator:**
  - Coordinates all services across BOTH nodes
  - Lifecycle management
  - Health monitoring
  - Service dependency resolution
  - Cluster node heartbeat monitoring

##### **B. Management Services (show as microservice boxes):**

1. **Chain Service** (`chain_service.py`)
   - Preset management
   - Chain A/B morphing commands (forwarded to Audio Node)
   - Snapshot system
   - Database persistence

2. **Plugin Service** (`plugin_service.py`)
   - LV2 plugin discovery results (synced from Audio Node)
   - NAM model management
   - IR library management
   - Plugin parameter API

##### **C. Data Layer:**
- **SQLite Database** (`data/map2.db`)
  - SQLAlchemy ORM
  - Async connection pool (aiosqlite)
  - Tables: chains, presets, plugins, midi_mappings, user_settings

- **Backup Service:**
  - Automated backups
  - Configuration export
  - State snapshots

##### **D. LCD Controller Service:**
- **LCD Driver** (`lcd_models/lcd_controller.py`)
  - Drives the 20x4 I2C LCD mounted in the MIDI pedalboard
  - Connected via RPi 5 GPIO I2C bus (SDA/SCL)
  - Displays: current preset, CPU load, levels, active chain

##### **E. Communication Protocols:**

1. **Inter-Node API (shown as ORANGE arrows between nodes):**
   - Audio Node exposes local API on `10.0.0.1:8081` (private Ethernet)
   - Management Node proxies client requests to Audio Node
   - Low-latency parameter updates forwarded in <1ms
   - Metering WebSocket stream relayed to web clients

2. **External REST API (shown as blue arrows UP to Layer 4):**
   - `GET /api/audio/status`
   - `POST /api/chains/activate`
   - `GET /api/plugins/list`
   - `PUT /api/engine/parameter/{id}`
   - 50+ endpoints documented

3. **WebSocket Channels (shown as purple arrows UP to Layer 4):**
   - `/ws/events` - System events
   - `/ws/metering` - Real-time audio meters (relayed from Audio Node)
   - `/ws/midi` - MIDI events
   - `/ws/spectrum` - FFT spectrum data (relayed from Audio Node)
   - Bi-directional, low-latency

**Visual Style:** Blue service boxes within the Management Node, with orange arrows crossing to Audio Node

---

### **LAYER 4: Management & Control Interfaces (Management Node — RIGHT, Top)**
**Color Scheme:** Light blue/white (user-facing)  
**Position:** Top 30% of the Management Node column

**These interfaces run on or are served by the Management Node. Show TWO software interfaces within the Management Node, plus the physical MIDI Pedalboard + LCD above both nodes.**

#### **A. Web Dashboard (Primary Interface)**
**Position:** Upper portion of Management Node

- **Technology Stack:**
  - React 18 + TypeScript
  - Vite build system
  - Material-UI components
  - Recharts for visualization
  - Served by Uvicorn on Management Node `:8080`
  
- **Pages/Features (show as tabs):**
  - Audio Engine Control
  - Chain Designer (A/B morphing)
  - Plugin Browser (LV2/NAM/IR)
  - PipeWire Dashboard
  - MIDI Mapping
  - Preset Library
  - System Monitoring
  - Cluster Dashboard (multi-node)
  
- **Real-time Displays:**
  - Spectrum analyzer visualization
  - LUFS meter graph
  - CPU load per core
  - Latency graph
  - XRun counter

- **Connection:** HTTP/WebSocket from any device on LAN → Management Node `:8080`

#### **B. Text-based UI (TUI) - Node Console**
**Position:** Within Management Node

- **Technology:** Textual (Python TUI framework)
- **Use Cases:** 
  - SSH into Management Node for remote control
  - Headless server management
  - Quick system checks across both nodes
  
- **Screens:**
  - Audio status (proxied from Audio Node)
  - Service health (both nodes)
  - Plugin management
  - Log viewer
  - Emergency recovery
  
- **Connection:** Direct API calls (local on Management Node, proxied to Audio Node)

---

### **LAYER 5: MIDI PEDALBOARD + LCD (Physical Controller — ABOVE BOTH NODES)**
**Color Scheme:** Dark metallic gray with bright LED indicators (red, green, amber)  
**Position:** TOPMOST element of the diagram — spanning the FULL WIDTH above both RPi 5 nodes  
**Size:** 15-20% of total diagram height

**This is the physical floor controller that the guitarist stands on. It spans across the top of the entire diagram, with cables dropping down to BOTH nodes below.**

#### **Physical Layout (show as a realistic pedalboard top-down view):**

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        MAP2 MIDI PEDALBOARD                                      │
│                      (Custom Floor Controller)                                   │
│                                                                                  │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   ┌────────────────┐   ┌──────┐ ┌──────┐ │
│   │ SW 1 │ │ SW 2 │ │ SW 3 │ │ SW 4 │   │ ┌────────────┐ │   │ SW 5 │ │ SW 6 │ │
│   │Preset│ │Preset│ │Preset│ │Preset│   │ │MAP2 v2.0.0 │ │   │Effect│ │Effect│ │
│   │  1   │ │  2   │ │  3   │ │  4   │   │ │5150 Clean  │ │   │Toggle│ │Toggle│ │
│   │ [●]  │ │ [○]  │ │ [○]  │ │ [○]  │   │ │CPU:23% L:2m│ │   │ [●]  │ │ [○]  │ │
│   └──────┘ └──────┘ └──────┘ └──────┘   │ │In:-12 Out:0│ │   └──────┘ └──────┘ │
│                                          │ │Chain A ████ │ │                      │
│   ┌──────┐ ┌──────┐                     │ └────────────┘ │   ┌──────┐ ┌──────┐ │
│   │ SW 7 │ │ SW 8 │                     │  20x4 I2C LCD  │   │ SW 9 │ │SW 10 │ │
│   │Chain │ │Tuner │                     │ (HD44780, blue │   │ Tap  │ │Bypass│ │
│   │ A/B  │ │ Mode │                     │  backlight)    │   │Tempo │ │ All  │ │
│   │ [●]  │ │ [○]  │                     └────────────────┘   │ [○]  │ │ [○]  │ │
│   └──────┘ └──────┘                                          └──────┘ └──────┘ │
│                                                                                  │
│   ╔════════════════════════╗                     ╔════════════════════════╗       │
│   ║   EXP 1 - Volume/Wah  ║                     ║  EXP 2 - Param Ctrl   ║       │
│   ╚════════════════════════╝                     ╚════════════════════════╝       │
│                                                                                  │
└────────────┬────────────────────────────────────────────────┬─────────────────────┘
             │                                                │
             │ USB MIDI Cable                                 │ I2C Cable (LCD)
             │ (Footswitches + Expression)                    │ + USB MIDI (relay)
             ↓                                                ↓
      ┌──────────────┐                                 ┌──────────────┐
      │  AUDIO NODE  │◄────── Gigabit Ethernet ──────►│  MGMT NODE   │
      │   (RPi 5)    │         (10.0.0.0/24)           │   (RPi 5)    │
      └──────────────┘                                 └──────────────┘
```

#### **MIDI Pedalboard Components:**

1. **Footswitches (8-10 momentary switches):**
   - SW1-SW4: Preset selection (bank up/down, preset 1-4)
   - SW5-SW6: Effect toggle (bypass individual effects in chain)
   - SW7: Chain A/B switch (instant morphing)
   - SW8: Tuner mode (mutes output, shows tuner on LCD)
   - SW9: Tap tempo (for delay/modulation sync)
   - SW10: Global bypass (all effects)
   - Each switch has an LED indicator (red=active, off=inactive)

2. **Expression Pedals (2x TRS jacks):**
   - EXP1: Volume/Wah (CC#7 or CC#11, assignable)
   - EXP2: Parameter control (any CC, MIDI-learned)

3. **20x4 I2C LCD Display (CENTER MOUNT):**
   - **Hardware:** HD44780-compatible, blue backlight, white text
   - **Mounted in the center cutout of the pedalboard enclosure**
   - **Connected via I2C cable to Management Node RPi 5 GPIO**
   - **Display Layout:**
     ```
     Line 1: "MAP2 v2.0.0      " (firmware version)
     Line 2: "5150 Clean        " (active preset name)
     Line 3: "CPU:23% Lat:2.7ms " (performance metrics)
     Line 4: "In:-12dB Out:0dB A" (levels + active chain)
     ```
   - **Driven by:** LCD Controller Service on Management Node
   - **Update Rate:** 10 Hz (every 100ms) for metrics, instant for preset changes

4. **MIDI Protocol:**
   - USB MIDI Class-Compliant (no special drivers)
   - Sends: CC messages (footswitches, expression), PC messages (preset changes)
   - Receives: LED status feedback, LCD data (via SysEx or I2C direct)

#### **Pedalboard Connections (show as cables dropping down):**

| Cable | From | To | Purpose |
|-------|------|----|---------|
| USB MIDI | Pedalboard | Audio Node RPi 5 USB | Footswitch + expression → MIDI Service → JUCE Engine |
| I2C (4-wire) | Pedalboard LCD | Management Node RPi 5 GPIO | LCD data from LCD Controller Service |
| USB MIDI (optional) | Pedalboard | Management Node RPi 5 USB | MIDI relay for preset change logging |
| Power | 9V DC adapter | Pedalboard | LED + LCD power (or powered via USB) |

**Visual Style:** Realistic metallic pedalboard enclosure with visible footswitches, LED dots, centered LCD screen, and expression pedals. Cables shown dropping down to the two RPi 5 nodes below. The pedalboard should look like a physical guitar effects unit.

---

## SIGNAL FLOW VISUALIZATION

**CRITICAL:** Show THREE DISTINCT signal flow types with different visual styles:

### **1. Audio Signal Flow (Thick GREEN arrows — AUDIO NODE ONLY, vertical):**

```
USB Audio Input (Edirol UA-1000 XLR ports)
    ↓ (ALSA driver on Audio Node RPi 5)
PipeWire Input Node
    ↓ (PipeWire graph link)
JUCE Audio Input Buffer
    ↓ (RT thread on isolated Cortex-A76 cores 2-3)
Pre-Gain → NAM Processor → IR Convolution → EQ → Compressor → Reverb
    ↓ (processed audio)
JUCE Audio Output Buffer
    ↓ (PipeWire graph link)
PipeWire Output Node
    ↓ (ALSA driver)
USB Audio Output (Monitors/Headphones)
```

**Arrow Style:** 
- Thick (5-8px) green arrows
- Contained ENTIRELY within the Audio Node column
- Labeled with sample rate/buffer size
- Show latency at each stage (e.g., "2.67ms")
- Indicate real-time priority with "RT" badges

### **2. MIDI/Pedalboard Signal Flow (Thick AMBER arrows — top-down):**

```
Guitarist stomps SW1 (Preset 1)
    ↓ USB MIDI (CC/PC message)
Audio Node RPi 5 USB port
    ↓ ALSA MIDI
MIDI Service (Layer 3a on Audio Node)
    ↓ pybind11
JUCE Engine → loads preset, reconfigures chain
    ↓ (status update via Ethernet)
Management Node → Chain Service logs change
    ↓ I2C GPIO
LCD Display (on pedalboard) → shows "5150 Clean"
```

**Arrow Style:**
- Thick (4-6px) amber/gold arrows
- Flows from pedalboard DOWN to Audio Node, then ACROSS to Management Node, then UP to LCD
- Shows the complete MIDI command lifecycle

### **3. Management Signal Flow (Thin BLUE arrows — bidirectional, crosses nodes):**

```
User (Web Browser at 192.168.1.10)
    ↕ HTTP/WebSocket (WiFi/LAN)
Management Node RPi 5 (Uvicorn :8080)
    ↕ REST/WebSocket (Gigabit Ethernet, 10.0.0.0/24)
Audio Node RPi 5 (local API :8081)
    ↕ Python API / pybind11
JUCE Engine (C++)
    ↕ Control messages
Audio Processors (parameter changes)
```

**Arrow Style:**
- Thin (2-3px) blue arrows
- Bidirectional (↕)
- Clearly crosses between the two RPi 5 node columns via Ethernet
- Labeled with protocol (REST, WS, IPC, Ethernet)
- Show async/sync indicators

---

## VISUAL DESIGN SPECIFICATIONS

### **Color Palette:**
- **Foundation (Fedora/OS):** `#1a1f2e` (dark blue-gray)
- **Raspberry Pi 5 Board:** `#2d5016` (PCB green, subtle)
- **PipeWire Layer:** `#7c3aed` → `#a855f7` (purple gradient)
- **JUCE Engine:** `#10b981` → `#22c55e` (green - "active")
- **Services Layer:** `#3b82f6` → `#60a5fa` (blue gradient)
- **User Interfaces:** `#e0f2fe` → `#ffffff` (light blue to white)
- **MIDI Pedalboard:** `#374151` → `#4b5563` (dark metallic gray)
- **LCD Display:** `#1e3a5f` background, `#ffffff` text (classic LCD blue)
- **Audio Signal:** `#22c55e` (bright green, thick)
- **MIDI Signal:** `#f59e0b` (amber/gold, thick)
- **Management Signal:** `#3b82f6` (blue, thin)
- **Inter-Node Ethernet:** `#f97316` (orange, dashed)
- **Error/Alert States:** `#ef4444` (red)
- **Warning States:** `#f59e0b` (amber)
- **LED Active:** `#ef4444` (red dot)
- **LED Inactive:** `#6b7280` (gray dot)

### **Typography:**

**High-Resolution Version:**
- **Layer Headers:** 36-48pt, bold, sans-serif (e.g., "JUCE AUDIO ENGINE")
- **Component Names:** 24-28pt, medium weight
- **Metrics/Data:** 20-24pt, monospace (for numbers)
- **Annotations:** 18-20pt, italic (for explanatory text)

**Web-Optimized Version:**
- **Layer Headers:** 18-24pt, bold, sans-serif
- **Component Names:** 12-14pt, medium weight
- **Metrics/Data:** 10-12pt, monospace (for numbers)
- **Annotations:** 9-10pt, italic (for explanatory text)

### **Layout:**
- **Aspect Ratio:** 3:2 (landscape) - optimal for both print and web
- **High-Res Version Resolution:** 6000x4000px minimum (print quality)
- **Web Version Resolution:** 2400x1600px (web optimized, Retina-ready)
- **Grid System:** Use 12-column grid for alignment
- **Margins:** 
  - High-res version: 120px on all sides
  - Web version: 60px on all sides (proportional)
- **Layer Spacing:** Clear 60-80px separation between layers (high-res), 30-40px (web)

### **Icons & Symbols:**
- **Raspberry Pi 5:** Green PCB board icon with GPIO header pins
- **CPU cores:** Small Cortex-A76 processor chip icons (4 per RPi 5)
- **USB devices:** USB plug icons with vendor logos
- **USB Audio Interface:** Rack-mount unit icon (Edirol UA-1000)
- **MIDI Pedalboard:** Floor controller icon with footswitch dots
- **LCD Display:** Blue rectangle with white text lines
- **Footswitch:** Circle with LED dot (filled=active, hollow=inactive)
- **Expression Pedal:** Rocker pedal side-view icon
- **Database:** Cylinder icon
- **Ethernet:** RJ45 connector / cable icon
- **I2C bus:** 4-wire ribbon cable icon
- **WebSocket:** Lightning bolt or radio wave icon
- **REST API:** HTTP request/response arrows
- **Real-time thread:** Stopwatch or clock icon with "RT" badge
- **Health status:** Traffic light colors (green/amber/red circles)
- **Guitar:** Electric guitar silhouette (signal source)

---

## TECHNICAL ANNOTATIONS & METRICS

**Include these data points in appropriate locations:**

### **PipeWire Metrics (on PipeWire layer):**
- Quantum: 128 samples
- Sample Rate: 48000 Hz
- Graph Latency: 2.67 ms
- Active Nodes: 12
- Active Links: 24
- XRuns: 0 (last hour)

### **JUCE Engine Metrics (on JUCE layer, Audio Node):**
- Buffer Size: 128 samples
- Sample Rate: 48000 Hz
- CPU Load: 45% (avg across 2 RT cores on Cortex-A76)
- Plugin Count: 8 active
- NAM Inference Time: 0.32 ms (ARM64 Eigen)
- IR Convolution: 512 taps (1024 samples)
- Thread Priority: SCHED_FIFO 85
- Core Affinity: CPU 2-3 (isolated, Cortex-A76 @ 2.4GHz)

### **Service Layer Metrics (Management Node):**
- API Response Time: <5ms (p95)
- WebSocket Latency: <1ms (local)
- Inter-Node Latency: <0.5ms (Gigabit Ethernet direct)
- Database Connections: 8/10 pool
- Active Sessions: 3 users

### **System Resources (per node):**

**Audio Node (RPi 5):**
- RAM Usage: 3.2 GB / 8 GB
- CPU Usage: 15% (system cores 0-1), 45% (audio RT cores 2-3)
- Disk I/O: Minimal (preset loading only)

**Management Node (RPi 5):**
- RAM Usage: 1.8 GB / 8 GB
- CPU Usage: 8% (all 4 cores available for services)
- Disk I/O: SQLite + log writes

---

## DEPLOYMENT CONTEXT ANNOTATIONS

**Add these contextual labels:**

1. **Network Topology (small inset diagram, bottom-right corner):**
   - Show the TWO RPi 5 nodes connected via direct Gigabit Ethernet (10.0.0.0/24)
   - Management Node also connected to LAN/WiFi for web client access
   - Multiple client devices (laptop, tablet, phone) accessing Management Node
   - MIDI Pedalboard + LCD shown as physical device above both nodes
   - Guitar → Audio Interface → Audio Node USB (show signal path)

2. **Hardware Requirements Box:**
   ```
   Audio Node (RPi 5 #1):
   • Raspberry Pi 5 (8GB RAM)
   • Fedora Linux 39+ (aarch64) + kernel-rt
   • USB 3.0 Audio Interface (Edirol UA-1000, MOTU M4)
   • MicroSD 64GB+ (A2 rated)
   • USB-C 27W power supply
   • isolcpus=2,3 kernel param
   
   Management Node (RPi 5 #2):
   • Raspberry Pi 5 (8GB RAM)
   • Fedora Linux 39+ (aarch64) headless
   • MicroSD 32GB+
   • USB-C 27W power supply
   • WiFi/Ethernet for LAN access
   • I2C GPIO → LCD display
   
   MIDI Pedalboard:
   • 8-10 momentary footswitches + LEDs
   • 2x expression pedal jacks (TRS)
   • 20x4 I2C LCD (HD44780, centered)
   • USB MIDI output (class-compliant)
   • I2C cable to Management Node GPIO
   ```

3. **Software Dependencies Box:**
   ```
   Audio Node:
   • PipeWire 1.0+ (aarch64)
   • JUCE 8.0.0 (ARM64 build)
   • Python 3.14 + pybind11
   • LV2 plugins (lilv, aarch64)
   • ALSA libraries
   • Eigen (ARM NEON optimized)
   
   Management Node:
   • Python 3.14 + FastAPI + Uvicorn
   • React 18 + Vite (pre-built static)
   • SQLite + aiosqlite
   • smbus2 (I2C LCD driver)
   
   Optional:
   • Neural Amp Modeler (.nam files)
   • Impulse Responses (.wav)
   ```

4. **Key Features Callout:**
   - ✅ Dual-node Raspberry Pi 5 deployment
   - ✅ Real-time audio processing (<3ms latency)
   - ✅ Neural amp modeling (NAM) on ARM64
   - ✅ LV2 plugin hosting
   - ✅ A/B chain morphing via MIDI pedalboard
   - ✅ Physical LCD display on pedalboard
   - ✅ Professional metering (LUFS, spectrum)
   - ✅ MIDI footswitch + expression control
   - ✅ Web UI accessible from any device on LAN
   - ✅ Separated audio RT and management workloads

---

## DIAGRAM TITLE & METADATA

**Main Title (top-center, large — above the pedalboard):**
```
MAP2 AUDIO PLATFORM
Dual Raspberry Pi 5 • Professional Real-Time Audio Processing System
Architectural Overview & Signal Flow Diagram
```

**Subtitle:**
```
JUCE Audio Engine on PipeWire on Fedora Linux (aarch64)
Audio Node + Management Node • MIDI Pedalboard with LCD
Version 2.0.0 • February 2026
```

**Footer (bottom-right, small):**
```
Hardware: 2x Raspberry Pi 5 (8GB) • USB Audio Interface • MIDI Pedalboard + 20x4 LCD
Stack: JUCE 8.0 • PipeWire 1.2 • Python 3.14 • FastAPI • React 18 • Fedora Linux aarch64
License: Proprietary • © 2026 MAP2 Audio Systems
```

---

## LEGEND & KEY

**Include a legend box (bottom-left corner):**

```
LEGEND
─────────────────────────────
━━━━━━► Audio Signal Flow (Real-time, GREEN)
━━━━━━► MIDI Signal Flow (Pedalboard, AMBER)
─ ─ ─ ► Management/Control Flow (Async, BLUE)
─ · ─ ► Inter-Node Communication (Ethernet, ORANGE)
▓▓▓▓▓▓  Real-Time Critical Path (Audio Node)
░░░░░░  Non-Real-Time Services (Management Node)
[CPU 2] Isolated CPU Core (RT dedicated, Cortex-A76)
[CPU 0] System CPU Core (general use, Cortex-A76)
[RPi 5] Raspberry Pi 5 Single-Board Computer
  ●     Active/Running Component
  ○     Inactive/Optional Component
  ▲     Warning/Attention Required
  ✓     Health Check Passed
  ■     Footswitch (LED on)
  □     Footswitch (LED off)
```

---

## STYLE REFERENCES & INSPIRATION

**Visual Style:** Modern cloud architecture diagram meets audio engineering schematic

**Reference Styles:**
- AWS Architecture Diagrams (clean, professional)
- Ableton Live signal flow documentation (audio-focused clarity)
- JUCE framework documentation diagrams (technical accuracy)
- Microsoft Azure infrastructure diagrams (layered approach)

**Avoid:**
- Overly simplistic block diagrams
- Cluttered, unreadable spaghetti diagrams
- Cartoon/informal styling
- Low-resolution raster graphics

**Prefer:**
- Clean vector graphics aesthetic
- Clear hierarchical layering
- Generous whitespace
- Readable at multiple zoom levels
- Print-quality output

---

## ADDITIONAL TECHNICAL DETAILS TO VISUALIZE

### **PipeWire Graph Example (mini-diagram within Audio Node PipeWire layer):**
```
[Edirol UA-1000]─┬─>[map2_engine:input_1]     (Audio Node RPi 5)
 (hw:UA1000)     ├─>[map2_engine:input_2]
                 └─>[loopback:capture]

[map2_engine]────┬─>[PipeWire:monitor_L]
 (JUCE client)   └─>[PipeWire:monitor_R]
```

### **JUCE Plugin Chain Example (within Audio Node JUCE layer):**
```
Input → Noise Gate → NAM (5150 model) → IR (Mesa 4x12) → 
        Tube Screamer → Parametric EQ → Compressor → 
        Delay → Reverb → Output
```

### **Inter-Node Communication Example (between nodes):**
```
Audio Node (10.0.0.1:8081)              Management Node (10.0.0.2:8080)
┌─────────────────────────┐   Ethernet   ┌─────────────────────────┐
│ JUCE Engine Service     │◄────────────►│ Service Orchestrator    │
│ Metering Broadcast      │─────ws──────►│ → relay to web clients  │
│ MIDI Service            │─────ws──────►│ → relay to LCD driver   │
│ PipeWire Service        │◄───REST─────│ → proxy from web UI     │
└─────────────────────────┘              └─────────────────────────┘
```

### **MIDI Pedalboard Flow Example (from top to both nodes):**
```
Guitarist stomps [SW1 - Preset 1]
    │ USB MIDI CC#0 val=1
    ↓
Audio Node MIDI Service → JUCE Engine loads "5150 Clean" preset
    │ Status update (Ethernet)
    ↓
Management Node → Chain Service logs → LCD Controller updates LCD
    │ I2C bus (GPIO pins 3,5)
    ↓
LCD Display: "5150 Clean" on Line 2
```

### **API Endpoint Examples (on Management Node Services layer):**
```
External REST Endpoints (Management Node :8080):
• POST /api/engine/initialize    → proxied to Audio Node
• GET  /api/plugins/lv2/list     → proxied to Audio Node
• PUT  /api/chains/active/parameter/gain → proxied to Audio Node
• POST /api/nam/load_model       → proxied to Audio Node
• GET  /api/system/health        → aggregates both nodes

WebSocket Streams (Management Node → Client):
• ws://management-node:8080/ws/metering
  → { "spectrum": [...], "lufs": -14.2, "cpu": 45 }
  (relayed from Audio Node metering broadcast)
```

---

## OUTPUT FORMAT REQUIREMENTS

**IMPORTANT: Generate TWO versions of this diagram**

### **Version 1: High-Resolution Print/Documentation Version**

**Primary deliverables:**
1. **SVG (scalable vector)** - preferred format
   - Infinite scalability
   - Editable text and shapes
   - Small file size
   
2. **PNG at 300 DPI**
   - Minimum resolution: **6000x4000px** (ultra high-res)
   - Color depth: 24-bit RGB
   - No compression artifacts
   
3. **PDF (vector, embedded fonts)**
   - Print-ready format
   - All fonts embedded/converted to paths
   - CMYK color space option

**Specifications:**
- Designed for A2/A1 poster printing (23x17" or larger)
- All text legible when printed at full size
- Extremely high detail level
- Suitable for trade shows, technical presentations, wall mounting
- Professional documentation quality

---

### **Version 2: Web-Optimized Version**

**Primary deliverable:**
1. **PNG at 150 DPI**
   - Resolution: **2400x1600px** (web-friendly but sharp)
   - Optimized compression (80-85% quality)
   - File size target: <500KB (compressed)
   
2. **WebP format** (optional, modern alternative)
   - Better compression than PNG
   - File size target: <300KB
   
3. **SVG (optimized)** - if file size permits
   - Minified/compressed
   - File size target: <800KB

**Specifications:**
- Optimized for web display at 1920x1080 and 2560x1440 resolutions
- Crisp rendering on Retina/HiDPI displays
- Fast loading time
- All text clearly readable at 100% zoom on standard monitors
- Responsive: looks good scaled down to 1280x720
- Suitable for embedding in web documentation, GitHub README, blog posts

---

### **Common Requirements (Both Versions):**
- All text is legible at intended viewing size
- Color scheme works in both light and dark contexts
- High-resolution version printable on A2/A1 paper
- Web version displays perfectly on modern browsers (Chrome, Firefox, Safari, Edge)
- Accessible color contra **BOTH VERSIONS**:

### **Content & Accuracy (Both Versions):**
- [ ] Two Raspberry Pi 5 nodes clearly shown SIDE BY SIDE
- [ ] MIDI Pedalboard with centered LCD spans ABOVE both nodes
- [ ] Audio Node contains Layers 0-2 + Layer 3a (audio services)
- [ ] Management Node contains Layer 0 + Layers 3b-4 (mgmt services + UI)
- [ ] JUCE Engine is visually prominent (center of Audio Node)
- [ ] Audio signal flow uses thick GREEN arrows (Audio Node only)
- [ ] MIDI signal flow uses thick AMBER arrows (pedalboard → nodes)
- [ ] Management flow uses thin BLUE arrows (crosses between nodes)
- [ ] Inter-node Ethernet shown as ORANGE dashed connection
- [ ] LCD display clearly visible in center of pedalboard
- [ ] Footswitches and expression pedals shown on pedalboard
- [ ] Cable connections (USB MIDI, I2C, Ethernet) clearly labeled
- [ ] All major components from codebase represented
- [ ] Metrics and annotations included per-node
- [ ] Legend and key provided
- [ ] Color palette consistent throughout
- [ ] Typography hierarchy clear
- [ ] Technical accuracy verified (ARM64/Cortex-A76 specs)
- [ ] Professional appearance suitable for documentation
- [ ] No visual clutter or overlapping elements

### **High-Resolution Print Version Specific:**
- [ ] Resolution: 6000x4000px minimum (300 DPI)
- [ ] All text legible when printed at A2/A1 size
- [ ] No pixelation or artifacts at 100% zoom
- [ ] Print-ready PDF with embedded fonts
- [ ] Suitable for poster printing and wall display
- [ ] File formats: SVG + PNG + PDF

### **Web-Optimized Version Specific:**
- [ ] Resolution: 2400x1600px (150 DPI, Retina-ready)
- [ ] File size: PNG <500KB, WebP <300KB
- [ ] All text clearly readable on 1920x1080 displays
- [ ] Looks sharp on 2560x1440 and 4K displays
- [ ] Fast loading time in web browsers
- [ ] Scales down gracefully to 1280x720
- [ ] File formats: PNG (optimized) + WebP + SVG (if <800KB)
- [ ] Legend and key provided
- [ ] Color palette consistent throughout
- [ ] Typography hierarchy clear
- [ ] Technical accuracy verified
- [ ] Professional appearance suitable for documentation
- [ ] High resolution (3000x2000px minimum)
- [ ] All text legible and properly aligned
- [ ] No visual clutter or overlapping elements

---

## SAMPLE ALTERNATIVE VIEWS TO GENERATE

Consider also generating these complementary diagrams:

1. **Audio Signal Flow Detail** (zoomed into Audio Node JUCE processing chain only)
2. **MIDI Pedalboard Wiring Diagram** (physical connections: USB MIDI, I2C, expression jacks)
3. **Inter-Node Communication Diagram** (focusing on REST/WebSocket between RPi 5 nodes)
4. **Physical Deployment Photo-Style** (two RPi 5 boards, pedalboard, audio interface, cables)
5. **LCD Display States** (showing all 4 lines across different modes: playing, tuner, menu)

---

**END OF PROMPT**

---

## NOTES FOR THE DIAGRAM CREATOR

This prompt is designed to be comprehensive and specific. The MAP2 Audio Platform is deployed across **two Raspberry Pi 5 single-board computers** with a **physical MIDI pedalboard** as the primary user interface for live performance. The diagram must accurately represent:

- **Dual-node architecture** — Audio processing and management on separate RPi 5 boards
- **MIDI Pedalboard with centered LCD** — physical floor controller spanning above both nodes
- **Real-time audio processing** through JUCE framework on isolated ARM Cortex-A76 cores
- **PipeWire integration** for modern Linux audio routing (Audio Node only)
- **Professional-grade features** like NAM amp modeling and IR convolution (ARM64/NEON)
- **Separated concerns** — RT audio workload isolated from management/UI services
- **Inter-node Gigabit Ethernet** — low-latency communication between nodes
- **I2C LCD display** driven from Management Node GPIO to pedalboard center mount
- **USB MIDI** from pedalboard to Audio Node for real-time control

The final diagram should serve as both a technical reference for developers and a comprehensible overview for audio engineers and system administrators. The visual emphasis should be: **pedalboard on top → two RPi 5 nodes side-by-side below → cables connecting them.**
