from __future__ import annotations

from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import audio_path as audio_path_routes


class _FakeNodeAudioPath:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def to_dict(self) -> dict:
        return dict(self._payload)


class _FakeAudioPathService:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    async def get_node_audio_path(self) -> _FakeNodeAudioPath:
        return _FakeNodeAudioPath(self.payload)


class _FakeRegistry:
    def __init__(self, nodes: list[dict]) -> None:
        self._nodes = list(nodes)

    def get_all_nodes(self):
        return list(self._nodes)

    def get_node(self, node_id: str):
        for node in self._nodes:
            if node.get("id") == node_id or node.get("node_id") == node_id:
                return node
        return None


class _FakeAsyncClient:
    def __init__(self, *args, responses: dict[str, object], **kwargs) -> None:
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url: str):
        result = self._responses[url]
        if isinstance(result, Exception):
            raise result
        return result


def _build_client(monkeypatch, *, service=None, registry=None, responses=None) -> TestClient:
    response_map = responses or {}

    def _async_client_factory(*args, **kwargs):
        return _FakeAsyncClient(*args, responses=response_map, **kwargs)

    app = FastAPI()
    app.include_router(audio_path_routes.router)
    monkeypatch.setattr(
        audio_path_routes,
        "get_audio_path_service",
        lambda: service or _FakeAudioPathService({"overall_health": "healthy"}),
    )
    monkeypatch.setattr(
        audio_path_routes,
        "get_cluster_registry",
        lambda: registry or _FakeRegistry([]),
    )
    monkeypatch.setattr(httpx, "AsyncClient", _async_client_factory)
    return TestClient(app)


def test_local_audio_path_returns_service_payload(monkeypatch):
    service = _FakeAudioPathService(
        {
            "overall_health": "healthy",
            "latency": {"total_ms": 2.4},
            "alerts": [],
        }
    )
    client = _build_client(monkeypatch, service=service)

    response = client.get("/api/audio-path/local")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["data"] == {
        "overall_health": "healthy",
        "latency": {"total_ms": 2.4},
        "alerts": [],
    }


def test_nodes_endpoint_aggregates_remote_audio_paths_and_failures(monkeypatch):
    registry = _FakeRegistry(
        [
            {"id": "node-a", "hostname": "alpha", "url": "http://alpha:8080"},
            {"id": "node-b", "hostname": "beta", "url": "http://beta:8080"},
        ]
    )
    responses = {
        "http://alpha:8080/api/audio-path/local": httpx.Response(
            200,
            json={
                "data": {
                    "overall_health": "healthy",
                    "alerts": ["Clock drift"],
                    "latency": {"total_ms": 2.1},
                }
            },
            request=httpx.Request("GET", "http://alpha:8080/api/audio-path/local"),
        ),
        "http://beta:8080/api/audio-path/local": httpx.ConnectError(
            "offline",
            request=httpx.Request("GET", "http://beta:8080/api/audio-path/local"),
        ),
    }
    client = _build_client(monkeypatch, registry=registry, responses=responses)

    response = client.get("/api/audio-path/nodes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_nodes"] == 2
    assert payload["healthy_nodes"] == 1
    assert payload["unhealthy_nodes"] == 1
    assert payload["alerts"] == ["alpha: Clock drift"]
    assert payload["nodes"] == [
        {
            "node_id": "node-a",
            "hostname": "alpha",
            "audio_path": {
                "overall_health": "healthy",
                "alerts": ["Clock drift"],
                "latency": {"total_ms": 2.1},
            },
        },
        {
            "node_id": "node-b",
            "hostname": "beta",
            "error": "Failed to fetch: offline",
        },
    ]


def test_summary_endpoint_counts_health_latency_and_critical_alerts(monkeypatch):
    registry = _FakeRegistry(
        [
            {"id": "node-a", "hostname": "alpha", "url": "http://alpha:8080"},
            {"id": "node-b", "hostname": "beta", "url": "http://beta:8080"},
            {"id": "node-c", "hostname": "gamma", "url": "http://gamma:8080"},
        ]
    )
    responses = {
        "http://alpha:8080/api/audio-path/local": httpx.Response(
            200,
            json={"data": {"overall_health": "healthy", "latency": {"total_ms": 2.0}, "alerts": []}},
            request=httpx.Request("GET", "http://alpha:8080/api/audio-path/local"),
        ),
        "http://beta:8080/api/audio-path/local": httpx.Response(
            200,
            json={
                "data": {
                    "overall_health": "warning",
                    "latency": {"total_ms": 4.0},
                    "alerts": ["🔴 XRuns detected"],
                }
            },
            request=httpx.Request("GET", "http://beta:8080/api/audio-path/local"),
        ),
        "http://gamma:8080/api/audio-path/local": httpx.ConnectError(
            "unreachable",
            request=httpx.Request("GET", "http://gamma:8080/api/audio-path/local"),
        ),
    }
    client = _build_client(monkeypatch, registry=registry, responses=responses)

    response = client.get("/api/audio-path/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {
        "total_nodes": 3,
        "healthy_nodes": 1,
        "warning_nodes": 1,
        "error_nodes": 1,
        "average_latency_ms": 3.0,
        "critical_alerts_count": 1,
    }
    assert payload["critical_alerts"] == [
        {
            "node_id": "node-b",
            "alert": "🔴 XRuns detected",
        }
    ]
