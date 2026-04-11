"""In-memory Tesira Text Protocol client facade for MIDI Hub workflows."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class TesiraSubscription:
    token: str
    instance_tag: str
    attribute: str
    created_at: float = field(default_factory=time.time)
    last_value: Any = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "token": self.token,
            "instance_tag": self.instance_tag,
            "attribute": self.attribute,
            "created_at": self.created_at,
            "last_value": self.last_value,
        }


@dataclass
class TesiraCommandRecord:
    command: str
    response: str
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {"command": self.command, "response": self.response, "timestamp": self.timestamp}


class TesiraClient:
    def __init__(self) -> None:
        self._connected = False
        self._host = ""
        self._port = 23
        self._secured = False
        self._username = ""
        self._auto_reconnect = True
        self._connected_at: Optional[float] = None
        self._last_error: Optional[str] = None
        self._command_history: List[TesiraCommandRecord] = []
        self._subscriptions: Dict[str, TesiraSubscription] = {}
        self._device_info: Dict[str, Any] = {
            "hostname": "tesira-stage-rack",
            "model": "TesiraFORTE X 800",
            "firmware": "4.8.1",
            "audio_running": True,
            "sleeping": False,
        }
        self._aliases: Dict[str, Dict[str, Any]] = {
            "Level1": {"block_type": "Level", "level": -10.0, "mute": False, "label": "Lobby music"},
            "Level2": {"block_type": "Level", "level": -4.5, "mute": False, "label": "Program bus"},
            "MatrixMixer1": {
                "block_type": "MatrixMixer",
                "crosspoints": [
                    {"input": 1, "output": 1, "level": -3.0, "mute": False},
                    {"input": 1, "output": 2, "level": -12.0, "mute": False},
                    {"input": 2, "output": 1, "level": -9.0, "mute": True},
                ],
            },
            "SourceSelector1": {"block_type": "SourceSelector", "selection": 2},
            "Meter1": {"block_type": "Meter", "peak_db": -18.3},
        }
        self._presets: List[Dict[str, Any]] = [
            {"preset_id": 1001, "name": "Speech mode", "active": True},
            {"preset_id": 1002, "name": "Playback mode", "active": False},
        ]

    def status(self) -> Dict[str, Any]:
        return {
            "connected": self._connected,
            "host": self._host,
            "port": self._port,
            "secured": self._secured,
            "username": self._username,
            "auto_reconnect": self._auto_reconnect,
            "connected_at": self._connected_at,
            "last_error": self._last_error,
            "aliases": self.aliases(),
            "subscriptions": self.list_subscriptions(),
            "history": [row.to_dict() for row in self._command_history[-20:]],
            "device_info": dict(self._device_info),
            "presets": [dict(row) for row in self._presets],
            "matrix": self.matrix_status(),
        }

    def aliases(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for instance_tag, payload in self._aliases.items():
            rows.append({"instance_tag": instance_tag, **payload})
        return rows

    def list_subscriptions(self) -> List[Dict[str, Any]]:
        return [row.to_dict() for row in self._subscriptions.values()]

    def connect(
        self,
        *,
        host: str,
        port: int = 23,
        username: str = "",
        password: str = "",
        secured: bool = False,
        auto_reconnect: bool = True,
    ) -> Dict[str, Any]:
        del password
        self._host = str(host).strip()
        self._port = int(port)
        self._username = str(username).strip()
        self._secured = bool(secured)
        self._auto_reconnect = bool(auto_reconnect)
        self._connected = bool(self._host)
        self._connected_at = time.time() if self._connected else None
        self._last_error = None if self._connected else "missing_host"
        return self.status()

    def disconnect(self) -> Dict[str, Any]:
        self._connected = False
        self._connected_at = None
        return self.status()

    def matrix_status(self) -> List[Dict[str, Any]]:
        crosspoints = self._aliases.get("MatrixMixer1", {}).get("crosspoints", [])
        return [dict(row) for row in crosspoints]

    def set_level(self, instance_tag: str, level: float) -> Dict[str, Any]:
        block = self._aliases.setdefault(instance_tag, {"block_type": "Level", "level": 0.0, "mute": False})
        block["level"] = round(float(level), 1)
        return {"ok": True, "instance_tag": instance_tag, "attribute": "level", "value": block["level"]}

    def set_mute(self, instance_tag: str, muted: bool) -> Dict[str, Any]:
        block = self._aliases.setdefault(instance_tag, {"block_type": "Level", "level": 0.0, "mute": False})
        block["mute"] = bool(muted)
        return {"ok": True, "instance_tag": instance_tag, "attribute": "mute", "value": block["mute"]}

    def recall_preset(self, preset_id: int) -> Dict[str, Any]:
        target = None
        for preset in self._presets:
            preset["active"] = int(preset["preset_id"]) == int(preset_id)
            if preset["active"]:
                target = preset
        if target is None:
            target = {"preset_id": int(preset_id), "name": f"Preset {preset_id}", "active": True}
            self._presets.append(target)
        return {"ok": True, "preset": dict(target), "presets": [dict(row) for row in self._presets]}

    def save_preset(self, preset_id: int, name: Optional[str] = None) -> Dict[str, Any]:
        for preset in self._presets:
            if int(preset["preset_id"]) == int(preset_id):
                preset["name"] = name or preset.get("name") or f"Preset {preset_id}"
                return {"ok": True, "preset": dict(preset)}
        preset = {"preset_id": int(preset_id), "name": name or f"Preset {preset_id}", "active": False}
        self._presets.append(preset)
        return {"ok": True, "preset": dict(preset)}

    def subscribe(self, instance_tag: str, attribute: str) -> Dict[str, Any]:
        token = f"{instance_tag}:{attribute}:{len(self._subscriptions) + 1}"
        value = self._read_attribute(instance_tag, attribute)
        row = TesiraSubscription(token=token, instance_tag=instance_tag, attribute=attribute, last_value=value)
        self._subscriptions[token] = row
        return {"ok": True, "subscription": row.to_dict()}

    def unsubscribe(self, token: str) -> Dict[str, Any]:
        return {"ok": self._subscriptions.pop(token, None) is not None}

    def _read_attribute(self, instance_tag: str, attribute: str, index: Optional[int] = None) -> Any:
        block = self._aliases.get(instance_tag)
        if block is None:
            raise KeyError("unknown_instance_tag")
        attr = str(attribute).strip().lower()
        if attr == "mute":
            return bool(block.get("mute", False))
        if attr == "level":
            return float(block.get("level", 0.0))
        if attr == "selection":
            return int(block.get("selection", 1))
        if attr == "peak_db":
            return float(block.get("peak_db", -99.0))
        if attr == "crosspointlevel":
            crosspoints = block.get("crosspoints", [])
            idx = max(0, int(index or 1) - 1)
            return crosspoints[idx]["level"] if idx < len(crosspoints) else 0.0
        if attr == "crosspointmute":
            crosspoints = block.get("crosspoints", [])
            idx = max(0, int(index or 1) - 1)
            return bool(crosspoints[idx]["mute"]) if idx < len(crosspoints) else False
        return block.get(attr)

    def _write_attribute(self, instance_tag: str, attribute: str, value: Any, index: Optional[int] = None) -> Any:
        block = self._aliases.setdefault(instance_tag, {"block_type": "Level", "level": 0.0, "mute": False})
        attr = str(attribute).strip().lower()
        if attr == "mute":
            block["mute"] = str(value).strip().lower() in {"1", "true", "on", "yes"}
            return block["mute"]
        if attr == "level":
            block["level"] = round(float(value), 1)
            return block["level"]
        if attr == "selection":
            block["selection"] = int(value)
            return block["selection"]
        if attr in {"crosspointlevel", "crosspointmute"}:
            crosspoints = block.setdefault("crosspoints", [])
            idx = max(0, int(index or 1) - 1)
            while idx >= len(crosspoints):
                crosspoints.append({"input": len(crosspoints) + 1, "output": 1, "level": 0.0, "mute": False})
            if attr == "crosspointlevel":
                crosspoints[idx]["level"] = round(float(value), 1)
                return crosspoints[idx]["level"]
            crosspoints[idx]["mute"] = str(value).strip().lower() in {"1", "true", "on", "yes"}
            return crosspoints[idx]["mute"]
        block[attr] = value
        return block[attr]

    def _record(self, command: str, response: str) -> Dict[str, Any]:
        row = TesiraCommandRecord(command=command, response=response)
        self._command_history.append(row)
        return row.to_dict()

    def send_command(self, command: str) -> Dict[str, Any]:
        raw = str(command).strip()
        if not raw:
            return {"ok": False, "response": "-ERR empty"}

        parts = raw.split()
        response = "-ERR unsupported"
        payload: Dict[str, Any] = {"ok": False}

        try:
            if parts[:3] == ["SESSION", "get", "aliases"]:
                alias_names = " ".join(sorted(self._aliases.keys()))
                response = f'+OK "aliases":"{alias_names}"'
                payload = {"ok": True, "aliases": self.aliases()}
            elif parts[:3] == ["DEVICE", "get", "deviceInfo"]:
                response = f'+OK "value":"{self._device_info["model"]}"'
                payload = {"ok": True, "device_info": dict(self._device_info)}
            elif len(parts) >= 3 and parts[0] == "DEVICE" and parts[1] == "recallPreset":
                payload = self.recall_preset(int(parts[2]))
                response = f'+OK "preset":{payload["preset"]["preset_id"]}'
            elif len(parts) >= 3 and parts[0] == "DEVICE" and parts[1] == "savePreset":
                payload = self.save_preset(int(parts[2]))
                response = f'+OK "preset":{payload["preset"]["preset_id"]}'
            elif len(parts) >= 2 and parts[0] == "DEVICE" and parts[1] in {"reboot", "sleep", "wake", "startAudio", "stopAudio"}:
                action = parts[1]
                if action == "sleep":
                    self._device_info["sleeping"] = True
                elif action == "wake":
                    self._device_info["sleeping"] = False
                elif action == "startAudio":
                    self._device_info["audio_running"] = True
                elif action == "stopAudio":
                    self._device_info["audio_running"] = False
                response = f'+OK "action":"{action}"'
                payload = {"ok": True, "device_info": dict(self._device_info), "action": action}
            elif len(parts) >= 3:
                instance_tag = parts[0]
                operation = parts[1].lower()
                attribute = parts[2]
                index: Optional[int] = None
                value: Any = None
                if operation == "get":
                    if len(parts) >= 4 and parts[3].isdigit():
                        index = int(parts[3])
                    read_value = self._read_attribute(instance_tag, attribute, index=index)
                    response = f'+OK "value":{read_value}'
                    payload = {"ok": True, "instance_tag": instance_tag, "attribute": attribute, "value": read_value}
                elif operation == "set":
                    cursor = 3
                    if len(parts) >= 5 and parts[3].isdigit():
                        index = int(parts[3])
                        cursor = 4
                    value = " ".join(parts[cursor:])
                    written = self._write_attribute(instance_tag, attribute, value, index=index)
                    response = f'+OK "value":{written}'
                    payload = {"ok": True, "instance_tag": instance_tag, "attribute": attribute, "value": written}
                elif operation == "toggle":
                    written = self._write_attribute(instance_tag, attribute, not bool(self._read_attribute(instance_tag, attribute)))
                    response = f'+OK "value":{written}'
                    payload = {"ok": True, "instance_tag": instance_tag, "attribute": attribute, "value": written}
                elif operation == "subscribe":
                    payload = self.subscribe(instance_tag, attribute)
                    response = f'+OK "publishToken":"{payload["subscription"]["token"]}"'
            if payload.get("ok"):
                self._last_error = None
            else:
                self._last_error = response
        except Exception as exc:
            response = f"-ERR {exc}"
            payload = {"ok": False, "error": str(exc)}
            self._last_error = str(exc)

        record = self._record(raw, response)
        return {"response": response, "record": record, **payload}


_tesira_client_singleton: Optional[TesiraClient] = None
_tesira_client_singleton_lock = threading.Lock()


def get_tesira_client() -> TesiraClient:
    global _tesira_client_singleton
    if _tesira_client_singleton is None:
        with _tesira_client_singleton_lock:
            if _tesira_client_singleton is None:
                _tesira_client_singleton = TesiraClient()
    return _tesira_client_singleton
