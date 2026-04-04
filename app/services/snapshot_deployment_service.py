"""
Snapshot deployment service.

This is the snapshot-granularity replacement for the old flow orchestrator.
"""

from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SnapshotDeployment
from app.services.cluster.content_distributor import get_content_distributor
from app.services.cluster.registry import get_cluster_registry
from app.services.snapshot_service import SnapshotService


class SnapshotDeploymentService:
    """Persist and manage snapshot-level cluster deployment state."""

    _LOCAL_API_BASE_URL = f"http://127.0.0.1:{os.getenv('MAP2_API_PORT', '8080')}"

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

    async def _deploy_snapshot_assets(
        self,
        *,
        snapshot_id: int,
        target_node_ids: list[str],
    ) -> dict[str, Any]:
        export_payload = await self.snapshot_service.export_snapshot(snapshot_id)
        if export_payload is None:
            return {"asset_count": 0, "results": {}}

        distributor = get_content_distributor()
        results: dict[str, bool] = {node_id: True for node_id in target_node_ids}
        deployed_assets: set[tuple[str, str]] = set()

        for asset in export_payload.get("asset_manifest", []):
            asset_path = str(asset.get("asset_path") or "").strip()
            if not asset_path or not Path(asset_path).is_file():
                continue

            kind = str(asset.get("kind") or "").strip().lower()
            dedupe_key = (kind, asset_path)
            if dedupe_key in deployed_assets:
                continue
            deployed_assets.add(dedupe_key)

            if kind == "nam":
                asset_results = await distributor.deploy_nam_model(asset_path, target_node_ids)
            elif kind in {"cabinet_ir", "reverb_ir", "plugin_asset"}:
                asset_results = await distributor.deploy_ir(asset_path, target_node_ids)
            else:
                continue

            for node_id in target_node_ids:
                results[node_id] = results.get(node_id, True) and bool(asset_results.get(node_id, False))

        return {
            "asset_count": len(deployed_assets),
            "results": results,
        }

    async def _activate_snapshot_on_node(
        self,
        *,
        snapshot_id: int,
        node_id: str,
    ) -> dict[str, Any]:
        proxy_path = f"/api/node/{node_id}/proxy/api/snapshots/{snapshot_id}/activate"
        url = f"{self._LOCAL_API_BASE_URL}{proxy_path}"
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                response = await client.post(url)
        except httpx.HTTPError as exc:
            return {
                "activated": False,
                "status_code": None,
                "proxy_path": proxy_path,
                "message": f"Remote activation request failed: {exc}",
            }

        try:
            payload = response.json()
        except ValueError:
            payload = None

        if response.is_success:
            return {
                "activated": True,
                "status_code": response.status_code,
                "proxy_path": proxy_path,
                "payload": payload,
                "message": "Remote activation succeeded",
            }

        detail: Any = payload
        if isinstance(payload, dict):
            detail = payload.get("detail", payload.get("error", payload))
        return {
            "activated": False,
            "status_code": response.status_code,
            "proxy_path": proxy_path,
            "payload": payload,
            "message": f"Remote activation failed: {detail}",
        }

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
        asset_targets = [node_id, *standby_ids]
        asset_sync = await self._deploy_snapshot_assets(
            snapshot_id=snapshot_id,
            target_node_ids=asset_targets,
        )
        activation_result = await self._activate_snapshot_on_node(
            snapshot_id=snapshot_id,
            node_id=node_id,
        )
        deployment_status = "active" if activation_result["activated"] else "assets_only"
        deployment = await self.snapshot_service.create_deployment(
            snapshot_id,
            primary_node_id=node_id,
            standby_node_ids=standby_ids,
            assignment_strategy=assignment_strategy,
            redundancy_enabled=redundancy_enabled,
            deployment_status=deployment_status,
            error_message=None if activation_result["activated"] else activation_result["message"],
        )
        if deployment is None:
            return None
        asset_note = (
            "Snapshot deployment created"
            if asset_sync["asset_count"] == 0
            else (
                "Snapshot deployment created; bundled assets pushed to "
                + ", ".join(
                    f"{target}={'ok' if asset_sync['results'].get(target) else 'failed'}"
                    for target in asset_targets
                )
            )
        )
        await self.snapshot_service.add_deployment_history(
            deployment["id"],
            snapshot_id=snapshot_id,
            to_node_id=node_id,
            action="deployed",
            notes=(
                f"{asset_note}; remote activation={'ok' if activation_result['activated'] else 'failed'}"
                f" ({activation_result['message']})"
            ),
        )
        latest = await self.get_latest_deployment(snapshot_id)
        if latest is None:
            return None
        latest["remote_activation"] = activation_result
        return latest

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
