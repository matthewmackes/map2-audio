"""MIDI 2.0 readiness layer (MIDI-CI, Property Exchange, UMP helpers)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage


MIDI_CI_VERSION = 0x02
MIDI_CI_SUBID = 0x0D
MIDI_CI_DEVICE_FUNCTION_BLOCK = 0x7F
MIDI_CI_BROADCAST_MUID = 0x0FFFFFFF
MIDI_CI_DISCOVERY = 0x70
MIDI_CI_DISCOVERY_REPLY = 0x71
MIDI_CI_PROFILE_INQUIRY = 0x20
MIDI_CI_PROFILE_INQUIRY_REPLY = 0x21
MIDI_CI_SET_PROFILE_ON = 0x22
MIDI_CI_SET_PROFILE_OFF = 0x23
MIDI_CI_PROFILE_ENABLED_REPORT = 0x24
MIDI_CI_PROFILE_DISABLED_REPORT = 0x25
MIDI_CI_PROFILE_DETAILS_INQUIRY = 0x28
MIDI_CI_PROFILE_DETAILS_REPLY = 0x29
MIDI_CI_PE_CAPS_INQUIRY = 0x30
MIDI_CI_PE_CAPS_REPLY = 0x31
MIDI_CI_PE_GET = 0x34
MIDI_CI_PE_GET_REPLY = 0x35
MIDI_CI_PE_SET = 0x36
MIDI_CI_PE_SET_REPLY = 0x37
MIDI_CI_SUBSCRIPTION = 0x38
MIDI_CI_SUBSCRIPTION_REPLY = 0x39
MIDI_CI_NOTIFY = 0x3F
MIDI_CI_INVALIDATE_MUID = 0x7E
MIDI_CI_DISCOVERY_TIMEOUT_S = 3.0
MIDI_CI_REQUEST_TIMEOUT_S = 3.0
MIDI_CI_MAX_SYSEX = 512
MIDI_CI_NOTIFY_TIMEOUT_WAIT = 100
MIDI_CI_NOTIFY_TERMINATE = 144
MIDI_CI_NOTIFY_TIMEOUT = 408


def _encode_u7_lsb(value: int, size: int) -> List[int]:
    normalized = max(0, int(value))
    return [(normalized >> (7 * index)) & 0x7F for index in range(size)]


def _decode_u7_lsb(data: bytes, offset: int, size: int) -> int:
    if offset < 0 or offset + size > len(data):
        return 0
    value = 0
    for index in range(size):
        value |= (int(data[offset + index]) & 0x7F) << (7 * index)
    return value


def _format_hex_bytes(data: bytes) -> str:
    return " ".join(f"{int(byte) & 0xFF:02X}" for byte in data)


def _encode_json_ascii(payload: Any) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def _decode_json_ascii(data: bytes) -> Any:
    if not data:
        return None
    try:
        text = bytes(int(byte) & 0x7F for byte in data).decode("ascii", errors="ignore").strip()
    except Exception:
        return None
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return text


def _safe_text_preview(data: bytes) -> Optional[str]:
    if not data:
        return None
    try:
        text = bytes(data).decode("utf-8", errors="ignore").strip()
    except Exception:
        return None
    if not text:
        return None
    if any(ord(ch) < 32 and ch not in "\t\r\n" for ch in text):
        return None
    return text


def _device_id_from_muid(muid: int) -> str:
    return f"muid-{int(muid) & MIDI_CI_BROADCAST_MUID:07X}"


def _resource_key(resource: str, res_id: Optional[str] = None) -> str:
    normalized_resource = str(resource or "").strip()
    normalized_res_id = str(res_id or "").strip()
    return normalized_resource if not normalized_res_id else f"{normalized_resource}#{normalized_res_id}"


def _normalize_property_resource(resource: Optional[str], key: Optional[str] = None) -> Tuple[str, Optional[str]]:
    raw = str(resource or key or "").strip()
    if not raw:
        raise ValueError("property_resource_required")
    for separator in ("#", "::"):
        if separator in raw:
            resource_name, resource_id = raw.split(separator, 1)
            return resource_name.strip(), (resource_id.strip() or None)
    return raw, None


def _normalize_profile_id(profile_id: str) -> Tuple[str, bytes]:
    raw = str(profile_id or "").strip().replace("0x", "").replace("0X", "")
    if not raw:
        raise ValueError("profile_id_required")
    compact = raw.replace("-", " ").replace(",", " ").replace(":", " ")
    tokens = [token for token in compact.split() if token]
    if len(tokens) == 1 and len(tokens[0]) == 10:
        tokens = [tokens[0][index:index + 2] for index in range(0, len(tokens[0]), 2)]
    if len(tokens) != 5 or any(len(token) != 2 for token in tokens):
        raise ValueError("profile_id_must_be_five_hex_bytes")
    try:
        payload = bytes(int(token, 16) & 0x7F for token in tokens)
    except ValueError as exc:
        raise ValueError("profile_id_must_be_five_hex_bytes") from exc
    return _format_hex_bytes(payload), payload


@dataclass
class Midi2TransportBinding:
    transport: str = "none"
    target_id: Optional[str] = None
    response_port: Optional[str] = None
    bound_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "transport": self.transport,
            "target_id": self.target_id,
            "response_port": self.response_port,
            "bound_at": self.bound_at,
        }


@dataclass
class Midi2PendingPropertyRequest:
    device_id: str
    remote_muid: int
    request_id: int
    kind: str
    resource: str
    res_id: Optional[str] = None
    value: Any = None
    subscribe_id: Optional[str] = None
    requested_at: float = field(default_factory=time.time)


@dataclass
class Midi2PendingChunkSet:
    subid2: int
    request_id: int
    source_muid: int
    expected_chunks: Optional[int] = None
    header_chunks: Dict[int, bytes] = field(default_factory=dict)
    property_chunks: Dict[int, bytes] = field(default_factory=dict)
    updated_at: float = field(default_factory=time.time)


@dataclass
class Midi2DeviceState:
    device_id: str
    protocol: str = "midi1"
    remote_muid: Optional[int] = None
    manufacturer_id: Optional[str] = None
    family_id: Optional[str] = None
    model_id: Optional[str] = None
    software_revision: Optional[str] = None
    supports_profiles: bool = False
    supports_property_exchange: bool = False
    max_sysex_size: Optional[int] = None
    discovery_state: str = "idle"
    profile_state: str = "idle"
    property_state: str = "idle"
    profiles: Dict[str, bool] = field(default_factory=dict)
    profile_details: Dict[str, Any] = field(default_factory=dict)
    properties: Dict[str, Any] = field(default_factory=dict)
    resources: List[str] = field(default_factory=list)
    subscriptions: Dict[str, Any] = field(default_factory=dict)
    property_exchange_capabilities: Dict[str, Any] = field(default_factory=dict)
    last_discovery_at: Optional[float] = None
    last_request_at: Optional[float] = None
    last_request_kind: Optional[str] = None
    last_request_id: Optional[int] = None
    pending_request_kind: Optional[str] = None
    pending_request_id: Optional[int] = None
    pending_request_deadline: Optional[float] = None
    last_request_hex: Optional[str] = None
    last_response_at: Optional[float] = None
    last_response_hex: Optional[str] = None
    last_response_source: Optional[str] = None
    last_response_summary: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "protocol": self.protocol,
            "remote_muid": f"{self.remote_muid:07X}" if self.remote_muid is not None else None,
            "manufacturer_id": self.manufacturer_id,
            "family_id": self.family_id,
            "model_id": self.model_id,
            "software_revision": self.software_revision,
            "supports_profiles": self.supports_profiles,
            "supports_property_exchange": self.supports_property_exchange,
            "max_sysex_size": self.max_sysex_size,
            "discovery_state": self.discovery_state,
            "profile_state": self.profile_state,
            "property_state": self.property_state,
            "profiles": dict(self.profiles),
            "profile_details": dict(self.profile_details),
            "properties": dict(self.properties),
            "resources": list(self.resources),
            "subscriptions": dict(self.subscriptions),
            "property_exchange_capabilities": dict(self.property_exchange_capabilities),
            "last_discovery_at": self.last_discovery_at,
            "last_request_at": self.last_request_at,
            "last_request_kind": self.last_request_kind,
            "last_request_id": self.last_request_id,
            "pending_request_kind": self.pending_request_kind,
            "pending_request_id": self.pending_request_id,
            "pending_request_deadline": self.pending_request_deadline,
            "last_request_hex": self.last_request_hex,
            "last_response_at": self.last_response_at,
            "last_response_hex": self.last_response_hex,
            "last_response_source": self.last_response_source,
            "last_response_summary": self.last_response_summary,
        }


class Midi2Manager:
    def __init__(
        self,
        enabled: Optional[bool] = None,
        *,
        hub: Optional[MidiHub] = None,
        network_bridge: Optional[Any] = None,
    ) -> None:
        self._enabled = bool(enabled) if enabled is not None else self._read_enabled_default()
        self._devices: Dict[str, Midi2DeviceState] = {}
        self._default_protocol = "midi1"
        self._binding = Midi2TransportBinding()
        self._hub = hub or get_midi_hub()
        self._network_bridge = network_bridge
        self._subscriber_id = f"midi2-manager-{id(self)}"
        self._last_error: Optional[str] = None
        self._last_tx_at: Optional[float] = None
        self._last_tx_hex: Optional[str] = None
        self._last_tx_kind: Optional[str] = None
        self._last_tx_device_id: Optional[str] = None
        self._last_rx_at: Optional[float] = None
        self._last_rx_hex: Optional[str] = None
        self._last_rx_source: Optional[str] = None
        self._last_rx_device_id: Optional[str] = None
        self._local_muid = self._generate_local_muid()
        self._next_request_id = 1
        self._pending_property_requests: Dict[Tuple[int, int], Midi2PendingPropertyRequest] = {}
        self._pending_inbound_chunks: Dict[Tuple[int, int, int], Midi2PendingChunkSet] = {}
        self._discovery_pending_until: Optional[float] = None
        self._discovery_started_at: Optional[float] = None
        self._attach_hub()

    def status(self) -> Dict[str, Any]:
        self._expire_timeouts()
        return {
            "enabled": self._enabled,
            "default_protocol": self._default_protocol,
            "local_muid": f"{self._local_muid:07X}",
            "device_count": len(self._devices),
            "devices": [row.to_dict() for row in self._devices.values()],
            "binding": self._binding.to_dict(),
            "last_error": self._last_error,
            "last_tx_at": self._last_tx_at,
            "last_tx_hex": self._last_tx_hex,
            "last_tx_kind": self._last_tx_kind,
            "last_tx_device_id": self._last_tx_device_id,
            "last_rx_at": self._last_rx_at,
            "last_rx_hex": self._last_rx_hex,
            "last_rx_source": self._last_rx_source,
            "last_rx_device_id": self._last_rx_device_id,
            "discovery_pending_until": self._discovery_pending_until,
        }

    def set_enabled(self, enabled: bool) -> Dict[str, Any]:
        self._enabled = bool(enabled)
        return self.status()

    def set_default_protocol(self, protocol: str) -> Dict[str, Any]:
        mode = str(protocol).strip().lower()
        self._default_protocol = "midi2" if mode == "midi2" else "midi1"
        return self.status()

    def set_hub(self, hub: Optional[MidiHub]) -> None:
        if hub is self._hub:
            return
        if self._hub is not None:
            self._hub.unsubscribe(self._subscriber_id)
        self._hub = hub or get_midi_hub()
        self._attach_hub()

    def set_network_bridge(self, network_bridge: Optional[Any]) -> None:
        self._network_bridge = network_bridge

    def set_binding(self, transport: Optional[str], target_id: Optional[str], response_port: Optional[str] = None) -> Dict[str, Any]:
        normalized_transport = str(transport or "none").strip().lower() or "none"
        normalized_target = str(target_id or "").strip() or None
        normalized_response = str(response_port or "").strip() or None

        if normalized_transport in {"", "none"} or normalized_target is None:
            self._binding = Midi2TransportBinding()
            self._last_error = None
            return self.status()

        if normalized_transport not in {"port", "network_session"}:
            raise ValueError("unsupported_binding_transport")

        if normalized_transport == "port":
            port = self._hub.resolve_port(normalized_target)
            if port is None or not port.can_send():
                raise ValueError("binding_target_not_sendable")
            if normalized_response:
                response = self._hub.resolve_port(normalized_response)
                if response is None or not response.can_receive():
                    raise ValueError("binding_response_not_receivable")
            elif port.can_receive():
                normalized_response = normalized_target
        else:
            bridge = self._resolve_network_bridge()
            sessions = {row["session_id"]: row for row in bridge.list_sessions()}
            session = sessions.get(normalized_target)
            if session is None:
                raise ValueError("binding_session_missing")
            if str(session.get("mode") or "").strip().lower() != "listen":
                raise ValueError("binding_session_not_listening")
            normalized_response = None

        self._binding = Midi2TransportBinding(
            transport=normalized_transport,
            target_id=normalized_target,
            response_port=normalized_response,
            bound_at=time.time(),
        )
        self._last_error = None
        return self.status()

    async def discover(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        payload = bytes(self.build_discovery_sysex())
        transport = await self._send_transport_payload(None, payload, request_kind="discovery")
        if transport.get("ok"):
            self._discovery_started_at = time.time()
            self._discovery_pending_until = self._discovery_started_at + MIDI_CI_DISCOVERY_TIMEOUT_S
            self._last_error = None
        return {
            "ok": bool(transport.get("ok")),
            "probe_id": str(device_id or "discovery"),
            "discovery_sysex": list(payload),
            "transport": transport,
        }

    async def inquire_profiles(self, device_id: str) -> Dict[str, Any]:
        row = self._require_device(device_id)
        payload = self.build_profile_inquiry_sysex(row.device_id)
        row.profile_state = "pending"
        row.pending_request_kind = "profile_inquiry"
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payload(row.device_id, payload, request_kind="profile_inquiry")
        if not transport.get("ok"):
            row.profile_state = "error"
            row.pending_request_kind = None
            row.pending_request_deadline = None
        return {"device": row.to_dict(), "transport": transport}

    async def enable_profile(self, device_id: str, profile_id: str, enabled: bool = True) -> Dict[str, Any]:
        row = self._require_device(device_id)
        normalized_profile_id, profile_bytes = _normalize_profile_id(profile_id)
        payload = self.build_profile_sysex(row.device_id, profile_bytes, enabled)
        row.profile_state = "pending"
        row.pending_request_kind = "profile_enable" if enabled else "profile_disable"
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payload(
            row.device_id,
            payload,
            request_kind="profile_enable" if enabled else "profile_disable",
        )
        if not transport.get("ok"):
            row.profile_state = "error"
            row.pending_request_kind = None
            row.pending_request_deadline = None
            row.last_response_summary = f"Failed to send {'enable' if enabled else 'disable'} request for {normalized_profile_id}"
        else:
            row.last_request_kind = row.pending_request_kind
            row.last_response_summary = f"Awaiting {'enabled' if enabled else 'disabled'} report for {normalized_profile_id}"
        return {"device": row.to_dict(), "transport": transport}

    async def inquire_profile_details(self, device_id: str, profile_id: str, inquiry_target: int = 0x00) -> Dict[str, Any]:
        row = self._require_device(device_id)
        normalized_profile_id, profile_bytes = _normalize_profile_id(profile_id)
        normalized_target = max(0, min(0x7F, int(inquiry_target)))
        payload = self.build_profile_details_sysex(row.device_id, profile_bytes, normalized_target)
        row.profile_state = "pending"
        row.pending_request_kind = "profile_details"
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payload(row.device_id, payload, request_kind="profile_details")
        if not transport.get("ok"):
            row.profile_state = "error"
            row.pending_request_kind = None
            row.pending_request_deadline = None
            row.last_response_summary = f"Failed to send profile details inquiry for {normalized_profile_id}"
        else:
            row.last_response_summary = f"Awaiting profile details target 0x{normalized_target:02X} for {normalized_profile_id}"
        return {"device": row.to_dict(), "transport": transport}

    def get_property(self, device_id: str, resource: str, default: Any = None, *, res_id: Optional[str] = None) -> Any:
        row = self._require_device(device_id)
        return row.properties.get(_resource_key(resource, res_id), default)

    async def inquire_property_exchange_capabilities(self, device_id: str) -> Dict[str, Any]:
        row = self._require_device(device_id)
        payload = self.build_property_exchange_capabilities_sysex(row.device_id)
        row.property_state = "pending"
        row.pending_request_kind = "property_exchange_capabilities"
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payload(row.device_id, payload, request_kind="property_exchange_capabilities")
        if not transport.get("ok"):
            row.property_state = "error"
            row.pending_request_kind = None
            row.pending_request_deadline = None
        return {"device": row.to_dict(), "transport": transport}

    async def invalidate_device(self, device_id: str) -> Dict[str, Any]:
        row = self._require_device(device_id)
        target_muid = int(row.remote_muid or 0)
        payload = self.build_invalidate_muid_sysex(target_muid)
        transport = await self._send_transport_payload(row.device_id, payload, request_kind="invalidate_muid")
        removed_device_ids: List[str] = []
        if transport.get("ok"):
            removed_device_ids = self._discard_device_cache(target_muid)
        return {
            "ok": bool(transport.get("ok")),
            "device_id": device_id,
            "target_muid": f"{target_muid:07X}",
            "removed_device_ids": removed_device_ids,
            "transport": transport,
        }

    async def subscribe_property(self, device_id: str, resource: str, *, res_id: Optional[str] = None) -> Dict[str, Any]:
        row = self._require_device(device_id)
        request_id = self._allocate_request_id()
        header = {"command": "start", "resource": resource}
        if res_id:
            header["resId"] = res_id
        payloads = self.build_property_exchange_chunks(row.device_id, MIDI_CI_SUBSCRIPTION, request_id, header, b"")
        pending = Midi2PendingPropertyRequest(
            device_id=row.device_id,
            remote_muid=int(row.remote_muid or 0),
            request_id=request_id,
            kind="subscription_start",
            resource=resource,
            res_id=res_id,
        )
        self._pending_property_requests[(pending.remote_muid, request_id)] = pending
        row.property_state = "pending"
        row.pending_request_kind = "subscription_start"
        row.pending_request_id = request_id
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payloads(row.device_id, payloads, request_kind="subscription_start", request_id=request_id)
        if not transport.get("ok"):
            self._pending_property_requests.pop((pending.remote_muid, request_id), None)
            row.property_state = "error"
            row.pending_request_kind = None
            row.pending_request_id = None
            row.pending_request_deadline = None
        return {"device": row.to_dict(), "transport": transport}

    async def end_subscription(self, device_id: str, subscribe_id: str) -> Dict[str, Any]:
        row = self._require_device(device_id)
        normalized_subscribe_id = str(subscribe_id or "").strip()
        if not normalized_subscribe_id:
            raise ValueError("subscription_id_required")
        subscription = row.subscriptions.get(normalized_subscribe_id)
        request_id = self._allocate_request_id()
        header: Dict[str, Any] = {"command": "end", "subscribeId": normalized_subscribe_id}
        if isinstance(subscription, dict):
            if subscription.get("resource"):
                header["resource"] = subscription["resource"]
            if subscription.get("res_id"):
                header["resId"] = subscription["res_id"]
        payloads = self.build_property_exchange_chunks(row.device_id, MIDI_CI_SUBSCRIPTION, request_id, header, b"")
        pending = Midi2PendingPropertyRequest(
            device_id=row.device_id,
            remote_muid=int(row.remote_muid or 0),
            request_id=request_id,
            kind="subscription_end",
            resource=str(header.get("resource") or ""),
            res_id=str(header.get("resId") or "").strip() or None,
            subscribe_id=normalized_subscribe_id,
        )
        self._pending_property_requests[(pending.remote_muid, request_id)] = pending
        row.property_state = "pending"
        row.pending_request_kind = "subscription_end"
        row.pending_request_id = request_id
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payloads(row.device_id, payloads, request_kind="subscription_end", request_id=request_id)
        if not transport.get("ok"):
            self._pending_property_requests.pop((pending.remote_muid, request_id), None)
            row.property_state = "error"
            row.pending_request_kind = None
            row.pending_request_id = None
            row.pending_request_deadline = None
        return {"device": row.to_dict(), "transport": transport}

    async def query_property(self, device_id: str, resource: str, *, res_id: Optional[str] = None) -> Dict[str, Any]:
        row = self._require_device(device_id)
        request_id = self._allocate_request_id()
        header = {"resource": resource}
        if res_id:
            header["resId"] = res_id
        payloads = self.build_property_exchange_chunks(row.device_id, MIDI_CI_PE_GET, request_id, header, b"")
        pending = Midi2PendingPropertyRequest(
            device_id=row.device_id,
            remote_muid=int(row.remote_muid or 0),
            request_id=request_id,
            kind="property_get",
            resource=resource,
            res_id=res_id,
        )
        self._pending_property_requests[(pending.remote_muid, request_id)] = pending
        row.property_state = "pending"
        row.pending_request_kind = "property_get"
        row.pending_request_id = request_id
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payloads(row.device_id, payloads, request_kind="property_get", request_id=request_id)
        if not transport.get("ok"):
            self._pending_property_requests.pop((pending.remote_muid, request_id), None)
            row.property_state = "error"
            row.pending_request_kind = None
            row.pending_request_id = None
            row.pending_request_deadline = None
        return {"device": row.to_dict(), "transport": transport}

    async def set_property(self, device_id: str, resource: str, value: Any, *, res_id: Optional[str] = None) -> Dict[str, Any]:
        row = self._require_device(device_id)
        request_id = self._allocate_request_id()
        header = {"resource": resource}
        if res_id:
            header["resId"] = res_id
        payloads = self.build_property_exchange_chunks(
            row.device_id,
            MIDI_CI_PE_SET,
            request_id,
            header,
            _encode_json_ascii(value),
        )
        pending = Midi2PendingPropertyRequest(
            device_id=row.device_id,
            remote_muid=int(row.remote_muid or 0),
            request_id=request_id,
            kind="property_set",
            resource=resource,
            res_id=res_id,
            value=value,
        )
        self._pending_property_requests[(pending.remote_muid, request_id)] = pending
        row.property_state = "pending"
        row.pending_request_kind = "property_set"
        row.pending_request_id = request_id
        row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S
        transport = await self._send_transport_payloads(row.device_id, payloads, request_kind="property_set", request_id=request_id)
        if not transport.get("ok"):
            self._pending_property_requests.pop((pending.remote_muid, request_id), None)
            row.property_state = "error"
            row.pending_request_kind = None
            row.pending_request_id = None
            row.pending_request_deadline = None
        return {"device": row.to_dict(), "transport": transport}

    def build_discovery_sysex(self) -> List[int]:
        digest = hashlib.sha1(f"{self._local_muid}:{id(self)}".encode("utf-8")).digest()
        manufacturer = [0x7D, 0x00, 0x00]
        family = [digest[0] & 0x7F, digest[1] & 0x7F]
        model = [digest[2] & 0x7F, digest[3] & 0x7F]
        version = [digest[4] & 0x7F, digest[5] & 0x7F, digest[6] & 0x7F, digest[7] & 0x7F]
        capabilities = (1 << 2) | (1 << 3)
        payload = [
            0xF0,
            0x7E,
            MIDI_CI_DEVICE_FUNCTION_BLOCK,
            MIDI_CI_SUBID,
            MIDI_CI_DISCOVERY,
            MIDI_CI_VERSION,
            *_encode_u7_lsb(self._local_muid, 4),
            *_encode_u7_lsb(MIDI_CI_BROADCAST_MUID, 4),
            *manufacturer,
            *family,
            *model,
            *version,
            capabilities & 0x7F,
            *_encode_u7_lsb(MIDI_CI_MAX_SYSEX, 4),
            0x00,
            0xF7,
        ]
        return payload

    def build_profile_inquiry_sysex(self, device_id: str) -> bytes:
        row = self._require_device(device_id)
        return bytes(
            [
                0xF0,
                0x7E,
                MIDI_CI_DEVICE_FUNCTION_BLOCK,
                MIDI_CI_SUBID,
                MIDI_CI_PROFILE_INQUIRY,
                MIDI_CI_VERSION,
                *_encode_u7_lsb(self._local_muid, 4),
                *_encode_u7_lsb(int(row.remote_muid or 0), 4),
                0xF7,
            ]
        )

    def build_profile_sysex(self, device_id: str, profile_bytes: bytes, enabled: bool) -> bytes:
        row = self._require_device(device_id)
        subid = MIDI_CI_SET_PROFILE_ON if enabled else MIDI_CI_SET_PROFILE_OFF
        trailing = [0x00, 0x00]
        return bytes(
            [
                0xF0,
                0x7E,
                MIDI_CI_DEVICE_FUNCTION_BLOCK,
                MIDI_CI_SUBID,
                subid,
                MIDI_CI_VERSION,
                *_encode_u7_lsb(self._local_muid, 4),
                *_encode_u7_lsb(int(row.remote_muid or 0), 4),
                *(int(byte) & 0x7F for byte in profile_bytes[:5]),
                *trailing,
                0xF7,
            ]
        )

    def build_profile_details_sysex(self, device_id: str, profile_bytes: bytes, inquiry_target: int) -> bytes:
        row = self._require_device(device_id)
        return bytes(
            [
                0xF0,
                0x7E,
                MIDI_CI_DEVICE_FUNCTION_BLOCK,
                MIDI_CI_SUBID,
                MIDI_CI_PROFILE_DETAILS_INQUIRY,
                MIDI_CI_VERSION,
                *_encode_u7_lsb(self._local_muid, 4),
                *_encode_u7_lsb(int(row.remote_muid or 0), 4),
                *(int(byte) & 0x7F for byte in profile_bytes[:5]),
                int(inquiry_target) & 0x7F,
                0xF7,
            ]
        )

    def build_property_exchange_capabilities_sysex(self, device_id: str) -> bytes:
        row = self._require_device(device_id)
        return bytes(
            [
                0xF0,
                0x7E,
                MIDI_CI_DEVICE_FUNCTION_BLOCK,
                MIDI_CI_SUBID,
                MIDI_CI_PE_CAPS_INQUIRY,
                MIDI_CI_VERSION,
                *_encode_u7_lsb(self._local_muid, 4),
                *_encode_u7_lsb(int(row.remote_muid or 0), 4),
                0x01,
                0x00,
                0x00,
                0xF7,
            ]
        )

    def build_property_exchange_chunks(
        self,
        device_id: str,
        subid2: int,
        request_id: int,
        header_data: Dict[str, Any],
        property_bytes: bytes = b"",
    ) -> List[bytes]:
        row = self._require_device(device_id)
        header_bytes = _encode_json_ascii(header_data)
        normalized_property_bytes = bytes(property_bytes or b"")
        if len(header_bytes) > 0x3FFF or len(normalized_property_bytes) > 0x3FFF:
            raise ValueError("property_payload_too_large")

        max_sysex_size = max(64, int(row.max_sysex_size or MIDI_CI_MAX_SYSEX))
        max_chunk_payload = max(1, max_sysex_size - 24)
        chunks: List[Tuple[bytes, bytes]] = []
        remaining_header = header_bytes
        remaining_property = normalized_property_bytes

        while remaining_header or remaining_property or not chunks:
            header_chunk = b""
            property_chunk = b""
            if remaining_header:
                header_chunk = remaining_header[:max_chunk_payload]
                remaining_header = remaining_header[len(header_chunk):]
                if not remaining_header:
                    property_capacity = max_chunk_payload - len(header_chunk)
                    property_chunk = remaining_property[:property_capacity]
                    remaining_property = remaining_property[len(property_chunk):]
            else:
                property_chunk = remaining_property[:max_chunk_payload]
                remaining_property = remaining_property[len(property_chunk):]
            chunks.append((header_chunk, property_chunk))

        total_chunks = len(chunks)
        messages: List[bytes] = []
        for index, (header_chunk, property_chunk) in enumerate(chunks, start=1):
            messages.append(
                bytes(
                    [
                        0xF0,
                        0x7E,
                        MIDI_CI_DEVICE_FUNCTION_BLOCK,
                        MIDI_CI_SUBID,
                        int(subid2) & 0x7F,
                        MIDI_CI_VERSION,
                        *_encode_u7_lsb(self._local_muid, 4),
                        *_encode_u7_lsb(int(row.remote_muid or 0), 4),
                        int(request_id) & 0x7F,
                        *_encode_u7_lsb(len(header_chunk), 2),
                        *(int(byte) & 0x7F for byte in header_chunk),
                        *_encode_u7_lsb(total_chunks, 2),
                        *_encode_u7_lsb(index, 2),
                        *_encode_u7_lsb(len(property_chunk), 2),
                        *(int(byte) & 0x7F for byte in property_chunk),
                        0xF7,
                    ]
                )
            )
        return messages

    def build_property_get_sysex(self, device_id: str, request_id: int, header_data: Dict[str, Any]) -> bytes:
        return self.build_property_exchange_chunks(device_id, MIDI_CI_PE_GET, request_id, header_data, b"")[0]

    def build_property_set_sysex(self, device_id: str, request_id: int, header_data: Dict[str, Any], value: Any) -> bytes:
        return self.build_property_exchange_chunks(device_id, MIDI_CI_PE_SET, request_id, header_data, _encode_json_ascii(value))[0]

    def build_subscription_sysex(
        self,
        device_id: str,
        request_id: int,
        header_data: Dict[str, Any],
        property_bytes: bytes = b"",
    ) -> List[bytes]:
        return self.build_property_exchange_chunks(device_id, MIDI_CI_SUBSCRIPTION, request_id, header_data, property_bytes)

    def build_subscription_reply_sysex(self, device_id: str, request_id: int, header_data: Dict[str, Any]) -> List[bytes]:
        return self.build_property_exchange_chunks(device_id, MIDI_CI_SUBSCRIPTION_REPLY, request_id, header_data, b"")

    def build_notify_sysex(self, device_id: str, request_id: int, status: int) -> List[bytes]:
        return self.build_property_exchange_chunks(device_id, MIDI_CI_NOTIFY, request_id, {"status": int(status)}, b"")

    def build_invalidate_muid_sysex(self, target_muid: int) -> bytes:
        return bytes(
            [
                0xF0,
                0x7E,
                MIDI_CI_DEVICE_FUNCTION_BLOCK,
                MIDI_CI_SUBID,
                MIDI_CI_INVALIDATE_MUID,
                MIDI_CI_VERSION,
                *_encode_u7_lsb(self._local_muid, 4),
                *_encode_u7_lsb(MIDI_CI_BROADCAST_MUID, 4),
                *_encode_u7_lsb(int(target_muid) & MIDI_CI_BROADCAST_MUID, 4),
                0xF7,
            ]
        )

    def midi1_to_ump(self, data: bytes) -> List[int]:
        if not data:
            return []

        payload = bytes(data)
        if len(payload) >= 2 and payload[0] == 0xF0 and payload[-1] == 0xF7:
            sysex_data = list(payload[1:-1])
            if not sysex_data:
                return [0x30000000, 0x00000000]
            chunks = [sysex_data[index:index + 6] for index in range(0, len(sysex_data), 6)]
            words: List[int] = []
            for index, chunk in enumerate(chunks):
                if len(chunks) == 1:
                    status = 0x0
                elif index == 0:
                    status = 0x1
                elif index == len(chunks) - 1:
                    status = 0x3
                else:
                    status = 0x2
                padded = chunk + [0] * (6 - len(chunk))
                word1 = (
                    (0x3 << 28)
                    | (0x0 << 24)
                    | (((status & 0xF) << 4 | (len(chunk) & 0xF)) << 16)
                    | ((padded[0] & 0xFF) << 8)
                    | (padded[1] & 0xFF)
                )
                word2 = (
                    ((padded[2] & 0xFF) << 24)
                    | ((padded[3] & 0xFF) << 16)
                    | ((padded[4] & 0xFF) << 8)
                    | (padded[5] & 0xFF)
                )
                words.extend([word1, word2])
            return words

        status = int(payload[0]) & 0xFF
        expected_length = self._midi1_message_length(status)
        if expected_length <= 0:
            return []

        compact = list(bytes(payload[:expected_length]))
        while len(compact) < expected_length:
            compact.append(0)
        data1 = compact[1] if expected_length > 1 else 0
        data2 = compact[2] if expected_length > 2 else 0
        message_type = 0x2 if status < 0xF0 else 0x1
        word = (
            ((message_type & 0xF) << 28)
            | ((0x0 & 0xF) << 24)
            | ((status & 0xFF) << 16)
            | ((data1 & 0xFF) << 8)
            | (data2 & 0xFF)
        )
        return [word]

    def ump_to_midi1(self, words: List[int]) -> bytes:
        if not words:
            return b""

        output = bytearray()
        index = 0
        while index < len(words):
            word = int(words[index])
            message_type = (word >> 28) & 0xF

            if message_type in {0x1, 0x2}:
                status = (word >> 16) & 0xFF
                expected_length = self._midi1_message_length(status)
                if expected_length <= 0:
                    return bytes(output)
                data1 = (word >> 8) & 0xFF
                data2 = word & 0xFF
                if expected_length == 1:
                    output.extend([status])
                elif expected_length == 2:
                    output.extend([status, data1])
                else:
                    output.extend([status, data1, data2])
                index += 1
                continue

            if message_type != 0x3 or index + 1 >= len(words):
                return bytes(output)

            word2 = int(words[index + 1])
            status_count = (word >> 16) & 0xFF
            sysex_status = (status_count >> 4) & 0xF
            count = status_count & 0xF
            chunk = [
                (word >> 8) & 0xFF,
                word & 0xFF,
                (word2 >> 24) & 0xFF,
                (word2 >> 16) & 0xFF,
                (word2 >> 8) & 0xFF,
                word2 & 0xFF,
            ][:count]

            if sysex_status == 0x0:
                output.extend([0xF0, *chunk, 0xF7])
            elif sysex_status == 0x1:
                output.extend([0xF0, *chunk])
            elif sysex_status == 0x2:
                output.extend(chunk)
            elif sysex_status == 0x3:
                output.extend(chunk)
                output.append(0xF7)
            index += 2

        return bytes(output)

    def inspect_ump(self, words: List[int]) -> List[Dict[str, Any]]:
        messages: List[Dict[str, Any]] = []
        index = 0
        while index < len(words):
            word = int(words[index]) & 0xFFFFFFFF
            message_type = (word >> 28) & 0xF
            group = (word >> 24) & 0xF

            if message_type == 0x0:
                opcode = (word >> 16) & 0xF
                ticks = word & 0xFFFF
                utility_kind = {
                    0x0: "noop",
                    0x1: "jr_clock",
                    0x2: "jr_timestamp",
                    0x3: "delta_clockstamp",
                }.get(opcode, "utility")
                messages.append(
                    {
                        "type": "utility",
                        "group": group,
                        "opcode": opcode,
                        "kind": utility_kind,
                        "ticks": ticks,
                    }
                )
                index += 1
                continue

            if message_type in {0x1, 0x2}:
                status = (word >> 16) & 0xFF
                expected_length = self._midi1_message_length(status)
                data1 = (word >> 8) & 0xFF
                data2 = word & 0xFF
                payload = [status]
                if expected_length > 1:
                    payload.append(data1)
                if expected_length > 2:
                    payload.append(data2)
                messages.append(
                    {
                        "type": "midi1",
                        "group": group,
                        "status": status,
                        "message_hex": _format_hex_bytes(bytes(payload)),
                    }
                )
                index += 1
                continue

            if message_type == 0x3 and index + 1 < len(words):
                word2 = int(words[index + 1]) & 0xFFFFFFFF
                status_count = (word >> 16) & 0xFF
                sysex_status = (status_count >> 4) & 0xF
                count = status_count & 0xF
                data_bytes = bytes(
                    [
                        (word >> 8) & 0xFF,
                        word & 0xFF,
                        (word2 >> 24) & 0xFF,
                        (word2 >> 16) & 0xFF,
                        (word2 >> 8) & 0xFF,
                        word2 & 0xFF,
                    ][:count]
                )
                messages.append(
                    {
                        "type": "sysex7",
                        "group": group,
                        "status": sysex_status,
                        "status_label": {
                            0x0: "complete",
                            0x1: "start",
                            0x2: "continue",
                            0x3: "end",
                        }.get(sysex_status, "unknown"),
                        "data_hex": _format_hex_bytes(data_bytes),
                    }
                )
                index += 2
                continue

            if message_type == 0x4 and index + 1 < len(words):
                word2 = int(words[index + 1]) & 0xFFFFFFFF
                status_byte = (word >> 16) & 0xFF
                status = (status_byte >> 4) & 0xF
                channel = status_byte & 0xF
                byte3 = (word >> 8) & 0xFF
                byte4 = word & 0xFF
                raw_hex = _format_hex_bytes(word.to_bytes(4, "big") + word2.to_bytes(4, "big"))
                decoded: Dict[str, Any] = {
                    "type": "midi2_channel_voice",
                    "group": group,
                    "channel": channel + 1,
                    "status": status,
                    "raw_hex": raw_hex,
                }
                if status in {0x8, 0x9}:
                    decoded.update(
                        {
                            "kind": "note_on" if status == 0x9 else "note_off",
                            "note": byte3 & 0x7F,
                            "attribute_type": byte4,
                            "velocity": word2 & 0xFFFFFFFF,
                        }
                    )
                elif status == 0xA:
                    decoded.update({"kind": "poly_pressure", "note": byte3 & 0x7F, "value": word2 & 0xFFFFFFFF})
                elif status == 0xB:
                    decoded.update({"kind": "control_change", "controller": byte3 & 0x7F, "value": word2 & 0xFFFFFFFF})
                elif status in {0x2, 0x3, 0x4, 0x5, 0x6}:
                    decoded.update({"kind": "per_note_or_assignable", "index": byte4 & 0x7F, "note": byte3 & 0x7F, "value": word2 & 0xFFFFFFFF})
                elif status == 0xC:
                    decoded.update(
                        {
                            "kind": "program_change",
                            "options": byte4,
                            "program": (word2 >> 8) & 0x7F,
                            "bank_msb": (word2 >> 8) & 0x7F,
                            "bank_lsb": word2 & 0x7F,
                        }
                    )
                elif status == 0xD:
                    decoded.update({"kind": "channel_pressure", "value": word2 & 0xFFFFFFFF})
                elif status == 0xE:
                    decoded.update({"kind": "pitch_bend", "value": word2 & 0xFFFFFFFF})
                else:
                    decoded["kind"] = "midi2_channel_voice"
                messages.append(decoded)
                index += 2
                continue

            if message_type == 0x5 and index + 3 < len(words):
                bytes_ = b"".join(int(words[index + offset] & 0xFFFFFFFF).to_bytes(4, "big") for offset in range(4))
                status = bytes_[1] & 0x0F
                count = bytes_[2] & 0x0F
                payload = bytes_[3:3 + count]
                stream_id = payload[0] if payload else None
                data_bytes = payload[1:] if len(payload) > 1 else b""
                messages.append(
                    {
                        "type": "sysex8_or_data",
                        "group": group,
                        "status": status,
                        "status_label": {
                            0x0: "complete",
                            0x1: "start",
                            0x2: "continue",
                            0x3: "end",
                        }.get(status, "other"),
                        "count": count,
                        "stream_id": stream_id,
                        "data_hex": _format_hex_bytes(data_bytes),
                    }
                )
                index += 4
                continue

            messages.append(
                {
                    "type": "unknown",
                    "group": group,
                    "message_type": message_type,
                    "raw_hex": _format_hex_bytes(word.to_bytes(4, "big")),
                }
            )
            index += 1

        return messages

    @staticmethod
    def _midi1_message_length(status: int) -> int:
        status_byte = int(status) & 0xFF
        if status_byte < 0x80:
            return 0
        if status_byte < 0xF0:
            high_nibble = status_byte & 0xF0
            if high_nibble in {0xC0, 0xD0}:
                return 2
            return 3

        return {
            0xF1: 2,
            0xF2: 3,
            0xF3: 2,
            0xF6: 1,
            0xF8: 1,
            0xF9: 1,
            0xFA: 1,
            0xFB: 1,
            0xFC: 1,
            0xFE: 1,
            0xFF: 1,
        }.get(status_byte, 0)

    def close(self) -> None:
        if self._hub is not None:
            self._hub.unsubscribe(self._subscriber_id)

    def _attach_hub(self) -> None:
        if self._hub is not None:
            self._hub.subscribe(self._subscriber_id, self._handle_hub_message)

    def _resolve_network_bridge(self) -> Any:
        if self._network_bridge is not None:
            return self._network_bridge
        from app.services.midi_hub.network import get_midi_network_bridge

        self._network_bridge = get_midi_network_bridge()
        return self._network_bridge

    def _require_device(self, device_id: str) -> Midi2DeviceState:
        normalized = str(device_id or "").strip()
        row = self._devices.get(normalized)
        if row is None or row.remote_muid is None:
            raise ValueError("midi2_device_unknown")
        return row

    def _allocate_request_id(self) -> int:
        request_id = self._next_request_id
        self._next_request_id += 1
        if self._next_request_id > 0x7F:
            self._next_request_id = 1
        return request_id

    def _expire_timeouts(self) -> None:
        now = time.time()
        if self._discovery_pending_until and now >= self._discovery_pending_until:
            self._discovery_pending_until = None
            if self._last_rx_at is None or (self._discovery_started_at and self._last_rx_at < self._discovery_started_at):
                self._last_error = "discovery_timeout"

        for key, pending in list(self._pending_inbound_chunks.items()):
            if now - pending.updated_at >= MIDI_CI_REQUEST_TIMEOUT_S:
                self._pending_inbound_chunks.pop(key, None)

        expired_property_keys: List[Tuple[int, int]] = []
        for row in self._devices.values():
            deadline = row.pending_request_deadline
            if deadline is None or now < deadline:
                continue
            if row.pending_request_kind and row.pending_request_kind.startswith("property"):
                row.property_state = "timeout"
            elif row.pending_request_kind and row.pending_request_kind.startswith("profile"):
                row.profile_state = "timeout"
            row.last_response_summary = "Timed out waiting for reply"
            if row.pending_request_id is not None and row.remote_muid is not None:
                expired_property_keys.append((int(row.remote_muid), int(row.pending_request_id)))
            row.pending_request_kind = None
            row.pending_request_id = None
            row.pending_request_deadline = None

        for key in expired_property_keys:
            self._pending_property_requests.pop(key, None)

    def _discard_device_cache(self, target_muid: int) -> List[str]:
        normalized_target = int(target_muid) & MIDI_CI_BROADCAST_MUID
        removed_device_ids: List[str] = []
        for key, row in list(self._devices.items()):
            if int(row.remote_muid or -1) != normalized_target:
                continue
            removed_device_ids.append(key)
            self._devices.pop(key, None)
        for request_key in list(self._pending_property_requests.keys()):
            if request_key[0] == normalized_target:
                self._pending_property_requests.pop(request_key, None)
        for request_key in list(self._pending_inbound_chunks.keys()):
            if request_key[0] == normalized_target:
                self._pending_inbound_chunks.pop(request_key, None)
        if self._last_rx_device_id in removed_device_ids:
            self._last_rx_device_id = None
        if self._last_tx_device_id in removed_device_ids:
            self._last_tx_device_id = None
        return removed_device_ids

    @staticmethod
    def _parse_pe_chunk(data: bytes) -> Optional[Dict[str, Any]]:
        if len(data) < 23:
            return None
        request_id = int(data[14]) & 0x7F
        header_length = _decode_u7_lsb(data, 15, 2)
        offset = 17
        header_bytes = data[offset:offset + header_length]
        offset += header_length
        if offset + 6 > len(data) - 1:
            return None
        chunk_count = _decode_u7_lsb(data, offset, 2)
        offset += 2
        chunk_number = _decode_u7_lsb(data, offset, 2)
        offset += 2
        property_length = _decode_u7_lsb(data, offset, 2)
        offset += 2
        property_bytes = data[offset:offset + property_length]
        return {
            "request_id": request_id,
            "header_bytes": bytes(header_bytes),
            "chunk_count": int(chunk_count),
            "chunk_number": int(chunk_number),
            "property_bytes": bytes(property_bytes),
        }

    def _collect_pe_chunk(self, source_muid: int, subid2: int, chunk: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        request_id = int(chunk["request_id"])
        chunk_count = int(chunk["chunk_count"])
        chunk_number = max(1, int(chunk["chunk_number"] or 1))
        if chunk_count in {0, 1}:
            return {
                "request_id": request_id,
                "header_bytes": bytes(chunk["header_bytes"]),
                "property_bytes": bytes(chunk["property_bytes"]),
            }

        key = (int(source_muid), request_id, int(subid2))
        pending = self._pending_inbound_chunks.setdefault(
            key,
            Midi2PendingChunkSet(
                subid2=int(subid2),
                request_id=request_id,
                source_muid=int(source_muid),
                expected_chunks=chunk_count,
            ),
        )
        pending.expected_chunks = chunk_count
        pending.header_chunks[chunk_number] = bytes(chunk["header_bytes"])
        pending.property_chunks[chunk_number] = bytes(chunk["property_bytes"])
        pending.updated_at = time.time()
        if pending.expected_chunks is None:
            return None
        if len(pending.header_chunks) < pending.expected_chunks or len(pending.property_chunks) < pending.expected_chunks:
            return None

        self._pending_inbound_chunks.pop(key, None)
        header_bytes = b"".join(pending.header_chunks.get(index, b"") for index in range(1, pending.expected_chunks + 1))
        property_bytes = b"".join(pending.property_chunks.get(index, b"") for index in range(1, pending.expected_chunks + 1))
        return {
            "request_id": request_id,
            "header_bytes": header_bytes,
            "property_bytes": property_bytes,
        }

    def _generate_local_muid(self) -> int:
        seed = f"{time.time_ns()}:{id(self)}".encode("utf-8")
        digest = hashlib.sha1(seed).digest()
        return int.from_bytes(digest[:4], "little") & MIDI_CI_BROADCAST_MUID

    async def _send_transport_payload(
        self,
        device_id: Optional[str],
        payload: bytes,
        *,
        request_kind: str,
        request_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        if not self._enabled:
            self._last_error = "midi2_disabled"
            return {"ok": False, "reason": "midi2_disabled"}
        if self._binding.transport == "none" or not self._binding.target_id:
            self._last_error = "binding_required"
            return {"ok": False, "reason": "binding_required"}

        payload_bytes = bytes(payload)
        payload_hex = payload_bytes.hex(" ").upper()
        transport = self._binding.transport
        target_id = self._binding.target_id
        ok = False

        if transport == "port":
            ok = bool(
                self._hub.send(
                    source_port=f"midi2:{device_id or 'discovery'}",
                    destination_port=target_id,
                    data=payload_bytes,
                    metadata={
                        "midi2_transport": transport,
                        "midi2_target_id": target_id,
                        "midi2_device_id": device_id,
                        "midi2_request_kind": request_kind,
                        "midi2_request_id": request_id,
                    },
                )
            )
        elif transport == "network_session":
            ok = bool(await self._resolve_network_bridge().send_midi(target_id, payload_bytes))

        now = time.time()
        if device_id and device_id in self._devices:
            row = self._devices[device_id]
            row.last_request_at = now
            row.last_request_hex = payload_hex
            row.last_request_kind = request_kind
            row.last_request_id = request_id

        self._last_tx_at = now
        self._last_tx_hex = payload_hex
        self._last_tx_kind = request_kind
        self._last_tx_device_id = device_id
        if not ok:
            self._last_error = "transport_send_failed"
        elif self._last_error in {None, "transport_send_failed", "binding_required", "midi2_disabled"}:
            self._last_error = None

        return {
            "ok": ok,
            "transport": transport,
            "target_id": target_id,
            "response_port": self._binding.response_port,
            "request_kind": request_kind,
            "request_id": request_id,
            "awaiting_reply": bool(ok),
            "payload_hex": payload_hex,
        }

    async def _send_transport_payloads(
        self,
        device_id: Optional[str],
        payloads: List[bytes],
        *,
        request_kind: str,
        request_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        normalized_payloads = [bytes(payload) for payload in payloads if payload]
        if not normalized_payloads:
            return {"ok": False, "reason": "empty_payload"}
        results: List[Dict[str, Any]] = []
        for payload in normalized_payloads:
            result = await self._send_transport_payload(
                device_id,
                payload,
                request_kind=request_kind,
                request_id=request_id,
            )
            results.append(result)
            if not result.get("ok"):
                combined_hex = " || ".join(item.get("payload_hex") or "" for item in results if item.get("payload_hex"))
                if device_id and device_id in self._devices:
                    self._devices[device_id].last_request_hex = combined_hex
                self._last_tx_hex = combined_hex or self._last_tx_hex
                return {
                    **result,
                    "chunk_count": len(normalized_payloads),
                    "payload_hex": combined_hex,
                }

        combined_hex = " || ".join(item.get("payload_hex") or "" for item in results if item.get("payload_hex"))
        if device_id and device_id in self._devices:
            self._devices[device_id].last_request_hex = combined_hex
        self._last_tx_hex = combined_hex or self._last_tx_hex
        return {
            **results[-1],
            "ok": True,
            "chunk_count": len(normalized_payloads),
            "payload_hex": combined_hex,
        }

    def _send_transport_payload_nowait(
        self,
        device_id: Optional[str],
        payloads: List[bytes],
        *,
        request_kind: str,
        request_id: Optional[int] = None,
    ) -> None:
        if not payloads:
            return
        coro = self._send_transport_payloads(
            device_id,
            payloads,
            request_kind=request_kind,
            request_id=request_id,
        )
        self._run_coroutine(coro)

    @staticmethod
    def _run_coroutine(coro: Any) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coro)
            return
        loop.create_task(coro)

    def _handle_hub_message(self, message: MidiMessage) -> None:
        data = bytes(message.data or b"")
        if len(data) < 15 or data[0] != 0xF0 or data[-1] != 0xF7:
            return
        if data[1] != 0x7E or data[3] != MIDI_CI_SUBID:
            return
        if not self._binding.target_id or self._binding.transport == "none":
            return

        source_port = str(message.source_port or "")
        destination_port = str(message.destination_port or "")

        if self._binding.transport == "port":
            response_port = self._binding.response_port or self._binding.target_id
            if source_port != response_port and destination_port != response_port:
                return
        elif self._binding.transport == "network_session":
            expected_prefix = f"network:{self._binding.target_id}:"
            if not source_port.startswith(expected_prefix):
                return

        subid2 = int(data[4]) & 0x7F
        source_muid = _decode_u7_lsb(data, 6, 4)
        destination_muid = _decode_u7_lsb(data, 10, 4)

        if subid2 == MIDI_CI_DISCOVERY and source_muid == self._local_muid:
            self._handle_local_muid_collision()
            return

        if subid2 == MIDI_CI_DISCOVERY_REPLY and destination_muid != self._local_muid:
            return
        if subid2 in {
            MIDI_CI_PROFILE_INQUIRY_REPLY,
            MIDI_CI_PROFILE_DETAILS_REPLY,
            MIDI_CI_PE_CAPS_REPLY,
            MIDI_CI_PE_GET_REPLY,
            MIDI_CI_PE_SET_REPLY,
            MIDI_CI_SUBSCRIPTION,
            MIDI_CI_SUBSCRIPTION_REPLY,
            MIDI_CI_NOTIFY,
        } and destination_muid != self._local_muid:
            return
        if subid2 in {MIDI_CI_PROFILE_ENABLED_REPORT, MIDI_CI_PROFILE_DISABLED_REPORT} and destination_muid not in {
            self._local_muid,
            MIDI_CI_BROADCAST_MUID,
        }:
            return

        now = time.time()
        payload_hex = data.hex(" ").upper()
        row = self._devices.setdefault(_device_id_from_muid(source_muid), Midi2DeviceState(device_id=_device_id_from_muid(source_muid)))
        previous_response_source = row.last_response_source
        row.remote_muid = source_muid
        row.protocol = self._default_protocol
        row.last_response_at = now
        row.last_response_hex = payload_hex
        row.last_response_source = source_port or destination_port or None

        self._last_rx_at = now
        self._last_rx_hex = payload_hex
        self._last_rx_source = source_port or destination_port or None
        self._last_rx_device_id = row.device_id

        if subid2 == MIDI_CI_INVALIDATE_MUID:
            self._handle_invalidate_muid(data)
            return

        if subid2 == MIDI_CI_DISCOVERY_REPLY and row.discovery_state == "confirmed":
            current_source = source_port or destination_port or None
            if previous_response_source and current_source and previous_response_source != current_source:
                self._handle_remote_muid_collision(source_muid)
                return

        if subid2 == MIDI_CI_DISCOVERY_REPLY:
            self._handle_discovery_reply(row, data)
            return
        if subid2 == MIDI_CI_PROFILE_INQUIRY_REPLY:
            self._handle_profile_inquiry_reply(row, data)
            return
        if subid2 == MIDI_CI_PROFILE_DETAILS_REPLY:
            self._handle_profile_details_reply(row, data)
            return
        if subid2 in {MIDI_CI_PROFILE_ENABLED_REPORT, MIDI_CI_PROFILE_DISABLED_REPORT}:
            self._handle_profile_report(row, data, enabled=subid2 == MIDI_CI_PROFILE_ENABLED_REPORT)
            return
        if subid2 == MIDI_CI_PE_CAPS_REPLY:
            self._handle_pe_caps_reply(row, data)
            return
        if subid2 in {MIDI_CI_PE_GET_REPLY, MIDI_CI_PE_SET_REPLY, MIDI_CI_SUBSCRIPTION, MIDI_CI_SUBSCRIPTION_REPLY, MIDI_CI_NOTIFY}:
            chunk = self._parse_pe_chunk(data)
            if chunk is None:
                return
            assembled = self._collect_pe_chunk(source_muid, subid2, chunk)
            if assembled is None:
                self._touch_pending_request(row, int(chunk["request_id"]))
                return
            request_id = int(assembled["request_id"])
            if subid2 in {MIDI_CI_PE_GET_REPLY, MIDI_CI_PE_SET_REPLY}:
                self._handle_property_reply(
                    row,
                    request_id,
                    assembled["header_bytes"],
                    assembled["property_bytes"],
                    kind="property_get" if subid2 == MIDI_CI_PE_GET_REPLY else "property_set",
                )
                return
            if subid2 == MIDI_CI_SUBSCRIPTION_REPLY:
                self._handle_subscription_reply(row, request_id, assembled["header_bytes"])
                return
            if subid2 == MIDI_CI_SUBSCRIPTION:
                self._handle_subscription_message(row, request_id, assembled["header_bytes"], assembled["property_bytes"])
                return
            if subid2 == MIDI_CI_NOTIFY:
                self._handle_notify_message(row, request_id, assembled["header_bytes"])

    def _handle_discovery_reply(self, row: Midi2DeviceState, data: bytes) -> None:
        row.discovery_state = "confirmed"
        row.last_discovery_at = time.time()
        row.manufacturer_id = _format_hex_bytes(data[14:17]) if len(data) >= 17 else None
        row.family_id = _format_hex_bytes(data[17:19]) if len(data) >= 19 else None
        row.model_id = _format_hex_bytes(data[19:21]) if len(data) >= 21 else None
        row.software_revision = _format_hex_bytes(data[21:25]) if len(data) >= 25 else None
        capabilities = int(data[25]) & 0x7F if len(data) >= 26 else 0
        row.supports_profiles = bool(capabilities & (1 << 2))
        row.supports_property_exchange = bool(capabilities & (1 << 3))
        row.max_sysex_size = _decode_u7_lsb(data, 26, 4) if len(data) >= 30 else None
        row.last_response_summary = "Discovery reply received"
        self._discovery_pending_until = None
        self._last_error = None

    def _handle_profile_inquiry_reply(self, row: Midi2DeviceState, data: bytes) -> None:
        offset = 14
        enabled_count = _decode_u7_lsb(data, offset, 2)
        offset += 2
        profiles: Dict[str, bool] = {}
        for _ in range(enabled_count):
            if offset + 5 > len(data) - 1:
                break
            profile_id = _format_hex_bytes(data[offset:offset + 5])
            profiles[profile_id] = True
            offset += 5
        disabled_count = _decode_u7_lsb(data, offset, 2)
        offset += 2
        for _ in range(disabled_count):
            if offset + 5 > len(data) - 1:
                break
            profile_id = _format_hex_bytes(data[offset:offset + 5])
            profiles[profile_id] = False
            offset += 5
        row.profiles = profiles
        row.profile_state = "confirmed"
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        row.last_response_summary = f"Profile inquiry reply ({len(profiles)} profiles)"

    def _handle_profile_details_reply(self, row: Midi2DeviceState, data: bytes) -> None:
        if len(data) < 22:
            return
        profile_id = _format_hex_bytes(data[14:19])
        inquiry_target = int(data[19]) & 0x7F
        data_length = _decode_u7_lsb(data, 20, 2)
        details = bytes(data[22:22 + data_length])
        detail_key = f"{profile_id}@{inquiry_target:02X}"
        parsed_json = _decode_json_ascii(details)
        row.profile_details[detail_key] = {
            "profile_id": profile_id,
            "inquiry_target": inquiry_target,
            "data_hex": _format_hex_bytes(details),
            "data_text": _safe_text_preview(details),
            "data": parsed_json if isinstance(parsed_json, (dict, list, str, int, float, bool)) else None,
        }
        row.profile_state = "confirmed"
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        row.last_response_summary = f"Profile details reply target 0x{inquiry_target:02X} for {profile_id}"

    def _handle_profile_report(self, row: Midi2DeviceState, data: bytes, *, enabled: bool) -> None:
        if len(data) < 19:
            return
        profile_id = _format_hex_bytes(data[14:19])
        row.profiles[profile_id] = enabled
        row.profile_state = "confirmed"
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        row.last_response_summary = f"Profile {'enabled' if enabled else 'disabled'} report for {profile_id}"

    def _handle_pe_caps_reply(self, row: Midi2DeviceState, data: bytes) -> None:
        simultaneous = int(data[14]) & 0x7F if len(data) >= 15 else 1
        major = int(data[15]) & 0x7F if len(data) >= 16 else 0
        minor = int(data[16]) & 0x7F if len(data) >= 17 else 0
        row.supports_property_exchange = True
        row.property_exchange_capabilities = {
            "ready": True,
            "simultaneous_requests": simultaneous,
            "major_version": major,
            "minor_version": minor,
        }
        row.property_state = "confirmed"
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        row.last_response_summary = f"Property Exchange capabilities {major}.{minor}"

    def _touch_pending_request(self, row: Midi2DeviceState, request_id: int) -> None:
        if row.pending_request_id == request_id:
            row.pending_request_deadline = time.time() + MIDI_CI_REQUEST_TIMEOUT_S

    def _handle_property_reply(self, row: Midi2DeviceState, request_id: int, header_bytes: bytes, property_bytes: bytes, *, kind: str) -> None:
        header = _decode_json_ascii(header_bytes)
        property_payload = _decode_json_ascii(property_bytes)
        pending = None
        if row.remote_muid is not None:
            pending = self._pending_property_requests.pop((int(row.remote_muid), request_id), None)

        status_code = None
        status_message = None
        resource = None
        res_id = None
        if isinstance(header, dict):
            raw_status = header.get("status")
            try:
                status_code = int(raw_status) if raw_status is not None else None
            except Exception:
                status_code = None
            status_message = header.get("message")
            resource = str(header.get("resource") or "").strip() or None
            raw_res_id = header.get("resId")
            res_id = str(raw_res_id).strip() if raw_res_id is not None else None

        if pending is not None:
            resource = pending.resource
            res_id = pending.res_id

        if status_code in {None, 200} and resource:
            key = _resource_key(resource, res_id)
            if kind == "property_get":
                row.properties[key] = property_payload
            elif kind == "property_set" and pending is not None:
                row.properties[key] = pending.value
            elif kind == "property_set":
                row.properties[key] = property_payload

            if resource == "ResourceList":
                resources: List[str] = []
                if isinstance(row.properties.get(key), list):
                    for item in row.properties[key]:
                        if isinstance(item, dict):
                            name = str(item.get("resource") or "").strip()
                            if name:
                                resources.append(name)
                row.resources = resources

        row.property_state = "confirmed" if status_code in {None, 200} else "error"
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        if status_code in {None, 200}:
            row.last_response_summary = f"{'Get' if kind == 'property_get' else 'Set'} property reply"
        else:
            row.last_response_summary = f"Property reply status {status_code}{f' {status_message}' if status_message else ''}"

    def _handle_subscription_reply(self, row: Midi2DeviceState, request_id: int, header_bytes: bytes) -> None:
        header = _decode_json_ascii(header_bytes)
        pending = None
        if row.remote_muid is not None:
            pending = self._pending_property_requests.pop((int(row.remote_muid), request_id), None)

        status_code = None
        subscribe_id = None
        if isinstance(header, dict):
            raw_status = header.get("status")
            try:
                status_code = int(raw_status) if raw_status is not None else None
            except Exception:
                status_code = None
            raw_subscribe_id = header.get("subscribeId")
            subscribe_id = str(raw_subscribe_id).strip() if raw_subscribe_id is not None else None

        if pending is not None and pending.kind == "subscription_start" and status_code in {None, 200} and subscribe_id:
            row.subscriptions[subscribe_id] = {
                "resource": pending.resource,
                "res_id": pending.res_id,
                "active": True,
                "last_command": "start",
                "last_request_id": request_id,
                "last_update_at": time.time(),
                "pending_refresh": False,
            }
        if pending is not None and pending.kind == "subscription_end" and status_code in {None, 200}:
            normalized_subscribe_id = pending.subscribe_id
            if normalized_subscribe_id:
                row.subscriptions.pop(normalized_subscribe_id, None)

        row.property_state = "confirmed" if status_code in {None, 200} else "error"
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        if pending is not None and pending.kind == "subscription_start" and subscribe_id:
            row.last_response_summary = f"Subscription started {subscribe_id}"
        elif pending is not None and pending.kind == "subscription_end" and pending.subscribe_id:
            row.last_response_summary = f"Subscription ended {pending.subscribe_id}"
        else:
            row.last_response_summary = "Subscription reply received"

    def _handle_subscription_message(self, row: Midi2DeviceState, request_id: int, header_bytes: bytes, property_bytes: bytes) -> None:
        header = _decode_json_ascii(header_bytes)
        property_payload = _decode_json_ascii(property_bytes)
        if not isinstance(header, dict):
            return

        command = str(header.get("command") or "").strip().lower()
        subscribe_id = str(header.get("subscribeId") or "").strip() or None
        subscription = row.subscriptions.get(subscribe_id or "")
        if command == "end" and subscribe_id:
            row.subscriptions.pop(subscribe_id, None)
            row.last_response_summary = f"Subscription ended by responder {subscribe_id}"
            self._send_transport_payload_nowait(row.device_id, self.build_subscription_reply_sysex(row.device_id, request_id, {"status": 200}), request_kind="subscription_reply", request_id=request_id)
            return

        if subscribe_id and subscription:
            subscription["last_command"] = command
            subscription["last_request_id"] = request_id
            subscription["last_update_at"] = time.time()

        if command in {"partial", "full"} and subscribe_id and subscription:
            key = _resource_key(str(subscription.get("resource") or ""), subscription.get("res_id"))
            if command == "partial":
                row.properties[key] = self._merge_partial_property_update(row.properties.get(key), property_payload)
            else:
                row.properties[key] = property_payload
            subscription["pending_refresh"] = False
            row.property_state = "confirmed"
            row.last_response_summary = f"Subscription {command} update {subscribe_id}"
        elif command == "notify" and subscribe_id and subscription:
            subscription["pending_refresh"] = True
            row.last_response_summary = f"Subscription notify {subscribe_id}"
            self._send_transport_payload_nowait(row.device_id, self.build_subscription_reply_sysex(row.device_id, request_id, {"status": 200}), request_kind="subscription_reply", request_id=request_id)
            self._run_coroutine(
                self.query_property(
                    row.device_id,
                    str(subscription.get("resource") or ""),
                    res_id=str(subscription.get("res_id") or "").strip() or None,
                )
            )
            return

        self._send_transport_payload_nowait(
            row.device_id,
            self.build_subscription_reply_sysex(row.device_id, request_id, {"status": 200}),
            request_kind="subscription_reply",
            request_id=request_id,
        )

    def _handle_notify_message(self, row: Midi2DeviceState, request_id: int, header_bytes: bytes) -> None:
        header = _decode_json_ascii(header_bytes)
        if not isinstance(header, dict):
            return
        raw_status = header.get("status")
        try:
            status_code = int(raw_status) if raw_status is not None else None
        except Exception:
            status_code = None
        if status_code == MIDI_CI_NOTIFY_TIMEOUT_WAIT:
            self._touch_pending_request(row, request_id)
            row.last_response_summary = "Notify timeout-wait received"
            return

        pending = None
        if row.remote_muid is not None:
            pending = self._pending_property_requests.pop((int(row.remote_muid), request_id), None)
        row.pending_request_kind = None
        row.pending_request_id = None
        row.pending_request_deadline = None
        row.property_state = "error"
        if status_code == MIDI_CI_NOTIFY_TERMINATE:
            row.last_response_summary = "Notify terminate received"
        elif status_code == MIDI_CI_NOTIFY_TIMEOUT:
            row.last_response_summary = "Notify timeout received"
        else:
            row.last_response_summary = f"Notify status {status_code}"
        if pending is not None and pending.subscribe_id:
            row.subscriptions.pop(pending.subscribe_id, None)

    @staticmethod
    def _merge_partial_property_update(current: Any, update: Any) -> Any:
        if not isinstance(update, dict) or not update:
            return update
        if current is None:
            current = {}
        if not isinstance(current, (dict, list)):
            return update
        materialized = json.loads(json.dumps(current))
        for pointer, value in update.items():
            if not isinstance(pointer, str) or not pointer.startswith("/"):
                if isinstance(materialized, dict):
                    materialized[pointer] = value
                continue
            tokens = [token.replace("~1", "/").replace("~0", "~") for token in pointer.lstrip("/").split("/") if token]
            target = materialized
            for token in tokens[:-1]:
                if isinstance(target, dict):
                    target = target.setdefault(token, {})
                elif isinstance(target, list):
                    index = int(token)
                    while index >= len(target):
                        target.append({})
                    target = target[index]
                else:
                    break
            else:
                leaf = tokens[-1] if tokens else ""
                if isinstance(target, dict):
                    target[leaf] = value
                elif isinstance(target, list):
                    index = int(leaf)
                    while index >= len(target):
                        target.append(None)
                    target[index] = value
        return materialized

    def _handle_invalidate_muid(self, data: bytes) -> None:
        if len(data) < 19:
            return
        target_muid = _decode_u7_lsb(data, 14, 4)
        if target_muid == self._local_muid:
            self._pending_property_requests.clear()
            self._pending_inbound_chunks.clear()
            self._devices.clear()
            self._discovery_pending_until = None
            self._discovery_started_at = None
            self._local_muid = self._generate_local_muid()
            self._last_error = "local_muid_invalidated"
            self._last_rx_device_id = None
            self._last_tx_device_id = None
            self._send_transport_payload_nowait(None, [bytes(self.build_discovery_sysex())], request_kind="discovery_after_invalidate")
            return
        removed_device_ids = self._discard_device_cache(target_muid)
        if removed_device_ids:
            self._last_error = f"remote_muid_invalidated:{target_muid:07X}"

    def _handle_local_muid_collision(self) -> None:
        previous_muid = self._local_muid
        self._pending_property_requests.clear()
        self._pending_inbound_chunks.clear()
        self._devices.clear()
        self._local_muid = self._generate_local_muid()
        self._last_error = f"local_muid_collision:{previous_muid:07X}->{self._local_muid:07X}"
        self._last_rx_device_id = None
        self._last_tx_device_id = None
        self._send_transport_payload_nowait(None, [bytes(self.build_discovery_sysex())], request_kind="discovery_collision_recovery")

    def _handle_remote_muid_collision(self, remote_muid: int) -> None:
        self._discard_device_cache(remote_muid)
        self._last_error = f"remote_muid_collision:{int(remote_muid) & MIDI_CI_BROADCAST_MUID:07X}"
        self._send_transport_payload_nowait(None, [self.build_invalidate_muid_sysex(remote_muid)], request_kind="muid_collision_invalidate")
        self._send_transport_payload_nowait(None, [bytes(self.build_discovery_sysex())], request_kind="discovery_collision_recovery")

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
        from app.services.midi_hub.network import get_midi_network_bridge

        _midi2_manager_singleton = Midi2Manager(
            hub=get_midi_hub(),
            network_bridge=get_midi_network_bridge(),
        )
    else:
        from app.services.midi_hub.network import get_midi_network_bridge

        _midi2_manager_singleton.set_hub(get_midi_hub())
        _midi2_manager_singleton.set_network_bridge(get_midi_network_bridge())
    return _midi2_manager_singleton
