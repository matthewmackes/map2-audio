"""MAP2 bridge contracts and implementations for the Push surface."""

from __future__ import annotations

import asyncio
import copy
import json
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Protocol

import httpx
import websockets

from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.events import Map2Event, Map2EventType
from app.services.push_surface.models.state import ChainSummary, ClusterNode, NodeSummary, ParameterKind, ParameterModel, PresetSummary, RoutingSlot, RoutingState


def make_chain_id(snapshot_id: int, chain_id: int) -> str:
    """Build a stable chain identifier for surface state."""

    return f"snapshot:{int(snapshot_id)}:chain:{int(chain_id)}"


def parse_chain_id(chain_id: str) -> tuple[int, int]:
    """Parse a normalized chain identifier."""

    parts = str(chain_id).split(":")
    if len(parts) != 4 or parts[0] != "snapshot" or parts[2] != "chain":
        raise ValueError(f"invalid chain id: {chain_id}")
    return int(parts[1]), int(parts[3])


def make_node_id(snapshot_id: int, chain_id: int, position: int) -> str:
    """Build a stable node identifier using snapshot/chain/position."""

    return f"snapshot:{int(snapshot_id)}:chain:{int(chain_id)}:position:{int(position)}"


def parse_node_id(node_id: str) -> tuple[int, int, int]:
    """Parse a normalized node identifier."""

    parts = str(node_id).split(":")
    if (
        len(parts) != 6
        or parts[0] != "snapshot"
        or parts[2] != "chain"
        or parts[4] != "position"
    ):
        raise ValueError(f"invalid node id: {node_id}")
    return int(parts[1]), int(parts[3]), int(parts[5])


def _plugin_category(name: str, uri: str) -> str:
    text = f"{name} {uri}".lower()
    if any(token in text for token in ("input", "capture", "preamp")):
        return "input"
    if any(token in text for token in ("amp", "distortion", "drive", "5150", "bassman")):
        return "amp"
    if any(token in text for token in ("cab", "ir", "convolution")):
        return "cab/ir"
    if any(token in text for token in ("eq", "filter", "tone")):
        return "eq/filter"
    if any(token in text for token in ("compress", "gate", "limit", "dynamics")):
        return "dynamics"
    if any(token in text for token in ("chorus", "flange", "phase", "mod")):
        return "modulation"
    if "delay" in text or "echo" in text:
        return "delay"
    if any(token in text for token in ("reverb", "hall", "plate")):
        return "reverb"
    if any(token in text for token in ("avb", "stream", "talker", "listener")):
        return "avb i/o"
    if "midi" in text or "router" in text:
        return "midi/router"
    return "utility"


def _category_color(category: str) -> SurfaceColor:
    mapping = {
        "input": SurfaceColor.GREEN,
        "amp": SurfaceColor.ORANGE,
        "cab/ir": SurfaceColor.AMBER,
        "eq/filter": SurfaceColor.YELLOW,
        "dynamics": SurfaceColor.CYAN,
        "modulation": SurfaceColor.BLUE,
        "delay": SurfaceColor.MAGENTA,
        "reverb": SurfaceColor.WHITE,
        "utility": SurfaceColor.DIM,
        "avb i/o": SurfaceColor.GREEN,
        "midi/router": SurfaceColor.CYAN,
    }
    return mapping.get(category, SurfaceColor.WHITE)


def _parameter_from_value(param_id: str, value: Any) -> ParameterModel:
    name = str(param_id).replace("_", " ").title()
    if isinstance(value, bool):
        return ParameterModel(
            id=str(param_id),
            name=name,
            kind=ParameterKind.TOGGLE,
            value=value,
            default_value=False,
        )

    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return ParameterModel(
            id=str(param_id),
            name=name,
            kind=ParameterKind.ENUM,
            value=str(value),
            default_value=str(value),
            step_values=(str(value),),
        )

    min_value = 0.0
    max_value = 1.0
    kind = ParameterKind.LINEAR
    if numeric < 0:
        min_value = -1.0
        max_value = 1.0
        kind = ParameterKind.BIPOLAR
    elif numeric > 1.0:
        max_value = 100.0 if numeric <= 100.0 else 127.0
        if numeric.is_integer():
            kind = ParameterKind.STEPPED

    return ParameterModel(
        id=str(param_id),
        name=name,
        kind=kind,
        value=numeric,
        default_value=min_value,
        min_value=min_value,
        max_value=max_value,
    )


def _parameters_from_plugin(plugin: dict[str, Any]) -> tuple[ParameterModel, ...]:
    parameter_map: dict[str, Any] = {}
    parameter_map.update(plugin.get("parameters") or {})
    loader_state = plugin.get("loader_state") or {}
    for key, value in loader_state.items():
        if key in parameter_map:
            continue
        if isinstance(value, (bool, int, float)):
            parameter_map[key] = value
    return tuple(_parameter_from_value(key, value) for key, value in sorted(parameter_map.items()))


def _detail_to_chains(snapshot_id: int, detail: dict[str, Any]) -> list[ChainSummary]:
    chains: list[ChainSummary] = []
    for chain in detail.get("chains", []):
        chain_identifier = make_chain_id(snapshot_id, int(chain.get("id") or 0))
        nodes: list[NodeSummary] = []
        for plugin in chain.get("plugins", []):
            position = int(plugin.get("position", len(nodes)))
            category = _plugin_category(str(plugin.get("name") or ""), str(plugin.get("uri") or ""))
            nodes.append(
                NodeSummary(
                    id=make_node_id(snapshot_id, int(chain.get("id") or 0), position),
                    chain_id=chain_identifier,
                    name=str(plugin.get("name") or plugin.get("uri") or f"Node {position + 1}"),
                    node_type=str(plugin.get("uri") or "plugin"),
                    category=category,
                    bypassed=bool(plugin.get("bypass", False)),
                    color_hint=_category_color(category),
                    parameters=_parameters_from_plugin(plugin),
                    metadata={"uri": plugin.get("uri"), "position": position},
                )
            )
        chains.append(
            ChainSummary(
                id=chain_identifier,
                name=str(chain.get("name") or f"Chain {len(chains) + 1}"),
                nodes=tuple(nodes),
                is_active=bool(detail.get("is_active", False)),
                health="healthy",
            )
        )
    return chains


def _detail_to_routing_state(detail: dict[str, Any]) -> RoutingState:
    paths = detail.get("paths", [])
    if not isinstance(paths, list):
        paths = []
    sources = [f"snapshot:path:{item.get('id')}" for item in paths if item.get("id")]
    destinations = [f"snapshot:path:{item.get('id')}" for item in paths if item.get("id")]
    active_channel_key = (detail.get("routing") or {}).get("active_channel_key")
    active_source = f"snapshot:path:{active_channel_key}" if active_channel_key else None
    slots = []
    for source_id in sources:
        for destination_id in destinations:
            active = source_id == active_source and source_id == destination_id
            slots.append(
                RoutingSlot(
                    source_id=source_id,
                    destination_id=destination_id,
                    active=active,
                )
            )
    return RoutingState(
        mode=str((detail.get("routing") or {}).get("mode") or "parallel_blend"),
        sources=tuple(sources[:8]),
        destinations=tuple(destinations[:8]),
        slots=tuple(slots),
        selected_source=active_source,
        selected_destination=active_source,
        pending_confirmation=False,
    )


def _find_plugin(detail: dict[str, Any], chain_id: int, position: int) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    for chain in detail.get("chains", []):
        if int(chain.get("id") or 0) != int(chain_id):
            continue
        for plugin in chain.get("plugins", []):
            if int(plugin.get("position", -1)) == int(position):
                return plugin, chain
    return None, None


class Map2SurfaceAPI(Protocol):
    """Normalized MAP2 bridge contract for the Push surface."""

    async def list_presets(self) -> list[PresetSummary]:
        ...

    async def list_chains(self, preset_id: str | None = None) -> list[ChainSummary]:
        ...

    async def get_chain_nodes(self, chain_id: str) -> list[NodeSummary]:
        ...

    async def get_node_parameters(self, node_id: str) -> list[ParameterModel]:
        ...

    async def set_parameter(self, node_id: str, parameter_id: str, value: Any) -> None:
        ...

    async def toggle_bypass(self, node_id: str) -> None:
        ...

    async def load_preset(self, preset_id: str) -> None:
        ...

    async def update_routing(self, source_id: str, destination_id: str) -> None:
        ...

    async def get_routing_state(self, preset_id: str | None = None) -> RoutingState:
        ...

    async def get_cluster_nodes(self) -> list[ClusterNode]:
        ...

    async def subscribe_events(self) -> AsyncIterator[Map2Event]:
        ...

    async def get_health(self) -> dict[str, Any]:
        ...

    async def list_drum_instances(self) -> list[dict[str, Any]]:
        ...

    async def get_drum_surface_state(self, device_fingerprint: str) -> dict[str, Any]:
        ...

    async def dispatch_drum_command(self, device_fingerprint: str, command: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        ...


class DirectMap2SurfaceBridge:
    """In-process bridge that talks directly to MAP2 services/routes."""

    def __init__(self) -> None:
        self._selected_snapshot_id: int | None = None
        self._event_queue: asyncio.Queue[Map2Event] = asyncio.Queue()
        self._detail_cache: dict[int, dict[str, Any]] = {}

    @asynccontextmanager
    async def _session(self):
        from app.database import get_session

        async with get_session() as session:
            yield session

    async def _resolve_snapshot_id(self, preset_id: str | None = None) -> int:
        if preset_id is not None:
            return int(preset_id)

        if self._selected_snapshot_id is not None:
            return self._selected_snapshot_id

        async with self._session() as session:
            from app.services.snapshot_service import SnapshotService

            service = SnapshotService(session)
            control_plane_snapshot_id = await service.get_control_plane_snapshot_id()
            if control_plane_snapshot_id is not None:
                self._selected_snapshot_id = int(control_plane_snapshot_id)
                return self._selected_snapshot_id
            presets = await service.list_snapshots()
            if not presets:
                raise RuntimeError("no snapshots available")
            self._selected_snapshot_id = int(presets[0]["id"])
            return self._selected_snapshot_id

    async def _get_snapshot_detail(self, snapshot_id: int) -> dict[str, Any]:
        if snapshot_id in self._detail_cache:
            return copy.deepcopy(self._detail_cache[snapshot_id])
        async with self._session() as session:
            from app.services.snapshot_service import SnapshotService

            detail = await SnapshotService(session).get_snapshot(snapshot_id)
            if detail is None:
                raise RuntimeError(f"snapshot {snapshot_id} not found")
            self._detail_cache[snapshot_id] = copy.deepcopy(detail)
            return detail

    async def list_presets(self) -> list[PresetSummary]:
        async with self._session() as session:
            from app.services.snapshot_service import SnapshotService

            service = SnapshotService(session)
            presets = await service.list_snapshots()
            control_plane_snapshot_id = await service.get_control_plane_snapshot_id()
        summaries = [
            PresetSummary(
                id=str(item["id"]),
                name=str(item.get("name") or f"Snapshot {item['id']}"),
                program_number=item.get("program_number"),
                is_active=control_plane_snapshot_id is not None and int(item["id"]) == int(control_plane_snapshot_id),
                is_favorite=bool(item.get("is_favorite", False)),
            )
            for item in presets
        ]
        if self._selected_snapshot_id is None:
            for preset in summaries:
                if preset.is_active:
                    self._selected_snapshot_id = int(preset.id)
                    break
        return summaries

    async def list_chains(self, preset_id: str | None = None) -> list[ChainSummary]:
        snapshot_id = await self._resolve_snapshot_id(preset_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        return _detail_to_chains(snapshot_id, detail)

    async def get_chain_nodes(self, chain_id: str) -> list[NodeSummary]:
        snapshot_id, parsed_chain_id = parse_chain_id(chain_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        for chain in _detail_to_chains(snapshot_id, detail):
            if chain.id == make_chain_id(snapshot_id, parsed_chain_id):
                return list(chain.nodes)
        return []

    async def get_node_parameters(self, node_id: str) -> list[ParameterModel]:
        snapshot_id, chain_id, position = parse_node_id(node_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        plugin, _chain = _find_plugin(detail, chain_id, position)
        if plugin is None:
            return []
        return list(_parameters_from_plugin(plugin))

    async def set_parameter(self, node_id: str, parameter_id: str, value: Any) -> None:
        snapshot_id, chain_id, position = parse_node_id(node_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        mutable = copy.deepcopy(detail)
        plugin, _chain = _find_plugin(mutable, chain_id, position)
        if plugin is None:
            raise RuntimeError(f"node not found: {node_id}")
        parameters = dict(plugin.get("parameters") or {})
        parameters[str(parameter_id)] = value
        plugin["parameters"] = parameters

        async with self._session() as session:
            from app.services.snapshot_service import SnapshotService

            updated = await SnapshotService(session).update_snapshot(snapshot_id, detail_payload=mutable)
            if updated is None:
                raise RuntimeError(f"snapshot update failed: {snapshot_id}")
        self._detail_cache[snapshot_id] = copy.deepcopy(updated)
        await self.publish_event(
            Map2Event(
                event_type=Map2EventType.PARAMETER_CHANGED,
                timestamp=time.time(),
                payload={"node_id": node_id, "parameter_id": parameter_id, "value": value},
            )
        )

    async def toggle_bypass(self, node_id: str) -> None:
        snapshot_id, chain_id, position = parse_node_id(node_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        mutable = copy.deepcopy(detail)
        plugin, _chain = _find_plugin(mutable, chain_id, position)
        if plugin is None:
            raise RuntimeError(f"node not found: {node_id}")
        plugin["bypass"] = not bool(plugin.get("bypass", False))
        async with self._session() as session:
            from app.services.snapshot_service import SnapshotService

            updated = await SnapshotService(session).update_snapshot(snapshot_id, detail_payload=mutable)
            if updated is None:
                raise RuntimeError(f"snapshot update failed: {snapshot_id}")
        self._detail_cache[snapshot_id] = copy.deepcopy(updated)
        await self.publish_event(
            Map2Event(
                event_type=Map2EventType.BYPASS_CHANGED,
                timestamp=time.time(),
                payload={"node_id": node_id, "bypassed": plugin["bypass"]},
            )
        )

    async def load_preset(self, preset_id: str) -> None:
        snapshot_id = int(preset_id)
        async with self._session() as session:
            from app.services.snapshot_service import SnapshotService

            activation = await SnapshotService(session).activate_snapshot(snapshot_id)
            if activation is None:
                raise RuntimeError(f"snapshot activation failed: {snapshot_id}")
        self._selected_snapshot_id = snapshot_id
        self._detail_cache.pop(snapshot_id, None)
        await self.publish_event(
            Map2Event(
                event_type=Map2EventType.PRESET_LOADED,
                timestamp=time.time(),
                payload={"preset_id": snapshot_id},
            )
        )

    async def update_routing(self, source_id: str, destination_id: str) -> None:
        snapshot_id = await self._resolve_snapshot_id(None)
        if source_id.startswith("avb:t:") and destination_id.startswith("avb:l:"):
            from app.routes import avb as avb_routes

            talker_id = source_id.removeprefix("avb:t:")
            listener_id = destination_id.removeprefix("avb:l:")
            await avb_routes.connect_streams({"talker_id": talker_id, "listener_id": listener_id})
        else:
            path_id = source_id.removeprefix("snapshot:path:")
            async with self._session() as session:
                from app.services.snapshot_service import SnapshotService

                updated = await SnapshotService(session).update_routing(snapshot_id, {"active_channel_key": path_id})
                if updated is None:
                    raise RuntimeError(f"routing update failed for snapshot {snapshot_id}")
                self._detail_cache[snapshot_id] = copy.deepcopy(updated)
        await self.publish_event(
            Map2Event(
                event_type=Map2EventType.ROUTE_CHANGED,
                timestamp=time.time(),
                payload={"source_id": source_id, "destination_id": destination_id},
            )
        )

    async def get_routing_state(self, preset_id: str | None = None) -> RoutingState:
        try:
            from app.routes import avb as avb_routes

            endpoints = await avb_routes.get_router_endpoints()
            connections = await avb_routes.get_router_connections()
            talkers = [item for item in endpoints.get("endpoints", []) if item.get("direction") == "talker"]
            listeners = [item for item in endpoints.get("endpoints", []) if item.get("direction") == "listener"]
            if talkers and listeners:
                slots = []
                active_pairs = {
                    (
                        f"avb:t:{item['talker']['endpoint_id']}",
                        f"avb:l:{item['listener']['endpoint_id']}",
                    )
                    for item in connections.get("connections", [])
                    if isinstance(item, dict) and item.get("talker") and item.get("listener")
                }
                source_ids = [f"avb:t:{item['endpoint_id']}" for item in talkers[:8]]
                dest_ids = [f"avb:l:{item['endpoint_id']}" for item in listeners[:8]]
                for source_id in source_ids:
                    for destination_id in dest_ids:
                        slots.append(
                            RoutingSlot(
                                source_id=source_id,
                                destination_id=destination_id,
                                active=(source_id, destination_id) in active_pairs,
                            )
                        )
                return RoutingState(
                    mode="avb_router",
                    sources=tuple(source_ids),
                    destinations=tuple(dest_ids),
                    slots=tuple(slots),
                )
        except Exception:
            pass

        snapshot_id = await self._resolve_snapshot_id(preset_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        return _detail_to_routing_state(detail)

    async def get_cluster_nodes(self) -> list[ClusterNode]:
        try:
            from app.routes import cluster_health

            payload = await cluster_health.get_cluster_health()
            nodes: list[ClusterNode] = []
            for node_id, info in payload.get("nodes", {}).items():
                metadata = dict(info.get("metadata") or {})
                label = str(metadata.get("hostname") or node_id)
                status = "online" if bool(info.get("is_online", False)) else "offline"
                nodes.append(
                    ClusterNode(
                        id=str(node_id),
                        label=label,
                        status=status,
                        response_time_ms=info.get("response_time_ms"),
                        metadata=metadata,
                    )
                )
            return nodes
        except Exception:
            return []

    async def publish_event(self, event: Map2Event) -> None:
        await self._event_queue.put(event)

    async def subscribe_events(self) -> AsyncIterator[Map2Event]:
        while True:
            yield await self._event_queue.get()

    async def get_health(self) -> dict[str, Any]:
        return {
            "bridge": "direct",
            "selected_snapshot_id": self._selected_snapshot_id,
            "cached_snapshots": sorted(self._detail_cache.keys()),
        }

    async def list_drum_instances(self) -> list[dict[str, Any]]:
        from app.services.push_surface.drum_registry import get_drum_instance_registry

        return [item.to_dict() for item in await get_drum_instance_registry().list_instances()]

    async def get_drum_surface_state(self, device_fingerprint: str) -> dict[str, Any]:
        from app.services.push_surface.drum_runtime import get_push_drum_session_service

        return await get_push_drum_session_service().get_surface_state(device_fingerprint)

    async def dispatch_drum_command(self, device_fingerprint: str, command: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        from app.services.push_surface.drum_runtime import get_push_drum_session_service

        return await get_push_drum_session_service().dispatch_command(device_fingerprint, command, payload)


class RestWebSocketMap2SurfaceBridge:
    """REST/WebSocket bridge for an external or loopback MAP2 backend."""

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:8080",
        websocket_url: str = "ws://127.0.0.1:8080/ws/events",
        timeout_s: float = 5.0,
        subscribe_topics: tuple[str, ...] = (
            "snapshots",
            "snapshot_runtime_live_state",
            "snapshot_activation_events",
            "chain_updates",
            "plugin_params",
            "avb:router:endpoints",
            "avb:router:connections",
            "avb:router:connection_state",
        ),
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.websocket_url = websocket_url
        self.timeout_s = timeout_s
        self.subscribe_topics = subscribe_topics
        self._selected_snapshot_id: int | None = None
        self._detail_cache: dict[int, dict[str, Any]] = {}

    async def _request(self, method: str, path: str, *, json_payload: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_s) as client:
            response = await client.request(method, path, json=json_payload)
            response.raise_for_status()
            return response.json()

    async def _resolve_snapshot_id(self, preset_id: str | None = None) -> int:
        if preset_id is not None:
            return int(preset_id)
        if self._selected_snapshot_id is not None:
            return self._selected_snapshot_id
        try:
            committed = await self._request("GET", "/api/audio/state/committed")
            source_snapshot = committed.get("value", {}).get("source_snapshot", {})
            committed_snapshot_id = source_snapshot.get("snapshot_id")
            if committed_snapshot_id is not None:
                self._selected_snapshot_id = int(committed_snapshot_id)
                return self._selected_snapshot_id
        except Exception:
            pass
        payload = await self._request("GET", "/api/snapshots")
        snapshots = payload.get("snapshots", [])
        if not snapshots:
            raise RuntimeError("no snapshots available")
        self._selected_snapshot_id = int(snapshots[0]["id"])
        return self._selected_snapshot_id

    async def _get_snapshot_detail(self, snapshot_id: int) -> dict[str, Any]:
        if snapshot_id in self._detail_cache:
            return copy.deepcopy(self._detail_cache[snapshot_id])
        detail = await self._request("GET", f"/api/snapshots/{snapshot_id}")
        self._detail_cache[snapshot_id] = copy.deepcopy(detail)
        return detail

    async def list_presets(self) -> list[PresetSummary]:
        payload = await self._request("GET", "/api/snapshots")
        presets = payload.get("snapshots", [])
        control_plane_snapshot_id: int | None = None
        try:
            committed = await self._request("GET", "/api/audio/state/committed")
            source_snapshot = committed.get("value", {}).get("source_snapshot", {})
            snapshot_id = source_snapshot.get("snapshot_id")
            control_plane_snapshot_id = int(snapshot_id) if snapshot_id is not None else None
        except Exception:
            control_plane_snapshot_id = None
        return [
            PresetSummary(
                id=str(item["id"]),
                name=str(item.get("name") or f"Snapshot {item['id']}"),
                program_number=item.get("program_number"),
                is_active=control_plane_snapshot_id is not None and int(item["id"]) == control_plane_snapshot_id,
                is_favorite=bool(item.get("is_favorite", False)),
            )
            for item in presets
        ]

    async def list_chains(self, preset_id: str | None = None) -> list[ChainSummary]:
        snapshot_id = await self._resolve_snapshot_id(preset_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        return _detail_to_chains(snapshot_id, detail)

    async def get_chain_nodes(self, chain_id: str) -> list[NodeSummary]:
        snapshot_id, parsed_chain_id = parse_chain_id(chain_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        for chain in _detail_to_chains(snapshot_id, detail):
            if chain.id == make_chain_id(snapshot_id, parsed_chain_id):
                return list(chain.nodes)
        return []

    async def get_node_parameters(self, node_id: str) -> list[ParameterModel]:
        snapshot_id, chain_id, position = parse_node_id(node_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        plugin, _chain = _find_plugin(detail, chain_id, position)
        if plugin is None:
            return []
        return list(_parameters_from_plugin(plugin))

    async def _update_snapshot_detail(self, snapshot_id: int, detail: dict[str, Any]) -> dict[str, Any]:
        updated = await self._request(
            "PATCH",
            f"/api/snapshots/{snapshot_id}",
            json_payload={"snapshot_data": detail},
        )
        snapshot = updated.get("snapshot")
        if not isinstance(snapshot, dict):
            raise RuntimeError(f"snapshot update failed: {snapshot_id}")
        self._detail_cache[snapshot_id] = copy.deepcopy(snapshot)
        return snapshot

    async def set_parameter(self, node_id: str, parameter_id: str, value: Any) -> None:
        snapshot_id, chain_id, position = parse_node_id(node_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        mutable = copy.deepcopy(detail)
        plugin, _chain = _find_plugin(mutable, chain_id, position)
        if plugin is None:
            raise RuntimeError(f"node not found: {node_id}")
        parameters = dict(plugin.get("parameters") or {})
        parameters[str(parameter_id)] = value
        plugin["parameters"] = parameters
        await self._update_snapshot_detail(snapshot_id, mutable)

    async def toggle_bypass(self, node_id: str) -> None:
        snapshot_id, chain_id, position = parse_node_id(node_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        mutable = copy.deepcopy(detail)
        plugin, _chain = _find_plugin(mutable, chain_id, position)
        if plugin is None:
            raise RuntimeError(f"node not found: {node_id}")
        plugin["bypass"] = not bool(plugin.get("bypass", False))
        await self._update_snapshot_detail(snapshot_id, mutable)

    async def load_preset(self, preset_id: str) -> None:
        snapshot_id = int(preset_id)
        await self._request("POST", f"/api/snapshots/{snapshot_id}/activate")
        self._selected_snapshot_id = snapshot_id
        self._detail_cache.pop(snapshot_id, None)

    async def update_routing(self, source_id: str, destination_id: str) -> None:
        if source_id.startswith("avb:t:") and destination_id.startswith("avb:l:"):
            await self._request(
                "POST",
                "/api/avb/router/connect",
                json_payload={
                    "talker_id": source_id.removeprefix("avb:t:"),
                    "listener_id": destination_id.removeprefix("avb:l:"),
                },
            )
            return
        snapshot_id = await self._resolve_snapshot_id(None)
        path_id = source_id.removeprefix("snapshot:path:")
        await self._request(
            "PATCH",
            f"/api/snapshots/{snapshot_id}/routing",
            json_payload={"active_channel_key": path_id},
        )
        self._detail_cache.pop(snapshot_id, None)

    async def get_routing_state(self, preset_id: str | None = None) -> RoutingState:
        try:
            endpoints = await self._request("GET", "/api/avb/router/endpoints")
            connections = await self._request("GET", "/api/avb/router/connections")
            talkers = [item for item in endpoints.get("endpoints", []) if item.get("direction") == "talker"]
            listeners = [item for item in endpoints.get("endpoints", []) if item.get("direction") == "listener"]
            if talkers and listeners:
                active_pairs = {
                    (
                        f"avb:t:{item['talker']['endpoint_id']}",
                        f"avb:l:{item['listener']['endpoint_id']}",
                    )
                    for item in connections.get("connections", [])
                    if isinstance(item, dict) and item.get("talker") and item.get("listener")
                }
                source_ids = [f"avb:t:{item['endpoint_id']}" for item in talkers[:8]]
                dest_ids = [f"avb:l:{item['endpoint_id']}" for item in listeners[:8]]
                slots = [
                    RoutingSlot(
                        source_id=source_id,
                        destination_id=destination_id,
                        active=(source_id, destination_id) in active_pairs,
                    )
                    for source_id in source_ids
                    for destination_id in dest_ids
                ]
                return RoutingState(
                    mode="avb_router",
                    sources=tuple(source_ids),
                    destinations=tuple(dest_ids),
                    slots=tuple(slots),
                )
        except Exception:
            pass
        snapshot_id = await self._resolve_snapshot_id(preset_id)
        detail = await self._get_snapshot_detail(snapshot_id)
        return _detail_to_routing_state(detail)

    async def get_cluster_nodes(self) -> list[ClusterNode]:
        payload = await self._request("GET", "/api/cluster/health")
        nodes: list[ClusterNode] = []
        for node_id, info in payload.get("nodes", {}).items():
            metadata = dict(info.get("metadata") or {})
            label = str(metadata.get("hostname") or node_id)
            status = "online" if bool(info.get("is_online", False)) else "offline"
            nodes.append(
                ClusterNode(
                    id=str(node_id),
                    label=label,
                    status=status,
                    response_time_ms=info.get("response_time_ms"),
                    metadata=metadata,
                )
            )
        return nodes

    async def subscribe_events(self) -> AsyncIterator[Map2Event]:
        backoff = 1.0
        while True:
            try:
                async with websockets.connect(self.websocket_url, ping_interval=30) as websocket:
                    for topic in self.subscribe_topics:
                        await websocket.send(json.dumps({"action": "subscribe", "topic": topic}))
                    backoff = 1.0
                    async for raw_message in websocket:
                        payload = json.loads(raw_message)
                        event = self._map_ws_message(payload)
                        if event is not None:
                            yield event
            except asyncio.CancelledError:
                raise
            except Exception:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 10.0)

    def _map_ws_message(self, payload: dict[str, Any]) -> Map2Event | None:
        event_type = str(payload.get("type") or "")
        timestamp = time.time()
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        if event_type in {"snapshot_loaded", "flow_snapshot_loaded"}:
            return Map2Event(Map2EventType.PRESET_LOADED, timestamp, {"preset_id": data.get("snapshot_id")})
        if event_type in {"param_changed", "plugin_parameter_changed"}:
            return Map2Event(Map2EventType.PARAMETER_CHANGED, timestamp, data)
        if event_type in {"plugin_bypassed", "bypass_changed"}:
            return Map2Event(Map2EventType.BYPASS_CHANGED, timestamp, data)
        if event_type in {"chain_activated", "chain_deactivated"}:
            return Map2Event(Map2EventType.CHAIN_SELECTED, timestamp, data)
        if event_type in {"snapshot_runtime_live_state", "snapshot_activation_event"}:
            return Map2Event(Map2EventType.SNAPSHOT_RUNTIME_CHANGED, timestamp, data)
        if event_type in {"avb_connections_updated", "avb_connection_state_changed", "avb_endpoints_updated"}:
            return Map2Event(Map2EventType.ROUTE_CHANGED, timestamp, data)
        return None

    async def get_health(self) -> dict[str, Any]:
        return {
            "bridge": "rest_ws",
            "base_url": self.base_url,
            "websocket_url": self.websocket_url,
            "selected_snapshot_id": self._selected_snapshot_id,
        }

    async def list_drum_instances(self) -> list[dict[str, Any]]:
        payload = await self._request("GET", "/api/push-surface/drum-instances")
        return list(payload.get("instances", []))

    async def get_drum_surface_state(self, device_fingerprint: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/push-surface/drum-session/state?device_fingerprint={device_fingerprint}")

    async def dispatch_drum_command(self, device_fingerprint: str, command: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/push-surface/drum-session/command",
            json_payload={
                "device_fingerprint": device_fingerprint,
                "command": command,
                "payload": payload or {},
            },
        )


class MockMap2SurfaceBridge:
    """In-memory bridge for tests and simulator-only workflows."""

    def __init__(
        self,
        *,
        presets: list[PresetSummary] | None = None,
        chains_by_preset: dict[str, list[ChainSummary]] | None = None,
        routing: RoutingState | None = None,
        cluster_nodes: list[ClusterNode] | None = None,
    ) -> None:
        self.presets = presets or [PresetSummary(id="1", name="Default Snapshot", is_active=True)]
        default_chain = ChainSummary(
            id="snapshot:1:chain:1",
            name="Main Chain",
            is_active=True,
            nodes=(
                NodeSummary(
                    id="snapshot:1:chain:1:position:0",
                    chain_id="snapshot:1:chain:1",
                    name="Amp",
                    node_type="urn:test:amp",
                    category="amp",
                    parameters=(
                        ParameterModel(id="drive", name="Drive", value=0.5, max_value=1.0),
                        ParameterModel(id="level", name="Level", value=0.75, max_value=1.0),
                    ),
                    color_hint=SurfaceColor.ORANGE,
                ),
            ),
        )
        self.chains_by_preset = chains_by_preset or {"1": [default_chain]}
        self.routing = routing or RoutingState(
            mode="parallel_blend",
            sources=("snapshot:path:A",),
            destinations=("snapshot:path:A",),
            slots=(RoutingSlot(source_id="snapshot:path:A", destination_id="snapshot:path:A", active=True),),
        )
        self.cluster_nodes = cluster_nodes or [ClusterNode(id="local", label="local", status="online")]
        self._selected_preset_id = self.presets[0].id
        self._event_queue: asyncio.Queue[Map2Event] = asyncio.Queue()

    async def list_presets(self) -> list[PresetSummary]:
        return list(self.presets)

    async def list_chains(self, preset_id: str | None = None) -> list[ChainSummary]:
        selected = preset_id or self._selected_preset_id
        return list(self.chains_by_preset.get(str(selected), []))

    async def get_chain_nodes(self, chain_id: str) -> list[NodeSummary]:
        for chains in self.chains_by_preset.values():
            for chain in chains:
                if chain.id == chain_id:
                    return list(chain.nodes)
        return []

    async def get_node_parameters(self, node_id: str) -> list[ParameterModel]:
        for chains in self.chains_by_preset.values():
            for chain in chains:
                for node in chain.nodes:
                    if node.id == node_id:
                        return list(node.parameters)
        return []

    async def set_parameter(self, node_id: str, parameter_id: str, value: Any) -> None:
        for preset_id, chains in list(self.chains_by_preset.items()):
            updated_chains: list[ChainSummary] = []
            for chain in chains:
                updated_nodes: list[NodeSummary] = []
                for node in chain.nodes:
                    if node.id != node_id:
                        updated_nodes.append(node)
                        continue
                    updated_params = [
                        replace_param if replace_param.id != parameter_id else ParameterModel(
                            id=replace_param.id,
                            name=replace_param.name,
                            kind=replace_param.kind,
                            value=value,
                            default_value=replace_param.default_value,
                            min_value=replace_param.min_value,
                            max_value=replace_param.max_value,
                            display_value=replace_param.display_value,
                            step_values=replace_param.step_values,
                            metadata=dict(replace_param.metadata),
                        )
                        for replace_param in node.parameters
                    ]
                    updated_nodes.append(
                        NodeSummary(
                            id=node.id,
                            chain_id=node.chain_id,
                            name=node.name,
                            node_type=node.node_type,
                            category=node.category,
                            bypassed=node.bypassed,
                            selected=node.selected,
                            color_hint=node.color_hint,
                            parameters=tuple(updated_params),
                            metadata=dict(node.metadata),
                        )
                    )
                updated_chains.append(
                    ChainSummary(
                        id=chain.id,
                        name=chain.name,
                        nodes=tuple(updated_nodes),
                        is_active=chain.is_active,
                        health=chain.health,
                        warning=chain.warning,
                        selected=chain.selected,
                    )
                )
            self.chains_by_preset[preset_id] = updated_chains
        await self._event_queue.put(Map2Event(Map2EventType.PARAMETER_CHANGED, time.time(), {"node_id": node_id, "parameter_id": parameter_id, "value": value}))

    async def toggle_bypass(self, node_id: str) -> None:
        for preset_id, chains in list(self.chains_by_preset.items()):
            updated_chains: list[ChainSummary] = []
            for chain in chains:
                updated_nodes = []
                for node in chain.nodes:
                    if node.id == node_id:
                        updated_nodes.append(
                            NodeSummary(
                                id=node.id,
                                chain_id=node.chain_id,
                                name=node.name,
                                node_type=node.node_type,
                                category=node.category,
                                bypassed=not node.bypassed,
                                selected=node.selected,
                                color_hint=node.color_hint,
                                parameters=node.parameters,
                                metadata=dict(node.metadata),
                            )
                        )
                    else:
                        updated_nodes.append(node)
                updated_chains.append(
                    ChainSummary(
                        id=chain.id,
                        name=chain.name,
                        nodes=tuple(updated_nodes),
                        is_active=chain.is_active,
                        health=chain.health,
                        warning=chain.warning,
                        selected=chain.selected,
                    )
                )
            self.chains_by_preset[preset_id] = updated_chains
        await self._event_queue.put(Map2Event(Map2EventType.BYPASS_CHANGED, time.time(), {"node_id": node_id}))

    async def load_preset(self, preset_id: str) -> None:
        self._selected_preset_id = str(preset_id)
        await self._event_queue.put(Map2Event(Map2EventType.PRESET_LOADED, time.time(), {"preset_id": preset_id}))

    async def update_routing(self, source_id: str, destination_id: str) -> None:
        self.routing = RoutingState(
            mode=self.routing.mode,
            sources=self.routing.sources,
            destinations=self.routing.destinations,
            slots=tuple(
                RoutingSlot(
                    source_id=slot.source_id,
                    destination_id=slot.destination_id,
                    active=(slot.source_id == source_id and slot.destination_id == destination_id),
                )
                for slot in self.routing.slots
            ),
        )
        await self._event_queue.put(Map2Event(Map2EventType.ROUTE_CHANGED, time.time(), {"source_id": source_id, "destination_id": destination_id}))

    async def get_routing_state(self, preset_id: str | None = None) -> RoutingState:
        return self.routing

    async def get_cluster_nodes(self) -> list[ClusterNode]:
        return list(self.cluster_nodes)

    async def subscribe_events(self) -> AsyncIterator[Map2Event]:
        while True:
            yield await self._event_queue.get()

    async def get_health(self) -> dict[str, Any]:
        return {"bridge": "mock", "selected_preset_id": self._selected_preset_id}

    async def list_drum_instances(self) -> list[dict[str, Any]]:
        return []

    async def get_drum_surface_state(self, device_fingerprint: str) -> dict[str, Any]:
        return {
            "session": {
                "device_fingerprint": device_fingerprint,
                "selected_instance_id": None,
                "bank_index": 0,
                "last_command": None,
                "pending_confirmation": None,
            },
            "available_instances": [],
            "selected_projection": None,
        }

    async def dispatch_drum_command(self, device_fingerprint: str, command: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "status": "ok",
            "session": {
                "device_fingerprint": device_fingerprint,
                "selected_instance_id": payload.get("instance_id") if payload else None,
                "bank_index": 0,
                "last_command": command,
                "pending_confirmation": None,
            },
            "available_instances": [],
            "selected_projection": None,
        }
