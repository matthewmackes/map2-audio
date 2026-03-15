#!/bin/bash
# Deprecated as a primary user interface.
# Use the unified Textual Workflow route or `map2 workflow` for guided execution.
# This script remains as a non-interactive fallback/bootstrap path.
# MAP2 Audio Platform — Real-Time Audio Optimization Setup
#
# Configures a Linux host for professional, sub-4 ms round-trip latency (RTL)
# audio processing. Targets the Edirol UA-1000 (UAC1 USB) at 48 kHz / 64-sample
# quantum on a Fedora-based system, but the phases are broadly applicable to any
# systemd/PipeWire Linux host.
#
# WHAT THIS SCRIPT CHANGES (run with --dry-run to preview without writing):
#   Phase 1  — RT privilege limits (/etc/security/limits.d/99-map2-audio.conf)
#   Phase 2  — USB audio optimization (/etc/modprobe.d/audio-usb.conf)
#   Phase 3  — Memory: swappiness + THP (/etc/sysctl.d/99-map2-audio.conf)
#   Phase 4  — I/O scheduler (udev rule)
#   Phase 5  — CPU isolation + C-states + preempt (/etc/default/grub → reboot)
#   Phase 6  — CPU governor (performance mode systemd oneshot)
#   Phase 7  — MAP2 systemd service files (base + drop-ins)
#   Phase 8  — PipeWire low-latency config fragment
#   Phase 9  — IRQ affinity pinning service (UA-1000 USB → audio cores)
#   Phase 10 — rtkit-daemon enable
#   Phase 11 — Live quantum + IRQ apply (no reboot needed for these)
#
# REQUIRES REBOOT: Phase 5 (kernel cmdline). All other phases are live.
#
# Usage:
#   ./scripts/setup_realtime.sh           — interactive with confirmations
#   ./scripts/setup_realtime.sh --yes     — accept all prompts automatically
#   ./scripts/setup_realtime.sh --dry-run — show what would change, write nothing
#
# AI / Maintainer notes:
#   - The authoritative versions of systemd and PipeWire files live in the REPO,
#     not in this script. Phase 7 and 8 install from those files; they do NOT
#     embed duplicates. Edit the repo files, then re-run this script to redeploy.
#   - isolcpus MUST match the CPUAffinity= in map2-backend.service. This script
#     reads CPUAffinity from the repo service file to derive the correct value.
#   - The AVB stream.config.bufferSize=256 in Map2AudioEngine.cpp is an AVTP
#     network packet size — NOT the audio callback buffer. Do not change it.

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAP2_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Repo-managed source files (authoritative — edit these, not system copies)
REPO_SERVICE="$MAP2_DIR/systemd/map2-backend.service"
REPO_IRQ_SCRIPT="$MAP2_DIR/systemd/map2-irq-affinity.sh"
REPO_IRQ_SERVICE="$MAP2_DIR/systemd/map2-irq-affinity.service"

# System install destinations
SYS_SERVICE="/etc/systemd/system/map2-backend.service"
SYS_DROPINS_DIR="/etc/systemd/system/map2-backend.service.d"
SYS_IRQ_SERVICE="/etc/systemd/system/map2-irq-affinity.service"
SYS_IRQ_SCRIPT="/usr/local/bin/map2-irq-affinity.sh"
USER_PW_CONF_DIR="$HOME/.config/pipewire/pipewire.conf.d"
USER_PW_CONF="$USER_PW_CONF_DIR/99-map2-audio-latency.conf"
LEGACY_PW_CONF="$USER_PW_CONF_DIR/10-low-latency.conf"

# RT targets
TARGET_QUANTUM=64
TARGET_RATE=48000
TARGET_BUFFER=64

# ─────────────────────────────────────────────────────────────────────────────
# CLI flags
# ─────────────────────────────────────────────────────────────────────────────

DRY_RUN=false
AUTO_YES=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --yes|-y)  AUTO_YES=true ;;
        --help|-h)
            sed -n '2,/^set /p' "$0" | grep '^#' | sed 's/^# \?//'
            exit 0
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✅ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
err()  { echo -e "${RED}  ❌ $*${NC}"; }
info() { echo -e "${BLUE}  ℹ  $*${NC}"; }
step() { echo -e "\n${BOLD}${CYAN}=== $* ===${NC}"; }
dry()  { echo -e "${BLUE}  [DRY-RUN] would: $*${NC}"; }

# Write a file, either for real or as a dry-run preview
# Usage: tee_file <destination> <<'EOF' ... EOF
# For sudo writes use: sudo_tee_file <dest> <content>
sudo_write() {
    local dest="$1"
    local content="$2"
    if $DRY_RUN; then
        dry "write $dest"
        echo -e "${BLUE}--- content ---\n${content}\n---${NC}"
    else
        echo "$content" | sudo tee "$dest" > /dev/null
    fi
}

run_sudo() {
    if $DRY_RUN; then
        dry "sudo $*"
    else
        sudo "$@"
    fi
}

run_cmd() {
    if $DRY_RUN; then
        dry "$*"
    else
        eval "$*"
    fi
}

ask() {
    # ask <prompt> — returns 0 (yes) or 1 (no)
    local prompt="$1"
    if $AUTO_YES; then
        echo -e "  ${CYAN}$prompt${NC} → yes (--yes flag)"
        return 0
    fi
    read -p "  $prompt (y/n) " -n 1 -r </dev/tty
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

backup() {
    local f="$1"
    if [[ -f "$f" ]] && ! $DRY_RUN; then
        sudo cp "$f" "${f}.bak.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || \
            cp "$f" "${f}.bak.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  MAP2 Audio Platform — Real-Time Optimization Setup${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
$DRY_RUN && echo -e "\n${CYAN}  DRY-RUN MODE — no files will be written${NC}"
echo ""

if [[ "$EUID" -eq 0 ]]; then
    err "Do not run as root. Script uses sudo internally."
    exit 1
fi

if ! command -v sudo &>/dev/null; then
    err "sudo not found."
    exit 1
fi

if [[ ! -f "$REPO_SERVICE" ]]; then
    err "Repo service file not found: $REPO_SERVICE"
    err "Run this script from within the MAP2 repository."
    exit 1
fi

echo "  Changes will be made to:"
echo "    /etc/security/limits.d/   /etc/modprobe.d/   /etc/sysctl.d/"
echo "    /etc/udev/rules.d/         /etc/default/grub  /etc/systemd/system/"
echo "    ~/.config/pipewire/        /usr/local/bin/"
echo ""
ask "Continue?" || { echo "Aborted."; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# Detect audio CPU cores from the repo service file
# Used to align GRUB isolcpus with CPUAffinity (they MUST match).
# ─────────────────────────────────────────────────────────────────────────────

AUDIO_CPUS=$(grep -oP '(?<=^CPUAffinity=)[0-9 ]+' "$REPO_SERVICE" | tr ' ' ',' | sed 's/,$//' || echo "4,5")
# Normalise: "4 5" → "4,5", "4,5" stays "4,5"
AUDIO_CPUS=$(echo "$AUDIO_CPUS" | tr ' ' ',')
info "Audio CPUs from $REPO_SERVICE: CPUAffinity → isolcpus=$AUDIO_CPUS"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Real-Time Privilege Limits
# ─────────────────────────────────────────────────────────────────────────────
# /etc/security/limits.d/99-map2-audio.conf grants the @audio group and all
# users unlimited rtprio, memlock, and elevated nice. Without these, any call
# to pthread_setschedparam(SCHED_FIFO, ...) will fail with EPERM, and PipeWire/
# JUCE audio threads silently fall back to SCHED_OTHER — causing guaranteed xruns
# at any quantum below ~512 samples.
#
# rtprio=99 (not 95): PipeWire 1.x occasionally negotiates priority 97 for its
# own data-loop thread. Ceiling must be above that.
# nice=-20: kernel ceiling; the service uses Nice=-10 in practice.

step "Phase 1: Real-Time Privilege Limits"

LIMITS_CONTENT="# MAP2 Audio Platform — Real-Time Scheduling Limits
# /etc/security/limits.d/99-map2-audio.conf
#
# @audio group: all users in the 'audio' group get unlimited RT priority and
# memory locking. Required by PipeWire, JUCE, and JACK clients.
# rtprio=99: ceiling above PipeWire's own data-loop thread (typically priority 97).
# memlock=unlimited: prevents audio path memory from being paged to swap mid-callback.
# nice=-20: kernel ceiling; actual nice value in service is -10.
#
# NOTE: Changes require a new login session to take effect (PAM reads these at login).
@audio   -  rtprio     99
@audio   -  memlock    unlimited
@audio   -  nice       -20
*        -  rtprio     95
*        -  memlock    unlimited"

if $DRY_RUN; then
    dry "write /etc/security/limits.d/99-map2-audio.conf"
else
    echo "$LIMITS_CONTENT" | sudo tee /etc/security/limits.d/99-map2-audio.conf > /dev/null
fi
ok "RT limits: /etc/security/limits.d/99-map2-audio.conf"

# Remove the old limits file written by earlier setup script versions (weaker settings,
# different filename). The 99-map2-audio.conf supersedes it completely.
if [[ -f /etc/security/limits.d/99-audio-realtime.conf ]]; then
    run_sudo rm -f /etc/security/limits.d/99-audio-realtime.conf
    warn "Removed legacy /etc/security/limits.d/99-audio-realtime.conf (superseded)"
fi

# Ensure user is in the audio group
if ! groups "$USER" | grep -q '\baudio\b'; then
    run_sudo usermod -aG audio "$USER"
    ok "User $USER added to audio group"
    warn "LOG OUT and LOG IN for group change to take effect"
else
    ok "User $USER already in audio group"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — USB Audio Optimization
# ─────────────────────────────────────────────────────────────────────────────
# autosuspend=-1: Prevents the USB hub from suspending the UA-1000 between
# transfers. USB autosuspend causes the device to drop off and re-enumerate,
# producing loud clicks/dropouts. With UAC1 isochronous audio, even a 10ms
# suspend event will cause a buffer underrun.
#
# nrpacks=1: Forces the snd-usb-audio driver to send one URB packet per USB
# frame (1ms). Default is 8, which batches 8ms of audio before DMA transfer.
# Setting 1 reduces USB driver internal buffering at the cost of more frequent
# DMA transfers. Best combined with period-num=2 in PipeWire ALSA config.

step "Phase 2: USB Audio Optimization"

USB_CONF="# MAP2 Audio Platform — USB Audio Driver Optimization
# /etc/modprobe.d/audio-usb.conf
#
# autosuspend=-1: Disable USB power management globally. USB autosuspend on the
# UA-1000 causes device re-enumeration and audio dropout. The cost is negligible
# power use on a dedicated audio workstation.
#
# nrpacks=1: One URB packet per USB frame (1ms minimum, matching UAC1 framing).
# Default nrpacks=8 adds 8ms of USB driver buffering. Value 1 removes that
# buffering layer, trading more frequent DMA transactions for lower latency.
# If xruns increase, try nrpacks=2 or nrpacks=4.
options usbcore autosuspend=-1
options snd_usb_audio nrpacks=1"

if $DRY_RUN; then
    dry "write /etc/modprobe.d/audio-usb.conf"
else
    echo "$USB_CONF" | sudo tee /etc/modprobe.d/audio-usb.conf > /dev/null
fi
ok "USB optimization: /etc/modprobe.d/audio-usb.conf"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — Memory Configuration
# ─────────────────────────────────────────────────────────────────────────────
# vm.swappiness=10: Strongly prefer RAM over swap. Page faults during the audio
# callback path cause multi-ms stalls. The audio process mlocks its buffers
# (mem.mlock-all in PipeWire config), but Python heap and shared libraries may
# still be paged under memory pressure without a low swappiness.
#
# transparent_hugepage=madvise: Use 2MB pages only when explicitly requested
# (madvise). 'always' mode causes THP defragmentation pauses (1–10ms spikes)
# that appear as random xruns. 'never' wastes TLB entries. 'madvise' lets
# PipeWire and JUCE opt in while the Python heap stays on 4KB pages.

step "Phase 3: Memory Configuration"

SYSCTL_FILE="/etc/sysctl.d/99-map2-audio.conf"
if ! grep -q "vm.swappiness" "$SYSCTL_FILE" 2>/dev/null; then
    SYSCTL_CONTENT="# MAP2 Audio Platform — Memory Optimization
# /etc/sysctl.d/99-map2-audio.conf
#
# vm.swappiness=10: Strongly prefer RAM. Page faults in the audio path cause
# ms-scale stalls. mlocked audio buffers are protected but Python heap is not.
# Value 10 (not 0) allows some swap usage under extreme memory pressure to
# prevent OOM kills of non-audio processes.
vm.swappiness = 10

# transparent_hugepage is set via /sys at boot (see below); sysctl cannot set it.
# See Phase 3 note: echo madvise > /sys/kernel/mm/transparent_hugepage/enabled"
    if $DRY_RUN; then
        dry "write $SYSCTL_FILE"
    else
        echo "$SYSCTL_CONTENT" | sudo tee "$SYSCTL_FILE" > /dev/null
        sudo sysctl -p "$SYSCTL_FILE" > /dev/null 2>&1 || true
    fi
    ok "Memory: swappiness=10 ($SYSCTL_FILE)"
else
    ok "Memory: swappiness already configured"
fi

# THP via udev/tmpfiles since sysctl cannot reach /sys paths
THP_TMPFILES="/etc/tmpfiles.d/map2-thp.conf"
if [[ ! -f "$THP_TMPFILES" ]]; then
    THP_CONTENT="# MAP2 Audio — Transparent Hugepage mode
# Sets THP to madvise at boot via systemd-tmpfiles.
# 'madvise': 2MB pages only when explicitly requested. Prevents THP
# defragmentation pauses (1-10ms spikes) that cause random audio xruns.
w /sys/kernel/mm/transparent_hugepage/enabled - - - - madvise"
    if $DRY_RUN; then
        dry "write $THP_TMPFILES"
    else
        echo "$THP_CONTENT" | sudo tee "$THP_TMPFILES" > /dev/null
    fi
    ok "THP: madvise mode configured ($THP_TMPFILES)"
else
    ok "THP: already configured"
fi

# Apply THP immediately if possible
if [[ -w /sys/kernel/mm/transparent_hugepage/enabled ]]; then
    run_cmd "echo madvise > /sys/kernel/mm/transparent_hugepage/enabled"
    ok "THP: madvise applied live"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 4 — I/O Scheduler
# ─────────────────────────────────────────────────────────────────────────────
# mq-deadline for NVMe/SATA: Provides bounded request latency (deadline
# guarantees). The default kyber/none schedulers on NVMe prioritize throughput;
# deadline ensures I/O requests servicing log writes don't stall for >500ms.
# USB audio itself does not go through the block I/O scheduler (it's DMA/URB),
# but disk I/O from logging and plugin IR loading benefits from this.

step "Phase 4: I/O Scheduler"

IO_RULE="# MAP2 Audio Platform — I/O Scheduler
# /etc/udev/rules.d/60-ioschedulers.rules
#
# mq-deadline: bounded request latency scheduler. Prevents log writes and
# plugin IR loading from stalling behind large bulk I/O requests.
# The deadline scheduler does not affect USB audio (DMA/URB path), but
# reduces I/O jitter that can indirectly cause scheduler priority inversions.
ACTION==\"add|change\", KERNEL==\"sd[a-z]\",        ATTR{queue/scheduler}=\"mq-deadline\"
ACTION==\"add|change\", KERNEL==\"nvme[0-9]n[0-9]\", ATTR{queue/scheduler}=\"mq-deadline\""

if $DRY_RUN; then
    dry "write /etc/udev/rules.d/60-ioschedulers.rules"
else
    echo "$IO_RULE" | sudo tee /etc/udev/rules.d/60-ioschedulers.rules > /dev/null
fi
ok "I/O scheduler: mq-deadline rule written"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 5 — CPU Isolation, C-State Limit, and Kernel Preemption
# ─────────────────────────────────────────────────────────────────────────────
# THIS PHASE REQUIRES A REBOOT TO TAKE EFFECT.
#
# isolcpus=<AUDIO_CPUS>:
#   Removes the audio CPU pair from the kernel scheduler's general pool. After
#   this, only threads explicitly pinned to those cores (via CPUAffinity= or
#   taskset) will run there. Eliminates context switches from unrelated tasks
#   that cause unpredictable jitter. MUST match CPUAffinity= in the service.
#
# nohz_full=<AUDIO_CPUS>:
#   Disables the periodic HZ timer tick (CONFIG_HZ=1000 → 1ms interval) on the
#   audio cores when only one runnable task is present. At a 64-sample/48kHz
#   quantum (1.33ms period), the HZ tick fires inside nearly every audio callback
#   without nohz_full, adding 50–200µs of forced jitter per period.
#
# rcu_nocbs=<AUDIO_CPUS>:
#   Offloads RCU (Read-Copy-Update) callback processing from audio cores to
#   general CPUs. RCU callbacks are lock-free kernel data structure maintenance
#   tasks that can steal 10–100µs at unpredictable times from any core.
#
# threadirqs:
#   Forces all hardirq handlers (including xhci_hcd for the UA-1000 USB) to run
#   as schedulable kernel threads rather than in hardirq context. This allows
#   the IRQ threads to be assigned CPU affinity and RT priority (see Phase 9).
#   Without threadirqs, hardirq handlers preempt even SCHED_FIFO threads with
#   no way to constrain them.
#
# intel_idle.max_cstate=1 / processor.max_cstate=1:
#   Caps CPU idle depth at C1 (2µs exit latency). Without this, the CPU enters
#   C6 (133µs exit latency) between audio callbacks. At 64/48000 = 1.33ms
#   period, a 133µs wakeup takes 10% of the entire period budget just to become
#   active. These spikes manifest as periodic xruns under light load that appear
#   completely random and are difficult to diagnose. Both params are set for
#   belt-and-suspenders across intel_idle and acpi_idle drivers.
#
# preempt=full:
#   Enables PREEMPT=full on the stock Fedora PREEMPT_DYNAMIC kernel. Reduces
#   worst-case scheduler latency from ~2ms (PREEMPT_NONE/VOLUNTARY) to ~200µs.
#   For <50µs worst case, install kernel-rt (PREEMPT_RT):
#     sudo dnf install kernel-rt kernel-rt-devel
#   preempt=full is the correct tradeoff when kernel-rt is not yet validated.

step "Phase 5: CPU Isolation, C-States, Kernel Preemption (requires reboot)"
echo ""
echo "  Will add to GRUB_CMDLINE_LINUX:"
echo "    isolcpus=$AUDIO_CPUS  nohz_full=$AUDIO_CPUS  rcu_nocbs=$AUDIO_CPUS"
echo "    threadirqs  intel_idle.max_cstate=1  processor.max_cstate=1  preempt=full"
echo ""
echo "  Audio CPUs ($AUDIO_CPUS) derived from CPUAffinity in:"
echo "    $REPO_SERVICE"
echo "  IMPORTANT: isolcpus must always match CPUAffinity= — if you change one,"
echo "  change the other. A mismatch leaves audio threads on non-isolated cores."

if ask "Apply CPU isolation parameters to GRUB?"; then
    GRUB_FILE="/etc/default/grub"
    backup "$GRUB_FILE"

    CURRENT_CMDLINE=$(sudo grep "^GRUB_CMDLINE_LINUX=" "$GRUB_FILE" | cut -d'"' -f2)

    # Strip any old MAP2 RT params so we don't accumulate duplicates on re-runs
    CLEAN_CMDLINE=$(echo "$CURRENT_CMDLINE" | \
        sed -E 's/isolcpus=[^ ]*//g; s/nohz_full=[^ ]*//g; s/rcu_nocbs=[^ ]*//g; s/threadirqs//g; s/intel_idle\.max_cstate=[^ ]*//g; s/processor\.max_cstate=[^ ]*//g; s/preempt=[^ ]*//g; s/  */ /g; s/^ //; s/ $//')

    # Build the new complete parameter string
    RT_PARAMS="isolcpus=${AUDIO_CPUS} nohz_full=${AUDIO_CPUS} rcu_nocbs=${AUDIO_CPUS} threadirqs intel_idle.max_cstate=1 processor.max_cstate=1 preempt=full"
    NEW_CMDLINE="${CLEAN_CMDLINE} ${RT_PARAMS}"

    if $DRY_RUN; then
        dry "GRUB_CMDLINE_LINUX=\"$NEW_CMDLINE\""
    else
        sudo sed -i "s|^GRUB_CMDLINE_LINUX=.*|GRUB_CMDLINE_LINUX=\"$NEW_CMDLINE\"|" "$GRUB_FILE"

        # Regenerate GRUB boot entries
        if [[ -f /boot/grub2/grub.cfg ]]; then
            sudo grub2-mkconfig -o /boot/grub2/grub.cfg > /dev/null
        elif [[ -f /boot/efi/EFI/fedora/grub.cfg ]]; then
            sudo grub2-mkconfig -o /boot/efi/EFI/fedora/grub.cfg > /dev/null
        else
            warn "GRUB config not found at standard paths."
            warn "Run manually: sudo grub2-mkconfig -o /boot/grub2/grub.cfg"
        fi
    fi

    ok "GRUB: RT kernel parameters written"
    warn "REBOOT REQUIRED for CPU isolation and C-state changes to take effect"
    info "After reboot verify: cat /sys/devices/system/cpu/isolated"
    info "Expected: $AUDIO_CPUS"
    info "Also verify C-states: cat /sys/devices/system/cpu/cpu4/cpuidle/state*/name"
else
    warn "Skipping CPU isolation (latency floor will be higher without it)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 — CPU Governor
# ─────────────────────────────────────────────────────────────────────────────
# 'performance' governor: Keeps all CPU cores at maximum frequency at all times.
# Without this, frequency scaling (ondemand/powersave governor) reacts to load
# by reducing clock speed between audio callbacks, then scrambling back to full
# frequency during the callback — adding 50–200µs of frequency transition latency
# per period. On the Xeon E5-1650 v4, this is particularly important because
# Turbo Boost frequency transitions are not instantaneous.
#
# cpupower/tuned alternative: If tuned is installed, 'tuned-adm profile latency-
# performance' achieves the same effect plus additional kernel tuning. The service
# approach here is simpler and has no extra dependency.

step "Phase 6: CPU Governor"

if [[ -d /sys/devices/system/cpu/cpu0/cpufreq ]]; then
    if ask "Set CPU governor to 'performance' mode?"; then
        GOVERNOR_SVC_CONTENT="[Unit]
Description=MAP2 Audio — Set CPU governor to performance mode
# Performance governor eliminates frequency-scaling latency spikes during
# audio callbacks. Without this, cpufreq transitions add 50-200µs of jitter
# per period as the CPU ramps frequency up from idle between callbacks.
After=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo performance > \"\$f\"; done'

[Install]
WantedBy=multi-user.target"

        if $DRY_RUN; then
            dry "write /etc/systemd/system/map2-cpu-performance.service"
        else
            echo "$GOVERNOR_SVC_CONTENT" | sudo tee /etc/systemd/system/map2-cpu-performance.service > /dev/null
            sudo systemctl daemon-reload
            sudo systemctl enable --now map2-cpu-performance.service
        fi
        ok "CPU governor: performance mode (map2-cpu-performance.service enabled)"
    else
        warn "Skipping CPU governor — frequency scaling adds ~100µs jitter per callback"
    fi
else
    warn "CPU frequency scaling not available (may be disabled in BIOS or fixed-freq hardware)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 7 — MAP2 Systemd Service Files
# ─────────────────────────────────────────────────────────────────────────────
# Installs the base service and the two standard drop-in files from the REPO.
# This script does NOT embed a service template — the repo files are the single
# source of truth. If you need to change service config, edit the repo files and
# re-run this script or run: sudo cp <repo>/systemd/map2-backend.service /etc/systemd/system/
#
# Drop-in architecture:
#   Base unit (/etc/systemd/system/map2-backend.service):
#     Core config — PipeWire quantum, PIPEWIRE_LATENCY=64/48000, CPUAffinity,
#     LimitRTPRIO, CAP_SYS_NICE. This is what gets deployed here from the repo.
#
#   10-mode.conf (map2-mode.sh managed):
#     Mode-specific overrides (all-in-one vs dedicated audio). Installed here
#     with safe defaults. map2-mode.sh can replace it later for a different mode.
#
#   override.conf (session-level):
#     Re-asserts PIPEWIRE_LATENCY=64 and force-quantum=64 after mode drop-ins
#     that may raise them. Also pins CPUAffinity=<AUDIO_CPUS> as final word.
#     ExecStartPre entries in drop-ins APPEND to the base unit; override.conf
#     runs AFTER 10-mode.conf (sort order 'o' > '1') so its force-quantum=64
#     is the last value written and wins.
#
# INTENTIONAL: CPUSchedulingPolicy is NOT set to fifo on the uvicorn process.
#   Setting the entire uvicorn process to SCHED_FIFO would put the async HTTP
#   event loop, WebSocket handlers, and FastAPI workers into the RT scheduler,
#   starving kernel threads and non-RT system processes.
#   Only the JUCE audio callback thread needs RT; it self-elevates via
#   pthread_setschedparam() using CAP_SYS_NICE + LimitRTPRIO=95.

step "Phase 7: MAP2 Systemd Service Files"

if ask "Install/update MAP2 systemd service from repo?"; then
    # ── Base unit ──
    if $DRY_RUN; then
        dry "cp $REPO_SERVICE $SYS_SERVICE"
    else
        sudo cp "$REPO_SERVICE" "$SYS_SERVICE"
    fi
    ok "Base service installed: $SYS_SERVICE"

    # ── Drop-in directory ──
    run_sudo mkdir -p "$SYS_DROPINS_DIR"

    # ── 10-mode.conf (default: all-in-one mode with correct RT limits) ──
    # Installed here with safe defaults. map2-mode.sh replaces this for other modes.
    # CRITICAL FIX vs legacy version: LimitRTPRIO=95 (was 50 — insufficient for JUCE
    # audio thread target priority 80; caused silent SCHED_FIFO failure).
    MODE_CONF_CONTENT="# MAP2_MODE=all-in-one
# ──────────────────────────────────────────────────────────────────────
# ALL-IN-ONE mode systemd drop-in for map2-backend.service
# Managed by: map2-mode.sh → $SYS_DROPINS_DIR/10-mode.conf
#
# DESIGN: Combined audio + web UI on the same machine. Accepts slightly
# higher latency (~4-5 ms RTL) in exchange for responsiveness under
# simultaneous HTTP/WebSocket load.
#
# LimitRTPRIO=95: must be >= JUCE audio thread target priority (~80).
# Previous value of 50 caused silent SCHED_FIFO failure — audio thread
# fell back to SCHED_OTHER with catastrophic xrun rates.
# ──────────────────────────────────────────────────────────────────────

[Service]
LimitRTPRIO=95
LimitMEMLOCK=infinity
Nice=-10
IOSchedulingClass=realtime
IOSchedulingPriority=3
TimeoutStartSec=120
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal"

    if $DRY_RUN; then
        dry "write $SYS_DROPINS_DIR/10-mode.conf"
    else
        echo "$MODE_CONF_CONTENT" | sudo tee "$SYS_DROPINS_DIR/10-mode.conf" > /dev/null
    fi
    ok "Drop-in installed: $SYS_DROPINS_DIR/10-mode.conf"

    # ── override.conf (session-level final-word assertions) ──
    # ExecStartPre entries APPEND across drop-ins — order matters.
    # Base unit: force-rate 48000, force-quantum 64.
    # override.conf runs last (sort 'o' > '1') so its force-quantum=64 is final.
    # PREVIOUS BUG: this file contained force-quantum=128 and PIPEWIRE_LATENCY=128
    # which silently overrode the base unit's values, doubling the quantum.
    OVERRIDE_CONF_CONTENT="# MAP2 Backend — session-level override drop-in
# Managed by: setup_realtime.sh → $SYS_DROPINS_DIR/override.conf
#
# Re-asserts PipeWire quantum and RT capabilities after mode drop-ins.
# override.conf loads AFTER 10-mode.conf (sort: 'o' > '1'), so these
# values win over any mode-specific overrides.
#
# QUANTUM ORDER: force-rate resets quantum internally in PipeWire.
# Rate must be set before quantum — keep these lines in order.
#
# PIPEWIRE_LATENCY: must match clock.force-quantum (both = $TARGET_QUANTUM).
# CPUAffinity: must match GRUB isolcpus (both = ${AUDIO_CPUS}).

[Service]
Environment=\"XDG_RUNTIME_DIR=/run/user/1000\"
Environment=\"DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus\"
Environment=\"PIPEWIRE_REMOTE=pipewire-0\"
Environment=\"JACK_DEFAULT_SERVER=pipewire\"
Environment=\"PIPEWIRE_LATENCY=${TARGET_QUANTUM}/${TARGET_RATE}\"
ExecStartPre=/usr/bin/pw-metadata -n settings 0 clock.force-rate ${TARGET_RATE}
ExecStartPre=/usr/bin/pw-metadata -n settings 0 clock.force-quantum ${TARGET_QUANTUM}
CPUAffinity=${AUDIO_CPUS//,/ }
AmbientCapabilities=CAP_SYS_NICE
CapabilityBoundingSet=CAP_SYS_NICE
ReadWritePaths=/home/$USER/.local/share /home/$USER/.cache"

    if $DRY_RUN; then
        dry "write $SYS_DROPINS_DIR/override.conf"
    else
        echo "$OVERRIDE_CONF_CONTENT" | sudo tee "$SYS_DROPINS_DIR/override.conf" > /dev/null
    fi
    ok "Drop-in installed: $SYS_DROPINS_DIR/override.conf"

    if ! $DRY_RUN; then
        sudo systemctl daemon-reload
    fi
    ok "systemctl daemon-reload complete"
else
    warn "Skipping service installation"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 8 — PipeWire Low-Latency Configuration
# ─────────────────────────────────────────────────────────────────────────────
# Writes the single authoritative PipeWire fragment to the user's session config.
# The fragment sets default quantum/rate for the PipeWire session daemon before
# any pw-metadata commands run. The systemd service then applies force-quantum=64
# via pw-metadata at start time, which overrides the default and survives JACK
# client restarts within the session.
#
# IMPORTANT — what goes here vs pw-metadata (see Phase 7):
#   .conf file: session DEFAULTS (floor/ceiling) — PipeWire reads at startup
#   pw-metadata: runtime FORCE values — overrides defaults, survives client restart
#   Do NOT put force-quantum in the .conf file. It would lock the quantum at load
#   time and block any application that legitimately needs a different quantum
#   (e.g., rendering at 4096 samples for offline export).
#
# Legacy file cleanup:
#   10-low-latency.conf was written by map2-latency-optimizer.sh (older versions).
#   It set min-quantum=32 while this file set min-quantum=64 — conflicting values
#   with 99-map2-audio-latency.conf silently winning (higher sort order). The legacy
#   file has been removed; this file is now the single source of truth.

step "Phase 8: PipeWire Low-Latency Configuration"

if ask "Install PipeWire low-latency config (~/.config/pipewire/pipewire.conf.d/)?"; then

    run_cmd "mkdir -p '$USER_PW_CONF_DIR'"

    # Remove the legacy fragment if it exists (it's now a dead letter that
    # conflicts with this file on min-quantum and causes reader confusion)
    if [[ -f "$LEGACY_PW_CONF" ]]; then
        if $DRY_RUN; then
            dry "rm $LEGACY_PW_CONF  (legacy fragment — conflicts with 99-map2-audio-latency.conf)"
        else
            rm -f "$LEGACY_PW_CONF"
        fi
        warn "Removed legacy $LEGACY_PW_CONF"
    fi

    PW_CONF_CONTENT="# MAP2 Audio Platform — PipeWire Realtime-Latency Configuration
# $USER_PW_CONF
#
# Single authoritative PipeWire fragment for the MAP2 session.
# Do NOT add a second fragment with different min/max-quantum values —
# the highest-numbered file wins and conflicting values cause reader confusion.
#
# Targeting: <4 ms RTL on Edirol UA-1000 (USB HS, UAC1) at 48 kHz.
# Theoretical floor: ~2 ms USB framing + 1.33 ms ALSA period + scheduling.
#
# NOTE: clock.force-quantum is NOT set here. force-* values in .conf files
# are locked at PipeWire load time and cannot be overridden by pw-metadata.
# The force-quantum=${TARGET_QUANTUM} is applied at service start via ExecStartPre.

context.properties = {
    # ── Sample rate ────────────────────────────────────────────────────────
    # Single allowed rate eliminates on-the-fly resampling entirely.
    # Resampling adds variable latency and CPU load; all hardware on this
    # system natively supports 48 kHz.
    default.clock.rate          = ${TARGET_RATE}
    default.clock.allowed-rates = [ ${TARGET_RATE} ]

    # ── Quantum / buffer size ───────────────────────────────────────────────
    # min-quantum=32: Enables 32-sample (0.67 ms) operation once the system
    # proves stable. Hard floor for UAC1 is ~48 samples (1 USB frame); test
    # before reducing force-quantum below 64.
    # max-quantum=256: Prevents JACK clients from dragging the graph to a
    # high-latency quantum. 256 @ 48 kHz = 5.33 ms — the hard ceiling.
    default.clock.min-quantum   = 32
    default.clock.quantum       = ${TARGET_QUANTUM}
    default.clock.max-quantum   = 256

    # ── ALSA period buffering ───────────────────────────────────────────────
    # period-num=2: 2 ALSA periods instead of default 3. Each period = one
    # quantum (${TARGET_QUANTUM} samples = 1.33 ms). Saves one period of ALSA buffering = 1.33 ms RTL.
    # headroom=0: No extra sample padding at the ALSA layer.
    api.alsa.period-num         = 2
    api.alsa.headroom           = 0

    # ── Memory locking ──────────────────────────────────────────────────────
    # Prevents PipeWire graph memory from being paged to swap.
    # Requires memlock=unlimited in /etc/security/limits.d/ (Phase 1).
    mem.allow-mlock             = true
    mem.mlock-all               = true
}"

    if $DRY_RUN; then
        dry "write $USER_PW_CONF"
    else
        echo "$PW_CONF_CONTENT" | tee "$USER_PW_CONF" > /dev/null
    fi
    ok "PipeWire config: $USER_PW_CONF"
else
    warn "Skipping PipeWire config"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 9 — IRQ Affinity Pinning Service
# ─────────────────────────────────────────────────────────────────────────────
# The Edirol UA-1000 is connected to the xhci_hcd USB controller. Each USB audio
# frame fires an interrupt on this controller. By default (without affinity pinning)
# that interrupt lands on whichever CPU the kernel chooses — often a busy general-
# purpose core. The time from interrupt to audio data delivery is then the sum of:
#   interrupt latency + IRQ thread scheduling latency + cross-CPU wakeup latency
#
# With 'threadirqs' in the kernel cmdline (Phase 5), the hardirq handler runs as
# a kernel thread (irq/N-xhci_hcd). This thread can be pinned to the isolated audio
# CPUs via taskset, eliminating cross-CPU overhead. The kernel creates these threads
# with SCHED_FIFO/50 automatically — userspace does NOT need to call chrt on them.
#
# The map2-irq-affinity.service runs once at boot (Before=map2-backend.service)
# and applies affinity to all xhci_hcd and ehci_hcd IRQ threads. It dynamically
# detects the IRQ number by PCI address (0000:00:14.0 for UA-1000) so it survives
# hardware enumeration changes.

step "Phase 9: IRQ Affinity Pinning Service"

if [[ ! -f "$REPO_IRQ_SCRIPT" ]]; then
    warn "IRQ affinity script not found: $REPO_IRQ_SCRIPT"
    warn "Skipping Phase 9 — run setup again after ensuring the repo is complete."
elif ask "Install UA-1000 IRQ affinity pinning service?"; then
    # Install the script
    run_sudo cp "$REPO_IRQ_SCRIPT" "$SYS_IRQ_SCRIPT"
    run_sudo chmod 755 "$SYS_IRQ_SCRIPT"
    ok "IRQ script installed: $SYS_IRQ_SCRIPT"

    # Install the service unit
    run_sudo cp "$REPO_IRQ_SERVICE" "$SYS_IRQ_SERVICE"
    ok "IRQ service installed: $SYS_IRQ_SERVICE"

    if ! $DRY_RUN; then
        sudo systemctl daemon-reload
        sudo systemctl enable map2-irq-affinity.service
        sudo systemctl start map2-irq-affinity.service
    else
        dry "systemctl enable + start map2-irq-affinity.service"
    fi
    ok "map2-irq-affinity.service enabled and started"

    if ! $DRY_RUN; then
        XHCI_IRQ=$(grep -E 'xhci' /proc/interrupts | awk -F: '{print $1}' | tr -d ' ' | head -1)
        if [[ -n "$XHCI_IRQ" ]]; then
            ACTIVE_AFFINITY=$(cat "/proc/irq/${XHCI_IRQ}/smp_affinity_list" 2>/dev/null || echo "unknown")
            info "IRQ ${XHCI_IRQ} (xhci_hcd) affinity: CPUs $ACTIVE_AFFINITY"
        fi
    fi
else
    warn "Skipping IRQ affinity service"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 10 — rtkit-daemon
# ─────────────────────────────────────────────────────────────────────────────
# rtkit (RealtimeKit) is a D-Bus service that elevates thread scheduling classes
# on behalf of user processes without requiring CAP_SYS_NICE or root. PipeWire
# uses rtkit as its primary mechanism to promote audio threads to SCHED_FIFO.
#
# Privilege escalation path for JUCE audio callback thread:
#   Option A (preferred): CAP_SYS_NICE via AmbientCapabilities in service unit.
#     The thread calls pthread_setschedparam(SCHED_FIFO, 80) directly.
#   Option B (fallback): rtkit elevates the thread via D-Bus on PipeWire's behalf.
#     Requires rtkit-daemon to be running.
#
# Both options are enabled in this setup. If CAP_SYS_NICE is stripped by a
# security policy, rtkit is the safety net preventing audio thread fallback to
# SCHED_OTHER. rtkit-daemon is a hardened, privilege-separated daemon — it is
# safe to enable on production systems.

step "Phase 10: rtkit-daemon"

if systemctl is-active rtkit-daemon &>/dev/null; then
    ok "rtkit-daemon already active"
else
    if ask "Enable rtkit-daemon (RT scheduling safety net for PipeWire)?"; then
        if ! $DRY_RUN; then
            sudo systemctl enable --now rtkit-daemon
        else
            dry "systemctl enable --now rtkit-daemon"
        fi
        ok "rtkit-daemon enabled"
    else
        warn "rtkit-daemon not enabled — JUCE RT scheduling depends solely on CAP_SYS_NICE"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 11 — Apply Live (no-reboot) Changes
# ─────────────────────────────────────────────────────────────────────────────
# The following take effect immediately without a reboot:
#   - PipeWire force-quantum/rate via pw-metadata
#   - Service reload (picks up service file changes)
#   - IRQ affinity (already applied by Phase 9)
#
# Changes that require reboot (Phase 5): isolcpus, nohz_full, rcu_nocbs,
# intel_idle.max_cstate, preempt=full. These only take effect via the new
# kernel cmdline loaded at next boot.

step "Phase 11: Apply Live Changes"

if ! $DRY_RUN; then
    # Restart the backend service to pick up all changes
    if systemctl is-active map2-backend &>/dev/null; then
        if ask "Restart map2-backend.service now to apply all live changes?"; then
            sudo systemctl restart map2-backend
            sleep 6

            # Verify quantum
            LIVE_Q=$(pw-metadata -n settings 2>/dev/null | \
                grep "key:'clock.force-quantum'" | grep -oP "value:'\K[0-9]+" || echo "?")
            if [[ "$LIVE_Q" == "$TARGET_QUANTUM" ]]; then
                ok "Live PipeWire force-quantum: $LIVE_Q ✓"
            else
                warn "Live force-quantum=$LIVE_Q (expected $TARGET_QUANTUM) — check drop-in files"
            fi

            # Verify RT threads
            MAP2_PID=$(pgrep -f "uvicorn app.main" 2>/dev/null | head -1 || echo "")
            if [[ -n "$MAP2_PID" ]]; then
                RT_THREADS=$(ps -eLo pid,comm,cls,rtprio | awk -v pid="$MAP2_PID" '$1==pid && $3=="FF"' | wc -l)
                ok "RT threads in map2 process: $RT_THREADS threads at SCHED_FIFO"
            fi
        fi
    else
        info "map2-backend not running — changes will apply on next start"
    fi
else
    dry "restart map2-backend and verify live quantum"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Setup Complete${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Changes applied:"
echo "    ✅ RT limits   /etc/security/limits.d/99-map2-audio.conf"
echo "    ✅ USB audio   /etc/modprobe.d/audio-usb.conf"
echo "    ✅ Memory      /etc/sysctl.d/99-map2-audio.conf + THP=madvise"
echo "    ✅ I/O sched   /etc/udev/rules.d/60-ioschedulers.rules"
echo "    ✅ PipeWire    $USER_PW_CONF"
echo "    ✅ IRQ affinity /etc/systemd/system/map2-irq-affinity.service"
echo "    ✅ rtkit-daemon enabled"
echo ""
echo "  Requires reboot (Phase 5):"
echo "    ⏳ GRUB: isolcpus=${AUDIO_CPUS} nohz_full=${AUDIO_CPUS} rcu_nocbs=${AUDIO_CPUS}"
echo "    ⏳ GRUB: intel_idle.max_cstate=1 processor.max_cstate=1 preempt=full"
echo ""
echo "  NEXT STEPS:"
echo ""
echo "  1. LOG OUT and LOG IN (new audio group membership, PAM limits)"
echo ""
echo "  2. REBOOT (kernel cmdline changes):"
echo "     sudo reboot"
echo ""
echo "  3. After reboot, verify isolation and C-states:"
echo "     cat /sys/devices/system/cpu/isolated"
echo "     cat /sys/devices/system/cpu/cpu${AUDIO_CPUS%%,*}/cpuidle/state*/name"
echo "     pw-metadata -n settings | grep force-quantum"
echo "     ps -eLo pid,comm,cls,rtprio | grep -E 'FF|pipewire'"
echo ""
echo "  4. Measure round-trip latency (physical loopback cable required):"
echo "     jack_iodelay"
echo "     # Target: <4 ms with UA-1000 UAC1 hardware floor"
echo ""
echo "  5. Optional — install kernel-rt for PREEMPT_RT (<50µs jitter vs ~200µs):"
echo "     sudo dnf install kernel-rt kernel-rt-devel"
echo ""
echo "  6. Run RT config verification:"
echo "     ./scripts/verify_rt_config.sh"
echo ""
