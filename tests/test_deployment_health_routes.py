from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deployment.deployment import DeploymentMode
from app.routes import deployment_health as deployment_health_routes
from app.services.deployment_remediation import RemediationAction


def _status(value: str) -> SimpleNamespace:
    return SimpleNamespace(value=value)


class _FakeHealthChecker:
    def __init__(self) -> None:
        self.checks = [
            SimpleNamespace(
                check_name="network_connectivity",
                status=_status("pass"),
                message="Network reachable",
                remediation="Check cabling",
                command="ping gateway",
            ),
            SimpleNamespace(
                check_name="database_connectivity",
                status=_status("fail"),
                message="Database offline",
                remediation="Restart database",
                command="systemctl restart postgresql",
            ),
            SimpleNamespace(
                check_name="ssh_service",
                status=_status("warn"),
                message="SSH not enabled",
                remediation="Enable sshd",
                command=None,
            ),
        ]
        self.status = {
            "mode": "audio-node",
            "overall_status": "degraded",
            "checks_passed": 1,
            "checks_warned": 1,
            "checks_failed": 1,
            "total_checks": 3,
            "last_checked": "2026-03-26T18:28:00Z",
            "last_check_timestamp": "2026-03-26T18:28:00Z",
        }

    async def run_all_checks(self):
        return list(self.checks)

    async def get_overall_status(self):
        return dict(self.status)


class _FakeRemediationService:
    def __init__(self) -> None:
        self.actions: list[RemediationAction] = []

    async def execute_action(self, action: RemediationAction):
        self.actions.append(action)
        return SimpleNamespace(success=True, message=f"Executed {action.value}", details="ok")


def _build_client(monkeypatch, checker: _FakeHealthChecker | None = None, remediation_service: _FakeRemediationService | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(deployment_health_routes.router)
    monkeypatch.setattr(
        deployment_health_routes,
        "get_deployment_health_checker",
        lambda: checker or _FakeHealthChecker(),
    )
    monkeypatch.setattr(
        deployment_health_routes,
        "get_remediation_service",
        lambda: remediation_service or _FakeRemediationService(),
    )
    return TestClient(app)


def test_health_status_returns_checker_payload(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/deployment/health/status")

    assert response.status_code == 200
    assert response.json() == {
        "mode": "audio-node",
        "overall_status": "degraded",
        "checks_passed": 1,
        "checks_warned": 1,
        "checks_failed": 1,
        "total_checks": 3,
        "last_checked": "2026-03-26T18:28:00Z",
        "last_check_timestamp": "2026-03-26T18:28:00Z",
    }


def test_health_readiness_flags_required_failures(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/deployment/health/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "audio-node"
    assert payload["ready"] is False
    assert [item["name"] for item in payload["items"]] == [
        "network_connectivity",
        "database_connectivity",
        "ssh_service",
    ]
    assert [item["required"] for item in payload["items"]] == [True, True, False]


def test_execute_remediation_runs_service_action(monkeypatch):
    remediation_service = _FakeRemediationService()
    client = _build_client(monkeypatch, remediation_service=remediation_service)
    action = next(iter(RemediationAction)).value

    response = client.post(f"/api/deployment/remediation/{action}")

    assert response.status_code == 200
    assert remediation_service.actions == [RemediationAction(action)]
    assert response.json() == {
        "action": action,
        "success": True,
        "message": f"Executed {action}",
        "details": "ok",
    }


def test_execute_remediation_rejects_unknown_action(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.post("/api/deployment/remediation/not-a-real-action")

    assert response.status_code == 400
    assert "Invalid action" in response.json()["detail"]


def test_readiness_checklist_uses_mode_specific_template(monkeypatch):
    client = _build_client(monkeypatch)
    config = SimpleNamespace(mode=DeploymentMode.AUDIO_NODE)
    monkeypatch.setattr("app.deployment.deployment.get_deployment_config", lambda: config)

    response = client.get("/api/deployment/readiness-checklist")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "AUDIO-NODE"
    assert payload["description"] == "Audio processing node"
    assert any(item["requirement"] == "Audio hardware" and item["critical"] is True for item in payload["items"])
