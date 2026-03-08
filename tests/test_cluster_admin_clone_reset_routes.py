import asyncio

import pytest
from fastapi import HTTPException

from app.routes import cluster_admin


def test_preview_reset_default_rejoin_success(monkeypatch):
    expected = {
        "identity": {"basic_node_id": "node-a"},
        "targets": {"existing": ["/etc/map2/node-identity.json"], "missing": []},
    }

    monkeypatch.setattr(
        "app.services.cluster.clone_reset.preview_clone_reset",
        lambda: expected,
    )

    payload = asyncio.run(cluster_admin.preview_reset_default_rejoin())

    assert payload["status"] == "ok"
    assert payload["identity"]["basic_node_id"] == "node-a"
    assert payload["targets"]["existing"] == ["/etc/map2/node-identity.json"]


def test_preview_reset_default_rejoin_failure_maps_to_http_500(monkeypatch):
    def _raise_preview_error():
        raise RuntimeError("preview failed")

    monkeypatch.setattr(
        "app.services.cluster.clone_reset.preview_clone_reset",
        _raise_preview_error,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(cluster_admin.preview_reset_default_rejoin())

    assert exc.value.status_code == 500
    assert exc.value.detail == "preview failed"


def test_reset_default_rejoin_defaults_and_success_status(monkeypatch):
    captured = {}

    async def _fake_reset(*, management_node_ip, rejoin, clear_registry_state):
        captured.update(
            {
                "management_node_ip": management_node_ip,
                "rejoin": rejoin,
                "clear_registry_state": clear_registry_state,
            }
        )
        return {"success": True, "rejoin": {"success": True}}

    monkeypatch.setattr(
        "app.services.cluster.clone_reset.reset_clone_to_default_and_rejoin",
        _fake_reset,
    )

    payload = asyncio.run(cluster_admin.reset_default_rejoin())

    assert payload["status"] == "ok"
    assert payload["success"] is True
    assert captured == {
        "management_node_ip": None,
        "rejoin": True,
        "clear_registry_state": True,
    }


def test_reset_default_rejoin_coerces_payload_and_maps_partial_status(monkeypatch):
    captured = {}

    async def _fake_reset(*, management_node_ip, rejoin, clear_registry_state):
        captured.update(
            {
                "management_node_ip": management_node_ip,
                "rejoin": rejoin,
                "clear_registry_state": clear_registry_state,
            }
        )
        return {"success": False, "warnings": ["rejoin failed"]}

    monkeypatch.setattr(
        "app.services.cluster.clone_reset.reset_clone_to_default_and_rejoin",
        _fake_reset,
    )

    payload = asyncio.run(
        cluster_admin.reset_default_rejoin(
            {
                "management_node_ip": " 10.1.2.30 ",
                "rejoin": "false",
                "clear_registry_state": "0",
            }
        )
    )

    assert payload["status"] == "partial"
    assert payload["success"] is False
    assert payload["warnings"] == ["rejoin failed"]
    assert captured == {
        "management_node_ip": "10.1.2.30",
        "rejoin": False,
        "clear_registry_state": False,
    }


def test_reset_default_rejoin_failure_maps_to_http_500(monkeypatch):
    async def _raise_reset_error(*, management_node_ip, rejoin, clear_registry_state):
        raise RuntimeError("reset failed")

    monkeypatch.setattr(
        "app.services.cluster.clone_reset.reset_clone_to_default_and_rejoin",
        _raise_reset_error,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(cluster_admin.reset_default_rejoin({}))

    assert exc.value.status_code == 500
    assert exc.value.detail == "reset failed"
