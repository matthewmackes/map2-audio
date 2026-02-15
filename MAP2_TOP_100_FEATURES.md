# MAP2 Audio Platform - Top 100 Features

### Guitar, Effects, MIDI & Hardware Control

1.  **Neural Amp Modeler (NAM) Integration:** Utilizes AI for hyper-realistic guitar and bass amplifier simulations.
2.  **Impulse Response (IR) Convolution Engine:** Load, manage, and use custom IR files for cabinet, speaker, and room simulation.
3.  **Studio-Grade Effects Suite:** Comprehensive collection of built-in effects for complete signal chain construction.
4.  **Vintage Amp Emulations:** Includes classic models such as the Peavey 5150 and Fender Tweed Bassman.
5.  **Advanced Modulation & Pitch Effects:** Emulations of the H3000 Harmonizer, Boss Poly Shifter, and ambient "Shoe Gaze" processors.
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
