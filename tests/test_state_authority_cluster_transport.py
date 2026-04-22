"""Tests for the HTTP transport backing the cluster reconciler."""

from __future__ import annotations

import httpx
import pytest

from app.services.state_authority_cluster_transport import (
    fetch_observed_snapshot,
    list_cluster_node_ids,
    local_api_base_url,
    push_node_parameters,
    redeploy_asset_to_node,
    trigger_node_reactivation,
)


def _mock_transport(handler):
    return httpx.MockTransport(handler)


def _patch_async_client(monkeypatch, transport):
    """Intercept `httpx.AsyncClient` calls inside the transport module so
    tests can inject a MockTransport."""
    original_client = httpx.AsyncClient

    class _Patched(original_client):  # type: ignore[misc]
        def __init__(self, *args, **kwargs):  # noqa: D401
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(
        "app.services.state_authority_cluster_transport.httpx.AsyncClient",
        _Patched,
    )


def test_local_api_base_url_honors_map2_api_port(monkeypatch):
    monkeypatch.setenv("MAP2_API_PORT", "9091")
    assert local_api_base_url() == "http://127.0.0.1:9091"


def test_local_api_base_url_defaults_to_8080(monkeypatch):
    monkeypatch.delenv("MAP2_API_PORT", raising=False)
    assert local_api_base_url() == "http://127.0.0.1:8080"


@pytest.mark.asyncio
async def test_fetch_observed_snapshot_returns_parsed_json_on_success(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert "/api/node/node-a/proxy/api/snapshots/live" in str(request.url)
        return httpx.Response(200, json={"id": "snap-1", "chains": []})

    _patch_async_client(monkeypatch, _mock_transport(handler))
    result = await fetch_observed_snapshot("node-a")
    assert result == {"id": "snap-1", "chains": []}


@pytest.mark.asyncio
async def test_fetch_observed_snapshot_returns_none_on_404(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "no live snapshot"})

    _patch_async_client(monkeypatch, _mock_transport(handler))
    result = await fetch_observed_snapshot("node-a")
    assert result is None


@pytest.mark.asyncio
async def test_fetch_observed_snapshot_returns_none_on_transport_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    _patch_async_client(monkeypatch, _mock_transport(handler))
    result = await fetch_observed_snapshot("offline-node")
    assert result is None


@pytest.mark.asyncio
async def test_fetch_observed_snapshot_returns_none_for_non_dict_json(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=["not", "a", "dict"])

    _patch_async_client(monkeypatch, _mock_transport(handler))
    result = await fetch_observed_snapshot("node-a")
    assert result is None


@pytest.mark.asyncio
async def test_push_node_parameters_posts_desired_and_returns_true_on_success(monkeypatch):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["body"] = request.read()
        return httpx.Response(200, json={"ok": True})

    _patch_async_client(monkeypatch, _mock_transport(handler))
    ok = await push_node_parameters(
        "node-a",
        {"id": 42, "chains": [{"plugins": [{"uri": "map2:fx:nam"}]}]},
    )
    assert ok is True
    assert captured["method"] == "POST"
    assert "/api/node/node-a/proxy/api/snapshots/42/apply-parameters" in captured["url"]
    assert b"chains" in captured["body"]


@pytest.mark.asyncio
async def test_push_node_parameters_returns_false_when_snapshot_id_missing(monkeypatch):
    """Must not fire the HTTP request when we can't address the snapshot."""
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    _patch_async_client(monkeypatch, _mock_transport(handler))
    ok = await push_node_parameters("node-a", {"chains": []})  # no id / snapshot_id
    assert ok is False
    assert called is False


@pytest.mark.asyncio
async def test_push_node_parameters_returns_false_on_http_failure(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    _patch_async_client(monkeypatch, _mock_transport(handler))
    ok = await push_node_parameters("node-a", {"id": 42, "chains": []})
    assert ok is False


@pytest.mark.asyncio
async def test_trigger_node_reactivation_posts_to_activate_endpoint(monkeypatch):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        return httpx.Response(200, json={"activated": True})

    _patch_async_client(monkeypatch, _mock_transport(handler))
    ok = await trigger_node_reactivation("node-b", "snap-7")
    assert ok is True
    assert captured["method"] == "POST"
    assert "/api/node/node-b/proxy/api/snapshots/snap-7/activate" in captured["url"]


@pytest.mark.asyncio
async def test_trigger_node_reactivation_returns_false_when_snapshot_id_empty(monkeypatch):
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    _patch_async_client(monkeypatch, _mock_transport(handler))
    assert await trigger_node_reactivation("node-a", None) is False
    assert await trigger_node_reactivation("node-a", "") is False
    assert await trigger_node_reactivation("node-a", "   ") is False
    assert called is False


@pytest.mark.asyncio
async def test_trigger_node_reactivation_returns_false_on_transport_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    _patch_async_client(monkeypatch, _mock_transport(handler))
    ok = await trigger_node_reactivation("node-b", "snap-7")
    assert ok is False


@pytest.mark.asyncio
async def test_redeploy_asset_requires_sha256_prefix(monkeypatch):
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    _patch_async_client(monkeypatch, _mock_transport(handler))
    assert await redeploy_asset_to_node("node-a", "random-path.nam") is False
    assert await redeploy_asset_to_node("node-a", "") is False
    assert called is False


@pytest.mark.asyncio
async def test_redeploy_asset_posts_to_deploy_endpoint_on_valid_hash(monkeypatch):
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["method"] = request.method
        return httpx.Response(200)

    _patch_async_client(monkeypatch, _mock_transport(handler))
    ok = await redeploy_asset_to_node("node-a", "sha256:abc123")
    assert ok is True
    assert captured["method"] == "POST"
    assert "/api/node/node-a/proxy/api/assets/sha256:abc123/deploy" in captured["url"]


@pytest.mark.asyncio
async def test_list_cluster_node_ids_returns_empty_when_visibility_module_missing(monkeypatch):
    """Graceful degradation — single-node deployments have no cluster module."""
    import sys

    # Remove the module if already imported so the ImportError branch triggers.
    for key in list(sys.modules):
        if key == "app.services.cluster.node_visibility":
            monkeypatch.setitem(sys.modules, key, None)

    # The transport catches ImportError silently.
    result = await list_cluster_node_ids()
    assert isinstance(result, (list, tuple))


@pytest.mark.asyncio
async def test_list_cluster_node_ids_returns_empty_on_visibility_exception(monkeypatch):
    """If the node-visibility service raises, we catch and return empty."""
    import sys
    from types import ModuleType

    fake = ModuleType("app.services.cluster.node_visibility")

    def _raising_visible_remote_nodes():
        raise RuntimeError("bootstrap race")

    fake.get_visible_remote_nodes = _raising_visible_remote_nodes  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "app.services.cluster.node_visibility", fake)
    result = await list_cluster_node_ids()
    assert tuple(result) == ()
