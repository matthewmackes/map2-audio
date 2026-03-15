from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT_DIR / "scripts" / "build_web_dist_atomic.py"
SPEC = importlib.util.spec_from_file_location("build_web_dist_atomic", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_merge_existing_assets_copies_only_missing_files(tmp_path: Path) -> None:
    live_dist = tmp_path / "dist-live"
    staged_dist = tmp_path / "dist-staged"
    live_assets = live_dist / "assets"
    staged_assets = staged_dist / "assets"

    live_assets.mkdir(parents=True)
    staged_assets.mkdir(parents=True)

    (live_assets / "old-bundle.js").write_text("old bundle", encoding="utf-8")
    (live_assets / "shared.js").write_text("old shared", encoding="utf-8")
    (staged_assets / "new-bundle.js").write_text("new bundle", encoding="utf-8")
    (staged_assets / "shared.js").write_text("new shared", encoding="utf-8")

    MODULE.merge_existing_assets(live_dist, staged_dist)

    assert (staged_assets / "old-bundle.js").read_text(encoding="utf-8") == "old bundle"
    assert (staged_assets / "new-bundle.js").read_text(encoding="utf-8") == "new bundle"
    assert (staged_assets / "shared.js").read_text(encoding="utf-8") == "new shared"


def test_publish_staged_dist_replaces_live_bundle_atomically(tmp_path: Path) -> None:
    live_dist = tmp_path / "dist"
    staged_dist = tmp_path / ".dist-staging"

    (live_dist / "assets").mkdir(parents=True)
    (staged_dist / "assets").mkdir(parents=True)
    (live_dist / "index.html").write_text("old index", encoding="utf-8")
    (staged_dist / "index.html").write_text("new index", encoding="utf-8")
    (staged_dist / "assets" / "index-new.js").write_text("new js", encoding="utf-8")

    MODULE.publish_staged_dist(staged_dist, live_dist)

    assert live_dist.exists()
    assert not staged_dist.exists()
    assert (live_dist / "index.html").read_text(encoding="utf-8") == "new index"
    assert (live_dist / "assets" / "index-new.js").read_text(encoding="utf-8") == "new js"
    assert not any(tmp_path.glob(".dist-backup-*"))
