import copy
import json
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import adoption
from app.services.cluster.adoption import AdoptionRecord, AdoptionService, AdoptionStore, set_adoption_service
from app.services.cluster.node_visibility import VisibleRemoteNode
from app.services.cluster.registry import ClusterRegistry
from app.utils.platform_version import get_platform_version


class _MockHTTPResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _make_visible_node(
    *,
    node_id: str,
    hostname: str,
    host: str,
    port: int = 8080,
    registered: bool = False,
    metadata: dict | None = None,
    capabilities: dict | None = None,
) -> VisibleRemoteNode:
    node = VisibleRemoteNode(
        node_id=node_id,
        hostname=hostname,
        host=host,
        port=port,
        node_mode="AUDIO-NODE",
    )
    node.metadata = dict(metadata or {})
    node.capabilities = dict(capabilities or {})
    node.last_seen = datetime.now(timezone.utc)
    node.discovered_at = datetime.now(timezone.utc)
    node.api_url = f"http://{host}:{port}"
    node.ws_url = f"ws://{host}:{port}/ws"
    node.sources.add("mdns")
    node.basic_mdns_online = True
    node.avb_enabled = bool(node.metadata.get("avb_enabled", True))
    node.registered = registered
    if registered:
        node.sources.add("registry")
        node.heartbeat_online = True
    node.finalize()
    return node


def test_list_candidates_returns_visible_unmanaged_nodes(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={
                "software_version": get_platform_version(),
                "ptp_state": "LOCKED",
                "avb_enabled": True,
            },
            capabilities={"avb": True},
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        response = client.get("/api/adoption/candidates")

    set_adoption_service(None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["candidate_id"] == "cand_peer-unmanaged"
    assert payload["items"][0]["adoption_state"] == "candidate"
    assert payload["items"][0]["trust_state"] == "unknown"
    assert payload["items"][0]["registered"] is False


def test_claim_adopt_and_promote_candidate(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    monkeypatch.setattr(
        service,
        "_verify_remote_pairing",
        lambda record, *, pairing_code, bootstrap_token, actor_node_id: {
            "claim_token": "claim-token-1",
            "token_expires_at": "2026-03-23T12:00:00+00:00",
            "remote_fingerprint": "fingerprint-1",
            "remote_node_id": record.remote_node_id,
        },
    )
    monkeypatch.setattr(service, "_finalize_remote_claim", lambda record, *, actor_node_id: None)
    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={
                "software_version": get_platform_version(),
                "ptp_state": "LOCKED",
                "avb_enabled": True,
            },
            capabilities={
                "avb": True,
                "cpu_cores": 8,
                "memory_gb": 16,
                "audio_interfaces": ["Hotone Jogg"],
                "midi_inputs": 2,
                "midi_outputs": 2,
            },
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        claim_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"pairing_code": "123456", "requested_by": "local-node"},
        )
        assert claim_response.status_code == 200
        assert claim_response.json()["candidate"]["adoption_state"] == "claimable"

        adopt_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/adopt",
            json={
                "display_name": "Stage Right",
                "role": "AUDIO-NODE",
                "activation_mode": "standby",
            },
        )
        assert adopt_response.status_code == 200
        adopted = adopt_response.json()["candidate"]
        assert adopted["node_id"] == "peer-unmanaged"
        assert adopted["adoption_state"] == "adopted"
        assert adopted["activation_state"] == "standby"
        assert adopted["routing_ready"] is False
        assert adopted["avb_auto_provision"]["state"] == "skipped"

        readiness_response = client.get("/api/adoption/candidates/cand_peer-unmanaged/readiness")
        assert readiness_response.status_code == 200
        assert readiness_response.json()["status"] == "ready"

        promote_response = client.post(
            "/api/adoption/nodes/peer-unmanaged/promote",
            json={"activation_scope": "all", "requested_by": "local-node"},
        )
        assert promote_response.status_code == 200
        promoted = promote_response.json()["candidate"]
        assert promoted["adoption_state"] == "ready"
        assert promoted["activation_state"] == "active"
        assert promoted["routing_ready"] is True

    set_adoption_service(None)

    registry_row = registry.get_node("peer-unmanaged")
    assert registry_row is not None
    assert registry_row["hostname"] == "rack-unmanaged"


def test_adoption_triggers_strict_srp_avdecc_auto_provision(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    monkeypatch.setattr(
        service,
        "_verify_remote_pairing",
        lambda record, *, pairing_code, bootstrap_token, actor_node_id: {
            "claim_token": "claim-token-1",
            "token_expires_at": "2026-03-23T12:00:00+00:00",
            "remote_fingerprint": "fingerprint-1",
            "remote_node_id": record.remote_node_id,
        },
    )
    monkeypatch.setattr(service, "_finalize_remote_claim", lambda record, *, actor_node_id: None)

    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={
                "software_version": get_platform_version(),
                "ptp_state": "LOCKED",
                "avb_enabled": True,
            },
            capabilities={"avb": True},
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    class _RouterProbe:
        def __init__(self):
            self.calls: list[str] = []

        async def trigger_auto_connect(self, *, reason: str = "manual"):
            self.calls.append(reason)
            return {"reason": reason, "connected": 1, "failed": 0, "candidate_pairs": 1}

    router_probe = _RouterProbe()

    def _fake_config_get(key, default=None):
        overrides = {
            "avb.enabled": True,
            "avb.auto_connect": True,
            "avb.avdecc_enabled": True,
            "avb.srp.enabled": True,
            "avb.srp.required": True,
        }
        return overrides.get(key, default)

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "config_get", _fake_config_get)
    monkeypatch.setattr("app.services.avb.avb_router.get_avb_router", lambda: router_probe)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        claim_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"pairing_code": "123456", "requested_by": "local-node"},
        )
        assert claim_response.status_code == 200

        adopt_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/adopt",
            json={
                "display_name": "Stage Right",
                "role": "AUDIO-NODE",
                "activation_mode": "standby",
            },
        )
        assert adopt_response.status_code == 200

        promote_response = client.post(
            "/api/adoption/nodes/peer-unmanaged/promote",
            json={"activation_scope": "all", "requested_by": "local-node"},
        )
        assert promote_response.status_code == 200

    set_adoption_service(None)

    assert router_probe.calls == ["adoption:peer-unmanaged", "promotion:peer-unmanaged"]


def test_adoption_skips_auto_provision_when_strict_profile_not_enabled(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    monkeypatch.setattr(
        service,
        "_verify_remote_pairing",
        lambda record, *, pairing_code, bootstrap_token, actor_node_id: {
            "claim_token": "claim-token-1",
            "token_expires_at": "2026-03-23T12:00:00+00:00",
            "remote_fingerprint": "fingerprint-1",
            "remote_node_id": record.remote_node_id,
        },
    )
    monkeypatch.setattr(service, "_finalize_remote_claim", lambda record, *, actor_node_id: None)

    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={"software_version": get_platform_version(), "ptp_state": "LOCKED", "avb_enabled": True},
            capabilities={"avb": True},
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    class _RouterProbe:
        def __init__(self):
            self.calls: list[str] = []

        async def trigger_auto_connect(self, *, reason: str = "manual"):
            self.calls.append(reason)
            return {"reason": reason, "connected": 1, "failed": 0, "candidate_pairs": 1}

    router_probe = _RouterProbe()

    def _fake_config_get(key, default=None):
        overrides = {
            "avb.enabled": True,
            "avb.auto_connect": True,
            "avb.avdecc_enabled": False,
            "avb.srp.enabled": True,
            "avb.srp.required": True,
        }
        return overrides.get(key, default)

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "config_get", _fake_config_get)
    monkeypatch.setattr("app.services.avb.avb_router.get_avb_router", lambda: router_probe)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        claim_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"pairing_code": "123456", "requested_by": "local-node"},
        )
        assert claim_response.status_code == 200

        adopt_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/adopt",
            json={
                "display_name": "Stage Right",
                "role": "AUDIO-NODE",
                "activation_mode": "standby",
            },
        )
        assert adopt_response.status_code == 200

    set_adoption_service(None)

    assert router_probe.calls == []


def test_adoption_response_includes_avb_auto_provision_summary(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    monkeypatch.setattr(
        service,
        "_verify_remote_pairing",
        lambda record, *, pairing_code, bootstrap_token, actor_node_id: {
            "claim_token": "claim-token-1",
            "token_expires_at": "2026-03-23T12:00:00+00:00",
            "remote_fingerprint": "fingerprint-1",
            "remote_node_id": record.remote_node_id,
        },
    )
    monkeypatch.setattr(service, "_finalize_remote_claim", lambda record, *, actor_node_id: None)

    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={"software_version": get_platform_version(), "ptp_state": "LOCKED", "avb_enabled": True},
            capabilities={"avb": True},
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    class _RouterProbe:
        async def trigger_auto_connect(self, *, reason: str = "manual"):
            return {
                "reason": reason,
                "connected": 2,
                "failed": 1,
                "candidate_pairs": 3,
                "error": "listener mismatch",
                "last_run_at": "2026-03-25T16:30:00Z",
            }

    def _fake_config_get(key, default=None):
        overrides = {
            "avb.enabled": True,
            "avb.auto_connect": True,
            "avb.avdecc_enabled": True,
            "avb.srp.enabled": True,
            "avb.srp.required": True,
        }
        return overrides.get(key, default)

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "config_get", _fake_config_get)
    monkeypatch.setattr("app.services.avb.avb_router.get_avb_router", lambda: _RouterProbe())

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"pairing_code": "123456", "requested_by": "local-node"},
        )
        adopt_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/adopt",
            json={"display_name": "Stage Right", "role": "AUDIO-NODE", "activation_mode": "standby"},
        )
        list_response = client.get("/api/adoption/candidates")

    set_adoption_service(None)

    adopted = adopt_response.json()["candidate"]
    listed = list_response.json()["items"][0]
    assert adopted["avb_auto_provision"]["state"] == "completed_with_issues"
    assert adopted["avb_auto_provision"]["connected"] == 2
    assert adopted["avb_auto_provision"]["failed"] == 1
    assert listed["avb_auto_provision"]["state"] == "completed_with_issues"


def test_claim_candidate_accepts_bootstrap_token(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    captured: dict[str, str | None] = {}

    def _fake_verify_remote_pairing(record, *, pairing_code, bootstrap_token, actor_node_id):
        captured["pairing_code"] = pairing_code
        captured["bootstrap_token"] = bootstrap_token
        captured["actor_node_id"] = actor_node_id
        return {
            "claim_token": "claim-token-tokenized",
            "token_expires_at": "2026-03-23T12:00:00+00:00",
            "remote_fingerprint": "fingerprint-tokenized",
            "remote_node_id": record.remote_node_id,
        }

    monkeypatch.setattr(service, "_verify_remote_pairing", _fake_verify_remote_pairing)

    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={"software_version": get_platform_version()},
            capabilities={"avb": True},
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"bootstrap_token": "signed-bootstrap-token", "requested_by": "local-node"},
        )

    set_adoption_service(None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["candidate"]["adoption_state"] == "claimable"
    assert payload["candidate"]["trust_state"] == "claimed"
    assert captured == {
        "pairing_code": None,
        "bootstrap_token": "signed-bootstrap-token",
        "actor_node_id": "local-node",
    }


def test_claim_rejects_invalid_pairing_code(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={"software_version": get_platform_version()},
            capabilities={"avb": True},
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"pairing_code": "12"},
        )

    set_adoption_service(None)

    assert response.status_code == 400
    assert "Pairing code must be 6-8 digits" in response.json()["detail"]


def test_clone_preview_and_apply_for_adopted_node(tmp_path, monkeypatch):
    db_path = tmp_path / "cluster.db"
    registry = ClusterRegistry(db_path=db_path)
    service = AdoptionService(store=AdoptionStore(db_path=db_path), registry=registry)
    monkeypatch.setattr(
        service,
        "_verify_remote_pairing",
        lambda record, *, pairing_code, bootstrap_token, actor_node_id: {
            "claim_token": "claim-token-1",
            "token_expires_at": "2026-03-23T12:00:00+00:00",
            "remote_fingerprint": "fingerprint-1",
            "remote_node_id": record.remote_node_id,
        },
    )
    monkeypatch.setattr(service, "_finalize_remote_claim", lambda record, *, actor_node_id: None)

    visible_nodes = {
        "peer-unmanaged": _make_visible_node(
            node_id="peer-unmanaged",
            hostname="rack-unmanaged",
            host="10.0.0.60",
            metadata={
                "software_version": get_platform_version(),
                "ptp_state": "LOCKED",
                "avb_enabled": True,
            },
            capabilities={
                "avb": True,
                "cpu_cores": 8,
                "memory_gb": 16,
                "audio_interfaces": ["Hotone Jogg"],
                "midi_inputs": 2,
                "midi_outputs": 2,
            },
        )
    }

    def _fake_get_visible_remote_nodes():
        snapshot = {node_id: copy.deepcopy(node) for node_id, node in visible_nodes.items()}
        service.apply_visibility_overlay(snapshot)
        return "local-node", snapshot

    set_adoption_service(service)
    monkeypatch.setattr("app.services.cluster.node_visibility.get_visible_remote_nodes", _fake_get_visible_remote_nodes)
    monkeypatch.setattr(adoption, "get_adoption_service", lambda: service)
    monkeypatch.setattr(adoption, "get_visible_remote_nodes", _fake_get_visible_remote_nodes)

    registry.add_or_update_node(
        node_id="source-node",
        hostname="MAP2-SOURCE",
        ip_address="10.0.0.10",
        role="AUDIO-NODE",
        deployment_mode="AUDIO-NODE",
        status="online",
        version=get_platform_version(),
        metadata={"url": "http://10.0.0.10:8080"},
    )

    request_log: list[tuple[str, str, dict | None]] = []

    def _fake_http_request(method, url, json=None, timeout=5.0):
        request_log.append((method.upper(), url, json))
        normalized_method = method.upper()

        if normalized_method == "GET" and url == "http://10.0.0.10:8080/api/deployment/mode":
            return _MockHTTPResponse(200, {"mode": "AUDIO-NODE", "description": "Dedicated audio processing node with API"})
        if normalized_method == "GET" and url == "http://10.0.0.10:8080/api/runtime-profiles/status":
            return _MockHTTPResponse(200, {"current_profile": "Performance", "supported_profiles": ["Edit", "Performance"]})
        if normalized_method == "GET" and url == "http://10.0.0.10:8080/api/audio/source-of-truth":
            return _MockHTTPResponse(
                200,
                {
                    "profile": {
                        "selected_profile": "legacy_fixed_48k",
                        "profile_version": "2026.03",
                        "clock_master": "internal",
                    },
                    "configured": {
                        "engine_rate_hz": 48000,
                        "avb_stream_rate_hz": 48000,
                        "spdif_rate_hz": 48000,
                        "buffer_size_samples": 64,
                        "bits_per_sample": 24,
                        "allowed_rates_hz": [48000],
                        "require_hard_lock": True,
                        "allow_resampler": False,
                        "avb": {
                            "enabled": True,
                            "interface": "enp11s0",
                            "auto_connect": False,
                            "ptp_domain": 0,
                            "max_streams": 8,
                        },
                    },
                },
            )
        if normalized_method == "GET" and url == "http://10.0.0.10:8080/api/avb/status":
            return _MockHTTPResponse(
                200,
                {
                    "interface": "enp11s0",
                    "config": {
                        "ptp_domain": 0,
                        "auto_connect": False,
                        "max_streams": 8,
                    },
                },
            )

        if normalized_method == "POST" and url == "http://10.0.0.60:8080/api/deployment/mode":
            return _MockHTTPResponse(200, {"mode": "AUDIO-NODE", "description": "Dedicated audio processing node with API"})
        if normalized_method == "POST" and url == "http://10.0.0.60:8080/api/runtime-profiles/switch":
            return _MockHTTPResponse(200, {"status": "applied", "target_profile": "Performance"})
        if normalized_method == "PUT" and url == "http://10.0.0.60:8080/api/cluster/config/runtime":
            return _MockHTTPResponse(200, {"status": "ok"})

        return _MockHTTPResponse(404, {"detail": f"Unexpected request: {normalized_method} {url}"})

    monkeypatch.setattr("httpx.request", _fake_http_request)

    app = FastAPI()
    app.include_router(adoption.router)

    with TestClient(app) as client:
        claim_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/claim",
            json={"pairing_code": "123456", "requested_by": "local-node"},
        )
        assert claim_response.status_code == 200

        adopt_response = client.post(
            "/api/adoption/candidates/cand_peer-unmanaged/adopt",
            json={
                "display_name": "Stage Right",
                "role": "AUDIO-NODE",
                "activation_mode": "standby",
            },
        )
        assert adopt_response.status_code == 200

        sources_response = client.get("/api/adoption/nodes/peer-unmanaged/clone/sources")
        assert sources_response.status_code == 200
        source_ids = [item["node_id"] for item in sources_response.json()["items"]]
        assert "source-node" in source_ids

        preview_response = client.get(
            "/api/adoption/nodes/peer-unmanaged/clone/preview",
            params={"source_node_id": "source-node"},
        )
        assert preview_response.status_code == 200
        preview_payload = preview_response.json()
        preview_group_ids = [group["id"] for group in preview_payload["groups"]]
        assert "role_profile" in preview_group_ids
        assert "runtime_profile" in preview_group_ids
        assert "clock_sync" in preview_group_ids
        assert "avb_defaults" in preview_group_ids

        apply_response = client.post(
            "/api/adoption/nodes/peer-unmanaged/clone",
            json={
                "source_node_id": "source-node",
                "group_ids": ["role_profile", "runtime_profile", "clock_sync", "avb_defaults"],
                "requested_by": "local-node",
            },
        )
        assert apply_response.status_code == 200
        apply_payload = apply_response.json()
        assert apply_payload["applied_group_ids"] == ["role_profile", "runtime_profile", "clock_sync", "avb_defaults"]
        assert apply_payload["candidate"]["adoption_state"] == "adopted"

    set_adoption_service(None)

    registry_row = registry.get_node("peer-unmanaged")
    assert registry_row is not None
    metadata = registry_row["metadata"]
    assert metadata["profile_clone"]["source_node_id"] == "source-node"
    assert metadata["profile_clone"]["applied_group_ids"] == ["role_profile", "runtime_profile", "clock_sync", "avb_defaults"]
    assert registry_row["role"] == "AUDIO-NODE"
    assert registry_row["deployment_mode"] == "AUDIO-NODE"
    assert any(url.endswith("/api/runtime-profiles/switch") for _, url, _ in request_log)
    assert any(
        url.endswith("/api/cluster/config/runtime") and payload and payload.get("key") == "avb.interface"
        for _, url, payload in request_log
    )


def test_adoption_store_upsert_replaces_record_without_pre_read(tmp_path):
    db_path = tmp_path / "cluster.db"
    store = AdoptionStore(db_path=db_path)
    first_seen = datetime.now(timezone.utc)
    last_seen = datetime.now(timezone.utc)

    first = AdoptionRecord(
        candidate_id="cand_peer-unmanaged",
        remote_node_id="peer-unmanaged",
        node_id=None,
        hostname="rack-a",
        display_name=None,
        api_url=None,
        addresses=["10.0.0.10"],
        software_version=None,
        capabilities={"avb": True},
        trust_state="unknown",
        adoption_state="candidate",
        activation_state="standby",
        claimed_by_node_id=None,
        remote_fingerprint=None,
        registered=False,
        visible=True,
        readiness=None,
        first_seen=first_seen,
        last_seen=last_seen,
    )
    second = AdoptionRecord(
        candidate_id="cand_peer-unmanaged",
        remote_node_id="peer-unmanaged",
        node_id=None,
        hostname="rack-b",
        display_name=None,
        api_url=None,
        addresses=["10.0.0.20"],
        software_version=None,
        capabilities={"avb": True, "midi_inputs": 2},
        trust_state="unknown",
        adoption_state="candidate",
        activation_state="standby",
        claimed_by_node_id=None,
        remote_fingerprint=None,
        registered=False,
        visible=True,
        readiness=None,
        first_seen=first_seen,
        last_seen=last_seen,
        metadata={"display_name": "Stage Right"},
    )

    store.upsert_record(first)
    store.upsert_record(second)

    record = store.get_record("cand_peer-unmanaged")

    assert record is not None
    assert record.hostname == "rack-b"
    assert record.addresses == ["10.0.0.20"]
    assert record.capabilities["midi_inputs"] == 2
    assert record.metadata["display_name"] == "Stage Right"
