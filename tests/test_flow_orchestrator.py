"""
Tests for FlowOrchestrator core assignment logic (Checkpoint 1.2)
"""

import pytest
from app.services.flow_orchestrator import FlowOrchestrator


@pytest.mark.asyncio
async def test_assign_flow_to_node_with_registry(monkeypatch):
    """FlowOrchestrator should validate registry and persist assignment."""
    orchestrator = FlowOrchestrator.initialize()

    class DummyRegistry:
        def get_node(self, node_id):
            return {"id": node_id}

        def get_all_nodes(self):
            return [{"id": "node-a"}, {"id": "node-b"}]

    orchestrator.registry = DummyRegistry()

    deployment = await orchestrator.assign_flow_to_node(
        flow_id="flow-0",
        chain_id=1,
        node_id="node-a",
        redundancy_enabled=True,
        strategy="manual",
    )

    assert deployment is not None
    assert deployment.primary_assignment.assigned_node_id == "node-a"
    assert len(deployment.standby_assignments) >= 1


@pytest.mark.asyncio
async def test_assign_flow_rejects_unknown_node():
    """Should return None when node is missing from registry."""
    orchestrator = FlowOrchestrator.initialize()

    class EmptyRegistry:
        def get_node(self, node_id):
            return None

        def get_all_nodes(self):
            return []

    orchestrator.registry = EmptyRegistry()

    deployment = await orchestrator.assign_flow_to_node(
        flow_id="flow-1",
        chain_id=2,
        node_id="missing-node",
        redundancy_enabled=False,
        strategy="manual",
    )

    assert deployment is None
