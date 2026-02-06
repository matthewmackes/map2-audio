"""
Flow Orchestrator Service

Manages flow-to-node assignments for multi-node Grid Flow execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
import logging
import time
from datetime import datetime
import asyncio

import aiohttp

from sqlalchemy import select

from app.database import FlowAssignment, FlowDeployment
from app.database_session import get_session
from app.services.cluster.registry import get_cluster_registry

logger = logging.getLogger(__name__)


@dataclass
class FlowAssignmentInfo:
    """In-memory representation of a flow assignment."""
    flow_id: str
    chain_id: int
    assigned_node_id: str
    assignment_type: str  # primary | standby
    reason: str


@dataclass
class FlowDeploymentInfo:
    """In-memory representation of flow deployment state."""
    flow_id: str
    chain_id: int
    primary_assignment: FlowAssignmentInfo
    standby_assignments: List[FlowAssignmentInfo]
    is_deployed: bool
    deployment_timestamp: float


class FlowOrchestrator:
    """Manages flow assignments and deployment state across cluster nodes."""

    _instance: Optional["FlowOrchestrator"] = None

    def __init__(self) -> None:
        self.active_deployments: Dict[str, FlowDeploymentInfo] = {}
        self.node_flow_map: Dict[str, List[str]] = {}
        self.registry = get_cluster_registry()

    @classmethod
    def initialize(cls) -> "FlowOrchestrator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def get_instance(cls) -> "FlowOrchestrator":
        if cls._instance is None:
            raise RuntimeError("FlowOrchestrator not initialized")
        return cls._instance

    async def assign_flow_to_node(
        self,
        flow_id: str,
        chain_id: int,
        node_id: str,
        redundancy_enabled: bool = False,
        strategy: str = "manual",
    ) -> Optional[FlowDeploymentInfo]:
        """Assign a flow to a node and optionally create standby assignments."""
        node = self.registry.get_node(node_id)
        if not node:
            logger.warning(f"Node {node_id} not found in registry")
            return None

        primary = FlowAssignmentInfo(
            flow_id=flow_id,
            chain_id=chain_id,
            assigned_node_id=node_id,
            assignment_type="primary",
            reason=f"{strategy} assignment",
        )

        standby_assignments: List[FlowAssignmentInfo] = []
        if redundancy_enabled:
            all_nodes = self.registry.get_all_nodes()
            standby_nodes = [n for n in all_nodes if n.get("id") != node_id][:2]
            for standby in standby_nodes:
                standby_assignments.append(
                    FlowAssignmentInfo(
                        flow_id=flow_id,
                        chain_id=chain_id,
                        assigned_node_id=standby.get("id"),
                        assignment_type="standby",
                        reason="Redundancy standby",
                    )
                )

        deployment = FlowDeploymentInfo(
            flow_id=flow_id,
            chain_id=chain_id,
            primary_assignment=primary,
            standby_assignments=standby_assignments,
            is_deployed=False,
            deployment_timestamp=time.time(),
        )

        await self._persist_assignments(primary, standby_assignments, strategy)
        return deployment

    async def _persist_assignments(
        self,
        primary: FlowAssignmentInfo,
        standby: List[FlowAssignmentInfo],
        strategy: str,
    ) -> None:
        async with get_session() as session:
            session.add(
                FlowAssignment(
                    flow_id=primary.flow_id,
                    chain_id=primary.chain_id,
                    assigned_node_id=primary.assigned_node_id,
                    assignment_type=primary.assignment_type,
                    assignment_strategy=strategy,
                )
            )
            for standby_assignment in standby:
                session.add(
                    FlowAssignment(
                        flow_id=standby_assignment.flow_id,
                        chain_id=standby_assignment.chain_id,
                        assigned_node_id=standby_assignment.assigned_node_id,
                        assignment_type=standby_assignment.assignment_type,
                        assignment_strategy="redundancy",
                    )
                )

    async def save_deployment(self, deployment: FlowDeploymentInfo) -> None:
        async with get_session() as session:
            session.add(
                FlowDeployment(
                    flow_id=deployment.flow_id,
                    primary_node_id=deployment.primary_assignment.assigned_node_id,
                    standby_node_ids=[
                        s.assigned_node_id for s in deployment.standby_assignments
                    ],
                    deployment_status="active" if deployment.is_deployed else "deploying",
                    deployment_timestamp=datetime.utcnow(),
                )
            )

    async def get_assignments(self) -> List[FlowAssignment]:
        async with get_session() as session:
            result = await session.execute(select(FlowAssignment))
            return list(result.scalars().all())

    async def deploy_flow(self, deployment: FlowDeploymentInfo, chain: Dict) -> bool:
        """Deploy a chain to assigned nodes via HTTP API."""
        try:
            primary_ok = await self._deploy_to_node(
                node_id=deployment.primary_assignment.assigned_node_id,
                chain=chain,
                mode="active",
            )
            if not primary_ok:
                return False

            for standby in deployment.standby_assignments:
                await self._deploy_to_node(
                    node_id=standby.assigned_node_id,
                    chain=chain,
                    mode="standby",
                )

            deployment.is_deployed = True
            self.active_deployments[deployment.flow_id] = deployment
            await self.save_deployment(deployment)
            return True
        except Exception as e:
            logger.error(f"Failed to deploy flow {deployment.flow_id}: {e}")
            return False

    async def _deploy_to_node(self, node_id: str, chain: Dict, mode: str) -> bool:
        """Send chain configuration to node via HTTP."""
        node = self.registry.get_node(node_id)
        if not node:
            return False

        hostname = node.get("hostname") or node.get("ip_address") or node_id
        url = f"http://{hostname}:8080/api/chains/deploy"
        payload = {
            "chain_id": chain.get("id"),
            "chain_name": chain.get("name"),
            "plugins": chain.get("plugins", []),
            "mode": mode,
            "activate": mode == "active",
        }

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    url, json=payload, timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    return resp.status == 200
            except asyncio.TimeoutError:
                logger.error(f"Timeout deploying to node {node_id}")
                return False
            except Exception as e:
                logger.error(f"Failed to deploy to node {node_id}: {e}")
                return False

    async def failover_flow(self, flow_id: str) -> bool:
        """Promote standby to primary for given flow."""
        deployment = self.active_deployments.get(flow_id)
        if not deployment or not deployment.standby_assignments:
            return False

        standby = deployment.standby_assignments[0]
        success = await self._promote_standby_node(standby.assigned_node_id, flow_id)
        if not success:
            return False

        deployment.primary_assignment = standby
        deployment.standby_assignments = deployment.standby_assignments[1:]
        deployment.is_deployed = True
        await self.save_deployment(deployment)
        return True

    async def _promote_standby_node(self, node_id: str, flow_id: str) -> bool:
        """Request standby node to promote flow to active."""
        node = self.registry.get_node(node_id)
        if not node:
            return False

        hostname = node.get("hostname") or node.get("ip_address") or node_id
        url = f"http://{hostname}:8080/api/flows/promote-standby"
        payload = {"flow_id": flow_id}

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    url, json=payload, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    return resp.status == 200
            except Exception as e:
                logger.error(f"Failed to promote standby on {node_id}: {e}")
                return False
