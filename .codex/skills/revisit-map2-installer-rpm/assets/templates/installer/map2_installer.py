#!/usr/bin/env python3
"""
MAP2 installer skeleton for Fedora Server.

Features in this skeleton:
- subcommands: audit, install, uninstall, verify
- flags: --dry-run, --noninteractive, --verbose, --explain, --profile
- structured JSONL logging with step IDs
- evidence capture under /var/tmp/map2-audit-<timestamp>
- installer state manifest at /var/lib/map2/installer/state.json
- install/uninstall/verify scaffolding with explicit WHAT/WHY/VERIFY/ROLLBACK

This file is intentionally a scaffold. Fill TODO markers with project-specific logic.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import shlex
import subprocess
import sys
from dataclasses import dataclass
from typing import Any

STATE_FILE = pathlib.Path("/var/lib/map2/installer/state.json")
STATE_DIR = STATE_FILE.parent
DEFAULT_AUDIT_ROOT = pathlib.Path("/var/tmp")
DEFAULT_LOG_DIR = pathlib.Path("/var/tmp/map2-installer-logs")
PROFILES = ("minimal", "standard", "avb")


@dataclass
class Step:
    step_id: str
    what: str
    why: str
    commands: list[str]
    verify: list[str]
    rollback: list[str]


@dataclass
class Ctx:
    dry_run: bool
    noninteractive: bool
    verbose: bool
    explain: bool
    profile: str
    log_file: pathlib.Path


def timestamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def ensure_dir(path: pathlib.Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def emit(ctx: Ctx, level: str, message: str, step_id: str = "", data: dict[str, Any] | None = None) -> None:
    record = {
        "ts": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "level": level,
        "step_id": step_id,
        "message": message,
    }
    if data:
        record["data"] = data

    line = json.dumps(record, sort_keys=True)
    print(line)
    ensure_dir(ctx.log_file.parent)
    with ctx.log_file.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def run_cmd(
    ctx: Ctx,
    command: str,
    step_id: str,
    *,
    check: bool = True,
    capture: bool = False,
) -> subprocess.CompletedProcess[str]:
    emit(ctx, "INFO", "command", step_id, {"command": command})

    if ctx.dry_run:
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="", stderr="")

    proc = subprocess.run(
        command,
        shell=True,
        text=True,
        capture_output=capture,
    )

    if capture and proc.stdout and ctx.verbose:
        print(proc.stdout)
    if capture and proc.stderr and ctx.verbose:
        print(proc.stderr, file=sys.stderr)

    if check and proc.returncode != 0:
        raise RuntimeError(f"Step {step_id} failed ({proc.returncode}): {command}")

    return proc


def render_step(ctx: Ctx, step: Step) -> None:
    emit(ctx, "INFO", "WHAT", step.step_id, {"what": step.what})
    if ctx.explain:
        emit(ctx, "INFO", "WHY", step.step_id, {"why": step.why})
        emit(ctx, "INFO", "COMMANDS", step.step_id, {"commands": step.commands})
        emit(ctx, "INFO", "VERIFY", step.step_id, {"verify": step.verify})
        emit(ctx, "INFO", "ROLLBACK", step.step_id, {"rollback": step.rollback})


def execute_step(ctx: Ctx, step: Step, *, execute: bool) -> None:
    render_step(ctx, step)
    if not execute:
        emit(ctx, "INFO", "plan-only step; use --execute to apply", step.step_id)
        return

    for command in step.commands:
        run_cmd(ctx, command, step.step_id)


def default_state() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "updated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "installed_by_installer": {
            "packages": [],
            "services": [],
            "files": [],
        },
        "preexisting_adopted": {
            "packages": [],
            "services": [],
            "files": [],
        },
        "preexisting_modified": {
            "packages": [],
            "services": [],
            "files": [],
        },
        "backups": [],
    }


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return default_state()
    with STATE_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_state(state: dict[str, Any]) -> None:
    ensure_dir(STATE_DIR)
    state["updated_at"] = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    with STATE_FILE.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2, sort_keys=True)
        handle.write("\n")


def record_pkg_ownership(state: dict[str, Any], package: str, exists: bool) -> None:
    if exists:
        if package not in state["preexisting_adopted"]["packages"]:
            state["preexisting_adopted"]["packages"].append(package)
    else:
        if package not in state["installed_by_installer"]["packages"]:
            state["installed_by_installer"]["packages"].append(package)


def detect_interfaces(ctx: Ctx) -> list[str]:
    proc = run_cmd(ctx, "ip -o link show | awk -F': ' '{print $2}'", "AUDIT.NET.IFACES", check=False, capture=True)
    if proc.returncode != 0:
        return []

    interfaces = []
    for line in proc.stdout.splitlines():
        iface = line.split("@", 1)[0].strip()
        if iface and iface != "lo":
            interfaces.append(iface)
    return sorted(set(interfaces))


def detect_firewalld_zones(ctx: Ctx) -> list[str]:
    proc = run_cmd(ctx, "firewall-cmd --get-active-zones", "AUDIT.NET.FIREWALL.ZONES", check=False, capture=True)
    if proc.returncode != 0:
        return []

    zones: list[str] = []
    for line in proc.stdout.splitlines():
        if not line.startswith(" ") and line.strip():
            zones.append(line.split()[0])
    return zones


def capture_command_output(ctx: Ctx, output_file: pathlib.Path, step_id: str, command: str) -> None:
    proc = run_cmd(ctx, command, step_id, check=False, capture=True)
    ensure_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as handle:
        handle.write(f"$ {command}\n")
        if proc.stdout:
            handle.write(proc.stdout)
            if not proc.stdout.endswith("\n"):
                handle.write("\n")
        if proc.stderr:
            handle.write("\n[stderr]\n")
            handle.write(proc.stderr)
            if not proc.stderr.endswith("\n"):
                handle.write("\n")
        handle.write(f"\n[exit_code] {proc.returncode}\n")


def cmd_audit(ctx: Ctx, args: argparse.Namespace) -> int:
    out_dir = pathlib.Path(args.output_dir or f"{DEFAULT_AUDIT_ROOT}/map2-audit-{timestamp()}")
    raw_dir = out_dir / "raw"
    ensure_dir(raw_dir)

    emit(ctx, "INFO", "starting host audit", "AUDIT.START", {"output_dir": str(out_dir)})

    base_commands: list[tuple[str, str, str]] = [
        ("os-release.txt", "AUDIT.OS.RELEASE", "cat /etc/os-release"),
        ("uname-a.txt", "AUDIT.OS.UNAME", "uname -a"),
        ("fedora-release.txt", "AUDIT.OS.FEDORA", "rpm -q fedora-release"),
        ("rpm-packages.txt", "AUDIT.PKG.RPM_QA", "rpm -qa --qf '%{NAME} %{EPOCHNUM}:%{VERSION}-%{RELEASE} %{ARCH}\\n' | sort"),
        ("dnf-repolist-enabled.txt", "AUDIT.PKG.REPOS", "dnf repolist --enabled"),
        ("dnf-modules-enabled.txt", "AUDIT.PKG.MODULES", "dnf module list --enabled"),
        ("dnf-groups-installed.txt", "AUDIT.PKG.GROUPS", "dnf group list --installed"),
        ("systemd-enabled-unit-files.txt", "AUDIT.SVC.ENABLED", "systemctl list-unit-files --state=enabled"),
        ("systemd-services-all.txt", "AUDIT.SVC.ALL", "systemctl list-units --type=service --all"),
        ("proc-cmdline.txt", "AUDIT.BOOT.CMDLINE", "cat /proc/cmdline"),
        ("grubby-info-all.txt", "AUDIT.BOOT.GRUBBY", "grubby --info=ALL"),
        ("tuned-active.txt", "AUDIT.BOOT.TUNED", "tuned-adm active"),
        ("sestatus.txt", "AUDIT.SEC.SESTATUS", "sestatus"),
        ("getenforce.txt", "AUDIT.SEC.GETENFORCE", "getenforce"),
        ("sudoers.txt", "AUDIT.SEC.SUDOERS", "cat /etc/sudoers"),
        ("sudoers-d.txt", "AUDIT.SEC.SUDOERS_D", "sh -c 'ls -la /etc/sudoers.d; for f in /etc/sudoers.d/*; do echo \"## $f\"; cat \"$f\"; done'"),
        ("semanage-fcontext.txt", "AUDIT.SEC.SEMANAGE", "semanage fcontext -l"),
        ("firewalld-active-zones.txt", "AUDIT.NET.FIREWALL.ACTIVE", "firewall-cmd --get-active-zones"),
        ("nft-ruleset.txt", "AUDIT.NET.NFT", "nft list ruleset"),
        ("ip-a.txt", "AUDIT.NET.IP_ADDR", "ip a"),
        ("ip-r.txt", "AUDIT.NET.IP_ROUTE", "ip r"),
        ("nmcli-con-show.txt", "AUDIT.NET.NMCLI", "nmcli con show"),
        ("audio-packages.txt", "AUDIT.AUDIO.PACKAGES", "sh -c \"rpm -qa | egrep 'pipewire|jack|alsa|pulseaudio'\""),
        ("ulimit-r.txt", "AUDIT.AUDIO.ULIMIT_RT", "bash -lc 'ulimit -r'"),
        ("ulimit-l.txt", "AUDIT.AUDIO.ULIMIT_MEMLOCK", "bash -lc 'ulimit -l'"),
        ("security-limits-d.txt", "AUDIT.AUDIO.LIMITS_D", "sh -c 'ls -la /etc/security/limits.d; for f in /etc/security/limits.d/*; do echo \"## $f\"; cat \"$f\"; done'"),
        ("pipewire-user-status.txt", "AUDIT.AUDIO.PIPEWIRE", "systemctl --user status pipewire pipewire-pulse wireplumber"),
        ("rtkit-status.txt", "AUDIT.AUDIO.RTKIT", "systemctl status rtkit-daemon"),
        ("map2-footprint.txt", "AUDIT.MAP2.FOOTPRINT", "sh -c 'for d in /etc/map2 /usr/libexec/map2 /usr/share/map2 /var/lib/map2 /var/log/map2; do if [ -e \"$d\" ]; then echo \"## $d\"; ls -la \"$d\"; fi; done'"),
        ("map2-unit-files.txt", "AUDIT.MAP2.UNITS", "systemctl list-unit-files 'map2*'"),
        ("map2-journal.txt", "AUDIT.MAP2.JOURNAL", "journalctl -u 'map2*' --no-pager -n 200"),
        ("lv2-vst3-paths.txt", "AUDIT.PLUGIN.PATHS", "sh -c 'for d in /usr/lib64/lv2 /usr/local/lib64/lv2 ~/.lv2 /usr/lib64/vst3 ~/.vst3; do echo \"## $d\"; ls -la $d 2>/dev/null || true; done'"),
        ("linuxptp-packages.txt", "AUDIT.AVB.PACKAGES", "sh -c \"rpm -qa | egrep 'linuxptp'\""),
        ("ptp-services.txt", "AUDIT.AVB.PTP_SERVICES", "systemctl status ptp4l phc2sys"),
        ("linuxptp-configs.txt", "AUDIT.AVB.PTP_CONFIGS", "sh -c 'if [ -d /etc/linuxptp ]; then ls -la /etc/linuxptp; for f in /etc/linuxptp/*; do echo \"## $f\"; cat \"$f\"; done; fi'"),
        ("ptp-journal.txt", "AUDIT.AVB.PTP_JOURNAL", "journalctl -u ptp4l -u phc2sys --no-pager -n 200"),
        ("pmc-current-data-set.txt", "AUDIT.AVB.PMC", "pmc -u -b 0 'GET CURRENT_DATA_SET'"),
        ("dev-ptp.txt", "AUDIT.AVB.PTP_DEVICES", "ls -l /dev/ptp*"),
        ("avahi-status.txt", "AUDIT.AVB.AVAHI", "systemctl status avahi-daemon"),
    ]

    for filename, step_id, command in base_commands:
        capture_command_output(ctx, raw_dir / filename, step_id, command)

    for zone in detect_firewalld_zones(ctx):
        capture_command_output(
            ctx,
            raw_dir / f"firewalld-zone-{zone}.txt",
            "AUDIT.NET.FIREWALL.ZONE",
            f"firewall-cmd --zone={shlex.quote(zone)} --list-all",
        )

    for iface in detect_interfaces(ctx):
        safe_iface = iface.replace("/", "_")
        commands = [
            (f"iface-{safe_iface}-driver.txt", "AUDIT.NET.IFACE.DRIVER", f"ethtool -i {shlex.quote(iface)}"),
            (f"iface-{safe_iface}-features.txt", "AUDIT.NET.IFACE.FEATURES", f"ethtool -k {shlex.quote(iface)}"),
            (f"iface-{safe_iface}-timestamping.txt", "AUDIT.AVB.IFACE.TIMESTAMP", f"ethtool -T {shlex.quote(iface)}"),
            (f"iface-{safe_iface}-qdisc.txt", "AUDIT.AVB.IFACE.QDISC", f"tc qdisc show dev {shlex.quote(iface)}"),
            (f"iface-{safe_iface}-qdisc-stats.txt", "AUDIT.AVB.IFACE.QDISC_STATS", f"tc -s qdisc show dev {shlex.quote(iface)}"),
            (f"iface-{safe_iface}-class.txt", "AUDIT.AVB.IFACE.CLASS", f"tc class show dev {shlex.quote(iface)}"),
            (f"iface-{safe_iface}-link-detail.txt", "AUDIT.AVB.IFACE.LINK_DETAIL", f"ip -d link show {shlex.quote(iface)}"),
        ]
        for filename, step_id, command in commands:
            capture_command_output(ctx, raw_dir / filename, step_id, command)

    metadata = {
        "generated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "hostname": os.uname().nodename,
        "profile": ctx.profile,
        "raw_dir": str(raw_dir),
    }
    with (out_dir / "metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
        handle.write("\n")

    emit(ctx, "INFO", "audit complete", "AUDIT.DONE", metadata)
    return 0


def planned_packages(profile: str) -> list[str]:
    if profile == "minimal":
        return ["map2-core", "map2-config", "map2-services"]
    if profile == "avb":
        return [
            "map2-core",
            "map2-config",
            "map2-services",
            "map2-web",
            "map2-avb",
            "linuxptp",
        ]
    return ["map2-core", "map2-config", "map2-services", "map2-web"]


def cmd_install(ctx: Ctx, args: argparse.Namespace) -> int:
    state = load_state()
    backup_dir = pathlib.Path(f"/var/lib/map2/installer/backups/{timestamp()}")
    ensure_dir(backup_dir)

    emit(ctx, "INFO", "starting install plan", "INSTALL.START", {"profile": ctx.profile, "execute": args.execute})

    # Inventory and adoption bookkeeping.
    for package in planned_packages(ctx.profile):
        proc = run_cmd(ctx, f"rpm -q {shlex.quote(package)}", "INSTALL.AUDIT.PKG", check=False)
        record_pkg_ownership(state, package, exists=proc.returncode == 0)

    steps = [
        Step(
            step_id="INSTALL.010",
            what="Capture pre-change snapshots before any file/service changes",
            why="Enable rollback and audit traceability",
            commands=[
                f"install -d -m 0750 {shlex.quote(str(backup_dir))}",
                "cp -a /etc/map2 /var/lib/map2/installer/backups/$(date +%Y%m%d-%H%M%S)/etc-map2 2>/dev/null || true",
            ],
            verify=[f"test -d {backup_dir}"],
            rollback=["No rollback required for snapshot creation"],
        ),
        Step(
            step_id="INSTALL.020",
            what="Ensure required packages for selected profile are present",
            why="Satisfy MAP2 runtime and subsystem dependencies",
            commands=[f"dnf install -y {' '.join(planned_packages(ctx.profile))}"],
            verify=["rpm -q map2-core map2-config map2-services"],
            rollback=[f"dnf remove -y {' '.join(planned_packages(ctx.profile))}"],
        ),
        Step(
            step_id="INSTALL.030",
            what="Apply configuration via drop-ins and noreplace config files",
            why="Maintain idempotence and preserve admin-managed config",
            commands=[
                "install -d -m 0755 /etc/systemd/system/map2-backend.service.d",
                "install -d -m 0755 /etc/sysctl.d",
                "install -d -m 0755 /etc/security/limits.d",
                "install -d -m 0755 /etc/udev/rules.d",
                "# TODO: copy profile-specific MAP2 drop-ins here",
            ],
            verify=[
                "test -d /etc/systemd/system/map2-backend.service.d",
                "systemd-analyze verify /etc/systemd/system/map2-backend.service.d/*.conf",
            ],
            rollback=["Remove created drop-ins and restore backups from /var/lib/map2/installer/backups"],
        ),
        Step(
            step_id="INSTALL.040",
            what="Enable and start MAP2 services",
            why="Activate MAP2 control plane and runtime",
            commands=[
                "systemctl daemon-reload",
                "systemctl enable --now map2-backend.service",
                "systemctl enable --now map2-web-prod.service",
            ],
            verify=[
                "systemctl is-active map2-backend.service",
                "systemctl is-active map2-web-prod.service",
            ],
            rollback=[
                "systemctl disable --now map2-web-prod.service",
                "systemctl disable --now map2-backend.service",
            ],
        ),
        Step(
            step_id="INSTALL.050",
            what="Apply firewall and SELinux adjustments",
            why="Expose MAP2 endpoints and preserve least-privilege labeling",
            commands=[
                "firewall-cmd --permanent --add-service=http",
                "firewall-cmd --reload",
                "semanage fcontext -a -t var_lib_t '/var/lib/map2(/.*)?' || true",
                "restorecon -Rv /var/lib/map2 || true",
            ],
            verify=[
                "firewall-cmd --list-services | grep -w http",
                "ls -Zd /var/lib/map2",
            ],
            rollback=[
                "firewall-cmd --permanent --remove-service=http",
                "firewall-cmd --reload",
                "# TODO: remove custom fcontext if policy requires",
            ],
        ),
    ]

    for step in steps:
        execute_step(ctx, step, execute=args.execute)

    save_state(state)
    emit(ctx, "INFO", "install flow complete", "INSTALL.DONE", {"state_file": str(STATE_FILE)})
    return 0


def cmd_uninstall(ctx: Ctx, args: argparse.Namespace) -> int:
    state = load_state()
    emit(ctx, "INFO", "starting uninstall", "UNINSTALL.START", {"execute": args.execute})

    packages = state.get("installed_by_installer", {}).get("packages", [])

    steps = [
        Step(
            step_id="UNINSTALL.010",
            what="Disable MAP2 services managed by installer",
            why="Stop MAP2 runtime before package/config removal",
            commands=[
                "systemctl disable --now map2-web-prod.service || true",
                "systemctl disable --now map2-backend.service || true",
            ],
            verify=[
                "systemctl is-enabled map2-web-prod.service || true",
                "systemctl is-enabled map2-backend.service || true",
            ],
            rollback=[
                "systemctl enable --now map2-backend.service",
                "systemctl enable --now map2-web-prod.service",
            ],
        ),
        Step(
            step_id="UNINSTALL.020",
            what="Remove packages installed by installer ownership",
            why="Avoid deleting preexisting adopted packages",
            commands=[f"dnf remove -y {' '.join(packages)}" if packages else "echo 'No installer-owned packages to remove'"],
            verify=["rpm -qa | egrep '^map2-' || true"],
            rollback=["dnf install -y <required packages>"],
        ),
        Step(
            step_id="UNINSTALL.030",
            what="Report backups and manual restore hints",
            why="Give explicit rollback path for config recovery",
            commands=["echo 'Backups available under /var/lib/map2/installer/backups'"],
            verify=["test -d /var/lib/map2/installer/backups"],
            rollback=["No rollback needed"],
        ),
    ]

    for step in steps:
        execute_step(ctx, step, execute=args.execute)

    emit(ctx, "INFO", "uninstall flow complete", "UNINSTALL.DONE")
    return 0


def cmd_verify(ctx: Ctx, args: argparse.Namespace) -> int:
    report_file = pathlib.Path(args.report_file or f"/var/tmp/map2-verify-{timestamp()}.json")

    checks = [
        "systemctl is-active map2-backend.service",
        "systemctl is-active map2-web-prod.service",
        "ls -l /dev/ptp*",
        "systemctl is-active ptp4l",
        "systemctl is-active phc2sys",
        "tc qdisc show",
        "firewall-cmd --list-services",
    ]

    results: list[dict[str, Any]] = []
    for command in checks:
        proc = run_cmd(ctx, command, "VERIFY.CHECK", check=False, capture=True)
        results.append(
            {
                "command": command,
                "exit_code": proc.returncode,
                "stdout": proc.stdout.strip(),
                "stderr": proc.stderr.strip(),
            }
        )

    avb_health = {
        "phc_present": any(r["command"] == "ls -l /dev/ptp*" and r["exit_code"] == 0 for r in results),
        "ptp4l_active": any(r["command"] == "systemctl is-active ptp4l" and "active" in r["stdout"] for r in results),
        "phc2sys_active": any(r["command"] == "systemctl is-active phc2sys" and "active" in r["stdout"] for r in results),
        "tc_qdisc_visible": any(r["command"] == "tc qdisc show" and r["exit_code"] == 0 for r in results),
        "multicast_service_visible": any(r["command"] == "firewall-cmd --list-services" and r["exit_code"] == 0 for r in results),
    }

    report = {
        "generated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "profile": ctx.profile,
        "checks": results,
        "avb_health": avb_health,
        "notes": [
            "TODO: Add VLAN PCP validation checks.",
            "TODO: Add pmc stability window checks for AVB profile.",
        ],
    }

    ensure_dir(report_file.parent)
    with report_file.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")

    emit(ctx, "INFO", "verification report written", "VERIFY.DONE", {"report_file": str(report_file)})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MAP2 Fedora installer scaffold")

    parser.add_argument("--dry-run", action="store_true", help="Print commands without applying changes")
    parser.add_argument("--noninteractive", action="store_true", help="Do not prompt for confirmation")
    parser.add_argument("--verbose", action="store_true", help="Print command output")
    parser.add_argument("--explain", action="store_true", help="Print WHY/VERIFY/ROLLBACK details for each step")
    parser.add_argument("--profile", choices=PROFILES, default="standard", help="Target capability profile")

    sub = parser.add_subparsers(dest="subcommand", required=True)

    p_audit = sub.add_parser("audit", help="Collect host evidence")
    p_audit.add_argument("--output-dir", help="Audit output directory")
    p_audit.set_defaults(handler=cmd_audit)

    p_install = sub.add_parser("install", help="Apply installer plan")
    p_install.add_argument("--execute", action="store_true", help="Actually run mutating commands")
    p_install.set_defaults(handler=cmd_install)

    p_uninstall = sub.add_parser("uninstall", help="Remove installer-owned resources")
    p_uninstall.add_argument("--execute", action="store_true", help="Actually run mutating commands")
    p_uninstall.set_defaults(handler=cmd_uninstall)

    p_verify = sub.add_parser("verify", help="Run verification checks")
    p_verify.add_argument("--report-file", help="Output JSON report path")
    p_verify.set_defaults(handler=cmd_verify)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    ctx = Ctx(
        dry_run=args.dry_run,
        noninteractive=args.noninteractive,
        verbose=args.verbose,
        explain=args.explain,
        profile=args.profile,
        log_file=DEFAULT_LOG_DIR / f"installer-{timestamp()}.jsonl",
    )

    emit(ctx, "INFO", "starting", "MAIN.START", {"subcommand": args.subcommand, "profile": args.profile})

    try:
        return int(args.handler(ctx, args))
    except Exception as exc:
        emit(ctx, "ERROR", "failed", "MAIN.ERROR", {"error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
