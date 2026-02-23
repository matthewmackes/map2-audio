# MAP2 Installer Plan (Run Output)

## Scope
This plan implements an idempotent, verbose installer with `audit`, `install`, `uninstall`, and `verify` subcommands, plus profile support (`minimal`, `standard`, `avb`).

## Reuse-First Rules
- Inventory before action; adopt existing packages/services/config where valid.
- Backup before modify, with hash and restore path.
- Record ownership attribution in `/var/lib/map2/installer/state.json`:
  - `installed_by_installer`
  - `preexisting_adopted`
  - `preexisting_modified`
- Prefer drop-ins over in-place edits.

## Subcommands and Core Behavior
### `audit`
- Capture host evidence to `/var/tmp/map2-audit-<timestamp>`.
- Include OS, packages, services, security, networking, audio, MAP2 footprint, plugins, AVB/TSN.
- Emit structured JSONL step logs.

### `install`
- `--execute` gates mutating commands.
- Profile package sets:
  - `minimal`: core/runtime only
  - `standard`: minimal + web + plugin runtime deps
  - `avb`: standard + AVB stack (`linuxptp`, `iproute-tc`) and qdisc/PTP checks
- For each step: print WHAT/WHY/COMMANDS/VERIFY/ROLLBACK.
- Apply firewalld + SELinux actions using Fedora-native tooling.

### `uninstall`
- Disable managed MAP2 services.
- Remove only resources marked installer-owned in state manifest.
- Preserve adopted preexisting resources.

### `verify`
- Emit structured verification JSON including AVB health:
  - PHC present
  - `ptp4l` + `phc2sys` status
  - `tc` visibility/configuration
  - firewall/multicast checks

## Immediate Remediations from This Run
- Add AVB package/install step for missing `linuxptp` and `iproute-tc`.
- Add production guard to disable `map2-web-dev.service` unless explicitly requested.
- Add consistency check for conflicting sysctl/limits files and fail with actionable guidance.
- Add validation for missing unit references (example observed: `map2-selinux-disable.service` not found).

## Files
- Installer skeleton: `installer/map2_installer.py`
- Delta report: `reports/delta-report.md`
- Delta JSON: `reports/delta-report.json`
