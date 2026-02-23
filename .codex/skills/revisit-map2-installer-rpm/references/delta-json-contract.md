# Delta JSON Contract

Use this schema contract for the machine-readable delta output.

## Required top-level keys
- `metadata`
- `baseline_assumptions`
- `packages_to_install`
- `packages_to_remove`
- `repos_to_add`
- `repos_to_remove`
- `enabled_modules`
- `disabled_modules`
- `services_enable`
- `services_disable`
- `config_templates`
- `sysctl`
- `kernel_args`
- `firewalld_rules`
- `selinux_actions`
- `verification_commands`
- `capability_matrix`
- `prioritized_actions`

## Field semantics
- `metadata`: host identity, timestamps, tool versions, profile.
- `baseline_assumptions`: explicit assumptions used to approximate stock Fedora Server baseline.
- `packages_to_install`: packages required for MAP2 capability parity.
- `packages_to_remove`: packages that conflict with target posture.
- `repos_to_add`: repository definitions needed for MAP2 distribution.
- `repos_to_remove`: repositories to disable/remove.
- `enabled_modules`: module streams to enable.
- `disabled_modules`: module streams to disable.
- `services_enable`: systemd units to enable and start.
- `services_disable`: systemd units to disable and stop.
- `config_templates`: file-level deltas with path, action, classification, and rollback data.
- `sysctl`: sysctl drop-ins and expected values.
- `kernel_args`: required kernel command line deltas.
- `firewalld_rules`: services, ports, rich rules, and zones.
- `selinux_actions`: fcontext, booleans, policy modules if needed.
- `verification_commands`: command list with expected output markers.
- `capability_matrix`: MAP2 capability buckets mapped to deps and checks.
- `prioritized_actions`: must/should/could decisions.

## Template
```json
{
  "metadata": {
    "audit_timestamp": "2026-02-23T00:00:00Z",
    "hostname": "map2-host",
    "os_release": "Fedora Linux 42",
    "kernel": "6.x",
    "arch": "x86_64",
    "profile": "standard"
  },
  "baseline_assumptions": [
    "No baseline host was available; Fedora Server comps defaults were used."
  ],
  "packages_to_install": [
    {
      "name": "linuxptp",
      "reason": "AVB/TSN gPTP support",
      "capability": "avb_tsn"
    }
  ],
  "packages_to_remove": [],
  "repos_to_add": [],
  "repos_to_remove": [],
  "enabled_modules": [],
  "disabled_modules": [],
  "services_enable": [
    {
      "name": "map2-backend.service",
      "reason": "MAP2 control plane runtime"
    }
  ],
  "services_disable": [],
  "config_templates": [
    {
      "path": "/etc/linuxptp/ptp4l.conf",
      "action": "drop-in",
      "classification": "REQUIRED",
      "purpose": "Stabilize AVB time sync",
      "backup_path": "/var/tmp/map2-audit-20260223-120000/backups/ptp4l.conf",
      "rollback": "Restore backup and restart ptp4l"
    }
  ],
  "sysctl": [
    {
      "path": "/etc/sysctl.d/90-map2.conf",
      "key": "vm.swappiness",
      "value": "10",
      "reason": "Audio latency consistency"
    }
  ],
  "kernel_args": [
    {
      "arg": "threadirqs",
      "state": "present",
      "reason": "IRQ behavior control for low-latency audio"
    }
  ],
  "firewalld_rules": [
    {
      "zone": "public",
      "kind": "service",
      "value": "http",
      "reason": "MAP2 web UI"
    }
  ],
  "selinux_actions": [
    {
      "type": "fcontext",
      "target": "/var/lib/map2(/.*)?",
      "set_type": "var_lib_t",
      "reason": "Persist MAP2 state with correct labeling"
    }
  ],
  "verification_commands": [
    {
      "command": "systemctl is-active map2-backend.service",
      "expect": "active"
    },
    {
      "command": "pmc -u -b 0 'GET CURRENT_DATA_SET'",
      "expect": "offsetFromMaster remains bounded"
    }
  ],
  "capability_matrix": [
    {
      "capability": "audio_subsystem",
      "required_packages": ["pipewire", "alsa-lib"],
      "required_services": ["pipewire.service"],
      "required_configs": ["/etc/security/limits.d/99-map2-rt.conf"],
      "required_firewalld": [],
      "required_selinux": [],
      "verification": ["ulimit -r", "pw-top"]
    }
  ],
  "prioritized_actions": {
    "must": [
      "Enable linuxptp services for AVB profile"
    ],
    "should": [
      "Add firewalld service definition for map2-api"
    ],
    "could": [
      "Provide optional VST3 scan cache prewarm"
    ]
  }
}
```
