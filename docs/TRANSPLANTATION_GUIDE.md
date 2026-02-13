# MAP2 Audio Platform — Complete Transplantation / Reinstallation Guide

> **Version:** 3.0.0-FEB2026  
> **Target OS:** Fedora Server 42+ (primary), Debian/Ubuntu, Arch Linux  
> **Target Latency:** < 3 ms round-trip (audio mode)  
> **Last Updated:** 2026-02-08  

---

## Table of Contents

1. [Inventory — External System Packages](#1-inventory--external-system-packages)
2. [Inventory — Python Packages](#2-inventory--python-packages)
3. [Inventory — Node.js / npm Packages](#3-inventory--nodejs--npm-packages)
4. [Inventory — JUCE Modules & C++ Dependencies](#4-inventory--juce-modules--c-dependencies)
5. [Inventory — Third-Party Assets](#5-inventory--third-party-assets)
6. [Build & Dependency Installation](#6-build--dependency-installation)
7. [System Configuration & Tuning](#7-system-configuration--tuning)
8. [Directory Structure & File Placement](#8-directory-structure--file-placement)
9. [One-Command Fresh Install Script](#9-one-command-fresh-install-script)
10. [Verification Checklist](#10-verification-checklist)

---

## 1. Inventory — External System Packages

### 1.1 Fedora (DNF) — Primary Target

```
# Build tools
gcc gcc-c++ make cmake ninja-build git curl wget
pkg-config autoconf automake libtool

# Python
python3 python3-devel python3-pip python3-wheel python3-venv

# Audio subsystem (PipeWire + JACK compat + ALSA)
pipewire pipewire-devel
pipewire-jack-audio-connection-kit pipewire-jack-audio-connection-kit-devel
pipewire-alsa pipewire-pulseaudio pipewire-utils
jack-audio-connection-kit jack-audio-connection-kit-devel
alsa-lib alsa-lib-devel alsa-utils alsa-plugins-jack
rtkit

# LV2 / plugin ecosystem
lv2 lv2-devel
lilv lilv-devel
suil suil-devel
sratom sratom-devel
sord sord-devel
serd serd-devel

# DSP / multimedia libraries
libsndfile libsndfile-devel
fftw fftw-devel
libsamplerate libsamplerate-devel
portaudio portaudio-devel

# System libraries
sqlite sqlite-devel
systemd-devel
avahi avahi-devel avahi-tools
dbus-devel
libcurl-devel
openssl-devel

# X11/GUI libraries (required by JUCE even for headless)
freetype freetype-devel
libX11-devel libXext-devel libXrandr-devel libXinerama-devel libXcursor-devel
mesa-libGL-devel
libxkbcommon-devel
gtk3-devel
webkit2gtk4.1-devel  # optional, JUCE web browser module

# Node.js
nodejs npm

# Utilities
htop iotop lsof net-tools jq irqbalance tuned dialog
```

### 1.2 Debian/Ubuntu (APT)

```
build-essential cmake ninja-build git curl wget pkg-config
python3 python3-dev python3-pip python3-venv
libasound2-dev libjack-jackd2-dev
pipewire pipewire-jack pipewire-alsa
lv2-dev liblilv-dev libsuil-dev libserd-dev libsord-dev libsratom-dev
libsndfile1-dev libfftw3-dev libsamplerate0-dev portaudio19-dev
sqlite3 libsqlite3-dev libsystemd-dev
avahi-daemon libavahi-client-dev
libfreetype6-dev libx11-dev libxext-dev libxrandr-dev libxinerama-dev libxcursor-dev
libgl1-mesa-dev libgtk-3-dev libwebkit2gtk-4.1-dev
nodejs npm
```

### 1.3 Arch Linux (Pacman)

```
base-devel cmake ninja git curl wget pkg-config
python python-pip python-virtualenv
pipewire pipewire-jack pipewire-alsa
jack2 alsa-lib alsa-utils
lv2 lilv suil serd sord sratom
libsndfile fftw libsamplerate portaudio
sqlite systemd avahi
freetype2 libx11 libxext libxrandr libxinerama libxcursor
mesa gtk3 webkit2gtk
htop lsof jq nodejs npm
```

---

## 2. Inventory — Python Packages

### 2.1 Core Runtime (required)

| Package | Min Version | Purpose |
|---------|-------------|---------|
| fastapi | ≥ 0.104.0 | REST API framework |
| uvicorn[standard] | ≥ 0.24.0 | ASGI server |
| pydantic | ≥ 2.5.0 | Data validation |
| sqlalchemy | ≥ 2.0.0 | Database ORM |
| aiosqlite | ≥ 0.19.0 | Async SQLite driver |
| python-multipart | ≥ 0.0.6 | File upload support |
| httpx | ≥ 0.25.0 | Async HTTP client |
| psutil | ≥ 5.9.0 | System monitoring |
| numpy | ≥ 1.24.0 | Numerical computing |
| scipy | ≥ 1.11.0 | Signal processing |
| sounddevice | ≥ 0.4.6 | Audio I/O (Python fallback) |
| mido | ≥ 1.3.0 | MIDI protocol |
| textual | ≥ 0.46.0 | Terminal UI framework |
| aiohttp | ≥ 3.9.0 | Async HTTP (cluster) |
| aiofiles | ≥ 23.0 | Async file I/O |
| websockets | ≥ 12.0 | WebSocket support |
| zeroconf | ≥ 0.131.0 | mDNS peer discovery |
| pybind11 | ≥ 2.11.0 | C++ ↔ Python bindings |
| pillow | ≥ 10.0.0 | Image processing |
| rich | ≥ 13.0.0 | Terminal formatting |
| python-jose | ≥ 3.3.0 | JWT tokens |
| passlib | ≥ 1.7.4 | Password hashing |
| bcrypt | ≥ 4.0.0 | Bcrypt hashing |

### 2.2 Development/Testing (optional)

| Package | Min Version | Purpose |
|---------|-------------|---------|
| pytest | ≥ 7.0.0 | Test framework |
| pytest-asyncio | ≥ 0.21.0 | Async test support |
| black | ≥ 23.0.0 | Code formatter |
| ruff | ≥ 0.1.0 | Linter |
| isort | ≥ 5.12.0 | Import sorter |

### 2.3 No Cargo/Rust dependencies

The project has **zero** Rust/Cargo dependencies.

---

## 3. Inventory — Node.js / npm Packages

### 3.1 Web Frontend (`web/package.json`)

**Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.0.0 | UI framework |
| react-dom | ^19.0.0 | React DOM renderer |
| react-router-dom | ^6.28.0 | Client-side routing |
| @tanstack/react-query | ^5.59.0 | Server state management |
| @mui/material | ^6.5.0 | Material UI components |
| @mui/icons-material | ^6.5.0 | Material icons |
| @emotion/react | ^11.14.0 | CSS-in-JS |
| @emotion/styled | ^11.14.1 | Styled components |
| reactflow | ^11.11.4 | Node graph editor |
| recharts | ^3.7.0 | Charts/visualization |
| dagre | ^0.8.5 | Graph layout |
| lucide-react | ^0.460.0 | Icons |
| react-hook-form | ^7.53.0 | Form management |
| react-window | ^1.8.11 | Virtualized lists |
| react-markdown | ^10.1.0 | Markdown rendering |
| class-variance-authority | ^0.7.0 | CSS utility |
| clsx | ^2.1.1 | Class merging |
| tss-react | ^4.9.15 | MUI styling |
| @fontsource/roboto | ^5.1.1 | Roboto font |

**Dev Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^6.4.1 | Build tool |
| @vitejs/plugin-react | ^4.3.4 | React plugin for Vite |
| typescript | ~5.7.2 | TypeScript compiler |
| eslint | ^9.19.0 | Linter |
| vite-plugin-svgr | ^4.3.0 | SVG as React components |

### 3.2 Root-level (`package.json`) — Testing only

jest ^30.2.0, @testing-library/react ^16.3.1, @babel/preset-* etc.

---

## 4. Inventory — JUCE Modules & C++ Dependencies

### 4.1 JUCE Framework

- **Version:** 8.0.0
- **Source:** Fetched via CMake `FetchContent` from `https://github.com/juce-framework/JUCE.git`
- **Modules used:**
  - `juce_audio_basics`
  - `juce_audio_devices`
  - `juce_audio_formats`
  - `juce_audio_processors`
  - `juce_audio_utils`
  - `juce_core`
  - `juce_data_structures`
  - `juce_dsp`
  - `juce_events`

### 4.2 Neural Amp Modeler Core (NAM)

- **Source:** Git submodule at `juce-engine/Modules/NeuralAmpModelerCore`
- **URL:** `https://github.com/sdatkinson/NeuralAmpModelerCore.git`
- **Branch:** main
- **Dependencies shipped within NAM:**
  - Eigen (header-only linear algebra)
  - nlohmann/json (header-only JSON)

### 4.3 pybind11

- **Version:** 2.11.1 (fallback via FetchContent)
- **Primary:** Python pip package, CMake integration

### 4.4 C++ Build Flags (Release/Low-Latency)

```
-march=native          # SIMD: use best available CPU instructions
-ffast-math            # Relaxed floating-point for DSP performance
-O3 -DNDEBUG           # Full optimization
CMAKE_BUILD_TYPE=Release (forced)
```

### 4.5 Custom DSP Processors (37 source files)

The engine includes custom implementations of:
- Eventide--IN-STYLE H9, H3000 multi-effects
- Peavey 5150 Block Letter amp sim
- Tweed Bassman 5F6-A amp sim
- PassionFX (Steve Vai Passion & Warfare)
- Boss XS-1 Poly Shifter
- IntelliFX 8-Voice Chorus
- ShoeGaze multi-effect
- LexiLove reverb
- Circular Delay, Chorus, Phaser, Pitch Shifter
- Convolution, Dynamics, Filter processors
- Spectrum Analyzer, LUFS Meter, Phase Correlation
- NAM Processor (neural amp modeling)

---

## 5. Inventory — Third-Party Assets

### 5.1 NAM Models

- **User directory:** `~/.local/share/map2/nam`
- **System directory:** `/var/lib/map2/nam`
- **Extra scan paths:** `~/NAM`, `~/NAM/models`, `~/nam`, `~/.local/share/NAM`, `/usr/share/map2/nam`, `~/Documents/NAM`, `~/Downloads/NAM`
- **Format:** `.nam` files (JSON + weights)
- **Not shipped with repo** — user must provide their own models

### 5.2 Impulse Responses (IRs)

- **User directory:** `~/.local/share/map2/ir/cabinets`, `~/.local/share/map2/ir/reverbs`, `~/.local/share/map2/ir/user`
- **System directory:** `/var/lib/map2/ir`, `/var/lib/map2/ir/downloads`
- **Extra scan paths:** `~/Impulses`, `~/IRs`, `/usr/share/map2/ir`, `/usr/share/impulses`
- **Format:** `.wav` files
- **Not shipped with repo** — user must provide their own IRs

### 5.3 SoundFonts

- **User directory:** `~/.local/share/map2/soundfonts`
- **System directory:** `/var/lib/map2/soundfonts`
- **Format:** `.sf2` files

### 5.4 LV2 Plugins (External)

- **ToobAmp** (optional, 26 plugins): built from source via `scripts/build-toobamp.sh`
- Standard LV2 paths: `/usr/lib64/lv2`, `/usr/lib/lv2`, `~/.lv2`

### 5.5 Branding Assets

- `MACKESAUDIOPLATFORM.png` — platform logo (shipped in repo)
- `branding/` — Plymouth boot splash theme

---

## 6. Build & Dependency Installation

### 6.1 Complete Build Commands (Fedora 42)

```bash
# Step 1: System packages
sudo dnf update -y
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y gcc gcc-c++ make cmake ninja-build git curl wget \
    pkg-config python3 python3-devel python3-pip python3-venv \
    pipewire pipewire-devel pipewire-jack-audio-connection-kit \
    pipewire-jack-audio-connection-kit-devel pipewire-alsa pipewire-utils \
    jack-audio-connection-kit jack-audio-connection-kit-devel \
    alsa-lib alsa-lib-devel alsa-utils rtkit \
    lv2 lv2-devel lilv lilv-devel suil suil-devel \
    sratom sratom-devel sord sord-devel serd serd-devel \
    libsndfile libsndfile-devel fftw fftw-devel \
    libsamplerate libsamplerate-devel portaudio portaudio-devel \
    sqlite sqlite-devel systemd-devel avahi avahi-devel avahi-tools \
    freetype freetype-devel libX11-devel libXext-devel libXrandr-devel \
    libXinerama-devel libXcursor-devel mesa-libGL-devel \
    libxkbcommon-devel gtk3-devel nodejs npm irqbalance jq htop

# Step 2: Clone repository
git clone --recursive https://github.com/matthewmackes/map2-audio.git ~/map2-audio
cd ~/map2-audio

# Step 3: Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install fastapi "uvicorn[standard]" pydantic sqlalchemy aiosqlite \
    python-multipart httpx psutil numpy scipy sounddevice mido \
    textual aiohttp aiofiles websockets zeroconf pybind11 pillow rich \
    python-jose passlib bcrypt

# Step 4: Web frontend
cd web
npm ci
npm run build
cd ..

# Step 5: JUCE engine (C++)
cd juce-engine/build
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DENABLE_NATIVE_OPTIMIZATIONS=ON \
    -DENABLE_FAST_MATH=ON \
    -DUSE_JUCE_AUDIO=ON \
    -DUSE_NAM=ON \
    -DJUCE_PLUGINHOST_LV2=ON \
    -DJUCE_PLUGINHOST_LADSPA=ON \
    -DPython3_EXECUTABLE="$(which python3)" \
    -DCMAKE_PREFIX_PATH="$(python3 -c 'import pybind11; print(pybind11.get_cmake_dir())')" \
    -G Ninja
cmake --build . --config Release -- -j$(nproc)
cd ../..

# Step 6: Verify
python3 -c "import fastapi, uvicorn, sqlalchemy, numpy, textual; print('OK')"
ls juce-engine/build/map2_audio_engine*.so
```

### 6.2 No DKMS Modules or Custom Kernels Required

The platform uses the stock kernel with command-line parameters only. No custom kernel builds or DKMS modules are needed.

---

## 7. System Configuration & Tuning

### 7.1 `/etc/security/limits.d/99-map2-audio-realtime.conf`

```
@audio   -  rtprio     95
@audio   -  nice       -19
@audio   -  memlock    unlimited
```

### 7.2 `/etc/sysctl.d/91-map2-audio-rt.conf` — RT Scheduling Budget

```
kernel.sched_rt_runtime_us = 2950000
kernel.sched_rt_period_us = 3000000
kernel.sched_deadline_period_us = 3000000
kernel.sched_deadline_runtime_us = 2950000
kernel.sched_autogroup_enabled = 0
```

### 7.3 `/etc/sysctl.d/92-map2-audio-thp.conf` — Transparent Huge Pages

```
vm.transparent_hugepage = never
mm.transparent_hugepage.enabled = never
mm.transparent_hugepage.defrag = never
mm.transparent_hugepage.khugepaged.enabled = 0
vm.page-cluster = 0
vm.overcommit_ratio = 50
vm.max_map_count = 262144
kernel.sched_migration_cost_ns = 500000
```

### 7.4 `/etc/sysctl.d/93-map2-audio-swappiness.conf` — Swap Disabled

```
vm.swappiness = 0
vm.oom_kill_allocating_task = 1
vm.oom_dump_tasks = 0
vm.panic_on_oom = 0
vm.dirty_ratio = 20
vm.dirty_background_ratio = 10
vm.dirty_expire_centisecs = 3000
vm.zone_reclaim_mode = 0
vm.compact_memory = 0
vm.compaction_proactiveness = 0
```

### 7.5 `/etc/sysctl.d/94-map2-audio-watchdog.conf` — Watchdog Disabled

```
kernel.nmi_watchdog = 0
kernel.softlockup_panic = 0
kernel.softlockup_panic_all_cpu = 0
kernel.hung_task_timeout_secs = 0
kernel.hung_task_panic = 0
kernel.panic_on_oops = 0
kernel.panic_on_unrecovered_nmi = 0
kernel.printk_ratelimit = 0
kernel.printk_ratelimit_burst = 1
```

### 7.6 `/etc/default/grub.d/20-map2-audio-latency.cfg` — GRUB Kernel Parameters

```
GRUB_CMDLINE_LINUX_DEFAULT="isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs skew_tick=1 nmi_watchdog=0 audit=0 idle=nomwait pci=nomsi"
```

> ⚠️ **REQUIRES REBOOT** after `grub2-mkconfig -o /boot/grub2/grub.cfg`

### 7.7 `/etc/default/irqbalance` — IRQ Balance

```
IRQBALANCE_BANNED_CPUS=0x30
IRQBALANCE_POLLING_INTERVAL=10
```

### 7.8 `/etc/modprobe.d/map2-audio-usb.conf` — USB Audio

```
options usbcore autosuspend=-1
options snd_usb_audio nrpacks=1
```

### 7.9 `/etc/udev/rules.d/60-map2-ioschedulers.rules` — I/O Scheduler

```
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/scheduler}="deadline"
ACTION=="add|change", KERNEL=="nvme[0-9]n[0-9]", ATTR{queue/scheduler}="mq-deadline"
```

### 7.10 PipeWire Configuration

**File:** `~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf`

```
context.properties = {
    default.clock.rate = 48000
    default.clock.allowed-rates = [ 48000 ]
    default.clock.min-quantum = 64
    default.clock.quantum = 64
}
```

### 7.11 `/etc/guitarfx-mode.conf` — Operating Mode

```
MODE=audio
```

### 7.12 `/etc/map2/environment`

```
MAP2_DEPLOYMENT_MODE=AUDIO-NODE
```

### 7.13 systemd Services Created

| Service File | Description |
|---|---|
| `map2-backend.service` | Main FastAPI backend (uvicorn on port 8080) |
| `map2-boot-manager.service` | Boot-time initialization (oneshot) |
| `map2-system-check.service` | System health check (oneshot) |
| `map2-cpu-governor.service` | Set CPU governor to performance (oneshot) |
| `map2-disable-turbo.service` | Disable CPU turbo boost (oneshot) |
| `map2-verify-isolation.service` | Verify CPU isolation at boot (oneshot) |
| `map2-lcd.service` | LCD display driver (optional HW) |
| `map2-lcd-boot.service` | LCD boot splash (optional HW) |
| `map2-port80-proxy.service` | Port 80 → 8080 proxy |
| `map2-pipedal-test.service` | PipeDal engine boot test |

### 7.14 systemd Drop-In Overrides

| Drop-In Path | Purpose |
|---|---|
| `/etc/systemd/system/map2-backend.service.d/10-mode.conf` | Mode-specific tuning (audio/all-in-one/management) |
| `/etc/systemd/user@.service.d/pipewire-affinity.conf` | Pin PipeWire to housekeeping cores 0-3 |
| `/etc/systemd/journald.conf.d/map2-audio.conf` | Volatile journal (no disk I/O) |

---

## 8. Directory Structure & File Placement

### 8.1 Complete Target Directory Map

```
/home/mm/map2-audio/                    ← Main repository root
├── app/                                ← Python FastAPI backend
│   ├── main.py                         ← Application entry point
│   ├── config.py                       ← Configuration manager
│   ├── paths.py                        ← Storage path management
│   ├── routes/                         ← 95 API route modules
│   ├── services/                       ← 99 service modules
│   │   └── cluster/                    ← Cluster management services
│   ├── middleware/                      ← Request logging, rate limiting
│   ├── deployment/                     ← Deployment configuration
│   ├── drivers/                        ← Hardware drivers
│   ├── db/                             ← Database migrations
│   └── lcd_models/                     ← LCD display models
├── juce-engine/                        ← C++ JUCE audio engine
│   ├── CMakeLists.txt                  ← Build configuration
│   ├── Source/                         ← 74 C++ source/header files
│   ├── Modules/
│   │   └── NeuralAmpModelerCore/       ← NAM git submodule
│   └── build/
│       └── map2_audio_engine*.so       ← Built Python extension module
├── web/                                ← React/Vite web frontend
│   ├── src/                            ← TypeScript source
│   ├── dist/                           ← Production build output
│   └── package.json                    ← Node.js dependencies
├── tui/                                ← Textual terminal UI
│   ├── app.py                          ← TUI entry point
│   ├── screens/                        ← TUI screen modules
│   ├── components/                     ← TUI widget components
│   ├── widgets/                        ← Custom widgets
│   ├── styles/                         ← CSS styles
│   └── node_console/                   ← Headless node TUI
├── lcd/                                ← LCD display subsystem
├── services/                           ← Standalone service scripts
├── scripts/                            ← Utility/setup scripts
│   ├── map2-mode.sh                    ← Mode manager (574 lines)
│   ├── setup_realtime.sh               ← RT optimization setup
│   ├── build-toobamp.sh                ← ToobAmp LV2 plugin builder
│   ├── install-service.sh              ← systemd service installer
│   ├── install-node.sh                 ← Cluster node installer (TUI)
│   └── dev/
│       └── build-tune.sh              ← Dev/stage mode switching
├── systemd/                            ← systemd unit files
│   ├── map2-backend.service
│   ├── map2-boot-manager.service
│   ├── map2-lcd.service
│   ├── map2-lcd-boot.service
│   ├── map2-system-check.service
│   ├── map2-port80-proxy.service
│   ├── map2-pipedal-test.service
│   └── modes/
│       ├── audio.conf                  ← Audio mode drop-in
│       ├── all-in-one.conf             ← All-in-one mode drop-in
│       └── management.conf             ← Management mode drop-in
├── config/                             ← Configuration templates
│   ├── cluster.conf.template
│   ├── bash-completion/
│   └── prometheus.yml
├── packaging/                          ← RPM packaging
│   ├── map2-audio.spec
│   ├── build-rpm.sh
│   └── systemd/                        ← Packaged service files
├── branding/                           ← Plymouth boot splash
├── data/                               ← Runtime data (SQLite DB)
│   └── map2.db
├── logs/                               ← Application logs
├── .venv/                              ← Python virtual environment
├── .map2-aliases                       ← Shell aliases
├── map2.sh                             ← Master control script
├── m2.sh                               ← Quick access shortcuts
├── tui.sh                              ← TUI launcher
└── install_on_new_host.sh              ← THIS SCRIPT
```

### 8.2 System-Level File Placement

```
/etc/sysctl.d/
├── 91-map2-audio-rt.conf
├── 92-map2-audio-thp.conf
├── 93-map2-audio-swappiness.conf
└── 94-map2-audio-watchdog.conf

/etc/default/
├── grub.d/20-map2-audio-latency.cfg
└── irqbalance

/etc/security/limits.d/
└── 99-map2-audio-realtime.conf

/etc/modprobe.d/
└── map2-audio-usb.conf

/etc/udev/rules.d/
└── 60-map2-ioschedulers.rules

/etc/guitarfx-mode.conf
/etc/map2/environment

/etc/systemd/system/
├── map2-backend.service
├── map2-boot-manager.service
├── map2-system-check.service
├── map2-cpu-governor.service
├── map2-disable-turbo.service
├── map2-verify-isolation.service
├── map2-lcd.service
├── map2-lcd-boot.service
├── map2-port80-proxy.service
├── map2-backend.service.d/
│   └── 10-mode.conf
├── user@.service.d/
│   └── pipewire-affinity.conf
└── ...

/etc/systemd/journald.conf.d/
└── map2-audio.conf

/usr/local/bin/
├── map2-mode                           ← Mode manager symlink
└── map2-verify-isolation.sh            ← CPU isolation verifier

/home/mm/.config/pipewire/pipewire.conf.d/
└── 99-map2-audio-latency.conf

/home/mm/.map2/                         ← User config directory
├── config.json
├── data/
└── deployment.json

/home/mm/.local/share/map2/             ← User data directory
├── nam/                                ← NAM models
├── ir/
│   ├── cabinets/
│   ├── reverbs/
│   └── user/
└── soundfonts/

/var/lib/map2/                          ← System data directory
├── nam/
├── ir/
│   └── downloads/
└── soundfonts/
```

---

## 9. One-Command Fresh Install Script

The complete install script is located at:

```
/home/mm/map2-audio/install_on_new_host.sh
```

### Usage

```bash
# Full installation (interactive, prompts for reboot)
sudo bash install_on_new_host.sh

# Set specific mode
sudo bash install_on_new_host.sh --mode audio
sudo bash install_on_new_host.sh --mode all-in-one
sudo bash install_on_new_host.sh --mode management

# Dry run (preview only)
sudo bash install_on_new_host.sh --dry-run

# Skip reboot prompt
sudo bash install_on_new_host.sh --skip-reboot

# Different user
sudo bash install_on_new_host.sh --user myuser
```

### What the Script Does (18 Phases)

| Phase | Description |
|-------|-------------|
| 0 | Pre-flight checks (root, user, distro, disk, internet) |
| 1 | Install all OS packages (distro-detected) |
| 2 | User configuration & real-time privileges |
| 3 | Clone/update git repository + submodules |
| 4 | Python venv + all pip packages |
| 5 | Node.js + web frontend build |
| 6 | JUCE C++ audio engine CMake build |
| 7 | Directory structure creation |
| 8 | sysctl.d configuration (4 files) |
| 9 | GRUB kernel parameters (⚡ REBOOT) |
| 10 | IRQ balance configuration |
| 11 | USB audio optimization + I/O scheduler |
| 12 | PipeWire low-latency configuration |
| 13 | systemd services installation (10 services) |
| 14 | Mode configuration (/etc/guitarfx-mode.conf) |
| 15 | Enable & start services |
| 16 | Shell aliases & convenience scripts |
| 17 | Firewall configuration |
| 18 | Installation verification |

---

## 10. Verification Checklist

Run this checklist on the new host **after reboot** to confirm 100% success.

### 10.1 Kernel & CPU Isolation

```bash
# ✅ Check kernel parameters are active
cat /proc/cmdline | grep -o "isolcpus=4,5"
cat /proc/cmdline | grep -o "nohz_full=4,5"
cat /proc/cmdline | grep -o "rcu_nocbs=4,5"
cat /proc/cmdline | grep -o "threadirqs"

# ✅ Run verification script
/usr/local/bin/map2-verify-isolation.sh --verbose
```

### 10.2 sysctl Values

```bash
# ✅ RT scheduling
sysctl kernel.sched_rt_runtime_us   # → 2950000
sysctl kernel.sched_rt_period_us    # → 3000000

# ✅ Memory
sysctl vm.swappiness                 # → 0
sysctl kernel.nmi_watchdog           # → 0

# ✅ THP disabled
cat /sys/kernel/mm/transparent_hugepage/enabled   # → [never]
```

### 10.3 CPU Governor

```bash
# ✅ All CPUs at performance
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor   # → performance
```

### 10.4 PipeWire & Audio

```bash
# ✅ PipeWire running
systemctl --user status pipewire.service

# ✅ Quantum and rate
pw-metadata -n settings | grep clock.quantum      # → 64
pw-metadata -n settings | grep clock.rate          # → 48000

# ✅ JACK library is PipeWire
ldconfig -p | grep libjack.so.0                    # → pipewire path
```

### 10.5 Services

```bash
# ✅ Backend running
systemctl status map2-backend.service
curl -s http://localhost:8080/api/health | jq .

# ✅ All services enabled
for svc in map2-backend map2-boot-manager map2-cpu-governor map2-verify-isolation map2-disable-turbo; do
    echo "$svc: $(systemctl is-enabled ${svc}.service)"
done
```

### 10.6 Application

```bash
# ✅ Python imports
source ~/map2-audio/.venv/bin/activate
python3 -c "import fastapi, uvicorn, sqlalchemy, numpy, textual; print('All imports OK')"

# ✅ JUCE engine
python3 -c "import sys; sys.path.insert(0, 'juce-engine/build'); import map2_audio_engine; print('JUCE engine OK')"

# ✅ Web UI served
curl -s http://localhost:8080/ | head -5

# ✅ API docs
curl -s http://localhost:8080/docs | head -5
```

### 10.7 Mode Verification

```bash
# ✅ Mode consistent across all stores
map2-mode status
map2-mode verify
```

### 10.8 Latency Test

```bash
# ✅ Measure actual round-trip latency
# Option A: PipeWire native
pw-top   # Check quantum=64 → theoretical 1.33ms per buffer at 48kHz

# Option B: JACK (via PipeWire JACK compat)
jack_iodelay   # Should report < 3ms total

# Theoretical minimum:
#   64 samples / 48000 Hz = 1.33 ms per buffer
#   2 buffers (in + out) = 2.67 ms
#   With USB overhead: ~2.8-3.0 ms total
```

### 10.9 Quick Health Summary

```bash
# Run the built-in validation suite
cd ~/map2-audio
bash validate-fixes.sh
```

---

## ⚠️ Warnings

1. **REBOOT REQUIRED** — Kernel parameters (`isolcpus`, `nohz_full`, etc.) require a full system reboot
2. **LOG OUT REQUIRED** — Audio group membership requires logout/login
3. **Desktop Audio** — The `isolcpus=4,5` parameter will remove cores 4-5 from general use. If this is also a desktop machine, normal apps will only see cores 0-3
4. **Journald Volatile** — The journald configuration sets `Storage=volatile`, meaning logs are lost on reboot. This is intentional for audio latency but may be undesirable for debugging. Disable by removing `/etc/systemd/journald.conf.d/map2-audio.conf`
5. **Swap Disabled** — `vm.swappiness=0` means the system will prefer OOM-killing over swapping. Ensure sufficient RAM (recommended: 8GB+ for audio mode)
6. **Turbo Boost Disabled** — Reduces maximum single-core performance but eliminates frequency-scaling jitter

---

## Quick Reference: rsync from Existing Host

If you want to transplant from an existing host rather than clone from git:

```bash
# From the SOURCE host, to the NEW host:
rsync -avz --progress \
    --exclude='.venv' \
    --exclude='node_modules' \
    --exclude='juce-engine/build' \
    --exclude='web/dist' \
    --exclude='*.pyc' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='logs/*' \
    --exclude='data/*.db*' \
    /home/mm/map2-audio/ \
    newhost:/home/mm/map2-audio/

# Then on the NEW host:
cd /home/mm/map2-audio
sudo bash install_on_new_host.sh
```

---

*End of Transplantation Guide*
