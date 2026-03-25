from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.plugin_appearance_service import PluginAppearanceService


def _make_client(tmp_path, monkeypatch):
    service = PluginAppearanceService(tmp_path / "plugin_appearance_overrides.json")
    monkeypatch.setattr(
        "app.routes.plugin_appearances.get_plugin_appearance_service",
        lambda: service,
    )
    return TestClient(create_app()), service


def test_plugin_appearance_crud_round_trip(tmp_path, monkeypatch):
    client, service = _make_client(tmp_path, monkeypatch)
    uri = "map2://juce/nam"

    empty = client.get(f"/api/plugin-appearances/{uri}")
    assert empty.status_code == 200
    assert empty.json() == {
        "uri": uri,
        "accent_color": None,
        "dark_variant": None,
        "light_variant": None,
        "icon_identifier": None,
        "custom_svg": None,
        "description": None,
    }

    update = client.put(
        f"/api/plugin-appearances/{uri}",
        json={
            "accent_color": "#abc",
            "dark_variant": "#112233",
            "icon_identifier": "carbon:Activity",
            "description": "Stage-ready NAM voice",
        },
    )
    assert update.status_code == 200
    assert update.json()["accent_color"] == "#aabbcc"
    assert update.json()["dark_variant"] == "#112233"
    assert update.json()["icon_identifier"] == "carbon:Activity"

    listed = client.get("/api/plugin-appearances")
    assert listed.status_code == 200
    assert listed.json()["count"] == 1
    assert listed.json()["items"][0]["uri"] == uri

    stored = json.loads(service.storage_path.read_text(encoding="utf-8"))
    assert stored[uri]["accent_color"] == "#aabbcc"

    deleted = client.delete(f"/api/plugin-appearances/{uri}")
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "deleted", "uri": uri, "removed": True}


def test_plugin_appearance_svg_upload_persists_custom_identifier(tmp_path, monkeypatch):
    client, service = _make_client(tmp_path, monkeypatch)
    uri = "hardware://lexicon-mpx1-spdif"
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>'

    response = client.post(
        f"/api/plugin-appearances/{uri}/icon-upload",
        files={"file": ("lexicon.svg", io.BytesIO(svg.encode("utf-8")), "image/svg+xml")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["uri"] == uri
    assert payload["custom_svg"] == svg
    assert payload["icon_identifier"].startswith("custom:")

    persisted = json.loads(service.storage_path.read_text(encoding="utf-8"))
    assert persisted[uri]["custom_svg"] == svg


def test_plugin_appearance_rejects_invalid_color_and_non_svg_upload(tmp_path, monkeypatch):
    client, _ = _make_client(tmp_path, monkeypatch)
    uri = "urn:test:plugin"

    invalid_color = client.put(
        f"/api/plugin-appearances/{uri}",
        json={"accent_color": "blue"},
    )
    assert invalid_color.status_code == 200
    assert invalid_color.json()["accent_color"] is None

    invalid_upload = client.post(
        f"/api/plugin-appearances/{uri}/icon-upload",
        files={"file": ("icon.txt", io.BytesIO(b"not-svg"), "text/plain")},
    )
    assert invalid_upload.status_code == 400
    assert "svg" in invalid_upload.json()["detail"].lower()
