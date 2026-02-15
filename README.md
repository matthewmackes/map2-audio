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
**544** Python | **602** TypeScript | **114** C++/H | **78** Docs | **146** total commits | **0** stars | **0** forks | **0** open issues
<!-- PROJECT-STATS:END -->

---

## Recent Documentation

<!-- RECENT-DOCS:START -->
| Document | Last Updated |
|:---------|:------------|
| [AVB / 802.1AS vs Non-AVB Signal Flow Comparison](https://github.com/matthewmackes/map2-audio/blob/master/docs/AVB_SIGNAL_FLOW_COMPARISON.md) | 2026-02-14 |
| [AVDECC Future Implementation Guide](https://github.com/matthewmackes/map2-audio/blob/master/docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md) | 2026-02-14 |
| [Gemini Image Generation Prompts for MAP2 Architecture Diagrams](https://github.com/matthewmackes/map2-audio/blob/master/docs/GEMINI_IMAGE_GENERATION_PROMPTS.md) | 2026-02-14 |
| [MAP2 System: A Study of AVB / 802.1AS Capabilities and Use Cases - 2026-02-14](https://github.com/matthewmackes/map2-audio/blob/master/docs/MAP2_AVB_Capabilities_and_Usecases_2026-02-14.md) | 2026-02-14 |
| [MAP2 System: A Study of Chains, Flows, and All-In-One Mode - 2026-02-14](https://github.com/matthewmackes/map2-audio/blob/master/docs/MAP2_Chains_Flows_and_All-In-One_Mode_2026-02-14.md) | 2026-02-14 |
| [MAP2 Audio Platform: An Educational Overview - 2026-02-14](https://github.com/matthewmackes/map2-audio/blob/master/docs/MAP2_Educational_Overview_2026-02-14.md) | 2026-02-14 |
<!-- RECENT-DOCS:END -->

<p align="right"><a href="https://github.com/matthewmackes/map2-audio/tree/master/docs">Browse all docs &rarr;</a></p>

---

## Gallery

<!-- GALLERY:START -->
|  |  |  |
| :---: | :---: | :---: |
| <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/map2-banner.png" width="280" alt="map2 banner"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/MACKESAUDIOPLATFORM.png" width="280" alt="MACKESAUDIOPLATFORM"> |  |
<!-- GALLERY:END -->

<p align="right"><em>Add screenshots to <code>docs/images/</code> and they appear here automatically.</em></p>

---

## Recent Activity

<!-- RECENT-ACTIVITY:START -->
| Commit | Message | Author | Date |
|:-------|:--------|:-------|:-----|
| [`242e137`](https://github.com/matthewmackes/map2-audio/commit/242e137e412317b61c027cc1bdf817b915e447f9) | docs: add platform logo to docs/images and reddit posts | Map2 Audio | 2026-02-14 |
| [`c4c007a`](https://github.com/matthewmackes/map2-audio/commit/c4c007a565b924104fa79deb8503ea459f15e75b) | chore: auto-update README with latest docs & activity | matthewmackes | 2026-02-15 |
| [`4afd855`](https://github.com/matthewmackes/map2-audio/commit/4afd8555410d592ee55eed9a9c7929a31c7d615c) | docs: add educational overviews, AVB docs, blog images, a... | Map2 Audio | 2026-02-14 |
| [`5c3fdcb`](https://github.com/matthewmackes/map2-audio/commit/5c3fdcb51edcbb095f2bc457e18f84a4ba9f9d8e) | docs: replace license section with legal disclaimer refer... | Map2 Audio | 2026-02-14 |
| [`0c49d3a`](https://github.com/matthewmackes/map2-audio/commit/0c49d3a14de4aad57625f835926dd8a64fdf0b3d) | chore: auto-update README with latest docs & activity | matthewmackes | 2026-02-14 |
| [`d09a848`](https://github.com/matthewmackes/map2-audio/commit/d09a84818d8d35ebf3c762d43bdf83de5473af3b) | feat: add auto-updating README showcase with GitHub Actions | Map2 Audio | 2026-02-14 |
| [`7e8d404`](https://github.com/matthewmackes/map2-audio/commit/7e8d404f4881aec108fb22773ad361fb500e92e2) | fix(avb): fail fast when engine stream lifecycle hooks ar... | Map2 Audio | 2026-02-14 |
| [`1399772`](https://github.com/matthewmackes/map2-audio/commit/139977278ac2278095673bcfb24d46a37d458332) | feat(flow): replenish minimum standby assignment after fa... | Map2 Audio | 2026-02-14 |
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

## Legal Disclaimer

This project is a **strictly non-commercial, educational, open-source resource** created exclusively for learning, teaching, training, academic study, experimentation, demonstration, and personal research purposes. It is not affiliated with, endorsed by, or connected to any commercial manufacturer or brand owner in the professional audio industry. All trademarks and product names are the property of their respective owners and are referenced solely for educational and descriptive purposes.

See the full [Legal Disclaimer](docs/%23%20LEGAL%20DISCLAIMER%20%E2%80%93%20IMPORTANT%20NOTICE.md) for complete details.

---

<p align="center">
  <strong>MAP2 Modular Audio Platform</strong><br>
  <sub>Professional real-time audio processing for Linux</sub>
</p>
