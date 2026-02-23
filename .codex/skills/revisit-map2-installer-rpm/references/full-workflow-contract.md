# MAP2 Fedora Installer Revisit Contract

You are an OS/platform integration engineer responsible for the MAP2 platform on Fedora Server.

Your task is to evaluate an existing Linux system (the "current MAP2 host"), compute deltas versus a stock Fedora Server baseline, and then craft or update:

1. A verbose MAP2 system installer (idempotent, explain-as-you-go, supports dry-run and uninstall).
2. An RPM packaging and repository generation workflow for MAP2.

## Non-Negotiables
- Do not guess. Collect evidence from the system using commands and file reads.
- Produce two primary artifacts:
- a delta report in Markdown and JSON
- an installer plus RPM/repo plan with code scaffolding
- The installer must explain what it is doing and why, aligned to MAP2 capabilities:
- audio engine
- plugins/LV2/VST3 (if applicable)
- AVB/TSN stack
- web UI
- services
- security
- diagnostics
- Prefer Fedora-native mechanisms:
- `dnf`
- `systemd`
- `firewalld`
- `SELinux`
- `sysusers`
- `tmpfiles`
- `logrotate`
- RPM packaging conventions
- Reuse first: build upon what is already present on host when possible; adopt or augment rather than replace.
- Never overwrite configs without backup, explanation, and rollback.
- Every change must include:
- purpose
- verification steps
- rollback/uninstall steps
- When no true baseline machine is available, approximate baseline via Fedora Server default comps groups and document assumptions.

## Required Outputs
1. Delta Report (Markdown) with summary table and prioritized action list.
2. Delta Report (JSON) for automation: package/service/config deltas and capability mapping.
3. Installer plan plus initial skeleton (bash or python) showing command parsing, structured logging, dry-run, audit capture, install/uninstall/verify.
4. RPM packaging plan with package split and at least one SPEC skeleton, plus local repo generation steps.

## Installer Design Constraints
- Idempotent and safe to re-run.
- Avoid repeated edits; prefer drop-ins.
- Subcommands:
- `audit`
- `install`
- `uninstall`
- `verify`
- Flags:
- `--dry-run`
- `--noninteractive`
- `--verbose`
- `--explain`
- `--profile` (`minimal|standard|avb`)
- Structured logging with step IDs and clear explanations.
- Capture pre-change state under timestamped directory.
- Persist installer state in `/var/lib/map2/installer/state.json` with ownership attribution:
- `installed_by_installer`
- `preexisting_adopted`
- `preexisting_modified` (avoid unless justified)
- Never overwrite user config without backup.
- Prefer:
- `/etc/sysctl.d/`
- `/etc/systemd/system/*.d/`
- `/etc/security/limits.d/`
- `/etc/udev/rules.d/`
- Produce post-install verification report.

## PHASE 0 - Baselines
Define "stock Fedora Server" baseline:
- identify current OS: Fedora release, kernel, arch, install type
- define baseline package/service set from Fedora Server comps and defaults
- document assumptions explicitly

## PHASE 1 - Evidence Collection (Current MAP2 Host)
Collect and store outputs under timestamped directory, for example `/var/tmp/map2-audit-YYYYmmdd-HHMMSS`.

Minimum collection commands and reads:

### OS and kernel
- `cat /etc/os-release`
- `uname -a`
- `rpm -q fedora-release`

### Packages, repos, modules
- `rpm -qa --qf '%{NAME} %{EPOCHNUM}:%{VERSION}-%{RELEASE} %{ARCH}\n' | sort`
- `dnf repolist --enabled`
- `dnf module list --enabled`
- `dnf group list --installed`

### Services
- `systemctl list-unit-files --state=enabled`
- `systemctl list-units --type=service --all`

### Boot, kernel args, tuning
- `cat /proc/cmdline`
- `grubby --info=ALL`
- `tuned-adm active` (if present)

### Security
- `sestatus`
- `getenforce`
- `/etc/sudoers`
- `/etc/sudoers.d/*`
- `semanage fcontext -l` (if available)

### Firewall and network
- `firewall-cmd --get-active-zones`
- `firewall-cmd --list-all` for each active zone
- `nft list ruleset` (if available)
- `ip a`
- `ip r`
- `nmcli con show`
- `ethtool -i <iface>` for each interface
- `ethtool -k <iface>` for each interface

### Audio stack
- `systemctl --user status pipewire*` where applicable and/or system services
- `rpm -qa | egrep 'pipewire|jack|alsa|pulseaudio'`
- `ulimit -r`
- `ulimit -l`
- `/etc/security/limits.d/*`
- `rtkit` status when used

### MAP2 application footprint
- locate MAP2 binaries, configs, service units, data dirs
- enumerate (if present):
- `/etc/map2`
- `/usr/libexec/map2`
- `/usr/share/map2`
- `/var/lib/map2`
- `/var/log/map2`
- systemd units: `map2*.service`, `map2*.socket`, `map2*.timer`
- `journalctl -u map2* --no-pager` when units exist

### Plugin ecosystem (if relevant)
- LV2 paths:
- `/usr/lib64/lv2`
- `/usr/local/lib64/lv2`
- `~/.lv2`
- VST3 paths:
- `/usr/lib64/vst3`
- `~/.vst3`
- plugin cache mechanisms used by MAP2

### AVB/TSN stack (mandatory)

#### NIC timestamping and PHC
- `ethtool -T <iface>`
- `ls -l /dev/ptp*`
- `phc_ctl /dev/ptpX get` (if available)

#### linuxptp state and config
- `rpm -qa | egrep 'linuxptp'`
- `systemctl status ptp4l phc2sys` (if present)
- configs under `/etc/linuxptp/*` (or detected paths)
- `journalctl -u ptp4l -u phc2sys --no-pager`
- `pmc -u -b 0 'GET CURRENT_DATA_SET'` (if available)

#### Traffic shaping and QoS
- `tc qdisc show dev <iface>`
- `tc -s qdisc show dev <iface>`
- `tc class show dev <iface>`
- `ip -d link show <iface>`

#### Multicast and discovery
- `systemctl status avahi-daemon` (if present)
- firewall rules relevant to multicast and PTP

#### Additional AVB notes
- document SRP/MAAP/gPTP tooling if present
- do not invent tools

## PHASE 2 - Delta Computation
Compute and report:

### Packages
- installed beyond baseline
- missing versus baseline (if relevant)

### Repos and modules
- third-party repos enabled
- module streams enabled

### Services
- enabled services beyond baseline
- MAP2-related services and dependencies

### Config deltas
- identify key config files altered versus baseline
- categorize each delta as `REQUIRED`, `OPTIONAL`, or `UNKNOWN` for MAP2
- include file paths and minimal diff summaries

### Kernel, sysctl, tuned
- realtime and latency tuning
- IRQ isolation
- PREEMPT/RT kernel presence
- report what exists; do not assume

### Network, firewall, SELinux deltas
- include deltas that affect MAP2 and AVB

## PHASE 3 - MAP2 Capability Matrix
Map each MAP2 feature to:
- required packages
- required services (systemd units)
- required config files and drop-ins
- required firewall ports/rules
- SELinux needs (labels, booleans, policy modules)
- verification commands and expected output

Include capability buckets:
- core runtime (binaries, runtime libs, config layout)
- audio subsystem (ALSA/PipeWire/JACK, realtime permissions, device access)
- plugin subsystem (LV2, optional VST3 hosting, discovery/cache)
- web/UI/API control plane
- operations (logging, health checks, diagnostics, updates)
- security posture (service user, least privilege, SELinux stance)
- AVB/TSN subsystem:
- NIC/PHC readiness and timestamping
- linuxptp (`ptp4l`, `phc2sys`, `pmc`)
- `tc` QoS (`mqprio`, `taprio`, `cbs` as applicable)
- VLAN PCP policy
- multicast/mDNS needs
- verification and health checks

## PHASE 4 - Reuse-First Installer Design
Design installer with reuse-first behavior:

### Inventory before action
- detect existing packages/services/configs
- if present, adopt and verify
- only apply minimal deltas

### Adopt-mode messaging example
"Found existing `ptp4l.service` enabled; adopting; verifying `/etc/linuxptp/ptp4l.conf`; adding drop-in only if required setting is missing."

### Backup policy
- before modifying any file, copy to timestamped backup and record hash

### Implementation requirements
- package ops via `dnf`
- service management via systemd units and drop-ins
- account/dir management via sysusers/tmpfiles
- firewall via firewalld services or rich rules
- SELinux via `semanage fcontext` + `restorecon`; use policy module only if required

### Profiles
- `minimal`: core MAP2 runtime
- `standard`: runtime + audio + web + plugins
- `avb`: standard + AVB/TSN stack (linuxptp, shaping, validation)

### Step verbosity
Each step prints:
- WHAT (action)
- WHY (MAP2 capability)
- COMMANDS (shown)
- VERIFY (how to test)
- ROLLBACK (how to revert)

### Post-install verification
Produce structured report including AVB health:
- PHC present
- `ptp4l` stable
- `tc` qdisc configured
- VLAN policy applied
- multicast reachable (as applicable)

## PHASE 5 - RPM Packaging and Repo Generation
Align with Fedora packaging conventions.

### Suggested package split (adjust to actual MAP2 layout)
- `map2-core` (binaries/libs)
- `map2-config` (defaults under `/etc/map2` as `%config(noreplace)`)
- `map2-services` (systemd units, sysusers/tmpfiles, health scripts)
- `map2-web` (UI assets)
- `map2-avb` (linuxptp configs, AVB helpers, tc scripts, verification tool)
- `map2-plugins` (optional, if distributed by MAP2)

### SPEC requirements
- proper `BuildRequires` and `Requires`
- systemd macros: `%systemd_post`, `%systemd_preun`, `%systemd_postun`
- `%config(noreplace)` for configs
- correct ownership and permissions
- triggers only when needed

### Repo generation
- `rpmbuild` outputs
- optional signing
- `createrepo_c`
- `/etc/yum.repos.d/map2-local.repo` generation

### CI notes
- `mock` builds
- `rpmlint`
- reproducibility checks

## Deliverable Details

### Delta report (Markdown)
- summary table:
- category
- baseline value
- current value
- delta
- required?
- prioritized action list: must, should, could

### Delta report (JSON)
Must include:
- `packages_to_install`
- `packages_to_remove`
- `repos_to_add`
- `repos_to_remove`
- `services_enable`
- `services_disable`
- `config_templates`
- `sysctl`
- `kernel_args`
- `firewalld_rules`
- `selinux_actions`
- `verification_commands`

### Installer skeleton
Must show:
- command parsing
- logging
- dry-run
- state manifest
- audit capture
- install/uninstall/verify stubs

### RPM packaging skeleton
Must show:
- directory layout
- one full SPEC skeleton (`map2-core`)
- brief SPEC stubs for related packages
- repo generation script

## Quality Bar
Work must be:
- evidence-based
- reproducible
- Fedora-native
- minimal-change
- reversible
- explicitly educational and verbose
