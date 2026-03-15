#!/usr/bin/env python3
"""Build the MAP2 web bundle into a staging directory, then publish atomically.

This prevents the live port-3000 server from ever serving an updated
``index.html`` before the referenced hashed bundles are fully available.
It also carries forward prior hashed assets so active browser sessions can
finish loading old chunks after a new deployment.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT_DIR / "web"
LIVE_DIST = WEB_DIR / "dist"
TS_BIN = WEB_DIR / "node_modules" / ".bin" / "tsc"
VITE_BIN = WEB_DIR / "node_modules" / ".bin" / "vite"


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
    """Copy prior hashed assets into the staged bundle without overwriting new ones."""
    live_assets = live_dist / "assets"
    staged_assets = staged_dist / "assets"
    if not live_assets.is_dir():
        return

    staged_assets.mkdir(parents=True, exist_ok=True)
    for source in live_assets.iterdir():
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


def main() -> int:
    ensure_build_prerequisites()

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
