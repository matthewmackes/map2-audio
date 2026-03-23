from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import bootstrap
from app.services.cluster.adoption_bootstrap import (
    AdoptionBootstrapService,
    set_adoption_bootstrap_service,
)


def test_bootstrap_status_hides_pairing_code_unless_explicitly_requested():
    service = AdoptionBootstrapService()
    set_adoption_bootstrap_service(service)

    app = FastAPI()
    app.include_router(bootstrap.router)

    with TestClient(app) as client:
        response = client.get("/api/bootstrap/status")

    set_adoption_bootstrap_service(None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["pairing_required"] is True
    assert payload["pairing_code"] is None
    assert payload["pairing_code_hint"].startswith("••")


def test_bootstrap_status_can_return_pairing_code_for_local_client():
    service = AdoptionBootstrapService()
    set_adoption_bootstrap_service(service)

    app = FastAPI()
    app.include_router(bootstrap.router)

    with TestClient(app) as client:
        response = client.get("/api/bootstrap/status?include_pairing_code=true")

    set_adoption_bootstrap_service(None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["pairing_code"] == service.peek_pairing_code()


def test_bootstrap_claim_and_finalize_require_live_pairing_code():
    service = AdoptionBootstrapService()
    set_adoption_bootstrap_service(service)
    pairing_code = service.peek_pairing_code()

    app = FastAPI()
    app.include_router(bootstrap.router)

    with TestClient(app) as client:
        bad_claim = client.post(
            "/api/bootstrap/claim",
            json={"pairing_code": "000000", "requester_node_id": "local-node"},
        )
        assert bad_claim.status_code == 400

        claim = client.post(
            "/api/bootstrap/claim",
            json={"pairing_code": pairing_code, "requester_node_id": "local-node"},
        )
        assert claim.status_code == 200
        claim_payload = claim.json()
        assert claim_payload["claim_token"]

        finalize = client.post(
            "/api/bootstrap/finalize",
            json={
                "claim_token": claim_payload["claim_token"],
                "requester_node_id": "local-node",
                "adopted_node_id": "peer-unmanaged",
            },
        )
        assert finalize.status_code == 200
        assert finalize.json()["status"] == "ok"

        second_finalize = client.post(
            "/api/bootstrap/finalize",
            json={
                "claim_token": claim_payload["claim_token"],
                "requester_node_id": "local-node",
                "adopted_node_id": "peer-unmanaged",
            },
        )
        assert second_finalize.status_code == 400

    set_adoption_bootstrap_service(None)


def test_bootstrap_issue_and_verify_signed_token_round_trip(tmp_path):
    service = AdoptionBootstrapService(secret_path=tmp_path / "bootstrap-secret")
    set_adoption_bootstrap_service(service)

    app = FastAPI()
    app.include_router(bootstrap.router)

    with TestClient(app) as client:
        issue = client.post(
            "/api/bootstrap/tokens/issue",
            json={
                "issuer_api_url": "http://controller.local:8080",
                "target_node_id": "remote-node-1",
                "target_hostname": "MAP2-STAGE-R",
            },
        )
        assert issue.status_code == 200
        issue_payload = issue.json()
        assert issue_payload["bootstrap_token"]

        verify = client.post(
            "/api/bootstrap/tokens/verify",
            json={
                "bootstrap_token": issue_payload["bootstrap_token"],
                "requester_node_id": "remote-node-1",
                "remote_node_id": "remote-node-1",
                "remote_hostname": "MAP2-STAGE-R",
            },
        )
        assert verify.status_code == 200
        verify_payload = verify.json()
        assert verify_payload["scope"] == "map2-bootstrap-token-v1"
        assert verify_payload["issuer_api_url"] == "http://controller.local:8080"
        assert verify_payload["target_node_id"] == "remote-node-1"
        assert verify_payload["requester_node_id"] == "remote-node-1"

    set_adoption_bootstrap_service(None)


def test_bootstrap_claim_accepts_verified_signed_token(tmp_path, monkeypatch):
    service = AdoptionBootstrapService(secret_path=tmp_path / "bootstrap-secret")
    set_adoption_bootstrap_service(service)
    monkeypatch.setattr(
        service,
        "_verify_bootstrap_token_via_issuer",
        lambda *, bootstrap_token, requester_node_id: {
            "scope": "map2-bootstrap-token-v1",
            "issuer_node_id": "controller-node-1",
            "issuer_api_url": "http://controller.local:8080",
            "issued_at": "2026-03-23T11:00:00+00:00",
            "expires_at": "2026-03-23T11:15:00+00:00",
            "token_id": "tok_123",
            "target_node_id": "remote-node-1",
            "target_hostname": "MAP2-STAGE-R",
            "requester_node_id": requester_node_id,
        },
    )

    app = FastAPI()
    app.include_router(bootstrap.router)

    with TestClient(app) as client:
        claim = client.post(
            "/api/bootstrap/claim",
            json={"bootstrap_token": "signed-bootstrap-token", "requester_node_id": "remote-node-1"},
        )
        assert claim.status_code == 200
        claim_payload = claim.json()
        assert claim_payload["claim_token"]

        finalize = client.post(
            "/api/bootstrap/finalize",
            json={
                "claim_token": claim_payload["claim_token"],
                "requester_node_id": "remote-node-1",
                "adopted_node_id": "remote-node-1",
            },
        )
        assert finalize.status_code == 200
        assert finalize.json()["status"] == "ok"

    set_adoption_bootstrap_service(None)
