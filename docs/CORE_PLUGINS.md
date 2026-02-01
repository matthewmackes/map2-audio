# Core Plugins - ToobAmp Integration

MAP2 Audio Platform includes support for the **ToobAmp** plugin collection from the PiPedal project. These 26 high-quality LV2 plugins provide a comprehensive set of guitar effects.

## Quick Start

### Install ToobAmp Plugins

```bash
# Debian/Ubuntu (automatic package install)
bash scripts/install-toobamp.sh

# Fedora/RHEL (build from source)
bash scripts/install-toobamp.sh --build-from-source

# Or use the dedicated build script
bash scripts/build-toobamp.sh --install
```

### Verify Installation

```bash
# Check via API
curl http://localhost:8080/api/core-plugins/status

# Or use lv2ls
lv2ls | grep -i toob
```

## Plugin Categories

### Amp Modeling (Priority: High)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Neural Amp Modeler | `http://two-play.com/plugins/toob-nam` | Neural network amp modeling (NAM) |
| TooB ML Amplifier | `http://two-play.com/plugins/toob-ml` | ML-based amp modeling |

### Cabinet Simulation (Priority: High)
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Cab IR | `http://two-play.com/plugins/toob-cab-ir` | Convolution-based cabinet IR |
| TooB CabSim | `http://two-play.com/plugins/toob-cabsim` | EQ-based cabinet simulation |

### Reverb
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Convolution Reverb | `http://two-play.com/plugins/toob-convolution-reverb` | Convolution reverb (mono/stereo) |
| TooB Freeverb | `http://two-play.com/plugins/toob-freeverb` | Classic Freeverb algorithm |

### EQ & Tone
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Parametric EQ | `http://two-play.com/plugins/toob-peq` | 4-band parametric EQ |
| TooB 3 Band EQ | `http://two-play.com/plugins/toob-3band-eq` | Simple 3-band EQ |
| TooB Tone Stack | `http://two-play.com/plugins/toob-tone-stack` | Fender/Marshall/Baxandall stacks |
| TooB GE-7 | `http://two-play.com/plugins/toob-ge7-eq` | 7-band graphic EQ |

### Modulation
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB CE-2 Chorus | `http://two-play.com/plugins/toob-ce2-chorus` | Boss CE-2 chorus replica |
| TooB BF-2 Flanger | `http://two-play.com/plugins/toob-bf2-flanger` | Boss BF-2 flanger replica |
| TooB Phaser | `http://two-play.com/plugins/toob-phaser` | Phaser effect |
| TooB Tremolo | `http://two-play.com/plugins/toob-tremolo` | Normal/harmonic tremolo |

### Time-Based
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Delay | `http://two-play.com/plugins/toob-delay` | Delay effect |

### Utility
| Plugin | URI | Description |
|--------|-----|-------------|
| TooB Tuner | `http://two-play.com/plugins/toob-tuner` | Guitar tuner |
| TooB Noise Gate | `http://two-play.com/plugins/toob-noise-gate` | Noise gate / slow gear |
| TooB Input Stage | `http://two-play.com/plugins/toob-input-stage` | Input conditioning |
| TooB Volume | `http://two-play.com/plugins/toob-volume` | Level adjustment |
| TooB Mix | `http://two-play.com/plugins/toob-mix` | Stereo channel mixer |
| TooB Spectrum Analyzer | `http://two-play.com/plugins/toob-spectrum-analyzer` | Spectrum display |
| TooB 4Looper | `http://two-play.com/plugins/toob-4looper` | 4-track looper |
| TooB One-Button Looper | `http://two-play.com/plugins/toob-one-button-looper` | MIDI-controlled looper |

## Default Preset Chains

The following preset chains are included and use ToobAmp plugins:

| Chain | Description | Plugins |
|-------|-------------|---------|
| Clean Tone | Clean guitar with subtle effects | Noise Gate → 3-Band EQ → CE-2 Chorus → Delay → Freeverb |
| Rock Distortion | Classic rock amp tone | Noise Gate → ML Amp → Tone Stack → CabSim → Delay |
| Lead Guitar | High-gain lead tone | Noise Gate → NAM → Parametric EQ → Delay → Convolution Reverb |
| Metal High Gain | Heavy metal tone | Noise Gate → NAM → Parametric EQ → Cab IR → Noise Gate |
| Blues Crunch | Warm bluesy overdrive | Input Stage → ML Amp → Tone Stack → CabSim → Tremolo → Freeverb |
| Jazz Clean | Warm, clean jazz | Input Stage → 3-Band EQ → CE-2 Chorus → Room Reverb |
| 80s Rock | Classic 80s rock | Noise Gate → ML Amp → Tone Stack → CabSim → CE-2 Chorus → Delay |
| Practice Setup | Practice with tuner | Tuner → 3-Band EQ → Volume |
| Looper Practice | Loop-based practice | Tuner → Noise Gate → 3-Band EQ → 4Looper → Volume |

## API Endpoints

### Check Status
```bash
GET /api/core-plugins/status
```

Returns installation status of all ToobAmp plugins.

### Verify Installation
```bash
GET /api/core-plugins/verify
```

Returns detailed verification report with installation instructions if plugins are missing.

### Get Categories
```bash
GET /api/core-plugins/categories
```

Returns plugins grouped by category.

### Trigger Installation
```bash
POST /api/core-plugins/install
```

Triggers ToobAmp installation in the background.

### Refresh Cache
```bash
POST /api/core-plugins/refresh-cache
```

Clears and refreshes the plugin cache to detect newly installed plugins.

## Using NAM Models

TooB Neural Amp Modeler requires `.nam` model files. Download models from:

- **ToneHunt**: https://tonehunt.org
- **Tone3000**: https://tone3000.com

Place model files in:
```
~/.map2/nam_models/
```

## Using Impulse Responses

TooB Cab IR and TooB Convolution Reverb use `.wav` IR files.

### Cabinet IRs
Place cabinet IR files in:
```
~/.map2/ir_files/cabinets/
```

### Reverb IRs
Place reverb IR files in:
```
~/.map2/ir_files/reverbs/
```

## Build Dependencies

### Fedora/RHEL
```bash
sudo dnf install -y cmake ninja-build gcc-c++ git \
    lv2-devel boost-devel flac-devel zlib-devel \
    dbus-devel cairo-devel pango-devel \
    librsvg2-devel lilv-devel libXrandr-devel
```

### Debian/Ubuntu
```bash
sudo apt install -y build-essential cmake ninja-build git \
    lv2-dev libboost-iostreams-dev libflac++-dev zlib1g-dev \
    libdbus-1-dev libcairo2-dev libpango1.0-dev \
    catch2 librsvg2-dev liblilv-dev libxrandr-dev
```

## Troubleshooting

### Plugins not showing up
1. Restart the MAP2 backend: `sudo systemctl restart map2-backend`
2. Refresh the plugin cache: `curl -X POST http://localhost:8080/api/core-plugins/refresh-cache`
3. Check LV2 paths: `curl http://localhost:8080/api/core-plugins/lv2-paths`

### Build failures
- Ensure all build dependencies are installed
- Check CMake version (3.16+ required)
- Try with verbose output: `./build.sh 2>&1 | tee build.log`

### NAM models not loading
- Check file format (must be `.nam` files)
- Verify file permissions
- Check logs: `journalctl -u map2-backend -f`

## References

- [ToobAmp GitHub](https://github.com/rerdavies/ToobAmp)
- [PiPedal Project](https://github.com/rerdavies/pipedal)
- [PiPedal Documentation](https://rerdavies.github.io/pipedal/)
- [ToneHunt NAM Models](https://tonehunt.org)
