"""Tests for app.services.branding_service.BrandingService."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.branding_service import BrandingPaths, BrandingService


@pytest.fixture
def tmp_paths(tmp_path: Path) -> BrandingPaths:
    manifest = tmp_path / "brand.manifest.json"
    override = tmp_path / "overrides" / "brand.manifest.override.json"
    manifest.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "id": "test-brand",
                "productName": "Test Platform",
                "shortName": "TST",
                "tagline": "TEST",
                "palette": {"primary": "#111111", "background": "#000000"},
                "copy": {"welcomeHeadline": "Hi"},
                "assets": {"icon": "a.svg"},
            }
        ),
        encoding="utf-8",
    )
    return BrandingPaths(manifest=manifest, override=override)


def test_get_returns_disk_manifest_when_no_override(tmp_paths: BrandingPaths) -> None:
    svc = BrandingService(tmp_paths)
    brand = svc.get()
    assert brand["productName"] == "Test Platform"
    assert brand["palette"]["primary"] == "#111111"
    assert tmp_paths.override.exists() is False


def test_update_writes_override_and_merges(tmp_paths: BrandingPaths) -> None:
    svc = BrandingService(tmp_paths)
    merged = svc.update({"productName": "Renamed", "palette": {"primary": "#FF0000"}})

    assert merged["productName"] == "Renamed"
    assert merged["palette"]["primary"] == "#FF0000"
    # Untouched palette keys come from the disk manifest.
    assert merged["palette"]["background"] == "#000000"
    # Unrelated top-level sections preserved.
    assert merged["shortName"] == "TST"
    assert merged["assets"] == {"icon": "a.svg"}

    # Override file written, disk manifest untouched.
    stored = json.loads(tmp_paths.override.read_text(encoding="utf-8"))
    assert stored == {"productName": "Renamed", "palette": {"primary": "#FF0000"}}
    disk = json.loads(tmp_paths.manifest.read_text(encoding="utf-8"))
    assert disk["productName"] == "Test Platform"


def test_update_rejects_immutable_keys(tmp_paths: BrandingPaths) -> None:
    svc = BrandingService(tmp_paths)
    merged = svc.update({"schemaVersion": 99, "id": "hijack", "productName": "OK"})
    assert merged["schemaVersion"] == 1
    assert merged["id"] == "test-brand"
    assert merged["productName"] == "OK"
    # Override file must not record the immutable attempts.
    stored = json.loads(tmp_paths.override.read_text(encoding="utf-8"))
    assert "schemaVersion" not in stored
    assert "id" not in stored


def test_reset_removes_override(tmp_paths: BrandingPaths) -> None:
    svc = BrandingService(tmp_paths)
    svc.update({"productName": "Temp"})
    assert tmp_paths.override.exists()

    brand = svc.reset()
    assert brand["productName"] == "Test Platform"
    assert tmp_paths.override.exists() is False


def test_reload_picks_up_external_edits(tmp_paths: BrandingPaths) -> None:
    svc = BrandingService(tmp_paths)
    assert svc.get()["productName"] == "Test Platform"

    # Simulate a git-pull updating the manifest on disk.
    manifest = json.loads(tmp_paths.manifest.read_text(encoding="utf-8"))
    manifest["productName"] = "Upstream"
    tmp_paths.manifest.write_text(json.dumps(manifest), encoding="utf-8")

    # Still cached.
    assert svc.get()["productName"] == "Test Platform"
    # After reload, picks up the new value.
    assert svc.reload()["productName"] == "Upstream"


def test_missing_manifest_uses_fallback(tmp_path: Path) -> None:
    paths = BrandingPaths(manifest=tmp_path / "missing.json", override=tmp_path / "ov.json")
    svc = BrandingService(paths)
    brand = svc.get()
    assert brand["productName"] == "Mackes Audio Platform"
    assert brand["shortName"] == "MAP"


def test_corrupt_override_is_ignored(tmp_paths: BrandingPaths) -> None:
    tmp_paths.override.parent.mkdir(parents=True, exist_ok=True)
    tmp_paths.override.write_text("{ not json", encoding="utf-8")
    svc = BrandingService(tmp_paths)
    brand = svc.get()
    assert brand["productName"] == "Test Platform"
