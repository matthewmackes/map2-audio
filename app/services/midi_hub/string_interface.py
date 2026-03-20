"""UDP-style text command interface for cueing and macro triggers."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class StringCommandLog:
    direction: str
    raw: str
    parsed: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "direction": self.direction,
            "raw": self.raw,
            "parsed": dict(self.parsed),
            "timestamp": self.timestamp,
        }


class StringInterfaceService:
    def __init__(self) -> None:
        self._listen_host = "0.0.0.0"
        self._listen_port = 3037
        self._target_host = "127.0.0.1"
        self._target_port = 3037
        self._enabled = False
        self._logs: List[StringCommandLog] = []

    def status(self) -> Dict[str, Any]:
        return {
            "enabled": self._enabled,
            "listen_host": self._listen_host,
            "listen_port": self._listen_port,
            "target_host": self._target_host,
            "target_port": self._target_port,
            "log_count": len(self._logs),
            "logs": [row.to_dict() for row in self._logs[-40:]],
        }

    def configure(
        self,
        *,
        enabled: Optional[bool] = None,
        listen_host: Optional[str] = None,
        listen_port: Optional[int] = None,
        target_host: Optional[str] = None,
        target_port: Optional[int] = None,
    ) -> Dict[str, Any]:
        if enabled is not None:
            self._enabled = bool(enabled)
        if listen_host is not None:
            self._listen_host = str(listen_host).strip() or self._listen_host
        if listen_port is not None:
            self._listen_port = int(listen_port)
        if target_host is not None:
            self._target_host = str(target_host).strip() or self._target_host
        if target_port is not None:
            self._target_port = int(target_port)
        return self.status()

    def parse_command(self, command: str) -> Dict[str, Any]:
        tokens = [token for token in str(command).strip().split() if token]
        if not tokens:
            return {"action": "noop", "args": []}
        verb = tokens[0].lower()
        action = {
            "go": "cue_go",
            "cue": "cue_go",
            "stop": "stop",
            "resume": "resume",
            "submove": "submove",
            "macro": "macro",
            "preset": "preset",
            "event": "event",
        }.get(verb, "raw")
        return {"action": action, "verb": tokens[0], "args": tokens[1:]}

    def send(self, command: str) -> Dict[str, Any]:
        parsed = self.parse_command(command)
        row = StringCommandLog(direction="outbound", raw=str(command), parsed=parsed)
        self._logs.append(row)
        return {"ok": True, "entry": row.to_dict(), "transport": "udp"}

    def receive(self, command: str) -> Dict[str, Any]:
        parsed = self.parse_command(command)
        row = StringCommandLog(direction="inbound", raw=str(command), parsed=parsed)
        self._logs.append(row)
        return {"ok": True, "entry": row.to_dict()}

    def clear_logs(self) -> Dict[str, Any]:
        count = len(self._logs)
        self._logs.clear()
        return {"ok": True, "cleared": count}


_string_interface_singleton: Optional[StringInterfaceService] = None


def get_string_interface_service() -> StringInterfaceService:
    global _string_interface_singleton
    if _string_interface_singleton is None:
        _string_interface_singleton = StringInterfaceService()
    return _string_interface_singleton
