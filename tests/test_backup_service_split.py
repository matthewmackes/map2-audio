import json
import tarfile
from pathlib import Path

import pytest

from app.services.backup import BackupService, BackupSettings
from app.services.backup_service import BackupService as CompatBackupService


def test_backup_service_compatibility_facade_uses_package_service(tmp_path: Path) -> None:
    assert CompatBackupService is BackupService

    service = BackupService(BackupSettings(backup_location=str(tmp_path)))

    assert service.get_settings().backup_location == str(tmp_path)
    assert service._get_app_root_dir().name == "map2-audio"


@pytest.mark.asyncio
async def test_backup_listing_reads_manifest_from_split_file_io_module(tmp_path: Path) -> None:
    staging = tmp_path / "staging"
    staging.mkdir()
    manifest = {
        "version": "1.0",
        "backup_id": "20260420_123456",
        "created_at": "2026-04-20T12:34:56+00:00",
    }
    (staging / "manifest.json").write_text(json.dumps(manifest))
    (staging / "README.md").write_text("backup readme")

    backup_path = tmp_path / "map2-backup-20260420_123456.tar.gz"
    with tarfile.open(backup_path, "w:gz") as archive:
        archive.add(staging / "manifest.json", arcname="manifest.json")
        archive.add(staging / "README.md", arcname="README.md")

    service = BackupService(BackupSettings(backup_location=str(tmp_path)))
    backups = await service.list_backups()

    assert [backup.id for backup in backups] == ["20260420_123456"]
    assert backups[0].valid is True
    assert backups[0].manifest == manifest


def test_backup_generated_license_matches_repository_agpl_posture(tmp_path: Path) -> None:
    service = BackupService(BackupSettings(backup_location=str(tmp_path)))

    license_text = service._generate_license()

    assert "AGPL-3.0-only" in license_text
    assert "MIT License" not in license_text
