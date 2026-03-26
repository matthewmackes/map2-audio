from __future__ import annotations

import os

import pytest

from app.services.cluster.version_manifest import (
    ManifestStorageUnavailableError,
    VersionManifest,
)


def test_read_helpers_do_not_create_manifest_storage(tmp_path):
    manifest_path = tmp_path / "state" / "version_manifest.json"
    service = VersionManifest(str(manifest_path))

    assert manifest_path.parent.exists() is False
    assert service.get_manifest() is None
    assert service.list_manifest_history() == []
    assert manifest_path.parent.exists() is False


def test_storage_status_reports_read_only_mounts_without_attempting_directory_creation(tmp_path, monkeypatch):
    manifest_path = tmp_path / "state" / "version_manifest.json"
    service = VersionManifest(str(manifest_path))
    state_dir = manifest_path.parent

    state_dir.mkdir(parents=True)
    monkeypatch.setattr(
        os,
        "statvfs",
        lambda path: type("StatVfs", (), {"f_flag": 1})(),
    )

    status = service.get_storage_status()

    assert status.available is False
    assert status.reason == "read_only_filesystem"
    assert "mounted read-only" in (status.detail or "")
    assert state_dir.exists() is True
    assert service.history_dir.exists() is False


def test_capture_manifest_raises_typed_error_when_storage_is_unavailable(tmp_path, monkeypatch):
    manifest_path = tmp_path / "state" / "version_manifest.json"
    service = VersionManifest(str(manifest_path))

    monkeypatch.setattr(service, "_get_node_packages", lambda node_id: {"map2": "1.0.0"})
    monkeypatch.setattr(
        os,
        "statvfs",
        lambda path: type("StatVfs", (), {"f_flag": 1})(),
    )

    with pytest.raises(ManifestStorageUnavailableError) as excinfo:
        service.capture_manifest("NODE-1")

    assert excinfo.value.status.available is False
    assert excinfo.value.status.reason == "read_only_filesystem"
    assert service.manifest_path.exists() is False
    assert service.history_dir.exists() is False
