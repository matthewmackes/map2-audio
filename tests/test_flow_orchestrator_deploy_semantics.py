import asyncio

from app.services.flow_orchestrator import (
    FlowAssignmentInfo,
    FlowDeploymentInfo,
    FlowOrchestrator,
)


def _deployment_with_standby() -> FlowDeploymentInfo:
    primary = FlowAssignmentInfo(
        flow_id="flow-1",
        chain_id=7,
        assigned_node_id="node-primary",
        assignment_type="primary",
        reason="test",
    )
    standby = FlowAssignmentInfo(
        flow_id="flow-1",
        chain_id=7,
        assigned_node_id="node-standby",
        assignment_type="standby",
        reason="test",
    )
    return FlowDeploymentInfo(
        flow_id="flow-1",
        chain_id=7,
        primary_assignment=primary,
        standby_assignments=[standby],
        is_deployed=False,
        deployment_timestamp=0.0,
    )


def test_is_successful_deploy_response_active_rejects_explicit_non_activation():
    body = {"status": "deployed", "applied": True, "activated": False}
    assert FlowOrchestrator._is_successful_deploy_response("active", body) is False


def test_is_successful_deploy_response_standby_rejects_activation():
    body = {"status": "deployed", "applied": True, "activated": True}
    assert FlowOrchestrator._is_successful_deploy_response("standby", body) is False


def test_is_successful_deploy_response_standby_accepts_staged():
    body = {"status": "staged", "applied": True, "activated": False}
    assert FlowOrchestrator._is_successful_deploy_response("standby", body) is True


def test_deploy_flow_marks_primary_failure_and_persists(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment_with_standby()

    async def fake_deploy_to_node(node_id, chain, mode):
        assert node_id == "node-primary"
        assert mode == "active"
        return False

    saved = []

    async def fake_save_deployment(info):
        saved.append(info)

    monkeypatch.setattr(orchestrator, "_deploy_to_node", fake_deploy_to_node)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save_deployment)

    ok = asyncio.run(orchestrator.deploy_flow(deployment, {"id": 7, "name": "Test", "plugins": []}))

    assert ok is False
    assert deployment.is_deployed is False
    assert "Primary deployment failed" in (deployment.error_message or "")
    assert len(saved) == 1
    assert saved[0].error_message == deployment.error_message


def test_deploy_flow_records_standby_failures_but_keeps_primary_active(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment_with_standby()

    async def fake_deploy_to_node(node_id, chain, mode):
        if node_id == "node-primary" and mode == "active":
            return True
        if node_id == "node-standby" and mode == "standby":
            return False
        return False

    saved = []

    async def fake_save_deployment(info):
        saved.append(info)

    monkeypatch.setattr(orchestrator, "_deploy_to_node", fake_deploy_to_node)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save_deployment)

    ok = asyncio.run(orchestrator.deploy_flow(deployment, {"id": 7, "name": "Test", "plugins": []}))

    assert ok is True
    assert deployment.is_deployed is True
    assert "Standby deployment failed" in (deployment.error_message or "")
    assert len(saved) == 1
    assert saved[0].error_message == deployment.error_message
