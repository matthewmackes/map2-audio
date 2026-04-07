"""Tests for Ground Control Pro restart-safe session persistence."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ground_control_pro.service import GroundControlProService


@pytest.fixture()
def gcp_dir(tmp_path):
    return tmp_path / "gcp"


@pytest.fixture()
def mock_transport():
    transport = AsyncMock()
    transport.list_ports.return_value = {"inputs": [], "outputs": []}
    return transport


@pytest.fixture()
def service(gcp_dir, mock_transport):
    with patch("app.services.ground_control_pro.service.ws_manager"):
        return GroundControlProService(base_dir=gcp_dir, transport=mock_transport)


def _make_fixture_syx(gcp_dir):
    """Create a minimal fixture .syx file for testing (uses the real fixtures if available)."""
    fixture_src = Path(__file__).resolve().parent / "fixtures" / "ground_control_pro" / "factory_default_v113.syx"
    if fixture_src.exists():
        return fixture_src.read_bytes()
    return None


class TestFixtureDirectory:
    def test_fixture_dir_points_to_app_data(self, service):
        assert "app/data/ground_control_pro/fixtures" in str(service.fixture_dir)
        assert "tests/" not in str(service.fixture_dir)

    def test_fixture_dir_exists(self, service):
        assert service.fixture_dir.exists()


class TestArtifactRestore:
    def test_restores_artifacts_from_disk_on_startup(self, gcp_dir, mock_transport):
        artifacts_dir = gcp_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        manifest = {
            "artifact_id": "test-artifact-1",
            "kind": "source_syx",
            "path": str(artifacts_dir / "test-artifact-1.syx"),
            "size_bytes": 4,
            "sha256": "abc123",
            "created_at": "2026-04-07T00:00:00+00:00",
            "metadata": {},
        }
        (artifacts_dir / "test-artifact-1.syx").write_bytes(b"\xf0\x01\x02\xf7")
        import yaml
        (artifacts_dir / "test-artifact-1.yml").write_text(yaml.safe_dump(manifest), encoding="utf-8")

        with patch("app.services.ground_control_pro.service.ws_manager"):
            svc = GroundControlProService(base_dir=gcp_dir, transport=mock_transport)

        assert "test-artifact-1" in svc.artifacts
        assert svc.artifacts["test-artifact-1"]["kind"] == "source_syx"

    def test_ignores_manifests_with_missing_artifact_file(self, gcp_dir, mock_transport):
        artifacts_dir = gcp_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        manifest = {
            "artifact_id": "missing-file",
            "kind": "source_syx",
            "path": str(artifacts_dir / "missing-file.syx"),
            "size_bytes": 0,
            "sha256": "",
            "created_at": "2026-04-07T00:00:00+00:00",
            "metadata": {},
        }
        import yaml
        (artifacts_dir / "missing-file.yml").write_text(yaml.safe_dump(manifest), encoding="utf-8")

        with patch("app.services.ground_control_pro.service.ws_manager"):
            svc = GroundControlProService(base_dir=gcp_dir, transport=mock_transport)

        assert "missing-file" not in svc.artifacts


class TestSessionPersistence:
    @pytest.mark.asyncio
    async def test_import_persists_session_index(self, service):
        syx_data = _make_fixture_syx(service.base_dir)
        if syx_data is None:
            pytest.skip("No fixture .syx available for session import test")

        result = await service.import_syx_bytes(syx_data, source_name="test.syx")
        session_id = result["session_id"]

        assert service.sessions_index_path.exists()
        index = json.loads(service.sessions_index_path.read_text(encoding="utf-8"))
        assert session_id in index
        assert index[session_id]["source_name"] == "test.syx"

    @pytest.mark.asyncio
    async def test_session_survives_restart(self, gcp_dir, mock_transport):
        syx_data = _make_fixture_syx(gcp_dir)
        if syx_data is None:
            pytest.skip("No fixture .syx available for restart test")

        with patch("app.services.ground_control_pro.service.ws_manager"):
            svc1 = GroundControlProService(base_dir=gcp_dir, transport=mock_transport)
        result = await svc1.import_syx_bytes(syx_data, source_name="restart-test.syx")
        session_id = result["session_id"]
        assert session_id in svc1.sessions

        with patch("app.services.ground_control_pro.service.ws_manager"):
            svc2 = GroundControlProService(base_dir=gcp_dir, transport=mock_transport)

        assert session_id in svc2.sessions
        assert svc2.sessions[session_id]["source_name"] == "restart-test.syx"
