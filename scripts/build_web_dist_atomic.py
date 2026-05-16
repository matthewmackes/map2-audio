#!/usr/bin/env python3
"""Build the MAP2 web bundle into a staging directory, then publish atomically.

This prevents the live port-3000 server from ever serving an updated
``index.html`` before the referenced hashed bundles are fully available.
It also carries forward a small number of prior generations of hashed
assets so active browser sessions can finish loading old chunks after a
new deployment, while culling deeper history to keep dist/ bounded.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import uuid
from collections import defaultdict
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT_DIR / "web"
LIVE_DIST = WEB_DIR / "dist"
TS_BIN = WEB_DIR / "node_modules" / ".bin" / "tsc"
VITE_BIN = WEB_DIR / "node_modules" / ".bin" / "vite"
STALE_ASSET_PREFIXES = ("ibm-plex-sans-",)

# Keep at most N prior build generations of hashed entry/chunk files so a tab
# loaded against the previous deploy can still finish loading lazy chunks.
# Anything beyond that is pruned at publish time. Set in env to override.
KEEP_PRIOR_GENERATIONS = int(os.environ.get("MAP2_KEEP_PRIOR_GENERATIONS", "2"))

# Vite emits files named <basename>-<hash>.<ext>. We group by (basename, ext)
# and keep the newest mtime entries up to the limit per group.
_HASHED_NAME_RE = re.compile(r"^(.*?)-([A-Za-z0-9_-]{8,})(\.[A-Za-z0-9.]+)$")


def remove_path(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    shutil.rmtree(path)


def copy_item(source: Path, target: Path) -> None:
    if source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


def merge_existing_assets(live_dist: Path, staged_dist: Path) -> None:
    """Copy a bounded number of prior hashed-asset generations into the staged bundle.

    We keep ``KEEP_PRIOR_GENERATIONS`` newest siblings per (basename, ext) group
    so an in-flight tab can still resolve lazy chunks from the previous deploy.
    Source maps (.map) are never carried forward — they leak source and bloat
    dist/.
    """
    live_assets = live_dist / "assets"
    staged_assets = staged_dist / "assets"
    if not live_assets.is_dir():
        return

    staged_assets.mkdir(parents=True, exist_ok=True)

    # Group hashed entries by (basename, ext) and rank by mtime descending.
    grouped: dict[tuple[str, str], list[Path]] = defaultdict(list)
    unhashed: list[Path] = []
    for source in live_assets.iterdir():
        if source.name.startswith(STALE_ASSET_PREFIXES):
            continue
        if source.name.endswith(".map"):
            # Never carry source maps forward.
            continue
        match = _HASHED_NAME_RE.match(source.name)
        if match:
            basename, _hash, ext = match.groups()
            grouped[(basename, ext)].append(source)
        else:
            unhashed.append(source)

    for (_basename, _ext), entries in grouped.items():
        entries.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for source in entries[:KEEP_PRIOR_GENERATIONS]:
            target = staged_assets / source.name
            if target.exists():
                continue
            copy_item(source, target)

    for source in unhashed:
        target = staged_assets / source.name
        if target.exists():
            continue
        copy_item(source, target)


def publish_staged_dist(staged_dist: Path, live_dist: Path) -> None:
    """Atomically replace the live dist/ directory with the staged bundle."""
    backup_dist = live_dist.with_name(f".dist-backup-{uuid.uuid4().hex[:8]}")

    try:
        if live_dist.exists():
            live_dist.replace(backup_dist)
        staged_dist.replace(live_dist)
    except Exception:
        if backup_dist.exists() and not live_dist.exists():
            backup_dist.replace(live_dist)
        raise
    else:
        remove_path(backup_dist)


def run_command(command: list[str], *, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=WEB_DIR, check=True, env=env)


def ensure_build_prerequisites() -> None:
    if not WEB_DIR.is_dir():
        raise SystemExit(f"Web directory not found: {WEB_DIR}")
    if not TS_BIN.exists() or not VITE_BIN.exists():
        raise SystemExit("Missing frontend build tools. Install web dependencies before running npm run build.")


# Run-14c cycle 7 — codegen drift preflight.
# Every Pydantic→TS codegen drift check the typecheck gate runs is
# repeated here so a build that bypasses `npm run typecheck` (e.g.
# direct `python3 scripts/build_web_dist_atomic.py`, or future
# CI matrix paths) still catches drift. Drift here = nonzero exit
# from the build → no deploy → operator-actionable error.
CODEGEN_DRIFT_CHECKS: tuple[tuple[str, str], ...] = (
    ("snapshots.generated.ts (T2455)",
     "generate_typescript_contracts.py"),
    ("meterWsFrame.generated.ts (run-14b cycle 2)",
     "generate_meter_ws_types.py"),
    ("sonobusEventsWsFrame.generated.ts (run-14c cycle 1)",
     "generate_sonobus_events_ws_types.py"),
    ("midiTrafficWsFrame.generated.ts (run-14c cycle 2)",
     "generate_midi_traffic_ws_types.py"),
)


def run_codegen_drift_preflight() -> None:
    """Run every Pydantic→TS codegen --check before tsc. A drifted
    file would compound badly in tsc + vite output; better to fail
    fast with the canonical 'rerun X' message."""
    scripts_dir = ROOT_DIR / "scripts"
    print("[build_web_dist_atomic] codegen drift preflight…")
    for label, script_name in CODEGEN_DRIFT_CHECKS:
        script_path = scripts_dir / script_name
        if not script_path.is_file():
            print(f"[build_web_dist_atomic] skipping {label}: {script_path} not found")
            continue
        result = subprocess.run(
            [sys.executable, str(script_path), "--check"],
            cwd=str(ROOT_DIR),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            sys.stderr.write(result.stdout)
            sys.stderr.write(result.stderr)
            raise SystemExit(
                f"[build_web_dist_atomic] FAIL: codegen drift in {label}. "
                f"Run `python3 scripts/{script_name}` to refresh, then retry the build."
            )
        print(f"[build_web_dist_atomic]   ✓ {label}")


def main() -> int:
    ensure_build_prerequisites()
    run_codegen_drift_preflight()

    build_id = uuid.uuid4().hex[:8]
    staged_dist = WEB_DIR / f".dist-staging-{build_id}"
    remove_path(staged_dist)

    env = os.environ.copy()
    env["NODE_ENV"] = "production"

    try:
        run_command([str(TS_BIN), "-b"], env=env)
        run_command([str(VITE_BIN), "build", "--outDir", staged_dist.name], env=env)
        merge_existing_assets(LIVE_DIST, staged_dist)
        publish_staged_dist(staged_dist, LIVE_DIST)
    finally:
        remove_path(staged_dist)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
