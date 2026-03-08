"""
Tesira DSP runtime model.

Discovers DSP blocks via TTP naming conventions and persists declarations for
use by API/UI layers.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import select

from app.services.tesira.tesira_block_registry import list_probe_profiles


@dataclass
class TesiraDspBlock:
    instance_tag: str
    block_type: str
    channel_count: int
    parameter_map: Dict[str, Dict[str, Any]]
    title: Optional[str]
    category: Optional[str]
    editor: Dict[str, Any]
    is_probed: bool
    last_probed_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ProbeResult:
    device_id: str
    discovered_count: int
    blocks: List[TesiraDspBlock]
    errors: List[str]
    started_at: str
    completed_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "discovered_count": self.discovered_count,
            "blocks": [b.to_dict() for b in self.blocks],
            "errors": list(self.errors),
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_count(value: Any, default_value: int) -> int:
    try:
        parsed = int(str(value).strip())
        return parsed if parsed > 0 else default_value
    except Exception:
        return default_value


def _serialize_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)


def _profile_for_instance(instance_tag: str, profiles: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    for prefix, profile in profiles.items():
        if instance_tag.startswith(prefix):
            return profile
    return {}


class TesiraDspModel:
    async def probe_device(self, device: Any, max_instances: int = 32) -> ProbeResult:
        started_at = _now_iso()
        discovered: List[TesiraDspBlock] = []
        errors: List[str] = []
        block_profiles = list_probe_profiles()

        for prefix, profile in block_profiles.items():
            misses = 0
            probe_attr = str(profile["probe_attribute"])
            for idx in range(1, max_instances + 1):
                instance_tag = f"{prefix}{idx}"
                try:
                    response = await device._client.send(instance_tag, "get", probe_attr)
                except Exception as exc:
                    errors.append(f"{instance_tag}: {exc}")
                    misses += 1
                    if idx > 8 and misses >= 8:
                        break
                    continue

                if not response.ok:
                    misses += 1
                    if idx > 8 and misses >= 8:
                        break
                    continue

                misses = 0
                discovered.append(
                    TesiraDspBlock(
                        instance_tag=instance_tag,
                        block_type=str(profile["block_type"]),
                        channel_count=_coerce_count(response.value, int(profile["default_channels"])),
                        parameter_map=dict(profile["parameter_map"]),
                        title=str(profile.get("title", prefix)),
                        category=str(profile.get("category", "processing")),
                        editor=dict(profile.get("editor") or {}),
                        is_probed=True,
                        last_probed_at=_now_iso(),
                    )
                )

        await self._persist_blocks(device.device_id, discovered)
        return ProbeResult(
            device_id=device.device_id,
            discovered_count=len(discovered),
            blocks=discovered,
            errors=errors,
            started_at=started_at,
            completed_at=_now_iso(),
        )

    async def list_blocks(self, device_id: str) -> List[Dict[str, Any]]:
        from app.database import TesiraBlockDeclaration, get_session

        block_profiles = list_probe_profiles()
        async with get_session(read_only=True) as session:
            rows = (
                await session.execute(
                    select(TesiraBlockDeclaration)
                    .where(TesiraBlockDeclaration.device_id == device_id)
                    .order_by(TesiraBlockDeclaration.instance_tag.asc())
                )
            ).scalars().all()

        payload: List[Dict[str, Any]] = []
        for row in rows:
            profile = _profile_for_instance(row.instance_tag, block_profiles)
            payload.append(
                {
                    "instance_tag": row.instance_tag,
                    "block_type": row.block_type,
                    "channel_count": row.channel_count,
                    "parameter_map": dict(row.parameter_map or {}),
                    "title": str(profile.get("title", row.instance_tag)),
                    "category": str(profile.get("category", "processing")),
                    "editor": dict(profile.get("editor") or {}),
                    "is_probed": bool(row.is_probed),
                    "last_probed_at": row.last_probed_at.isoformat() if row.last_probed_at else None,
                }
            )
        return payload

    async def get_block(self, device_id: str, instance_tag: str) -> Optional[Dict[str, Any]]:
        from app.database import TesiraBlockDeclaration, get_session

        async with get_session(read_only=True) as session:
            row = (
                await session.execute(
                    select(TesiraBlockDeclaration).where(
                        TesiraBlockDeclaration.device_id == device_id,
                        TesiraBlockDeclaration.instance_tag == instance_tag,
                    )
                )
            ).scalar_one_or_none()

        if row is None:
            return None

        profile = _profile_for_instance(instance_tag, list_probe_profiles())
        return {
            "instance_tag": row.instance_tag,
            "block_type": row.block_type,
            "channel_count": row.channel_count,
            "parameter_map": dict(row.parameter_map or {}),
            "title": str(profile.get("title", row.instance_tag)),
            "category": str(profile.get("category", "processing")),
            "editor": dict(profile.get("editor") or {}),
            "is_probed": bool(row.is_probed),
            "last_probed_at": row.last_probed_at.isoformat() if row.last_probed_at else None,
        }

    async def get_param(self, device: Any, instance_tag: str, attribute: str, args: Iterable[Any] | None = None) -> Any:
        resolved_args = list(args or [])
        response = await device._client.send(instance_tag, "get", attribute, *resolved_args)
        if not response.ok:
            raise RuntimeError(f"get {instance_tag}.{attribute} failed: {response.error_code} {response.error_detail}")
        return response.value

    async def set_param(
        self,
        device: Any,
        instance_tag: str,
        attribute: str,
        value: Any,
        args: Iterable[Any] | None = None,
    ) -> None:
        resolved_args = list(args or [])
        response = await device._client.send(
            instance_tag,
            "set",
            attribute,
            *resolved_args,
            _serialize_value(value),
        )
        if not response.ok:
            raise RuntimeError(f"set {instance_tag}.{attribute} failed: {response.error_code} {response.error_detail}")

    async def bulk_get(self, device: Any, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for op in operations:
            instance_tag = str(op.get("instance_tag", "")).strip()
            attribute = str(op.get("attribute", "")).strip()
            args = op.get("args", []) or []
            op_id = op.get("id")
            try:
                value = await self.get_param(device, instance_tag, attribute, args)
                results.append({"id": op_id, "ok": True, "instance_tag": instance_tag, "attribute": attribute, "value": value})
            except Exception as exc:
                results.append({"id": op_id, "ok": False, "instance_tag": instance_tag, "attribute": attribute, "error": str(exc)})
        return results

    async def bulk_set(self, device: Any, operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for op in operations:
            instance_tag = str(op.get("instance_tag", "")).strip()
            attribute = str(op.get("attribute", "")).strip()
            args = op.get("args", []) or []
            value = op.get("value")
            op_id = op.get("id")
            try:
                await self.set_param(device, instance_tag, attribute, value, args)
                results.append({"id": op_id, "ok": True, "instance_tag": instance_tag, "attribute": attribute})
            except Exception as exc:
                results.append({"id": op_id, "ok": False, "instance_tag": instance_tag, "attribute": attribute, "error": str(exc)})
        return results

    async def capture_scene(self, device: Any, blocks: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        scene_data: Dict[str, Dict[str, Any]] = {}
        for block in blocks:
            instance_tag = str(block.get("instance_tag", ""))
            parameter_map = block.get("parameter_map", {}) or {}
            block_state: Dict[str, Any] = {}
            for attribute in parameter_map.keys():
                try:
                    block_state[attribute] = await self.get_param(device, instance_tag, attribute)
                except Exception:
                    # Keep capture resilient; individual parameter misses should not abort.
                    continue
            scene_data[instance_tag] = block_state
        return scene_data

    async def recall_scene(self, device: Any, block_states: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        applied = 0
        failed: List[str] = []
        for instance_tag, attrs in block_states.items():
            for attribute, value in (attrs or {}).items():
                try:
                    await self.set_param(device, instance_tag, attribute, value)
                    applied += 1
                except Exception as exc:
                    failed.append(f"{instance_tag}.{attribute}: {exc}")
        return {"applied": applied, "failed": failed}

    async def _persist_blocks(self, device_id: str, blocks: List[TesiraDspBlock]) -> None:
        from app.database import TesiraBlockDeclaration, get_session

        if not blocks:
            return

        async with get_session() as session:
            existing_rows = (
                await session.execute(
                    select(TesiraBlockDeclaration).where(TesiraBlockDeclaration.device_id == device_id)
                )
            ).scalars().all()
            by_tag = {row.instance_tag: row for row in existing_rows}

            for block in blocks:
                row = by_tag.get(block.instance_tag)
                if row is None:
                    row = TesiraBlockDeclaration(
                        device_id=device_id,
                        instance_tag=block.instance_tag,
                    )
                    session.add(row)
                row.block_type = block.block_type
                row.channel_count = block.channel_count
                row.parameter_map = dict(block.parameter_map)
                row.is_probed = True
                row.last_probed_at = datetime.now(timezone.utc)
