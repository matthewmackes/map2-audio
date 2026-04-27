"""T2459-G9 — Pack Sources admin route tests.

Covers:
  - GET /api/devices/sources/mixxx-checksums when present
  - GET /api/devices/sources/mixxx-checksums when missing
  - POST /api/devices/sources/sync-mixxx invalid clone path → 400
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes


@pytest.fixture
def fake_repo(tmp_path, monkeypatch):
    """Patch the route's REPO_ROOT/MIXX_IMPORTS/CHECKSUMS pointers to a
    tmp tree so we can introduce drift without touching the live tree.
    """
    imports = tmp_path / "device-packs" / "_mixx-imports"
    imports.mkdir(parents=True)
    (imports / "good.bin").write_bytes(b"hello")
    (imports / "bad.bin").write_bytes(b"changed")

    # Build a checksums file claiming good.bin matches but bad.bin
    # does not (we record the *original* bytes' hash).
    import hashlib
    good_sha = hashlib.sha256(b"hello").hexdigest()
    bad_sha_original = hashlib.sha256(b"original").hexdigest()
    missing_sha = hashlib.sha256(b"missing").hexdigest()

    rel_good = f"device-packs/_mixx-imports/good.bin"
    rel_bad = f"device-packs/_mixx-imports/bad.bin"
    rel_missing = f"device-packs/_mixx-imports/missing.bin"
    (imports / "IMPORT_CHECKSUMS.txt").write_text(
        f"# header\n{good_sha}  {rel_good}\n{bad_sha_original}  {rel_bad}\n{missing_sha}  {rel_missing}\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(devices_routes, "REPO_ROOT_G9", tmp_path)
    monkeypatch.setattr(devices_routes, "MIXX_IMPORTS_ROOT", imports)
    monkeypatch.setattr(devices_routes, "CHECKSUMS_FILE", imports / "IMPORT_CHECKSUMS.txt")
    monkeypatch.setattr(devices_routes, "SYNC_SCRIPT", tmp_path / "scripts" / "sync_mixxx_imports.py")
    return tmp_path


@pytest.fixture
def app(fake_repo):
    a = FastAPI()
    a.include_router(devices_routes.router)
    return a


@pytest.fixture
def client(app):
    return TestClient(app)


def test_mixxx_checksums_reports_drift(client):
    r = client.get("/api/devices/sources/mixxx-checksums")
    assert r.status_code == 200
    body = r.json()
    assert body["present"] is True
    assert body["files_checked"] == 3   # good.bin + bad.bin + IMPORT_CHECKSUMS.txt
    paths = {row["path"]: row for row in body["drift"]}
    # bad.bin reports as modified.
    bad_row = paths.get("device-packs/_mixx-imports/bad.bin")
    assert bad_row is not None
    assert bad_row["kind"] == "modified"
    # missing.bin reports as missing.
    assert paths.get("device-packs/_mixx-imports/missing.bin", {}).get("kind") == "missing"
    # The checksums file itself is in the manifest? No — we excluded
    # IMPORT_CHECKSUMS.txt from `expected`. But it's still on disk and
    # not in expected, so it surfaces as untracked.
    txt_row = paths.get("device-packs/_mixx-imports/IMPORT_CHECKSUMS.txt")
    assert txt_row is not None
    assert txt_row["kind"] == "untracked"


def test_mixxx_checksums_missing_imports_dir(client, monkeypatch, tmp_path):
    """When the imports dir doesn't exist (fresh repo, never synced),
    the route returns present=False instead of 500ing."""
    monkeypatch.setattr(devices_routes, "MIXX_IMPORTS_ROOT", tmp_path / "nonexistent")
    r = client.get("/api/devices/sources/mixxx-checksums")
    assert r.status_code == 200
    body = r.json()
    assert body["present"] is False
    assert body["drift"] == []


def test_sync_mixxx_invalid_clone_path_400(client):
    r = client.post(
        "/api/devices/sources/sync-mixxx",
        json={"mixxx_clone_path": "/definitely/does/not/exist"},
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "invalid_clone_path"


def test_sync_mixxx_missing_script_500(client, tmp_path):
    """Sync script not in our tmp tree → 500 with a structured envelope."""
    # The fixture pointed SYNC_SCRIPT at a path that doesn't exist.
    # Provide a real clone-path dir (tmp_path itself) so we get past the
    # first guard and hit the script-missing one.
    (tmp_path / "scripts").mkdir(exist_ok=True)
    r = client.post(
        "/api/devices/sources/sync-mixxx",
        json={"mixxx_clone_path": str(tmp_path)},
    )
    assert r.status_code == 500
    assert r.json()["detail"]["code"] == "sync_script_missing"
