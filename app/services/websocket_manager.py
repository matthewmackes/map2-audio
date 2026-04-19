"""
WebSocket Manager - Real-time communication for MAP2 Audio
Handles WebSocket connections, message broadcasting, and subscription management.
"""

import asyncio
import gzip
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

COMPRESSION_THRESHOLD = 1024
DEFAULT_SEND_TIMEOUT_SECONDS = 0.25


class WebSocketManager:
    """
    Manages WebSocket connections and broadcasts real-time updates.

    Features:
    - Connection pooling
    - Topic-based subscriptions
    - Selective broadcasting
    - Connection lifecycle management
    - Optional binary gzip compression for large JSON payloads
    """

    def __init__(
        self,
        enable_compression: bool = True,
        send_timeout_seconds: float = DEFAULT_SEND_TIMEOUT_SECONDS,
        topic_history_limits: Optional[Dict[str, int]] = None,
    ):
        self.active_connections: Dict[str, WebSocket] = {}
        self.subscriptions: Dict[str, Set[str]] = {}
        self.connection_info: Dict[str, Dict[str, Any]] = {}
        self.event_history: Dict[str, Deque[Dict[str, Any]]] = {}
        self.history_limit = 10
        self.topic_history_limits = {
            str(topic): max(1, int(limit))
            for topic, limit in (topic_history_limits or {}).items()
        }

        # Keep all lifecycle mutations on one async lock.
        self._lock = asyncio.Lock()

        self.enable_compression = enable_compression
        self.bytes_saved = 0
        self.send_timeout_seconds = send_timeout_seconds
        self.slow_client_disconnects = 0
        self.send_failures = 0

    async def _send_payload(self, websocket: WebSocket, payload: str | bytes) -> None:
        if isinstance(payload, bytes):
            await websocket.send_bytes(payload)
            return
        await websocket.send_text(payload)

    def _record_observability_event(
        self,
        client_id: str,
        *,
        action: str,
        path: str = "/ws",
        status: int = 200,
        topic: Optional[str] = None,
        error: Optional[str] = None,
        extra_meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        try:
            from app.services.api_observatory import get_api_observatory_service

            info = self.connection_info.get(client_id, {})
            subscriptions = info.get("subscriptions", set())
            if not isinstance(subscriptions, set):
                subscriptions = set(subscriptions or [])
            connected_at = info.get("connected_at")
            duration_ms = 0.0
            if isinstance(connected_at, str):
                try:
                    started = datetime.fromisoformat(connected_at)
                    duration_ms = max(
                        0.0,
                        (datetime.now(timezone.utc) - started).total_seconds() * 1000.0,
                    )
                except ValueError:
                    duration_ms = 0.0

            meta = {
                "action": action,
                "client_id": client_id,
                "topic": topic,
                "client_label": info.get("client_label"),
                "protocol_version": info.get("protocol_version"),
                "subscriptions": sorted(subscriptions),
                "active_connections": len(self.active_connections),
                "topics": len(self.subscriptions),
                "send_failures": self.send_failures,
                "slow_client_disconnects": self.slow_client_disconnects,
            }
            if error:
                meta["error"] = error
            if extra_meta:
                meta.update(extra_meta)

            get_api_observatory_service().record_traffic_event(
                {
                    "event_type": "websocket",
                    "method": "WS",
                    "path": path,
                    "status": status,
                    "duration_ms": duration_ms,
                    "request_size": 0,
                    "response_size": 0,
                    "client_ip": str(info.get("client_ip", "unknown")),
                    "request_id": str(info.get("request_id", client_id)),
                    "run_id": str(info.get("run_id", "")),
                    "meta": meta,
                }
            )
        except Exception:
            pass

    async def connect(
        self,
        websocket: WebSocket,
        client_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        metadata = metadata or {}

        async with self._lock:
            self.active_connections[client_id] = websocket
            self.connection_info[client_id] = {
                "connected_at": datetime.now(timezone.utc).isoformat(),
                "subscriptions": set(),
                "run_id": metadata.get("run_id", ""),
                "path": metadata.get("path", "/ws"),
                "client_label": metadata.get("client_label"),
                "request_id": metadata.get("request_id", client_id),
                "protocol_version": metadata.get("protocol_version"),
                "client_ip": metadata.get("client_ip", "unknown"),
            }

        logger.info("WebSocket client connected: %s", client_id)
        self._record_observability_event(
            client_id,
            action="connect",
            path=str(metadata.get("path", "/ws")),
            status=101,
        )

    async def disconnect(
        self,
        client_id: str,
        *,
        reason: str = "disconnect",
        error: Optional[str] = None,
    ) -> None:
        """Remove a client connection and clean up subscriptions."""
        async with self._lock:
            info = dict(self.connection_info.get(client_id, {}))

            self.active_connections.pop(client_id, None)
            for topic in list(self.subscriptions.keys()):
                self.subscriptions[topic].discard(client_id)
                if not self.subscriptions[topic]:
                    del self.subscriptions[topic]
            self.connection_info.pop(client_id, None)

        self._record_observability_event(
            client_id,
            action=reason,
            path=str(info.get("path", "/ws")),
            status=1000 if reason == "disconnect" else 1001,
            error=error,
        )
        logger.info("WebSocket client disconnected: %s", client_id)

    async def subscribe(self, client_id: str, topic: str) -> None:
        """Subscribe a client to a specific topic."""
        async with self._lock:
            self.subscriptions.setdefault(topic, set()).add(client_id)
            if client_id in self.connection_info:
                self.connection_info[client_id]["subscriptions"].add(topic)

        logger.debug("Client %s subscribed to topic: %s", client_id, topic)
        path = str(self.connection_info.get(client_id, {}).get("path", "/ws"))
        self._record_observability_event(
            client_id,
            action="subscribe",
            path=path,
            status=200,
            topic=topic,
        )

    async def unsubscribe(self, client_id: str, topic: str) -> None:
        """Unsubscribe a client from a topic."""
        async with self._lock:
            if topic in self.subscriptions:
                self.subscriptions[topic].discard(client_id)
                if not self.subscriptions[topic]:
                    del self.subscriptions[topic]
            if client_id in self.connection_info:
                self.connection_info[client_id]["subscriptions"].discard(topic)

        logger.debug("Client %s unsubscribed from topic: %s", client_id, topic)
        path = str(self.connection_info.get(client_id, {}).get("path", "/ws"))
        self._record_observability_event(
            client_id,
            action="unsubscribe",
            path=path,
            status=200,
            topic=topic,
        )

    async def send_personal_message(self, message: str | bytes, client_id: str) -> None:
        """Send a message to a specific client."""
        async with self._lock:
            websocket = self.active_connections.get(client_id)
        if websocket is None:
            return

        try:
            await asyncio.wait_for(
                self._send_payload(websocket, message),
                timeout=self.send_timeout_seconds,
            )
        except Exception as exc:
            logger.error("Error sending message to %s: %s", client_id, exc)
            self.send_failures += 1
            if isinstance(exc, asyncio.TimeoutError):
                self.slow_client_disconnects += 1
            await self.disconnect(client_id, reason="disconnect_error", error=str(exc))

    async def broadcast(self, message: str | bytes, topic: Optional[str] = None) -> None:
        """Broadcast a message to all clients or topic subscribers."""
        async with self._lock:
            if topic:
                target_clients = set(self.subscriptions.get(topic, set()))
            else:
                target_clients = set(self.active_connections.keys())

            send_client_ids: List[str] = []
            send_tasks: List[asyncio.Future] = []
            for client_id in target_clients:
                websocket = self.active_connections.get(client_id)
                if websocket is None:
                    continue
                send_client_ids.append(client_id)
                send_tasks.append(
                    asyncio.wait_for(
                        self._send_payload(websocket, message),
                        timeout=self.send_timeout_seconds,
                    )
                )

        if not send_tasks:
            return

        send_results = await asyncio.gather(*send_tasks, return_exceptions=True)
        disconnected_clients: list[str] = []
        for client_id, result in zip(send_client_ids, send_results):
            if not isinstance(result, Exception):
                continue

            self.send_failures += 1
            if isinstance(result, asyncio.TimeoutError):
                self.slow_client_disconnects += 1
                logger.warning(
                    "Disconnecting slow WebSocket client %s after %.3fs send timeout",
                    client_id,
                    self.send_timeout_seconds,
                )
                self._record_observability_event(
                    client_id,
                    action="broadcast_timeout_error",
                    path=str(self.connection_info.get(client_id, {}).get("path", "/ws")),
                    status=504,
                    topic=topic,
                    error="send_timeout",
                )
            else:
                logger.error("Error broadcasting to %s: %s", client_id, result)
                self._record_observability_event(
                    client_id,
                    action="broadcast_error",
                    path=str(self.connection_info.get(client_id, {}).get("path", "/ws")),
                    status=500,
                    topic=topic,
                    error=str(result),
                )
            disconnected_clients.append(client_id)

        for client_id in disconnected_clients:
            await self.disconnect(client_id, reason="disconnect_error")

    async def broadcast_json(self, data: Dict[str, Any], topic: Optional[str] = None) -> None:
        """Broadcast a JSON message with optional binary gzip compression."""
        if topic:
            async with self._lock:
                history = self.event_history.get(topic)
                limit = self.topic_history_limits.get(topic, self.history_limit)
                if history is None:
                    history = deque(maxlen=limit)
                    self.event_history[topic] = history
                elif history.maxlen != limit:
                    history = deque(history, maxlen=limit)
                    self.event_history[topic] = history
                history.append(data)

        encoded = json.dumps(data).encode("utf-8")
        payload: str | bytes = encoded.decode("utf-8")
        if self.enable_compression and len(encoded) > COMPRESSION_THRESHOLD:
            compressed = gzip.compress(encoded)
            if len(compressed) < len(encoded):
                self.bytes_saved += len(encoded) - len(compressed)
                payload = compressed

        await self.broadcast(payload, topic)

    def get_subscribers(self, topic: str) -> List[str]:
        return list(self.subscriptions.get(topic, set()))

    def get_connection_count(self) -> int:
        return len(self.active_connections)

    def get_event_history(self, topic: Optional[str] = None) -> Dict[str, Any]:
        if topic:
            return {
                "topic": topic,
                "events": list(self.event_history.get(topic, [])),
            }
        return {
            "all_topics": {
                topic_name: list(events)
                for topic_name, events in self.event_history.items()
            }
        }

    def get_stats(self) -> Dict[str, Any]:
        return {
            "active_connections": len(self.active_connections),
            "topics": list(self.subscriptions.keys()),
            "subscriptions_per_topic": {
                topic: len(clients)
                for topic, clients in self.subscriptions.items()
            },
            "compression_enabled": self.enable_compression,
            "bytes_saved_by_compression": self.bytes_saved,
            "send_timeout_seconds": self.send_timeout_seconds,
            "slow_client_disconnects": self.slow_client_disconnects,
            "send_failures": self.send_failures,
        }


ws_manager = WebSocketManager()
