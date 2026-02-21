---
name: build-installer-rpm
description: Build a production-grade MAP2 Audio Platform installer RPM. Creates a clean build workspace outside the source repository, improves packaging artifacts inside the repo (spec, .gitattributes, config files, map2-setup wizard), then runs rpmbuild and produces a distributable RPM. The original source repository is never deleted from, restructured, or broken.
---

# Build Installer RPM — MAP2 Audio Platform

## Absolute Constraints

- **NEVER delete, move, or rename any file inside `/home/mm/map2-audio/`**.
- **NEVER modify any file under `app/`, `juce-engine/Source/`, `web/src/`, or `tui/`**.
- All build artifacts, rpmbuild trees, and intermediate files go to `~/map2-rpm-build/` (outside the repo).
- Changes inside the repo are limited to: `packaging/`, `.gitattributes`, and new files in `packaging/config/` and `packaging/scripts/`. These are purely additive.
- Do not run `rpmbuild` inside the source repo directory.

---

## Canonical Sources of Truth

Before writing any packaging file, read these two files in the source repo. They are the authoritative definitions of what packages, checks, and configuration steps the platform requires. Do not invent package names or skip steps — derive them from these files.

| File | What it defines |
|---|---|
| `install_on_new_host.sh` | Pre-flight checks (root, disk space, internet, distro), `--dry-run`/`--mode`/`--skip-reboot` flags, bootstrap flow |
| `app/services/backup_service.py` | `STANDALONE_REBUILD_SCRIPT` constant (line ~746) — canonical `DNF_PACKAGES`, `DNF_OPTIONAL_PACKAGES`, and `PYTHON_PACKAGES` lists; full system configuration sequence |

The spec's `Requires:` block must match `DNF_PACKAGES` from `STANDALONE_REBUILD_SCRIPT`. The `map2-setup` wizard's pre-flight checks and CLI flags must match `install_on_new_host.sh`. If those source files and the packaging files ever disagree, the source files win.

---

## Overview

This skill executes five phases in order. Each phase depends on the previous completing without error. Do not skip phases or reorder them.

```
Phase 0 → Read canonical sources (install_on_new_host.sh + STANDALONE_REBUILD_SCRIPT)
Phase 1 → .gitattributes export-ignore rules (in repo, additive)
Phase 2 → New/improved packaging files (in repo, under packaging/)
Phase 3 → Build workspace setup + git archive tarball (outside repo)
Phase 4 → rpmbuild execution (outside repo)
Phase 5 → Verification and summary
```

---

## Phase 1: Add `.gitattributes` Export-Ignore Rules

File to modify: `/home/mm/map2-audio/.gitattributes` (create if it does not exist).

Append the following block. Do not remove any existing lines. If a line already exists, skip it.

```
# RPM packaging: files excluded from git archive (export-ignore)
docs/                   export-ignore
tests/                  export-ignore
.codex/                 export-ignore
.github/                export-ignore
.gemini/                export-ignore
scripts/dev/            export-ignore
scripts/ai_*.md         export-ignore
scripts/*_plan.md       export-ignore
scripts/benchmark-*.py  export-ignore
scripts/migrate_*.py    export-ignore
scripts/import_*.py     export-ignore
scripts/debug_setup.sh  export-ignore
*.disabled              export-ignore
web/node_modules/       export-ignore
juce-engine/build/      export-ignore
packaging/build-rpm.sh  export-ignore
```

**Why:** `git archive` respects these attributes. The build tarball will contain only production-relevant files. No manual deletion is needed.

---

## Phase 2: Create/Overwrite Packaging Artifacts in Repo

All files in this phase are written to `/home/mm/map2-audio/packaging/`. Read the existing files first before overwriting to confirm current state.

### 2a. Create `packaging/config/` directory and populate it

These files will be installed to system paths by the RPM `%post` scriptlet.

**`packaging/config/99-map2-audio.conf`** — RT limits for PAM/limits.d:
```
# MAP2 Audio Platform — Real-Time scheduling limits
@audio          -       rtprio          95
@audio          -       memlock         unlimited
@audio          -       nice            -19
map2            -       rtprio          95
map2            -       memlock         unlimited
map2            -       nice            -19
```

**`packaging/config/10-low-latency.conf`** — PipeWire quantum config:
```
context.properties = {
    default.clock.rate          = 48000
    default.clock.quantum       = 128
    default.clock.min-quantum   = 64
    default.clock.max-quantum   = 512
}
```

**`packaging/config/99-map2-audio.rules`** — udev rule for USB audio group ownership:
```
# MAP2 Audio: Edirol UA-1000 and Hotone Jogg — grant audio group ownership
SUBSYSTEM=="usb", ATTR{idVendor}=="0582", GROUP="audio", MODE="0664"
SUBSYSTEM=="usb", ATTR{idVendor}=="1044", GROUP="audio", MODE="0664"
```

**`packaging/config/80-map2-audio.preset`** — systemd service preset:
```
# MAP2 Audio Platform — systemd preset
# Enabled by default on install
enable map2-backend.service
enable map2-frontend.service
enable map2-tui.service

# RT system services — always enabled
enable map2-cpu-governor.service
enable map2-disable-turbo.service
enable map2-verify-isolation.service
enable map2-system-check.service

# Boot / management services — enabled by default
enable map2-boot-manager.service
enable map2-port80-proxy.service

# LCD display — enabled by default (no-op if I2C hardware absent)
enable map2-lcd.service
enable map2-lcd-boot.service

# Web production server — enabled; web-dev is NOT shipped
enable map2-web-prod.service

# Opt-in services (not enabled by default)
disable map2-cluster.service
disable map2-avb.target
disable map2-ptp4l.service
disable map2-phc2sys.service
disable map2-srpd.service
```

### 2b. Create `packaging/scripts/map2-setup`

This is the first-boot interactive configuration wizard. Install to `/usr/local/bin/map2-setup`. Make it executable.

**CLI interface must match `install_on_new_host.sh`**: support `--dry-run`, `--mode audio|all-in-one|management`, and `--skip-reboot` flags. Pre-flight checks must match the logic in `install_on_new_host.sh` (root, disk space ≥10GB, Fedora version). The clone step from `install_on_new_host.sh` is omitted — in RPM context the files are already at `/opt/map2/`.

```bash
#!/bin/bash
# MAP2 Audio Platform — First-Boot Setup Wizard
# Mirrors the interface of install_on_new_host.sh.
# Run once after RPM install and reboot to complete system configuration.
#
# Usage:
#   sudo map2-setup                        # Interactive
#   sudo map2-setup --mode audio           # Set mode non-interactively
#   sudo map2-setup --dry-run              # Preview only
#   sudo map2-setup --skip-reboot          # Skip reboot prompt
set -euo pipefail

PLATFORM_DIR="/opt/map2"
TARGET_MODE=""
DRY_RUN=0
SKIP_REBOOT=0
LOG_FILE="/tmp/map2-setup-$(date +%Y%m%d-%H%M%S).log"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'

exec > >(tee -a "$LOG_FILE") 2>&1

log()     { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()      { echo -e "${GREEN}  ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()     { echo -e "${RED}  ✗${NC} $*"; }
section() { echo ""; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
run_cmd() { [ $DRY_RUN -eq 1 ] && echo -e "  [DRY-RUN] $*" || "$@"; }

# Argument parsing — mirrors install_on_new_host.sh
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)     DRY_RUN=1; shift ;;
        --skip-reboot) SKIP_REBOOT=1; shift ;;
        --mode)        TARGET_MODE="${2:-}"; shift 2 ;;
        --help|-h)
            echo "Usage: sudo map2-setup [--dry-run] [--skip-reboot] [--mode audio|all-in-one|management]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo -e "${MAGENTA}"
echo "╔══════════════════════════════════════════╗"
echo "║   MAP2 Audio Platform — Setup Wizard     ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
[ $DRY_RUN -eq 1 ] && warn "DRY-RUN MODE — no changes will be made"

# ── PHASE 0: Pre-flight checks (from install_on_new_host.sh) ────────────────
section "Phase 0: Pre-Flight Checks"

# Root check
if [ "$EUID" -ne 0 ]; then
    err "This script must be run as root (use sudo)"
    exit 1
fi
ok "Running as root"

# Fedora version check
if [ -f /etc/fedora-release ]; then
    FEDORA_VER=$(rpm -E %fedora)
    if [ "$FEDORA_VER" -lt 42 ]; then
        warn "Fedora $FEDORA_VER detected. Recommended: Fedora 42+"
    else
        ok "Fedora $FEDORA_VER"
    fi
else
    warn "Not a Fedora system. Proceeding anyway."
fi

# Disk space check — 10GB required (from STANDALONE_REBUILD_SCRIPT)
AVAIL_GB=$(df -BG /home | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAIL_GB" -lt 10 ]; then
    warn "Low disk space: ${AVAIL_GB}GB available, 10GB recommended"
else
    ok "Disk space: ${AVAIL_GB}GB available"
fi

# Platform sanity check
if [ ! -d "$PLATFORM_DIR/app" ]; then
    err "Platform not found at $PLATFORM_DIR — is the RPM installed?"
    exit 1
fi
ok "Platform found at $PLATFORM_DIR"

# ── PHASE 1: RT kernel configuration verification ───────────────────────────
section "Phase 1: Real-Time Kernel Configuration"

if [ -f "$PLATFORM_DIR/scripts/verify_rt_config.sh" ]; then
    run_cmd bash "$PLATFORM_DIR/scripts/verify_rt_config.sh" || \
        warn "RT config verification had issues. Ensure you rebooted after 'dnf install'."
fi

# ── PHASE 2: Audio interface detection ──────────────────────────────────────
section "Phase 2: Audio Interface Detection"

if command -v aplay &>/dev/null; then
    aplay -l 2>/dev/null | grep -E "^card" || echo "  No ALSA card devices found."
fi
if command -v pw-cli &>/dev/null; then
    pw-cli ls Node 2>/dev/null | grep -iE "audio|alsa|jack" | head -10 || true
fi

# ── PHASE 3: Operating mode selection ───────────────────────────────────────
section "Phase 3: Operating Mode"

if [ -z "$TARGET_MODE" ]; then
    echo "  1) audio       — Dedicated audio only, lowest latency (<3ms)"
    echo "  2) all-in-one  — Audio + web dashboard (4-5ms)  [default]"
    echo "  3) management  — Control plane only, no audio"
    echo ""
    read -rp "  Enter choice [1-3]: " MODE_CHOICE
    case "${MODE_CHOICE:-2}" in
        1) TARGET_MODE="audio" ;;
        3) TARGET_MODE="management" ;;
        *) TARGET_MODE="all-in-one" ;;
    esac
fi

log "Setting mode: $TARGET_MODE"
if [ -x /usr/local/bin/map2-mode ]; then
    run_cmd sudo map2-mode set "$TARGET_MODE" || warn "map2-mode set failed; set manually later."
fi

# ── PHASE 4: Generate rebuild script (for disaster recovery) ────────────────
section "Phase 4: Generating Disaster-Recovery Rebuild Script"

# Uses backup_service.py --generate-rebuild-script from install_on_new_host.sh
REBUILD_SCRIPT="/var/lib/map2/map2-rebuild.sh"
if [ -f "$PLATFORM_DIR/app/services/backup_service.py" ]; then
    run_cmd python3 "$PLATFORM_DIR/app/services/backup_service.py" \
        --generate-rebuild-script "$REBUILD_SCRIPT" && \
    ok "Rebuild script saved to $REBUILD_SCRIPT (use for disaster recovery)" || \
    warn "Could not generate rebuild script; non-fatal."
fi

# ── PHASE 5: Self-test and service start ────────────────────────────────────
section "Phase 5: Self-Test and Service Start"

if [ -f "$PLATFORM_DIR/scripts/self_test.py" ]; then
    run_cmd python3 "$PLATFORM_DIR/scripts/self_test.py" || \
        warn "Self-test had warnings. Check: map2-logs"
fi

run_cmd systemctl start map2-backend 2>/dev/null || true
sleep 2
systemctl is-active --quiet map2-backend && ok "map2-backend running" || warn "map2-backend not started"

echo ""
echo -e "${GREEN}Setup complete. Log: $LOG_FILE${NC}"
echo "  Web dashboard:   http://localhost:3000"
echo "  API:             http://localhost:8080"
echo "  Node console:    python3 -m tui.node_console"
echo "  Disaster recovery script: $REBUILD_SCRIPT"
echo ""

if [ $SKIP_REBOOT -eq 0 ] && [ $DRY_RUN -eq 0 ]; then
    read -rp "Reboot now to activate all RT kernel parameters? [y/N] " REBOOT
    [[ "$REBOOT" =~ ^[Yy]$ ]] && run_cmd reboot || \
        warn "Remember to reboot before audio work to activate isolcpus/nohz_full."
fi
```

### 2c. Copy missing systemd units into `packaging/systemd/`

The `systemd/` directory (live) contains production units that are not yet in `packaging/systemd/`. Copy the following units into `packaging/systemd/` so the spec's `%install` can reference them from a single known location. Read each source file before copying to confirm it does not reference dev-only paths or contain the words "selinux-disable" or "web-dev".

```
systemd/map2-lcd.service           → packaging/systemd/map2-lcd.service
systemd/map2-lcd-boot.service      → packaging/systemd/map2-lcd-boot.service
systemd/map2-boot-manager.service  → packaging/systemd/map2-boot-manager.service
systemd/map2-port80-proxy.service  → packaging/systemd/map2-port80-proxy.service
systemd/map2-system-check.service  → packaging/systemd/map2-system-check.service
systemd/map2-web-prod.service      → packaging/systemd/map2-web-prod.service
```

**DO NOT copy these (excluded from the RPM):**
- `systemd/map2-selinux-disable.service` — would re-enable a security-disabled feature; security regression
- `systemd/map2-web-dev.service` — Vite dev server; not for production
- `systemd/map2-pipedal-test.service` — test harness only

### 2d. Overwrite `packaging/map2-audio.spec` with the improved spec

Read the existing spec first. Then replace its full contents with the following. Key improvements over current spec:
- `%build` compiles the JUCE C++ engine with CMake
- `%install` uses an explicit allowlist (no `cp -r scripts/`)
- `%post` calls RT configuration and uses `systemctl preset` via preset file
- `%post` installs limits.d, PipeWire config, udev rules
- `%post` calls `grubby` for kernel RT parameters
- Version derives from git tag
- DIST derives from running Fedora version

```spec
Name:           map2-audio
Version:        2.0.0
Release:        1%{?dist}
Summary:        MAP2 Audio Platform — Professional Real-Time Audio Processing

License:        MIT
URL:            https://github.com/matthewmackes/map2-audio
Source0:        %{name}-%{version}.tar.gz

# Build dependencies
BuildRequires:  cmake >= 3.22
BuildRequires:  gcc-c++
BuildRequires:  ninja-build
BuildRequires:  python3-devel >= 3.12
BuildRequires:  python3-pip
BuildRequires:  nodejs >= 18
BuildRequires:  npm
BuildRequires:  alsa-lib-devel
BuildRequires:  freetype-devel
BuildRequires:  libX11-devel
BuildRequires:  libXext-devel
BuildRequires:  libXinerama-devel
BuildRequires:  libXrandr-devel
BuildRequires:  libXcursor-devel
BuildRequires:  mesa-libGL-devel
BuildRequires:  libcurl-devel
BuildRequires:  git

# Runtime dependencies
# SOURCE OF TRUTH: DNF_PACKAGES in app/services/backup_service.py STANDALONE_REBUILD_SCRIPT
# Do not edit this list independently — sync it with that constant.

# Python runtime
Requires:       python3 >= 3.12
Requires:       python3-devel
Requires:       python3-pip

# Audio system — PipeWire/JACK (from DNF_PACKAGES)
Requires:       alsa-utils
Requires:       alsa-lib
Requires:       alsa-lib-devel
Requires:       alsa-plugins-pulseaudio
Requires:       alsa-plugins-jack
Requires:       pipewire
Requires:       pipewire-alsa
Requires:       pipewire-jack-audio-connection-kit
Requires:       pipewire-jack-audio-connection-kit-devel
Requires:       jack-audio-connection-kit
Requires:       jack-audio-connection-kit-dbus
Requires:       a2jmidid

# LV2 plugin ecosystem (from DNF_PACKAGES)
Requires:       lv2
Requires:       lv2-devel
Requires:       lilv
Requires:       lilv-devel
Requires:       suil
Requires:       suil-devel
Requires:       sord
Requires:       serd

# LV2 Plugins (from DNF_PACKAGES)
Requires:       lv2-calf-plugins
Requires:       guitarix-lv2
Requires:       gxplugins-lv2
Requires:       lsp-plugins-lv2

# Node.js for web dashboard
Requires:       nodejs >= 18
Requires:       npm

# Build tools
Requires:       gcc
Requires:       gcc-c++
Requires:       cmake >= 3.22
Requires:       make
Requires:       git

# Database (from DNF_PACKAGES)
Requires:       sqlite
Requires:       sqlite-devel

# I2C support for LCD displays (from DNF_PACKAGES)
Requires:       i2c-tools

# AVB/TSN networking stack
# setup_avb_ptp.sh installs ptp4l/phc2sys → requires linuxptp
# setup_avb_qdiscs.sh / tsn_qdisc.py use 'tc' commands → requires iproute-tc
# AVB discovery uses mDNS → requires avahi
# setup_avb_ptp.sh checks for ethtool → requires ethtool
Requires:       linuxptp
Requires:       iproute-tc
Requires:       ethtool
Requires:       avahi
Requires:       avahi-tools
Requires:       nmap-ncat

# Utilities (from DNF_PACKAGES)
Requires:       htop
Requires:       tmux
Requires:       wget
Requires:       curl

# RT scheduling
Requires:       rtkit

# Systemd integration
Requires:       systemd
Requires(post): grubby
Requires(post): systemd
Requires(post): shadow-utils

%description
MAP2 Audio Platform provides professional real-time audio processing
with JUCE C++ DSP engine, Neural Amp Modeler (NAM), convolution
reverb and cabinet IR, full plugin graph with PDC, AVB networking,
PipeWire/JACK integration, and a web-based pedalboard editor.

Supports standalone pedal mode, cluster networking, and all-in-one
operation. Targets <3ms round-trip latency on isolated CPU cores
with PREEMPT_RT kernel.

%prep
%autosetup -n %{name}-%{version}

%build
# --- 1. Build JUCE C++ audio engine ---
cmake -B juce-engine/build \
      -S juce-engine \
      -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/map2 \
      -DENABLE_NATIVE_OPTIMIZATIONS=OFF
cmake --build juce-engine/build --parallel %{_smp_build_ncpus}

# --- 2. Build React web frontend ---
cd web
npm ci --omit=dev
npm run build
cd ..

# --- 3. Vendor Python dependencies (no pip at runtime) ---
pip3 install \
    --no-deps \
    --no-build-isolation \
    --target ./vendor \
    -r requirements.txt

%install
# Application directories
install -d %{buildroot}/opt/map2/{app,engine,web,tui,scripts,config,vendor}
install -d %{buildroot}/etc/map2
install -d %{buildroot}/var/lib/map2/{backups,logs}
install -d %{buildroot}/var/log/map2
install -d %{buildroot}/usr/lib/systemd/system
install -d %{buildroot}/usr/lib/systemd/system-preset
install -d %{buildroot}/usr/local/bin
install -d %{buildroot}/opt/map2/system-templates

# Python backend
cp -r app/         %{buildroot}/opt/map2/app/
cp -r tui/         %{buildroot}/opt/map2/tui/
cp    requirements.txt %{buildroot}/opt/map2/
cp -r vendor/      %{buildroot}/opt/map2/vendor/

# JUCE engine binary
install -m 755 juce-engine/build/map2_audio_engine \
               %{buildroot}/opt/map2/engine/map2_audio_engine

# React web frontend (pre-built dist only)
cp -r web/dist/    %{buildroot}/opt/map2/web/

# Production scripts only (explicit allowlist — no dev/debug scripts)
install -m 755 scripts/setup_realtime.sh      %{buildroot}/opt/map2/scripts/
install -m 755 scripts/setup_user.sh          %{buildroot}/opt/map2/scripts/
install -m 755 scripts/verify_rt_config.sh    %{buildroot}/opt/map2/scripts/
install -m 755 scripts/verify_system.sh       %{buildroot}/opt/map2/scripts/
install -m 755 scripts/self_test.py           %{buildroot}/opt/map2/scripts/
install -m 755 scripts/ztp-init.sh            %{buildroot}/opt/map2/scripts/
install -m 755 scripts/map2-boot-manager.sh   %{buildroot}/opt/map2/scripts/
install -m 755 scripts/measure_latency.sh     %{buildroot}/opt/map2/scripts/
install -m 755 scripts/hardware_summary.sh    %{buildroot}/opt/map2/scripts/
# AVB networking scripts (required by AVB stack)
install -m 755 scripts/setup_avb.sh           %{buildroot}/opt/map2/scripts/
install -m 755 scripts/setup_avb_ptp.sh       %{buildroot}/opt/map2/scripts/
install -m 755 scripts/setup_avb_qdiscs.sh    %{buildroot}/opt/map2/scripts/
install -m 755 scripts/restore_avb_qdiscs.sh  %{buildroot}/opt/map2/scripts/
install -m 755 scripts/uninstall_avb.sh       %{buildroot}/opt/map2/scripts/
# Disaster-recovery bootstrap — skip the clone step when re-running on
# an already-installed system; it is idempotent and still useful post-RPM.
install -m 755 install_on_new_host.sh         %{buildroot}/opt/map2/scripts/

# System configuration files
install -m 644 packaging/config/99-map2-audio.conf  %{buildroot}/opt/map2/config/
install -m 644 packaging/config/10-low-latency.conf %{buildroot}/opt/map2/config/
install -m 644 packaging/config/99-map2-audio.rules %{buildroot}/opt/map2/config/

# systemd units — from packaging/systemd/ (8 canonical units)
install -m 644 packaging/systemd/map2-backend.service   %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-frontend.service  %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-cluster.service   %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-tui.service       %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-avb.target        %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-ptp4l.service     %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-phc2sys.service   %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-srpd.service      %{buildroot}/usr/lib/systemd/system/
# systemd units — from systemd/ live directory (production units NOT in packaging/)
# Copy these into packaging/systemd/ first (Phase 2 task), then install from there.
# DO NOT ship: map2-selinux-disable.service (security regression)
# DO NOT ship: map2-web-dev.service (development only)
# DO NOT ship: map2-pipedal-test.service (test harness, not a production service)
install -m 644 packaging/systemd/map2-lcd.service           %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-lcd-boot.service      %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-boot-manager.service  %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-port80-proxy.service  %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-system-check.service  %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-web-prod.service      %{buildroot}/usr/lib/systemd/system/
# systemd units — RT services from config/system-templates/
install -m 644 config/system-templates/etc-systemd-system-map2-cpu-governor.service \
               %{buildroot}/usr/lib/systemd/system/map2-cpu-governor.service
install -m 644 config/system-templates/etc-systemd-system-map2-disable-turbo.service \
               %{buildroot}/usr/lib/systemd/system/map2-disable-turbo.service
install -m 644 config/system-templates/etc-systemd-system-map2-verify-isolation.service \
               %{buildroot}/usr/lib/systemd/system/map2-verify-isolation.service

# system-templates — install as reference copies; %post deploys them to system paths
cp -r config/system-templates/ %{buildroot}/opt/map2/system-templates/

# systemd preset
install -m 644 packaging/config/80-map2-audio.preset \
               %{buildroot}/usr/lib/systemd/system-preset/

# CLI tools
install -m 755 packaging/scripts/map2-setup   %{buildroot}/usr/local/bin/map2-setup
install -m 755 scripts/map2-mode.sh           %{buildroot}/usr/local/bin/map2-mode
install -m 755 scripts/map2-shell-setup       %{buildroot}/usr/local/bin/map2-shell-setup

# Wrapper: map2 command
cat > %{buildroot}/usr/local/bin/map2 << 'WRAPPER'
#!/bin/bash
export PYTHONPATH=/opt/map2/vendor:/opt/map2
exec python3 /opt/map2/app/main.py "$@"
WRAPPER
chmod 755 %{buildroot}/usr/local/bin/map2

%files
%dir /opt/map2
/opt/map2/app/
/opt/map2/engine/
/opt/map2/web/
/opt/map2/tui/
%exclude /opt/map2/tui/**/*.md
/opt/map2/scripts/
/opt/map2/config/
/opt/map2/vendor/
/opt/map2/system-templates/
/opt/map2/requirements.txt
%dir /etc/map2
%dir /var/lib/map2
%dir /var/lib/map2/backups
%dir /var/lib/map2/logs
%dir /var/log/map2
/usr/lib/systemd/system/map2-*.service
/usr/lib/systemd/system/map2-cpu-governor.service
/usr/lib/systemd/system/map2-disable-turbo.service
/usr/lib/systemd/system/map2-verify-isolation.service
/usr/lib/systemd/system/map2-avb.target
/usr/lib/systemd/system-preset/80-map2-audio.preset
/usr/local/bin/map2
/usr/local/bin/map2-mode
/usr/local/bin/map2-setup
/usr/local/bin/map2-shell-setup

%pre
# Create map2 system user and add to audio group before file installation
getent group audio > /dev/null || groupadd -r audio
getent passwd map2 > /dev/null || \
    useradd -r \
            -g audio \
            -G pipewire \
            -s /usr/sbin/nologin \
            -d /var/lib/map2 \
            -c "MAP2 Audio Platform service account" \
            map2

%post
TEMPLATES=/opt/map2/system-templates

# --- 1. RT limits ---
install -m 644 /opt/map2/config/99-map2-audio.conf \
               /etc/security/limits.d/99-map2-audio.conf

# --- 2. PipeWire low-latency config (system-wide) ---
mkdir -p /etc/pipewire/pipewire.conf.d
install -m 644 /opt/map2/config/10-low-latency.conf \
               /etc/pipewire/pipewire.conf.d/10-map2-low-latency.conf

# --- 3. udev rules for USB audio devices ---
install -m 644 /opt/map2/config/99-map2-audio.rules \
               /etc/udev/rules.d/99-map2-audio.rules
udevadm control --reload-rules 2>/dev/null || true

# --- 4. RT sysctl tuning (from config/system-templates/) ---
# 91: SCHED_RT params   92: THP disable   93: swappiness   94: watchdog disable
install -m 644 "$TEMPLATES/etc-sysctl-d-91-map2-audio-rt.conf"        /etc/sysctl.d/91-map2-audio-rt.conf
install -m 644 "$TEMPLATES/etc-sysctl-d-92-map2-audio-thp.conf"       /etc/sysctl.d/92-map2-audio-thp.conf
install -m 644 "$TEMPLATES/etc-sysctl-d-93-map2-audio-swappiness.conf" /etc/sysctl.d/93-map2-audio-swappiness.conf
install -m 644 "$TEMPLATES/etc-sysctl-d-94-map2-audio-watchdog.conf"  /etc/sysctl.d/94-map2-audio-watchdog.conf
sysctl --system 2>/dev/null || true

# --- 5. GRUB latency config (adds isolcpus etc. to GRUB_CMDLINE_LINUX) ---
install -m 644 "$TEMPLATES/etc-default-grub-d-20-map2-audio-latency.cfg" \
               /etc/default/grub.d/20-map2-audio-latency.cfg 2>/dev/null || \
# Fallback: grubby direct approach if grub.d not available
if command -v grubby &>/dev/null; then
    grubby --update-kernel=ALL \
           --args="isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs" \
           2>/dev/null || true
fi

# --- 6. journald config ---
mkdir -p /etc/systemd/journald.conf.d
install -m 644 "$TEMPLATES/etc-systemd-journald.conf.d-map2-audio.conf" \
               /etc/systemd/journald.conf.d/map2-audio.conf

# --- 7. systemd service override dropins (mode-specific backend configs) ---
mkdir -p /etc/systemd/system/map2-backend.service.d
install -m 644 "$TEMPLATES/etc-systemd-system-map2-backend.service.d-all-in-one-override.conf" \
               /etc/systemd/system/map2-backend.service.d/all-in-one-override.conf
# The active mode override is not installed here — map2-setup activates the right one.

# --- 8. PipeWire CPU affinity config (user service) ---
mkdir -p /etc/systemd/user@.service.d
install -m 644 "$TEMPLATES/etc-systemd-user@.service.d-pipewire-affinity.conf" \
               /etc/systemd/user@.service.d/pipewire-affinity.conf

# --- 9. Kernel RT parameters (fallback via grubby if grub.d not supported) ---
# (Handled in step 5 above; grubby fallback included)

# --- 10. Directory ownership ---
chown -R map2:audio /opt/map2 /var/lib/map2 /var/log/map2 2>/dev/null || true

# --- 11. Enable services via preset ---
systemctl daemon-reload
systemctl preset \
    map2-backend.service \
    map2-frontend.service \
    map2-tui.service \
    map2-cpu-governor.service \
    map2-disable-turbo.service \
    map2-verify-isolation.service \
    2>/dev/null || true

echo ""
echo "MAP2 Audio Platform installed."
echo ""
echo "IMPORTANT: A reboot is required to activate RT kernel parameters."
echo "After rebooting, run:  sudo map2-setup"
echo ""

%preun
# Stop services on uninstall (not on upgrade: $1 == 0 means final removal)
if [ $1 -eq 0 ]; then
    systemctl stop  map2-backend map2-frontend map2-tui \
                    map2-cluster map2-avb \
                    2>/dev/null || true
    systemctl disable map2-backend map2-frontend map2-tui \
                      2>/dev/null || true
fi

%postun
systemctl daemon-reload

# On final removal, clean up system modifications
if [ $1 -eq 0 ]; then
    rm -f /etc/security/limits.d/99-map2-audio.conf
    rm -f /etc/pipewire/pipewire.conf.d/10-map2-low-latency.conf
    rm -f /etc/udev/rules.d/99-map2-audio.rules
    rm -f /etc/sysctl.d/91-map2-audio-rt.conf
    rm -f /etc/sysctl.d/92-map2-audio-thp.conf
    rm -f /etc/sysctl.d/93-map2-audio-swappiness.conf
    rm -f /etc/sysctl.d/94-map2-audio-watchdog.conf
    rm -f /etc/default/grub.d/20-map2-audio-latency.cfg
    rm -f /etc/systemd/journald.conf.d/map2-audio.conf
    rm -rf /etc/systemd/system/map2-backend.service.d
    rm -f /etc/systemd/user@.service.d/pipewire-affinity.conf
    udevadm control --reload-rules 2>/dev/null || true
    if command -v grubby &>/dev/null; then
        grubby --update-kernel=ALL \
               --remove-args="isolcpus nohz_full rcu_nocbs threadirqs" \
               2>/dev/null || true
    fi
    echo "MAP2 Audio Platform removed. Reboot to clear RT kernel parameters."
fi

%changelog
* Sat Feb 22 2026 Matthew Mackes <matthew@map2-audio.dev> - 2.0.0-1
- Production-grade installer RPM with full RT system configuration
- JUCE C++ engine built in %build phase
- Comprehensive %post: RT limits, PipeWire config, udev, grubby, systemd preset
- map2-setup first-boot TUI wizard
- Explicit script allowlist replaces cp -r scripts/
- Clean %postun removes all system modifications on uninstall
```

### 2e. Overwrite `packaging/build-rpm.sh` with the corrected version

Fix two bugs: hardcoded `fc40` DIST tag, hardcoded `1.0.0` version.

```bash
#!/bin/bash
# MAP2 Audio Platform — RPM Build Script
# Usage: ./packaging/build-rpm.sh [version] [release]
# Run from anywhere; uses git archive from repo root.
# Output: ~/map2-rpm-build/dist/
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
PKG_NAME="map2-audio"

# Version from git tag if not supplied
VERSION="${1:-$(git -C "$REPO_ROOT" describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo '2.0.0')}"
RELEASE="${2:-1}"
# DIST from running system, not hardcoded
DIST="fc$(rpm -E '%{fedora}' 2>/dev/null || echo '43')"
ARCH="x86_64"

echo -e "${GREEN}MAP2 Audio Platform — RPM Build${NC}"
echo "  Source:  $REPO_ROOT"
echo "  Version: $VERSION"
echo "  Release: $RELEASE"
echo "  Dist:    $DIST"
echo ""

# Verify build tools
for cmd in rpmbuild git cmake node npm python3; do
    if ! command -v "$cmd" &>/dev/null; then
        echo -e "${RED}Missing required tool: $cmd${NC}"
        [ "$cmd" = "rpmbuild" ] && echo "  Install: sudo dnf install rpm-build"
        exit 1
    fi
done

# Build workspace lives OUTSIDE the source repo
BUILD_ROOT="${HOME}/map2-rpm-build"
SOURCES_DIR="${BUILD_ROOT}/SOURCES"
SPECS_DIR="${BUILD_ROOT}/SPECS"
OUTPUT_DIR="${BUILD_ROOT}/dist"

rm -rf "$BUILD_ROOT"
mkdir -p "$SOURCES_DIR" "$SPECS_DIR" "$OUTPUT_DIR"

# Source tarball via git archive (respects .gitattributes export-ignore)
echo -e "${YELLOW}Creating source tarball via git archive...${NC}"
git -C "$REPO_ROOT" archive \
    --format=tar.gz \
    --prefix="${PKG_NAME}-${VERSION}/" \
    -o "${SOURCES_DIR}/${PKG_NAME}-${VERSION}.tar.gz" \
    HEAD
echo "  $(du -h "${SOURCES_DIR}/${PKG_NAME}-${VERSION}.tar.gz" | cut -f1) — ${PKG_NAME}-${VERSION}.tar.gz"

# Inject version and release into spec
SPEC_SRC="${REPO_ROOT}/packaging/${PKG_NAME}.spec"
SPEC_DEST="${SPECS_DIR}/${PKG_NAME}.spec"
sed \
    -e "s/^Version:.*/Version:        ${VERSION}/" \
    -e "s/^Release:.*/Release:        ${RELEASE}%{?dist}/" \
    "$SPEC_SRC" > "$SPEC_DEST"

# Build
echo -e "${YELLOW}Running rpmbuild...${NC}"
rpmbuild -ba \
    --define "_topdir ${BUILD_ROOT}" \
    --define "dist .${DIST}" \
    "$SPEC_DEST"

# Collect output
RPM_FILE="${BUILD_ROOT}/RPMS/${ARCH}/${PKG_NAME}-${VERSION}-${RELEASE}.${DIST}.${ARCH}.rpm"
SRPM_FILE="${BUILD_ROOT}/SRPMS/${PKG_NAME}-${VERSION}-${RELEASE}.${DIST}.src.rpm"

[ -f "$RPM_FILE" ]  && cp "$RPM_FILE"  "$OUTPUT_DIR/"
[ -f "$SRPM_FILE" ] && cp "$SRPM_FILE" "$OUTPUT_DIR/"

cd "$OUTPUT_DIR"
sha256sum ./*.rpm > SHA256SUMS 2>/dev/null || true

echo ""
echo -e "${GREEN}Build complete.${NC}"
ls -lh "$OUTPUT_DIR"
echo ""
echo "Install:  sudo dnf install ${OUTPUT_DIR}/${PKG_NAME}-${VERSION}-${RELEASE}.${DIST}.${ARCH}.rpm"
echo "Post-install: reboot, then run: sudo map2-setup"
```

---

## Phase 3: Build Workspace and Source Tarball

After all Phase 2 files are written and confirmed to exist:

1. Verify `rpm-build` is installed: `rpm -q rpm-build || sudo dnf install -y rpm-build ninja-build`
2. Run the corrected build script: `bash /home/mm/map2-audio/packaging/build-rpm.sh`
3. Confirm `~/map2-rpm-build/dist/map2-audio-*.rpm` exists and is non-zero.
4. Confirm the source repo is unchanged: `git -C /home/mm/map2-audio status` should show only the new/modified files under `packaging/` and `.gitattributes` as modified/added — no deletions, no changes to `app/`, `juce-engine/`, `web/src/`, or `tui/`.

---

## Phase 4: rpmbuild Execution

The build script handles this. If `rpmbuild` fails:

- **Missing `cmake >= 3.22`**: `cmake --version` — if below 3.22, install from COPR: `sudo dnf copr enable tkloczko/cmake && sudo dnf install cmake`. Do NOT lower the minimum version in the spec.
- **Missing JUCE build deps**: Install the `BuildRequires` headers listed in the spec individually via `sudo dnf install -y <package>`.
- **`npm ci` network error**: The spec's `%build` runs inside rpmbuild sandbox. If network is unavailable, pre-build the web dist separately: `cd /home/mm/map2-audio/web && npm ci && npm run build` — the git archive will include `web/dist/` if it is committed. Alternatively add it to the spec `%prep` as a pre-built artifact.
- **`pip install --no-build-isolation` fails**: Remove `--no-build-isolation` flag for the vendor step; it is a conservative flag that may not be needed.

---

## Phase 5: Verification and Summary

After a successful build:

1. Inspect the RPM contents: `rpm -qlp ~/map2-rpm-build/dist/map2-audio-*.rpm`
   - Verify `/opt/map2/engine/map2_audio_engine` is present (JUCE binary).
   - Verify `/usr/local/bin/map2-setup` is present.
   - Verify `/usr/lib/systemd/system-preset/80-map2-audio.preset` is present.
   - Verify AVB scripts present: `setup_avb_ptp.sh`, `setup_avb_qdiscs.sh`, `restore_avb_qdiscs.sh`.
   - Verify LCD and RT services present: `map2-lcd.service`, `map2-cpu-governor.service`.
   - Verify system-templates present: `rpm -qlp ... | grep system-templates | head -5` → sysctl/grub configs.
   - Verify NO dev units shipped: `rpm -qlp ... | grep -E "selinux-disable|web-dev|pipedal-test"` should return nothing.
   - Verify NO tui docs: `rpm -qlp ... | grep "tui.*\.md$"` should return nothing.

2. Inspect RPM metadata: `rpm -qip ~/map2-rpm-build/dist/map2-audio-*.rpm`
   - Confirm Version matches current git tag.
   - Confirm Dist matches running Fedora version.

3. Confirm source repo integrity: `git -C /home/mm/map2-audio diff --stat HEAD`
   - Only `packaging/` files and `.gitattributes` should appear.
   - Zero deletions from the working tree.

4. Report what was built, what the install command is, and what the consumer does after install (reboot → `map2-setup`).

---

## Phase 0: Read Canonical Sources First

Before writing any file, read the following. Extract the information noted and use it verbatim when writing the spec and map2-setup.

```
Read: install_on_new_host.sh
  → Extract: CLI flags (--dry-run, --mode, --skip-reboot, --user)
  → Extract: pre-flight checks (root, disk GB threshold, internet check, distro detection)
  → Extract: LOG_FILE path pattern, color variables, logging functions

Read: app/services/backup_service.py lines 746–870
  → Extract: DNF_PACKAGES array (complete list — every package name)
  → Extract: DNF_OPTIONAL_PACKAGES array
  → Extract: PYTHON_PACKAGES array
  → Use DNF_PACKAGES verbatim as the spec Requires: block
```

If the package list in those files differs from what is written in this skill, the files win. Update the spec accordingly.

---

## Files Modified in Source Repo (Complete List)

| File | Action |
|---|---|
| `.gitattributes` | Created or appended — export-ignore rules |
| `packaging/map2-audio.spec` | Overwritten — full improved spec; Requires: derived from STANDALONE_REBUILD_SCRIPT |
| `packaging/build-rpm.sh` | Overwritten — fix DIST and VERSION derivation |
| `packaging/config/99-map2-audio.conf` | Created — RT limits (PAM/limits.d) |
| `packaging/config/10-low-latency.conf` | Created — PipeWire quantum config |
| `packaging/config/99-map2-audio.rules` | Created — udev USB audio rules |
| `packaging/config/80-map2-audio.preset` | Created — systemd preset (all 17 services) |
| `packaging/scripts/map2-setup` | Created — first-boot wizard; flags/checks mirror install_on_new_host.sh |
| `packaging/systemd/map2-lcd.service` | Copied from `systemd/map2-lcd.service` |
| `packaging/systemd/map2-lcd-boot.service` | Copied from `systemd/map2-lcd-boot.service` |
| `packaging/systemd/map2-boot-manager.service` | Copied from `systemd/map2-boot-manager.service` |
| `packaging/systemd/map2-port80-proxy.service` | Copied from `systemd/map2-port80-proxy.service` |
| `packaging/systemd/map2-system-check.service` | Copied from `systemd/map2-system-check.service` |
| `packaging/systemd/map2-web-prod.service` | Copied from `systemd/map2-web-prod.service` |

**Explicitly NOT copied/shipped:**
- `systemd/map2-selinux-disable.service` — security regression
- `systemd/map2-web-dev.service` — development-only Vite server
- `systemd/map2-pipedal-test.service` — test harness

**No other files in the repository are touched.**
