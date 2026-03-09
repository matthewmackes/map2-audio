"""MIDI 2.0 readiness layer (MIDI-CI, Property Exchange, UMP helpers)."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Midi2DeviceState:
    device_id: str
    protocol: str = "midi1"
    profiles: Dict[str, bool] = field(default_factory=dict)
    properties: Dict[str, Any] = field(default_factory=dict)
    last_discovery_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "protocol": self.protocol,
            "profiles": dict(self.profiles),
            "properties": dict(self.properties),
            "last_discovery_at": self.last_discovery_at,
        }


class Midi2Manager:
    def __init__(self, enabled: Optional[bool] = None) -> None:
        self._enabled = bool(enabled) if enabled is not None else self._read_enabled_default()
        self._devices: Dict[str, Midi2DeviceState] = {}
        self._default_protocol = "midi1"

    def status(self) -> Dict[str, Any]:
        return {
            "enabled": self._enabled,
            "default_protocol": self._default_protocol,
            "device_count": len(self._devices),
            "devices": [row.to_dict() for row in self._devices.values()],
        }

    def set_enabled(self, enabled: bool) -> Dict[str, Any]:
        self._enabled = bool(enabled)
        return self.status()

    def set_default_protocol(self, protocol: str) -> Dict[str, Any]:
        mode = str(protocol).strip().lower()
        self._default_protocol = "midi2" if mode == "midi2" else "midi1"
        return self.status()

    def discover(self, device_id: str) -> Dict[str, Any]:
        row = self._devices.setdefault(device_id, Midi2DeviceState(device_id=device_id))
        row.protocol = self._default_protocol
        row.last_discovery_at = time.time()
        return {
            "ok": True,
            "device": row.to_dict(),
            "discovery_sysex": self.build_discovery_sysex(device_id),
        }

    def enable_profile(self, device_id: str, profile_id: str, enabled: bool = True) -> Dict[str, Any]:
        row = self._devices.setdefault(device_id, Midi2DeviceState(device_id=device_id))
        row.profiles[str(profile_id)] = bool(enabled)
        return row.to_dict()

    def get_property(self, device_id: str, key: str, default: Any = None) -> Any:
        row = self._devices.setdefault(device_id, Midi2DeviceState(device_id=device_id))
        return row.properties.get(key, default)

    def set_property(self, device_id: str, key: str, value: Any) -> Dict[str, Any]:
        row = self._devices.setdefault(device_id, Midi2DeviceState(device_id=device_id))
        row.properties[str(key)] = value
        return row.to_dict()

    def build_discovery_sysex(self, device_id: str) -> List[int]:
        # MIDI-CI Discovery Request (simplified placeholder)
        payload = [0xF0, 0x7E, 0x7F, 0x0D, 0x70]
        payload.extend(int(ord(ch)) & 0x7F for ch in str(device_id)[:16])
        payload.append(0xF7)
        return payload

    def midi1_to_ump(self, data: bytes) -> List[int]:
        """Wrap a MIDI 1.0 message into a UMP-like 32-bit word list."""
        if not data:
            return []
        status = int(data[0])
        data1 = int(data[1]) if len(data) > 1 else 0
        data2 = int(data[2]) if len(data) > 2 else 0
        # Type 2 channel voice (placeholder encoding)
        word = ((0x2 & 0xF) << 28) | ((status & 0xFF) << 16) | ((data1 & 0xFF) << 8) | (data2 & 0xFF)
        return [word]

    def ump_to_midi1(self, words: List[int]) -> bytes:
        if not words:
            return b""
        word = int(words[0])
        status = (word >> 16) & 0xFF
        data1 = (word >> 8) & 0xFF
        data2 = word & 0xFF
        if status & 0xF0 in {0xC0, 0xD0}:
            return bytes([status, data1])
        return bytes([status, data1, data2])

    @staticmethod
    def _read_enabled_default() -> bool:
        try:
            from app.config import get_config

            return bool(get_config().get("midi.midi2_enabled", False))
        except Exception:
            return False


_midi2_manager_singleton: Optional[Midi2Manager] = None


def get_midi2_manager() -> Midi2Manager:
    global _midi2_manager_singleton
    if _midi2_manager_singleton is None:
        _midi2_manager_singleton = Midi2Manager()
    return _midi2_manager_singleton
