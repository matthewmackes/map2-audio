from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import plugin_scanner as plugin_scanner_routes


class _FakePlugin:
    def __init__(self, *, uri: str, name: str, category: str = "Amp") -> None:
        self.uri = uri
        self.name = name
        self.category = category

    def to_dict(self) -> dict:
        return {
            "uri": self.uri,
            "name": self.name,
            "category": self.category,
        }


class _FakeScanner:
    def __init__(self) -> None:
        self.plugin_cache = {
            "map2://plugins/amp": _FakePlugin(uri="map2://plugins/amp", name="Amp"),
        }
        self.cache_file = Path("/tmp/map2-plugin-cache.json")
        self.lv2_paths = [Path("/usr/lib/lv2"), Path("/home/mm/.lv2")]
        self.scan_calls: list[bool] = []
        self.clear_calls = 0

    def scan_all(self, force_rescan: bool):
        self.scan_calls.append(force_rescan)
        return self.plugin_cache

    def get_plugin(self, uri: str):
        return self.plugin_cache.get(uri)

    def search_plugins(self, **kwargs):
        if kwargs.get("query") == "explode":
            raise RuntimeError("search failed")
        return list(self.plugin_cache.values())

    def get_categories(self):
        return ["Amp", "Delay"]

    def clear_cache(self):
        self.clear_calls += 1


def _build_client(monkeypatch, scanner: _FakeScanner) -> TestClient:
    app = FastAPI()
    app.include_router(plugin_scanner_routes.router)
    monkeypatch.setattr(plugin_scanner_routes, "_get_scanner", lambda: scanner)
    return TestClient(app)


def test_scan_routes_return_plugin_inventory_categories_and_cache_status(monkeypatch):
    scanner = _FakeScanner()
    client = _build_client(monkeypatch, scanner)

    scan_response = client.post("/api/plugins/scan/all?force_rescan=true")
    categories_response = client.get("/api/plugins/scan/categories")
    clear_response = client.post("/api/plugins/scan/clear-cache")
    cache_response = client.get("/api/plugins/scan/cache-status")

    assert scan_response.status_code == 200
    assert scan_response.json() == {
        "status": "success",
        "message": "Scanned 1 plugins",
        "plugin_count": 1,
        "plugins": [
            {
                "uri": "map2://plugins/amp",
                "name": "Amp",
                "category": "Amp",
            }
        ],
    }
    assert categories_response.status_code == 200
    assert categories_response.json() == {
        "categories": ["Amp", "Delay"],
        "count": 2,
    }
    assert clear_response.status_code == 200
    assert clear_response.json() == {
        "status": "success",
        "message": "Plugin cache cleared",
    }
    assert cache_response.status_code == 200
    assert cache_response.json() == {
        "cached_plugins": 1,
        "cache_file": "/tmp/map2-plugin-cache.json",
        "lv2_paths": ["/usr/lib/lv2", "/home/mm/.lv2"],
    }
    assert scanner.scan_calls == [True]
    assert scanner.clear_calls == 1


def test_plugin_lookup_and_search_error_paths(monkeypatch):
    scanner = _FakeScanner()
    client = _build_client(monkeypatch, scanner)

    missing_response = client.get("/api/plugins/scan/plugin", params={"uri": "missing"})
    search_response = client.get("/api/plugins/scan/search", params={"query": "explode"})

    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "Plugin not found: missing"}
    assert search_response.status_code == 500
    assert search_response.json() == {"detail": "search failed"}
