"""
Unified audio interface registry.

Merges three discovery sources into a single canonical list with stable IDs:

  - PipeWire (Audio/Source + Audio/Sink nodes on this host)
  - AVB talkers / listeners (network endpoints)
  - Cluster peer nodes (via hardware_inventory fan-out)

Each interface gets a stable `interface_id` derived from durable identity
properties (USB vendor:product:serial when available, ALSA card name as
fallback, AVB endpoint_id, or cluster node_id:sub_id). Snapshots store the
interface_id; display names are resolved at render time.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# Transport classifiers — kept as plain strings so they serialize cleanly
# to JSON and are easy to filter on in the UI.
TRANSPORT_PIPEWIRE_USB = "pipewire_usb"
TRANSPORT_PIPEWIRE_ALSA = "pipewire_alsa"
TRANSPORT_PIPEWIRE_OTHER = "pipewire_other"
TRANSPORT_AVB = "avb"
TRANSPORT_CLUSTER = "cluster"
# T2521-7b — SonoBus / AOO remote-audio transport.
TRANSPORT_SONOBUS = "sonobus"

_KNOWN_TRANSPORTS = (
    TRANSPORT_PIPEWIRE_USB,
    TRANSPORT_PIPEWIRE_ALSA,
    TRANSPORT_PIPEWIRE_OTHER,
    TRANSPORT_AVB,
    TRANSPORT_CLUSTER,
    TRANSPORT_SONOBUS,
)


@dataclass
class AudioInterfaceRecord:
    """One canonical audio interface available for snapshot binding."""

    interface_id: str
    display_name: str
    transport: str
    vendor: Optional[str] = None
    product: Optional[str] = None
    serial: Optional[str] = None
    input_port_count: int = 0
    output_port_count: int = 0
    sample_rate: Optional[int] = None
    available: bool = True
    is_default: bool = False
    node_id: Optional[str] = None  # cluster node id when transport == cluster
    direction: Optional[str] = None  # talker / listener for AVB
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "interface_id": self.interface_id,
            "display_name": self.display_name,
            "transport": self.transport,
            "vendor": self.vendor,
            "product": self.product,
            "serial": self.serial,
            "input_port_count": int(self.input_port_count),
            "output_port_count": int(self.output_port_count),
            "sample_rate": self.sample_rate,
            "available": bool(self.available),
            "is_default": bool(self.is_default),
            "node_id": self.node_id,
            "direction": self.direction,
            "notes": list(self.notes),
        }


# ---------------------------------------------------------------------------
# Stable-ID derivation
# ---------------------------------------------------------------------------

_ID_SANITIZE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_id_fragment(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    return _ID_SANITIZE_RE.sub("-", text).strip("-")


def derive_pipewire_interface_id(props: Dict[str, Any]) -> Tuple[str, str]:
    """Return (interface_id, transport) for a PipeWire node from its props.

    Preference order:
      1. USB vendor:product:serial (`device.vendor.id`, `device.product.id`,
         `device.serial`) → `pipewire:usb:<vendor>:<product>:<serial>`
      2. ALSA card identity (`api.alsa.card.name` or `api.alsa.path`) →
         `pipewire:alsa:<card>`
      3. Fallback to PipeWire `node.name` →
         `pipewire:node:<sanitized-node-name>`

    The transport classification reflects which branch produced the ID so the
    UI can group interfaces appropriately.
    """

    if not isinstance(props, dict):
        return "", TRANSPORT_PIPEWIRE_OTHER

    vendor_id = _sanitize_id_fragment(props.get("device.vendor.id"))
    product_id = _sanitize_id_fragment(props.get("device.product.id"))
    serial = _sanitize_id_fragment(props.get("device.serial"))

    if vendor_id and product_id:
        ident = f"{vendor_id}:{product_id}"
        if serial:
            ident = f"{ident}:{serial}"
        return f"pipewire:usb:{ident}", TRANSPORT_PIPEWIRE_USB

    card_name = _sanitize_id_fragment(
        props.get("api.alsa.card.name")
        or props.get("alsa.card_name")
        or props.get("api.alsa.path")
    )
    if card_name:
        return f"pipewire:alsa:{card_name}", TRANSPORT_PIPEWIRE_ALSA

    node_name = _sanitize_id_fragment(props.get("node.name"))
    if node_name:
        return f"pipewire:node:{node_name}", TRANSPORT_PIPEWIRE_OTHER

    return "", TRANSPORT_PIPEWIRE_OTHER


def derive_avb_interface_id(endpoint_id: str) -> str:
    fragment = _sanitize_id_fragment(endpoint_id)
    return f"avb:{fragment}" if fragment else ""


def derive_cluster_interface_id(node_id: str, sub_id: str) -> str:
    node_fragment = _sanitize_id_fragment(node_id)
    sub_fragment = _sanitize_id_fragment(sub_id)
    if not node_fragment or not sub_fragment:
        return ""
    return f"cluster:{node_fragment}:{sub_fragment}"


# ---------------------------------------------------------------------------
# Source adapters
# ---------------------------------------------------------------------------


def _pipewire_records_from_dump(dump: Any) -> List[AudioInterfaceRecord]:
    """Build interface records from a raw `pw-dump` payload (list of objects).

    Source/Sink nodes that share the same identity (e.g. a USB interface that
    publishes both an Audio/Source and an Audio/Sink) are folded into a single
    record so the operator sees one card per physical box.
    """

    if not isinstance(dump, list):
        return []

    grouped: Dict[str, AudioInterfaceRecord] = {}

    for obj in dump:
        if not isinstance(obj, dict):
            continue
        if obj.get("type") != "PipeWire:Interface:Node":
            continue
        info = obj.get("info") or {}
        props = info.get("props") or {}
        if not isinstance(props, dict):
            continue
        media_class = str(props.get("media.class") or "")
        if media_class not in ("Audio/Source", "Audio/Sink"):
            continue

        interface_id, transport = derive_pipewire_interface_id(props)
        if not interface_id:
            continue

        try:
            channels = int(props.get("audio.channels") or 0)
        except (TypeError, ValueError):
            channels = 0
        try:
            sample_rate = int(props.get("audio.rate") or props.get("object.rate") or 0) or None
        except (TypeError, ValueError):
            sample_rate = None

        display_name = (
            str(
                props.get("node.description")
                or props.get("device.description")
                or props.get("node.nick")
                or props.get("device.nick")
                or props.get("node.name")
                or "PipeWire node"
            ).strip()
            or interface_id
        )

        record = grouped.get(interface_id)
        if record is None:
            record = AudioInterfaceRecord(
                interface_id=interface_id,
                display_name=display_name,
                transport=transport,
                vendor=str(props.get("device.vendor.name") or "").strip() or None,
                product=str(props.get("device.product.name") or "").strip() or None,
                serial=str(props.get("device.serial") or "").strip() or None,
                sample_rate=sample_rate,
                available=True,
            )
            grouped[interface_id] = record

        if media_class == "Audio/Source":
            record.input_port_count = max(record.input_port_count, channels)
        elif media_class == "Audio/Sink":
            record.output_port_count = max(record.output_port_count, channels)
        if sample_rate and not record.sample_rate:
            record.sample_rate = sample_rate

    return list(grouped.values())


def _avb_records_from_capabilities(capabilities: Dict[str, Any]) -> List[AudioInterfaceRecord]:
    if not isinstance(capabilities, dict):
        return []

    records: List[AudioInterfaceRecord] = []
    for direction_key, direction_label in (
        ("avb_talkers", "talker"),
        ("avb_listeners", "listener"),
    ):
        for entry in capabilities.get(direction_key) or []:
            if not isinstance(entry, dict):
                continue
            endpoint_id = str(entry.get("endpoint_id") or "").strip()
            interface_id = derive_avb_interface_id(endpoint_id)
            if not interface_id:
                continue
            channels = 0
            try:
                channels = int(entry.get("channels") or 0)
            except (TypeError, ValueError):
                channels = 0
            sample_rate = None
            try:
                sample_rate = int(entry.get("sample_rate") or 0) or None
            except (TypeError, ValueError):
                sample_rate = None

            display_name = (
                str(entry.get("device_name") or endpoint_id).strip() or endpoint_id
            )
            record = AudioInterfaceRecord(
                interface_id=interface_id,
                display_name=display_name,
                transport=TRANSPORT_AVB,
                vendor=str(entry.get("vendor") or "").strip() or None,
                product=str(entry.get("model") or "").strip() or None,
                serial=None,
                sample_rate=sample_rate,
                available=bool(entry.get("available", True)),
                direction=direction_label,
            )
            if direction_label == "talker":
                record.input_port_count = channels
            else:
                record.output_port_count = channels
            host = str(entry.get("host") or "").strip()
            if host:
                record.notes.append(f"Host {host}")
            records.append(record)
    return records


def _cluster_records_from_inventory(
    inventory: Dict[str, Any],
    *,
    local_node_id: Optional[str],
) -> List[AudioInterfaceRecord]:
    """Project per-peer PipeWire devices into cluster interface records.

    `inventory` is shaped like `{node_id: {pipewire_devices: [...] }}`. We skip
    the local node — its devices already arrive via the PipeWire source.
    """

    records: List[AudioInterfaceRecord] = []
    if not isinstance(inventory, dict):
        return records

    for node_id, payload in inventory.items():
        if not isinstance(payload, dict):
            continue
        if local_node_id is not None and str(node_id) == str(local_node_id):
            continue
        for device in payload.get("pipewire_devices") or []:
            if not isinstance(device, dict):
                continue
            sub_id = (
                device.get("identifier")
                or device.get("name")
                or device.get("id")
                or ""
            )
            interface_id = derive_cluster_interface_id(node_id, str(sub_id))
            if not interface_id:
                continue
            display_name = (
                str(device.get("description") or device.get("name") or interface_id).strip()
                or interface_id
            )
            record = AudioInterfaceRecord(
                interface_id=interface_id,
                display_name=display_name,
                transport=TRANSPORT_CLUSTER,
                vendor=str(device.get("vendor") or "").strip() or None,
                product=str(device.get("product") or "").strip() or None,
                serial=None,
                sample_rate=None,
                available=bool(device.get("available", True)),
                node_id=str(node_id),
            )
            try:
                record.input_port_count = int(device.get("input_count") or 0)
            except (TypeError, ValueError):
                record.input_port_count = 0
            try:
                record.output_port_count = int(device.get("output_count") or 0)
            except (TypeError, ValueError):
                record.output_port_count = 0
            records.append(record)
    return records


def _sonobus_records_from_bindings(
    bindings: List[Dict[str, Any]],
) -> List[AudioInterfaceRecord]:
    """T2521-7b — project SonoBus binding rows into interface records.

    `bindings` is shaped like the `SonoBusBindingRead` Pydantic export.
    Only `binding_kind == "stream"` rows surface as interface records;
    peers and groups are aggregated separately via `/api/sonobus/peers`
    and `/api/sonobus/groups`.

    Interface IDs follow `sonobus:<peer>:<group>:<stream>` as defined in
    `app/services/sonobus/interface_ids.py`. When binding rows lack the
    information needed to build a canonical ID, the row is dropped
    rather than projecting an unstable identifier.
    """
    if not bindings:
        return []
    from app.services.sonobus.interface_ids import make_sonobus_interface_id

    records: List[AudioInterfaceRecord] = []
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        if binding.get("binding_kind") != "stream":
            continue

        listener_node = str(binding.get("listener_node_id") or "").strip()
        endpoint = ""
        target = binding.get("target_descriptor")
        if isinstance(target, dict):
            endpoint = str(
                target.get("listener_peer_endpoint") or target.get("endpoint") or ""
            ).strip()
        peer_id = listener_node or endpoint
        group_id = str(binding.get("group_id") or "").strip()
        stream_id = (
            str(binding.get("consumer_id") or "").strip()
            or str(binding.get("binding_id") or "").strip()
        )
        if not peer_id or not group_id or not stream_id:
            continue
        # Replace colons that would break the canonical ID shape.
        peer_id = peer_id.replace(":", "_")
        group_id = group_id.replace(":", "_")
        stream_id = stream_id.replace(":", "_")
        try:
            interface_id = make_sonobus_interface_id(
                peer_id=peer_id, group_id=group_id, stream_id=stream_id
            )
        except ValueError:
            continue

        display_name = str(
            binding.get("consumer_label")
            or f"{group_id} → {peer_id}"
        ).strip()
        channel_count = int(binding.get("channel_count") or 0)

        record = AudioInterfaceRecord(
            interface_id=interface_id,
            display_name=display_name,
            transport=TRANSPORT_SONOBUS,
            vendor=None,
            product=None,
            serial=None,
            sample_rate=48000,  # Q7/Q8 locked default.
            available=bool(binding.get("enabled", True)),
            direction="listener",
        )
        record.input_port_count = 0
        record.output_port_count = channel_count
        capability = binding.get("listener_capability")
        if capability:
            record.notes.append(f"Capability {capability}")
        priority = binding.get("transport_priority")
        if priority:
            record.notes.append(f"Priority {priority}")
        records.append(record)
    return records


async def _default_sonobus_bindings_loader() -> List[Dict[str, Any]]:
    """Default loader — pulls enabled stream bindings from the
    SonoBusBindingAuthority. Used by the registry when no override is
    injected.
    """
    try:
        from app.database import get_session
        from app.services.sonobus.binding_authority import SonoBusBindingAuthority
    except Exception:
        return []
    try:
        async with get_session(read_only=True) as session:
            authority = SonoBusBindingAuthority(session)
            bindings = await authority.list_by_kind("stream", enabled_only=True)
            return [b.model_dump() for b in bindings]
    except Exception as exc:
        logger.debug(
            "AudioInterfaceRegistry: SonoBus bindings unavailable: %s", exc
        )
        return []


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class AudioInterfaceRegistry:
    """Async-friendly aggregator across PipeWire + AVB + cluster sources."""

    def __init__(
        self,
        *,
        pipewire_dump_loader=None,
        avb_capabilities_loader=None,
        cluster_inventory_loader=None,
        local_node_id_loader=None,
        sonobus_bindings_loader=None,
    ) -> None:
        self._pipewire_dump_loader = pipewire_dump_loader
        self._avb_capabilities_loader = avb_capabilities_loader
        self._cluster_inventory_loader = cluster_inventory_loader
        self._local_node_id_loader = local_node_id_loader
        self._sonobus_bindings_loader = sonobus_bindings_loader

    async def list_interfaces(self) -> Dict[str, Any]:
        pipewire_records, avb_records, cluster_records, sonobus_records = await asyncio.gather(
            self._safe_pipewire_records(),
            self._safe_avb_records(),
            self._safe_cluster_records(),
            self._safe_sonobus_records(),
        )

        seen: Dict[str, AudioInterfaceRecord] = {}
        ordered: List[AudioInterfaceRecord] = []
        for record in (*pipewire_records, *avb_records, *cluster_records, *sonobus_records):
            if record.interface_id in seen:
                continue
            seen[record.interface_id] = record
            ordered.append(record)

        # Mark the first available PipeWire-USB interface (if any) as the
        # default; otherwise the first available record overall.
        default_id: Optional[str] = None
        for record in ordered:
            if record.transport == TRANSPORT_PIPEWIRE_USB and record.available:
                default_id = record.interface_id
                record.is_default = True
                break
        if default_id is None:
            for record in ordered:
                if record.available:
                    default_id = record.interface_id
                    record.is_default = True
                    break

        return {
            "interfaces": [record.to_dict() for record in ordered],
            "default_interface_id": default_id,
            "transports": list(_KNOWN_TRANSPORTS),
        }

    # ------------------------------------------------------------------
    # Source dispatch with defensive fallbacks
    # ------------------------------------------------------------------

    async def _safe_pipewire_records(self) -> List[AudioInterfaceRecord]:
        try:
            loader = self._pipewire_dump_loader or _default_pipewire_dump_loader
            dump = await loader()
        except Exception as exc:
            logger.debug("AudioInterfaceRegistry: PipeWire dump unavailable: %s", exc)
            return []
        return _pipewire_records_from_dump(dump)

    async def _safe_avb_records(self) -> List[AudioInterfaceRecord]:
        try:
            loader = self._avb_capabilities_loader or _default_avb_capabilities_loader
            capabilities = await loader()
        except Exception as exc:
            logger.debug("AudioInterfaceRegistry: AVB capabilities unavailable: %s", exc)
            return []
        return _avb_records_from_capabilities(capabilities or {})

    async def _safe_cluster_records(self) -> List[AudioInterfaceRecord]:
        local_node_id: Optional[str] = None
        try:
            loader = self._local_node_id_loader or _default_local_node_id_loader
            local_node_id = await loader()
        except Exception as exc:
            logger.debug("AudioInterfaceRegistry: local node id unavailable: %s", exc)
        try:
            loader = self._cluster_inventory_loader or _default_cluster_inventory_loader
            inventory = await loader()
        except Exception as exc:
            logger.debug("AudioInterfaceRegistry: cluster inventory unavailable: %s", exc)
            return []
        return _cluster_records_from_inventory(inventory or {}, local_node_id=local_node_id)

    async def _safe_sonobus_records(self) -> List[AudioInterfaceRecord]:
        try:
            loader = self._sonobus_bindings_loader or _default_sonobus_bindings_loader
            bindings = await loader()
        except Exception as exc:
            logger.debug("AudioInterfaceRegistry: SonoBus bindings unavailable: %s", exc)
            return []
        return _sonobus_records_from_bindings(bindings or [])


# ---------------------------------------------------------------------------
# Default loaders — kept thin so tests can inject stubs cleanly.
# ---------------------------------------------------------------------------


async def _default_pipewire_dump_loader() -> Any:
    try:
        from app.services.pipewire_service import HAS_PW_DUMP, get_pipewire_service
    except Exception:  # pragma: no cover - import guard for partial environments
        return None
    if not HAS_PW_DUMP:
        return None
    service = get_pipewire_service()
    return await service._run_cmd_json(["pw-dump"])


async def _default_avb_capabilities_loader() -> Dict[str, Any]:
    try:
        from app.services.avb.avb_service import get_avb_service
    except Exception:  # pragma: no cover
        return {}
    service = get_avb_service()
    getter = getattr(service, "get_channel_capabilities", None)
    if not callable(getter):
        return {}
    try:
        return getter() or {}
    except Exception as exc:
        logger.debug("AVB capabilities call failed: %s", exc)
        return {}


async def _default_cluster_inventory_loader() -> Dict[str, Any]:
    try:
        from app.services.cluster.hardware_inventory import get_hardware_inventory
    except Exception:  # pragma: no cover
        return {}
    try:
        snapshot = await get_hardware_inventory().get_snapshot()
    except Exception as exc:
        logger.debug("Cluster hardware inventory fetch failed: %s", exc)
        return {}
    payload: Dict[str, Any] = {}
    if isinstance(snapshot, dict):
        for node_id, entry in snapshot.items():
            if not isinstance(entry, dict):
                continue
            payload[str(node_id)] = {"pipewire_devices": entry.get("pipewire_devices") or []}
    return payload


async def _default_local_node_id_loader() -> Optional[str]:
    try:
        from app.services.node_discovery_service import get_local_node_id
    except Exception:  # pragma: no cover
        return None
    try:
        result = get_local_node_id()
        if asyncio.iscoroutine(result):
            result = await result
        return str(result) if result else None
    except Exception:
        return None


_registry_singleton: Optional[AudioInterfaceRegistry] = None


def get_audio_interface_registry() -> AudioInterfaceRegistry:
    global _registry_singleton
    if _registry_singleton is None:
        _registry_singleton = AudioInterfaceRegistry()
    return _registry_singleton


__all__ = [
    "AudioInterfaceRecord",
    "AudioInterfaceRegistry",
    "TRANSPORT_AVB",
    "TRANSPORT_CLUSTER",
    "TRANSPORT_PIPEWIRE_ALSA",
    "TRANSPORT_PIPEWIRE_OTHER",
    "TRANSPORT_PIPEWIRE_USB",
    "derive_avb_interface_id",
    "derive_cluster_interface_id",
    "derive_pipewire_interface_id",
    "get_audio_interface_registry",
]
