from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import cluster_plugin_inventory as inventory_routes
from app.services.cluster.plugin_inventory_sync import ClusterPlugin


class _FakeInventory:
    def __init__(self, *, fail_catalog: bool = False) -> None:
        self.fail_catalog = fail_catalog
        self.catalog = [
            ClusterPlugin(
                uri="map2://amp",
                name="Amp",
                category="Amp",
                version="1.0.0",
                installed_on=["node-a", "node-b"],
                format="lv2",
            ),
            ClusterPlugin(
                uri="map2://delay",
                name="Delay",
                category="Delay",
                version="2.0.0",
                installed_on=["node-b"],
                format="lv2",
            ),
        ]

    async def get_cluster_catalog(self):
        if self.fail_catalog:
            raise RuntimeError("inventory offline")
        return list(self.catalog)

    async def get_common_plugins(self):
        return [self.catalog[0]]

    async def get_unique_plugins(self):
        return {"node-b": [self.catalog[1]]}


def _build_client(monkeypatch, inventory: _FakeInventory) -> TestClient:
    app = FastAPI()
    app.include_router(inventory_routes.router)
    monkeypatch.setattr(inventory_routes, "get_cluster_plugin_inventory", lambda: inventory)
    return TestClient(app)


def test_cluster_plugin_inventory_routes_return_catalog_common_and_unique_sets(monkeypatch):
    client = _build_client(monkeypatch, _FakeInventory())

    catalog = client.get("/api/cluster/plugins/catalog")
    common = client.get("/api/cluster/plugins/common")
    unique = client.get("/api/cluster/plugins/unique")

    assert catalog.status_code == 200
    assert catalog.json() == {
        "count": 2,
        "plugins": [
            {
                "uri": "map2://amp",
                "name": "Amp",
                "category": "Amp",
                "version": "1.0.0",
                "installed_on": ["node-a", "node-b"],
                "format": "lv2",
            },
            {
                "uri": "map2://delay",
                "name": "Delay",
                "category": "Delay",
                "version": "2.0.0",
                "installed_on": ["node-b"],
                "format": "lv2",
            },
        ],
    }
    assert common.status_code == 200
    assert common.json() == {
        "count": 1,
        "plugins": [
            {
                "uri": "map2://amp",
                "name": "Amp",
                "category": "Amp",
                "version": "1.0.0",
                "installed_on": ["node-a", "node-b"],
                "format": "lv2",
            }
        ],
    }
    assert unique.status_code == 200
    assert unique.json() == {
        "unique": {
            "node-b": [
                {
                    "uri": "map2://delay",
                    "name": "Delay",
                    "category": "Delay",
                    "version": "2.0.0",
                    "installed_on": ["node-b"],
                    "format": "lv2",
                }
            ]
        }
    }


def test_cluster_plugin_catalog_surfaces_inventory_failures(monkeypatch):
    client = _build_client(monkeypatch, _FakeInventory(fail_catalog=True))

    response = client.get("/api/cluster/plugins/catalog")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to load catalog: inventory offline"}
