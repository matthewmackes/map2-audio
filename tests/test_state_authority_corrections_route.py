"""Tests for the State Authority correction-receiving routes."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.state_authority_corrections import router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class _FakeEngine:
    def __init__(self):
        self.calls: list[tuple[str, str, float, int]] = []
        self._ok = True

    async def set_parameter(self, uri: str, symbol: str, value: float, *, plugin_position: int) -> bool:  # type: ignore[no-untyped-def]
        self.calls.append((uri, symbol, value, plugin_position))
        return self._ok


# -------------------- apply-parameters ------------------------------------


def test_apply_parameters_503_when_engine_missing():
    with patch("app.routes.state_authority_corrections.get_audio_engine", return_value=None):
        client = _client()
        response = client.post(
            "/api/snapshots/42/apply-parameters",
            json={"desired": {"chains": []}},
        )
    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "engine_unavailable"


def test_apply_parameters_501_when_engine_lacks_set_parameter():
    class _StaleEngine:
        pass
    with patch("app.routes.state_authority_corrections.get_audio_engine", return_value=_StaleEngine()):
        client = _client()
        response = client.post(
            "/api/snapshots/42/apply-parameters",
            json={"desired": {"chains": []}},
        )
    assert response.status_code == 501
    assert response.json()["detail"]["error"]["code"] == "set_parameter_not_exposed"


def test_apply_parameters_applies_every_numeric_value_and_reports_counts():
    fake = _FakeEngine()
    payload = {
        "desired": {
            "chains": [
                {
                    "plugins": [
                        {
                            "uri": "map2:fx:nam",
                            "position": 0,
                            "parameters": {"gain": 0.7, "mix": 0.5},
                        },
                        {
                            "uri": "map2:fx:delay",
                            "position": 1,
                            "parameters": {"time_ms": 375.0, "feedback": 0.35},
                        },
                    ]
                },
                {
                    "plugins": [
                        {
                            "uri": "map2:fx:reverb-ir",
                            "plugin_position": 2,
                            "parameters": {"mix": "not-a-number"},  # should skip
                        },
                    ]
                },
            ]
        }
    }
    with patch("app.routes.state_authority_corrections.get_audio_engine", return_value=fake):
        client = _client()
        response = client.post("/api/snapshots/42/apply-parameters", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["total_observed"] == 5
    assert body["applied"] == 4  # four numeric params
    assert body["skipped"] == 1  # the "not-a-number" string
    # 4 parameter calls registered on the engine
    assert len(fake.calls) == 4
    assert ("map2:fx:nam", "gain", 0.7, 0) in fake.calls
    assert ("map2:fx:delay", "time_ms", 375.0, 1) in fake.calls


def test_apply_parameters_skips_plugins_without_uri_silently():
    fake = _FakeEngine()
    payload = {
        "desired": {
            "chains": [
                {"plugins": [{"parameters": {"gain": 0.5}}]},  # no uri — skip entire plugin
                {"plugins": [{"uri": "", "parameters": {"gain": 0.5}}]},  # empty uri — same
            ]
        }
    }
    with patch("app.routes.state_authority_corrections.get_audio_engine", return_value=fake):
        client = _client()
        response = client.post("/api/snapshots/42/apply-parameters", json=payload)
    assert response.status_code == 200
    assert response.json()["total_observed"] == 0
    assert len(fake.calls) == 0


def test_apply_parameters_counts_engine_refusal_as_skipped():
    fake = _FakeEngine()
    fake._ok = False  # engine returns False for every set_parameter
    payload = {
        "desired": {
            "chains": [{"plugins": [{"uri": "map2:fx:nam", "parameters": {"gain": 0.7}}]}]
        }
    }
    with patch("app.routes.state_authority_corrections.get_audio_engine", return_value=fake):
        client = _client()
        response = client.post("/api/snapshots/42/apply-parameters", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["applied"] == 0
    assert body["skipped"] == 1


def test_apply_parameters_swallows_exceptions_and_counts_as_skipped():
    class _ThrowingEngine:
        async def set_parameter(self, *args, **kwargs):
            raise RuntimeError("engine mid-reboot")
    payload = {
        "desired": {
            "chains": [{"plugins": [{"uri": "map2:fx:nam", "parameters": {"gain": 0.7}}]}]
        }
    }
    with patch(
        "app.routes.state_authority_corrections.get_audio_engine",
        return_value=_ThrowingEngine(),
    ):
        client = _client()
        response = client.post("/api/snapshots/42/apply-parameters", json=payload)
    assert response.status_code == 200
    assert response.json()["skipped"] == 1


# -------------------- asset-deploy ----------------------------------------


def test_asset_deploy_rejects_non_sha256_hash():
    client = _client()
    response = client.post("/api/assets/sha256:short/deploy")
    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_asset_hash"

    response2 = client.post("/api/assets/not-a-hash/deploy")
    assert response2.status_code == 400


def test_asset_deploy_returns_404_when_directory_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routes.state_authority_corrections._ASSET_ROOT", tmp_path)
    full_hash = "sha256:" + "a" * 64
    client = _client()
    response = client.post(f"/api/assets/{full_hash}/deploy")
    assert response.status_code == 404
    assert response.json()["detail"]["error"]["code"] == "asset_not_local"


def test_asset_deploy_returns_404_when_directory_present_but_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routes.state_authority_corrections._ASSET_ROOT", tmp_path)
    full_hash = "sha256:" + "b" * 64
    asset_dir = tmp_path / ("b" * 64)
    asset_dir.mkdir()
    client = _client()
    response = client.post(f"/api/assets/{full_hash}/deploy")
    assert response.status_code == 404
    assert response.json()["detail"]["error"]["code"] == "asset_directory_empty"


def test_asset_deploy_returns_200_with_path_and_size_when_asset_present(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routes.state_authority_corrections._ASSET_ROOT", tmp_path)
    full_hash = "sha256:" + "c" * 64
    asset_dir = tmp_path / ("c" * 64)
    asset_dir.mkdir()
    asset_file = asset_dir / "Mesa.nam"
    asset_file.write_bytes(b"amp-model-bytes")
    client = _client()
    response = client.post(f"/api/assets/{full_hash}/deploy")
    assert response.status_code == 200
    body = response.json()
    assert body["asset_hash"] == full_hash
    assert body["local_path"] == str(asset_file)
    assert body["size_bytes"] == len(b"amp-model-bytes")
