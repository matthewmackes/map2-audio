# MAP2-Audio vs AxeFX2: Feature Matrix & Gap Analysis

## Overview
This document provides a comprehensive side-by-side feature comparison between MAP2-Audio (open-source software platform) and AxeFX2 (discontinued hardware unit), organized by functional category with detailed gap analysis.

---

## Feature Matrix by Category

### 1. Audio Engine & Processing

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Core Architecture** | JUCE C++ engine with Python FastAPI backend | Proprietary DSP architecture | MAP2 is software-based; AxeFX2 is dedicated hardware |
| **Processing Latency** | ~10ms (low-latency ALSA/JACK) | <1ms (hardware-direct) | AxeFX2 has superior latency; MAP2 suitable for studio |
| **Sample Rate Support** | 44.1, 48, 88.2, 96, 176.4, 192 kHz | 44.1, 48, 96 kHz | MAP2 supports higher sample rates |
| **Bit Depth** | 32-bit float (JUCE native) | 24-bit (legacy standard) | MAP2 modern; AxeFX2 sufficient for audio |
| **Plugin Delay Compensation** | ✓ Full PDC implemented | ✗ Not applicable (closed system) | MAP2 compensates for plugin latencies |
| **Buffer Size Control** | ✓ Configurable (64-2048 samples) | ✗ Fixed by unit | MAP2 flexible; AxeFX2 optimized for performance |

### 2. Amp & Cabinet Modeling

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Amp Models** | Community-trained NAM models (1000s available) | 100+ proprietary models | AxeFX2 curated; MAP2 crowdsourced |
| **Cabinet IRs** | 846+ professional IRs included | Premium curated cabinet library | MAP2 has quantity; AxeFX2 has premium curation |
| **IR Customization** | ✓ Real-time stretch/trim/EQ | Limited to selection | MAP2 more flexible for tweaking |
| **Modeling Philosophy** | Neural network learning (AI-based) | Proprietary algorithms (analog emulation) | Different approaches; both effective |
| **Model Training** | Community-driven (GitHub integration) | Fractal proprietary only | MAP2 democratizes amp modeling |
| **Model Format** | NAM (Neural Amp Modeler) | Fractal's closed format | NAM is open standard |

### 3. Effects Library

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Native Effects** | Compressor, Limiter, Noise Gate, 8-Band Parametric EQ, Convolution Reverb | 15+ effect categories (reverb, delay, distortion, dynamics, modulation, etc.) | AxeFX2 offers broader effects; MAP2 uses plugin ecosystem |
| **Distortion/Overdrive** | Via plugins (LV2/VST3) | ✓ Dedicated models | AxeFX2 specialized; MAP2 extensible |
| **Reverb Quality** | Convolution-based (IR-driven, very realistic) | Algorithm-based (parametric, traditional) | Both high-quality; different approaches |
| **Delay Algorithms** | Circular Delays (custom algorithm) | ✓ Multiple delay types | AxeFX2 more variety |
| **Modulation** | Via plugins | ✓ Built-in (chorus, flanger, phaser, etc.) | AxeFX2 integrated; MAP2 needs plugins |
| **Pitch Shifting** | Via plugins | ✓ Built-in | AxeFX2 native; MAP2 extensible |
| **Time-Stretching** | Via plugins | ✗ Not available | MAP2 advantage for creative processing |

### 4. Plugin & Model Ecosystem

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Plugin Support** | LV2, VST3 (unlimited hosting) | ✗ Closed ecosystem | MAP2 infinitely extensible |
| **Plugin Discovery** | ✓ Automatic discovery (JACK/ALSA paths) | N/A | MAP2 scans system automatically |
| **Third-party Integration** | ✓ Full LV2/VST3 compatibility | ✗ Not possible | MAP2 supports any compatible plugin |
| **Community Models** | ✓ NAM models (GitHub integration) | ✗ Closed | MAP2 crowdsourced development |
| **Model Sharing** | ✓ Easy (JSON files, GitHub-hosted) | Proprietary (Axe-Change limited) | MAP2 more community-friendly |
| **Extensibility** | ✓ Unlimited (open architecture) | ✗ Hardware-bound | MAP2 future-proof; AxeFX2 static |

### 5. Signal Routing & Routing Configuration

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Routing Philosophy** | Node-based graph (drag-drop visual) | Matrix routing (fixed algorithms) | MAP2 modern UI; AxeFX2 traditional approach |
| **Signal Chains** | ✓ Unlimited custom chains | ✓ Limited presets | MAP2 fully flexible |
| **Serial/Parallel Routing** | ✓ Both supported (node-based) | ✓ Both supported | Both comprehensive |
| **Conditional Routing** | ✓ Via MIDI triggers | ✗ Scene-based only | MAP2 more dynamic |
| **Snapshot Recall** | ✓ Full state snapshots | ✓ Scene recall | Both can save/restore states |
| **Complex Chains** | ✓ 100+ nodes possible | ✓ Limited by hardware | MAP2 more complex scenarios |

### 6. Control Surface & MIDI

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **MIDI Learn** | ✓ Full CC0-127 mapping | ✓ MIDI controllable | Both feature-rich |
| **Footswitch Integration** | ✗ Requires external MIDI device | ✓ MFC-101 or optional footswitches | AxeFX2 integrated; MAP2 needs controller |
| **Expression Pedal Support** | ✓ Via MIDI (CC with curves) | ✓ Built-in (EV-1/EV-2) | AxeFX2 dedicated; MAP2 flexible |
| **CC Curve Types** | ✓ 4 types (linear, exponential, logarithmic, custom) | Proprietary curves | MAP2 more explicit control |
| **Program Change** | ✓ Full implementation | ✓ Scene switching | Both support |
| **Controller Profiles** | ✓ Named profiles (Edirol, Hotone, etc.) | Proprietary profiles | MAP2 documented; AxeFX2 pre-configured |
| **Feedback to Controller** | ✓ LED/display feedback support | ✓ MFC-101 feedback | Both support hardware feedback |
| **USB MIDI** | ✓ Via native USB MIDI | ✓ USB interface | Both support |
| **Hardware Integration** | Limited (requires external device) | Comprehensive (MFC-101, FC series) | AxeFX2 ecosystem advantage |

### 7. User Interface & Accessibility

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Web Interface** | ✓ React 19, responsive, modern | ✗ Not available | MAP2 unique advantage |
| **Terminal Interface** | ✓ Textual UI (30+ modules) | ✗ Not available | MAP2 unique; useful for headless setups |
| **Hardware LCD Display** | ✓ I2C support (1602/2004 LCDs) | ✓ Front panel display | Both can show parameters |
| **Parameter Editing** | ✓ Web UI / Terminal / API | ✓ Hardware buttons/knobs | MAP2 flexible; AxeFX2 tactile |
| **Visualization** | ✓ Spectrum analyzer, waveform display | Limited (basic metering) | MAP2 superior monitoring |
| **Mobile Access** | ✓ Web UI works on mobile/tablet | ✗ Not applicable | MAP2 unique feature |
| **Dark Mode/Theming** | ✓ Full theme support | Hardware-fixed | MAP2 customizable |
| **Touch-friendly** | ✓ Web UI optimized for touch | ✗ Hardware buttons only | MAP2 modern; AxeFX2 traditional |

### 8. I/O & Connectivity

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Audio Inputs** | Flexible (via audio interface) | 1-2 XLR analog | MAP2 any ALSA/JACK device |
| **Audio Outputs** | Flexible (via audio interface) | 2 XLR + SPDIF digital | MAP2 flexible; AxeFX2 professional |
| **Digital I/O** | ✓ Via JACK (if interface supports) | ✓ SPDIF | AxeFX2 integrated |
| **USB Interface** | ✓ Compatible with USB audio devices | ✓ Built-in (standalone) | MAP2 any USB audio; AxeFX2 integrated |
| **Network Connectivity** | ✓ REST API, WebSocket, networked control | ✗ MIDI only (optional) | MAP2 unique networked capability |
| **Audio Interface Compatibility** | Edirol UA-1000, Hotone Jogg, JACK-compatible | Fixed connections | MAP2 flexible; AxeFX2 fixed |
| **Headphone Output** | Via audio interface | Not available (1/4" main out only) | Need external monitor mixer for MAP2 headphones |
| **Multi-device Chaining** | ✓ Via MIDI/network | ✗ Standalone only | MAP2 supports integration |

### 9. Metering & Analysis Tools

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Spectrum Analyzer** | ✓ Real-time FFT display | ✗ Not available | MAP2 advantage for analysis |
| **LUFS Metering** | ✓ Loudness standard (EBU R128) | ✗ VU meter only | MAP2 modern standard |
| **Phase Correlation** | ✓ Goniometer display | ✗ Not available | MAP2 stereo analysis tool |
| **VU Meter** | ✓ Included | ✓ Hardware meter | Both have metering |
| **Peak Metering** | ✓ Per-plugin performance | ✗ System level only | MAP2 detailed insights |
| **CPU Monitoring** | ✓ Per-plugin CPU usage | Limited (overall only) | MAP2 granular performance data |
| **Latency Display** | ✓ Measured latency display | Hardware-fixed (transparent) | MAP2 transparency; AxeFX2 inherent |
| **Health Monitoring** | ✓ System status, uptime, alerts | ✗ Not applicable | MAP2 enterprise features |

### 10. Preset Management

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Preset Storage** | ✓ SQLite + filesystem (7z backups) | ✓ Internal memory + MIDI banks | MAP2 unlimited; AxeFX2 memory-bound |
| **Effect Chain Presets** | ✓ Full chain snapshots | ✓ Patches | Both comprehensive |
| **Per-plugin Presets** | ✓ Each plugin retains state | Limited (global presets) | MAP2 modular approach |
| **Tagging/Organization** | ✓ Full tagging system | Folder-based | MAP2 more flexible |
| **A/B Comparison** | ✓ Built-in A/B mode | ✓ Patch comparison | Both support comparison |
| **Morph Mode** | ✓ Smooth interpolation between presets | ✗ Not available | MAP2 unique feature |
| **Backup System** | ✓ Automatic 7z-compressed backups | Manual USB/network | MAP2 automated; AxeFX2 manual |
| **Cloud Sync** | Possible (via API) | ✗ Not possible | MAP2 extensible; AxeFX2 offline |
| **Undo/Redo** | ✓ 100+ action history | ✓ Limited | MAP2 superior |
| **Preset Sharing** | ✓ JSON files (GitHub-friendly) | Proprietary format (limited sharing) | MAP2 more shareable |

### 11. Audio Quality & Performance

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **Real-time Performance** | ✓ Optimized JUCE engine | ✓ Dedicated hardware | Both excellent for audio |
| **Zero-crossing Detection** | ✓ In mixing engine | Standard in hardware | Both avoid artifacts |
| **Headroom** | ✓ 32-bit float (excellent) | 24-bit (very good) | MAP2 slightly more headroom |
| **CPU Overhead** | Variable (depends on plugins) | Fixed (hardware) | AxeFX2 predictable; MAP2 flexible |
| **Multi-core Support** | ✓ Full multi-threaded | N/A (dedicated hardware) | MAP2 advantage on modern CPUs |
| **Platform Stability** | ✓ Linux ALSA/JACK tested | ✓ Standalone stability | Both proven |
| **Dropout Handling** | ✓ Graceful degradation | ✗ Hard dropout | MAP2 more resilient |

### 12. System Requirements & Deployment

| Feature | MAP2-Audio | AxeFX2 | Notes |
|---------|-----------|--------|-------|
| **OS Requirements** | Linux (ALSA/JACK, Python 3.8+) | Standalone (no OS) | MAP2 requires computer; AxeFX2 self-contained |
| **CPU Requirements** | Modern CPU (x86-64), ~2GHz+ | None (dedicated hardware) | MAP2 scalable; AxeFX2 fixed |
| **RAM** | 4GB+ recommended | N/A | MAP2 typical software footprint |
| **Storage** | 2GB+ (plugins + IRs) | N/A (internal) | MAP2 more storage; AxeFX2 fixed |
| **Cooling** | Depends on host computer | Built-in (passive/active) | AxeFX2 designed for heat dissipation |
| **Portability** | Laptop-based | Rack unit (portable but bulky) | Both road-compatible; different forms |
| **Power Consumption** | Variable (computer dependent) | ~100-200W (rack unit) | AxeFX2 predictable draw |
| **Redundancy/Backup** | ✓ Software-based (easy backup) | Risky (single hardware unit) | MAP2 safer for touring |
| **Headless Operation** | ✓ Terminal UI / API only | N/A (hardware standalone) | MAP2 works without monitor/keyboard |

---

## MAP2-Audio: Specific Gaps & Limitations

### Critical Gaps
1. **No Dedicated Hardware Footswitches**
   - Limitation: Requires external MIDI controller for live foot operation
   - Workaround: USB MIDI footswitches (FC-12, Hotone Jogg, etc.)
   - Impact: Live performance requires additional equipment investment

2. **Computer Dependency**
   - Limitation: Requires Linux host computer (ALSA/JACK setup)
   - Workaround: Laptop-based solution or dedicated single-board computer
   - Impact: Not a true "plug-and-play" standalone unit

3. **Lack of Proprietary Amp Modeling**
   - Limitation: Relies on community NAM models vs. Fractal's refined algorithms
   - Workaround: Train custom NAM models; use LV2/VST3 amp plugins
   - Impact: May require more tweaking to achieve specific tones; community models vary in quality

4. **No Integrated Expression Pedal**
   - Limitation: Expression control requires external MIDI pedal
   - Workaround: Use EV-1, EV-2, or similar MIDI expression pedals
   - Impact: Additional cost and cable management

### Moderate Limitations
5. **Latency vs. Hardware**
   - ~10ms latency vs. <1ms on AxeFX2
   - Acceptable for studio; marginal for ultra-tight live performance
   - Can be optimized with lower buffer sizes (at CPU cost)

6. **Built-in Effects Library**
   - Core effects more limited than AxeFX2's comprehensive suite
   - Workaround: Install LV2/VST3 plugins (freeware: Calf Studio Gear, GVST, etc.)
   - Impact: Requires plugin ecosystem knowledge

7. **Learning Curve**
   - API-driven architecture may confuse non-technical users
   - Web UI is intuitive but ecosystem is complex
   - Impact: Steeper learning curve vs. AxeFX2's integrated design

8. **No Integrated Reverb Algorithms (Parametric)**
   - Only convolution reverb (IR-based)
   - Workaround: Use plugin-based algorithmic reverb
   - Impact: Limited algorithmic reverb customization without plugins

### Minor/Manageable Issues
9. **Hardware Configuration Complexity**
   - JACK/ALSA setup can be complex for non-Linux users
   - Workaround: Docker deployment or managed environment
   - Impact: Initial setup steeper than AxeFX2's out-of-box experience

10. **Cabinet IR Library Curation**
    - 846+ IRs is quantity-focused; AxeFX2's cabinet library is quality-curated by Fractal
    - Workaround: Use premium IR packs (Ownhammer, Celestion, etc.) via LV2
    - Impact: May require additional IR purchasing/sourcing

11. **Form Factor Inflexibility**
    - Software-based; requires portable computer for touring
    - AxeFX2 is compact rack unit
    - Workaround: Use laptop with touchscreen or dedicated single-board computer in rack

---

## AxeFX2: Specific Gaps & Limitations

### Critical Gaps
1. **Discontinued Product (End of Life)**
   - Limitation: No future firmware updates, bug fixes, or feature additions
   - Impact: Stuck with 2009-era feature set; security/stability issues cannot be patched
   - Alternative: Upgrade to AxeFX III, FM9, FM3, or AM4

2. **Closed Ecosystem**
   - Limitation: Cannot add plugins, extend amp modeling, or customize algorithms
   - Workaround: None (hardware design is fixed)
   - Impact: Cannot benefit from modern amp modeling advances (e.g., NAM neural models)

3. **No AI/Community Amp Models**
   - Limitation: Only 100+ proprietary Fractal models; cannot leverage 1000+ community NAM models
   - Workaround: None (proprietary algorithm lock-in)
   - Impact: Limited access to emerging amp modeling technologies

4. **No Web/Remote Interface**
   - Limitation: No web UI, mobile control, or network-based management
   - Workaround: None (hardware standalone only)
   - Impact: Cannot control remotely; limited accessibility for non-technical users

5. **No Programmatic/API Access**
   - Limitation: Cannot integrate into software workflows, DAWs, or networked systems
   - Workaround: MIDI only (limited bandwidth)
   - Impact: Isolated from modern software ecosystem

### Moderate Limitations
6. **Limited I/O Flexibility**
   - Limitation: Fixed XLR + SPDIF connections; no USB audio in/out
   - Workaround: Use ADAT expansion (AxeFX II models with ADAT)
   - Impact: Cannot easily integrate with modern USB audio interfaces

7. **No Built-in LUFS/Modern Metering**
   - Limitation: Basic VU meter; no loudness standard metering
   - Workaround: Use external metering tools/DAWs
   - Impact: Limited loudness compliance monitoring for mastering scenarios

8. **Requires External MIDI Controller for Live Use**
   - Limitation: Needs MFC-101 or FC series footswitches ($300-500)
   - Workaround: Use MIDI footswitches (same cost as MAP2 workaround)
   - Impact: Additional investment; cable management complexity

9. **Fixed Memory/Preset Limit**
   - Limitation: Finite internal memory for presets/patches
   - Workaround: Manual backup to USB; Axe-Change library
   - Impact: Archived setup management needed for touring

### Minor/Manageable Issues
10. **Analog I/O Only (Primary)**
    - Limitation: Main I/O is analog XLR; digital I/O is SPDIF only
    - Workaround: Use analog cables (standard approach)
    - Impact: Requires quality analog cables; no advantages over digital-first systems

11. **No Parametric Reverb Customization**
    - Limitation: Reverb is algorithm-based but parameters fixed
    - Workaround: None (proprietary design)
    - Impact: Limited reverb tweaking vs. fully parametric DAW reverbs

12. **Single Hardware Unit Risk**
    - Limitation: If hardware fails during tour, entire rig is down
    - Workaround: Carry redundant AxeFX2 or backup (expensive)
    - Impact: Touring risk; no software-based backup option

13. **Heating/Power Consumption**
    - Limitation: Rack unit generates heat; ~100-200W power draw
    - Workaround: Proper rack ventilation, UPS power
    - Impact: Cooling/power requirements for touring rigs

14. **Learning Curve for Complex Routing**
    - Limitation: Matrix-based routing not as intuitive as modern visual graphs
    - Workaround: Learning curve; community documentation
    - Impact: Complex signal chains harder to conceptualize vs. node-based systems

---

## Summary Table: Gap & Limitation Count

| Aspect | MAP2-Audio Gaps | AxeFX2 Gaps | Severity |
|--------|-----------------|------------|----------|
| **Critical Issues** | 4 (hardware controls, computer dependency, proprietary modeling, expression pedal) | 5 (discontinued, closed, no AI, no API, no web UI) | AxeFX2 more critical (EOL) |
| **Moderate Issues** | 4 (latency, effects library, learning curve, reverb) | 4 (I/O limits, metering, MIDI controller need, preset limit) | Comparable |
| **Minor Issues** | 3 (hardware config, IR curation, form factor) | 4 (analog I/O, reverb, redundancy, routing UI) | Comparable |
| **Total Gaps** | **11** | **13** | AxeFX2 slightly more limited |

---

## Key Takeaways

### MAP2-Audio Best For:
✅ Studio recording with extensible effects  
✅ Experimentation with community amp models  
✅ Web-based remote control & monitoring  
✅ Modern metering (spectrum, LUFS)  
✅ Future-proof extensibility (plugin ecosystem)  
✅ Budget-conscious users (free/open-source)  

❌ Limited by: hardware footswitch integration, latency, proprietary modeling, computer dependency

### AxeFX2 Best For:
✅ Tour-proven reliability  
✅ Refined proprietary amp modeling  
✅ Standalone, no computer needed  
✅ Dedicated hardware controls  
✅ Predictable low-latency performance  

❌ Limited by: discontinued status, closed ecosystem, no modern features, no extensibility, no API/web access

---

## Conclusion

**MAP2-Audio** is a modern, extensible platform suited for studio work, experimentation, and integration with software ecosystems. Its gaps are primarily around hardware integration and standalone reliability.

**AxeFX2** is a battle-tested hardware processor optimized for touring musicians, but its discontinuation and closed design limit future growth and integration capabilities.

For new deployments, consider **AxeFX III, FM9, or FM3** as AxeFX2 successors rather than comparing legacy hardware to modern software platforms.
