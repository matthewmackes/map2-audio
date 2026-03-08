"""
Tesira deployment orchestrator.

Runs transactional deployment jobs with a persistent timeline:
queued -> preflight -> deploy -> hydrate -> verify -> succeeded|failed
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.utcnow()


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value is not None else None


class TesiraDeployOrchestrator:
    """Coordinates Tesira layout deployments and rollback operations."""

    def __init__(self) -> None:
        self._active_tasks: Dict[str, asyncio.Task] = {}

    async def start_deployment(
        self,
        *,
        device_id: str,
        layout_id: str,
        layout_version: str,
        dry_run: bool,
        requested_by: Optional[str] = None,
        rollback_layout_id: Optional[str] = None,
        rollback_layout_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        from app.database import TesiraDeploymentJob, get_session
        from app.services.tesira import get_tesira_layout_catalog

        layout = await get_tesira_layout_catalog().get_layout(layout_id, layout_version)
        if layout is None:
            raise ValueError(f"Layout '{layout_id}' version '{layout_version}' not found")

        job_id = f"tesira_deploy_{uuid.uuid4().hex[:16]}"
        created_payload: Dict[str, Any]

        async with get_session() as session:
            row = TesiraDeploymentJob(
                job_id=job_id,
                device_id=device_id,
                layout_id=layout_id,
                layout_version=layout_version,
                rollback_layout_id=rollback_layout_id,
                rollback_layout_version=rollback_layout_version,
                requested_by=requested_by,
                dry_run=bool(dry_run),
                status="queued",
                stage="queued",
            )
            session.add(row)
            await session.flush()
            await self._append_event(
                session,
                job_id=job_id,
                stage="queued",
                status="queued",
                message="Deployment job queued",
                payload={
                    "device_id": device_id,
                    "layout_id": layout_id,
                    "layout_version": layout_version,
                    "dry_run": bool(dry_run),
                },
            )
            created_payload = await self._read_job_locked(session, job_id)

        await self._publish(created_payload)

        task = asyncio.create_task(self._run_job(job_id), name=f"tesira_deploy_{job_id}")
        self._active_tasks[job_id] = task
        task.add_done_callback(lambda _: self._active_tasks.pop(job_id, None))

        return created_payload

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        from app.database import get_session

        async with get_session(read_only=True) as session:
            return await self._read_job_locked(session, job_id)

    async def rollback_job(
        self,
        *,
        job_id: str,
        requested_by: Optional[str] = None,
        layout_id: Optional[str] = None,
        layout_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        from app.services.tesira import get_tesira_sagevue_client

        job = await self.get_job(job_id)
        if job is None:
            raise ValueError(f"Deployment job '{job_id}' not found")

        rollback_layout_id = layout_id or job.get("rollback_layout_id")
        rollback_layout_version = layout_version or job.get("rollback_layout_version") or "1.0.0"
        if not rollback_layout_id:
            raise ValueError("Rollback layout is not configured for this job")

        await self._transition(
            job_id,
            stage="rollback",
            status="running",
            message="Rollback requested",
            payload={
                "requested_by": requested_by,
                "rollback_layout_id": rollback_layout_id,
                "rollback_layout_version": rollback_layout_version,
            },
            error_detail=None,
            completed=False,
        )

        client = get_tesira_sagevue_client()
        if job.get("dry_run"):
            rollback_result = {
                "dry_run": True,
                "layout_id": rollback_layout_id,
                "layout_version": rollback_layout_version,
            }
        else:
            rollback_result = await client.deploy_layout(
                layout_id=rollback_layout_id,
                target_device=str(job["device_id"]),
                dry_run=False,
                metadata={
                    "rollback_from_job": job_id,
                    "requested_by": requested_by,
                },
            )

        await self._transition(
            job_id,
            stage="rollback",
            status="rolled_back",
            message="Rollback completed",
            payload=rollback_result,
            error_detail=None,
            completed=True,
        )
        updated = await self.get_job(job_id)
        assert updated is not None
        return updated

    async def _run_job(self, job_id: str) -> None:
        from app.services.tesira import (
            get_tesira_fleet,
            get_tesira_layout_catalog,
            get_tesira_sagevue_client,
        )

        try:
            await self._transition(
                job_id,
                stage="preflight",
                status="running",
                message="Running deployment preflight",
                payload=None,
                error_detail=None,
                completed=False,
            )

            job = await self.get_job(job_id)
            if job is None:
                raise RuntimeError(f"Deployment job disappeared: {job_id}")

            fleet = get_tesira_fleet()
            device = fleet.get_device(str(job["device_id"]))
            if device is None:
                raise RuntimeError(f"Device '{job['device_id']}' not found in fleet")

            layout = await get_tesira_layout_catalog().get_layout(
                layout_id=str(job["layout_id"]),
                version=str(job["layout_version"]),
            )
            if layout is None:
                raise RuntimeError("Layout no longer available in catalog")

            await self._transition(
                job_id,
                stage="preflight",
                status="running",
                message="Preflight checks passed",
                payload={
                    "device_connected": bool(device.connected),
                    "layout_checksum": layout.get("checksum"),
                    "device_host": getattr(device, "host", None),
                },
                error_detail=None,
                completed=False,
            )

            await self._transition(
                job_id,
                stage="deploy",
                status="running",
                message="Dispatching deployment to SageVue",
                payload=None,
                error_detail=None,
                completed=False,
            )

            if bool(job.get("dry_run")):
                deploy_result = {
                    "dry_run": True,
                    "layout_id": job["layout_id"],
                    "layout_version": job["layout_version"],
                }
            else:
                deploy_result = await get_tesira_sagevue_client().deploy_layout(
                    layout_id=str(job["layout_id"]),
                    target_device=str(job["device_id"]),
                    dry_run=False,
                    metadata={"job_id": job_id},
                )
                await self._set_sagevue_job_id(
                    job_id,
                    str(deploy_result.get("job_id") or deploy_result.get("id") or ""),
                )

            await self._transition(
                job_id,
                stage="hydrate",
                status="running",
                message="Applying post-deploy hydration",
                payload=deploy_result,
                error_detail=None,
                completed=False,
            )

            hydration_payload: Dict[str, Any] = {"hydrated": True}
            if device.connected:
                try:
                    info = await device.get_info()
                    hydration_payload["device_info"] = {
                        "hostname": info.get("hostname"),
                        "serial_number": info.get("serial_number"),
                        "firmware_version": info.get("firmware_version"),
                    }
                except Exception as exc:
                    hydration_payload["warning"] = f"Hydration info read failed: {exc}"

            await self._transition(
                job_id,
                stage="verify",
                status="running",
                message="Running post-deploy verification",
                payload=hydration_payload,
                error_detail=None,
                completed=False,
            )

            verification_payload: Dict[str, Any] = {
                "device_connected": bool(device.connected),
            }
            if not bool(job.get("dry_run")) and not device.connected:
                raise RuntimeError("Device offline after deployment")

            if device.connected:
                try:
                    ptp = await device.get_ptp_status()
                    verification_payload["ptp_state"] = ptp.get("state")
                except Exception as exc:
                    verification_payload["ptp_warning"] = str(exc)

            await self._transition(
                job_id,
                stage="commit",
                status="succeeded",
                message="Deployment completed successfully",
                payload=verification_payload,
                error_detail=None,
                completed=True,
            )
        except Exception as exc:
            await self._transition(
                job_id,
                stage="failed",
                status="failed",
                message="Deployment failed",
                payload={"error": str(exc)},
                error_detail=str(exc),
                completed=True,
            )

    async def _set_sagevue_job_id(self, job_id: str, sagevue_job_id: str) -> None:
        if not sagevue_job_id:
            return

        from app.database import TesiraDeploymentJob, get_session

        async with get_session() as session:
            row = (
                await session.execute(
                    select(TesiraDeploymentJob).where(TesiraDeploymentJob.job_id == job_id)
                )
            ).scalar_one_or_none()
            if row is None:
                return
            row.sagevue_job_id = sagevue_job_id
            await session.flush()

    async def _transition(
        self,
        job_id: str,
        *,
        stage: str,
        status: str,
        message: str,
        payload: Optional[Dict[str, Any]],
        error_detail: Optional[str],
        completed: bool,
    ) -> None:
        from app.database import TesiraDeploymentJob, get_session

        updated_payload: Optional[Dict[str, Any]] = None

        async with get_session() as session:
            row = (
                await session.execute(
                    select(TesiraDeploymentJob).where(TesiraDeploymentJob.job_id == job_id)
                )
            ).scalar_one_or_none()
            if row is None:
                return

            row.stage = stage
            row.status = status
            row.error_detail = error_detail
            if row.started_at is None and status in {"running", "succeeded", "failed", "rolled_back"}:
                row.started_at = _now()
            if completed:
                row.completed_at = _now()

            await self._append_event(
                session,
                job_id=job_id,
                stage=stage,
                status=status,
                message=message,
                payload=payload,
            )
            await session.flush()
            updated_payload = await self._read_job_locked(session, job_id)

        if updated_payload is not None:
            await self._publish(updated_payload)

    async def _append_event(
        self,
        session: Any,
        *,
        job_id: str,
        stage: str,
        status: str,
        message: str,
        payload: Optional[Dict[str, Any]],
    ) -> None:
        from app.database import TesiraDeploymentEvent

        current = (
            await session.execute(
                select(func.max(TesiraDeploymentEvent.sequence)).where(
                    TesiraDeploymentEvent.job_id == job_id
                )
            )
        ).scalar_one()
        next_seq = int(current or 0) + 1

        session.add(
            TesiraDeploymentEvent(
                job_id=job_id,
                sequence=next_seq,
                stage=stage,
                status=status,
                message=message,
                payload=dict(payload or {}),
            )
        )

    async def _read_job_locked(self, session: Any, job_id: str) -> Optional[Dict[str, Any]]:
        from app.database import TesiraDeploymentEvent, TesiraDeploymentJob

        row = (
            await session.execute(
                select(TesiraDeploymentJob).where(TesiraDeploymentJob.job_id == job_id)
            )
        ).scalar_one_or_none()
        if row is None:
            return None

        events = (
            await session.execute(
                select(TesiraDeploymentEvent)
                .where(TesiraDeploymentEvent.job_id == job_id)
                .order_by(TesiraDeploymentEvent.sequence.asc())
            )
        ).scalars().all()

        return {
            "job_id": row.job_id,
            "device_id": row.device_id,
            "layout_id": row.layout_id,
            "layout_version": row.layout_version,
            "rollback_layout_id": row.rollback_layout_id,
            "rollback_layout_version": row.rollback_layout_version,
            "requested_by": row.requested_by,
            "dry_run": bool(row.dry_run),
            "status": row.status,
            "stage": row.stage,
            "sagevue_job_id": row.sagevue_job_id,
            "error_detail": row.error_detail,
            "started_at": _iso(row.started_at),
            "completed_at": _iso(row.completed_at),
            "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at),
            "events": [
                {
                    "sequence": evt.sequence,
                    "stage": evt.stage,
                    "status": evt.status,
                    "message": evt.message,
                    "payload": dict(evt.payload or {}),
                    "created_at": _iso(evt.created_at),
                }
                for evt in events
            ],
        }

    async def _publish(self, payload: Dict[str, Any]) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            await ws_manager.broadcast_json(
                {"type": "tesira:deployments", "data": payload},
                topic="tesira:deployments",
            )
        except Exception as exc:
            logger.debug("Tesira deployment websocket publish error: %s", exc)


_tesira_deploy_orchestrator: Optional[TesiraDeployOrchestrator] = None


def get_tesira_deploy_orchestrator() -> TesiraDeployOrchestrator:
    global _tesira_deploy_orchestrator
    if _tesira_deploy_orchestrator is None:
        _tesira_deploy_orchestrator = TesiraDeployOrchestrator()
    return _tesira_deploy_orchestrator
