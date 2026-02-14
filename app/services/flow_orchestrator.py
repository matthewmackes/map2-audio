"""
Flow Orchestrator Service

Manages flow-to-node assignments for multi-node Grid Flow execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import logging
import time
from datetime import datetime
import asyncio

import aiohttp

from sqlalchemy import select, delete

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
    error_message: Optional[str] = None


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
            # flow_assignments currently stores one row per flow_id (unique constraint).
            # Replace existing assignment atomically when reassigned.
            await session.execute(
                delete(FlowAssignment).where(FlowAssignment.flow_id == primary.flow_id)
            )

            session.add(
                FlowAssignment(
                    flow_id=primary.flow_id,
                    chain_id=primary.chain_id,
                    assigned_node_id=primary.assigned_node_id,
                    assignment_type=primary.assignment_type,
                    assignment_strategy=strategy,
                )
            )
            if standby:
                logger.debug(
                    "Standby assignments for flow %s are tracked in deployment metadata",
                    primary.flow_id,
                )

    async def save_deployment(self, deployment: FlowDeploymentInfo) -> None:
        async with get_session() as session:
            status = "active" if deployment.is_deployed else "failed"
            # Keep one latest deployment row per flow_id.
            await session.execute(
                delete(FlowDeployment).where(FlowDeployment.flow_id == deployment.flow_id)
            )
            session.add(
                FlowDeployment(
                    flow_id=deployment.flow_id,
                    primary_node_id=deployment.primary_assignment.assigned_node_id,
                    standby_node_ids=[
                        s.assigned_node_id for s in deployment.standby_assignments
                    ],
                    deployment_status=status,
                    deployment_timestamp=datetime.utcnow(),
                    error_message=deployment.error_message,
                )
            )

    async def get_assignments(self) -> List[FlowAssignment]:
        async with get_session() as session:
            result = await session.execute(select(FlowAssignment))
            return list(result.scalars().all())

    async def _get_chain_id_for_flow(self, flow_id: str) -> Optional[int]:
        """Resolve chain_id for a flow from memory, then persisted assignment."""
        deployment = self.active_deployments.get(flow_id)
        if deployment:
            return deployment.chain_id

        async with get_session() as session:
            result = await session.execute(
                select(FlowAssignment).where(FlowAssignment.flow_id == flow_id)
            )
            assignment = result.scalar_one_or_none()
            return assignment.chain_id if assignment else None

    async def _load_deployment_from_db(self, flow_id: str) -> Optional[FlowDeploymentInfo]:
        """Load deployment state from database when cache is empty."""
        chain_id = await self._get_chain_id_for_flow(flow_id)
        if chain_id is None:
            return None

        async with get_session() as session:
            result = await session.execute(
                select(FlowDeployment)
                .where(FlowDeployment.flow_id == flow_id)
                .order_by(FlowDeployment.deployment_timestamp.desc())
            )
            row = result.scalars().first()

        if row is None:
            return None

        standby_ids = row.standby_node_ids if isinstance(row.standby_node_ids, list) else []
        deployment = FlowDeploymentInfo(
            flow_id=flow_id,
            chain_id=chain_id,
            primary_assignment=FlowAssignmentInfo(
                flow_id=flow_id,
                chain_id=chain_id,
                assigned_node_id=row.primary_node_id,
                assignment_type="primary",
                reason="rehydrated_from_db",
            ),
            standby_assignments=[
                FlowAssignmentInfo(
                    flow_id=flow_id,
                    chain_id=chain_id,
                    assigned_node_id=standby_id,
                    assignment_type="standby",
                    reason="rehydrated_from_db",
                )
                for standby_id in standby_ids
                if isinstance(standby_id, str) and standby_id and standby_id != row.primary_node_id
            ],
            is_deployed=row.deployment_status == "active",
            deployment_timestamp=(
                row.deployment_timestamp.timestamp()
                if row.deployment_timestamp
                else time.time()
            ),
            error_message=row.error_message,
        )

        self.active_deployments[flow_id] = deployment
        return deployment

    async def deploy_flow(self, deployment: FlowDeploymentInfo, chain: Dict) -> bool:
        """Deploy a chain to assigned nodes via HTTP API."""
        try:
            primary_ok = await self._deploy_to_node(
                node_id=deployment.primary_assignment.assigned_node_id,
                chain=chain,
                mode="active",
            )
            if not primary_ok:
                deployment.is_deployed = False
                deployment.error_message = (
                    f"Primary deployment failed on node {deployment.primary_assignment.assigned_node_id}"
                )
                self.active_deployments[deployment.flow_id] = deployment
                await self.save_deployment(deployment)
                return False

            standby_failures: List[str] = []
            for standby in deployment.standby_assignments:
                standby_ok = await self._deploy_to_node(
                    node_id=standby.assigned_node_id,
                    chain=chain,
                    mode="standby",
                )
                if not standby_ok:
                    standby_failures.append(standby.assigned_node_id)

            deployment.is_deployed = True
            if standby_failures:
                deployment.error_message = (
                    "Standby deployment failed on nodes: " + ", ".join(sorted(standby_failures))
                )
                logger.warning(
                    "Flow %s deployed on primary node, but standby deployment failed for nodes: %s",
                    deployment.flow_id,
                    ", ".join(sorted(standby_failures)),
                )
            else:
                deployment.error_message = None
            self.active_deployments[deployment.flow_id] = deployment
            await self.save_deployment(deployment)
            return True
        except Exception as e:
            logger.error(f"Failed to deploy flow {deployment.flow_id}: {e}")
            deployment.is_deployed = False
            deployment.error_message = str(e)
            self.active_deployments[deployment.flow_id] = deployment
            await self.save_deployment(deployment)
            return False

    @staticmethod
    def _is_successful_deploy_response(mode: str, body: Dict[str, Any]) -> bool:
        """Evaluate /api/chains/deploy response with mode-aware semantics."""
        status = str(body.get("status", "")).lower()
        applied = bool(body.get("applied", False))
        activated = body.get("activated")

        if mode == "active":
            # Active deploy must not explicitly report non-activation.
            if activated is False:
                return False
            return applied or status in {"deployed", "activated", "applied", "success"}

        if mode == "standby":
            # Standby deploy should stage only; explicit activation is a mismatch.
            if activated is True:
                return False
            return applied or status in {"staged", "deployed", "applied", "success"}

        return applied or status in {"staged", "deployed", "activated", "applied", "success"}

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
                    if resp.status != 200:
                        logger.error(f"Deploy request to node {node_id} failed with status {resp.status}")
                        return False

                    try:
                        body = await resp.json(content_type=None)
                    except Exception:
                        logger.error(f"Deploy response from node {node_id} is not valid JSON")
                        return False

                    if self._is_successful_deploy_response(mode, body):
                        return True

                    logger.error(
                        "Node %s returned deploy response that does not satisfy %s semantics "
                        "(status=%s, applied=%s, activated=%s, message=%s)",
                        node_id,
                        mode,
                        str(body.get("status", "")).lower() or "unknown",
                        bool(body.get("applied", False)),
                        body.get("activated"),
                        body.get("message", ""),
                    )
                    return False
            except asyncio.TimeoutError:
                logger.error(f"Timeout deploying to node {node_id}")
                return False
            except Exception as e:
                logger.error(f"Failed to deploy to node {node_id}: {e}")
                return False

    async def failover_flow(self, flow_id: str) -> bool:
        """Promote standby to primary for given flow."""
        deployment = self.active_deployments.get(flow_id)
        if not deployment:
            deployment = await self._load_deployment_from_db(flow_id)
        if not deployment or not deployment.standby_assignments:
            return False

        standby = deployment.standby_assignments[0]
        success = await self._promote_standby_node(standby.assigned_node_id, flow_id)
        if not success:
            return False

        deployment.primary_assignment = standby
        deployment.standby_assignments = deployment.standby_assignments[1:]
        deployment.is_deployed = True
        await self._persist_assignments(
            deployment.primary_assignment,
            deployment.standby_assignments,
            strategy="failover",
        )
        await self.save_deployment(deployment)
        return True

    async def get_flows_on_node(self, node_id: str) -> List[Dict]:
        """Get all flows assigned to a specific node."""
        flows = []
        seen_flow_ids = set()
        for flow_id, deployment in self.active_deployments.items():
            if deployment.primary_assignment.assigned_node_id == node_id:
                flows.append({
                    'id': flow_id,
                    'chain_id': deployment.chain_id,
                    'primary_node_id': deployment.primary_assignment.assigned_node_id,
                    'standby_node_id': deployment.standby_assignments[0].assigned_node_id if deployment.standby_assignments else None,
                    'is_deployed': deployment.is_deployed
                })
                seen_flow_ids.add(flow_id)

        async with get_session() as session:
            result = await session.execute(
                select(FlowDeployment)
                .where(FlowDeployment.primary_node_id == node_id)
                .order_by(FlowDeployment.deployment_timestamp.desc())
            )
            rows = result.scalars().all()

        for row in rows:
            flow_id = row.flow_id
            if flow_id in seen_flow_ids:
                continue

            chain_id = await self._get_chain_id_for_flow(flow_id)
            standby_ids = row.standby_node_ids if isinstance(row.standby_node_ids, list) else []
            flows.append({
                'id': flow_id,
                'chain_id': chain_id,
                'primary_node_id': row.primary_node_id,
                'standby_node_id': standby_ids[0] if standby_ids else None,
                'is_deployed': row.deployment_status == "active",
            })
            seen_flow_ids.add(flow_id)

        return flows
    
    async def promote_standby_to_primary(self, flow_id: str, standby_node_id: str) -> bool:
        """Promote a standby assignment to primary."""
        deployment = self.active_deployments.get(flow_id)
        if not deployment:
            deployment = await self._load_deployment_from_db(flow_id)
        if not deployment:
            return False
        
        # Find the standby assignment
        standby = None
        for s in deployment.standby_assignments:
            if s.assigned_node_id == standby_node_id:
                standby = s
                deployment.standby_assignments.remove(s)
                break
        
        if not standby:
            return False
        
        # Update deployment
        deployment.primary_assignment = standby
        deployment.is_deployed = True
        await self._persist_assignments(
            deployment.primary_assignment,
            deployment.standby_assignments,
            strategy="failover",
        )
        await self.save_deployment(deployment)
        return True
    
    async def activate_flow_on_node(self, flow_id: str, node_id: str) -> bool:
        """Send activation command to node to activate a flow."""
        node = self.registry.get_node(node_id)
        if not node:
            return False

        chain_id = await self._get_chain_id_for_flow(flow_id)

        hostname = node.get("hostname") or node.get("ip_address") or node_id
        url = f"http://{hostname}:8080/api/flows/{flow_id}/activate"

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    url,
                    json={"chain_id": chain_id} if chain_id is not None else {},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status != 200:
                        logger.error(
                            "Activate flow request failed (flow=%s node=%s status=%s)",
                            flow_id,
                            node_id,
                            resp.status,
                        )
                        return False

                    try:
                        body = await resp.json(content_type=None)
                    except Exception:
                        logger.error("Activate flow response is not valid JSON for flow=%s node=%s", flow_id, node_id)
                        return False

                    if body.get("applied") is True:
                        return True
                    if str(body.get("status", "")).lower() in {"activated", "promoted", "success"}:
                        return True

                    logger.error(
                        "Flow activation not applied (flow=%s node=%s body=%s)",
                        flow_id,
                        node_id,
                        body,
                    )
                    return False
            except Exception as e:
                logger.error(f"Failed to activate flow {flow_id} on node {node_id}: {e}")
                return False
    
    async def select_best_node(self, flow: Dict, available_nodes: set) -> str:
        """Select the best available node for a flow."""
        # Simple strategy: pick first available
        # In production, would evaluate CPU, memory, latency, etc.
        if not available_nodes:
            raise ValueError("No available nodes")
        
        best_node = list(available_nodes)[0]
        node = self.registry.get_node(best_node)
        
        # Prefer nodes with lower CPU load
        best_cpu = 100
        for node_id in available_nodes:
            node = self.registry.get_node(node_id)
            if node and node.get('cpu_load', 100) < best_cpu:
                best_cpu = node.get('cpu_load', 100)
                best_node = node_id
        
        return best_node
    
    async def assign_flow(self, flow_id: str, node_id: str) -> bool:
        """Assign a flow to a node."""
        deployment = self.active_deployments.get(flow_id)
        if not deployment:
            deployment = await self._load_deployment_from_db(flow_id)
        if not deployment:
            return False
        
        # Update the primary assignment
        old_primary = deployment.primary_assignment
        deployment.primary_assignment = FlowAssignmentInfo(
            flow_id=flow_id,
            chain_id=deployment.chain_id,
            assigned_node_id=node_id,
            assignment_type='primary',
            reason=f'Reassigned from {old_primary.assigned_node_id}'
        )

        # Deploy the existing chain to the reassigned node.
        try:
            from app.services.chain_service import ChainService

            async with get_session() as session:
                chain_service = ChainService(session)
                chain = await chain_service.get_chain(deployment.chain_id)

            if not chain:
                logger.error(
                    "Cannot reassign flow %s: chain %s not found",
                    flow_id,
                    deployment.chain_id,
                )
                return False

            deployed = await self._deploy_to_node(node_id, chain, mode="active")
            if not deployed:
                logger.error("Cannot reassign flow %s: deploy to node %s failed", flow_id, node_id)
                return False
        except Exception as e:
            logger.error(f"Failed to deploy reassigned flow {flow_id} to {node_id}: {e}")
            return False

        await self._persist_assignments(
            deployment.primary_assignment,
            deployment.standby_assignments,
            strategy="reassign",
        )
        await self.save_deployment(deployment)
        return True

    async def _promote_standby_node(self, node_id: str, flow_id: str) -> bool:
        """Request standby node to promote flow to active."""
        node = self.registry.get_node(node_id)
        if not node:
            return False

        chain_id = await self._get_chain_id_for_flow(flow_id)

        hostname = node.get("hostname") or node.get("ip_address") or node_id
        url = f"http://{hostname}:8080/api/flows/promote-standby"
        payload = {"flow_id": flow_id, "chain_id": chain_id}

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    url, json=payload, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status != 200:
                        logger.error(
                            "Promote standby request failed (flow=%s node=%s status=%s)",
                            flow_id,
                            node_id,
                            resp.status,
                        )
                        return False

                    try:
                        body = await resp.json(content_type=None)
                    except Exception:
                        logger.error("Promote standby response is not valid JSON for flow=%s node=%s", flow_id, node_id)
                        return False

                    if body.get("applied") is True:
                        return True
                    if str(body.get("status", "")).lower() in {"promoted", "activated", "success"}:
                        return True

                    logger.error(
                        "Standby promotion not applied (flow=%s node=%s body=%s)",
                        flow_id,
                        node_id,
                        body,
                    )
                    return False
            except Exception as e:
                logger.error(f"Failed to promote standby on {node_id}: {e}")
                return False


# Singleton instance
_flow_orchestrator: Optional[FlowOrchestrator] = None


def get_flow_orchestrator() -> FlowOrchestrator:
    """Get or create the singleton FlowOrchestrator instance."""
    global _flow_orchestrator
    if _flow_orchestrator is None:
        _flow_orchestrator = FlowOrchestrator()
    return _flow_orchestrator
