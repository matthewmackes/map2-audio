"""Persistent SRP/MSRP admission log storage."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.database import SrpAdmissionLog, get_session


def _utcnow() -> datetime:
    """UTC timestamp as naive datetime for current DB schema compatibility."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SrpAdmissionLogStore:
    """SQLite-backed admission log persistence and queries."""

    @staticmethod
    def _row_to_dict(row: SrpAdmissionLog) -> Dict[str, Any]:
        return {
            "admission_id": row.admission_id,
            "decision": row.decision,
            "reason_code": row.reason_code,
            "reason": row.reason,
            "remediation": list(row.remediation or []),
            "daemon_type": row.daemon_type,
            "daemon_socket": row.daemon_socket,
            "raw_response": row.raw_response,
            "endpoint": row.endpoint,
            "stream_id": row.stream_id,
            "talker_id": row.talker_id,
            "listener_id": row.listener_id,
            "reservation_id": row.reservation_id,
            "request_metadata": dict(row.request_metadata or {}),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "released": bool(row.released),
            "release_status": row.release_status,
            "release_reason": row.release_reason,
            "release_response": row.release_response,
            "release_at": row.release_at.isoformat() if row.release_at else None,
        }

    async def record(
        self,
        *,
        admission_id: str,
        decision: str,
        reason_code: str,
        reason: str,
        remediation: Optional[List[str]] = None,
        daemon_type: Optional[str] = None,
        daemon_socket: Optional[str] = None,
        raw_response: Optional[str] = None,
        endpoint: str,
        stream_id: Optional[str] = None,
        talker_id: Optional[str] = None,
        listener_id: Optional[str] = None,
        reservation_id: Optional[str] = None,
        request_metadata: Optional[Dict[str, Any]] = None,
        created_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
    ) -> None:
        """Persist one SRP admission attempt."""
        async with get_session() as session:
            row = SrpAdmissionLog(
                admission_id=admission_id,
                decision=decision,
                reason_code=reason_code,
                reason=reason,
                remediation=list(remediation or []),
                daemon_type=daemon_type,
                daemon_socket=daemon_socket,
                raw_response=raw_response,
                endpoint=endpoint,
                stream_id=stream_id,
                talker_id=talker_id,
                listener_id=listener_id,
                reservation_id=reservation_id,
                request_metadata=dict(request_metadata or {}),
                created_at=created_at or _utcnow(),
                completed_at=completed_at or _utcnow(),
            )
            session.add(row)
            await session.flush()

    async def list_admissions(
        self,
        *,
        decision: Optional[str] = None,
        since: Optional[datetime] = None,
        limit: int = 100,
        endpoint: Optional[str] = None,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Query admission logs with optional filters."""
        capped_limit = max(1, min(int(limit), 500))
        safe_offset = max(0, int(offset))

        async with get_session() as session:
            stmt = select(SrpAdmissionLog)

            if decision:
                stmt = stmt.where(SrpAdmissionLog.decision == decision)
            if since:
                stmt = stmt.where(SrpAdmissionLog.created_at >= since)
            if endpoint:
                stmt = stmt.where(SrpAdmissionLog.endpoint == endpoint)

            stmt = (
                stmt.order_by(SrpAdmissionLog.created_at.desc())
                .offset(safe_offset)
                .limit(capped_limit)
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()
            return [self._row_to_dict(row) for row in rows]

    async def get_admission(self, admission_id: str) -> Optional[Dict[str, Any]]:
        """Get one admission row by admission ID."""
        async with get_session() as session:
            result = await session.execute(
                select(SrpAdmissionLog).where(SrpAdmissionLog.admission_id == admission_id)
            )
            row = result.scalar_one_or_none()
            if row is None:
                return None
            return self._row_to_dict(row)

    async def mark_release(
        self,
        *,
        reservation_id: str,
        success: bool,
        reason: str,
        raw_response: Optional[str] = None,
        released_at: Optional[datetime] = None,
    ) -> bool:
        """Mark release status for the newest admission row tied to reservation_id."""
        if not reservation_id:
            return False

        async with get_session() as session:
            result = await session.execute(
                select(SrpAdmissionLog)
                .where(SrpAdmissionLog.reservation_id == reservation_id)
                .order_by(SrpAdmissionLog.created_at.desc())
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row is None:
                return False

            row.released = True
            row.release_status = "released" if success else "failed"
            row.release_reason = reason
            row.release_response = raw_response
            row.release_at = released_at or _utcnow()
            await session.flush()
            return True
