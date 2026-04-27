import json
import subprocess
import tarfile
from pathlib import Path

import pytest

from app.services.backup import BackupService, BackupSettings
from app.services.backup_service import BackupService as CompatBackupService


REPO_ROOT = Path(__file__).resolve().parents[1]


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


def test_generated_rebuild_script_installs_current_platform_layers(tmp_path: Path) -> None:
    service = BackupService(BackupSettings(backup_location=str(tmp_path)))

    result = service.generate_rebuild_script()
    script = result["script_content"]

    assert "requirements-backend-runtime.txt" in script
    assert "requirements-installer.txt" in script
    assert 'python3 -m venv "$INSTALL_DIR/.venv"' in script
    assert "npm ci" in script
    assert "build_juce_engine" in script
    assert "-DBUILD_CONTROLLER_HOST=ON" in script
    assert "--target map2_audio_engine map2-controller-host" in script
    assert "$INSTALL_DIR/device-packs/_schema" in script
    assert "$INSTALL_DIR/juce-engine/build/map2-controller-host" in script
    assert "systemd/map2-irq-affinity.sh" in script


def test_backup_service_script_entrypoint_generates_rebuild_script(tmp_path: Path) -> None:
    output_path = tmp_path / "map2-rebuild.sh"

    result = subprocess.run(
        [
            "python3",
            "app/services/backup_service.py",
            "--generate-rebuild-script",
            str(output_path),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert output_path.exists()
    assert "map2-controller-host" in output_path.read_text(encoding="utf-8")

    syntax_result = subprocess.run(
        ["bash", "-n", str(output_path)],
        text=True,
        capture_output=True,
        check=False,
    )
    assert syntax_result.returncode == 0, syntax_result.stderr
