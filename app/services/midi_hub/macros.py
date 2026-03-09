"""Cross-device macro trigger engine for MIDI Hub."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.preset_service import MidiHubPresetService, get_midi_hub_preset_service
from app.services.midi_hub.router import MidiRouter, get_midi_router


@dataclass
class MacroAction:
    target: str
    action: str
    delay_ms: int = 0
    params: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target": self.target,
            "action": self.action,
            "delay_ms": int(self.delay_ms),
            "params": dict(self.params or {}),
        }


@dataclass
class MidiMacro:
    macro_id: str
    name: str
    trigger: Dict[str, Any]
    actions: List[MacroAction]
    enabled: bool
    created_at: float
    updated_at: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "macro_id": self.macro_id,
            "name": self.name,
            "trigger": dict(self.trigger),
            "actions": [action.to_dict() for action in self.actions],
            "enabled": self.enabled,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class MidiMacroService:
    def __init__(
        self,
        *,
        hub: Optional[MidiHub] = None,
        router: Optional[MidiRouter] = None,
        preset_service: Optional[MidiHubPresetService] = None,
        storage_path: Optional[Path] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._router = router or get_midi_router()
        self._preset_service = preset_service or get_midi_hub_preset_service()
        self._storage_path = storage_path or Path("~/.map2/midi_hub_macros.json").expanduser()
        self._macros: Dict[str, MidiMacro] = {}
        self._load()

    def list_macros(self) -> List[Dict[str, Any]]:
        return [row.to_dict() for row in self._macros.values()]

    def get_macro(self, macro_id: str) -> Optional[Dict[str, Any]]:
        row = self._macros.get(macro_id)
        return row.to_dict() if row is not None else None

    def upsert_macro(self, *, macro_id: str, name: str, trigger: Dict[str, Any], actions: List[Dict[str, Any]], enabled: bool = True) -> Dict[str, Any]:
        now = time.time()
        existing = self._macros.get(macro_id)
        normalized_actions = [
            MacroAction(
                target=str(item.get("target") or ""),
                action=str(item.get("action") or ""),
                delay_ms=int(item.get("delay_ms", 0)),
                params=dict(item.get("params") or {}),
            )
            for item in actions
        ]
        row = MidiMacro(
            macro_id=macro_id,
            name=name,
            trigger=dict(trigger),
            actions=normalized_actions,
            enabled=bool(enabled),
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        self._macros[macro_id] = row
        self._persist()
        return row.to_dict()

    def delete_macro(self, macro_id: str) -> bool:
        removed = self._macros.pop(macro_id, None) is not None
        if removed:
            self._persist()
        return removed

    async def trigger_macro(self, macro_id: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        macro = self._macros.get(macro_id)
        if macro is None:
            return {"ok": False, "reason": "not_found"}
        if not macro.enabled:
            return {"ok": False, "reason": "disabled"}

        for action in macro.actions:
            if action.delay_ms > 0:
                await asyncio.sleep(float(action.delay_ms) / 1000.0)
            await self._execute_action(action, payload or {})
        return {"ok": True, "macro_id": macro_id}

    async def match_and_trigger(self, event: Dict[str, Any]) -> List[str]:
        triggered: List[str] = []
        for macro in self._macros.values():
            if not macro.enabled:
                continue
            if _match_trigger(macro.trigger, event):
                await self.trigger_macro(macro.macro_id, payload=event)
                triggered.append(macro.macro_id)
        return triggered

    async def _execute_action(self, action: MacroAction, payload: Dict[str, Any]) -> None:
        params = dict(action.params or {})
        if action.action == "send_midi":
            destination_port = str(action.target)
            raw = params.get("message") or [0xB0, 1, 0]
            try:
                data = bytes(int(v) & 0xFF for v in raw)
            except Exception:
                data = b"\xB0\x01\x00"
            self._hub.send(source_port="midi_macro", destination_port=destination_port, data=data)
            return

        if action.action == "enable_route":
            self._router.set_route_enabled(action.target, True)
            return

        if action.action == "disable_route":
            self._router.set_route_enabled(action.target, False)
            return

        if action.action == "recall_preset":
            await self._preset_service.recall_preset(action.target)
            return

        if action.action == "tesira_scene":
            # Routed via existing Tesira APIs; macro engine keeps action metadata for route consumers.
            return

    def _persist(self) -> None:
        payload = {
            "macros": {macro_id: row.to_dict() for macro_id, row in self._macros.items()},
            "updated_at": time.time(),
        }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self._storage_path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self._storage_path)

    def _load(self) -> None:
        if not self._storage_path.exists():
            return
        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
            raw_macros = payload.get("macros") or {}
            for macro_id, raw in raw_macros.items():
                if not isinstance(raw, dict):
                    continue
                actions = []
                for item in raw.get("actions") or []:
                    if not isinstance(item, dict):
                        continue
                    actions.append(
                        MacroAction(
                            target=str(item.get("target") or ""),
                            action=str(item.get("action") or ""),
                            delay_ms=int(item.get("delay_ms", 0)),
                            params=dict(item.get("params") or {}),
                        )
                    )
                self._macros[macro_id] = MidiMacro(
                    macro_id=str(raw.get("macro_id") or macro_id),
                    name=str(raw.get("name") or macro_id),
                    trigger=dict(raw.get("trigger") or {}),
                    actions=actions,
                    enabled=bool(raw.get("enabled", True)),
                    created_at=float(raw.get("created_at") or time.time()),
                    updated_at=float(raw.get("updated_at") or time.time()),
                )
        except Exception:
            self._macros = {}


def _match_trigger(trigger: Dict[str, Any], event: Dict[str, Any]) -> bool:
    if not trigger:
        return False
    for key, value in trigger.items():
        if event.get(key) != value:
            return False
    return True


_midi_macro_service_singleton: Optional[MidiMacroService] = None


def get_midi_macro_service() -> MidiMacroService:
    global _midi_macro_service_singleton
    if _midi_macro_service_singleton is None:
        _midi_macro_service_singleton = MidiMacroService()
    return _midi_macro_service_singleton
