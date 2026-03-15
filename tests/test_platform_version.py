from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.utils.platform_version import (
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
    assert loaded.commit == "deadbeefcafe"
    assert version_file_path.read_text().strip() == info.version
    assert json.loads(version_json_path.read_text())["version"] == info.version


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
