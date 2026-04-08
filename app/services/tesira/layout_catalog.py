"""
Tesira precompiled layout catalog service.

Stores and retrieves signed/validated layout artifacts that MAP2 can deploy via
an external deployment controller (SageVue).
"""

from __future__ import annotations

from datetime import datetime
import threading
from typing import Any, Dict, List, Optional

from sqlalchemy import select


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _normalize_flags(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return sorted({str(v).strip() for v in value if str(v).strip()})
    return [str(value).strip()] if str(value).strip() else []


def _normalize_tag_map(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


class TesiraLayoutCatalogService:
    """Persistence service for Tesira layout artifacts."""

    @staticmethod
    def _to_dict(row: Any) -> Dict[str, Any]:
        return {
            "layout_id": row.layout_id,
            "version": row.version,
            "name": row.name,
            "device_family": row.device_family,
            "channel_profile": row.channel_profile,
            "required_firmware": row.required_firmware,
            "checksum": row.checksum,
            "artifact_uri": row.artifact_uri,
            "instance_tag_map": dict(row.instance_tag_map or {}),
            "feature_flags": list(row.feature_flags or []),
            "notes": row.notes,
            "is_active": bool(row.is_active),
            "created_at": _iso(row.created_at),
            "updated_at": _iso(row.updated_at),
        }

    async def import_layout(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create or update one layout artifact keyed by (layout_id, version)."""
        from app.database import TesiraLayoutArtifact, get_session

        layout_id = str(payload.get("layout_id", "")).strip()
        version = str(payload.get("version", "")).strip() or "1.0.0"
        if not layout_id:
            raise ValueError("layout_id is required")

        async with get_session() as session:
            row = (
                await session.execute(
                    select(TesiraLayoutArtifact).where(
                        TesiraLayoutArtifact.layout_id == layout_id,
                        TesiraLayoutArtifact.version == version,
                    )
                )
            ).scalar_one_or_none()

            if row is None:
                row = TesiraLayoutArtifact(layout_id=layout_id, version=version)
                session.add(row)

            row.name = str(payload.get("name", row.name or layout_id)).strip() or layout_id
            row.device_family = str(payload.get("device_family", row.device_family or "UNKNOWN")).strip() or "UNKNOWN"
            row.channel_profile = (
                str(payload.get("channel_profile")).strip()
                if payload.get("channel_profile") is not None
                else None
            )
            row.required_firmware = (
                str(payload.get("required_firmware")).strip()
                if payload.get("required_firmware") is not None
                else None
            )
            row.checksum = str(payload.get("checksum", row.checksum or "")).strip()
            if not row.checksum:
                raise ValueError("checksum is required")

            row.artifact_uri = (
                str(payload.get("artifact_uri")).strip()
                if payload.get("artifact_uri") is not None
                else row.artifact_uri
            )
            row.instance_tag_map = _normalize_tag_map(payload.get("instance_tag_map", row.instance_tag_map))
            row.feature_flags = _normalize_flags(payload.get("feature_flags", row.feature_flags))
            row.notes = (
                str(payload.get("notes")).strip()
                if payload.get("notes") is not None
                else row.notes
            )
            if "is_active" in payload:
                row.is_active = bool(payload.get("is_active"))

            await session.flush()
            await session.refresh(row)
            return self._to_dict(row)

    async def list_layouts(
        self,
        device_family: Optional[str] = None,
        include_inactive: bool = False,
    ) -> List[Dict[str, Any]]:
        """List catalog entries with optional filtering."""
        from app.database import TesiraLayoutArtifact, get_session

        async with get_session(read_only=True) as session:
            stmt = select(TesiraLayoutArtifact)
            if device_family:
                stmt = stmt.where(TesiraLayoutArtifact.device_family == device_family)
            if not include_inactive:
                stmt = stmt.where(TesiraLayoutArtifact.is_active.is_(True))
            stmt = stmt.order_by(TesiraLayoutArtifact.layout_id.asc(), TesiraLayoutArtifact.version.desc())
            rows = (await session.execute(stmt)).scalars().all()
            return [self._to_dict(r) for r in rows]

    async def get_layout(self, layout_id: str, version: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch one catalog entry by layout id (and optional version)."""
        from app.database import TesiraLayoutArtifact, get_session

        async with get_session(read_only=True) as session:
            stmt = select(TesiraLayoutArtifact).where(TesiraLayoutArtifact.layout_id == layout_id)
            if version:
                stmt = stmt.where(TesiraLayoutArtifact.version == version)
            stmt = stmt.order_by(TesiraLayoutArtifact.updated_at.desc(), TesiraLayoutArtifact.created_at.desc())
            row = (await session.execute(stmt)).scalars().first()
            return self._to_dict(row) if row is not None else None


_layout_catalog_service: Optional[TesiraLayoutCatalogService] = None
_layout_catalog_service_lock = threading.Lock()


def get_layout_catalog_service() -> TesiraLayoutCatalogService:
    global _layout_catalog_service
    if _layout_catalog_service is None:
        with _layout_catalog_service_lock:
            if _layout_catalog_service is None:
                _layout_catalog_service = TesiraLayoutCatalogService()
    return _layout_catalog_service
