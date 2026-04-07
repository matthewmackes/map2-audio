"""MidiDeviceRegistry for MAP2 Native MIDI Hub."""

from __future__ import annotations

import asyncio
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
    channels: List[int] = field(default_factory=list)
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
    node_id: str = "local"
    remote: bool = False

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
            "node_id": self.node_id,
            "remote": self.remote,
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
                metadata={
                    "vendor": "MeloAudio",
                    "device_type": "controller",
                    "role": "profile_controller",
                    "shared_stack_unit_id": "meloaudio-midi-commander",
                    "switch_count": 10,
                    "expression_inputs": 2,
                    "display_capabilities": {
                        "transport": "none",
                        "supports_per_switch_labels": False,
                        "reason": "MIDI Commander is a profile-driven foot controller without per-switch text displays.",
                    },
                },
            ),
            "ground_control_pro": MidiDeviceProfile(
                profile_id="ground_control_pro",
                name="Voodoo Lab Ground Control Pro",
                match_patterns=["ground control pro", "ground control", "voodoo lab"],
                default_channel=1,
                supports_sysex=True,
                metadata={
                    "vendor": "Voodoo Lab",
                    "device_type": "sysex_surface",
                    "role": "sysex_surface",
                    "shared_stack_unit_id": "ground-control-pro",
                    "display_capabilities": {
                        "transport": "none",
                        "supports_per_switch_labels": False,
                        "reason": "Ground Control Pro belongs on the SysEx-specialized branch rather than a live label renderer path.",
                    },
                },
            ),
            "morningstar_mc6": MidiDeviceProfile(
                profile_id="morningstar_mc6",
                name="Morningstar MC6",
                match_patterns=["morningstar mc6", "mc6"],
                default_channel=1,
                supports_sysex=True,
                metadata={
                    "vendor": "Morningstar",
                    "device_type": "controller",
                    "switch_count": 6,
                    "display_transport": "morningstar_short_name",
                    "display_capabilities": {
                        "transport": "morningstar_short_name",
                        "supports_per_switch_labels": True,
                        "switch_count": 6,
                        "label_max_length": 8,
                        "model_id": 0x03,
                    },
                },
            ),
            "morningstar_mc8": MidiDeviceProfile(
                profile_id="morningstar_mc8",
                name="Morningstar MC8",
                match_patterns=["morningstar mc8", "mc8"],
                default_channel=1,
                supports_sysex=True,
                metadata={
                    "vendor": "Morningstar",
                    "device_type": "controller",
                    "switch_count": 8,
                    "display_transport": "morningstar_short_name",
                    "display_capabilities": {
                        "transport": "morningstar_short_name",
                        "supports_per_switch_labels": True,
                        "switch_count": 8,
                        "label_max_length": 10,
                        "model_id": 0x04,
                    },
                },
            ),
            "beatstep_pro": MidiDeviceProfile(
                profile_id="beatstep_pro",
                name="Arturia BeatStep Pro",
                match_patterns=["beatstep pro", "arturia beatstep pro"],
                default_channel=1,
                supports_sysex=True,
                metadata={
                    "vendor": "Arturia",
                    "device_type": "controller",
                    "switch_count": 8,
                    "display_capabilities": {
                        "transport": "none",
                        "supports_per_switch_labels": False,
                        "reason": "BeatStep Pro exposes a shared project/value display, not per-switch text labels.",
                    },
                },
            ),
            "m_audio_midisport_4x4": MidiDeviceProfile(
                profile_id="m_audio_midisport_4x4",
                name="M-Audio MIDISPORT 4x4",
                match_patterns=["midisport 4x4", "midisport"],
                default_channel=0,
                supports_sysex=True,
                channels=[],
                usb_vid_pid=["0763:1020"],
                metadata={"vendor": "M-Audio", "device_type": "adapter", "ports": 4},
            ),
            "maschine_mk1": MidiDeviceProfile(
                profile_id="maschine_mk1",
                name="Maschine MK1",
                match_patterns=["map2:maschine-mk1", "maschine-mk1", "maschine mk1"],
                default_channel=1,
                supports_sysex=False,
                channels=[1, 2],
                usb_vid_pid=["17cc:0808"],
                metadata={
                    "vendor": "Native Instruments",
                    "device_type": "control_surface",
                    "role": "control_surface",
                    "virtual_port_name": "MAP2:Maschine-MK1",
                    "suggested_transform_chain": [
                        {
                            "type": "maschine_pad_to_chain_cc",
                            "base_note": 36,
                            "select_cc": 110,
                            "bypass_cc": 111,
                            "value_mode": "index",
                        }
                    ],
                },
            ),
            "novation_launch_control": MidiDeviceProfile(
                profile_id="novation_launch_control",
                name="Novation Launch Control Family",
                match_patterns=["launch control", "launchcontrol", "launch control xl"],
                default_channel=1,
                supports_sysex=True,
                metadata={
                    "vendor": "Novation",
                    "device_type": "controller",
                    "role": "template_controller",
                    "shared_stack_unit_id": "novation-launch-control",
                    "template_strategy": "components-managed-custom-modes",
                    "led_feedback": True,
                    "display_capabilities": {
                        "transport": "launch_control_led_feedback",
                        "supports_per_switch_labels": False,
                        "supports_led_feedback": True,
                    },
                },
            ),
            "mackie_mcu_pro": MidiDeviceProfile(
                profile_id="mackie_mcu_pro",
                name="Mackie MCU Pro",
                match_patterns=["mackie mcu", "mcu pro", "mackie control", "mackie control universal"],
                default_channel=1,
                supports_sysex=True,
                metadata={
                    "vendor": "Mackie",
                    "device_type": "control_surface",
                    "role": "mcu_surface",
                    "shared_stack_unit_id": "mackie-mcu-pro",
                    "motor_faders": 9,
                    "scribble_strips": 8,
                    "meter_bridge": True,
                    "display_capabilities": {
                        "transport": "mcu_scribble_strip",
                        "supports_led_feedback": True,
                        "supports_channel_labels": True,
                        "motor_faders": 9,
                    },
                },
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
        self._remote_devices: Dict[str, MidiDeviceState] = {}
        self._shadow_state: Dict[str, Dict[str, Any]] = {}
        self._drift_log: List[Dict[str, Any]] = []
        self._local_node_id: Optional[str] = None
        self._subscribe_cluster_profile_events()

    def _all_profiles(self) -> List[MidiDeviceProfile]:
        return list(self._builtins.values()) + list(self._custom_profiles.values())

    @staticmethod
    def _profile_payload(profile: MidiDeviceProfile, *, is_custom: bool) -> Dict[str, Any]:
        return {
            "profile_id": profile.profile_id,
            "name": profile.name,
            "match_patterns": list(profile.match_patterns),
            "default_channel": profile.default_channel,
            "supports_sysex": profile.supports_sysex,
            "channels": list(profile.channels),
            "usb_vid_pid": list(profile.usb_vid_pid),
            "metadata": dict(profile.metadata),
            "is_custom": is_custom,
        }

    def list_profiles(self) -> List[Dict[str, Any]]:
        return [
            self._profile_payload(p, is_custom=(p.profile_id in self._custom_profiles))
            for p in self._all_profiles()
        ]

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        profile = self._custom_profiles.get(profile_id) or self._builtins.get(profile_id)
        if profile is None:
            return None
        return self._profile_payload(profile, is_custom=(profile_id in self._custom_profiles))

    def get_display_capabilities(self, profile_id: str) -> Dict[str, Any]:
        profile = self._custom_profiles.get(profile_id) or self._builtins.get(profile_id)
        if profile is None:
            return {}
        raw_capabilities = profile.metadata.get("display_capabilities")
        if isinstance(raw_capabilities, dict):
            return dict(raw_capabilities)
        return {}

    def add_custom_profile(self, profile: MidiDeviceProfile, *, replace: bool = True) -> None:
        if not replace and profile.profile_id in self._custom_profiles:
            raise ValueError(f"profile already exists: {profile.profile_id}")
        self._custom_profiles[profile.profile_id] = profile
        self._share_custom_profile(profile)

    def upsert_custom_profile(
        self,
        *,
        profile_id: str,
        name: str,
        match_patterns: List[str],
        default_channel: int = 0,
        supports_sysex: bool = False,
        usb_vid_pid: Optional[List[str]] = None,
        channels: Optional[List[int]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MidiDeviceProfile:
        profile = MidiDeviceProfile(
            profile_id=profile_id,
            name=name,
            match_patterns=[p for p in match_patterns if str(p).strip()],
            default_channel=int(default_channel),
            supports_sysex=bool(supports_sysex),
            channels=[int(channel) for channel in (channels or []) if int(channel) >= 1],
            usb_vid_pid=[str(v).strip().lower() for v in (usb_vid_pid or []) if str(v).strip()],
            metadata=dict(metadata or {}),
        )
        self._custom_profiles[profile.profile_id] = profile
        self._share_custom_profile(profile)
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

    def _local_node(self) -> str:
        if self._local_node_id:
            return self._local_node_id
        try:
            from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

            self._local_node_id = get_enhanced_node_identity().get_node_id()
        except Exception:
            self._local_node_id = "local"
        return self._local_node_id

    @staticmethod
    def _remote_key(node_id: str, device_id: str) -> str:
        return f"{node_id}::{device_id}"

    def _state_payload(self, state: MidiDeviceState) -> Dict[str, Any]:
        payload = state.to_dict()
        payload["shadow_state"] = dict(self._shadow_state.get(state.device_id) or {})
        return payload

    def _iter_all_states(self) -> List[MidiDeviceState]:
        return list(self._devices.values()) + list(self._remote_devices.values())

    def _schedule_coroutine(self, coro: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coro)
        else:
            loop.create_task(coro)

    def _publish_cluster_event(self, event_name: str, state: MidiDeviceState) -> None:
        try:
            from app.services.cluster.distributed_event_bus import (
                ClusterEvent,
                EventSeverity,
                EventType,
                get_event_bus as get_distributed_event_bus,
            )
        except Exception:
            return

        event_type = getattr(EventType, event_name, None)
        if event_type is None:
            return

        details = {
            "node_id": state.node_id,
            "port_name": state.port_names[0] if state.port_names else state.profile_name,
            "remote_node_id": state.node_id if state.remote else None,
            "transport": None,
            "latency_ms": state.latency_ms,
            "device_id": state.device_id,
            "profile_id": state.profile_id,
        }
        event = ClusterEvent(
            event_type=event_type,
            severity=EventSeverity.INFO,
            source_node_id=self._local_node(),
            affected_nodes=[state.node_id],
            message=f"MIDI device {state.device_id} on {state.node_id}",
            details=details,
        )
        self._schedule_coroutine(get_distributed_event_bus().publish_event(event))

    def _subscribe_cluster_profile_events(self) -> None:
        try:
            from app.services.cluster.distributed_event_bus import EventType, get_event_bus as get_distributed_event_bus
        except Exception:
            return

        try:
            get_distributed_event_bus().subscribe(EventType.MIDI_PROFILE_SHARED, self._handle_shared_profile_event)
        except Exception:
            return

    def _handle_shared_profile_event(self, event: Any) -> None:
        try:
            if getattr(event, "source_node_id", "") == self._local_node():
                return
            payload = dict(getattr(event, "details", {}).get("profile") or {})
            profile_id = str(payload.get("profile_id") or "").strip()
            if not profile_id:
                return
            self._custom_profiles[profile_id] = MidiDeviceProfile(
                profile_id=profile_id,
                name=str(payload.get("name") or profile_id),
                match_patterns=[str(item) for item in payload.get("match_patterns", []) if str(item).strip()],
                default_channel=int(payload.get("default_channel", 0)),
                supports_sysex=bool(payload.get("supports_sysex", False)),
                channels=[int(item) for item in payload.get("channels", []) if int(item) >= 1],
                usb_vid_pid=[str(item).strip().lower() for item in payload.get("usb_vid_pid", []) if str(item).strip()],
                metadata=dict(payload.get("metadata") or {}),
            )
        except Exception:
            return

    def _share_custom_profile(self, profile: MidiDeviceProfile) -> None:
        try:
            from app.services.cluster.distributed_event_bus import (
                ClusterEvent,
                EventSeverity,
                EventType,
                get_event_bus as get_distributed_event_bus,
            )
        except Exception:
            return

        event = ClusterEvent(
            event_type=EventType.MIDI_PROFILE_SHARED,
            severity=EventSeverity.INFO,
            source_node_id=self._local_node(),
            affected_nodes=[],
            message=f"Shared MIDI profile {profile.profile_id}",
            details={
                "profile": {
                    "profile_id": profile.profile_id,
                    "name": profile.name,
                    "match_patterns": list(profile.match_patterns),
                    "default_channel": profile.default_channel,
                    "supports_sysex": profile.supports_sysex,
                    "channels": list(profile.channels),
                    "usb_vid_pid": list(profile.usb_vid_pid),
                    "metadata": dict(profile.metadata),
                }
            },
        )
        self._schedule_coroutine(get_distributed_event_bus().publish_event(event))

    def merge_remote_devices(self, node_id: str, devices: List[Dict[str, Any]]) -> None:
        node_key = str(node_id)
        existing_keys = {key for key, state in self._remote_devices.items() if state.node_id == node_key}
        incoming_keys: set[str] = set()

        for raw_device in devices:
            device_id = str(raw_device.get("device_id") or "").strip()
            if not device_id:
                continue
            storage_key = self._remote_key(node_key, device_id)
            incoming_keys.add(storage_key)
            previous_state = self._remote_devices.get(storage_key)
            state = MidiDeviceState(
                device_id=device_id,
                profile_id=str(raw_device.get("profile_id") or "generic_controller"),
                profile_name=str(raw_device.get("profile_name") or raw_device.get("device_id") or "Remote MIDI Device"),
                port_ids=[str(item) for item in raw_device.get("port_ids", []) if str(item).strip()],
                port_names=[str(item) for item in raw_device.get("port_names", []) if str(item).strip()],
                connected=bool(raw_device.get("connected", True)),
                responding=bool(raw_device.get("responding", raw_device.get("connected", True))),
                health=str(raw_device.get("health") or ("online" if raw_device.get("connected", True) else "offline")),
                latency_ms=float(raw_device["latency_ms"]) if raw_device.get("latency_ms") is not None else None,
                last_seen=str(raw_device.get("last_seen") or _now_iso()),
                vendor_id=raw_device.get("vendor_id"),
                product_id=raw_device.get("product_id"),
                manual_assignment=raw_device.get("manual_assignment"),
                source=str(raw_device.get("source") or "cluster"),
                node_id=node_key,
                remote=True,
            )
            self._remote_devices[storage_key] = state
            if previous_state is None or not previous_state.connected:
                self._publish_cluster_event("MIDI_PORT_DISCOVERED", state)

        missing_keys = existing_keys - incoming_keys
        for storage_key in sorted(missing_keys):
            state = self._remote_devices.get(storage_key)
            if state is None or not state.connected:
                continue
            state.connected = False
            state.responding = False
            state.health = "offline"
            state.last_seen = _now_iso()
            self._publish_cluster_event("MIDI_PORT_LOST", state)

    def remove_node_devices(self, node_id: str) -> int:
        removed = 0
        for storage_key, state in list(self._remote_devices.items()):
            if state.node_id != str(node_id):
                continue
            if state.connected:
                removed += 1
                state.connected = False
                state.responding = False
                state.health = "offline"
                state.last_seen = _now_iso()
                self._publish_cluster_event("MIDI_PORT_LOST", state)
        return removed

    def get_node_devices(self, node_id: str) -> List[Dict[str, Any]]:
        target = str(node_id)
        return [
            self._state_payload(state)
            for state in sorted(
                self._iter_all_states(),
                key=lambda row: (row.node_id, row.remote, row.device_id),
            )
            if state.node_id == target
        ]

    def get_global_snapshot(self) -> Dict[str, Any]:
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for state in sorted(self._iter_all_states(), key=lambda row: (row.node_id, row.remote, row.device_id)):
            grouped.setdefault(state.node_id, []).append(self._state_payload(state))
        nodes = [
            {
                "node_id": node_id,
                "remote": node_id != self._local_node(),
                "device_count": len(devices),
                "devices": devices,
            }
            for node_id, devices in grouped.items()
        ]
        return {
            "count": sum(len(devices) for devices in grouped.values()),
            "node_count": len(grouped),
            "nodes": nodes,
            "by_node": grouped,
            "profiles": self.list_profiles(),
        }

    def find_equivalent_port(self, port_name: str, exclude_node_id: str) -> Optional[Dict[str, Any]]:
        target = str(port_name or "").strip()
        if not target:
            return None
        target_profile_id = self._match_profile(target, None).profile_id
        candidates = [
            state
            for state in self._iter_all_states()
            if state.node_id != str(exclude_node_id) and state.connected
        ]
        for state in sorted(candidates, key=lambda row: (row.node_id, row.remote, row.device_id)):
            if (
                state.profile_id == target_profile_id
                or target == state.profile_name
                or target in state.port_names
                or target == state.device_id
            ):
                return self._state_payload(state)
        return None

    def _build_local_inventory(self) -> Dict[str, Any]:
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
                node_id=self._local_node(),
                remote=False,
            )
            next_devices[device_id] = state

        return {
            "count": len(next_devices),
            "devices": [d.to_dict() for d in next_devices.values()],
            "device_states": next_devices,
            "timestamp": now,
        }

    async def inspect_local_ports(self) -> Dict[str, Any]:
        await self._load_manual_assignments()
        inventory = self._build_local_inventory()
        return {
            "count": inventory["count"],
            "devices": inventory["devices"],
            "profiles": self.list_profiles(),
            "assignments": dict(self._manual_assignments),
            "timestamp": inventory["timestamp"],
        }

    async def refresh(self) -> Dict[str, Any]:
        await self._load_manual_assignments()
        inventory = self._build_local_inventory()
        next_devices = inventory["device_states"]
        now = inventory["timestamp"]

        previous = set(self._devices.keys())
        current = set(next_devices.keys())
        online = sorted(current - previous)
        offline = sorted(previous - current)

        self._devices = next_devices
        await self._persist_device_configs()
        await self._evaluate_shadow_drift()
        self._broadcast_local_inventory()

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
            "remote_device_count": len(self._remote_devices),
            "remote_devices": [self._state_payload(device) for device in self._remote_devices.values()],
            "global_device_count": len(self._devices) + len(self._remote_devices),
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

    def _broadcast_local_inventory(self) -> None:
        if not self._hub.running:
            return
        try:
            import socket

            from app.config import config_get
            from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
            from app.services.midi_hub.midi_discovery import get_midi_discovery_service
        except Exception:
            return

        try:
            identity = get_enhanced_node_identity()
            hostname = getattr(identity.config, "hostname", None) or socket.gethostname()
            get_midi_discovery_service().broadcast_local_node(
                self._local_node(),
                hostname,
                int(config_get("backend.port", 8080)),
            )
        except Exception:
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
