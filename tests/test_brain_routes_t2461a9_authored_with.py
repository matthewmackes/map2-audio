"""T2461-A9 — Brain library asset overlay (`authored_with_devices`).

Covers the two routes added in this tranche:
- POST /api/engine/brain/library/assets/{asset_id}/authored-with
- GET  /api/engine/brain/library/by-device/{profile_key}

Plus the service-level overlay round-trip so the field actually surfaces
on subsequent /api/engine/brain/library reads.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import brain as brain_routes
from app.services.performance_brain_service import PerformanceBrainService


def _make_client(tmp_path: Path) -> tuple[TestClient, PerformanceBrainService]:
    service = PerformanceBrainService(root_path=tmp_path / "brain-a9")
    app = FastAPI()
    app.include_router(brain_routes.router)
    brain_routes.get_performance_brain_service = lambda: service
    # The A9 routes don't touch authority sync / drum services / WS,
    # but the module-level lookups need to resolve when the import
    # graph runs. Stub them just enough.
    class _NoopAuthoritySync:
        async def restore_instance(self, **_kwargs):
            return None

        async def sync_instance(self, **_kwargs):
            return None

    brain_routes._brain_authority_service = lambda: _NoopAuthoritySync()
    return TestClient(app), service


def _first_asset_id(client: TestClient) -> str:
    resp = client.get("/api/engine/brain/library")
    assert resp.status_code == 200
    payload = resp.json()
    for collection in payload["collections"]:
        for asset in collection["assets"]:
            return asset["asset_id"]
    raise AssertionError("brain library scan returned no assets — fixture broke")


def test_set_authored_with_persists_and_surfaces_on_library_read(tmp_path):
    client, _service = _make_client(tmp_path)
    asset_id = _first_asset_id(client)

    resp = client.post(
        f"/api/engine/brain/library/assets/{asset_id}/authored-with",
        json={"profile_keys": ["edirol-ua/ua-1000.audio", "hotone/jogg.audio"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["asset_id"] == asset_id
    # Sorted + deduped on the way through.
    assert body["authored_with_devices"] == [
        "edirol-ua/ua-1000.audio",
        "hotone/jogg.audio",
    ]
    assert body["saved_at"] > 0

    # Library read picks up the overlay.
    library = client.get("/api/engine/brain/library").json()
    found = False
    for collection in library["collections"]:
        for asset in collection["assets"]:
            if asset["asset_id"] == asset_id:
                assert asset["authored_with_devices"] == [
                    "edirol-ua/ua-1000.audio",
                    "hotone/jogg.audio",
                ]
                found = True
    assert found, "asset_id should still be present after overlay write"


def test_set_authored_with_dedupes_and_drops_blanks(tmp_path):
    client, _service = _make_client(tmp_path)
    asset_id = _first_asset_id(client)

    resp = client.post(
        f"/api/engine/brain/library/assets/{asset_id}/authored-with",
        json={"profile_keys": [
            "edirol-ua/ua-1000.audio",
            "edirol-ua/ua-1000.audio",
            "",
            "hotone/jogg.audio",
        ]},
    )
    assert resp.status_code == 200
    assert resp.json()["authored_with_devices"] == [
        "edirol-ua/ua-1000.audio",
        "hotone/jogg.audio",
    ]


def test_set_authored_with_empty_list_clears_overlay(tmp_path):
    client, _service = _make_client(tmp_path)
    asset_id = _first_asset_id(client)

    client.post(
        f"/api/engine/brain/library/assets/{asset_id}/authored-with",
        json={"profile_keys": ["edirol-ua/ua-1000.audio"]},
    )

    cleared = client.post(
        f"/api/engine/brain/library/assets/{asset_id}/authored-with",
        json={"profile_keys": []},
    )
    assert cleared.status_code == 200
    assert cleared.json()["authored_with_devices"] == []


def test_set_authored_with_unknown_asset_404(tmp_path):
    client, _service = _make_client(tmp_path)

    resp = client.post(
        "/api/engine/brain/library/assets/asset-that-does-not-exist/authored-with",
        json={"profile_keys": ["edirol-ua/ua-1000.audio"]},
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["error"]["code"] == "asset_not_found"


def test_assets_for_device_returns_count_and_ids(tmp_path):
    client, _service = _make_client(tmp_path)
    asset_id_a = _first_asset_id(client)
    library = client.get("/api/engine/brain/library").json()
    asset_ids = [
        asset["asset_id"]
        for collection in library["collections"]
        for asset in collection["assets"]
    ]
    assert len(asset_ids) >= 2
    asset_id_b = next(aid for aid in asset_ids if aid != asset_id_a)

    client.post(
        f"/api/engine/brain/library/assets/{asset_id_a}/authored-with",
        json={"profile_keys": ["edirol-ua/ua-1000.audio"]},
    )
    client.post(
        f"/api/engine/brain/library/assets/{asset_id_b}/authored-with",
        json={"profile_keys": ["edirol-ua/ua-1000.audio", "hotone/jogg.audio"]},
    )

    # UA-1000 should be tagged on both.
    resp = client.get("/api/engine/brain/library/by-device/edirol-ua%2Fua-1000.audio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["profile_key"] == "edirol-ua/ua-1000.audio"
    assert body["asset_count"] == 2
    assert sorted(body["asset_ids"]) == sorted([asset_id_a, asset_id_b])

    # Hotone should be tagged on B only.
    resp = client.get("/api/engine/brain/library/by-device/hotone%2Fjogg.audio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["asset_count"] == 1
    assert body["asset_ids"] == [asset_id_b]

    # Unknown profile_key returns 0 + empty ids (not 404 — the page can
    # poll any key without needing to know which exist).
    resp = client.get("/api/engine/brain/library/by-device/never-pinned%2Fmodel.midi")
    assert resp.status_code == 200
    assert resp.json() == {
        "profile_key": "never-pinned/model.midi",
        "asset_count": 0,
        "asset_ids": [],
    }


def test_overlay_survives_service_restart(tmp_path):
    """Overlay sidecar is on disk so a fresh service instance reads it back."""
    client, service = _make_client(tmp_path)
    asset_id = _first_asset_id(client)

    client.post(
        f"/api/engine/brain/library/assets/{asset_id}/authored-with",
        json={"profile_keys": ["edirol-ua/ua-1000.audio"]},
    )

    # New service instance over the same root directory — sidecar must
    # be rehydrated on next read.
    PerformanceBrainService._instances.clear()  # type: ignore[attr-defined]
    fresh_service = PerformanceBrainService(root_path=service._root_path)
    library = fresh_service.get_library()
    found = False
    for collection in library["collections"]:
        for asset in collection["assets"]:
            if asset["asset_id"] == asset_id:
                assert asset["authored_with_devices"] == ["edirol-ua/ua-1000.audio"]
                found = True
    assert found
