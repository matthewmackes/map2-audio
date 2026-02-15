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


def _deployment_single_standby() -> FlowDeploymentInfo:
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
    return FlowDeploymentInfo(
        flow_id="flow-1",
        chain_id=7,
        primary_assignment=primary,
        standby_assignments=[standby_b],
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

    async def fake_replenish(*_args, **_kwargs):
        return None

    monkeypatch.setattr(orchestrator, "_promote_standby_node", fake_promote_node)
    monkeypatch.setattr(orchestrator, "activate_flow_on_node", fake_activate)
    monkeypatch.setattr(orchestrator, "_ensure_minimum_standby_redundancy", fake_replenish)
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


def test_promote_standby_replenishes_to_previous_redundancy_level(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment()
    orchestrator.active_deployments["flow-1"] = deployment

    class DummyRegistry:
        def get_all_nodes(self):
            return [
                {"id": "node-a", "status": "online", "cpu_load": 1.0},
                {"id": "node-b", "status": "online", "cpu_load": 2.0},
                {"id": "node-c", "status": "online", "cpu_load": 4.0},
                {"id": "node-d", "status": "online", "cpu_load": 6.0},
            ]

        def get_node(self, node_id):
            return {"id": node_id}

    orchestrator.registry = DummyRegistry()

    async def fake_promote_node(_node_id, _flow_id):
        return True

    async def fake_load_chain(_chain_id):
        return {"id": 7, "name": "Test", "plugins": []}

    standby_deploys = []

    async def fake_deploy_to_node(node_id, _chain, mode):
        if mode == "standby":
            standby_deploys.append(node_id)
        return True

    async def fake_persist(*_args, **_kwargs):
        return None

    async def fake_save(_info):
        return None

    monkeypatch.setattr(orchestrator, "_promote_standby_node", fake_promote_node)
    monkeypatch.setattr(orchestrator, "_load_chain_for_deployment", fake_load_chain)
    monkeypatch.setattr(orchestrator, "_deploy_to_node", fake_deploy_to_node)
    monkeypatch.setattr(orchestrator, "_persist_assignments", fake_persist)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save)

    ok = asyncio.run(orchestrator.promote_standby_to_primary("flow-1", "node-b"))

    assert ok is True
    assert deployment.primary_assignment.assigned_node_id == "node-b"
    assert [s.assigned_node_id for s in deployment.standby_assignments] == ["node-c", "node-d"]
    assert standby_deploys == ["node-d"]
    assert deployment.error_message is None


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


def test_promote_standby_replenishes_single_standby_from_eligible_nodes(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment_single_standby()
    orchestrator.active_deployments["flow-1"] = deployment

    class DummyRegistry:
        def get_all_nodes(self):
            return [
                {"id": "node-a", "status": "online", "cpu_load": 1.0},
                {"id": "node-b", "status": "online", "cpu_load": 2.0},
                {"id": "node-c", "status": "online", "cpu_load": 5.0},
                {"id": "node-d", "status": "online", "cpu_load": 9.0},
            ]

        def get_node(self, node_id):
            return {"id": node_id}

    orchestrator.registry = DummyRegistry()

    async def fake_promote_node(_node_id, _flow_id):
        return True

    async def fake_load_chain(_chain_id):
        return {"id": 7, "name": "Test", "plugins": []}

    standby_deploys = []

    async def fake_deploy_to_node(node_id, _chain, mode):
        if mode == "standby":
            standby_deploys.append(node_id)
        return True

    async def fake_persist(*_args, **_kwargs):
        return None

    async def fake_save(_info):
        return None

    monkeypatch.setattr(orchestrator, "_promote_standby_node", fake_promote_node)
    monkeypatch.setattr(orchestrator, "_load_chain_for_deployment", fake_load_chain)
    monkeypatch.setattr(orchestrator, "_deploy_to_node", fake_deploy_to_node)
    monkeypatch.setattr(orchestrator, "_persist_assignments", fake_persist)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save)

    ok = asyncio.run(orchestrator.promote_standby_to_primary("flow-1", "node-b"))

    assert ok is True
    assert deployment.primary_assignment.assigned_node_id == "node-b"
    assert [s.assigned_node_id for s in deployment.standby_assignments] == ["node-c"]
    assert standby_deploys == ["node-c"]
    assert deployment.error_message is None


def test_promote_standby_reports_degraded_when_no_eligible_replenishment_node(monkeypatch):
    orchestrator = FlowOrchestrator()
    deployment = _deployment_single_standby()
    orchestrator.active_deployments["flow-1"] = deployment

    class DummyRegistry:
        def get_all_nodes(self):
            return [
                {"id": "node-a", "status": "offline", "cpu_load": 1.0},
                {"id": "node-b", "status": "online", "cpu_load": 2.0},
            ]

        def get_node(self, node_id):
            return {"id": node_id}

    orchestrator.registry = DummyRegistry()

    async def fake_promote_node(_node_id, _flow_id):
        return True

    async def fake_load_chain(_chain_id):
        return {"id": 7, "name": "Test", "plugins": []}

    async def fake_persist(*_args, **_kwargs):
        return None

    async def fake_save(_info):
        return None

    monkeypatch.setattr(orchestrator, "_promote_standby_node", fake_promote_node)
    monkeypatch.setattr(orchestrator, "_load_chain_for_deployment", fake_load_chain)
    monkeypatch.setattr(orchestrator, "_persist_assignments", fake_persist)
    monkeypatch.setattr(orchestrator, "save_deployment", fake_save)

    ok = asyncio.run(orchestrator.promote_standby_to_primary("flow-1", "node-b"))

    assert ok is True
    assert deployment.primary_assignment.assigned_node_id == "node-b"
    assert deployment.standby_assignments == []
    assert "replenishment incomplete" in (deployment.error_message or "").lower()
