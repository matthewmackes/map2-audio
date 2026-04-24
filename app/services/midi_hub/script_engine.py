"""MIDI Hub automation scripting engine with restricted execution sandbox."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.paths import Map2Paths
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.router import MidiRouter, get_midi_router


SAFE_BUILTINS: Dict[str, Any] = {
    "__build_class__": __build_class__,
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "Exception": Exception,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "pow": pow,
    "range": range,
    "reversed": reversed,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "type": type,
    "zip": zip,
}


def _default_scripts_path() -> Path:
    return Map2Paths.midi_scripts_registry_path()


def _default_state_path() -> Path:
    return Map2Paths.midi_scripts_state_path()


@dataclass
class MidiScript:
    script_id: str
    name: str
    code: str
    enabled: bool
    created_at: float
    updated_at: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "script_id": self.script_id,
            "name": self.name,
            "code": self.code,
            "enabled": self.enabled,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class _ScriptLogBridge:
    def __init__(self, append: Callable[[str], None]) -> None:
        self._append = append

    def info(self, message: Any) -> None:
        self._append(f"INFO {message}")

    def warn(self, message: Any) -> None:
        self._append(f"WARN {message}")

    def error(self, message: Any) -> None:
        self._append(f"ERROR {message}")


class _ScriptStateBridge:
    def __init__(self, engine: "MidiScriptEngine") -> None:
        self._engine = engine

    def get(self, key: str, default: Any = None) -> Any:
        return self._engine.get_state_value(key, default)

    def set(self, key: str, value: Any) -> None:
        self._engine.set_state_value(key, value)


class _ScriptHubBridge:
    def __init__(self, router: MidiRouter) -> None:
        self._router = router

    def get_route(self, route_id: str) -> Optional[Dict[str, Any]]:
        return self._router.get_route(route_id)

    def enable_route(self, route_id: str) -> bool:
        return self._router.set_route_enabled(route_id, True) is not None

    def disable_route(self, route_id: str) -> bool:
        return self._router.set_route_enabled(route_id, False) is not None


class _ScriptMidiBridge:
    def __init__(self, hub: MidiHub, source_port: str = "script") -> None:
        self._hub = hub
        self._source_port = source_port

    def send(self, destination_port: str, message: Any) -> bool:
        data = self._normalize_message(message)
        if data is None:
            return False
        return self._hub.send(source_port=self._source_port, destination_port=destination_port, data=data)

    def cc(self, destination_port: str, channel: int, cc: int, value: int) -> bool:
        data = bytes([0xB0 | ((int(channel) - 1) & 0x0F), int(cc) & 0x7F, int(value) & 0x7F])
        return self.send(destination_port, data)

    def pc(self, destination_port: str, channel: int, program: int) -> bool:
        data = bytes([0xC0 | ((int(channel) - 1) & 0x0F), int(program) & 0x7F])
        return self.send(destination_port, data)

    def note_on(self, destination_port: str, channel: int, note: int, velocity: int) -> bool:
        data = bytes([0x90 | ((int(channel) - 1) & 0x0F), int(note) & 0x7F, int(velocity) & 0x7F])
        return self.send(destination_port, data)

    def note_off(self, destination_port: str, channel: int, note: int, velocity: int = 0) -> bool:
        data = bytes([0x80 | ((int(channel) - 1) & 0x0F), int(note) & 0x7F, int(velocity) & 0x7F])
        return self.send(destination_port, data)

    def sysex(self, destination_port: str, payload: Any) -> bool:
        data = self._normalize_message(payload)
        if data is None:
            return False
        if not data or data[0] != 0xF0:
            data = b"\xF0" + data
        if data[-1] != 0xF7:
            data = data + b"\xF7"
        return self.send(destination_port, data)

    @staticmethod
    def _normalize_message(message: Any) -> Optional[bytes]:
        if isinstance(message, bytes):
            return bytes(message)
        if isinstance(message, bytearray):
            return bytes(message)
        if isinstance(message, str):
            cleaned = message.replace(" ", "").replace("0x", "")
            if len(cleaned) % 2 != 0:
                return None
            try:
                return bytes.fromhex(cleaned)
            except Exception:
                return None
        if isinstance(message, list):
            try:
                return bytes(int(v) & 0xFF for v in message)
            except Exception:
                return None
        return None


class _ScriptTimerBridge:
    def __init__(self, engine: "MidiScriptEngine", script_id: str, namespace: Dict[str, Any], append_log: Callable[[str], None]) -> None:
        self._engine = engine
        self._script_id = script_id
        self._namespace = namespace
        self._append = append_log

    def after(self, delay_ms: int, callback: Any) -> str:
        callback_fn = self._resolve_callback(callback)
        timer_id = f"after:{self._script_id}:{time.time_ns()}"

        async def _runner() -> None:
            await asyncio.sleep(max(0.0, float(delay_ms) / 1000.0))
            try:
                result = callback_fn()
                if asyncio.iscoroutine(result):
                    await result
            except Exception as exc:
                self._append(f"ERROR timer after failed: {exc}")

        self._engine._register_timer_task(self._script_id, timer_id, asyncio.create_task(_runner()))
        return timer_id

    def every(self, interval_ms: int, callback: Any) -> str:
        callback_fn = self._resolve_callback(callback)
        timer_id = f"every:{self._script_id}:{time.time_ns()}"

        async def _runner() -> None:
            interval = max(0.01, float(interval_ms) / 1000.0)
            while True:
                await asyncio.sleep(interval)
                try:
                    result = callback_fn()
                    if asyncio.iscoroutine(result):
                        await result
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    self._append(f"ERROR timer every failed: {exc}")

        self._engine._register_timer_task(self._script_id, timer_id, asyncio.create_task(_runner()))
        return timer_id

    def cancel(self, timer_id: str) -> bool:
        return self._engine._cancel_timer(self._script_id, timer_id)

    def _resolve_callback(self, callback: Any) -> Callable[[], Any]:
        if callable(callback):
            return callback
        if isinstance(callback, str):
            found = self._namespace.get(callback)
            if callable(found):
                return found
        raise ValueError("callback must be callable or function name")


class MidiScriptEngine:
    """Script library with sandboxed trigger execution and timer controls."""

    def __init__(
        self,
        *,
        hub: Optional[MidiHub] = None,
        router: Optional[MidiRouter] = None,
        scripts_path: Optional[Path] = None,
        state_path: Optional[Path] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._router = router or get_midi_router()
        self._scripts_path = scripts_path or _default_scripts_path()
        self._state_path = state_path or _default_state_path()
        self._scripts: Dict[str, MidiScript] = {}
        self._console: Dict[str, List[str]] = {}
        self._state: Dict[str, Any] = {}
        self._timer_tasks: Dict[str, Dict[str, asyncio.Task]] = {}
        self._load()

    def list_scripts(self) -> List[Dict[str, Any]]:
        return [script.to_dict() for script in sorted(self._scripts.values(), key=lambda row: row.updated_at, reverse=True)]

    def get_script(self, script_id: str) -> Optional[Dict[str, Any]]:
        script = self._scripts.get(script_id)
        return script.to_dict() if script is not None else None

    def get_console(self, script_id: str, limit: int = 200) -> Dict[str, Any]:
        rows = list(self._console.get(script_id, []))
        if limit > 0:
            rows = rows[-int(limit):]
        return {"script_id": script_id, "count": len(rows), "lines": rows}

    def upsert_script(self, *, script_id: str, name: str, code: str, enabled: bool = True) -> Dict[str, Any]:
        now = time.time()
        existing = self._scripts.get(script_id)
        row = MidiScript(
            script_id=script_id,
            name=name,
            code=code,
            enabled=bool(enabled),
            created_at=existing.created_at if existing else now,
            updated_at=now,
        )
        self._scripts[script_id] = row
        self._persist_scripts()
        return row.to_dict()

    def delete_script(self, script_id: str) -> bool:
        removed = self._scripts.pop(script_id, None) is not None
        if removed:
            self._cancel_all_timers(script_id)
            self._persist_scripts()
        return removed

    def set_enabled(self, script_id: str, enabled: bool) -> Optional[Dict[str, Any]]:
        script = self._scripts.get(script_id)
        if script is None:
            return None
        script.enabled = bool(enabled)
        script.updated_at = time.time()
        self._persist_scripts()
        if not script.enabled:
            self._cancel_all_timers(script_id)
        return script.to_dict()

    async def run_script(self, script_id: str, event: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        script = self._scripts.get(script_id)
        if script is None:
            raise ValueError("script not found")
        if not script.enabled:
            return {"ok": False, "reason": "disabled"}
        return await self._execute_script(script, event or {}, mode="run")

    async def trigger_script(self, script_id: str, event: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        script = self._scripts.get(script_id)
        if script is None:
            raise ValueError("script not found")
        if not script.enabled:
            return {"ok": False, "reason": "disabled"}
        return await self._execute_script(script, event or {}, mode="trigger")

    def stop_script(self, script_id: str) -> bool:
        return self._cancel_all_timers(script_id)

    def get_state_value(self, key: str, default: Any = None) -> Any:
        return self._state.get(key, default)

    def set_state_value(self, key: str, value: Any) -> None:
        self._state[str(key)] = value
        self._persist_state()

    def _append_console(self, script_id: str, line: str) -> None:
        rows = self._console.setdefault(script_id, [])
        rows.append(f"{time.strftime('%H:%M:%S')} {line}")
        if len(rows) > 500:
            del rows[:-500]

    async def _execute_script(self, script: MidiScript, event: Dict[str, Any], *, mode: str) -> Dict[str, Any]:
        self._append_console(script.script_id, f"INFO executing ({mode})")

        namespace: Dict[str, Any] = {
            "__builtins__": SAFE_BUILTINS,
            "event": dict(event),
            "midi": _ScriptMidiBridge(self._hub, source_port=f"script:{script.script_id}"),
            "state": _ScriptStateBridge(self),
            "hub": _ScriptHubBridge(self._router),
        }
        namespace["log"] = _ScriptLogBridge(lambda line: self._append_console(script.script_id, line))
        namespace["timer"] = _ScriptTimerBridge(
            self,
            script.script_id,
            namespace,
            lambda line: self._append_console(script.script_id, line),
        )

        try:
            compiled = compile(script.code, f"midi_script:{script.script_id}", "exec")
            exec(compiled, namespace, namespace)

            if callable(namespace.get("main")):
                result = namespace["main"](dict(event))
                if asyncio.iscoroutine(result):
                    await result
            if callable(namespace.get("handle")):
                result = namespace["handle"](dict(event), namespace)
                if asyncio.iscoroutine(result):
                    await result

            self._append_console(script.script_id, "INFO execution completed")
            return {"ok": True, "script_id": script.script_id}
        except Exception as exc:
            self._append_console(script.script_id, f"ERROR execution failed: {exc}")
            return {"ok": False, "script_id": script.script_id, "error": str(exc)}

    def _register_timer_task(self, script_id: str, timer_id: str, task: asyncio.Task) -> None:
        timers = self._timer_tasks.setdefault(script_id, {})
        timers[timer_id] = task

        def _cleanup(_task: asyncio.Task) -> None:
            script_timers = self._timer_tasks.get(script_id)
            if script_timers is None:
                return
            script_timers.pop(timer_id, None)

        task.add_done_callback(_cleanup)

    def _cancel_timer(self, script_id: str, timer_id: str) -> bool:
        timers = self._timer_tasks.get(script_id)
        if timers is None:
            return False
        task = timers.pop(timer_id, None)
        if task is None:
            return False
        task.cancel()
        return True

    def _cancel_all_timers(self, script_id: str) -> bool:
        timers = self._timer_tasks.pop(script_id, {})
        if not timers:
            return False
        for task in timers.values():
            task.cancel()
        return True

    def _persist_scripts(self) -> None:
        payload = {
            "scripts": {script_id: script.to_dict() for script_id, script in self._scripts.items()},
            "updated_at": time.time(),
        }
        self._scripts_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self._scripts_path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self._scripts_path)

    def _persist_state(self) -> None:
        payload = {
            "state": self._state,
            "updated_at": time.time(),
        }
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self._state_path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self._state_path)

    def _load(self) -> None:
        if self._scripts_path.exists():
            try:
                payload = json.loads(self._scripts_path.read_text(encoding="utf-8"))
                scripts = payload.get("scripts") or {}
                for script_id, raw in scripts.items():
                    if not isinstance(raw, dict):
                        continue
                    row = MidiScript(
                        script_id=str(raw.get("script_id") or script_id),
                        name=str(raw.get("name") or script_id),
                        code=str(raw.get("code") or ""),
                        enabled=bool(raw.get("enabled", True)),
                        created_at=float(raw.get("created_at") or time.time()),
                        updated_at=float(raw.get("updated_at") or time.time()),
                    )
                    self._scripts[row.script_id] = row
            except Exception:
                self._scripts = {}

        if self._state_path.exists():
            try:
                payload = json.loads(self._state_path.read_text(encoding="utf-8"))
                raw_state = payload.get("state")
                if isinstance(raw_state, dict):
                    self._state = raw_state
            except Exception:
                self._state = {}


_midi_script_engine_singleton: Optional[MidiScriptEngine] = None
_midi_script_engine_singleton_lock = threading.Lock()


def get_midi_script_engine() -> MidiScriptEngine:
    global _midi_script_engine_singleton
    if _midi_script_engine_singleton is None:
        with _midi_script_engine_singleton_lock:
            if _midi_script_engine_singleton is None:
                _midi_script_engine_singleton = MidiScriptEngine()
    return _midi_script_engine_singleton
