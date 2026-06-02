# Philosophy — How Stock Fedora Has Been Altered by the MAP Platform

> **Audience:** Anyone deploying, auditing, or recovering a MAP2 host.
> **Scope:** Every documented modification MAP2 makes to a stock Fedora installation — kernel, scheduler, memory, systemd, PipeWire, security limits, udev, network, filesystem layout — with the rationale for each.

## 1. The thesis

A stock Fedora install ships for a general-purpose desktop or server. MAP2 needs a deterministic real-time audio host. The deltas between those two postures are large but well-defined: thirteen mechanism categories, every change idempotent, every change reversible, every change visible in the repo.

Two principles govern the modifications:

1. **No silent magic.** Every change is in a tracked file (systemd unit, sysctl drop-in, PipeWire fragment, RPM spec). Nothing is set "by hand at install time and forgotten".
2. **Fail loud.** A misapplied tweak should be obvious — e.g. RT scheduling fails noisily without `LimitRTPRIO`, rather than silently degrading to SCHED_OTHER.

## 2. Kernel cmdline (GRUB)

`/etc/default/grub` adds:

```
isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5 threadirqs
intel_idle.max_cstate=1 processor.max_cstate=1
preempt=full
```

| Flag | Reason |
|---|---|
| `isolcpus=4,5` | Remove cores 4–5 from the general scheduler. The audio thread runs there exclusively. |
| `nohz_full=4,5` | Disable the 1 kHz scheduler tick on those cores — eliminates a 1 ms periodic jitter source. |
| `rcu_nocbs=4,5` | Move RCU callbacks off audio cores. |
| `threadirqs` | Convert hard-IRQ handlers to kernel threads so they can be SCHED_FIFO'd and pinned. |
| `intel_idle.max_cstate=1` / `processor.max_cstate=1` | Cap CPU sleep states at C1 (~2 µs exit latency). C6 wake-ups cost ~133 µs and are catastrophic for a 1.33 ms audio period. |
| `preempt=full` | Aggressive kernel preemption (~200 µs worst case vs. ~2 ms stock). The route to even lower jitter is `kernel-rt`, recommended but optional. |

GRUB changes require a reboot to apply. The platform deliberately does not auto-reboot — the operator is told.

## 3. Systemd services installed by MAP2

The repo's `systemd/` directory and `packaging/rpm/map2.spec` lay these down under `/etc/systemd/system/` (development) or `/usr/lib/systemd/system/` (RPM):

| Service | Purpose |
|---|---|
| `map2-backend.service` | FastAPI uvicorn hosting the JUCE audio engine on port 8080. |
| `map2-irq-affinity.service` | Pins `xhci_hcd` IRQs to cores 4–5 and gives the IRQ thread SCHED_FIFO/50. |
| `map2-cpu-performance.service` | Sets every CPU's scaling governor to `performance` (eliminates cpufreq ramp jitter). |
| `map2-ptp4l.service` | `ptp4l` for IEEE 802.1AS gPTP, gated by `/etc/map2/avb-enabled`. |
| `map2-phc2sys.service` | Syncs `CLOCK_REALTIME` to the PTP hardware clock. |
| `map2-srpd.service` | SRP/MSRP admission daemon for AVB streams. |
| `map2-boot-manager.service` | Boot-time readiness checks. |
| `map2-web-prod.service` | Serves the production React bundle on port 3000. |
| `map2-controller-host` (binary, not a service) | The supervised controller host process, spawned by `controller_host_service.py` rather than systemd. |

## 4. systemd drop-ins for the backend

Under `/etc/systemd/system/map2-backend.service.d/`:

- **`10-mode.conf`** — written by `map2-mode` (see §10). Sets `LimitRTPRIO=95`, `LimitMEMLOCK=infinity`, `Nice=-10`, `IOSchedulingPriority` per mode (AUDIO, ALL-IN-ONE, CONTROL-NODE).
- **`override.conf`** — re-applies PipeWire `force-rate 48000` then `force-quantum 64` (rate first, quantum second — order matters), pins `CPUAffinity=4 5` (last-write-wins over `10-mode.conf`), and grants `CAP_SYS_NICE CAP_NET_RAW`.

Drop-ins are sorted lexically; `o` > `1`, so `override.conf` wins for last-write fields. `ExecStartPre` is additive across drop-ins, so PipeWire metadata pushes happen *after* the base unit's, not instead of them.

## 5. PipeWire fragment

`~/.config/pipewire/pipewire.conf.d/99-map2-audio-latency.conf` is the **only** MAP2 PipeWire fragment (`10-low-latency.conf` was removed 2026-02-26 to avoid conflicting blocks). It sets:

```
default.clock.rate         = 48000
default.clock.quantum      = 64
default.clock.min-quantum  = 32
default.clock.max-quantum  = 256
api.alsa.period-num        = 2
api.alsa.headroom          = 0
mem.mlock-all              = true
```

Critical rule: `force-quantum` must **not** appear in `pipewire.conf.d`. If set in config, it blocks runtime overrides — and the systemd `ExecStartPre pw-metadata` calls won't take effect. The pattern is "config sets the bounds, runtime metadata pushes the operating point".

## 6. Security limits

`/etc/security/limits.d/99-map2-audio.conf`:

```
@audio   -  rtprio     99
@audio   -  memlock    unlimited
@audio   -  nice       -20
*        -  rtprio     95
*        -  memlock    unlimited
```

Reads at PAM time, so a new login session is required after install. Without these, SCHED_FIFO requests silently demote to SCHED_OTHER and `mlockall` returns EPERM — both invisible failures unless you know to look.

## 7. Sysctl drop-ins

Five files under `/etc/sysctl.d/`:

- **`91-map2-audio-rt.conf`** — `kernel.sched_rt_runtime_us = 2950000` against a `period_us = 3000000`, giving the audio thread 98.3 % of RT CPU time. `kernel.sched_autogroup_enabled = 0` disables autogroup so SCHED_FIFO is honoured per-thread.
- **`92-map2-audio-thp.conf`** — `vm.transparent_hugepage = never`. THP defragmentation can pause for tens of milliseconds. Audio cannot tolerate that. `vm.page-cluster = 0` disables read-ahead. `vm.max_map_count = 262144` accommodates large plugin graphs.
- **`93-map2-audio-swappiness.conf`** — `vm.swappiness = 0` (never swap). `vm.oom_kill_allocating_task = 1` (kill the offender, not a random process). `vm.compaction_proactiveness = 0` (no proactive compaction stalls).
- **`94-map2-audio-watchdog.conf`** — `kernel.nmi_watchdog = 0`, `softlockup_panic = 0`, `hung_task_timeout_secs = 0`, `printk_ratelimit = 0`. Frees ~1 % CPU and removes a class of periodic interruptions.
- **`99-map2-audio.conf`** — legacy file, kept additive.

## 8. udev

`/etc/udev/rules.d/90-map2-maschine-mk1.rules` grants the `audio` group access to the Native Instruments Maschine MK1 (`17cc:0808`) with `MODE="0660" GROUP="audio" TAG+="uaccess"`. This is required so the controller-host process can detach and reattach the kernel HID driver cleanly without root.

Other USB audio devices use the kernel's class-compliant drivers and need no udev customisation.

## 9. CPU governor and power

`map2-cpu-performance.service` sets every `/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor` to `performance`. Reasoning: the `ondemand` and `schedutil` governors ramp the CPU clock based on load, and the ramp itself is a 50–200 µs jitter source. Locking to `performance` trades a small amount of idle power for predictable timing.

The platform does **not** install `kernel-rt` automatically, but the install runbooks recommend it. Stock `preempt=full` plus `isolcpus` plus C-state caps achieves the documented 4–7 ms RTL targets; `kernel-rt` lowers worst-case jitter from ~200 µs to ~50 µs.

## 10. Installation — single canonical RPM

The platform ships **one installer**: the RPM built from `packaging/rpm/map2.spec`
via `packaging/build-rpm.sh`. The earlier parallel installers
(`install_on_new_host.sh`, the Textual `installer/` TUI + its `./install`
launcher, `web/install.sh`, `lcd/install_lcd.sh`) and the legacy
`packaging/map2-audio.spec` were retired in favor of this single FHS-compliant,
service-user, sandboxed package.

Host real-time tuning is **not** part of the package — it remains an operator
step via `scripts/setup_realtime.sh` (the eleven-phase real-time setup: limits,
USB autosuspend disable, swappiness, I/O scheduler, GRUB, governor, systemd,
PipeWire, IRQ affinity, rtkit-daemon, runtime quantum). AVB host prep stays in
`scripts/setup_avb.sh` / `scripts/uninstall_avb.sh`. These are tuning tools, not
installers.

The mode helper at `/usr/local/bin/map2-mode` writes `10-mode.conf` based on the
chosen deployment mode. Operators do not edit drop-ins by hand.

Build the RPM:

```bash
./packaging/build-rpm.sh 1.0.0 1
sudo dnf install -y ./dist/map2-1.0.0-1.*.x86_64.rpm
```

## 11. RPM packaging

`packaging/rpm/map2.spec` builds the React frontend + native engine from source
and lays down the strict FHS layout:

- `/opt/map2-audio/{app, web/dist, scripts, device-packs, juce-engine/build, tui, lcd, docs/install}` — immutable application tree.
- `/etc/map2/` — Prometheus configs, Grafana configs, the SonoBus env example, PipeWire fragment.
- `/var/lib/map2`, `/var/cache/map2`, `/var/log/map2`, `/run/map2` — runtime state/cache/log/runtime, provisioned by `systemd-tmpfiles` in `%post`.
- `/usr/lib/systemd/system/map2-*.service` — services (backend, frontend, controller-host, cluster, tui, prometheus, grafana, ptp4l, phc2sys, srpd, sonobus-transport) + `map2-avb.target`.
- `/usr/lib/sysusers.d/map2.conf` + `/usr/lib/tmpfiles.d/map2.conf` — declarative service-user + dir provisioning.
- `/usr/bin/{map2-cli, map2-self-test}` — operator CLI symlinks into the app tree.

`%pre` creates the dedicated `map2` system user via `systemd-sysusers` (UID per
`/etc/login.defs`). `%post` provisions the FHS dirs via `systemd-tmpfiles`, adds
`map2` to audio/pipewire/pipewire-system/video/input/plugdev groups, and runs
the systemd unit refresh. `%preun` stops/disables units on uninstall. Uninstall
**deliberately preserves** the `map2` user and `/var/lib/map2/` per FHS §5.5 —
operator data survives upgrades.

## 12. SELinux and other host services

`systemd/map2-selinux-disable.service` is a oneshot that runs `setenforce 0` and rewrites `/etc/selinux/config`. SELinux's audit overhead and policy mismatches against PipeWire/realtime-kit are not worth the security trade for a dedicated audio appliance. Operators who want SELinux on need to write the policy; the platform does not ship one.

The platform does **not** mass-disable other services (Bluetooth, CUPS, etc.). Mode-specific deployments may mask them, but the default install leaves them alone — this is not a stripped-down appliance image, it is a tuned Fedora install.

## 13. Network and firewall (AVB)

When `/etc/map2/avb-enabled` exists:

- `map2-ptp4l.service` runs `ptp4l -f /etc/ptp4l.conf -i <interface>` (interface comes from `MAP2_AVB_INTERFACE`).
- `map2-phc2sys.service` syncs the system clock.
- `map2-srpd.service` runs `mrpd` for stream reservation.

The platform does not currently install firewall rules. AVB uses the multicast MAC `01:80:C2:00:00:0E` for 802.1AS and per-stream MACs for AVTP. Operators with `firewalld` enabled need to either disable it on the AVB interface or accept that AVB will not function. This is documented in `docs/avb-setup.md`.

## 14. Filesystem layout

| Path | What |
|---|---|
| `/opt/map2-audio/` | RPM-installed immutable application tree (app, web/dist, engine, scripts, device-packs). |
| `/etc/map2/` | Configuration, including `avb-enabled` flag and node identity. |
| `/var/lib/map2/` | Persistent state: SQLite databases, asset caches, controller-host state, bootstrap secret. |
| `/var/cache/map2/` | Caches. |
| `/var/log/map2/` | Logs. |
| `/run/map2/` | Runtime sockets + PID files. |
| `~/.config/pipewire/pipewire.conf.d/` | Per-user PipeWire fragment (dev-host audio user); system installs use the system-wide instance. |

## 15. Reversibility

Every modification is a file. To revert:

1. Remove `/etc/sysctl.d/9?-map2-*.conf` and `sysctl --system`.
2. Remove `/etc/security/limits.d/99-map2-audio.conf`.
3. Remove `/etc/udev/rules.d/90-map2-*.rules` and `udevadm control --reload`.
4. Disable and remove `map2-*.service` units.
5. Edit `/etc/default/grub` to remove the cmdline additions; `grub2-mkconfig -o /boot/grub2/grub.cfg`; reboot.
6. Remove the PipeWire fragment.
7. `dnf remove map2` (preserves `map2` user + `/var/lib/map2/`; to fully decommission: `userdel map2 && groupdel map2 && rm -rf /var/lib/map2`).
8. Re-enable SELinux if `setenforce 0` was applied.

`/var/lib/map2/` is preserved unless explicitly removed.

## 16. Where to read next

- `packaging/rpm/map2.spec` — the single canonical RPM (full file list + scriptlets).
- `packaging/build-rpm.sh` — the one build driver for the RPM.
- `scripts/setup_realtime.sh` — the eleven-phase real-time host-tuning script.
- `systemd/` — every service unit and drop-in.
- `docs/avb-setup.md` — the AVB-specific host preparation.
