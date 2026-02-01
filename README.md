# Mackes Audio Platform 2 FEB2025

**Professional Real-Time Audio Processing System** (v2.0.0-FEB2025)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Matthew%20Mackes-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/matthewmackes/)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-green.svg)](https://python.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg)](https://fastapi.tiangolo.com)

**Created by [Matthew Mackes](https://www.linkedin.com/in/matthewmackes/)**

Mackes Audio Platform 2 is an enterprise-grade, real-time audio processing system designed for guitarists and audio professionals. It combines powerful LV2 plugin hosting, AI-powered amp modeling, and professional impulse response processing with a modern dual-interface architecture.

---

## Screenshots

### System Overview & Dashboard
![Overview Dashboard](Screenshot%202026-01-28%20at%2014-01-47%20MAP2%20Audio%20Platform.png)
*Complete system dashboard with status monitoring, platform capabilities, CPU core management, and audio interface controls*

### Chain Management
![Chains](Screenshot%202026-01-28%20at%2014-02-06%20MAP2%20Audio%20Platform.png)
*Manage multiple effect chains with real-time status indicators and quick actions*

### Visual Chain Flow Editor
![Chain Flow](Screenshot%202026-01-28%20at%2014-02-24%20MAP2%20Audio%20Platform.png)
*Node-based visual signal routing with A/B comparison, native plugins, and real-time spectrum analyzer*

### LV2 Plugin Pack Manager
![LV2 Plugins](Screenshot%202026-01-28%20at%2014-02-50%20MAP2%20Audio%20Platform.png)
*Browse and install LV2 plugin packs with one-click installation*

### VST3 Plugin Manager
![VST3 Plugins](Screenshot%202026-01-28%20at%2014-03-11%20MAP2%20Audio%20Platform.png)
*Access free VST3 plugin packages from the community*

### Library Manager (IRs & NAM Models)
![Library Manager](Screenshot%202026-01-28%20at%2014-03-24%20MAP2%20Audio%20Platform.png)
*Download and manage impulse responses, cabinet IRs, and Neural Amp Models from multiple sources*

### About & Project Partners
![About](Screenshot%202026-01-28%20at%2014-03-38%20MAP2%20Audio%20Platform.png)
*JUCE Audio Engine integration, project partners, and system architecture overview*

---

## Vision & Goals

### Mission Statement

To provide musicians and audio engineers with a **professional-grade, accessible, and extensible** audio processing platform that rivals commercial solutions while remaining open and community-driven.

### Core Goals

| Goal | Description |
|------|-------------|
| **Professional Audio Quality** | Glitch-free, low-latency real-time processing with industry-standard LV2 plugins |
| **Accessibility** | Multiple interfaces (Web UI, Terminal UI, LCD Display) for any environment |
| **AI-Powered Innovation** | Neural Amp Modeling (NAM) for authentic amp and pedal emulation |
| **Reliability** | Enterprise-grade stability with circuit breakers, health monitoring, and graceful degradation |
| **Extensibility** | Open plugin architecture supporting LV2, VST3, and custom native plugins |
| **Community-Driven** | Integration with open-source IR libraries and community NAM models |

---

## Platform Capabilities

### Audio Processing Engine

**Primary Engine: JUCE C++ Audio Framework** ✅

- **JUCE Audio I/O** - Professional cross-platform audio with ALSA/JACK support
- **Real-Time Safe** - Compiled C++ for deterministic low-latency processing (~12ms total)
- **LV2 Plugin Host** - Full support for the industry-standard Linux audio plugin format
- **VST3 Support** - Native VST3 plugin hosting
- **Automatic PDC** - Plugin delay compensation handled by JUCE AudioProcessorGraph
- **Effect Chains** - Visual node-based signal flow with unlimited routing flexibility
- **MIDI Routing** - Complete keyboard and controller input mapping with MIDI learn
- **Hotone Jogg Integration** - Optimized for Hotone Jogg USB Audio Interface

> **Note:** The system includes a Python audio I/O module (`audio_io_v2.py`) which is **DEPRECATED** and should not be used for production. Always use the JUCE C++ engine for live performance.

### AI-Powered Features

- **Neural Amp Modeler (NAM)** - AI-trained amplifier and pedal models that capture the exact character of real gear
- **Community Model Library** - Access to thousands of community-created NAM models via GitHub integration
- **Real-Time Inference** - Optimized neural network processing (⚠️ Python NAM is deprecated, use JUCE C++ implementation)

### Impulse Response Processing

- **846+ Professional IRs** - Curated collection from academic research institutions worldwide
- **Cabinet Simulation** - Speaker cabinet impulse responses for authentic amp-in-room sound
- **Room Reverb** - Convolution reverb using real acoustic space recordings
- **Stretch & Trim Controls** - Real-time IR manipulation for creative sound design

### Professional Metering & Analysis

- **Spectrum Analyzer** - Real-time frequency visualization
- **LUFS Metering** - Broadcast-standard loudness measurement
- **Phase Correlation** - Stereo imaging analysis
- **VU Meters** - Classic analog-style level monitoring

### Session & Preset Management

- **Effect Chain Presets** - Save and recall complete signal chains
- **Plugin Presets** - Per-plugin preset storage with favorites and tags
- **Snapshot System** - Capture and restore chain states instantly
- **A/B Comparison** - Dual-chain mode for real-time preset comparison
- **Backup & Restore** - 7z-compressed session archives

---

## Triple-Interface Architecture

MAP2 provides three distinct interfaces to fit any workflow:

### Web Interface (React 19 + Vite)

Modern, responsive browser-based interface featuring:
- Visual node-graph effect chain editor
- Real-time parameter controls with MIDI learn
- Plugin browser with search and categories
- Mobile-responsive design for tablet control
- Dark theme optimized for stage use

### Terminal UI (Textual/Python)

Full-featured terminal interface with 30 specialized modules:
- **Command Palette** - Fuzzy search for instant navigation
- **10 Professional Themes** - From VSCode Dark to Solarized
- **6 Layout Modes** - Adapt to any terminal size
- **Virtual Scrolling** - Handle 10,000+ items with 90% memory reduction
- **Undo/Redo** - 100-action history for safe experimentation

### LCD Display System

Dual hardware LCD monitoring for dedicated audio hardware:
- Real-time chain status display
- Input/output level meters
- Current preset and plugin information
- I2C integration for embedded systems

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MAP2 Audio Platform                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Frontend Layer                                             │
│  ├─ Web UI (React 19 + Vite) ─────── Port 3000             │
│  ├─ TUI (Textual/Python) ─────────── Terminal              │
│  └─ LCD Display ──────────────────── I2C Hardware          │
│                                                             │
│  API Layer (FastAPI + Uvicorn)                             │
│  ├─ 50+ REST Endpoints ───────────── Port 8080             │
│  ├─ WebSocket Streaming ──────────── Real-time updates     │
│  └─ OpenAPI Documentation ────────── /docs                 │
│                                                             │
│  Backend Services (20+ Specialized Services)               │
│  ├─ Audio Engine ─────────────────── JACK/ALSA I/O         │
│  ├─ Plugin Manager ───────────────── LV2/VST3 hosting      │
│  ├─ Chain Service ────────────────── Signal routing        │
│  ├─ MIDI Engine ──────────────────── Controller mapping    │
│  ├─ Metrics Daemon ───────────────── Non-blocking stats    │
│  ├─ Circuit Breaker ──────────────── Failure prevention    │
│  └─ Health Monitor ───────────────── System diagnostics    │
│                                                             │
│  Audio Engine (JUCE C++ with Python Bindings)              │
│  ├─ LV2 Plugin Host                                        │
│  ├─ Convolution Processor                                  │
│  ├─ Spectrum Analyzer                                      │
│  └─ Real-time Parameter Bridge                             │
│                                                             │
│  Database (SQLite WAL Mode)                                │
│  └─ Presets, Sessions, MIDI Maps, Analytics                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+ (for web UI)
- JACK or ALSA audio system
- LV2 plugins (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Install Python dependencies
pip install -e .

# Install web UI dependencies
cd web && npm install && cd ..

# Start the backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# In another terminal, start the web UI
cd web && npm run dev
```

### Access Points

| Interface | URL/Command |
|-----------|-------------|
| Web Dashboard | http://localhost:3000 |
| API Documentation | http://localhost:8080/docs |
| Terminal UI | `map2-tui` |
| Prometheus Metrics | http://localhost:9090 |

---

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Audio Latency | <10ms | With JACK at 256 samples |
| Startup Time | <500ms | Backend initialization |
| CPU @ Idle | <1% | Optimized metrics daemon |
| Audio Glitches | 0/hour | Non-blocking architecture |
| TUI Responsiveness | 60 FPS | Debounced rendering |
| Virtual Scroll Capacity | 10,000+ items | 90% memory reduction |
| Uptime Target | 99.9% | Circuit breaker protection |

---

## Room Impulse Response Collection

MAP2 includes an integrated professional IR collection with 846+ impulse responses:

```bash
# Quick install (30 seconds)
bash install-rir-collection.sh
```

### Included Datasets

| Dataset | Source | IRs | Description |
|---------|--------|-----|-------------|
| OpenAIR | University of York | 46+ | Concert halls, churches, studios |
| BUT Reverb | Brno University | 1,300+ | Comprehensive room database |
| MIT IR Survey | MIT Media Lab | 271 | Real-world locations |
| REVERB Challenge | Microsoft Research | Various | Professional studio spaces |
| Aachen Database | RWTH Aachen | Various | Academic reference spaces |

---

## Contributing Projects & Acknowledgments

MAP2 Audio Platform builds upon the work of many open-source projects and academic institutions. We gratefully acknowledge these contributions:

### Foundation Project

#### PiPedal
**Author:** Robin Davies
**Repository:** [github.com/rerdavies/pipedal](https://github.com/rerdavies/pipedal)

MAP2 is built upon the excellent PiPedal foundation, extending it with additional interfaces, AI-powered features, and enterprise-grade reliability patterns.

---

### Audio Processing Libraries

#### Neural Amp Modeler (NAM)
**Repository:** [github.com/sdatkinson/neural-amp-modeler](https://github.com/sdatkinson/neural-amp-modeler)

AI-powered amplifier and effects modeling using neural networks trained on real hardware.

#### NAM Community Models
**Repository:** [github.com/pelennor2170/NAM_models](https://github.com/pelennor2170/NAM_models)

Community-contributed neural amp models integrated via our GitHub scraper.

#### JUCE Framework
**Website:** [juce.com](https://juce.com)

Cross-platform C++ framework powering our audio engine core.

---

### Impulse Response Datasets

#### Room Impulse Response Collection
**Curator:** [Graphi07/room-impulse-responses](https://github.com/Graphi07/room-impulse-responses)

Aggregated collection of academic IR datasets used in our reverb system.

| Institution | Dataset | Documentation |
|-------------|---------|---------------|
| University of York | OpenAIR | [openair.hosted.york.ac.uk](https://openair.hosted.york.ac.uk) |
| Brno University of Technology | BUT Reverb | [speech.fit.vutbr.cz](https://speech.fit.vutbr.cz) |
| MIT Media Lab | MIT IR Survey | [mcdermottlab.mit.edu](https://mcdermottlab.mit.edu) |
| Microsoft Research | REVERB Challenge | [reverb2014.dereverberation.com](http://reverb2014.dereverberation.com) |
| RWTH Aachen University | Aachen Database | [iks.rwth-aachen.de](https://www.iks.rwth-aachen.de) |

---

### Python Dependencies

| Package | Purpose | License |
|---------|---------|---------|
| [FastAPI](https://fastapi.tiangolo.com) | Async API framework | MIT |
| [Textual](https://textual.textualize.io) | Terminal UI framework | MIT |
| [PyTorch](https://pytorch.org) | Neural network inference | BSD |
| [SQLAlchemy](https://sqlalchemy.org) | Database ORM | MIT |
| [Uvicorn](https://uvicorn.org) | ASGI server | BSD |
| [python-rtmidi](https://spotlightkid.github.io/python-rtmidi/) | MIDI interface | MIT |
| [pylilv](https://github.com/moddevices/pylilv) | LV2 plugin loading | ISC |

---

### Frontend Dependencies

| Package | Purpose | License |
|---------|---------|---------|
| [React](https://react.dev) | UI framework | MIT |
| [Vite](https://vitejs.dev) | Build tool | MIT |
| [Material-UI](https://mui.com) | Component library | MIT |
| [React Flow](https://reactflow.dev) | Node graph editor | MIT |
| [Recharts](https://recharts.org) | Data visualization | MIT |
| [TanStack Query](https://tanstack.com/query) | Data fetching | MIT |

---

## Documentation Index

### Getting Started

| Document | Description |
|----------|-------------|
| [RIR-QUICK-START.md](RIR-QUICK-START.md) | 30-second Room Impulse Response setup |
| [docs/QUICK_INTEGRATION_3_STEPS.md](docs/QUICK_INTEGRATION_3_STEPS.md) | Three-step integration guide |
| [docs/TUI_QUICK_START.md](docs/TUI_QUICK_START.md) | Terminal UI quick start |

### Architecture & Design

| Document | Description |
|----------|-------------|
| [docs/MASTER_DOCUMENTATION.md](docs/MASTER_DOCUMENTATION.md) | Comprehensive system documentation |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | 12-week stability improvement roadmap |
| [docs/CODE_REVIEW_PRODUCTION_READINESS.md](docs/CODE_REVIEW_PRODUCTION_READINESS.md) | Production readiness assessment |

### Audio Interface

| Document | Description |
|----------|-------------|
| [docs/AUDIO_INTERFACE_FEATURE.md](docs/AUDIO_INTERFACE_FEATURE.md) | Audio interface feature overview |
| [docs/TECHNICAL_SPECIFICATIONS_AUDIO_INTERFACE.md](docs/TECHNICAL_SPECIFICATIONS_AUDIO_INTERFACE.md) | Technical specifications |
| [docs/AUDIO_INTERFACE_VISUAL_LAYOUT.md](docs/AUDIO_INTERFACE_VISUAL_LAYOUT.md) | Visual design documentation |

### Plugin System

| Document | Description |
|----------|-------------|
| [docs/PLUGIN_PRESET_SYSTEM.md](docs/PLUGIN_PRESET_SYSTEM.md) | Preset management architecture |
| [docs/NATIVE_PLUGINS_PLAN_SUMMARY.md](docs/NATIVE_PLUGINS_PLAN_SUMMARY.md) | Native plugin development guide |
| [docs/ADVANCED_PLUGIN_MANAGEMENT.md](docs/ADVANCED_PLUGIN_MANAGEMENT.md) | Advanced plugin management features |

### Terminal UI

| Document | Description |
|----------|-------------|
| [tui/START_HERE.md](tui/START_HERE.md) | TUI quick start guide |
| [tui/COMPLETE_PROJECT_SUMMARY.md](tui/COMPLETE_PROJECT_SUMMARY.md) | Comprehensive TUI reference (30 modules) |
| [tui/INTEGRATION_GUIDE.md](tui/INTEGRATION_GUIDE.md) | TUI integration documentation |
| [tui/DESIGN_REVIEW_10_IMPROVEMENTS.md](tui/DESIGN_REVIEW_10_IMPROVEMENTS.md) | TUI design improvements |

### LCD Display

| Document | Description |
|----------|-------------|
| [lcd/LCD_SYSTEM.md](lcd/LCD_SYSTEM.md) | LCD display system overview |
| [lcd/LCD_IMPLEMENTATION.md](lcd/LCD_IMPLEMENTATION.md) | Implementation details |
| [lcd/QUICKREF.md](lcd/QUICKREF.md) | LCD quick reference |

### A/B Mode & Dual Chain

| Document | Description |
|----------|-------------|
| [docs/DUAL_CHAIN_AB_IMPLEMENTATION.md](docs/DUAL_CHAIN_AB_IMPLEMENTATION.md) | Dual chain A/B mode implementation |
| [docs/AB_MODE_INTEGRATION_GUIDE.md](docs/AB_MODE_INTEGRATION_GUIDE.md) | A/B mode integration guide |
| [docs/NEURAL_DSP_INNOVATIONS.md](docs/NEURAL_DSP_INNOVATIONS.md) | Neural DSP integration innovations |

### Stability & Resilience

| Document | Description |
|----------|-------------|
| [docs/STABILITY_IMPROVEMENTS.md](docs/STABILITY_IMPROVEMENTS.md) | System stability patterns |
| [docs/CIRCUIT_BREAKER_INTEGRATION.md](docs/CIRCUIT_BREAKER_INTEGRATION.md) | Circuit breaker implementation |
| [docs/RESILIENCE_INDEX.md](docs/RESILIENCE_INDEX.md) | Resilience pattern index |

### Deployment

| Document | Description |
|----------|-------------|
| [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md) | Production deployment checklist |
| [tui/DEPLOYMENT_GUIDE.md](tui/DEPLOYMENT_GUIDE.md) | TUI deployment guide |
| [branding/README.md](branding/README.md) | Branding assets and boot splash |

### API Reference

| Document | Description |
|----------|-------------|
| [docs/API_ENDPOINTS_IMPLEMENTATION.md](docs/API_ENDPOINTS_IMPLEMENTATION.md) | API endpoint specification |
| [docs/COMMAND_REFERENCE.md](docs/COMMAND_REFERENCE.md) | CLI command reference |
| [tui/API_QUICKSTART.md](tui/API_QUICKSTART.md) | API quick start for TUI |

---

## License

MAP2 Audio Platform is released under the **MIT License**.

See [LICENSE](LICENSE) for details.

---

## Version

**Current Version:** 1.24.25.1
**Status:** Production Ready
**Quality Score:** 8.4/10

---

<p align="center">
  <strong>MAP2 Audio Platform</strong><br>
  Professional Real-Time Audio Processing<br>
  <br>
  <a href="https://www.linkedin.com/in/matthewmackes/">
    <img src="https://img.shields.io/badge/Created%20by-Matthew%20Mackes-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Matthew Mackes LinkedIn">
  </a>
  <br><br>
  <em>Built on PiPedal by Robin Davies</em>
</p>
