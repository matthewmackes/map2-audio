# MAP2 Audio Platform Manual

**Date:** February 15, 2026

---

## Introduction

Welcome to the MAP2 Audio Platform, a powerful and flexible solution for real-time audio processing. This manual provides a comprehensive overview of the platform, from its core features and architecture to detailed installation instructions and usage examples.

The MAP2 Audio Platform is designed for a wide range of applications, from professional audio production and live performance to audio research and development. It combines a high-performance audio engine with a flexible and extensible architecture, allowing you to create complex audio processing chains and control them in real-time.

This manual is intended for users of all levels, from beginners to advanced users. Whether you are a musician, a sound engineer, or a software developer, you will find the information you need to get the most out of the MAP2 Audio Platform.

---

## Table of Contents

1.  [Architecture Overview](#architecture-overview)
2.  [Features](#features)
    *   [Guitar, Effects, MIDI & Hardware Control](#guitar-effects-midi--hardware-control)
    *   [Core Audio & Performance](#core-audio--performance)
    *   [System, Management & Control](#system-management--control)
    *   [Platform, Architecture & Networking](#platform-architecture--networking)
3.  [Installation](#installation)
    *   [Automated Installation on Fedora (Recommended)](#automated-installation-on-fedora-recommended)
    *   [Manual Installation (All Linux Distributions)](#manual-installation-all-linux-distributions)
4.  [Getting Started: Core Concepts](#getting-started-core-concepts)
    *   [Chains](#chains)
    *   [Flows](#flows)
    *   [All-In-One Mode](#all-in-one-mode)
5.  [How-To Guides](#how-to-guides)
    *   [Creating a Simple Audio Chain](#creating-a-simple-audio-chain)
    *   [Using MIDI Controllers](#using-midi-controllers)
6.  [Examples](#examples)
    *   [Example 1: Classic Rock Guitar Tone](#example-1-classic-rock-guitar-tone)
    *   [Example 2: Ambient Soundscape](#example-2-ambient-soundscape)
7.  [Technical Reference](#technical-reference)
    *   [File Structure](#file-structure)
    *   [System Configuration](#system-configuration)
8.  [Index](#index)

---

## 1. Architecture Overview

The MAP2 Audio Platform is built on a modular and scalable architecture that separates the definition of an audio process from its execution. This design provides a valuable educational model for understanding how complex audio systems can be managed, from a single self-contained unit to a distributed multi-node cluster.

The platform is designed to run on a variety of hardware, from single-board computers like the Raspberry Pi to powerful desktop machines. It can be deployed in a variety of configurations, including a standalone "All-In-One" mode and a distributed multi-node cluster.

The core of the platform is the JUCE-based audio engine, which provides a high-performance, low-latency environment for real-time audio processing. The audio engine is controlled by a Python-based backend, which provides a REST API for managing the system and a WebSocket interface for real-time communication.

The platform can be controlled through a variety of interfaces, including a web-based dashboard, a text-based user interface (TUI), and MIDI controllers. This flexibility allows you to choose the best interface for your needs, whether you are in the studio, on stage, or in a remote location.

A high-level overview of the architecture can be summarized as follows:

*   **Audio Node**: A dedicated node for running the real-time audio engine. This node is optimized for low-latency audio processing and is responsible for all audio I/O and DSP.
*   **Management Node**: A node for running the management backend and user interfaces. This node is responsible for managing the system, serving the web dashboard, and providing the API for controlling the platform.
*   **MIDI Pedalboard + LCD**: A physical user interface for controlling the platform in a live performance setting.

The two nodes are connected via a high-speed Ethernet network, allowing for low-latency communication between the audio engine and the management backend.

This distributed architecture allows for a high degree of flexibility and scalability. For simple setups, the platform can be run in an "All-In-One" mode on a single machine. For more demanding applications, the workload can be distributed across multiple nodes, allowing for greater processing power and redundancy.
---

## 2. Features

The MAP2 Audio Platform is packed with features designed for professional audio production, live performance, and system integration.

### Guitar, Effects, MIDI & Hardware Control

1.  **Neural Amp Modeler (NAM) Integration:** Utilizes AI for hyper-realistic guitar and bass amplifier simulations.
2.  **Impulse Response (IR) Convolution Engine:** Load, manage, and use custom IR files for cabinet, speaker, and room simulation.
3.  **Studio-Grade Effects Suite:** Comprehensive collection of built-in effects for complete signal chain construction.
4.  **Vintage Amp Emulations:** .
5.  **Advanced Modulation & Pitch Effects:** Ultra-Harmonizer, Poly Shifter, and ambient "Shoe Gaze" processors.
6.  **Full Dynamics Suite:** Built-in Compressor, Limiter, Noise Gate, and Expander.
7.  **Time-Based Effects:** High-quality Chorus, Phaser, Flanger, Delay, and Reverb processors.
8.  **Comprehensive Filtering:** Parametric EQs, Graphic EQs, High-Pass Filters (HPF), and Low-Pass Filters (LPF).
9.  **LV2 Plugin Host:** Natively supports and hosts third-party LV2 plugins for near-limitless tonal expansion.
10. **Dual Processing Chains:** Run two fully independent effects chains in parallel for complex routing.
11. **A/B Chain Morphing:** Seamlessly crossfade and interpolate parameters between two distinct chains.
12. **Series and Parallel Path Routing:** Split and merge the signal path within a chain for advanced effects blending.
13. **Plugin Preset Management:** Save, load, and manage presets for individual plugins.
14. **Chain Snapshots:** Save and recall the entire state of a signal path, including all plugins and their settings.
15. **MIDI Learn Functionality:** Instantly map any MIDI CC message to any plugin parameter for hands-free control.
16. **Non-Consumptive MIDI CC Processing:** CC messages pass through all plugins, allowing one controller to modulate multiple effects.
17. **MIDI CC Fan-Out:** A single MIDI controller can be mapped to and control parameters on multiple different plugins simultaneously.
18. **Series MIDI Flow Architecture:** MIDI messages flow sequentially through the plugin chain by default.
19. **Parallel MIDI Branching:** Split a single MIDI input to control multiple instruments or effects in parallel.
20. **MIDI Program Change (PC) Support:** For preset and chain switching from external MIDI controllers.
21. **Hardware LCD Multi-Page UI:** Standalone interface inspired by high-end processors like Kemper, Helix, and Axe-FX.
22. **Standalone Operation via LCD:** Full control without a connected computer, ideal for live performance.
23. **LCD Status Page:** At-a-glance view of sample rate, buffer size, CPU load, and the active chain name.
24. **LCD VU Meters Page:** Real-time stereo level meters with peak-hold functionality and configurable color zones.
25. **LCD Chain Page:** Visually displays the current effects chain with a scrollable list of active plugins.
26. **LCD Plugin Browser:** Scroll through all available LV2 plugins and view their bypass status directly on the hardware.
27. **LCD MIDI Activity Page:** Monitor connected MIDI devices and see real-time message activity.
28. **LCD Performance Page:** Detailed, real-time metrics for CPU load, xruns, and audio callback times.
29. **Hardware Rotary Encoder Support:** Navigate menus, scroll lists, and adjust parameters with a physical knob.
30. **Hardware Navigation Button Support:** Dedicated GPIO inputs for Up, Down, Select, Menu, and Back buttons.
31. **Dual LCD Display Support:** Power two separate hardware displays for expanded information views.
32. **Custom LCD Characters:** Renders graphical VU meter bars and status icons (MIDI note, CPU, Speaker).
33. **LCD Backlight Control:** Software-controllable backlight for the hardware display.
34. **LCD Screensaver:** Prevents screen burn-in during idle periods.
35. **Hot-Swappable MIDI Devices:** Connect and disconnect MIDI controllers without restarting the audio engine.

### Core Audio & Performance

36. **Ultra-Low Latency Audio Engine:** JUCE 8.0-based core delivers sub-3ms round-trip latency on optimized hardware.
37. **Real-time `SCHED_FIFO` Processing:** Audio threads run at the highest real-time priority for maximum stability.
38. **CPU Core Isolation (`isolcpus`):** Dedicates specific CPU cores exclusively to audio processing, preventing OS interference.
39. **Memory Locking (`mlockall`):** Prevents page faults on the real-time audio thread, eliminating potential glitches.
40. **PipeWire-Native with JACK Compatibility:** Modern, flexible audio backend for seamless integration with the Linux desktop.
41. **High-Resolution Audio Support:** Process audio at professional sample rates up to 192kHz.
42. **Configurable Buffer Sizes:** Tune latency vs. stability with buffer sizes from 64 to 256 samples and beyond.
43. **Automatic Plugin Delay Compensation (PDC):** Maintains perfect phase alignment across the entire plugin chain, regardless of complexity.
44. **Zero-Allocation Real-time Audio Path:** Pre-allocates all memory to prevent dynamic allocations that could cause xruns.
45. **XRun (Underrun/Overrun) Detection:** Actively monitors for audio dropouts and provides detailed logging and recovery.
46. **Professional Metering Suite:** Includes Spectrum Analyzer, LUFS Loudness, VU Meters, and Phase Correlation.
47. **Hot-Swappable USB Audio Interfaces:** Add or remove audio hardware without restarting the service.
48. **Optimized Eigen-based NAM Inference:** Neural Amp Modeler backend is optimized for high-performance CPU inference.
49. **Graceful Hardware Degradation:** The system remains operational and controllable even if audio hardware is disconnected.
50. **Fixed-Point and Floating-Point Processing:** Supports various bit depths for maximum audio quality.
51. **IRQ Balancing Management:** Disables IRQ balancing on dedicated audio cores to ensure consistent low latency.
52. **Asynchronous Audio Device Handling:** Audio hardware changes are handled in the background without blocking the main application.

### System, Management & Control

53. **FastAPI REST API:** Comprehensive API with over 50 endpoints for deep system control and integration.
54. **Real-time WebSocket Streaming:** Pushes live metering data (Spectrum, LUFS, CPU) to web and TUI clients.
55. **Modern React 18 Web UI:** Fully-featured, browser-based interface for control from any device (desktop, tablet, phone).
56. **Textual-based TUI:** A fast, lightweight Text-based User Interface for remote management over SSH.
57. **Multi-User Session Support:** Allows for concurrent user sessions with workspace isolation.
58. **SQLite Database Backend:** Manages presets, chains, plugin lists, and system configuration.
59. **Async Database Operations:** Uses `aiosqlite` to prevent database queries from blocking the main event loop.
60. **"Chain" as a Reusable Recipe:** A saved Chain is an inert, reusable JSON definition for a specific sound.
61. **"Flow" as a Runtime Instance:** A Flow is a Chain that has been actively deployed to a node for execution.
62. **Flow Orchestrator Service:** Manages the deployment, state, and lifecycle of audio processing "Flows".
63. **Centralized Cluster Management:** Use a single UI to control and monitor an entire cluster of MAP2 nodes.
64. **Preset Library with Import/Export:** Easily share and back up your sounds.
65. **System Health Monitoring & Diagnostics:** API endpoints and UI panels for monitoring system status.
66. **Automatic Service Orchestration:** Systemd services manage startup, shutdown, and dependencies.
67. **Background Metrics Daemon:** Collects performance data without interfering with real-time audio threads.
68. **Plugin Discovery and Scanning:** Automatically scans for and registers new LV2 plugins on startup.
69. **LCD Simulation Mode:** Run the LCD interface in a terminal without any hardware for testing and development.
70. **Interactive LCD Setup Wizard:** A command-line tool guides users through hardware detection and configuration.
71. **Python-based Control Plane:** The entire backend and management system is built on modern, asynchronous Python.
72. **Multi-Platform Client Support:** Control the system from any modern web browser on any operating system.

### Platform, Architecture & Networking

73. **Distributed Multi-Node Cluster System:** Scale processing power by linking multiple MAP2 units over a network.
74. **Audio Video Bridging (AVB) Support:** Enables deterministic, time-synchronized, low-latency audio streaming over standard Ethernet.
75. **Digital Snake Capability:** Use AVB to transport many channels of audio over a single Ethernet cable, replacing heavy analog snakes.
76. **Distributed DSP / CPU Load Balancing:** Split a CPU-heavy effects chain across multiple nodes in an AVB network.
77. **Interoperability with Pro AVB Gear:** Connect and stream audio to/from third-party AVB devices (MOTU, PreSonus, etc.).
78. **gPTP (802.1AS) Time Synchronization:** Achieves sub-microsecond clock sync across all nodes on an AVB network.
79. **AVDECC (1722.1) Device Discovery:** Automatically discovers and identifies other AVB-capable devices on the network.
80. **AEM Device Enumeration:** Queries and understands the capabilities (channel counts, formats) of other AVB devices.
81. **AEM Caching Database:** Caches discovered AVB device information to accelerate system startup.
82. **Dual-Mode Networking:** Can operate in a control-only IP mode or a full audio-streaming AVB mode.
83. **"All-In-One" Operating Mode:** Runs the audio engine, backend, and UI on a single machine for convenience.
84. **Dedicated "Audio Node" Mode:** Runs only the audio engine for minimum latency and maximum stability in a cluster.
85. **Dedicated "Control Node" Mode:** Runs only the management backend and UI to control a cluster.
86. **High-Availability Architecture:** Design includes primary and standby nodes for critical applications.
87. **Automatic Failover Promotion:** The Flow Orchestrator can automatically promote a standby node if a primary node fails.
88. **Support for Intel I210/I225 NICs:** Works with specific, professional-grade network hardware for AVB.
89. **`ptp4l` Integration:** Leverages the standard Linux PTP daemon for network time synchronization.
90. **JSON-based Chain Configuration:** Chains are stored in a human-readable and easily shareable format.
91. **Headless Operation:** Can run entirely without a connected display or user interface, managed remotely.
92. **systemd Service Integration:** Deployed as robust, manageable services for production environments.
93. **Bare Metal Target:** Designed for deployment on Fedora Linux with a real-time kernel.
94. **Phased AVB Implementation Roadmap:** A clear, documented plan for future AVB features like connection management (ACMP).
95. **Modular, Service-Oriented Architecture:** Components are designed as independent, communicating services.
96. **Asyncio-based Event Loop:** Built on Python's modern asynchronous framework for high I/O throughput.
97. **Scalability from Single Node to Large Cluster:** The architecture is designed to scale from one to 10+ nodes.
98. **Extensible Data Model:** The database schema is designed to be extensible for future features.
99. **Hardware Abstraction Layer (HAL):** Code is separated from specific hardware (e.g., LCD, GPIO) to allow for future flexibility.
100. **Comprehensive Documentation:** A full suite of technical documents covers architecture, features, and implementation details.
---

## 3. Installation

This section provides a comprehensive guide for installing the MAP2 Audio Platform on a compatible Linux system. The primary target operating system is **Fedora Server (38 or newer)**, as the automated installation scripts are designed specifically for it.

### Prerequisites

*   **Operating System:** Fedora Server 38+ is strongly recommended. Other modern Linux distributions may work with the manual method, but package names will vary.
*   **Hardware:**
    *   A modern x86-64 CPU (4+ cores recommended).
    *   4GB RAM (8GB+ recommended).
    *   10GB of free disk space.
    *   A class-compliant USB audio interface is recommended for high-performance audio I/O.
    *   For AVB networking features, a compatible Intel I210 or I225 network interface card is required.
*   **Permissions:** You will need `sudo` or root access to install system-level packages and configure services.

### Automated Installation on Fedora (Recommended)

The repository includes a master script, `install_on_new_host.sh`, designed to fully automate the setup on a fresh Fedora system.

#### How It Works

The `install_on_new_host.sh` script is a high-level wrapper. Its primary function is to clone or update the repository and then execute a Python script (`app/services/backup_service.py`) that dynamically generates a much more detailed and comprehensive rebuild script. This generated script then performs the actual, idempotent installation of all packages, dependencies, and configurations.

#### Steps

1.  **Clone the Repository:**
    First, clone the MAP2 repository from GitHub.
    ```bash
    git clone https://github.com/matthewmackes/map2-audio.git
    cd map2-audio
    ```

2.  **Run the Installer:**
    Execute the installation script with `sudo`. It is safe to run multiple times.
    ```bash
    sudo bash install_on_new_host.sh
    ```
    The script will perform all necessary steps, including installing packages, configuring the system for real-time audio, and setting up `systemd` services. Upon completion, the system will be fully configured.

### Manual Installation (All Linux Distributions)

This method breaks down the steps performed by the automated script. It is useful for understanding the system's architecture or for installing on a non-Fedora distribution (package names will need to be adapted).

#### Step 1: Install System Dependencies

You need to install packages for the audio subsystem, Python, Node.js, and C++ build tools.

**On Fedora (using `dnf`):**
```bash
sudo dnf install -y \
    git gcc gcc-c++ cmake make \
    python3 python3-pip python3-devel python3-virtualenv \
    nodejs npm \
    sqlite sqlite-devel \
    pipewire pipewire-alsa pipewire-jack-audio-connection-kit pipewire-jack-audio-connection-kit-devel \
    alsa-utils alsa-lib-devel \
    lv2 lv2-devel lilv lilv-devel suil suil-devel \
    lv2-calf-plugins guitarix-lv2 gxplugins-lv2 lsp-plugins-lv2 \
    i2c-tools htop tmux
```

**On Debian/Ubuntu (using `apt`, example package names):**
```bash
sudo apt update
sudo apt install -y \
    git build-essential cmake \
    python3 python3-pip python3-dev python3-venv \
    nodejs npm \
    libsqlite3-dev \
    pipewire pipewire-audio-client-libraries libjack-jackd2-dev \
    libasound2-dev \
    lv2-dev lilv-utils suil-tools \
    calf-plugins guitarix \
    i2c-tools htop tmux
```

#### Step 2: Clone the Repository
```bash
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio
```

#### Step 3: Set up Python Environment

Install the required Python packages using `pip`.
```bash
pip3 install --user -r requirements.txt
# If requirements.txt is not present, install manually:
pip3 install --user \
    "fastapi" "uvicorn[standard]" \
    "httpx" "aiohttp" \
    "sqlalchemy" "aiosqlite" \
    "textual" "rich" \
    "psutil" "pydantic" "python-multipart"
```

#### Step 4: Set up Node.js Frontend
Install the frontend dependencies using `npm`.
```bash
# Install root dependencies
npm install

# Install and build the web dashboard
cd web
npm install
npm run build
cd ..
```

#### Step 5: Build the C++ Audio Engine
Compile the JUCE-based audio engine.
```bash
cd juce-engine
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
cd ..
```
*Note: For advanced features like AVB, you may need to pass additional flags like `-DUSE_AVDECC=ON` and have `libavtp` installed.*

#### Step 6: Configure System for Real-Time Audio

This is a critical step for achieving low-latency performance.

1.  **Create an `audio` group:**
    ```bash
    sudo groupadd -r audio
    ```

2.  **Add your user to the `audio` group:** (Replace `your_user` with your username)
    ```bash
    sudo usermod -a -G audio your_user
    ```
    **You must log out and log back in for this change to take effect.**

3.  **Set real-time permissions for the `audio` group:**
    Create a new file:
    ```bash
    sudo nano /etc/security/limits.d/99-audio.conf
    ```
    Add the following content:
    ```
    # Permissions for the audio group
    @audio   -  rtprio     95
    @audio   -  memlock    unlimited
    @audio   -  nice       -19
    ```
    Save and exit the editor.

#### Step 7: Install Systemd Services (Optional)
To have the MAP2 backend run automatically on boot, copy the provided `systemd` unit files.
```bash
sudo cp systemd/map2-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
```

---

### Post-Installation

#### Starting the Platform

*   **If you installed the systemd service:**
    ```bash
    # Enable the service to start on boot and start it now
    sudo systemctl enable --now map2-backend.service

    # Check the status
    systemctl status map2-backend.service
    ```

*   **To run manually (without services):**
    ```bash
    # In one terminal, start the backend
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

    # In another terminal, astart the Terminal UI
    textual run tui/app.py
    ```

#### Accessing the Interfaces
*   **Web Dashboard:** `http://<your-machine-ip>:3000`
*   **API Server:** `http://<your-machine-ip>:8080`
*   **Interactive API Docs:** `http://<your-machine-ip>:8080/docs`

---

### Optional Hardware Setup

#### LCD Display
If you have a compatible I2C LCD display, you can run its installation script.
```bash
# Add your user to the i2c group
sudo usermod -a -G i2c your_user
# Log out and log back in

# Run the installer
cd lcd
sudo bash install_lcd.sh
```
This will install dependencies and configure the system to use the LCD display.
---
## 4. Getting Started: Core Concepts

The MAP2 platform is designed with a modular and scalable architecture that separates the *definition* of an audio process from its *execution*. This provides a valuable educational model for understanding how complex audio systems can be managed, from a single self-contained unit to a distributed multi-node cluster. This document explores three fundamental concepts in the MAP2 architecture: **Chains**, **Flows**, and the **"All-In-One" operating mode**.

*   **Chains** represent the "what" – the specific sequence of audio plugins and their settings that define a desired sound.
*   **Flows** represent the "where" and "how" – the deployment of a Chain onto a specific node in the system and its runtime state.
*   The **All-In-One Mode** is a specific use case where the entire platform—audio engine, control backend, and user interface—runs on a single machine.

By examining these concepts, we can learn about the principles of modular DSP design, service orchestration, and scalable system architecture.

### Chains: Crafting the Sound

In the MAP2 ecosystem, a **"Chain"** is the fundamental building block for all audio processing. It is conceptually equivalent to a guitarist's pedalboard or a studio engineer's channel strip. A Chain is a data structure that defines an ordered list of audio plugins and their parameter settings. For students of digital audio, the Chain concept serves as a practical example of a directed graph for signal processing.

**Constructing a Chain**

The platform provides a flexible environment for constructing Chains, which can range from a simple, single plugin to a complex network of processors. The key architectural features for Chain construction include:

*   **Modular Plugins:** Chains are built by selecting from a library of available processing modules. These include built-in effects (EQ, compression, delay, reverb), a powerful convolution engine for loading impulse responses (e.g., for cabinet simulation), and, most notably, support for third-party LV2 plugins. This extensibility is a key educational feature, demonstrating how a host application can be designed to incorporate external code modules.
*   **Series and Parallel Routing:** The underlying JUCE audio graph supports both series and parallel signal paths. This allows for the implementation of advanced audio routing techniques. For example, a user can split the signal into two parallel paths, apply a different amplifier model to each, and then blend them back together.

A Chain is ultimately a piece of configuration—a JSON object, for instance—that is inert on its own. It is a reusable recipe for a sound. A user might create and save dozens of Chains: one for a clean funk guitar tone, another for a heavy metal rhythm sound, and a third for a vocal processing channel strip.

### Flows: From Configuration to Execution

While a Chain defines *what* to do, a **"Flow"** brings that definition to life. A Flow can be understood as a **runtime instance of a Chain deployed on a specific node**. The management of Flows is handled by a dedicated service called the **Flow Orchestrator**, which provides an advanced look into the principles of service orchestration and distributed systems.

The concept of a Flow is most relevant in a multi-node cluster, but it applies even in a single-node setup. Here’s what the Flow Orchestrator's role teaches us:

*   **Deployment Management:** The orchestrator is responsible for taking a Chain's configuration and deploying it to a target node's audio engine via an HTTP API. This client-server model, where a central orchestrator sends commands to worker nodes, is a common pattern in distributed computing.
*   **Resource Allocation:** The orchestrator has the logic to select the "best" node for a given Flow, potentially based on CPU load or other metrics. This introduces the concept of intelligent resource management.
*   **High-Availability and Redundancy (Advanced Concept):** The Flow Orchestrator contains sophisticated logic for high-availability scenarios. It can assign a Chain to both a "primary" node and one or more "standby" nodes. The orchestrator monitors the health of the primary node and, in the event of a failure, can automatically "promote" a standby node to take over. This is a practical demonstration of failover logic, a critical concept in designing resilient, mission-critical systems.

In essence, the relationship is `Chain -> Flow -> Node`. A Chain is the template, and a Flow is the living, breathing process running on a designated piece of hardware. This abstraction is powerful, as it decouples the sound design process from the physical topology of the hardware.

### All-In-One Mode: A Self-Contained System

The **"All-In-One"** mode is defined by running all major components of the MAP2 platform on a single machine:

1.  **The JUCE Audio Engine:** Performing the real-time DSP.
2.  **The Python Backend:** Serving the API and managing the engine.
3.  **The React Web Dashboard:** Providing the graphical user interface.

**Educational Value of the All-In-One Mode**

From a system architecture perspective, the All-In-One mode is a case study in **vertical integration** on a single host. It demonstrates how multiple services can coexist and communicate on one machine. It highlights the trade-offs inherent in such a design:

*   **Pros:**
    *   **Simplicity and Convenience:** It is the easiest mode to set up and use. A user can process audio and simultaneously use the web interface on the same machine to tweak settings without needing a second device.
    *   **Cost-Effectiveness:** It requires only a single computer.
*   **Cons:**
    *   **Increased Resource Contention:** The CPU, memory, and I/O resources must be shared between the demanding real-time audio engine and the non-real-time backend and web browser. This can lead to slightly higher audio latency (documented as 4-5ms vs. <3ms for the dedicated "Audio" mode) and a greater risk of audio dropouts (xruns) if the system is overloaded.
    *   **Single Point of Failure:** If the single machine fails, the entire system goes down.

**Use Cases for All-In-One Mode**

The All-In-One mode is ideal for scenarios where ultimate, mission-critical stability is less important than convenience and a self-contained workflow.

*   **Home Studio / Practice Rig:** This is the primary use case. A musician can connect their instrument to an audio interface, connect a monitor and keyboard to the MAP2 machine, and have a complete, self-contained unit for practice, recording, and sound design. They can see real-time feedback on the screen as they adjust parameters in the web UI.
*   **Sound Design and Patch Creation:** When creating new Chains, the immediate feedback of the All-In-One mode is invaluable. A user can quickly experiment with different plugins and settings and hear the results instantly, all within a single, integrated environment.
*   **Development and Education:** For developers and students learning about the platform, the All-In-One mode is the most straightforward way to get the entire system running to study the interaction between the different components.
---

## 5. How-To Guides

This section provides practical guides for common tasks on the MAP2 Audio Platform.

### Creating a Simple Audio Chain

1.  **Open the Web Dashboard:** Navigate to `http://<your-machine-ip>:3000`.
2.  **Go to the Chain Designer:** Click on the "Chains" tab in the main navigation.
3.  **Create a New Chain:** Click the "New Chain" button.
4.  **Add Plugins:**
    *   Click the "+" button in the chain editor to open the plugin browser.
    *   Select a plugin from the list (e.g., "NAM Player").
    *   The plugin will be added to the chain.
5.  **Configure Plugins:**
    *   Click on the plugin in the chain to open its parameter editor.
    *   Adjust the parameters to your liking.
6.  **Save the Chain:**
    *   Give your chain a name and click the "Save" button.

### Using MIDI Controllers

1.  **Connect Your MIDI Controller:** Connect your MIDI controller to the system via USB.
2.  **Open the Web Dashboard:** Navigate to `http://<your-machine-ip>:3000`.
3.  **Go to the MIDI Mapping Page:** Click on the "MIDI" tab.
4.  **Enable MIDI Learn:** Click the "MIDI Learn" button.
5.  **Select a Parameter:** In the Chain Designer, click on the parameter you want to control.
6.  **Move the Controller:** Move the knob or fader on your MIDI controller that you want to assign.
7.  **Save the Mapping:** The mapping will be automatically saved.

---

## 6. Examples

This section provides some example setups to get you started.

### Example 1: Classic Rock Guitar Tone

*   **Chain:**
    1.  **NAM Player:** Load a Marshall-style `.nam` model.
    2.  **IR Loader:** Load a 4x12 Celestion V30 cabinet impulse response.
    3.  **EQ:** Cut some low-end frequencies and boost the mids.
    4.  **Reverb:** Add a subtle spring reverb.

### Example 2: Ambient Soundscape

*   **Chain:**
    1.  **Delay:** Set a long delay time with high feedback.
    2.  **Reverb:** Use a large hall reverb with a long decay time.
    3.  **Chorus:** Add a slow, wide chorus to create movement.
    4.  **Pitch Shifter:** Add a shimmer effect by pitch-shifting the wet signal up an octave.

---

## 7. Technical Reference

This section provides detailed technical information about the platform.

### File Structure

```
/home/mm/map2-audio/                    ← Main repository root
├── app/                                ← Python FastAPI backend
│   ├── main.py                         ← Application entry point
│   ├── config.py                       ← Configuration manager
│   ├── paths.py                        ← Storage path management
│   ├── routes/                         ← API route modules
│   ├── services/                       ← Service modules
│   └── ...
├── juce-engine/                        ← C++ JUCE audio engine
│   ├── Source/                         ← C++ source files
│   └── build/
│       └── map2_audio_engine*.so       ← Built Python extension module
├── web/                                ← React/Vite web frontend
│   ├── src/                            ← TypeScript source
│   └── dist/                           ← Production build output
├── tui/                                ← Textual terminal UI
├── lcd/                                ← LCD display subsystem
├── scripts/                            ← Utility/setup scripts
├── systemd/                            ← systemd unit files
├── config/                             ← Configuration templates
├── data/                               ← Runtime data (SQLite DB)
│   └── map2.db
├── logs/                               ← Application logs
├── .venv/                              ← Python virtual environment
├── install_on_new_host.sh              ← Installation script
└── ...
```

### System Configuration

The `docs/TRANSPLANTATION_GUIDE.md` file contains a complete and detailed inventory of all system packages, Python packages, Node.js packages, C++ dependencies, third-party assets, build commands, and system configuration files. This guide is the most comprehensive reference for the system's technical details.

---

## 8. Index

*   Architecture Overview
*   Features
*   Installation
*   Getting Started
    *   Chains
    *   Flows
    *   All-In-One Mode
*   How-To Guides
*   Examples
*   Technical Reference
    *   File Structure
    *   System Configuration
