<p align="center">
  <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/map2-banner.png" alt="MAP2 Modular Audio Platform" width="700">
</p>

<h3 align="center">Professional Real-Time Modular Audio Processing</h3>

<p align="center">
  Sub-3ms round-trip latency &bull; Neural Amp Modeling &bull; Multi-node clustering &bull; Full plugin chain
</p>

<p align="center">
  <a href="https://github.com/matthewmackes/map2-audio/actions"><img src="https://img.shields.io/github/actions/workflow/status/matthewmackes/map2-audio/ci-cd.yml?branch=master&label=CI&style=flat-square" alt="CI"></a>
  <a href="https://github.com/matthewmackes/map2-audio/stargazers"><img src="https://img.shields.io/github/stars/matthewmackes/map2-audio?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/matthewmackes/map2-audio/network/members"><img src="https://img.shields.io/github/forks/matthewmackes/map2-audio?style=flat-square" alt="Forks"></a>
  <a href="https://github.com/matthewmackes/map2-audio/issues"><img src="https://img.shields.io/github/issues/matthewmackes/map2-audio?style=flat-square" alt="Issues"></a>
  <img src="https://img.shields.io/github/languages/count/matthewmackes/map2-audio?style=flat-square" alt="Languages">
  <img src="https://img.shields.io/github/repo-size/matthewmackes/map2-audio?style=flat-square" alt="Repo Size">
</p>

---

## What is MAP2?

**MAP2** (Mackes Audio Platform 2) is an enterprise-grade, real-time audio processing system that transforms commodity Linux hardware into a professional-grade guitar/audio processor. It combines a **C++ JUCE audio engine**, **Python FastAPI backend**, and **React web dashboard** into a unified platform.

### Operating Modes

| Mode | Latency | Description |
|:-----|:--------|:------------|
| **Audio** | <3ms round-trip | Dedicated processing on isolated CPU cores. No web UI. |
| **All-in-One** | 4-5ms | Audio processing + web dashboard + management. |
| **Management** | N/A | Control-only node for cluster administration. |

### Signal Chain

```
Input -> NAM (Neural Amp) -> Modulation (11 types) -> Cabinet IR -> EQ ->
Gate -> Compressor -> Limiter -> Reverb IR -> Output
```

All processing runs on isolated CPU cores with `SCHED_FIFO` real-time priority, PipeWire/JACK audio transport, and configurable buffer sizes down to 128 samples at 48kHz.

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| Audio Engine | C++ / JUCE 8.0.0, Neural Amp Modeler |
| Backend API | Python / FastAPI, SQLite, Uvicorn |
| Web Dashboard | React 19, Material UI 7, Vite |
| TUI Console | Python / Textual (SSH-friendly) |
| Audio Server | PipeWire via JACK protocol |
| OS / RT | Fedora Linux, isolated CPU cores, SCHED_FIFO |
| Clustering | Multi-node with AVB/802.1AS support (optional) |
| Hardware | USB audio interfaces (Edirol UA-1000, Hotone Jogg) |

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Full installation on Fedora Server 42+
sudo bash install_on_new_host.sh

# Or start individual components
systemctl start map2-backend          # Backend API (port 8080)
./scripts/start_web.sh                # Web dashboard (port 3000)
python -m tui.node_console            # TUI management console
```

<details>
<summary><strong>Build from source (C++ engine)</strong></summary>

```bash
cd juce-engine
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

Requires: CMake 3.22+, GCC 12+ or Clang 15+, JUCE dependencies (ALSA, freetype, etc.)

</details>

---

## Project Stats

<!-- PROJECT-STATS:START -->
**544** Python | **602** TypeScript | **114** C++/H | **74** Docs | **141** total commits | **0** stars | **0** forks | **0** open issues
<!-- PROJECT-STATS:END -->

---

## Recent Documentation

<!-- RECENT-DOCS:START -->
| Document | Last Updated |
|:---------|:------------|
| [AVB / 802.1AS vs Non-AVB Signal Flow Comparison](https://github.com/matthewmackes/map2-audio/blob/master/docs/AVB_SIGNAL_FLOW_COMPARISON.md) | 2026-02-14 |
| [AVDECC Future Implementation Guide](https://github.com/matthewmackes/map2-audio/blob/master/docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md) | 2026-02-14 |
| [Gemini Image Generation Prompts for MAP2 Architecture Diagrams](https://github.com/matthewmackes/map2-audio/blob/master/docs/GEMINI_IMAGE_GENERATION_PROMPTS.md) | 2026-02-14 |
| [MAP2 Audio Platform - Node Types & Deployment Architectures](https://github.com/matthewmackes/map2-audio/blob/master/docs/NODE_TYPES_AND_DEPLOYMENT_ARCHITECTURES.md) | 2026-02-14 |
| [Suggested Improvements](https://github.com/matthewmackes/map2-audio/blob/master/docs/SUGGESTED_IMPROVEMENTS.md) | 2026-02-14 |
| [Web Server Port Configuration](https://github.com/matthewmackes/map2-audio/blob/master/docs/WEB_SERVER_PORTS.md) | 2026-02-14 |
<!-- RECENT-DOCS:END -->

<p align="right"><a href="https://github.com/matthewmackes/map2-audio/tree/master/docs">Browse all docs &rarr;</a></p>

---

## Gallery

<!-- GALLERY:START -->
|  |  |  |
| :---: | :---: | :---: |
| <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/map2-banner.png" width="280" alt="map2 banner"> |  |  |
<!-- GALLERY:END -->

<p align="right"><em>Add screenshots to <code>docs/images/</code> and they appear here automatically.</em></p>

---

## Recent Activity

<!-- RECENT-ACTIVITY:START -->
| Commit | Message | Author | Date |
|:-------|:--------|:-------|:-----|
| [`d09a848`](https://github.com/matthewmackes/map2-audio/commit/d09a84818d8d35ebf3c762d43bdf83de5473af3b) | feat: add auto-updating README showcase with GitHub Actions | Map2 Audio | 2026-02-14 |
| [`7e8d404`](https://github.com/matthewmackes/map2-audio/commit/7e8d404f4881aec108fb22773ad361fb500e92e2) | fix(avb): fail fast when engine stream lifecycle hooks ar... | Map2 Audio | 2026-02-14 |
| [`1399772`](https://github.com/matthewmackes/map2-audio/commit/139977278ac2278095673bcfb24d46a37d458332) | feat(flow): replenish minimum standby assignment after fa... | Map2 Audio | 2026-02-14 |
| [`2c4a0cd`](https://github.com/matthewmackes/map2-audio/commit/2c4a0cd7833381552101630d6efd09913255d526) | fix(flow): commit failover promotion only after activatio... | Map2 Audio | 2026-02-14 |
| [`60e7be3`](https://github.com/matthewmackes/map2-audio/commit/60e7be33f107f79001166aab77965c106c79a025) | feat(flow): enforce deploy semantics and report standby d... | Map2 Audio | 2026-02-14 |
| [`1896fdc`](https://github.com/matthewmackes/map2-audio/commit/1896fdcfc22637e40a90d390c9370935766a105c) | feat(avb): add engine-backed stream stats hooks and reset... | Map2 Audio | 2026-02-14 |
| [`8ff95c3`](https://github.com/matthewmackes/map2-audio/commit/8ff95c3a5333ccc0d2d7c4f1aec241b471e657a1) | fix(avb): validate stream config and return 400 on bad input | Map2 Audio | 2026-02-14 |
| [`a20857e`](https://github.com/matthewmackes/map2-audio/commit/a20857e4f3deed30791b7b7aa289fbc0186ab355) | test(avb): cover router factory wiring and refresh flow o... | Map2 Audio | 2026-02-14 |
<!-- RECENT-ACTIVITY:END -->

---

## Built With

<!-- CREDITS:START -->
| Project | Role |
|:--------|:-----|
| [JUCE](https://juce.com/) | C++ audio framework |
| [PipeWire](https://pipewire.org/) | Linux multimedia server |
| [JACK](https://jackaudio.org/) | Audio connection kit |
| [FastAPI](https://fastapi.tiangolo.com/) | Python web framework |
| [React](https://react.dev/) | UI library |
| [Material UI](https://mui.com/) | React component library |
| [Neural Amp Modeler](https://github.com/sdatkinson/NeuralAmpModelerPlugin) | ML amp modeling |
| [Textual](https://textual.textualize.io/) | Python TUI framework |

...and **16** more open-source packages from PyPI and npm.
<!-- CREDITS:END -->

---

## Contributing

MAP2 is an ambitious project at the intersection of real-time audio, embedded systems, and modern web technologies. Contributions are welcome in any area:

- **Audio/DSP** - Plugin development, latency optimization, new effects
- **Backend** - API endpoints, service orchestration, cluster management
- **Frontend** - React dashboard, pedalboard editor, real-time meters
- **Infrastructure** - Packaging, deployment, CI/CD, documentation

```bash
# Development setup
pip install -r requirements.txt       # Python backend
npm install                           # Web frontend
cd juce-engine && cmake -B build      # C++ engine
```

---

## License

This project is proprietary software. See the repository for license details.

---

<p align="center">
  <strong>MAP2 Modular Audio Platform</strong><br>
  <sub>Professional real-time audio processing for Linux</sub>
</p>
