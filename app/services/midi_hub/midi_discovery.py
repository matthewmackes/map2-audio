"""mDNS discovery for cluster-wide MIDI capabilities."""

from __future__ import annotations

import logging
import socket
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from app.config import config_get
from app.services.cluster.mdns_discovery_enhanced import EnhancedMDNSDiscovery
from app.services.midi_hub.clock_engine import get_midi_clock_engine
from app.services.midi_hub.device_registry import get_midi_device_registry
from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.midi2 import get_midi2_manager

logger = logging.getLogger(__name__)

_TXT_LIMIT = 240


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dedupe(values: List[str]) -> List[str]:
    seen: set[str] = set()
    ordered: List[str] = []
    for value in values:
        normalized = " ".join(str(value).strip().split())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def _truncate_csv(values: List[str], limit: int = _TXT_LIMIT) -> str:
    encoded: List[str] = []
    current_length = 0
    for value in _dedupe(values):
        item = value.replace(",", " ")[:96]
        if not item:
            continue
        projected = current_length + len(item) + (1 if encoded else 0)
        if projected > limit:
            break
        encoded.append(item)
        current_length = projected
    return ",".join(encoded)


def _split_csv(value: str) -> List[str]:
    if not value:
        return []
    return _dedupe([item for item in str(value).split(",") if str(item).strip()])


@dataclass
class MidiCapabilities:
    input_ports: List[str] = field(default_factory=list)
    output_ports: List[str] = field(default_factory=list)
    virtual_ports: List[str] = field(default_factory=list)
    hub_running: bool = False
    clock_source: str = "internal"
    clock_bpm: float = 120.0
    protocol_version: str = "1.0"
    supports_midi2: bool = False
    sysex_enabled: bool = False

    def to_txt_records(self) -> Dict[str, str]:
        proto = "2.0" if self.supports_midi2 or str(self.protocol_version).strip() == "2.0" else "1.0"
        return {
            "midi_in": _truncate_csv(self.input_ports),
            "midi_out": _truncate_csv(self.output_ports),
            "midi_virt": _truncate_csv(self.virtual_ports),
            "hub": "yes" if self.hub_running else "no",
            "clk_src": "ext" if str(self.clock_source).strip().lower() == "external" else "int",
            "clk_bpm": f"{float(self.clock_bpm):.2f}",
            "proto": proto,
            "sysex": "yes" if self.sysex_enabled else "no",
        }

    @classmethod
    def from_txt_records(cls, txt_records: Dict[str, str]) -> "MidiCapabilities":
        proto = str(txt_records.get("proto", "1.0")).strip() or "1.0"
        return cls(
            input_ports=_split_csv(txt_records.get("midi_in", "")),
            output_ports=_split_csv(txt_records.get("midi_out", "")),
            virtual_ports=_split_csv(txt_records.get("midi_virt", "")),
            hub_running=str(txt_records.get("hub", "no")).lower() == "yes",
            clock_source="external" if str(txt_records.get("clk_src", "int")).lower() == "ext" else "internal",
            clock_bpm=float(txt_records.get("clk_bpm", "120.0")),
            protocol_version=proto,
            supports_midi2=proto == "2.0",
            sysex_enabled=str(txt_records.get("sysex", "no")).lower() == "yes",
        )


@dataclass
class MidiNode:
    node_id: str
    hostname: str
    addresses: List[str] = field(default_factory=list)
    port: int = 8000
    midi_capabilities: Optional[MidiCapabilities] = None
    last_seen: datetime = field(default_factory=_utcnow)

    def is_online(self, timeout_seconds: int = 120) -> bool:
        return (_utcnow() - self.last_seen) < timedelta(seconds=timeout_seconds)

    def to_dict(self) -> Dict[str, object]:
        payload = asdict(self)
        payload["last_seen"] = self.last_seen.isoformat()
        return payload


class MidiDiscoveryService:
    """Broadcast and discover MAP2 MIDI capabilities over mDNS."""

    def __init__(self) -> None:
        self.enabled = bool(config_get("midi.enabled", True)) and bool(config_get("midi.cluster.enabled", True))
        self.mdns_discovery: Optional[EnhancedMDNSDiscovery] = None
        self.discovered_midi_nodes: Dict[str, MidiNode] = {}
        self._zeroconf = None
        self._zeroconf_mod = None
        self._service_info = None
        self._service_name: Optional[str] = None
        self.logger = logging.getLogger(__name__)

        if self.enabled:
            try:
                self.mdns_discovery = EnhancedMDNSDiscovery(
                    service_type="_map2-midi._tcp.local.",
                    cache_timeout=int(config_get("midi.cluster.discovery_timeout_s", 120)),
                )
            except Exception as exc:
                self.logger.warning(f"Failed to initialize MIDI discovery: {exc}")
                self.enabled = False

    def is_enabled(self) -> bool:
        return self.enabled and self.mdns_discovery is not None

    def _ensure_zeroconf(self) -> bool:
        if self._zeroconf is not None and self._zeroconf_mod is not None:
            return True
        try:
            import zeroconf  # type: ignore

            self._zeroconf_mod = zeroconf
            self._zeroconf = zeroconf.Zeroconf()
            return True
        except ImportError:
            self.logger.debug("zeroconf package not installed; external MIDI mDNS advertisement disabled")
            return False
        except Exception as exc:
            self.logger.warning(f"Failed to initialize MIDI zeroconf publisher: {exc}")
            return False

    def _register_local_advertisement(
        self,
        *,
        node_id: str,
        hostname: str,
        port: int,
        addresses: List[str],
        txt_records: Dict[str, str],
    ) -> bool:
        if not self._ensure_zeroconf():
            return False

        try:
            assert self._zeroconf is not None
            assert self._zeroconf_mod is not None

            service_type = "_map2-midi._tcp.local."
            service_name = f"{node_id}.{service_type}"
            ipv4_addr = next((addr for addr in addresses if "." in addr), None)
            if not ipv4_addr:
                try:
                    ipv4_addr = socket.gethostbyname(hostname)
                except Exception:
                    ipv4_addr = "127.0.0.1"

            properties = {
                key.encode("utf-8"): str(value).encode("utf-8")
                for key, value in txt_records.items()
            }
            server_name = hostname if hostname.endswith(".local.") else f"{hostname}.local."
            service_info = self._zeroconf_mod.ServiceInfo(
                service_type,
                service_name,
                addresses=[socket.inet_aton(ipv4_addr)],
                port=port,
                properties=properties,
                server=server_name,
            )

            if self._service_info is None:
                self._zeroconf.register_service(service_info)
            else:
                if self._service_name != service_name:
                    self._zeroconf.unregister_service(self._service_info)
                    self._zeroconf.register_service(service_info)
                else:
                    self._zeroconf.update_service(service_info)

            self._service_info = service_info
            self._service_name = service_name
            return True
        except Exception as exc:
            self.logger.warning(f"Failed to register MIDI mDNS service: {exc}")
            return False

    def shutdown(self) -> None:
        try:
            if self._zeroconf is not None and self._service_info is not None:
                self._zeroconf.unregister_service(self._service_info)
        except Exception as exc:
            self.logger.debug(f"Failed to unregister MIDI mDNS service: {exc}")
        finally:
            try:
                if self._zeroconf is not None:
                    self._zeroconf.close()
            except Exception as exc:
                self.logger.debug(f"Failed to close MIDI zeroconf publisher: {exc}")
            self._zeroconf = None
            self._zeroconf_mod = None
            self._service_info = None
            self._service_name = None

    def stop(self) -> None:
        self.shutdown()

    def get_local_capabilities(self) -> MidiCapabilities:
        hub = get_midi_hub()
        registry = get_midi_device_registry()
        clock_status = get_midi_clock_engine().status()
        midi2_status = get_midi2_manager().status()

        device_snapshot = registry.snapshot()
        alias_by_port_name: Dict[str, str] = {}
        profile_supports_sysex: Dict[str, bool] = {
            str(profile.get("profile_id")): bool(profile.get("supports_sysex"))
            for profile in device_snapshot.get("profiles", [])
        }

        for device in device_snapshot.get("devices", []):
            alias = str(device.get("profile_name") or "").strip()
            if not alias:
                continue
            for port_name in device.get("port_names", []):
                alias_by_port_name.setdefault(str(port_name), alias)

        input_ports: List[str] = []
        output_ports: List[str] = []
        virtual_ports: List[str] = []
        for port in hub.list_ports():
            label = alias_by_port_name.get(port.name, port.name)
            if port.direction in ("input", "duplex"):
                input_ports.append(label)
            if port.direction in ("output", "duplex"):
                output_ports.append(label)
            if port.kind != "alsa":
                virtual_ports.append(label)

        sysex_enabled = any(
            profile_supports_sysex.get(str(device.get("profile_id")), False)
            for device in device_snapshot.get("devices", [])
        )

        supports_midi2 = bool(midi2_status.get("enabled"))
        detected_bpm = clock_status.get("detected_bpm")
        bpm = float(detected_bpm if detected_bpm is not None else clock_status.get("bpm", 120.0))

        return MidiCapabilities(
            input_ports=_dedupe(input_ports),
            output_ports=_dedupe(output_ports),
            virtual_ports=_dedupe(virtual_ports),
            hub_running=bool(hub.running),
            clock_source="external" if str(clock_status.get("source_mode", "internal")).lower() == "external" else "internal",
            clock_bpm=bpm,
            protocol_version="2.0" if supports_midi2 else "1.0",
            supports_midi2=supports_midi2,
            sysex_enabled=sysex_enabled,
        )

    def broadcast_local_node(self, node_id: str, hostname: str, port: int = 8000) -> bool:
        if not self.is_enabled():
            return False

        try:
            capabilities = self.get_local_capabilities()
            txt_records = capabilities.to_txt_records()
            txt_records["node_id"] = node_id
            txt_records["hostname"] = hostname

            addresses: List[str] = []
            if self.mdns_discovery:
                addresses = self.mdns_discovery.get_local_addresses()
            if not addresses:
                addresses = ["127.0.0.1"]

            node = self.add_discovered_node(
                node_id=node_id,
                hostname=hostname,
                addresses=addresses,
                txt_records=txt_records,
                port=port,
            )
            if node is None:
                return False

            self._register_local_advertisement(
                node_id=node_id,
                hostname=hostname,
                port=port,
                addresses=addresses,
                txt_records=txt_records,
            )
            return True
        except Exception as exc:
            self.logger.error(f"Failed to broadcast MIDI capabilities: {exc}")
            return False

    def add_discovered_node(
        self,
        node_id: str,
        hostname: str,
        addresses: List[str],
        txt_records: Dict[str, str],
        port: int = 8000,
    ) -> Optional[MidiNode]:
        try:
            capabilities = MidiCapabilities.from_txt_records(txt_records)
            node = MidiNode(
                node_id=node_id,
                hostname=hostname,
                addresses=list(addresses),
                port=port,
                midi_capabilities=capabilities,
                last_seen=_utcnow(),
            )
            self.discovered_midi_nodes[node_id] = node
            if self.mdns_discovery:
                self.mdns_discovery.add_discovered_node(
                    node_id=node_id,
                    hostname=hostname,
                    addresses=addresses,
                    txt_records=txt_records,
                    port=port,
                )
            return node
        except Exception as exc:
            self.logger.error(f"Failed to add discovered MIDI node {node_id}: {exc}")
            return None

    def get_discovered_nodes(self, online_only: bool = True) -> List[MidiNode]:
        nodes = sorted(self.discovered_midi_nodes.values(), key=lambda node: node.node_id)
        if online_only:
            timeout = int(config_get("midi.cluster.discovery_timeout_s", 120))
            nodes = [node for node in nodes if node.is_online(timeout)]
        return nodes

    def get_nodes_with_inputs(self) -> List[MidiNode]:
        return [
            node
            for node in self.get_discovered_nodes()
            if node.midi_capabilities and node.midi_capabilities.input_ports
        ]

    def get_nodes_with_outputs(self) -> List[MidiNode]:
        return [
            node
            for node in self.get_discovered_nodes()
            if node.midi_capabilities and node.midi_capabilities.output_ports
        ]

    def cleanup_offline_nodes(self) -> int:
        before_count = len(self.discovered_midi_nodes)
        timeout = int(config_get("midi.cluster.discovery_timeout_s", 120))
        self.discovered_midi_nodes = {
            node_id: node
            for node_id, node in self.discovered_midi_nodes.items()
            if node.is_online(timeout)
        }
        removed = before_count - len(self.discovered_midi_nodes)
        if self.mdns_discovery:
            self.mdns_discovery.cleanup_offline_nodes()
        return removed

    def get_discovery_summary(self) -> Dict[str, object]:
        nodes = self.get_discovered_nodes()
        return {
            "enabled": self.enabled,
            "total_nodes": len(nodes),
            "input_capable_nodes": len(self.get_nodes_with_inputs()),
            "output_capable_nodes": len(self.get_nodes_with_outputs()),
            "input_port_count": sum(len(node.midi_capabilities.input_ports) for node in nodes if node.midi_capabilities),
            "output_port_count": sum(len(node.midi_capabilities.output_ports) for node in nodes if node.midi_capabilities),
            "virtual_port_count": sum(len(node.midi_capabilities.virtual_ports) for node in nodes if node.midi_capabilities),
            "nodes": [node.to_dict() for node in nodes],
        }


_midi_discovery_singleton: Optional[MidiDiscoveryService] = None


def get_midi_discovery_service() -> MidiDiscoveryService:
    global _midi_discovery_singleton
    if _midi_discovery_singleton is None:
        _midi_discovery_singleton = MidiDiscoveryService()
    return _midi_discovery_singleton
