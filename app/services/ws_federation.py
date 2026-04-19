"""WebSocket federation across cluster nodes."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, Set, Tuple

import websockets

from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery, MDNSNode
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.bus import get_platform_event_bus
from app.services.websocket_manager import ws_manager
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


def _node_ws_url(node: MDNSNode) -> str:
    host = node.addresses[0] if node.addresses else "127.0.0.1"
    return f"ws://{host}:{node.port}/ws"


@dataclass
class FederatedConnection:
    node_id: str
    topic: str
    task: Optional[asyncio.Task] = None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class WebSocketFederator(Singleton):
    def __init__(self) -> None:
        self.discovery = get_enhanced_mdns_discovery()
        self.local_node_id = get_enhanced_node_identity().get_node_id()
        self.platform_event_bus = get_platform_event_bus()
        self.connections: Dict[Tuple[str, str], FederatedConnection] = {}
        self.lock = asyncio.Lock()
        self._mesh_interval_seconds = 5.0
        self._platform_mesh_task: Optional[asyncio.Task] = None

    async def subscribe_remote(self, node_id: str, topic: str) -> None:
        if node_id == self.local_node_id:
            return
        key = (node_id, topic)
        async with self.lock:
            if key in self.connections:
                return
            conn = FederatedConnection(node_id=node_id, topic=topic)
            conn.task = asyncio.create_task(self._run_connection(conn))
            self.connections[key] = conn

    async def subscribe_all(self, topic: str) -> None:
        nodes = self.discovery.get_discovered_nodes(online_only=True)
        for node in nodes:
            if node.node_id == self.local_node_id:
                continue
            await self.subscribe_remote(node.node_id, topic)

    async def unsubscribe_remote(self, node_id: str, topic: str) -> None:
        key = (node_id, topic)
        async with self.lock:
            conn = self.connections.pop(key, None)
        if conn:
            conn.stop_event.set()
            if conn.task:
                conn.task.cancel()

    async def start_platform_event_mesh(self, *, interval_seconds: float = 5.0) -> None:
        self._mesh_interval_seconds = max(1.0, float(interval_seconds))
        if self._platform_mesh_task is not None and not self._platform_mesh_task.done():
            return
        self._platform_mesh_task = asyncio.create_task(self._platform_event_mesh_loop())

    async def stop(self) -> None:
        if self._platform_mesh_task is not None:
            self._platform_mesh_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._platform_mesh_task
            self._platform_mesh_task = None

        async with self.lock:
            connections = list(self.connections.values())
            self.connections.clear()

        for conn in connections:
            conn.stop_event.set()
            if conn.task is not None:
                conn.task.cancel()

    async def _platform_event_mesh_loop(self) -> None:
        while True:
            await self.subscribe_all("platform:events")
            await asyncio.sleep(self._mesh_interval_seconds)

    async def _handle_platform_event_message(self, origin_node_id: str, message: str) -> None:
        try:
            payload = json.loads(message)
            if payload.get("type") != "platform_event":
                await ws_manager.broadcast(message, topic=f"node:{origin_node_id}/platform:events")
                return

            event = PlatformEvent.model_validate(payload.get("data") or {})
            context = dict(event.context or {})
            if context.get("federated_from"):
                return
            if event.source_node != origin_node_id:
                logger.debug(
                    "Ignoring relayed PlatformEvent %s from %s via %s",
                    event.event_id,
                    event.source_node,
                    origin_node_id,
                )
                return

            target_nodes = [str(node).strip() for node in event.target_nodes if str(node).strip()]
            if target_nodes and self.local_node_id not in target_nodes:
                return

            await self.platform_event_bus.ingest_remote(event, via_node=origin_node_id)
            await ws_manager.broadcast(message, topic=f"node:{origin_node_id}/platform:events")
        except Exception as exc:
            logger.warning(
                "Failed to ingest remote PlatformEvent from %s: %s",
                origin_node_id,
                exc,
            )

    async def _run_connection(self, conn: FederatedConnection) -> None:
        backoff = 1.0
        while not conn.stop_event.is_set():
            node = self.discovery.get_discovered_node(conn.node_id)
            if node is None:
                await asyncio.sleep(min(backoff, 10))
                backoff = min(backoff * 2, 10)
                continue
            try:
                url = _node_ws_url(node)
                async with websockets.connect(url, ping_interval=30) as ws:
                    await ws.send(json.dumps({"action": "subscribe", "topic": conn.topic}))
                    backoff = 1.0
                    async for message in ws:
                        if conn.topic == "platform:events":
                            await self._handle_platform_event_message(conn.node_id, message)
                        else:
                            await ws_manager.broadcast(
                                message,
                                topic=f"node:{conn.node_id}/{conn.topic}",
                            )
                        if conn.stop_event.is_set():
                            break
            except Exception as exc:
                logger.warning("Federation connection to %s topic %s failed: %s", conn.node_id, conn.topic, exc)
                await asyncio.sleep(min(backoff, 10))
                backoff = min(backoff * 2, 10)


def get_ws_federator() -> WebSocketFederator:
    return WebSocketFederator.get_instance()
