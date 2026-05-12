"""Cluster-wide hardware inventory aggregation."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

import httpx

from app.config import config_get
from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.cluster.mdns_discovery_enhanced import (
    EnhancedMDNSDiscovery,
    get_enhanced_mdns_discovery,
)
from app.services.platform_event.bus import PlatformEventFilter, get_platform_event_bus
from app.services.cluster.registry import ClusterRegistry, get_cluster_registry
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)

_KNOWN_USB_AUDIO_NAMES = {
    "0582:0074": "Edirol UA-1000",
    "84ef:0014": "Hotone Jogg USB Audio",
    # TASCAM US-144MKII operational firmware-loaded PID. 0644:800F is the
    # transient boot/loader PID; intentionally omitted so the device only
    # registers as "connected" once snd-usb-us144mkii has finished re-enumeration.
    "0644:8020": "TASCAM US-144MKII",
}


@dataclass
class NodeHardware:
    node_id: str
    hostname: str
    usb_audio_devices: List[Dict[str, Any]] = field(default_factory=list)
    midi_devices: List[Dict[str, Any]] = field(default_factory=list)
    audio_interfaces: List[str] = field(default_factory=list)
    pipewire_devices: List[Dict[str, Any]] = field(default_factory=list)
    status: str = "unknown"
    last_updated: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ClusterHardwareInventory(Singleton):
    def __init__(
        self,
        *,
        client: Optional[httpx.AsyncClient] = None,
        registry: Optional[ClusterRegistry] = None,
        discovery: Optional[EnhancedMDNSDiscovery] = None,
        event_bus: Any = None,
        local_node_id: Optional[str] = None,
        local_hostname: Optional[str] = None,
        ttl_s: float = 60.0,
    ) -> None:
        backend_port = int(config_get("backend.port", 8080))
        self._base_url = f"http://127.0.0.1:{backend_port}"
        self._client = client or httpx.AsyncClient(timeout=8.0)
        self._registry = registry or get_cluster_registry()
        self._discovery = discovery or get_enhanced_mdns_discovery()
        identity = get_enhanced_node_identity()
        self._local_node_id = local_node_id or identity.get_node_id()
        self._local_hostname = local_hostname or getattr(identity.config, "hostname", None) or self._local_node_id
        self._ttl = ttl_s
        self._lock = asyncio.Lock()
        self._cache: Dict[str, NodeHardware] = {}
        self._cached_at = 0.0
        self._event_bus = event_bus or get_platform_event_bus()
        self._subscription = None
        self._subscribe_to_events()

    def _subscribe_to_events(self) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self._subscribe_to_events_async())

    async def _subscribe_to_events_async(self) -> None:
        if self._subscription is not None:
            return
        self._subscription = await self._event_bus.subscribe_callback(
            self._handle_cluster_event,
            PlatformEventFilter(
                kinds=frozenset({"node.online", "node.offline", "node.recovered", "config.updated"})
            ),
        )

    def _handle_cluster_event(self, event: Any) -> None:
        self._cached_at = 0.0
        if getattr(event, "kind", None) == "node.offline":
            impacted = [getattr(event, "source_node", "")] + list(getattr(event, "context", {}).get("affected_nodes", []) or [])
            for node_id in [node for node in impacted if node]:
                existing = self._cache.get(node_id)
                if existing is None:
                    continue
                existing.status = "offline"
                existing.usb_audio_devices = []
                existing.midi_devices = []
                existing.pipewire_devices = []
                existing.last_updated = datetime.now(UTC).isoformat()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.refresh_from_nodes(force=True))

    async def refresh_from_nodes(self, force: bool = False) -> Dict[str, NodeHardware]:
        async with self._lock:
            now = time.monotonic()
            if not force and self._cache and now - self._cached_at < self._ttl:
                return self._cache

            usb_nodes, midi_nodes, pipewire_nodes = await asyncio.gather(
                self._fanout_get("/api/usb/devices/list"),
                self._fanout_get("/api/midi/devices"),
                self._fanout_get("/api/pipewire/devices"),
            )

            inventory = self._seed_inventory()
            for node_id in sorted(set(inventory) | set(usb_nodes) | set(midi_nodes) | set(pipewire_nodes)):
                hardware = inventory.setdefault(
                    node_id,
                    NodeHardware(node_id=node_id, hostname=node_id),
                )
                hardware.usb_audio_devices = self._normalize_usb_audio_devices(usb_nodes.get(node_id, {}).get("body"))
                hardware.midi_devices = self._normalize_midi_devices(midi_nodes.get(node_id, {}).get("body"))
                hardware.pipewire_devices = self._normalize_pipewire_devices(pipewire_nodes.get(node_id, {}).get("body"))
                hardware.status = self._derive_status(
                    hardware.status,
                    usb_nodes.get(node_id),
                    midi_nodes.get(node_id),
                    pipewire_nodes.get(node_id),
                )
                hardware.audio_interfaces = self._merge_audio_interfaces(
                    hardware.audio_interfaces,
                    hardware.usb_audio_devices,
                    hardware.pipewire_devices,
                )
                hardware.last_updated = datetime.now(UTC).isoformat()

            self._cache = inventory
            self._cached_at = now
            return self._cache

    async def get_inventory(self) -> Dict[str, NodeHardware]:
        return await self.refresh_from_nodes()

    async def get_node_hardware(self, node_id: str) -> Optional[NodeHardware]:
        inventory = await self.refresh_from_nodes()
        return inventory.get(node_id)

    async def find_device(self, device_name_or_vid_pid: str) -> List[Dict[str, Any]]:
        needle = str(device_name_or_vid_pid or "").strip().lower()
        if not needle:
            return []

        inventory = await self.refresh_from_nodes()
        matches: List[Dict[str, Any]] = []
        for node_id, hardware in inventory.items():
            for device in hardware.usb_audio_devices:
                candidate = " ".join(
                    str(part)
                    for part in (
                        device.get("name"),
                        device.get("product"),
                        device.get("vid_pid"),
                    )
                    if part
                ).lower()
                if needle in candidate:
                    matches.append(
                        {
                            "node_id": node_id,
                            "hostname": hardware.hostname,
                            "kind": "usb_audio",
                            "device_info": device,
                        }
                    )
            for device in hardware.midi_devices:
                candidate = " ".join(
                    str(part)
                    for part in (
                        device.get("name"),
                        device.get("direction"),
                        device.get("type"),
                    )
                    if part
                ).lower()
                if needle in candidate:
                    matches.append(
                        {
                            "node_id": node_id,
                            "hostname": hardware.hostname,
                            "kind": "midi",
                            "device_info": device,
                        }
                    )
            for interface_name in hardware.audio_interfaces:
                if needle in interface_name.lower():
                    matches.append(
                        {
                            "node_id": node_id,
                            "hostname": hardware.hostname,
                            "kind": "audio_interface",
                            "device_info": {"name": interface_name},
                        }
                    )
            for device in hardware.pipewire_devices:
                candidate = " ".join(
                    str(part)
                    for part in (
                        device.get("name"),
                        device.get("description"),
                        device.get("media_class"),
                    )
                    if part
                ).lower()
                if needle in candidate:
                    matches.append(
                        {
                            "node_id": node_id,
                            "hostname": hardware.hostname,
                            "kind": "pipewire",
                            "device_info": device,
                        }
                    )
        return matches

    async def _fanout_get(self, path: str) -> Dict[str, Any]:
        response = await self._client.get(f"{self._base_url}{path}", params={"node_id": "all"})
        response.raise_for_status()
        payload = response.json()
        return payload.get("nodes", {})

    def _seed_inventory(self) -> Dict[str, NodeHardware]:
        inventory: Dict[str, NodeHardware] = {}
        local_interfaces = list(getattr(get_enhanced_node_identity().get_capabilities(), "audio_interfaces", []) or [])
        inventory[self._local_node_id] = NodeHardware(
            node_id=self._local_node_id,
            hostname=self._local_hostname,
            audio_interfaces=self._normalize_string_list(local_interfaces),
            status="online",
        )

        for row in self._registry.get_all_nodes():
            node_id = str(row.get("id") or "").strip()
            if not node_id:
                continue
            hardware = inventory.setdefault(
                node_id,
                NodeHardware(node_id=node_id, hostname=str(row.get("hostname") or node_id)),
            )
            hardware.hostname = str(row.get("hostname") or hardware.hostname or node_id)
            hardware.status = str(row.get("status") or hardware.status or "unknown")
            hardware.audio_interfaces = self._merge_unique(
                hardware.audio_interfaces,
                self._normalize_string_list(self._maybe_json_list(row.get("audio_devices"))),
            )

        for node in self._discovery.get_discovered_nodes(online_only=False):
            hardware = inventory.setdefault(
                node.node_id,
                NodeHardware(node_id=node.node_id, hostname=node.hostname or node.node_id),
            )
            hardware.hostname = node.hostname or hardware.hostname
            hardware.status = "online" if node.is_online(self._discovery.cache_timeout) else hardware.status
            if node.capabilities:
                hardware.audio_interfaces = self._merge_unique(
                    hardware.audio_interfaces,
                    self._normalize_string_list(node.capabilities.audio_interfaces),
                )

        return inventory

    @staticmethod
    def _derive_status(current: str, *node_payloads: Any) -> str:
        for payload in node_payloads:
            if isinstance(payload, dict) and payload.get("status_code") == 200:
                return "online"
        return current or "unknown"

    @staticmethod
    def _normalize_string_list(values: List[Any]) -> List[str]:
        seen: set[str] = set()
        normalized: List[str] = []
        for value in values or []:
            text = str(value or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            normalized.append(text)
        return normalized

    @staticmethod
    def _maybe_json_list(value: Any) -> List[Any]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            try:
                parsed = json.loads(text)
            except Exception:
                return [text]
            return parsed if isinstance(parsed, list) else []
        return []

    @staticmethod
    def _merge_unique(existing: List[str], new_values: List[str]) -> List[str]:
        return ClusterHardwareInventory._normalize_string_list([*(existing or []), *(new_values or [])])

    @classmethod
    def _normalize_usb_audio_devices(cls, body: Any) -> List[Dict[str, Any]]:
        if not isinstance(body, list):
            return []

        devices: List[Dict[str, Any]] = []
        for raw_device in body:
            if not isinstance(raw_device, dict):
                continue
            vendor_id = str(raw_device.get("vendor_id") or "").lower()
            product_id = str(raw_device.get("product_id") or "").lower()
            vid_pid = f"{vendor_id}:{product_id}" if vendor_id and product_id else ""
            product_name = str(raw_device.get("product") or raw_device.get("name") or "").strip()
            known_name = _KNOWN_USB_AUDIO_NAMES.get(vid_pid)
            is_audio = bool(raw_device.get("is_audio")) or vid_pid in _KNOWN_USB_AUDIO_NAMES or "audio" in product_name.lower()
            if not is_audio:
                continue
            device = dict(raw_device)
            if known_name:
                device.setdefault("name", known_name)
            device["vid_pid"] = vid_pid or None
            devices.append(device)
        return devices

    @staticmethod
    def _normalize_midi_devices(body: Any) -> List[Dict[str, Any]]:
        if not isinstance(body, dict):
            return []

        devices: List[Dict[str, Any]] = []
        for direction_key, direction_name in (("inputs", "input"), ("outputs", "output")):
            for raw_device in body.get(direction_key, []) or []:
                if isinstance(raw_device, dict):
                    device = dict(raw_device)
                else:
                    device = {"name": str(raw_device)}
                device.setdefault("direction", direction_name)
                devices.append(device)
        return devices

    @staticmethod
    def _normalize_pipewire_devices(body: Any) -> List[Dict[str, Any]]:
        if isinstance(body, dict):
            devices = body.get("devices", [])
            if isinstance(devices, list):
                return [dict(device) for device in devices if isinstance(device, dict)]
        if isinstance(body, list):
            return [dict(device) for device in body if isinstance(device, dict)]
        return []

    @classmethod
    def _merge_audio_interfaces(
        cls,
        audio_interfaces: List[str],
        usb_audio_devices: List[Dict[str, Any]],
        pipewire_devices: List[Dict[str, Any]],
    ) -> List[str]:
        merged = list(audio_interfaces or [])
        for device in usb_audio_devices:
            merged.append(str(device.get("name") or device.get("product") or "").strip())
        for device in pipewire_devices:
            merged.append(
                str(
                    device.get("description")
                    or device.get("name")
                    or device.get("nick")
                    or ""
                ).strip()
            )
        return cls._normalize_string_list(merged)

def get_cluster_hardware_inventory() -> ClusterHardwareInventory:
    return ClusterHardwareInventory.get_instance()
