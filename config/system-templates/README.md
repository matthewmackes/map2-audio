# System Configuration Templates

This directory contains system configuration file templates that are deployed to `/etc/` and user home directories during installation by `install_on_new_host.sh`.

## Files and Deployment Targets

### Kernel & System Tuning
- **`etc-sysctl-d-91-map2-audio-rt.conf`** → `/etc/sysctl.d/91-map2-audio-rt.conf`
  - Realtime scheduling budget configuration
  - Ensures audio thread gets guaranteed CPU time (98% of RT budget)

- **`etc-sysctl-d-92-map2-audio-thp.conf`** → `/etc/sysctl.d/92-map2-audio-thp.conf`
  - Disables Transparent Huge Pages (THP) for low-latency
  - Eliminates compaction-induced latency spikes

- **`etc-sysctl-d-93-map2-audio-swappiness.conf`** → `/etc/sysctl.d/93-map2-audio-swappiness.conf`
  - Disables swap completely to prevent disk I/O latency
  - Configures OOM killer behavior

- **`etc-sysctl-d-94-map2-audio-watchdog.conf`** → `/etc/sysctl.d/94-map2-audio-watchdog.conf`
  - Disables NMI watchdog and soft lockup detection
  - Reduces ~1% CPU overhead from periodic interrupts

### Boot Configuration
- **`etc-default-grub-d-20-map2-audio-latency.cfg`** → `/etc/default/grub.d/20-map2-audio-latency.cfg`
  - Kernel boot parameters for CPU isolation (`isolcpus`, `nohz_full`, `rcu_nocbs`)
  - Requires GRUB regeneration and reboot to take effect

- **`etc-default-irqbalance`** → `/etc/default/irqbalance`
  - Excludes isolated cores (4,5) from IRQ balancing
  - Prevents audio device IRQs from migrating to isolated cores

### Mode Configuration
- **`etc-guitarfx-mode.conf`** → `/etc/guitarfx-mode.conf`
  - Central configuration for system mode (audio/all-in-one/management)
  - Read/written by `scripts/map2-mode.sh`, API endpoints, and verification scripts

### Systemd Services
- **`etc-systemd-system-map2-cpu-governor.service`** → `/etc/systemd/system/map2-cpu-governor.service`
  - Sets CPU governor to 'performance' mode at boot

- **`etc-systemd-system-map2-disable-turbo.service`** → `/etc/systemd/system/map2-disable-turbo.service`
  - Disables CPU turbo boost for predictable latency

- **`etc-systemd-system-map2-verify-isolation.service`** → `/etc/systemd/system/map2-verify-isolation.service`
  - Runs CPU isolation verification at boot
  - Depends on `usr-local-bin-map2-verify-isolation.sh`

### Systemd Drop-ins & Overrides
- **`etc-systemd-system-map2-backend.service.d-audio-mode-override.conf`** → `/etc/systemd/system/map2-backend.service.d/audio-mode-override.conf`
  - **LEGACY:** Strict realtime tuning for AUDIO mode (CPUAffinity=4,5)
  - Being replaced by new `systemd/modes/` templates

- **`etc-systemd-system-map2-backend.service.d-all-in-one-override.conf`** → `/etc/systemd/system/map2-backend.service.d/all-in-one-override.conf`
  - **LEGACY:** Balanced tuning for ALL-IN-ONE mode
  - Being replaced by new `systemd/modes/` templates

- **`etc-systemd-journald.conf.d-map2-audio.conf`** → `/etc/systemd/journald.conf.d/map2-audio.conf`
  - Configures journald for volatile (memory-only) logging
  - Eliminates disk I/O jitter from system logging

- **`etc-systemd-user@.service.d-pipewire-affinity.conf`** → `/etc/systemd/user@.service.d/pipewire-affinity.conf`
  - Pins PipeWire to housekeeping cores (0-3)
  - Prevents audio graph manager from interfering with isolated cores

### Audio Configuration
- **`home-mm-.config-pipewire-pipewire.conf.d-99-map2-audio-latency.conf`** → `~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf`
  - Low-latency PipeWire settings (48kHz fixed, quantum=64)
  - Disables resampling for minimal latency

## Usage

These files are automatically deployed by:
- **`install_on_new_host.sh`** - Initial system installation
- **`scripts/map2-mode.sh`** - Mode switching (reads deployed files, not templates)

## Notes

⚠️ **DO NOT** delete these templates - they are required for deploying MAP2 Audio to new systems.

📝 Files with `etc-` or `home-mm-` prefixes indicate their deployment path with `/` replaced by `-`.

🔄 The legacy override files (`audio-mode-override.conf`, `all-in-one-override.conf`) are being phased out in favor of the new `systemd/modes/` template system managed by `map2-mode.sh`.
