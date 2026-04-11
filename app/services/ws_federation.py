"""WebSocket federation across cluster nodes."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, Set, Tuple

import websockets

from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery, MDNSNode
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
        self.connections: Dict[Tuple[str, str], FederatedConnection] = {}
        self.lock = asyncio.Lock()

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
