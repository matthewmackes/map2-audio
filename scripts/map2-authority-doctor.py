#!/usr/bin/env python3
"""T2431-J — CLI for the deployment-mode authority doctor.

Usage:
    scripts/map2-authority-doctor.py check
    scripts/map2-authority-doctor.py repair
    scripts/map2-authority-doctor.py create-authority <mode>
    scripts/map2-authority-doctor.py layers

``check`` reports drift between the authority file at /etc/map2/mode.json
and its generated projections. ``repair`` regenerates the projections
from the authority. ``create-authority`` writes a fresh authority file
(operator bootstrap). ``layers`` dumps the layered-config loader summary
so forbidden-override drift is visible at runtime.

This script has no side effects beyond those of the underlying services:
- ``check`` / ``layers`` read from disk only.
- ``repair`` writes to /etc/map2/environment via an atomic replace.
- ``create-authority`` writes /etc/map2/mode.json via an atomic replace.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make the repo-root importable so the script works from a source tree.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.deployment.authority import (
    DeploymentModeAuthority,
    DeploymentModeAuthorityError,
    DeploymentModeDoctor,
    canonicalize_mode,
)
from app.services.layered_config_loader import LayeredConfigLoader


def _print_report(report: dict) -> None:
    print(json.dumps(report, indent=2, sort_keys=True))


def cmd_check(_args: argparse.Namespace) -> int:
    report = DeploymentModeDoctor().check()
    _print_report(report.to_dict())
    return 0 if report.healthy else 1


def cmd_repair(_args: argparse.Namespace) -> int:
    doctor = DeploymentModeDoctor()
    initial = doctor.check()
    if not initial.authority_exists:
        print(
            "error: deployment-mode authority file does not exist. "
            "Run `create-authority <mode>` first.",
            file=sys.stderr,
        )
        return 2
    final = doctor.repair()
    _print_report(final.to_dict())
    return 0 if final.healthy else 1


def cmd_create_authority(args: argparse.Namespace) -> int:
    mode = args.mode
    try:
        canonical = canonicalize_mode(mode)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    authority = DeploymentModeAuthority()
    try:
        payload = authority.write(canonical, set_by="map2-authority-doctor")
    except OSError as exc:
        print(f"error: cannot write authority file at {authority.path}: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"status": "ok", "mode": payload.mode, "path": str(authority.path)}, indent=2))
    return 0


def cmd_layers(_args: argparse.Namespace) -> int:
    summary = LayeredConfigLoader().load().summary()
    _print_report(summary)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="Report authority ↔ projection drift").set_defaults(func=cmd_check)
    sub.add_parser("repair", help="Regenerate projections from the authority").set_defaults(func=cmd_repair)

    create_parser = sub.add_parser(
        "create-authority",
        help="Write a fresh /etc/map2/mode.json with the given mode",
    )
    create_parser.add_argument("mode", help="Deployment mode (audio | all-in-one | management)")
    create_parser.set_defaults(func=cmd_create_authority)

    sub.add_parser("layers", help="Dump the layered-config loader plane summary").set_defaults(func=cmd_layers)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
