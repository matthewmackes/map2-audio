import asyncio

from app.services.flow_orchestrator import (
    FlowAssignmentInfo,
    FlowDeploymentInfo,
    FlowOrchestrator,
)


def _deployment() -> FlowDeploymentInfo:
    primary = FlowAssignmentInfo(
        flow_id="flow-1",
        chain_id=7,
        assigned_node_id="node-a",
        assignment_type="primary",
        reason="initial",
    )
    standby_b = FlowAssignmentInfo(
        flow_id="flow-1",
        chain_id=7,
        assigned_node_id="node-b",
        assignment_type="standby",
        reason="redundancy",
    )
    standby_c = FlowAssignmentInfo(
        flow_id="flow-1",
        chain_id=7,
        assigned_node_id="node-c",
        assignment_type="standby",
        reason="redundancy",
    )
    return FlowDeploymentInfo(
        flow_id="flow-1",
        chain_id=7,
        primary_assignment=primary,
        standby_assignments=[standby_b, standby_c],
        is_deployed=True,
        deployment_timestamp=0.0,
    )


def test_promote_standby_to_primary_does_not_commit_when_remote_activation_fails(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment()
    orchestrator.active_deployments["flow-1"] = deployment

    async def fake_promote_node(_node_id, _flow_id):
        return False

    async def fake_activate(_flow_id, _node_id):
        return False

    persist_calls = []
    save_calls = []

    async def fake_persist(*args, **kwargs):
        persist_calls.append((args, kwargs))

    async def fake_save(info):
        save_calls.append(info)

    monkeypatch.setattr(orchestrator, "_promote_standby_node", fake_promote_node)
    monkeypatch.setattr(orchestrator, "activate_flow_on_node", fake_activate)
    monkeypatch.setattr(orchestrator, "_persist_assignments", fake_persist)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save)

    ok = asyncio.run(orchestrator.promote_standby_to_primary("flow-1", "node-b"))

    assert ok is False
    assert deployment.primary_assignment.assigned_node_id == "node-a"
    assert [s.assigned_node_id for s in deployment.standby_assignments] == ["node-b", "node-c"]
    assert "Failed to activate promoted standby node" in (deployment.error_message or "")
    assert persist_calls == []
    assert save_calls == []


def test_promote_standby_to_primary_falls_back_to_activate_endpoint(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment()
    orchestrator.active_deployments["flow-1"] = deployment

    async def fake_promote_node(_node_id, _flow_id):
        return False

    async def fake_activate(_flow_id, _node_id):
        return True

    persist_calls = []
    save_calls = []

    async def fake_persist(*args, **kwargs):
        persist_calls.append((args, kwargs))

    async def fake_save(info):
        save_calls.append(info)

    monkeypatch.setattr(orchestrator, "_promote_standby_node", fake_promote_node)
    monkeypatch.setattr(orchestrator, "activate_flow_on_node", fake_activate)
    monkeypatch.setattr(orchestrator, "_persist_assignments", fake_persist)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save)

    ok = asyncio.run(orchestrator.promote_standby_to_primary("flow-1", "node-b"))

    assert ok is True
    assert deployment.primary_assignment.assigned_node_id == "node-b"
    assert deployment.primary_assignment.assignment_type == "primary"
    assert [s.assigned_node_id for s in deployment.standby_assignments] == ["node-c"]
    assert deployment.last_failover_timestamp is not None
    assert deployment.error_message is None
    assert len(persist_calls) == 1
    assert len(save_calls) == 1


def test_failover_flow_delegates_to_promote_first_standby(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment()
    orchestrator.active_deployments["flow-1"] = deployment

    calls = []

    async def fake_promote(flow_id, standby_node_id):
        calls.append((flow_id, standby_node_id))
        return True

    monkeypatch.setattr(orchestrator, "promote_standby_to_primary", fake_promote)

    ok = asyncio.run(orchestrator.failover_flow("flow-1"))

    assert ok is True
    assert calls == [("flow-1", "node-b")]
