"""
Snapshot deployment service.

This is the snapshot-granularity replacement for the old flow orchestrator.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SnapshotDeployment
from app.services.cluster.registry import get_cluster_registry
from app.services.snapshot_service import SnapshotService


class SnapshotDeploymentService:
    """Persist and manage snapshot-level cluster deployment state."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.snapshot_service = SnapshotService(session)
        self.registry = get_cluster_registry()

    def _candidate_standby_nodes(self, primary_node_id: str) -> list[str]:
        standby_ids: list[str] = []
        for node in self.registry.get_all_nodes():
            node_id = str(node.get("id", "")).strip()
            status = str(node.get("status", "online")).lower()
            if not node_id or node_id == primary_node_id or status in {"offline", "failed", "maintenance", "updating"}:
                continue
            standby_ids.append(node_id)
        return standby_ids

    @staticmethod
    def _coerce_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return default

    def select_best_node(
        self,
        *,
        excluded_node_ids: Optional[set[str]] = None,
        candidates: Optional[list[dict[str, Any]]] = None,
    ) -> Optional[str]:
        excluded = set(excluded_node_ids or set())
        pool = candidates if candidates is not None else self.registry.get_all_nodes()
        eligible: list[dict[str, Any]] = []

        for node in pool:
            node_id = str(node.get("id", "")).strip()
            status = str(node.get("status", "online")).lower()
            if not node_id or node_id in excluded or status in {"offline", "failed", "maintenance", "updating"}:
                continue
            eligible.append(node)

        eligible.sort(key=lambda item: self._coerce_float(item.get("cpu_load", 100.0), 100.0))
        if not eligible:
            return None
        return str(eligible[0].get("id", "")).strip() or None

    async def deploy_snapshot(
        self,
        snapshot_id: int,
        *,
        node_id: str,
        redundancy_enabled: bool = False,
        assignment_strategy: str = "manual",
    ) -> Optional[dict[str, Any]]:
        snapshot = await self.snapshot_service.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        if self.registry.get_node(node_id) is None:
            return None

        standby_ids = self._candidate_standby_nodes(node_id)[:2] if redundancy_enabled else []
        deployment = await self.snapshot_service.create_deployment(
            snapshot_id,
            primary_node_id=node_id,
            standby_node_ids=standby_ids,
            assignment_strategy=assignment_strategy,
            redundancy_enabled=redundancy_enabled,
            deployment_status="active",
        )
        if deployment is None:
            return None
        await self.snapshot_service.add_deployment_history(
            deployment["id"],
            snapshot_id=snapshot_id,
            to_node_id=node_id,
            action="deployed",
            notes="Snapshot deployment created",
        )
        return await self.get_latest_deployment(snapshot_id)

    async def get_latest_deployment(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        deployments = await self.snapshot_service.list_deployments(snapshot_id=snapshot_id)
        return deployments[0] if deployments else None

    async def list_deployments(self, *, primary_node_id: Optional[str] = None) -> list[dict[str, Any]]:
        deployments = await self.snapshot_service.list_deployments()
        if primary_node_id is None:
            return deployments
        return [item for item in deployments if item.get("primary_node_id") == primary_node_id]

    async def failover_snapshot(
        self,
        snapshot_id: int,
        *,
        retain_previous_primary: bool = True,
    ) -> Optional[dict[str, Any]]:
        result = await self.session.execute(
            select(SnapshotDeployment)
            .where(SnapshotDeployment.snapshot_id == snapshot_id)
            .order_by(SnapshotDeployment.deployed_at.desc())
        )
        deployment = result.scalars().first()
        if deployment is None:
            return None

        standby_ids = list(deployment.standby_node_ids or [])
        if not standby_ids:
            return None

        next_primary = standby_ids.pop(0)
        previous_primary = deployment.primary_node_id
        if retain_previous_primary and previous_primary and previous_primary not in standby_ids:
            standby_ids.append(previous_primary)

        deployment.primary_node_id = next_primary
        deployment.standby_node_ids = standby_ids
        deployment.deployment_status = "active"
        deployment.error_message = None
        deployment.last_failover_time = datetime.utcnow()
        deployment.updated_at = datetime.utcnow()

        await self.snapshot_service.add_deployment_history(
            deployment.id,
            snapshot_id=snapshot_id,
            from_node_id=previous_primary,
            to_node_id=next_primary,
            action="failed_over",
            notes="Manual snapshot failover",
        )
        await self.session.flush()
        return await self.get_latest_deployment(snapshot_id)

    async def reassign_snapshot(
        self,
        snapshot_id: int,
        *,
        node_id: str,
        failed_node_ids: Optional[set[str]] = None,
        assignment_strategy: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        if self.registry.get_node(node_id) is None:
            return None

        result = await self.session.execute(
            select(SnapshotDeployment)
            .where(SnapshotDeployment.snapshot_id == snapshot_id)
            .order_by(SnapshotDeployment.deployed_at.desc())
        )
        deployment = result.scalars().first()
        if deployment is None:
            return None

        dropped_nodes = set(failed_node_ids or set())
        previous_primary = deployment.primary_node_id
        standby_ids = [
            standby_node_id
            for standby_node_id in list(deployment.standby_node_ids or [])
            if standby_node_id and standby_node_id != node_id and standby_node_id not in dropped_nodes
        ]

        deployment.primary_node_id = node_id
        deployment.standby_node_ids = standby_ids
        deployment.assignment_strategy = assignment_strategy or deployment.assignment_strategy
        deployment.redundancy_enabled = bool(standby_ids)
        deployment.deployment_status = "active"
        deployment.error_message = None
        deployment.last_failover_time = datetime.utcnow()
        deployment.updated_at = datetime.utcnow()

        await self.snapshot_service.add_deployment_history(
            deployment.id,
            snapshot_id=snapshot_id,
            from_node_id=previous_primary,
            to_node_id=node_id,
            action="reassigned",
            notes="Snapshot reassigned after node failure",
        )
        await self.session.flush()
        return await self.get_latest_deployment(snapshot_id)
