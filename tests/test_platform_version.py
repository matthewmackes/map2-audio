from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.utils.platform_version import (
    TRACKED_VERSION_ARTIFACTS,
    detect_git_dirty_ignoring_paths,
    generate_platform_version,
    load_platform_version,
    write_platform_version,
)


def test_generate_platform_version_uses_digits_only_date_time_beta_format() -> None:
    info = generate_platform_version(
        now=datetime(2026, 3, 15, 8, 51, 7, tzinfo=timezone.utc),
        channel_code="beta-01",
        commit="abc123def456",
        dirty=True,
    )

    assert info.version == "2026031508510701"
    assert info.build_date == "20260315"
    assert info.build_time == "085107"
    assert info.build_channel == "01"
    assert info.commit == "abc123def456"
    assert info.dirty is True


def test_write_and_load_platform_version_round_trip(tmp_path: Path) -> None:
    version_json_path = tmp_path / "version.json"
    version_file_path = tmp_path / "VERSION"
    info = generate_platform_version(
        now=datetime(2026, 3, 15, 8, 51, 7, tzinfo=timezone.utc),
        channel_code="07",
        commit="deadbeefcafe",
        dirty=False,
    )

    write_platform_version(info, version_json_path, version_file_path)
    loaded = load_platform_version(version_json_path, version_file_path)

    assert loaded.version == info.version
    assert loaded.build_channel == "07"
    assert loaded.commit is None
    assert loaded.dirty is False
    assert version_file_path.read_text().strip() == info.version
    json_payload = json.loads(version_json_path.read_text())
    assert json_payload["version"] == info.version
    assert "commit" not in json_payload
    assert "dirty" not in json_payload


def test_load_platform_version_ignores_legacy_non_numeric_fallbacks(tmp_path: Path) -> None:
    version_json_path = tmp_path / "version.json"
    version_file_path = tmp_path / "VERSION"

    version_json_path.write_text(
        json.dumps(
            {
                "product": "MAP2 Audio Platform",
                "version": "0.0.0-dev",
                "fallback_version": "still-not-valid",
                "api_version": "v1",
            }
        )
        + "\n"
    )
    version_file_path.write_text("2026031508510001\n")

    loaded = load_platform_version(version_json_path, version_file_path)

    assert loaded.version == "2026031508510001"
    assert loaded.build_date == "20260315"
    assert loaded.build_time == "085100"
    assert loaded.build_channel == "01"


def test_load_platform_version_refreshes_runtime_git_state_and_ignores_tracked_artifacts(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    subprocess.run(["git", "init"], cwd=repo_root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.name", "Codex"], cwd=repo_root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "config", "user.email", "codex@example.com"], cwd=repo_root, check=True, capture_output=True, text=True)

    version_json_path = repo_root / "version.json"
    version_file_path = repo_root / "VERSION"
    tracked_file = repo_root / "tracked.txt"
    tracked_file.write_text("seed\n")
    subprocess.run(["git", "add", "tracked.txt"], cwd=repo_root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "commit", "-m", "seed"], cwd=repo_root, check=True, capture_output=True, text=True)

    info = generate_platform_version(
        now=datetime(2026, 3, 15, 8, 51, 7, tzinfo=timezone.utc),
        channel_code="01",
        commit="stalecommit12",
        dirty=True,
    )
    write_platform_version(info, version_json_path, version_file_path, include_runtime_state=False)
    subprocess.run(["git", "add", "VERSION", "version.json"], cwd=repo_root, check=True, capture_output=True, text=True)
    subprocess.run(["git", "commit", "-m", "add version artifacts"], cwd=repo_root, check=True, capture_output=True, text=True)

    loaded = load_platform_version(
        version_json_path,
        version_file_path,
        refresh_runtime_state=True,
        repo_root=repo_root,
    )

    assert loaded.version == info.version
    assert loaded.commit
    assert loaded.commit != "stalecommit12"
    assert loaded.dirty is False
    assert detect_git_dirty_ignoring_paths(repo_root, ignore_paths=TRACKED_VERSION_ARTIFACTS) is False

    tracked_file.write_text("changed\n")
    assert detect_git_dirty_ignoring_paths(repo_root, ignore_paths=TRACKED_VERSION_ARTIFACTS) is True
