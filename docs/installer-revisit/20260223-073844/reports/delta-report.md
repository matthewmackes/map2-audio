# MAP2 Delta Report

## Metadata
- Audit timestamp: 2026-02-23T12:39:10Z
- Hostname: MAP2-TESTBED
- Fedora release: Fedora Linux 43 (Server Edition)
- Kernel: 6.18.5-200.fc43.x86_64 (PREEMPT_DYNAMIC)
- Architecture: x86_64
- Baseline model: Fedora Server baseline approximated from dnf5 comps groups (`core`, `server-product`, `standard`, `hardware-support`, `headless-management`, `networkmanager-submodules`)
- Raw evidence root: `/var/tmp/map2-audit-20260223-073844/raw`

## Baseline Assumptions
- A pristine baseline host was not available; baseline package expectations were derived from Fedora comps group metadata on this host.
- `dnf group info "Fedora Server Edition"` returned no body in dnf5, so `server-product` was used as the practical server-core proxy.
- Baseline service posture assumed Fedora defaults (`preset: enabled`) plus core/server defaults (not MAP2-specific units).
- Root-required evidence was supplemented with `sudo -n` captures in `docs/installer-revisit/20260223-073844/evidence/`.

## Summary Table
| Category | Baseline Value | Current Value | Delta | Required? |
|---|---|---|---|---|
| OS / Kernel | Fedora Server on standard kernel | Fedora 43 Server, kernel `6.18.5`, custom cmdline (`isolcpus`, `nohz_full`, `rcu_nocbs`, `threadirqs`) | Host is latency-tuned but not PREEMPT_RT | REQUIRED for MAP2 audio stability, OPTIONAL for generic server baseline |
| Packages | ~132 packages from installed comps groups | 1264 installed packages | +1153 beyond baseline model | REQUIRED (MAP2 + build/runtime footprint) |
| Repositories | Fedora defaults | `fedora`, `updates`, `fedora-cisco-openh264` | No third-party repos enabled | OK |
| Modules | None enabled by default | None enabled | No module delta | OK |
| Services | `firewalld` preset enabled on Fedora server | `firewalld` installed but inactive/disabled; MAP2 services active/enabled mix | Security/network control plane drift; MAP2 runtime active | REQUIRED |
| MAP2 Services | None in baseline | `map2-backend` active but disabled; `map2-web-prod` active+enabled; `map2-web-dev` enabled but inactive; `map2-selinux-disable.service` not found | Inconsistent enablement and one missing unit reference | REQUIRED |
| Security | SELinux enforcing, least-privilege sudo expected | SELinux enforcing; `/etc/sudoers.d/mm` grants `NOPASSWD:ALL` | Elevated operator privilege beyond least-privilege target | SHOULD (security hardening) |
| Firewall / Network | Managed by `firewalld` | `firewalld` not running; network interface `enp0s25` carries MAP2 traffic; port 80/3000/8080 listening | No active zone/rule enforcement despite exposed services | REQUIRED |
| Audio Stack | Fedora audio defaults | PipeWire/WirePlumber active in user session; multiple MAP2 limits/sysctl drop-ins | Audio runtime present, but tuning overlaps conflict (`swappiness`, `sched_rt_runtime_us`) | REQUIRED |
| AVB / TSN | No AVB stack in stock baseline | NIC supports HW timestamping and `/dev/ptp0` exists; `linuxptp` absent; `pmc` absent; `iproute-tc` absent; no ptp services | AVB readiness partial (hardware yes, software stack missing) | REQUIRED for AVB profile |
| Plugin Subsystem | Minimal baseline plugin footprint | LV2 and VST3 trees populated (`/usr/lib64/lv2`, `/home/mm/.vst3`) | MAP2 plugin ecosystem present | REQUIRED for standard profile |

## Prioritized Action List
### Must
- Install AVB tooling: `linuxptp` and `iproute-tc`; add `ptp4l`/`phc2sys` units and config under `/etc/linuxptp` for AVB profile.
- Enable and manage `firewalld`; define MAP2 service policy (web `3000/tcp`, API `8080/tcp`, AVB-related multicast/PTP rules as needed).
- Normalize conflicting realtime tuning in `/etc/sysctl.d/*.conf` and `/etc/security/limits.d/*.conf` to one profile-driven source of truth.
- Reconcile MAP2 service intent: ensure `map2-backend` enablement matches desired boot behavior and disable `map2-web-dev.service` in production profile.
- Remove stale/missing unit references (`map2-selinux-disable.service`) from runtime expectations or provide packaged unit.

### Should
- Replace broad `mm ALL=(ALL) NOPASSWD:ALL` with least-privilege command aliases for installer/operations tasks.
- Add explicit SELinux labeling plan for `/var/lib/map2` and `/var/log/map2` via `semanage fcontext` + `restorecon`.
- Add AVB verification health checks to installer `verify` report (ptp state, qdisc/class checks, multicast reachability).

### Could
- Add optional plugin cache prewarm and integrity checks for LV2/VST3 discovery.
- Provide optional `map2-avb` profile helper that toggles NIC/queue policy templates per interface.

## Capability Matrix
| Capability | Packages | Services | Config / Drop-ins | Firewall | SELinux | Verification |
|---|---|---|---|---|---|---|
| Core runtime | `map2-core`, `map2-config`, `map2-services` | `map2-backend.service`, `map2-boot-manager.service` | `/etc/map2/environment`, backend unit drop-ins | API access rules | `fcontext` for `/var/lib/map2` | `systemctl is-active map2-backend` |
| Audio subsystem | `pipewire`, `alsa-lib`, `rtkit` | user `pipewire`, `wireplumber` | `/etc/security/limits.d/99-map2-audio.conf`, `/etc/sysctl.d/91-94-map2*` | none required | inherit targeted policy | `ulimit -r`, `ulimit -l`, PipeWire service state |
| Plugin subsystem | `lv2`, `lilv`, optional VST3 host deps | MAP2 backend plugin scan path | `/usr/lib64/lv2`, `/home/mm/.vst3` | none required | read access labels | plugin discovery command / API endpoint |
| Web/UI/API | `map2-web`, node runtime | `map2-web-prod.service` | `/etc/systemd/system/map2-web-prod.service` | `3000/tcp`, `8080/tcp`, optional `80/tcp` proxy | log/data labels | `ss -ltnp`, health/version endpoints |
| Operations | `logrotate`, diagnostics tooling | MAP2 health/system-check units | `/var/log/map2`, backup/state dirs | optional admin access policy | policy for logs/state | installer `verify` JSON output |
| Security posture | `policycoreutils`, `firewalld` | `firewalld.service` | `/etc/sudoers.d/*`, systemd hardening | zone/service rules | enforcing + map2 fcontexts | `getenforce`, `firewall-cmd --state` |
| AVB/TSN subsystem | `linuxptp`, `iproute-tc` | `ptp4l.service`, `phc2sys.service` | `/etc/linuxptp/ptp4l.conf`, qdisc scripts/drop-ins | multicast/PTP allowances | optional policy module only if required | `ethtool -T`, `pmc`, `tc qdisc/class` |

## Reuse-First Installer Plan
For every mutating step, emit WHAT / WHY / COMMANDS / VERIFY / ROLLBACK.

### Step IDs
- STEP-001 (`audit`): capture pre-change state under `/var/tmp/map2-audit-<ts>` and baseline assumptions.
- STEP-010 (`install`): inventory and adopt existing packages/services/configs before installing.
- STEP-020 (`install`): install missing packages by profile (`minimal`, `standard`, `avb`).
- STEP-030 (`install`): apply drop-ins/config templates with backup+hash and state manifest ownership attribution.
- STEP-040 (`install`): enable/disable profile-specific services with idempotent checks.
- STEP-050 (`install`): apply firewall and SELinux actions.
- STEP-060 (`verify`): produce structured post-install verification JSON.
- STEP-070 (`uninstall`): remove installer-owned assets only and restore backups where requested.

## Verification Plan
- `systemctl is-active map2-backend.service`
  - Expected: `active`
- `systemctl is-enabled map2-backend.service`
  - Expected: `enabled` (target production intent)
- `systemctl is-active firewalld.service`
  - Expected: `active`
- `firewall-cmd --list-services`
  - Expected: includes MAP2 required services
- `ls -l /dev/ptp*`
  - Expected: at least one PHC device
- `systemctl is-active ptp4l phc2sys`
  - Expected: `active` for AVB profile
- `pmc -u -b 0 'GET CURRENT_DATA_SET'`
  - Expected: stable dataset output
- `tc qdisc show dev enp0s25`
  - Expected: configured qdisc policy (not command-not-found)

## Rollback Plan
- Package rollback: `dnf history undo <transaction-id>` or remove installer-owned packages from `/var/lib/map2/installer/state.json`.
- Config rollback: restore timestamped backups captured before mutation and rerun `systemctl daemon-reload` / `sysctl --system` as applicable.
- Service rollback: disable newly enabled services and re-enable prior service state from installer state manifest.
- SELinux rollback: remove added fcontext rules with `semanage fcontext -d`, then `restorecon`.
