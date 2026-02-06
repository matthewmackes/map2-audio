"""
Tests for flow deployment logic (Checkpoint 1.4)
"""

import pytest
from app.services.flow_orchestrator import FlowOrchestrator


@pytest.mark.asyncio
async def test_deploy_flow_handles_missing_node(monkeypatch):
    orchestrator = FlowOrchestrator.initialize()

    class EmptyRegistry:
        def get_node(self, node_id):
            return None

    orchestrator.registry = EmptyRegistry()

    deployment = await orchestrator.assign_flow_to_node(
        flow_id="flow-x",
        chain_id=1,
        node_id="missing-node",
        redundancy_enabled=False,
        strategy="manual",
    )

    assert deployment is None
