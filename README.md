> [!IMPORTANT]
> Most modern bands are already operating in a digital signal chain. Guitar modelers, digital mixers, drum triggers, MIDI controllers, in-ear systems-everything converts to digital almost immediately.
>
> Now extend that idea to its logical conclusion:
>
> Imagine a centralized digital audio backbone with sufficient I/O to handle the entire band simultaneously-microphones, line inputs, MIDI keyboards, drum triggers, amp modelers-everything. Every performer plugs into the same system. All routing, monitoring, processing, and recording happen inside a shared digital environment.
>
> No redundant interfaces. No repeated A/D and D/A conversions. No audio leaving and re-entering the digital domain.
>
> The signal path remains coherent, clocked, and lossless from input to archive. That's technically optimal.
>
> However, placing a full desktop DAW in every rehearsal room, studio, or performance space is expensive, fragile, and operationally heavy. A general-purpose PC introduces unnecessary overhead: OS maintenance, UI complexity, background processes, and failure points that have nothing to do with audio.
>
> This is where this system fits.
>
> It provides the core advantages of a unified digital environment-centralized I/O, shared routing, synchronized processing, direct capture-without the bulk and instability of a full computer-based DAW at every node.
>
> Think of it as a purpose-built digital audio infrastructure rather than a workstation. It's not "a DAW in every room." It's a shared, deterministic audio platform that the band plays into.
>
> Thank you - Matt

<p align="center">
  <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/disclaimer-banner.svg" alt="Educational Use Only — This project is intended solely for educational and research purposes. It is not production-ready software and is not a substitute for any commercial product." width="700">
</p>

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

<p align="center">
  <img src="docs/images/10000FOOT-MAP2.png" alt="MAP2 10,000-foot overview" width="900">
</p>

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
**544** Python | **604** TypeScript | **114** C++/H | **80** Docs | **165** total commits | **8** stars | **0** forks | **0** open issues
<!-- PROJECT-STATS:END -->

---

## Recent Documentation

<!-- RECENT-DOCS:START -->
| Document | Last Updated |
|:---------|:------------|
| [MAP2 Audio Platform - Top 100 Features](https://github.com/matthewmackes/map2-audio/blob/master/docs/MAP2_TOP_100_FEATURES.md) | 2026-02-15 |
| [reddit posts](https://github.com/matthewmackes/map2-audio/blob/master/docs/reddit_posts.md) | 2026-02-15 |
| [LEGAL DISCLAIMER – IMPORTANT NOTICE](https://github.com/matthewmackes/map2-audio/blob/master/docs/# LEGAL DISCLAIMER – IMPORTANT NOTICE.md) | 2026-02-14 |
| [MAP2 Audio Platform - Complete Audio Engine Fixes](https://github.com/matthewmackes/map2-audio/blob/master/docs/AUDIO_ENGINE_FIXES_SUMMARY.md) | 2026-02-14 |
| [AVB / 802.1AS vs Non-AVB Signal Flow Comparison](https://github.com/matthewmackes/map2-audio/blob/master/docs/AVB_SIGNAL_FLOW_COMPARISON.md) | 2026-02-14 |
| [AVDECC Future Implementation Guide](https://github.com/matthewmackes/map2-audio/blob/master/docs/AVDECC_FUTURE_IMPLEMENTATION_GUIDE.md) | 2026-02-14 |
<!-- RECENT-DOCS:END -->

<p align="right"><a href="https://github.com/matthewmackes/map2-audio/tree/master/docs">Browse all docs &rarr;</a></p>

---

## Gallery

<!-- GALLERY:START -->
|  |  |  |
| :---: | :---: | :---: |
| <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/map2-banner.png" width="280" alt="map2 banner"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/Screenshot-Cli.png" width="280" alt="Screenshot Cli"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/Screenshot 2026-02-15 at 07-58-14 Mackes Audio Platform 2 FEB2025.png" width="280" alt="Screenshot 2026 02 15 at 07 58 14 Mackes Audio Platform 2 FEB2025"> |
| <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/Screenshot 2026-02-15 at 08-00-43 Mackes Audio Platform 2 FEB2025.png" width="280" alt="Screenshot 2026 02 15 at 08 00 43 Mackes Audio Platform 2 FEB2025"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/Screenshot 2026-02-15 at 07-57-33 Mackes Audio Platform 2 FEB2025.png" width="280" alt="Screenshot 2026 02 15 at 07 57 33 Mackes Audio Platform 2 FEB2025"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/MAP2_AUDIO-NODE_ARCH_DIAGRAM3.png" width="280" alt="MAP2 AUDIO NODE ARCH DIAGRAM3"> |
| <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/MAP2_AUDIO-NODE_ARCH_DIAGRAM2-BANG.png" width="280" alt="MAP2 AUDIO NODE ARCH DIAGRAM2 BANG"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/MAP2_AUDIO-NODE_ARCH_DIAGRAM.png" width="280" alt="MAP2 AUDIO NODE ARCH DIAGRAM"> | <img src="https://raw.githubusercontent.com/matthewmackes/map2-audio/master/docs/images/Gemini_Generated_Image_w12pyrw12pyrw12p.png" width="280" alt="Gemini Generated Image w12pyrw12pyrw12p"> |
<!-- GALLERY:END -->

<p align="right"><em>Add screenshots to <code>docs/images/</code> and they appear here automatically.</em></p>

---

## Recent Activity

<!-- RECENT-ACTIVITY:START -->
| Commit | Message | Author | Date |
|:-------|:--------|:-------|:-----|
| [`0a49230`](https://github.com/matthewmackes/map2-audio/commit/0a4923075bb985bb84bc21ae4c28f154b1b40f84) | Update MAP2_TOP_100_FEATURES.md | Matthew Mackes | 2026-02-15 |
| [`3d8a2c0`](https://github.com/matthewmackes/map2-audio/commit/3d8a2c00269e825747dd211bfe554628f951adb0) | Clean up web frontend: simplify theme to dark-only, resto... | Map2 Audio | 2026-02-15 |
| [`e4255e3`](https://github.com/matthewmackes/map2-audio/commit/e4255e333136bfb60bdb7b9b87a895c2e6758695) | Update web frontend: enhance cluster dashboard, 3D graph,... | Map2 Audio | 2026-02-15 |
| [`237f1c8`](https://github.com/matthewmackes/map2-audio/commit/237f1c82fdc535fe9142513c2bd5148811daf770) | Add pending project files | Map2 Audio | 2026-02-15 |
| [`d47411c`](https://github.com/matthewmackes/map2-audio/commit/d47411ce1e04ffea73ec02775912e1447fc5e72a) | chore: auto-update README with latest docs & activity | matthewmackes | 2026-02-15 |
| [`6a62711`](https://github.com/matthewmackes/map2-audio/commit/6a627114ebeb8d311bbf91d2885e1f48c551f686) | docs: add educational disclaimer banner to README | Map2 Audio | 2026-02-15 |
| [`d306540`](https://github.com/matthewmackes/map2-audio/commit/d306540ee0aa40bfb57cbaec326bfe3bc4f5ccb6) | Fix and complete About advanced menu implementation | Map2 Audio | 2026-02-15 |
| [`81c6a8a`](https://github.com/matthewmackes/map2-audio/commit/81c6a8a7bdf4633ac96e1909cc0c37ef5df8ea2c) | chore: auto-update README with latest docs & activity | matthewmackes | 2026-02-15 |
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
