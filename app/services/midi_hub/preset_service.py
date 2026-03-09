"""MIDI Hub preset snapshot and recall service."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.midi_hub.router import MidiRouter, get_midi_router


def _default_presets_path() -> Path:
    return Path("~/.map2/midi_hub_presets/presets.json").expanduser()


@dataclass
class MidiHubPreset:
    preset_id: str
    name: str
    description: str
    created_at: float
    updated_at: float
    snapshot: Dict[str, Any]
    conditions: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "preset_id": self.preset_id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "snapshot": self.snapshot,
            "conditions": dict(self.conditions),
        }


class MidiHubPresetService:
    def __init__(
        self,
        *,
        router: Optional[MidiRouter] = None,
        hub: Optional[MidiHub] = None,
        storage_path: Optional[Path] = None,
    ) -> None:
        self._router = router or get_midi_router()
        self._hub = hub or get_midi_hub()
        self._storage_path = storage_path or _default_presets_path()
        self._presets: Dict[str, MidiHubPreset] = {}
        self._default_preset_id: Optional[str] = None
        self._chains: Dict[str, List[str]] = {}
        self._chain_positions: Dict[str, int] = {}
        self._program_slots: Dict[int, str] = {}
        self._chain_tasks: Dict[str, asyncio.Task[None]] = {}
        self._lock = threading.RLock()

        self._load()

        # Program-change routing for iConnectivity-style preset slot switching.
        self._hub.subscribe("consumer:midi_hub_presets", self._on_hub_message)

        # Best effort startup recall of the configured default preset.
        default_snapshot = None
        if self._default_preset_id:
            default_preset = self._presets.get(self._default_preset_id)
            if default_preset is not None:
                default_snapshot = dict(default_preset.snapshot)
        if default_snapshot:
            self._apply_snapshot_sync(default_snapshot)

    def list_presets(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = [
                {
                    "preset_id": preset.preset_id,
                    "name": preset.name,
                    "description": preset.description,
                    "created_at": preset.created_at,
                    "updated_at": preset.updated_at,
                    "conditions": dict(preset.conditions),
                }
                for preset in sorted(self._presets.values(), key=lambda row: row.updated_at, reverse=True)
            ]
        return rows

    def get_preset(self, preset_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            preset = self._presets.get(preset_id)
            return preset.to_dict() if preset else None

    async def save_preset(
        self,
        *,
        preset_id: str,
        name: str,
        description: str = "",
        conditions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = time.time()
        with self._lock:
            existing = self._presets.get(preset_id)
        snapshot = await self._build_snapshot()
        preset = MidiHubPreset(
            preset_id=preset_id,
            name=name,
            description=description,
            created_at=existing.created_at if existing else now,
            updated_at=now,
            snapshot=snapshot,
            conditions=dict(conditions or (existing.conditions if existing else {})),
        )
        with self._lock:
            self._presets[preset_id] = preset
        self._persist()
        return preset.to_dict()

    async def recall_preset(self, preset_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            preset = self._presets.get(preset_id)
        if preset is None:
            return None
        await self._apply_snapshot(preset.snapshot)
        return preset.to_dict()

    def delete_preset(self, preset_id: str) -> bool:
        with self._lock:
            removed = self._presets.pop(preset_id, None) is not None
            if not removed:
                return False
            if self._default_preset_id == preset_id:
                self._default_preset_id = None
            for chain_id, preset_ids in list(self._chains.items()):
                self._chains[chain_id] = [pid for pid in preset_ids if pid != preset_id]
            for program, target in list(self._program_slots.items()):
                if target == preset_id:
                    self._program_slots.pop(program, None)
        self._persist()
        return True

    def compare_presets(self, left_id: str, right_id: str) -> Dict[str, Any]:
        with self._lock:
            left = self._presets.get(left_id)
            right = self._presets.get(right_id)
        if left is None or right is None:
            raise ValueError("both presets must exist")

        left_snapshot = dict(left.snapshot or {})
        right_snapshot = dict(right.snapshot or {})
        left_routes = {row["route_id"]: row for row in left_snapshot.get("routes", []) if row.get("route_id")}
        right_routes = {row["route_id"]: row for row in right_snapshot.get("routes", []) if row.get("route_id")}
        left_virtual = {row["port_id"]: row for row in left_snapshot.get("virtual_ports", []) if row.get("port_id")}
        right_virtual = {row["port_id"]: row for row in right_snapshot.get("virtual_ports", []) if row.get("port_id")}

        added_routes = sorted(set(right_routes.keys()) - set(left_routes.keys()))
        removed_routes = sorted(set(left_routes.keys()) - set(right_routes.keys()))
        changed_routes = sorted(
            route_id
            for route_id in (set(left_routes.keys()) & set(right_routes.keys()))
            if left_routes[route_id] != right_routes[route_id]
        )
        added_virtual_ports = sorted(set(right_virtual.keys()) - set(left_virtual.keys()))
        removed_virtual_ports = sorted(set(left_virtual.keys()) - set(right_virtual.keys()))
        changed_virtual_ports = sorted(
            port_id
            for port_id in (set(left_virtual.keys()) & set(right_virtual.keys()))
            if left_virtual[port_id] != right_virtual[port_id]
        )
        return {
            "left_preset_id": left_id,
            "right_preset_id": right_id,
            "routes": {
                "added": added_routes,
                "removed": removed_routes,
                "changed": changed_routes,
            },
            "virtual_ports": {
                "added": added_virtual_ports,
                "removed": removed_virtual_ports,
                "changed": changed_virtual_ports,
            },
        }

    def export_preset(self, preset_id: str, export_path: Optional[str] = None) -> Dict[str, Any]:
        with self._lock:
            preset = self._presets.get(preset_id)
        if preset is None:
            raise ValueError("preset not found")
        now = int(time.time())
        target = Path(export_path).expanduser() if export_path else Path(
            f"~/.map2/midi_hub_presets/exports/{preset_id}-{now}.json"
        ).expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(preset.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
        return {"ok": True, "preset_id": preset_id, "path": str(target)}

    def import_preset(self, file_path: str) -> Dict[str, Any]:
        path = Path(file_path).expanduser()
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("invalid preset payload")
        preset = MidiHubPreset(
            preset_id=str(payload.get("preset_id") or path.stem),
            name=str(payload.get("name") or path.stem),
            description=str(payload.get("description") or ""),
            created_at=float(payload.get("created_at") or time.time()),
            updated_at=float(payload.get("updated_at") or time.time()),
            snapshot=dict(payload.get("snapshot") or {}),
            conditions=dict(payload.get("conditions") or {}),
        )
        with self._lock:
            self._presets[preset.preset_id] = preset
        self._persist()
        return preset.to_dict()

    def set_default_preset(self, preset_id: Optional[str]) -> Dict[str, Any]:
        with self._lock:
            if preset_id is not None and preset_id not in self._presets:
                raise ValueError("preset not found")
            self._default_preset_id = preset_id
        self._persist()
        return {"default_preset_id": self._default_preset_id}

    def get_default_preset(self) -> Dict[str, Any]:
        with self._lock:
            default_id = self._default_preset_id
            return {
                "default_preset_id": default_id,
                "preset": self.get_preset(default_id) if default_id else None,
            }

    async def recall_default_preset(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            default_id = self._default_preset_id
        if not default_id:
            return None
        return await self.recall_preset(default_id)

    def set_chain(self, chain_id: str, preset_ids: List[str]) -> Dict[str, Any]:
        with self._lock:
            normalized = [pid for pid in preset_ids if pid in self._presets]
            self._chains[str(chain_id)] = normalized
            if chain_id not in self._chain_positions:
                self._chain_positions[chain_id] = 0
        self._persist()
        return {"chain_id": chain_id, "preset_ids": normalized}

    def get_chains(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "count": len(self._chains),
                "chains": dict(self._chains),
                "program_slots": {str(k): v for k, v in self._program_slots.items()},
            }

    async def recall_chain_step(self, chain_id: str, step_index: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            chain = self._chains.get(chain_id) or []
        if not chain:
            return None
        index = max(0, min(len(chain) - 1, int(step_index)))
        with self._lock:
            self._chain_positions[chain_id] = index
        return await self.recall_preset(chain[index])

    async def recall_chain_next(self, chain_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            chain = self._chains.get(chain_id) or []
            if not chain:
                return None
            position = int(self._chain_positions.get(chain_id, 0))
            index = position % len(chain)
            self._chain_positions[chain_id] = (position + 1) % len(chain)
            preset_id = chain[index]
        return await self.recall_preset(preset_id)

    def set_program_slot(self, program_number: int, target_id: str) -> Dict[str, Any]:
        program = int(program_number)
        if program < 0 or program > 127:
            raise ValueError("program_number must be between 0 and 127")
        target = str(target_id).strip()
        with self._lock:
            if target.startswith("chain:"):
                chain_id = target.split(":", 1)[1].strip()
                if not chain_id or chain_id not in self._chains:
                    raise ValueError("chain target does not exist")
            else:
                if target not in self._presets:
                    raise ValueError("preset target does not exist")
            self._program_slots[program] = target
        self._persist()
        return {"program_number": program, "target_id": target}

    def delete_program_slot(self, program_number: int) -> bool:
        program = int(program_number)
        with self._lock:
            removed = self._program_slots.pop(program, None) is not None
        if removed:
            self._persist()
        return removed

    def get_program_slots(self) -> Dict[str, Any]:
        with self._lock:
            return {"slots": {str(program): target for program, target in sorted(self._program_slots.items())}}

    async def run_chain_timer(
        self,
        *,
        chain_id: str,
        interval_ms: int,
        cycles: Optional[int] = None,
        start_immediately: bool = True,
    ) -> Dict[str, Any]:
        with self._lock:
            chain = list(self._chains.get(chain_id) or [])
        if not chain:
            raise ValueError("chain not found")
        delay_s = max(0.025, float(interval_ms) / 1000.0)

        await self.stop_chain_timer(chain_id)

        async def _runner() -> None:
            completed = 0
            if start_immediately:
                await self.recall_chain_next(chain_id)
            while True:
                if cycles is not None and completed >= max(0, int(cycles) - (1 if start_immediately else 0)):
                    break
                await asyncio.sleep(delay_s)
                await self.recall_chain_next(chain_id)
                completed += 1

        task = asyncio.create_task(_runner(), name=f"midi_hub_chain_{chain_id}")
        with self._lock:
            self._chain_tasks[chain_id] = task

        def _clear_task(_: asyncio.Task[None]) -> None:
            with self._lock:
                existing = self._chain_tasks.get(chain_id)
                if existing is task:
                    self._chain_tasks.pop(chain_id, None)

        task.add_done_callback(_clear_task)
        return {
            "chain_id": chain_id,
            "running": True,
            "interval_ms": int(interval_ms),
            "cycles": cycles,
            "start_immediately": bool(start_immediately),
        }

    async def stop_chain_timer(self, chain_id: str) -> Dict[str, Any]:
        with self._lock:
            task = self._chain_tasks.pop(chain_id, None)
        if task is None:
            return {"chain_id": chain_id, "running": False}
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return {"chain_id": chain_id, "running": False}

    async def evaluate_context_conditions(self, context: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            presets = list(self._presets.values())
        recalled: List[str] = []
        for preset in presets:
            if not preset.conditions:
                continue
            if _conditions_match(preset.conditions, context):
                await self.recall_preset(preset.preset_id)
                recalled.append(preset.preset_id)
        return {"count": len(recalled), "recalled_preset_ids": recalled}

    async def _build_snapshot(self) -> Dict[str, Any]:
        virtual_ports = []
        for port in self._hub.list_ports():
            if port.kind != "virtual":
                continue
            virtual_ports.append(
                {
                    "port_id": port.port_id,
                    "name": port.name,
                    "direction": port.direction,
                }
            )

        snapshot: Dict[str, Any] = {
            "routes": self._router.list_routes(),
            "match_mode": self._router.get_match_mode(),
            "virtual_ports": virtual_ports,
            "program_slots": {str(k): v for k, v in self._program_slots.items()},
            "chains": {chain_id: list(items) for chain_id, items in self._chains.items()},
        }

        try:
            from app.services.midi_hub.gateway import get_midi_gateway_manager

            snapshot["gateways"] = get_midi_gateway_manager().list_gateways()
        except Exception:
            snapshot["gateways"] = []

        try:
            from app.services.midi_hub.device_registry import get_midi_device_registry

            registry = get_midi_device_registry()
            await registry.refresh()
            snapshot["device_assignments"] = dict((registry.snapshot() or {}).get("assignments", {}))
        except Exception:
            snapshot["device_assignments"] = {}

        return snapshot

    async def _apply_snapshot(self, snapshot: Dict[str, Any]) -> None:
        self._apply_snapshot_sync(snapshot)
        await self._restore_device_assignments(snapshot)

    def _apply_snapshot_sync(self, snapshot: Dict[str, Any]) -> None:
        for virtual in snapshot.get("virtual_ports", []):
            if not isinstance(virtual, dict):
                continue
            port_id = str(virtual.get("port_id") or "").strip()
            if not port_id:
                continue
            if self._hub.get_port(port_id) is not None:
                continue
            direction = str(virtual.get("direction") or "duplex").strip().lower()
            if direction not in {"input", "output", "duplex"}:
                direction = "duplex"
            name = str(virtual.get("name") or port_id).strip() or port_id
            self._hub.register_port(
                VirtualMidiPort(port_id=port_id, name=name, direction=direction),
            )

        match_mode = snapshot.get("match_mode")
        routes = [dict(route) for route in (snapshot.get("routes") or []) if isinstance(route, dict)]
        try:
            self._router.replace_routes(routes, match_mode=match_mode)
        except AttributeError:
            # Backward compatibility with older router implementations.
            self._router.set_match_mode(match_mode or "all_match")
            for route in self._router.list_routes():
                self._router.delete_route(route["route_id"])
            for route in routes:
                self._router.add_route(route)

        with self._lock:
            self._program_slots = {
                int(key): str(value)
                for key, value in (snapshot.get("program_slots") or {}).items()
                if str(key).isdigit()
            }

        gateways = [dict(item) for item in (snapshot.get("gateways") or []) if isinstance(item, dict)]
        if gateways:
            try:
                from app.services.midi_hub.gateway import get_midi_gateway_manager

                manager = get_midi_gateway_manager()
                desired_ids = {str(item.get("gateway_id")) for item in gateways if item.get("gateway_id")}
                for existing in manager.list_gateways():
                    gateway_id = str(existing.get("gateway_id") or "")
                    if gateway_id and gateway_id not in desired_ids:
                        manager.remove_gateway(gateway_id)
                for item in gateways:
                    gateway_id = str(item.get("gateway_id") or "").strip()
                    in_port_id = str(item.get("in_port_id") or "").strip()
                    out_port_id = str(item.get("out_port_id") or "").strip()
                    if not gateway_id or not in_port_id or not out_port_id:
                        continue
                    manager.create_gateway(
                        gateway_id=gateway_id,
                        in_port_id=in_port_id,
                        out_port_id=out_port_id,
                        bridge_adapter=item.get("bridge_adapter"),
                        metadata=dict(item.get("metadata") or {}),
                        auto_start=True,
                    )
            except Exception:
                pass

    async def _restore_device_assignments(self, snapshot: Dict[str, Any]) -> None:
        assignments = dict(snapshot.get("device_assignments") or {})
        if not assignments:
            return
        try:
            from app.services.midi_hub.device_registry import get_midi_device_registry

            registry = get_midi_device_registry()
            for port_name, device_id in assignments.items():
                try:
                    await registry.assign_port(port_name=str(port_name), device_id=str(device_id))
                except Exception:
                    continue
        except Exception:
            return

    def _resolve_program_target(self, program_number: int) -> Optional[str]:
        with self._lock:
            return self._program_slots.get(int(program_number))

    def _on_hub_message(self, message: MidiMessage) -> None:
        if not message.data:
            return
        status = int(message.data[0])
        if (status & 0xF0) != 0xC0:
            return
        if len(message.data) < 2:
            return
        program_number = int(message.data[1]) & 0x7F
        target = self._resolve_program_target(program_number)
        if not target:
            return

        if target.startswith("chain:"):
            chain_id = target.split(":", 1)[1].strip()
            if not chain_id:
                return
            self._schedule_coroutine(self.recall_chain_next(chain_id))
            return

        self._schedule_coroutine(self.recall_preset(target))

    @staticmethod
    def _schedule_coroutine(coro: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            thread = threading.Thread(target=lambda: asyncio.run(coro), daemon=True)
            thread.start()
            return
        loop.create_task(coro)

    def _load(self) -> None:
        if not self._storage_path.exists():
            return
        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except Exception:
            return

        presets = payload.get("presets") or {}
        with self._lock:
            self._default_preset_id = payload.get("default_preset_id")
            self._chains = {
                str(chain_id): [str(preset_id) for preset_id in preset_ids if isinstance(preset_id, str)]
                for chain_id, preset_ids in (payload.get("chains") or {}).items()
                if isinstance(preset_ids, list)
            }
            self._program_slots = {
                int(key): str(value)
                for key, value in (payload.get("program_slots") or {}).items()
                if str(key).isdigit()
            }
            loaded: Dict[str, MidiHubPreset] = {}
            for preset_id, item in presets.items():
                if not isinstance(item, dict):
                    continue
                try:
                    loaded[str(preset_id)] = MidiHubPreset(
                        preset_id=str(item.get("preset_id") or preset_id),
                        name=str(item.get("name") or preset_id),
                        description=str(item.get("description") or ""),
                        created_at=float(item.get("created_at") or time.time()),
                        updated_at=float(item.get("updated_at") or time.time()),
                        snapshot=dict(item.get("snapshot") or {}),
                        conditions=dict(item.get("conditions") or {}),
                    )
                except Exception:
                    continue
            self._presets = loaded

    def _persist(self) -> None:
        with self._lock:
            payload = {
                "default_preset_id": self._default_preset_id,
                "chains": self._chains,
                "program_slots": {str(k): v for k, v in self._program_slots.items()},
                "presets": {preset_id: preset.to_dict() for preset_id, preset in self._presets.items()},
            }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._storage_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp_path.replace(self._storage_path)


def _conditions_match(conditions: Dict[str, Any], context: Dict[str, Any]) -> bool:
    for key, expected in conditions.items():
        if context.get(key) != expected:
            return False
    return True


_midi_hub_preset_service_singleton: Optional[MidiHubPresetService] = None


def get_midi_hub_preset_service() -> MidiHubPresetService:
    global _midi_hub_preset_service_singleton
    if _midi_hub_preset_service_singleton is None:
        _midi_hub_preset_service_singleton = MidiHubPresetService()
    return _midi_hub_preset_service_singleton
