# Plan: Add PiPedal ToobAmp Plugins as Core Plugins

> **Status: IMPLEMENTED** - All phases completed on 2026-02-01

## Research Summary

### Source Project: PiPedal / ToobAmp
- **Repository**: https://github.com/rerdavies/ToobAmp
- **Version**: v1.2.71 (26 LV2 plugins)
- **License**: MIT
- **Platform**: Raspberry Pi OS, Ubuntu, Debian-based Linux

### Current State in map2-audio
- Configuration file exists: `app/config/default_lv2_effects.json` with 23+ ToobAmp plugin references
- Plugin discovery system is **fully implemented** (lilv-based)
- Caching system is **fully implemented**
- **CRITICAL GAP**: ToobAmp plugins are only REFERENCED, not INSTALLED
- The config uses fabricated paths like `/usr/lib/lv2/toob-nam.lv2` that don't exist

---

## ToobAmp Plugin Inventory (PiPedal's Core Plugins)

### Amp Modeling (Priority: HIGH)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Neural Amp Modeler | `http://two-play.com/plugins/toob-nam` | NAM-based neural amp modeling |
| TooB ML Amplifier | `http://two-play.com/plugins/toob-ml` | Jatin Chowdhury's ML library |

### Cabinet Simulation (Priority: HIGH)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Cab IR | `http://two-play.com/plugins/toob-cab-ir` | Convolution-based cabinet IR |
| TooB CabSim | `http://two-play.com/plugins/toob-cabsim` | EQ-based cabinet simulation |

### Reverb (Priority: MEDIUM)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Convolution Reverb | `http://two-play.com/plugins/toob-convolution-reverb` | Mono/Stereo convolution reverb |
| TooB Freeverb | `http://two-play.com/plugins/toob-freeverb` | Classic Freeverb algorithm |

### EQ & Tone (Priority: MEDIUM)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Parametric EQ | `http://two-play.com/plugins/toob-peq` | 4-band parametric EQ |
| TooB 3 Band EQ | `http://two-play.com/plugins/toob-3band-eq` | Simple 3-band EQ |
| TooB Tone Stack | `http://two-play.com/plugins/toob-tone-stack` | Fender/Marshall/Baxandall stacks |
| TooB GE-7 Graphics EQ | `http://two-play.com/plugins/toob-ge7-eq` | 7-band graphic EQ |

### Modulation (Priority: MEDIUM)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB CE-2 Chorus | `http://two-play.com/plugins/toob-ce2-chorus` | Boss CE-2 replica |
| TooB BF-2 Flanger | `http://two-play.com/plugins/toob-bf2-flanger` | Boss BF-2 replica |
| TooB Phaser | `http://two-play.com/plugins/toob-phaser` | Phase shifting effect |
| TooB Tremolo | `http://two-play.com/plugins/toob-tremolo` | Normal/harmonic tremolo |

### Time-Based (Priority: MEDIUM)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Delay | `http://two-play.com/plugins/toob-delay` | Delay effect |

### Utility (Priority: LOW)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Tuner | `http://two-play.com/plugins/toob-tuner` | Guitar tuner |
| TooB Noise Gate | `http://two-play.com/plugins/toob-noise-gate` | Noise gate / slow gear |
| TooB Input Stage | `http://two-play.com/plugins/toob-input-stage` | Input conditioning |
| TooB Volume | `http://two-play.com/plugins/toob-volume` | Level adjustment |
| TooB Mix | `http://two-play.com/plugins/toob-mix` | Stereo channel mixer |
| TooB Spectrum Analyzer | `http://two-play.com/plugins/toob-spectrum-analyzer` | Spectrum display |
| TooB Input Recorder | `http://two-play.com/plugins/toob-input-recorder` | Audio recording |
| TooB 4Looper | `http://two-play.com/plugins/toob-4looper` | 4-track looper |
| TooB One-Button Looper | `http://two-play.com/plugins/toob-one-button-looper` | Simple MIDI looper |
| TooB Player | `http://two-play.com/plugins/toob-player` | Audio file playback |

---

## Implementation Plan

### Phase 1: ToobAmp Installation Script (Core)

**Goal**: Create an automated installer for ToobAmp plugins

#### Step 1.1: Create install script
Create `scripts/install-toobamp.sh`:
```bash
#!/bin/bash
# Install ToobAmp LV2 plugins for map2-audio

TOOBAMP_VERSION="1.2.71"
ARCH=$(dpkg --print-architecture)

# Download appropriate package
if [ "$ARCH" = "arm64" ]; then
    URL="https://github.com/rerdavies/ToobAmp/releases/download/v${TOOBAMP_VERSION}/toobamp_${TOOBAMP_VERSION}_arm64.deb"
elif [ "$ARCH" = "amd64" ]; then
    URL="https://github.com/rerdavies/ToobAmp/releases/download/v${TOOBAMP_VERSION}/toobamp_${TOOBAMP_VERSION}_amd64.deb"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

# Download and install
wget -O /tmp/toobamp.deb "$URL"
sudo apt-get install -y /tmp/toobamp.deb
rm /tmp/toobamp.deb

# Verify installation
if [ -d "/usr/lib/lv2/ToobAmp.lv2" ]; then
    echo "ToobAmp installed successfully"
else
    echo "ToobAmp installation failed"
    exit 1
fi
```

#### Step 1.2: Integrate with main installer
Update `install-fedora-42.sh` (and create Ubuntu equivalent) to optionally install ToobAmp:
- Add ToobAmp installation as an optional step
- Handle different package managers (apt for Debian/Ubuntu, dnf for Fedora - may need to build from source)

#### Step 1.3: Update plugin config
Update `app/config/default_lv2_effects.json`:
- Correct the plugin paths to match actual ToobAmp bundle location (`/usr/lib/lv2/ToobAmp.lv2/`)
- Add accurate URI mappings based on ToobAmp's actual TTL files

### Phase 2: Build-from-Source Support (For Non-Debian Distros)

**Goal**: Allow building ToobAmp on systems without .deb packages

#### Step 2.1: Create build script
Create `scripts/build-toobamp.sh`:
```bash
#!/bin/bash
# Build ToobAmp from source

# Install prerequisites
sudo dnf install -y \
    cmake ninja-build \
    lv2-devel boost-devel flac-devel zlib-devel dbus-devel \
    cairo-devel pango-devel librsvg2-devel lilv-devel libXrandr-devel

# Clone and build
cd /tmp
git clone --recursive https://github.com/rerdavies/ToobAmp.git
cd ToobAmp
git submodule update --init --recursive
./config.sh
./build.sh
sudo ./install.sh
```

### Phase 3: Plugin Verification & Discovery

**Goal**: Ensure installed plugins are properly discovered

#### Step 3.1: Update plugin scanner
Modify `app/services/plugin_scanner.py`:
- Add ToobAmp-specific path checks
- Verify plugin URIs match expected ToobAmp URIs
- Add logging for missing ToobAmp plugins

#### Step 3.2: Create verification endpoint
Add `/api/plugins/verify-core` endpoint:
- Check which ToobAmp plugins are installed
- Report missing core plugins
- Provide installation instructions

### Phase 4: Default Presets & Chains

**Goal**: Provide working default chains using ToobAmp plugins

#### Step 4.1: Verify default chains
The existing `default_lv2_effects.json` already defines chains:
- Clean Tone
- Rock Distortion
- Lead Guitar
- Practice Setup
- Ambient Soundscape

These need to be tested once ToobAmp is installed.

#### Step 4.2: Add more PiPedal-style presets
Create additional chains based on common guitar setups:
- Metal High Gain
- Blues Crunch
- Acoustic Simulator
- Looper Practice Mode

### Phase 5: Documentation

**Goal**: Document the core plugin system

#### Step 5.1: Update README
Add section on core plugins:
- What plugins are included
- How to install them
- How to verify installation

#### Step 5.2: Create plugin documentation
Document each ToobAmp plugin:
- Parameters and their ranges
- Recommended settings
- Use cases

---

## File Changes Summary

### New Files
| File | Description |
|------|-------------|
| `scripts/install-toobamp.sh` | Debian/Ubuntu ToobAmp installer |
| `scripts/build-toobamp.sh` | Build-from-source script |
| `app/routes/core_plugins.py` | Core plugin verification API |

### Modified Files
| File | Changes |
|------|---------|
| `app/config/default_lv2_effects.json` | Correct URIs and paths |
| `app/services/plugin_scanner.py` | ToobAmp path detection |
| `install-fedora-42.sh` | Add ToobAmp option |

---

## Build Dependencies for ToobAmp

### Debian/Ubuntu
```bash
sudo apt install -y \
    build-essential cmake ninja-build git \
    lv2-dev libboost-iostreams-dev libflac++-dev zlib1g-dev \
    libdbus-1-dev libcairo2-dev libpango1.0-dev \
    catch2 librsvg2-dev liblilv-dev libxrandr-dev
```

### Fedora
```bash
sudo dnf install -y \
    cmake ninja-build gcc-c++ git \
    lv2-devel boost-devel flac-devel zlib-devel \
    dbus-devel cairo-devel pango-devel \
    catch2-devel librsvg2-devel lilv-devel libXrandr-devel
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| ToobAmp version changes break URIs | Pin to specific version, test before updating |
| Build fails on some distros | Provide pre-built packages where possible |
| Large download size (~50MB) | Make ToobAmp installation optional |
| Plugin conflicts with system plugins | Use isolated LV2 path if needed |

---

## Success Criteria

1. Running `scripts/install-toobamp.sh` installs all 26 ToobAmp plugins
2. All plugins appear in `/api/plugins/` endpoint after installation
3. Default chains load without errors
4. TooB NAM plugin can load .nam model files
5. TooB Cab IR plugin can load .wav IR files
6. Plugin parameters are correctly exposed in the UI

---

## Sources

- [PiPedal GitHub](https://github.com/rerdavies/pipedal)
- [ToobAmp GitHub](https://github.com/rerdavies/ToobAmp)
- [PiPedal Documentation](https://rerdavies.github.io/pipedal/)
- [Using TooB NAM](https://rerdavies.github.io/pipedal/UsingNAM.html)
