"""MidiDeviceRegistry for MAP2 Native MIDI Hub."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote, unquote

from sqlalchemy import select

from app.database import MIDIDeviceConfig, get_session
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import discover_alsa_port_descriptors


ASSIGNMENT_PREFIX = "assignment::"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", value.strip().lower()).strip("_")
    return text or "unknown"


def _normalize_vid_pid(vendor_id: Optional[str], product_id: Optional[str]) -> Optional[str]:
    if not vendor_id or not product_id:
        return None
    vendor = vendor_id.strip().lower().replace("0x", "")
    product = product_id.strip().lower().replace("0x", "")
    if not vendor or not product:
        return None
    return f"{vendor}:{product}"


def _encode_assignment(port_name: str, device_id: str) -> str:
    encoded_port = quote(port_name, safe="")
    encoded_device = quote(device_id, safe="")
    return f"{ASSIGNMENT_PREFIX}{encoded_port}::{encoded_device}"


def _decode_assignment(device_name: str) -> Optional[tuple[str, str]]:
    if not device_name.startswith(ASSIGNMENT_PREFIX):
        return None
    payload = device_name[len(ASSIGNMENT_PREFIX):]
    if "::" not in payload:
        return None
    encoded_port, encoded_device = payload.split("::", 1)
    try:
        return unquote(encoded_port), unquote(encoded_device)
    except Exception:
        return None


@dataclass
class MidiDeviceProfile:
    profile_id: str
    name: str
    match_patterns: List[str]
    default_channel: int = 0
    supports_sysex: bool = False
    usb_vid_pid: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MidiDeviceState:
    device_id: str
    profile_id: str
    profile_name: str
    port_ids: List[str]
    port_names: List[str]
    connected: bool
    responding: bool
    health: str
    latency_ms: Optional[float]
    last_seen: str
    vendor_id: Optional[str] = None
    product_id: Optional[str] = None
    manual_assignment: Optional[str] = None
    source: str = "midi_hub"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "profile_id": self.profile_id,
            "profile_name": self.profile_name,
            "port_ids": list(self.port_ids),
            "port_names": list(self.port_names),
            "connected": bool(self.connected),
            "responding": bool(self.responding),
            "health": self.health,
            "latency_ms": self.latency_ms,
            "last_seen": self.last_seen,
            "vendor_id": self.vendor_id,
            "product_id": self.product_id,
            "manual_assignment": self.manual_assignment,
            "source": self.source,
        }


class MidiDeviceRegistry:
    """Tracks logical MIDI devices mapped to hub ports + persisted configs."""

    def __init__(self, hub: Optional[MidiHub] = None) -> None:
        self._hub = hub or get_midi_hub()
        self._builtins: Dict[str, MidiDeviceProfile] = {
            "lexicon_mpx1": MidiDeviceProfile(
                profile_id="lexicon_mpx1",
                name="Lexicon MPX1",
                match_patterns=["mpx1", "lexicon"],
                default_channel=1,
                supports_sysex=True,
                metadata={"vendor": "Lexicon", "device_type": "effects_processor"},
            ),
            "meloaudio_midi_commander": MidiDeviceProfile(
                profile_id="meloaudio_midi_commander",
                name="MeloAudio MIDI Commander",
                match_patterns=["midi commander", "meloaudio"],
                default_channel=1,
                supports_sysex=False,
                metadata={"vendor": "MeloAudio", "device_type": "controller"},
            ),
            "usb_din_adapter": MidiDeviceProfile(
                profile_id="usb_din_adapter",
                name="Generic USB-to-DIN Adapter",
                match_patterns=["usb midi", "um-one", "din"],
                default_channel=0,
                supports_sysex=True,
                metadata={"device_type": "adapter"},
            ),
            "generic_controller": MidiDeviceProfile(
                profile_id="generic_controller",
                name="Generic USB MIDI Controller",
                match_patterns=["midi", "controller", "keyboard"],
                default_channel=0,
                supports_sysex=False,
                metadata={"device_type": "controller"},
            ),
        }
        self._custom_profiles: Dict[str, MidiDeviceProfile] = {}
        self._manual_assignments: Dict[str, str] = {}
        self._devices: Dict[str, MidiDeviceState] = {}
        self._shadow_state: Dict[str, Dict[str, Any]] = {}
        self._drift_log: List[Dict[str, Any]] = []

    def _all_profiles(self) -> List[MidiDeviceProfile]:
        return list(self._builtins.values()) + list(self._custom_profiles.values())

    def list_profiles(self) -> List[Dict[str, Any]]:
        return [
            {
                "profile_id": p.profile_id,
                "name": p.name,
                "match_patterns": list(p.match_patterns),
                "default_channel": p.default_channel,
                "supports_sysex": p.supports_sysex,
                "usb_vid_pid": list(p.usb_vid_pid),
                "metadata": dict(p.metadata),
                "is_custom": p.profile_id in self._custom_profiles,
            }
            for p in self._all_profiles()
        ]

    def add_custom_profile(self, profile: MidiDeviceProfile, *, replace: bool = True) -> None:
        if not replace and profile.profile_id in self._custom_profiles:
            raise ValueError(f"profile already exists: {profile.profile_id}")
        self._custom_profiles[profile.profile_id] = profile

    def upsert_custom_profile(
        self,
        *,
        profile_id: str,
        name: str,
        match_patterns: List[str],
        default_channel: int = 0,
        supports_sysex: bool = False,
        usb_vid_pid: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MidiDeviceProfile:
        profile = MidiDeviceProfile(
            profile_id=profile_id,
            name=name,
            match_patterns=[p for p in match_patterns if str(p).strip()],
            default_channel=int(default_channel),
            supports_sysex=bool(supports_sysex),
            usb_vid_pid=[str(v).strip().lower() for v in (usb_vid_pid or []) if str(v).strip()],
            metadata=dict(metadata or {}),
        )
        self._custom_profiles[profile.profile_id] = profile
        return profile

    def remove_custom_profile(self, profile_id: str) -> bool:
        return self._custom_profiles.pop(profile_id, None) is not None

    async def assign_port(self, *, port_name: str, device_id: str) -> Dict[str, Any]:
        self._manual_assignments[str(port_name)] = str(device_id)
        await self._persist_device_configs()
        return {"port_name": port_name, "device_id": device_id}

    async def clear_assignment(self, *, port_name: str) -> bool:
        existed = self._manual_assignments.pop(str(port_name), None) is not None
        await self._persist_device_configs()
        return existed

    async def register_device(self, *, device_id: str, port_name: str) -> Dict[str, Any]:
        return await self.assign_port(port_name=port_name, device_id=device_id)

    async def update_device(self, *, device_id: str, port_name: str) -> Dict[str, Any]:
        return await self.assign_port(port_name=port_name, device_id=device_id)

    async def delete_device(self, *, device_id: str) -> bool:
        removed = False
        remaining: Dict[str, str] = {}
        for port_name, assigned_device in self._manual_assignments.items():
            if assigned_device == device_id:
                removed = True
                continue
            remaining[port_name] = assigned_device
        self._manual_assignments = remaining
        await self._persist_device_configs()
        return removed

    def _profile_for_device_id(self, device_id: str) -> MidiDeviceProfile:
        prefix = str(device_id).split(":", 1)[0]
        return self._custom_profiles.get(prefix) or self._builtins.get(prefix) or self._builtins["generic_controller"]

    def _match_profile(self, port_name: str, vid_pid: Optional[str]) -> MidiDeviceProfile:
        candidate = port_name.lower()
        normalized_vid_pid = str(vid_pid or "").lower().strip()

        if normalized_vid_pid:
            for profile in self._all_profiles():
                if normalized_vid_pid in {x.lower() for x in profile.usb_vid_pid}:
                    return profile

        for profile in self._all_profiles():
            for pattern in profile.match_patterns:
                if pattern.lower() in candidate:
                    return profile

        return self._builtins["generic_controller"]

    async def refresh(self) -> Dict[str, Any]:
        await self._load_manual_assignments()

        descriptors = {d["name"]: d for d in discover_alsa_port_descriptors()}
        ports = self._hub.list_ports()
        grouped: Dict[str, Dict[str, Any]] = {}
        now = _now_iso()

        for port in ports:
            descriptor = descriptors.get(port.name, {})
            vid_pid = _normalize_vid_pid(
                descriptor.get("vendor_id"),
                descriptor.get("product_id"),
            )

            manual_device_id = self._manual_assignments.get(port.name) or self._manual_assignments.get(port.port_id)
            if manual_device_id:
                logical_id = manual_device_id
                profile = self._profile_for_device_id(logical_id)
                manual_assignment = port.name
            else:
                profile = self._match_profile(port.name, vid_pid)
                logical_id = f"{profile.profile_id}:{_slug(port.name)}"
                manual_assignment = None

            group = grouped.setdefault(
                logical_id,
                {
                    "profile": profile,
                    "port_ids": set(),
                    "port_names": set(),
                    "responding": True,
                    "latency_ms": None,
                    "vendor_id": None,
                    "product_id": None,
                    "manual_assignment": manual_assignment,
                },
            )
            group["port_ids"].add(port.port_id)
            group["port_names"].add(port.name)
            group["responding"] = bool(group["responding"]) and bool(port.is_open)
            group["manual_assignment"] = group["manual_assignment"] or manual_assignment

            metadata = dict(port.metadata or {})
            latency = metadata.get("latency_ms")
            if isinstance(latency, (int, float)):
                current = group["latency_ms"]
                if current is None or float(latency) < float(current):
                    group["latency_ms"] = float(latency)

            if descriptor.get("vendor_id"):
                group["vendor_id"] = descriptor["vendor_id"]
            if descriptor.get("product_id"):
                group["product_id"] = descriptor["product_id"]

        next_devices: Dict[str, MidiDeviceState] = {}
        for device_id, payload in grouped.items():
            profile: MidiDeviceProfile = payload["profile"]
            responding = bool(payload["responding"])
            state = MidiDeviceState(
                device_id=device_id,
                profile_id=profile.profile_id,
                profile_name=profile.name,
                port_ids=sorted(payload["port_ids"]),
                port_names=sorted(payload["port_names"]),
                connected=True,
                responding=responding,
                health="online" if responding else "degraded",
                latency_ms=payload["latency_ms"],
                last_seen=now,
                vendor_id=payload["vendor_id"],
                product_id=payload["product_id"],
                manual_assignment=payload["manual_assignment"],
            )
            next_devices[device_id] = state

        previous = set(self._devices.keys())
        current = set(next_devices.keys())
        online = sorted(current - previous)
        offline = sorted(previous - current)

        self._devices = next_devices
        await self._persist_device_configs()
        await self._evaluate_shadow_drift()

        for device_id in online:
            await self._emit_event(
                "midi:device_online",
                {
                    "device": self._devices[device_id].to_dict(),
                    "timestamp": now,
                },
            )

        for device_id in offline:
            await self._emit_event(
                "midi:device_offline",
                {
                    "device_id": device_id,
                    "timestamp": now,
                },
            )

        return {
            "count": len(self._devices),
            "devices": [d.to_dict() for d in self._devices.values()],
            "online_events": online,
            "offline_events": offline,
        }

    def snapshot(self) -> Dict[str, Any]:
        return {
            "count": len(self._devices),
            "devices": [d.to_dict() for d in self._devices.values()],
            "profiles": self.list_profiles(),
            "assignments": dict(self._manual_assignments),
            "shadow_state": dict(self._shadow_state),
        }

    def list_drift_events(self, *, limit: int = 200) -> Dict[str, Any]:
        limit_clamped = max(1, min(5000, int(limit)))
        rows = self._drift_log[-limit_clamped:]
        return {"count": len(rows), "events": rows}

    def clear_drift_events(self) -> Dict[str, Any]:
        count = len(self._drift_log)
        self._drift_log = []
        return {"cleared": count}

    def get_shadow_state(self, device_id: str) -> Dict[str, Any]:
        return dict(self._shadow_state.get(device_id) or {})

    async def upsert_shadow_state(
        self,
        *,
        device_id: str,
        expected_state: Dict[str, Any],
        source: str = "api",
    ) -> Dict[str, Any]:
        now = _now_iso()
        self._shadow_state[device_id] = {
            **dict(expected_state or {}),
            "_updated_at": now,
            "_source": source,
        }
        drift = await self._detect_drift(device_id)
        return {
            "device_id": device_id,
            "updated_at": now,
            "drift_detected": bool(drift),
            "drift": drift,
        }

    async def _load_manual_assignments(self) -> None:
        async with get_session(read_only=True) as session:
            device_names = (
                await session.execute(
                    select(MIDIDeviceConfig.device_name).where(MIDIDeviceConfig.device_type == "assignment")
                )
            ).scalars().all()

        assignments: Dict[str, str] = {}
        for device_name in device_names:
            decoded = _decode_assignment(str(device_name))
            if not decoded:
                continue
            port_name, device_id = decoded
            assignments[port_name] = device_id
        self._manual_assignments = assignments

    async def _persist_device_configs(self) -> None:
        async with get_session() as session:
            existing_rows = (await session.execute(select(MIDIDeviceConfig))).scalars().all()
            by_name = {row.device_name: row for row in existing_rows}
            active_device_names = set(self._devices.keys())

            for device in self._devices.values():
                row = by_name.get(device.device_id)
                if row is None:
                    row = MIDIDeviceConfig(device_name=device.device_id)
                    session.add(row)
                row.device_type = "midi_hub"
                row.is_enabled = True
                row.auto_connect = True

            for row in existing_rows:
                if row.device_type == "midi_hub" and row.device_name not in active_device_names:
                    row.is_enabled = False

            assignment_rows = {
                _encode_assignment(port_name, device_id): (port_name, device_id)
                for port_name, device_id in self._manual_assignments.items()
            }
            for encoded_name in assignment_rows:
                row = by_name.get(encoded_name)
                if row is None:
                    row = MIDIDeviceConfig(device_name=encoded_name)
                    session.add(row)
                row.device_type = "assignment"
                row.is_enabled = True
                row.auto_connect = False

            for row in existing_rows:
                if row.device_type == "assignment" and row.device_name not in assignment_rows:
                    await session.delete(row)

    async def _emit_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            await ws_manager.broadcast_json(
                {
                    "type": event_type,
                    "data": payload,
                    "timestamp": _now_iso(),
                },
                topic="midi:devices",
            )
        except Exception:
            # Registry remains functional without websocket transport.
            return

    async def _evaluate_shadow_drift(self) -> None:
        for device_id in list(self._shadow_state.keys()):
            await self._detect_drift(device_id)

    async def _detect_drift(self, device_id: str) -> Optional[Dict[str, Any]]:
        actual = self._devices.get(device_id)
        shadow = dict(self._shadow_state.get(device_id) or {})
        if actual is None or not shadow:
            return None
        actual_payload = actual.to_dict()
        mismatches = _collect_drift_mismatches(actual_payload, shadow)
        if not mismatches:
            return None
        drift = {
            "device_id": device_id,
            "mismatches": mismatches,
            "timestamp": _now_iso(),
            "actual": actual_payload,
            "shadow": shadow,
        }
        self._drift_log.append(drift)
        if len(self._drift_log) > 1000:
            self._drift_log = self._drift_log[-1000:]
        await self._emit_event("midi:device_drift", drift)
        return drift


def _collect_drift_mismatches(actual: Dict[str, Any], shadow: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    keys = [
        "connected",
        "responding",
        "health",
        "latency_ms",
        "profile_id",
        "vendor_id",
        "product_id",
    ]
    mismatches: Dict[str, Dict[str, Any]] = {}
    for key in keys:
        if key not in shadow:
            continue
        actual_value = actual.get(key)
        expected_value = shadow.get(key)
        if actual_value != expected_value:
            mismatches[key] = {
                "expected": expected_value,
                "actual": actual_value,
            }
    return mismatches


_midi_device_registry_singleton: Optional[MidiDeviceRegistry] = None


def get_midi_device_registry() -> MidiDeviceRegistry:
    global _midi_device_registry_singleton
    if _midi_device_registry_singleton is None:
        _midi_device_registry_singleton = MidiDeviceRegistry()
    return _midi_device_registry_singleton
