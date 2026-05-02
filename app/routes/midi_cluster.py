"""Cluster MIDI REST API routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import config_get, config_set
from app.services.midi_hub.cluster_clock import get_midi_cluster_clock
from app.services.midi_hub.cluster_router import MidiClusterConnection, MidiEndpoint, get_midi_cluster_router
from app.services.midi_hub.device_registry import get_midi_device_registry
from app.services.midi_hub.midi_discovery import MidiNode, get_midi_discovery_service
from app.services.platform_event.cluster_projection import platform_event_to_cluster_dict, query_midi_events
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import get_platform_event_store


router = APIRouter(prefix="/api/midi/cluster", tags=["MIDI Cluster"])


class MidiCapabilitiesResponse(BaseModel):
    input_ports: List[str] = Field(default_factory=list)
    output_ports: List[str] = Field(default_factory=list)
    virtual_ports: List[str] = Field(default_factory=list)
    hub_running: bool = False
    clock_source: str = "internal"
    clock_bpm: float = 120.0
    protocol_version: str = "1.0"
    supports_midi2: bool = False
    sysex_enabled: bool = False


class MidiEndpointResponse(BaseModel):
    endpoint_id: str
    node_id: str
    port_name: str
    direction: str
    device_name: str
    node_address: str
    available: bool
    last_seen: Optional[str] = None
    port_ref: str = ""


class MidiClusterNodeResponse(BaseModel):
    node_id: str
    hostname: str
    addresses: List[str] = Field(default_factory=list)
    port: int = 8000
    online: bool = False
    last_seen: Optional[str] = None
    capabilities: Optional[MidiCapabilitiesResponse] = None
    ports: List[MidiEndpointResponse] = Field(default_factory=list)
    devices: List[Dict[str, Any]] = Field(default_factory=list)


class MidiClusterConnectionResponse(BaseModel):
    connection_id: str
    state: str
    transport: str
    session_id: Optional[str] = None
    established_at: Optional[str] = None
    error_message: Optional[str] = None
    latency_ms: Optional[float] = None
    messages_forwarded: int = 0
    source: MidiEndpointResponse
    destination: MidiEndpointResponse


class ClusterClockResponse(BaseModel):
    master_node_id: Optional[str] = None
    master_bpm: float = 120.0
    strategy: str = "leader-node"
    is_master: bool = False
    sync_offset_ms: float = 0.0
    drift_ms: float = 0.0
    last_sync: Optional[str] = None
    followers: List[str] = Field(default_factory=list)


class ClusterClockDriftMeasurementResponse(BaseModel):
    node_id: str
    role: str = "follower"
    drift_ms: Optional[float] = None
    sync_offset_ms: Optional[float] = None
    last_sync: Optional[str] = None
    available: bool = True


class ClusterClockDriftResponse(BaseModel):
    master_node_id: Optional[str] = None
    strategy: str = "leader-node"
    generated_at: str
    measurements: List[ClusterClockDriftMeasurementResponse] = Field(default_factory=list)


class AutoConnectStatusResponse(BaseModel):
    reason: str = "not_run"
    last_run_at: Optional[str] = None
    pair_count: int = 0
    created_count: int = 0
    failed_count: int = 0
    created_connections: List[str] = Field(default_factory=list)
    failed_connections: List[Dict[str, Any]] = Field(default_factory=list)
    transport: str = "rtp-midi"
    attempt: Optional[int] = None
    attempts_total: Optional[int] = None


class MidiClusterSummaryResponse(BaseModel):
    enabled: bool = False
    node_count: int = 0
    endpoint_count: int = 0
    connection_count: int = 0
    device_count: int = 0
    clock: ClusterClockResponse
    auto_connect: AutoConnectStatusResponse


class MidiClusterInventoryNodeResponse(BaseModel):
    node_id: str
    remote: bool
    device_count: int
    devices: List[Dict[str, Any]] = Field(default_factory=list)


class MidiClusterDevicesResponse(BaseModel):
    count: int = 0
    node_count: int = 0
    nodes: List[MidiClusterInventoryNodeResponse] = Field(default_factory=list)
    by_node: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    profiles: List[Dict[str, Any]] = Field(default_factory=list)


class MidiClusterNodeDevicesResponse(BaseModel):
    node_id: str
    device_count: int = 0
    devices: List[Dict[str, Any]] = Field(default_factory=list)


class MidiEventSummaryResponse(BaseModel):
    event_type: str
    timestamp: str
    severity: str
    source_node_id: str
    affected_nodes: List[str] = Field(default_factory=list)
    message: str = ""
    details: Dict[str, Any] = Field(default_factory=dict)
    correlation_id: str = ""


class MidiClusterHealthNodeResponse(BaseModel):
    node_id: str
    hostname: str
    online: bool
    latency_ms: Optional[float] = None
    input_port_count: int = 0
    output_port_count: int = 0
    device_count: int = 0


class MidiClusterHealthResponse(BaseModel):
    enabled: bool = False
    status: str = "disabled"
    node_count: int = 0
    connection_count: int = 0
    healthy_connection_count: int = 0
    degraded_connections: int = 0
    clock_status: str = "disabled"
    clock_drift_ms: float = 0.0
    per_node: List[MidiClusterHealthNodeResponse] = Field(default_factory=list)
    recent_events: List[MidiEventSummaryResponse] = Field(default_factory=list)


class MidiClusterConnectRequest(BaseModel):
    source_endpoint_id: str = Field(..., min_length=1, max_length=255)
    destination_endpoint_id: str = Field(..., min_length=1, max_length=255)
    transport: Optional[str] = Field(default=None, pattern="^(rtp-midi|http-mesh|udp-raw)$")


class ClusterClockStrategyRequest(BaseModel):
    strategy: str = Field(..., pattern="^(leader-node|lowest-latency|manual|external)$")
    manual_node_id: Optional[str] = Field(default=None, min_length=1, max_length=255)


class ClusterActionResponse(BaseModel):
    ok: bool
    message: str
    connection_id: Optional[str] = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _cluster_enabled() -> bool:
    return bool(config_get("midi.cluster.enabled", False))


def _ensure_cluster_enabled() -> None:
    if not _cluster_enabled():
        raise HTTPException(status_code=409, detail="Cluster MIDI is disabled")


def _clock_status(clock_state: Any) -> str:
    if not _cluster_enabled():
        return "disabled"
    if getattr(clock_state, "is_master", False):
        return "master"
    if getattr(clock_state, "master_node_id", None) is None:
        return "external"
    return "synced"


def _endpoint_response(endpoint: MidiEndpoint) -> MidiEndpointResponse:
    return MidiEndpointResponse(
        endpoint_id=endpoint.endpoint_id(),
        node_id=endpoint.node_id,
        port_name=endpoint.port_name,
        direction=endpoint.direction,
        device_name=endpoint.device_name,
        node_address=endpoint.node_address,
        available=bool(endpoint.available),
        last_seen=_isoformat(endpoint.last_seen),
        port_ref=endpoint.port_ref,
    )


def _connection_response(connection: MidiClusterConnection) -> MidiClusterConnectionResponse:
    return MidiClusterConnectionResponse(
        connection_id=connection.connection_id,
        state=connection.state,
        transport=connection.transport,
        session_id=connection.session_id,
        established_at=_isoformat(connection.established_at),
        error_message=connection.error_message,
        latency_ms=connection.latency_ms,
        messages_forwarded=int(connection.messages_forwarded),
        source=_endpoint_response(connection.source),
        destination=_endpoint_response(connection.destination),
    )


def _clock_response() -> ClusterClockResponse:
    state = get_midi_cluster_clock().get_state()
    return ClusterClockResponse(
        master_node_id=state.master_node_id,
        master_bpm=float(state.master_bpm),
        strategy=state.strategy.value,
        is_master=bool(state.is_master),
        sync_offset_ms=float(state.sync_offset_ms),
        drift_ms=float(state.drift_ms),
        last_sync=_isoformat(state.last_sync),
        followers=list(state.followers),
    )


def _auto_connect_response() -> AutoConnectStatusResponse:
    return AutoConnectStatusResponse(**get_midi_cluster_router().get_auto_connect_status())


def _event_response(event: PlatformEvent) -> MidiEventSummaryResponse:
    payload = platform_event_to_cluster_dict(event)
    return MidiEventSummaryResponse(
        event_type=str(payload["event_type"]),
        timestamp=str(payload["timestamp"] or _utcnow().isoformat().replace("+00:00", "Z")),
        severity=str(payload["severity"]),
        source_node_id=str(payload["source_node_id"]),
        affected_nodes=list(payload["affected_nodes"]),
        message=str(payload["message"]),
        details=dict(payload["details"]),
        correlation_id=str(payload["correlation_id"]),
    )


def _node_latency_ms(node_id: str, connections: List[MidiClusterConnection]) -> Optional[float]:
    latencies = [
        float(connection.latency_ms)
        for connection in connections
        if connection.latency_ms is not None
        and node_id in {connection.source.node_id, connection.destination.node_id}
    ]
    if not latencies:
        return None
    return sum(latencies) / len(latencies)


def _find_node(node_id: str) -> Optional[MidiNode]:
    target = str(node_id)
    for node in get_midi_discovery_service().get_discovered_nodes(online_only=False):
        if node.node_id == target:
            return node
    return None


def _node_response(node_id: str) -> MidiClusterNodeResponse:
    router_service = get_midi_cluster_router()
    registry = get_midi_device_registry()
    node = _find_node(node_id)
    ports = [_endpoint_response(endpoint) for endpoint in router_service.get_endpoints_for_node(node_id)]
    devices = registry.get_node_devices(node_id)

    if node is None and not ports and not devices:
        raise HTTPException(status_code=404, detail=f"Unknown MIDI cluster node: {node_id}")

    capabilities = None
    online = False
    hostname = str(node_id)
    addresses: List[str] = []
    port = 8000
    last_seen = None
    if node is not None:
        online = node.is_online(int(config_get("midi.cluster.discovery_timeout_s", 120)))
        hostname = node.hostname
        addresses = list(node.addresses)
        port = int(node.port)
        last_seen = _isoformat(node.last_seen)
        if node.midi_capabilities is not None:
            capabilities = MidiCapabilitiesResponse(
                input_ports=list(node.midi_capabilities.input_ports),
                output_ports=list(node.midi_capabilities.output_ports),
                virtual_ports=list(node.midi_capabilities.virtual_ports),
                hub_running=bool(node.midi_capabilities.hub_running),
                clock_source=node.midi_capabilities.clock_source,
                clock_bpm=float(node.midi_capabilities.clock_bpm),
                protocol_version=node.midi_capabilities.protocol_version,
                supports_midi2=bool(node.midi_capabilities.supports_midi2),
                sysex_enabled=bool(node.midi_capabilities.sysex_enabled),
            )
    elif ports or devices:
        online = True
        addresses = sorted({port.node_address for port in ports if port.node_address})
        last_seen = max((port.last_seen for port in ports if port.last_seen), default=None)

    return MidiClusterNodeResponse(
        node_id=str(node_id),
        hostname=hostname,
        addresses=addresses,
        port=port,
        online=online,
        last_seen=last_seen,
        capabilities=capabilities,
        ports=ports,
        devices=devices,
    )


def _midi_events(
    *,
    event_type: Optional[str],
    severity: Optional[str],
    node_id: Optional[str],
    hours: int,
    limit: int,
) -> List[PlatformEvent]:
    store = get_platform_event_store()
    safe_limit = max(1, min(int(limit), 1000))
    safe_hours = max(1, min(int(hours), 24 * 30))

    severity_values: Optional[list[str]] = None
    if severity:
        normalized_severity = str(severity).strip().lower()
        if normalized_severity not in {item.value for item in Severity}:
            raise HTTPException(status_code=400, detail=f"Unknown severity: {severity}")
        severity_values = [normalized_severity]

    requested_kinds: Optional[list[str]] = None
    if event_type:
        normalized_kind = str(event_type).strip()
        if not normalized_kind.startswith("midi."):
            raise HTTPException(status_code=400, detail=f"Unknown event type: {event_type}")
        requested_kinds = [normalized_kind]

    return query_midi_events(
        store,
        limit=safe_limit,
        hours=safe_hours,
        source_node=str(node_id) if node_id else None,
        severities=severity_values,
        kinds=requested_kinds,
    )


@router.get("/nodes", response_model=List[MidiClusterNodeResponse])
async def list_cluster_nodes() -> List[MidiClusterNodeResponse]:
    discovery = get_midi_discovery_service()
    return [_node_response(node.node_id) for node in discovery.get_discovered_nodes(online_only=False)]


@router.get("/nodes/{node_id}", response_model=MidiClusterNodeResponse)
async def get_cluster_node(node_id: str) -> MidiClusterNodeResponse:
    return _node_response(node_id)


@router.get("/nodes/{node_id}/ports", response_model=List[MidiEndpointResponse])
async def get_cluster_node_ports(node_id: str) -> List[MidiEndpointResponse]:
    _node_response(node_id)
    router_service = get_midi_cluster_router()
    return [_endpoint_response(endpoint) for endpoint in router_service.get_endpoints_for_node(node_id)]


@router.get("/endpoints", response_model=List[MidiEndpointResponse])
async def list_cluster_endpoints() -> List[MidiEndpointResponse]:
    router_service = get_midi_cluster_router()
    return [_endpoint_response(endpoint) for endpoint in router_service.get_endpoints()]


@router.get("/summary", response_model=MidiClusterSummaryResponse)
async def get_cluster_summary() -> MidiClusterSummaryResponse:
    discovery = get_midi_discovery_service()
    router_service = get_midi_cluster_router()
    inventory = get_midi_device_registry().get_global_snapshot()
    return MidiClusterSummaryResponse(
        enabled=_cluster_enabled(),
        node_count=int(discovery.get_discovery_summary().get("total_nodes", 0)),
        endpoint_count=len(router_service.get_endpoints()),
        connection_count=len(router_service.get_connections()),
        device_count=int(inventory.get("count", 0)),
        clock=_clock_response(),
        auto_connect=_auto_connect_response(),
    )


@router.get("/connections", response_model=List[MidiClusterConnectionResponse])
async def list_cluster_connections() -> List[MidiClusterConnectionResponse]:
    router_service = get_midi_cluster_router()
    return [_connection_response(connection) for connection in router_service.get_connections()]


@router.post("/connections/auto-connect", response_model=AutoConnectStatusResponse)
async def run_cluster_auto_connect() -> AutoConnectStatusResponse:
    _ensure_cluster_enabled()
    summary = await get_midi_cluster_router().trigger_auto_connect(reason="manual")
    return AutoConnectStatusResponse(**summary)


@router.get("/connections/auto-connect/status", response_model=AutoConnectStatusResponse)
async def get_cluster_auto_connect_status() -> AutoConnectStatusResponse:
    return _auto_connect_response()


@router.post("/connections", response_model=MidiClusterConnectionResponse)
async def create_cluster_connection(request: MidiClusterConnectRequest) -> MidiClusterConnectionResponse:
    _ensure_cluster_enabled()
    router_service = get_midi_cluster_router()
    try:
        connection = await router_service.connect(
            request.source_endpoint_id,
            request.destination_endpoint_id,
            transport=request.transport,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _connection_response(connection)


@router.get("/connections/{connection_id}", response_model=MidiClusterConnectionResponse)
async def get_cluster_connection(connection_id: str) -> MidiClusterConnectionResponse:
    router_service = get_midi_cluster_router()
    connection = router_service.get_connection(connection_id)
    if connection is None:
        raise HTTPException(status_code=404, detail=f"Unknown MIDI cluster connection: {connection_id}")
    return _connection_response(connection)


@router.delete("/connections/{connection_id}", response_model=ClusterActionResponse)
async def delete_cluster_connection(connection_id: str) -> ClusterActionResponse:
    _ensure_cluster_enabled()
    ok = await get_midi_cluster_router().disconnect(connection_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Unknown MIDI cluster connection: {connection_id}")
    return ClusterActionResponse(ok=True, message="Connection disconnected", connection_id=connection_id)


@router.get("/clock/drift", response_model=ClusterClockDriftResponse)
async def get_cluster_clock_drift() -> ClusterClockDriftResponse:
    report = get_midi_cluster_clock().get_drift_report()
    return ClusterClockDriftResponse(**report)


@router.get("/clock", response_model=ClusterClockResponse)
async def get_cluster_clock() -> ClusterClockResponse:
    return _clock_response()


@router.put("/clock/strategy", response_model=ClusterClockResponse)
async def update_cluster_clock_strategy(request: ClusterClockStrategyRequest) -> ClusterClockResponse:
    _ensure_cluster_enabled()
    clock = get_midi_cluster_clock()
    clock.set_manual_master(request.manual_node_id or "")
    clock.set_strategy(request.strategy)
    return _clock_response()


@router.post("/clock/sync", response_model=ClusterClockDriftResponse)
async def sync_cluster_clock() -> ClusterClockDriftResponse:
    _ensure_cluster_enabled()
    report = await get_midi_cluster_clock().force_resync()
    return ClusterClockDriftResponse(**report)


@router.get("/devices", response_model=MidiClusterDevicesResponse)
async def get_cluster_devices() -> MidiClusterDevicesResponse:
    snapshot = get_midi_device_registry().get_global_snapshot()
    return MidiClusterDevicesResponse(
        count=int(snapshot.get("count", 0)),
        node_count=int(snapshot.get("node_count", 0)),
        nodes=[
            MidiClusterInventoryNodeResponse(
                node_id=str(node.get("node_id") or ""),
                remote=bool(node.get("remote", False)),
                device_count=int(node.get("device_count", 0)),
                devices=list(node.get("devices", [])),
            )
            for node in snapshot.get("nodes", [])
        ],
        by_node={str(key): list(value) for key, value in snapshot.get("by_node", {}).items()},
        profiles=list(snapshot.get("profiles", [])),
    )


@router.get("/devices/{node_id}", response_model=MidiClusterNodeDevicesResponse)
async def get_cluster_node_devices(node_id: str) -> MidiClusterNodeDevicesResponse:
    devices = get_midi_device_registry().get_node_devices(node_id)
    if not devices and _find_node(node_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown MIDI cluster node: {node_id}")
    return MidiClusterNodeDevicesResponse(node_id=node_id, device_count=len(devices), devices=devices)


@router.post("/devices/failover/{port_name}", response_model=MidiClusterConnectionResponse)
async def failover_cluster_port(port_name: str) -> MidiClusterConnectionResponse:
    _ensure_cluster_enabled()
    connection = await get_midi_cluster_router().failover_port(port_name)
    if connection is None:
        raise HTTPException(status_code=404, detail=f"No failover candidate found for MIDI port: {port_name}")
    return _connection_response(connection)


@router.get("/health", response_model=MidiClusterHealthResponse)
async def get_cluster_health() -> MidiClusterHealthResponse:
    discovery = get_midi_discovery_service()
    router_service = get_midi_cluster_router()
    clock_state = get_midi_cluster_clock().get_state()
    connections = router_service.get_connections()
    recent_events = _midi_events(event_type=None, severity=None, node_id=None, hours=24, limit=20)
    inventory = get_midi_device_registry().get_global_snapshot().get("by_node", {})

    nodes = discovery.get_discovered_nodes(online_only=False)
    per_node = [
        MidiClusterHealthNodeResponse(
            node_id=node.node_id,
            hostname=node.hostname,
            online=node.is_online(int(config_get("midi.cluster.discovery_timeout_s", 120))),
            latency_ms=_node_latency_ms(node.node_id, connections),
            input_port_count=len(getattr(node.midi_capabilities, "input_ports", []) or []),
            output_port_count=len(getattr(node.midi_capabilities, "output_ports", []) or []),
            device_count=len(inventory.get(node.node_id, [])),
        )
        for node in nodes
    ]
    healthy_connection_count = sum(1 for connection in connections if connection.state == "connected")
    degraded_connections = sum(1 for connection in connections if connection.state not in {"connected", "disconnected"})

    status = "disabled"
    if _cluster_enabled():
        status = "healthy"
        if degraded_connections or float(clock_state.drift_ms) > 2.0 or any(not node.online for node in per_node):
            status = "degraded"

    return MidiClusterHealthResponse(
        enabled=_cluster_enabled(),
        status=status,
        node_count=len(nodes),
        connection_count=len(connections),
        healthy_connection_count=healthy_connection_count,
        degraded_connections=degraded_connections,
        clock_status=_clock_status(clock_state),
        clock_drift_ms=float(clock_state.drift_ms),
        per_node=per_node,
        recent_events=[_event_response(event) for event in recent_events],
    )


# T2486-1 — cluster MIDI settings (enabled + auto_connect) read/write surface.

class MidiClusterSettingsResponse(BaseModel):
    enabled: bool
    auto_connect: bool


class MidiClusterSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    auto_connect: Optional[bool] = None


@router.get("/settings", response_model=MidiClusterSettingsResponse)
def get_cluster_settings() -> MidiClusterSettingsResponse:
    """
    Read the current values of the two cluster MIDI gates.

    `midi.cluster.enabled` is the master switch — when False, the
    cluster MIDI router is fully disabled. `midi.cluster.auto_connect`
    is the per-peer auto-pair switch — when True (and enabled is also
    True), discovered peer ports are automatically paired with local
    ports on `midi.node.discovered`. Both default to False per the
    fail-closed posture asserted in
    `tests/test_cluster_midi_foundation.py::test_cluster_midi_defaults_fail_closed`.
    """
    return MidiClusterSettingsResponse(
        enabled=bool(config_get("midi.cluster.enabled", False)),
        auto_connect=bool(config_get("midi.cluster.auto_connect", False)),
    )


@router.patch("/settings", response_model=MidiClusterSettingsResponse)
def update_cluster_settings(payload: MidiClusterSettingsUpdate) -> MidiClusterSettingsResponse:
    """
    T2486-1 — partial update of the cluster MIDI gates.

    Only the fields explicitly set on the payload are written. Schema
    defaults (False/False) remain the on-disk default unless the
    operator explicitly opts in here. The Carbon Modal in
    MidiServicesNetworkPage uses the coupled-flip flow: enabling
    `enabled` prompts the operator to also enable `auto_connect` (Q2
    locked decision in PROJECT_WORKLIST.md T2486 entry).
    """
    if payload.enabled is not None:
        config_set("midi.cluster.enabled", bool(payload.enabled))
    if payload.auto_connect is not None:
        config_set("midi.cluster.auto_connect", bool(payload.auto_connect))
    return MidiClusterSettingsResponse(
        enabled=bool(config_get("midi.cluster.enabled", False)),
        auto_connect=bool(config_get("midi.cluster.auto_connect", False)),
    )
