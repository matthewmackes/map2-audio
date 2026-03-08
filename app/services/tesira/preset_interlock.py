"""
TesiraPresetInterlock — synchronises MAP2 preset recalls to Tesira preset recalls.

Wired into PluginPresetLifecycle via:
    lifecycle.register_listener("preset_loaded", interlock.on_preset_loaded_event)

No modification to plugin_preset_lifecycle.py is needed.
Interlock rules are stored in the TesiraInterlockRule SQLAlchemy table.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.services.tesira.tesira_fleet import TesiraFleet

logger = logging.getLogger(__name__)


@dataclass
class InterlockRule:
    id: int
    map2_preset_id: int
    tesira_device_id: str
    tesira_preset_index: int
    created_at: str


class TesiraPresetInterlock:
    """
    When a MAP2 preset is loaded, simultaneously recalls the mapped
    Tesira preset on each linked device.
    """

    def __init__(self, fleet: "TesiraFleet") -> None:
        self._fleet = fleet

    # ──────────────────────────────────────────────────────────────────────────
    # Lifecycle event hook
    # ──────────────────────────────────────────────────────────────────────────

    async def on_preset_loaded_event(self, data: Dict[str, Any]) -> None:
        """
        Called by PluginPresetLifecycle when any MAP2 preset is recalled.
        data = {'preset_id': int, 'timestamp': str}
        """
        preset_id: Optional[int] = data.get('preset_id')
        if preset_id is None:
            return

        try:
            from app.database import get_session
            async with get_session() as session:
                rules = await self._get_rules_for_preset(preset_id, session)
        except Exception as exc:
            logger.warning("TesiraPresetInterlock: DB lookup failed for preset %s: %s", preset_id, exc)
            return

        if not rules:
            return

        logger.info(
            "TesiraPresetInterlock: MAP2 preset %d recalled → firing %d Tesira recall(s)",
            preset_id, len(rules),
        )

        for rule in rules:
            device = self._fleet.get_device(rule.tesira_device_id)
            if device is None:
                logger.warning(
                    "TesiraPresetInterlock: device %s not found for rule %d",
                    rule.tesira_device_id, rule.id,
                )
                continue
            if not device.connected:
                logger.warning(
                    "TesiraPresetInterlock: device %s offline, skipping preset recall",
                    rule.tesira_device_id,
                )
                continue
            try:
                await device.recall_preset(rule.tesira_preset_index)
                logger.info(
                    "TesiraPresetInterlock: device %s preset %d recalled",
                    rule.tesira_device_id, rule.tesira_preset_index,
                )
                await self._broadcast_preset_synced(rule)
            except Exception as exc:
                logger.error(
                    "TesiraPresetInterlock: recall failed for device %s preset %d: %s",
                    rule.tesira_device_id, rule.tesira_preset_index, exc,
                )

    async def on_tesira_preset_changed(self, device_id: str, preset_index: int) -> None:
        """
        Reverse-sync detection path.

        Called when a Tesira device reports a preset change originating on the
        device side (front panel, third-party controller, or direct TTP).
        """
        try:
            from app.database import get_session
            async with get_session(read_only=True) as session:
                rules = await self._get_rules_for_tesira_preset(device_id, preset_index, session)
        except Exception as exc:
            logger.warning(
                "TesiraPresetInterlock: reverse-sync lookup failed for %s preset %d: %s",
                device_id,
                preset_index,
                exc,
            )
            return

        map2_ids = sorted({r.map2_preset_id for r in rules})
        payload = {
            "device_id": device_id,
            "preset_index": preset_index,
            "matched": bool(rules),
            "map2_preset_ids": map2_ids,
            "rule_ids": [r.id for r in rules],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._broadcast_reverse_sync_detected(payload)

    # ──────────────────────────────────────────────────────────────────────────
    # Rule management
    # ──────────────────────────────────────────────────────────────────────────

    async def add_rule(
        self,
        map2_preset_id: int,
        tesira_device_id: str,
        tesira_preset_index: int,
        session: "AsyncSession",
    ) -> int:
        """Insert a new interlock rule and return its ID."""
        from app.database import TesiraInterlockRule
        rule = TesiraInterlockRule(
            map2_preset_id=map2_preset_id,
            tesira_device_id=tesira_device_id,
            tesira_preset_index=tesira_preset_index,
        )
        session.add(rule)
        await session.flush()
        await session.commit()
        logger.info(
            "TesiraPresetInterlock: rule added — MAP2 preset %d → %s preset %d",
            map2_preset_id, tesira_device_id, tesira_preset_index,
        )
        return rule.id

    async def remove_rule(self, rule_id: int, session: "AsyncSession") -> bool:
        """Delete an interlock rule by ID."""
        from app.database import TesiraInterlockRule
        from sqlalchemy import select
        result = await session.execute(
            select(TesiraInterlockRule).where(TesiraInterlockRule.id == rule_id)
        )
        rule = result.scalar_one_or_none()
        if rule is None:
            return False
        await session.delete(rule)
        await session.commit()
        logger.info("TesiraPresetInterlock: rule %d deleted", rule_id)
        return True

    async def list_rules(self, session: "AsyncSession") -> List[InterlockRule]:
        """Return all interlock rules."""
        from app.database import TesiraInterlockRule
        from sqlalchemy import select
        result = await session.execute(select(TesiraInterlockRule).order_by(TesiraInterlockRule.id))
        rows = result.scalars().all()
        return [
            InterlockRule(
                id=r.id,
                map2_preset_id=r.map2_preset_id,
                tesira_device_id=r.tesira_device_id,
                tesira_preset_index=r.tesira_preset_index,
                created_at=r.created_at.isoformat() if r.created_at else '',
            )
            for r in rows
        ]

    # ──────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _get_rules_for_preset(
        self, preset_id: int, session: "AsyncSession"
    ) -> List[InterlockRule]:
        from app.database import TesiraInterlockRule
        from sqlalchemy import select
        result = await session.execute(
            select(TesiraInterlockRule).where(
                TesiraInterlockRule.map2_preset_id == preset_id
            )
        )
        rows = result.scalars().all()
        return [
            InterlockRule(
                id=r.id,
                map2_preset_id=r.map2_preset_id,
                tesira_device_id=r.tesira_device_id,
                tesira_preset_index=r.tesira_preset_index,
                created_at=r.created_at.isoformat() if r.created_at else '',
            )
            for r in rows
        ]

    async def _get_rules_for_tesira_preset(
        self, device_id: str, preset_index: int, session: "AsyncSession"
    ) -> List[InterlockRule]:
        from app.database import TesiraInterlockRule
        from sqlalchemy import select

        result = await session.execute(
            select(TesiraInterlockRule).where(
                TesiraInterlockRule.tesira_device_id == device_id,
                TesiraInterlockRule.tesira_preset_index == preset_index,
            )
        )
        rows = result.scalars().all()
        return [
            InterlockRule(
                id=r.id,
                map2_preset_id=r.map2_preset_id,
                tesira_device_id=r.tesira_device_id,
                tesira_preset_index=r.tesira_preset_index,
                created_at=r.created_at.isoformat() if r.created_at else '',
            )
            for r in rows
        ]

    async def _broadcast_preset_synced(self, rule: InterlockRule) -> None:
        payload = {
            'device_id': rule.tesira_device_id,
            'preset_index': rule.tesira_preset_index,
            'map2_preset_id': rule.map2_preset_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        try:
            from app.services.websocket_manager import get_websocket_manager
            ws = get_websocket_manager()
            await ws.broadcast_json(
                {'type': 'tesira:preset_change', 'data': payload},
                topic='tesira:preset_change',
            )
        except Exception as exc:
            logger.debug("TesiraPresetInterlock WS broadcast error: %s", exc)

    async def _broadcast_reverse_sync_detected(self, payload: Dict[str, Any]) -> None:
        try:
            from app.services.websocket_manager import get_websocket_manager

            ws = get_websocket_manager()
            await ws.broadcast_json(
                {"type": "tesira:preset_reverse_sync", "data": payload},
                topic="tesira:preset_reverse_sync",
            )
        except Exception as exc:
            logger.debug("TesiraPresetInterlock reverse WS broadcast error: %s", exc)
