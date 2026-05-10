"""T2503 Set 9 — plugin inventory tests."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import plugin_inventory as plugin_inventory_routes
from app.services import plugin_inventory_service as svc_module
from app.services.plugin_inventory_service import (
    PluginDescriptor,
    PluginFormat,
    PluginInventoryService,
)


@pytest.fixture(autouse=True)
def _reset_service():
    yield
    svc_module.reset_plugin_inventory_service()


def test_default_inventory_has_three_native_plus_one_lv2() -> None:
    svc = PluginInventoryService()
    svc.populate_default()
    assert svc.size() == 4
    inv = svc.inventory()
    formats = [p.format for p in inv]
    assert formats.count(PluginFormat.NATIVE) == 3
    assert formats.count(PluginFormat.LV2) == 1


def test_find_by_uri() -> None:
    svc = PluginInventoryService()
    svc.populate_default()
    p = svc.find("map2:fx:nam")
    assert p is not None
    assert p.name == "Neural Amp Modeler"
    assert svc.find("urn:does-not-exist") is None


def test_set_inventory_replaces_and_fires_listeners() -> None:
    svc = PluginInventoryService()
    fired: list[int] = []
    svc.add_listener(lambda inv: fired.append(len(inv)))
    svc.set_inventory(
        [
            PluginDescriptor(uri="x", name="X", format=PluginFormat.NATIVE),
            PluginDescriptor(uri="y", name="Y", format=PluginFormat.LV2),
        ]
    )
    assert svc.size() == 2
    assert fired == [2]


def test_listener_exception_isolated() -> None:
    svc = PluginInventoryService()
    svc.add_listener(lambda inv: 1 / 0)  # always raises
    svc.set_inventory([PluginDescriptor(uri="x", name="X")])
    assert svc.size() == 1  # the mutation completed


def test_listener_remove() -> None:
    svc = PluginInventoryService()
    fired = 0

    def listener(_inv: list[PluginDescriptor]) -> None:
        nonlocal fired
        fired += 1

    svc.add_listener(listener)
    svc.set_inventory([])
    svc.remove_listener(listener)
    svc.set_inventory([])
    assert fired == 1


def test_last_scan_at_set_after_populate() -> None:
    svc = PluginInventoryService()
    assert svc.last_scan_at() is None
    svc.populate_default()
    assert svc.last_scan_at() is not None
    assert svc.last_scan_at() > 0


# ---- FastAPI surface ----


def _build_app(svc: PluginInventoryService) -> FastAPI:
    svc_module._INSTANCE = svc  # type: ignore[attr-defined]
    app = FastAPI()
    app.include_router(plugin_inventory_routes.router)
    return app


def test_list_plugins_returns_default_inventory() -> None:
    svc = PluginInventoryService()
    svc.populate_default()
    client = TestClient(_build_app(svc))
    resp = client.get("/api/v1/plugin-inventory/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["size"] == 4
    assert any(p["uri"] == "map2:fx:nam" for p in body["plugins"])


def test_get_plugin_404_for_unknown() -> None:
    svc = PluginInventoryService()
    svc.populate_default()
    client = TestClient(_build_app(svc))
    resp = client.get("/api/v1/plugin-inventory/urn:nope")
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["error"]["code"] == "plugin_not_found"


def test_get_plugin_returns_descriptor() -> None:
    svc = PluginInventoryService()
    svc.populate_default()
    client = TestClient(_build_app(svc))
    resp = client.get("/api/v1/plugin-inventory/map2:fx:nam")
    assert resp.status_code == 200
    assert resp.json()["uri"] == "map2:fx:nam"
    assert resp.json()["category"] == "amp"


def test_operation_ids_are_unique() -> None:
    op_ids = [
        getattr(route, "operation_id", None)
        for route in plugin_inventory_routes.router.routes
        if getattr(route, "operation_id", None)
    ]
    assert len(op_ids) == len(set(op_ids))
