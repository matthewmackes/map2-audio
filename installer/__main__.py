"""
installer/__main__.py
======================
Entry point — invoked as:  python -m installer  OR  ./install --tui

Anaconda analogy:
  The `/usr/bin/anaconda` binary parses boot-time kernel command-line options
  (inst.ks=, inst.text, inst.graphical) and then launches the appropriate UI.
  We do the same thing here: parse CLI flags, decide TUI vs unattended, and
  hand off to the right runner.

Exit codes (CI-friendly):
  0  — success
  1  — validation error (bad kickstart YAML, invalid flags)
  2  — install error (a stage failed)
  3  — user aborted (Ctrl+C / quit)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="installer",
        description=(
            "MAP2 Audio Platform — Enterprise Educational Installer\n"
            "Anaconda/Kickstart-inspired TUI installer for real-time audio systems."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--tui",
        action="store_true",
        default=True,
        help="Launch interactive TUI (default)",
    )
    p.add_argument(
        "--unattended",
        metavar="KICKSTART_YAML",
        help="Run headlessly from a Kickstart YAML file (no TUI)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Simulate the install — print what would happen, make no changes",
    )
    p.add_argument(
        "--generate-ks",
        metavar="MODE",
        nargs="?",
        const="audio",
        help="Generate a template Kickstart YAML for the given mode (default: audio)",
    )
    p.add_argument(
        "--validate-ks",
        metavar="KICKSTART_YAML",
        help="Validate a Kickstart YAML file and report errors",
    )
    p.add_argument(
        "--stage",
        metavar="N",
        type=int,
        default=0,
        help="Start TUI at stage N (0=Welcome, useful for development)",
    )
    p.add_argument(
        "--log",
        metavar="FILE",
        default="/var/log/map2-installer.log",
        help="Installer log file path",
    )
    return p


def main() -> int:
    parser = build_arg_parser()
    args   = parser.parse_args()

    # ── --generate-ks: write template YAML to stdout ─────────────────────────
    if args.generate_ks is not None:
        return cmd_generate_ks(args.generate_ks)

    # ── --validate-ks: validate a KS file and report ─────────────────────────
    if args.validate_ks:
        return cmd_validate_ks(args.validate_ks)

    # ── --unattended: headless install from KS file ───────────────────────────
    if args.unattended:
        return cmd_unattended(args.unattended, dry_run=args.dry_run, log=args.log)

    # ── Default: interactive TUI ──────────────────────────────────────────────
    return cmd_tui(dry_run=args.dry_run, start_stage=args.stage)


# ─────────────────────────────────────────────────────────────────────────────
# Sub-commands
# ─────────────────────────────────────────────────────────────────────────────

def cmd_tui(dry_run: bool = False, start_stage: int = 0) -> int:
    """Launch the interactive Textual TUI installer."""
    _configure_logging()

    # Check terminal capability — if TERM=dumb, fall back gracefully
    import os
    if os.environ.get("TERM", "") == "dumb":
        print("WARNING: TERM=dumb detected. Switching to text-summary mode.")
        print("Run with a proper terminal (xterm, vt100, etc.) for the full TUI.")
        return cmd_text_summary()

    try:
        from installer.installer import MAP2InstallerApp
        app = MAP2InstallerApp(dry_run=dry_run, start_stage=start_stage)
        app.run()
        return 0
    except KeyboardInterrupt:
        print("\nInstallation aborted by user.")
        return 3
    except Exception as e:
        print(f"\nFatal error launching installer: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 2


def cmd_generate_ks(mode: str) -> int:
    """Generate a template Kickstart YAML and write to stdout."""
    try:
        from installer.config.kickstart import generate_template, save_kickstart
        import io, yaml
        cfg  = generate_template(mode=mode)
        # Write to stdout so users can redirect to a file
        buf  = io.StringIO()
        import json
        data = json.loads(cfg.model_dump_json())
        yaml.dump(data, sys.stdout, default_flow_style=False, sort_keys=False, allow_unicode=True)
        return 0
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_validate_ks(ks_path: str) -> int:
    """Validate a KS YAML file. Returns 0 if valid, 1 if errors found."""
    from installer.config.kickstart import validate_kickstart_file
    errors = validate_kickstart_file(ks_path)
    if not errors:
        print(f"✓ {ks_path} is valid.")
        return 0
    print(f"✗ {ks_path} has {len(errors)} error(s):", file=sys.stderr)
    for err in errors:
        print(f"  • {err}", file=sys.stderr)
    return 1


def cmd_unattended(ks_path: str, dry_run: bool = False, log: str = "/var/log/map2-installer.log") -> int:
    """Run headless install from a Kickstart YAML file."""
    from installer.modes.unattended import UnattendedRunner
    runner = UnattendedRunner(ks_path=ks_path, dry_run=dry_run, log_file=log)
    return runner.run()


def cmd_text_summary() -> int:
    """TERM=dumb fallback: print a text summary and ask user to confirm."""
    print("\n=== MAP2 Audio Platform Installer ===")
    print("Interactive TUI unavailable (TERM=dumb or non-interactive terminal).")
    print("\nOptions:")
    print("  1. Run with a proper terminal:  python -m installer")
    print("  2. Generate a kickstart file:   python -m installer --generate-ks > map2-ks.yaml")
    print("  3. Unattended install:          python -m installer --unattended map2-ks.yaml")
    return 0


def _configure_logging():
    """Set up file + stderr logging before the TUI starts."""
    import logging
    import os
    log_file = "/tmp/map2-installer-debug.log"
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(log_file, mode="a"),
            # Don't add StreamHandler — it would pollute the TUI terminal
        ],
    )
    logging.getLogger("installer").info("Installer logging initialised → %s", log_file)


if __name__ == "__main__":
    sys.exit(main())
