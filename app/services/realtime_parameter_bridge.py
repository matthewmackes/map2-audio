"""
Real-Time Parameter Bridge
Ultra-low latency parameter routing for MIDI, automation, and UI control.

This service provides a dedicated fast path for parameter updates with <10ms latency,
bypassing the normal REST API and event history mechanisms.
"""

import asyncio
from collections import defaultdict, deque
import logging
import time
import struct
import threading
from typing import Dict, Set, Optional, Callable, Any, List, Tuple
from dataclasses import dataclass, field
from enum import IntEnum
from fastapi import WebSocket
import json

logger = logging.getLogger(__name__)


class ParameterSource(IntEnum):
    """Source of parameter update for priority handling."""
    UI = 0           # User interface (knobs, sliders)
    MIDI = 1         # MIDI controller
    AUTOMATION = 2   # LFO, envelope follower
    PRESET = 3       # Preset load
    INTERNAL = 4     # Internal engine


class BinaryMessageType(IntEnum):
    """Binary message types for ultra-low latency protocol."""
    PARAM_UPDATE = 0x01      # Single parameter update
    PARAM_BATCH = 0x02       # Batch parameter updates
    PING = 0x03              # Keepalive ping
    PONG = 0x04              # Keepalive pong
    SUBSCRIBE = 0x05         # Subscribe to parameter
    UNSUBSCRIBE = 0x06       # Unsubscribe from parameter
    ACK = 0x07               # Acknowledgment


@dataclass
class ParameterUpdate:
    """Single parameter update."""
    plugin_uri: str
    param_index: int
    value: float
    instance_id: Optional[int] = None
    plugin_position: Optional[int] = None
    source: ParameterSource = ParameterSource.UI
    timestamp: float = field(default_factory=time.time)

    def to_binary(self) -> bytes:
        """
        Encode to binary format for minimal overhead.
        Format: [type:1][uri_len:2][uri:N][param_idx:2][value:4]
        """
        uri_bytes = self.plugin_uri.encode('utf-8')
        return struct.pack(
            f'>BH{len(uri_bytes)}sHf',
            BinaryMessageType.PARAM_UPDATE,
            len(uri_bytes),
            uri_bytes,
            self.param_index,
            self.value
        )

    @classmethod
    def from_binary(cls, data: bytes) -> 'ParameterUpdate':
        """Decode from binary format."""
        if len(data) < 9:
            raise ValueError("binary frame too short")
        msg_type = data[0]
        if msg_type != BinaryMessageType.PARAM_UPDATE:
            raise ValueError(f"Invalid message type: {msg_type}")

        uri_len = struct.unpack('>H', data[1:3])[0]
        expected_len = 3 + uri_len + 6
        if len(data) < expected_len:
            raise ValueError("binary frame truncated")
        uri = data[3:3+uri_len].decode('utf-8')
        param_idx, value = struct.unpack('>Hf', data[3+uri_len:3+uri_len+6])

        return cls(
            plugin_uri=uri,
            param_index=param_idx,
            value=value
        )

    def to_json(self) -> dict:
        """Convert to JSON-serializable dict."""
        payload = {
            'plugin_uri': self.plugin_uri,
            'param_index': self.param_index,
            'value': self.value,
            'source': self.source.name.lower(),
            'timestamp': self.timestamp
        }
        if isinstance(self.instance_id, int) and self.instance_id > 0:
            payload['instance_id'] = self.instance_id
        if isinstance(self.plugin_position, int) and self.plugin_position >= 0:
            payload['plugin_position'] = self.plugin_position
        return payload


@dataclass
class RTClient:
    """Real-time WebSocket client state."""
    client_id: str
    websocket: WebSocket
    connected_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    subscribed_params: Set[Tuple[Any, ...]] = field(default_factory=set)
    use_binary: bool = False
    pending_updates: List[ParameterUpdate] = field(default_factory=list)


class RealTimeParameterBridge:
    """
    Ultra-low latency parameter routing bridge.

    Features:
    - Direct WebSocket parameter updates (bidirectional)
    - Binary protocol option for minimal parsing overhead
    - Update coalescing for network efficiency
    - Priority-based update handling
    - Direct integration with audio engine
    - Broadcast to subscribed clients
    """

    def __init__(self):
        # Connected real-time clients
        self._clients: Dict[str, RTClient] = {}

        # Parameter value cache for instant reads
        self._param_cache: Dict[Tuple[Any, ...], float] = {}

        # Subscriptions: keyed by instance_id, plugin_position, or URI fallback
        self._subscriptions: Dict[Tuple[Any, ...], Set[str]] = defaultdict(set)
        self._state_lock = threading.RLock()

        # Callback to audio engine for parameter changes
        self._engine_callback: Optional[
            Callable[[str, int, float, Optional[int], Optional[int]], None]
        ] = None

        # Lock-free update queue for engine integration
        self._update_queue: asyncio.Queue[ParameterUpdate] = asyncio.Queue(maxsize=10000)

        # Coalescing settings
        self._coalesce_interval_ms: float = 2.0  # 2ms coalesce window
        self._max_batch_size: int = 100

        # Stats
        self._stats = {
            'updates_received': 0,
            'updates_broadcast': 0,
            'updates_to_engine': 0,
            'binary_messages': 0,
            'json_messages': 0,
            'coalesced_updates': 0,
            'avg_latency_us': 0.0,
        }

        # Processing task
        self._processor_task: Optional[asyncio.Task] = None
        self._running = False

        # Latency tracking
        self._latency_samples: deque[float] = deque()
        self._max_latency_samples = 1000
        self._send_timeout_seconds = 0.05

    @staticmethod
    def _normalize_positive_int(value: Any) -> Optional[int]:
        try:
            normalized = int(value)
        except (TypeError, ValueError):
            return None
        return normalized if normalized > 0 else None

    @staticmethod
    def _normalize_non_negative_int(value: Any) -> Optional[int]:
        try:
            normalized = int(value)
        except (TypeError, ValueError):
            return None
        return normalized if normalized >= 0 else None

    @classmethod
    def _parameter_key(
        cls,
        plugin_uri: str,
        param_index: int,
        instance_id: Any = None,
        plugin_position: Any = None,
    ) -> Tuple[Any, ...]:
        normalized_instance_id = cls._normalize_positive_int(instance_id)
        if normalized_instance_id is not None:
            return ("instance", normalized_instance_id, int(param_index))

        normalized_plugin_position = cls._normalize_non_negative_int(plugin_position)
        if normalized_plugin_position is not None:
            return ("position", plugin_uri, normalized_plugin_position, int(param_index))

        return ("uri", plugin_uri, int(param_index))

    def set_engine_callback(
        self,
        callback: Callable[[str, int, float, Optional[int], Optional[int]], None],
    ):
        """
        Set callback for routing parameters to audio engine.

        The callback should be non-blocking and thread-safe.
        Signature: callback(plugin_uri: str, param_index: int, value: float, instance_id: int | None, plugin_position: int | None)
        """
        self._engine_callback = callback
        logger.info("Audio engine callback registered")

    async def start(self):
        """Start the parameter bridge processing loop."""
        if self._running:
            return

        self._running = True
        self._processor_task = asyncio.create_task(self._process_loop())
        logger.info("RealTimeParameterBridge started")

    async def stop(self):
        """Stop the parameter bridge."""
        self._running = False
        if self._processor_task:
            self._processor_task.cancel()
            try:
                await self._processor_task
            except asyncio.CancelledError:
                pass
        logger.info("RealTimeParameterBridge stopped")

    async def connect_client(self, websocket: WebSocket, client_id: str, use_binary: bool = False):
        """
        Register a new real-time client.

        Args:
            websocket: WebSocket connection
            client_id: Unique client identifier
            use_binary: Use binary protocol for minimal latency
        """
        await websocket.accept()

        client = RTClient(
            client_id=client_id,
            websocket=websocket,
            use_binary=use_binary
        )
        with self._state_lock:
            self._clients[client_id] = client

        # Send welcome with protocol info
        welcome = {
            'type': 'rt_welcome',
            'client_id': client_id,
            'protocol': 'binary' if use_binary else 'json',
            'coalesce_ms': self._coalesce_interval_ms,
            'features': ['param_update', 'subscribe', 'batch']
        }
        await websocket.send_text(json.dumps(welcome))

        logger.info(f"RT client connected: {client_id} (binary={use_binary})")

    def disconnect_client(self, client_id: str):
        """Remove a client and clean up subscriptions."""
        with self._state_lock:
            if client_id not in self._clients:
                return

            for param_key in list(self._subscriptions.keys()):
                self._subscriptions[param_key].discard(client_id)
                if not self._subscriptions[param_key]:
                    del self._subscriptions[param_key]

            del self._clients[client_id]
        logger.info(f"RT client disconnected: {client_id}")

    async def handle_message(self, client_id: str, data: bytes | str):
        """
        Handle incoming message from client.

        Supports both binary and JSON protocols.
        """
        with self._state_lock:
            client = self._clients.get(client_id)
        if client is None:
            return
        client.last_activity = time.time()

        try:
            if isinstance(data, bytes):
                await self._handle_binary_message(client, data)
            else:
                await self._handle_json_message(client, data)
        except Exception as e:
            logger.error(f"Error handling RT message from {client_id}: {e}")

    async def _handle_binary_message(self, client: RTClient, data: bytes):
        """Handle binary protocol message."""
        self._stats['binary_messages'] += 1

        if len(data) < 1:
            return

        msg_type = data[0]

        if msg_type == BinaryMessageType.PARAM_UPDATE:
            update = ParameterUpdate.from_binary(data)
            await self._process_update(update, client.client_id)

        elif msg_type == BinaryMessageType.PARAM_BATCH:
            # Batch format: [type:1][count:2][updates...]
            if len(data) < 3:
                raise ValueError("batch frame too short")
            count = struct.unpack('>H', data[1:3])[0]
            offset = 3
            for _ in range(count):
                if len(data) < offset + 2:
                    raise ValueError("batch frame truncated before uri length")
                uri_len = struct.unpack('>H', data[offset:offset+2])[0]
                update_end = offset + 2 + uri_len + 6
                if len(data) < update_end:
                    raise ValueError("batch frame truncated in update payload")
                update_data = bytes([BinaryMessageType.PARAM_UPDATE]) + data[offset:update_end]
                update = ParameterUpdate.from_binary(update_data)
                await self._process_update(update, client.client_id)
                offset = update_end

        elif msg_type == BinaryMessageType.PING:
            # Fast pong response
            await client.websocket.send_bytes(bytes([BinaryMessageType.PONG]))

        elif msg_type == BinaryMessageType.SUBSCRIBE:
            # Subscribe format: [type:1][uri_len:2][uri:N][param_idx:2]
            if len(data) < 5:
                raise ValueError("subscribe frame too short")
            uri_len = struct.unpack('>H', data[1:3])[0]
            if len(data) < 5 + uri_len:
                raise ValueError("subscribe frame truncated")
            uri = data[3:3+uri_len].decode('utf-8')
            param_idx = struct.unpack('>H', data[3+uri_len:5+uri_len])[0]
            await self._subscribe_param(client.client_id, uri, param_idx)

        elif msg_type == BinaryMessageType.UNSUBSCRIBE:
            if len(data) < 5:
                raise ValueError("unsubscribe frame too short")
            uri_len = struct.unpack('>H', data[1:3])[0]
            if len(data) < 5 + uri_len:
                raise ValueError("unsubscribe frame truncated")
            uri = data[3:3+uri_len].decode('utf-8')
            param_idx = struct.unpack('>H', data[3+uri_len:5+uri_len])[0]
            await self._unsubscribe_param(client.client_id, uri, param_idx)

    async def _handle_json_message(self, client: RTClient, data: str):
        """Handle JSON protocol message."""
        self._stats['json_messages'] += 1

        try:
            msg = json.loads(data)
        except json.JSONDecodeError:
            return

        action = msg.get('action')

        if action == 'param_update':
            update = ParameterUpdate(
                plugin_uri=msg['plugin_uri'],
                param_index=msg['param_index'],
                value=msg['value'],
                instance_id=self._normalize_positive_int(msg.get('instance_id')),
                plugin_position=self._normalize_non_negative_int(msg.get('plugin_position')),
                source=ParameterSource.UI
            )
            await self._process_update(update, client.client_id)

        elif action == 'param_batch':
            updates = msg.get('updates', [])
            for u in updates:
                update = ParameterUpdate(
                    plugin_uri=u['plugin_uri'],
                    param_index=u['param_index'],
                    value=u['value'],
                    instance_id=self._normalize_positive_int(u.get('instance_id')),
                    plugin_position=self._normalize_non_negative_int(u.get('plugin_position')),
                    source=ParameterSource.UI
                )
                await self._process_update(update, client.client_id)

        elif action == 'subscribe':
            await self._subscribe_param(
                client.client_id,
                msg['plugin_uri'],
                msg['param_index'],
                instance_id=msg.get('instance_id'),
                plugin_position=msg.get('plugin_position'),
            )

        elif action == 'unsubscribe':
            await self._unsubscribe_param(
                client.client_id,
                msg['plugin_uri'],
                msg['param_index'],
                instance_id=msg.get('instance_id'),
                plugin_position=msg.get('plugin_position'),
            )

        elif action == 'subscribe_all':
            # Subscribe to all params for a plugin
            plugin_uri = msg['plugin_uri']
            param_count = msg.get('param_count', 0)
            for idx in range(param_count):
                await self._subscribe_param(
                    client.client_id,
                    plugin_uri,
                    idx,
                    instance_id=msg.get('instance_id'),
                    plugin_position=msg.get('plugin_position'),
                )

        elif action == 'ping':
            await client.websocket.send_text(json.dumps({'type': 'pong'}))

        elif action == 'get_value':
            # Instant value read from cache
            key = self._parameter_key(
                msg['plugin_uri'],
                msg['param_index'],
                instance_id=msg.get('instance_id'),
                plugin_position=msg.get('plugin_position'),
            )
            value = self._param_cache.get(key)
            payload = ParameterUpdate(
                plugin_uri=msg['plugin_uri'],
                param_index=msg['param_index'],
                value=value,
                instance_id=self._normalize_positive_int(msg.get('instance_id')),
                plugin_position=self._normalize_non_negative_int(msg.get('plugin_position')),
            ).to_json()
            await client.websocket.send_text(json.dumps({
                'type': 'value',
                **payload,
            }))

    async def _subscribe_param(
        self,
        client_id: str,
        plugin_uri: str,
        param_index: int,
        *,
        instance_id: Any = None,
        plugin_position: Any = None,
    ):
        """Subscribe client to parameter updates."""
        key = self._parameter_key(
            plugin_uri,
            param_index,
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
        with self._state_lock:
            self._subscriptions[key].add(client_id)
            client = self._clients.get(client_id)
            if client is not None:
                client.subscribed_params.add(key)

        # Send current value if cached
        if key in self._param_cache:
            await self._send_to_client(client_id, ParameterUpdate(
                plugin_uri=plugin_uri,
                param_index=param_index,
                value=self._param_cache[key],
                instance_id=self._normalize_positive_int(instance_id),
                plugin_position=self._normalize_non_negative_int(plugin_position),
            ))

    async def _unsubscribe_param(
        self,
        client_id: str,
        plugin_uri: str,
        param_index: int,
        *,
        instance_id: Any = None,
        plugin_position: Any = None,
    ):
        """Unsubscribe client from parameter updates."""
        key = self._parameter_key(
            plugin_uri,
            param_index,
            instance_id=instance_id,
            plugin_position=plugin_position,
        )
        with self._state_lock:
            self._subscriptions[key].discard(client_id)
            if not self._subscriptions[key]:
                self._subscriptions.pop(key, None)
            client = self._clients.get(client_id)
            if client is not None:
                client.subscribed_params.discard(key)

    async def _process_update(self, update: ParameterUpdate, source_client: Optional[str] = None):
        """
        Process a parameter update with minimal latency.

        1. Update cache immediately
        2. Queue for engine (non-blocking)
        3. Broadcast to subscribers
        """
        start_time = time.perf_counter()

        self._stats['updates_received'] += 1

        # Update cache
        key = self._parameter_key(
            update.plugin_uri,
            update.param_index,
            instance_id=update.instance_id,
            plugin_position=update.plugin_position,
        )
        self._param_cache[key] = update.value

        # Queue for engine (non-blocking)
        try:
            self._update_queue.put_nowait(update)
        except asyncio.QueueFull:
            # Drop oldest update if queue is full (shouldn't happen normally)
            try:
                self._update_queue.get_nowait()
                self._update_queue.put_nowait(update)
            except Exception:
                pass

        # Broadcast to subscribers (except source)
        await self._broadcast_update(key, update, exclude_client=source_client)

        # Track latency
        latency_us = (time.perf_counter() - start_time) * 1_000_000
        self._latency_samples.append(latency_us)
        while len(self._latency_samples) > self._max_latency_samples:
            self._latency_samples.popleft()
        self._stats['avg_latency_us'] = sum(self._latency_samples) / len(self._latency_samples)

    async def _send_to_client(self, client_id: str, update: ParameterUpdate):
        """Send update to a specific client."""
        with self._state_lock:
            client = self._clients.get(client_id)
        if client is None:
            return
        self._stats['updates_broadcast'] += 1

        try:
            if client.use_binary:
                if client.use_binary and update.instance_id is None and update.plugin_position is None:
                    await asyncio.wait_for(client.websocket.send_bytes(update.to_binary()), timeout=self._send_timeout_seconds)
                else:
                    await asyncio.wait_for(client.websocket.send_text(json.dumps({
                        'type': 'param_update',
                        **update.to_json()
                    })), timeout=self._send_timeout_seconds)
            else:
                await asyncio.wait_for(client.websocket.send_text(json.dumps({
                    'type': 'param_update',
                    **update.to_json()
                })), timeout=self._send_timeout_seconds)
        except Exception as e:
            logger.warning(f"Failed to send to client {client_id}: {e}")
            self.disconnect_client(client_id)

    async def _broadcast_update(
        self,
        key: Tuple[Any, ...],
        update: ParameterUpdate,
        *,
        exclude_client: Optional[str] = None,
    ) -> None:
        with self._state_lock:
            subscribers = list(self._subscriptions.get(key, set()))
        tasks = [
            self._send_to_client(client_id, update)
            for client_id in subscribers
            if client_id != exclude_client
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _process_loop(self):
        """
        Main processing loop for engine updates.

        Coalesces updates to reduce engine calls while maintaining low latency.
        """
        pending: Dict[Tuple[Any, ...], ParameterUpdate] = {}
        last_flush = time.time()

        while self._running:
            try:
                # Try to get updates with short timeout
                try:
                    update = await asyncio.wait_for(
                        self._update_queue.get(),
                        timeout=self._coalesce_interval_ms / 1000
                    )
                    # Coalesce: keep only latest value per parameter
                    key = self._parameter_key(
                        update.plugin_uri,
                        update.param_index,
                        instance_id=update.instance_id,
                        plugin_position=update.plugin_position,
                    )
                    if key in pending:
                        self._stats['coalesced_updates'] += 1
                    pending[key] = update

                except asyncio.TimeoutError:
                    pass

                # Flush to engine if interval passed or batch full
                now = time.time()
                should_flush = (
                    (now - last_flush) * 1000 >= self._coalesce_interval_ms or
                    len(pending) >= self._max_batch_size
                )

                if should_flush and pending and self._engine_callback:
                    for update in pending.values():
                        try:
                            self._engine_callback(
                                update.plugin_uri,
                                update.param_index,
                                update.value,
                                update.instance_id,
                                update.plugin_position,
                            )
                            self._stats['updates_to_engine'] += 1
                        except Exception as e:
                            logger.error(f"Engine callback error: {e}")
                    pending.clear()
                    last_flush = now

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in RT parameter processing loop: {e}")
                await asyncio.sleep(0.001)

    async def update_from_engine(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ):
        """
        Called by engine when parameter changes internally.

        Used for automation, MIDI, preset loading - broadcasts to all subscribed clients.
        """
        update = ParameterUpdate(
            plugin_uri=plugin_uri,
            param_index=param_index,
            value=value,
            instance_id=self._normalize_positive_int(instance_id),
            plugin_position=self._normalize_non_negative_int(plugin_position),
            source=ParameterSource.INTERNAL
        )

        # Update cache
        key = self._parameter_key(
            plugin_uri,
            param_index,
            instance_id=update.instance_id,
            plugin_position=update.plugin_position,
        )
        self._param_cache[key] = value

        # Broadcast to all subscribers
        await self._broadcast_update(key, update)

    async def update_from_midi(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ):
        """Called when MIDI controller changes a parameter."""
        update = ParameterUpdate(
            plugin_uri=plugin_uri,
            param_index=param_index,
            value=value,
            instance_id=self._normalize_positive_int(instance_id),
            plugin_position=self._normalize_non_negative_int(plugin_position),
            source=ParameterSource.MIDI
        )
        await self._process_update(update, source_client=None)

    async def update_from_automation(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ):
        """Called when automation (LFO, envelope) changes a parameter."""
        update = ParameterUpdate(
            plugin_uri=plugin_uri,
            param_index=param_index,
            value=value,
            instance_id=self._normalize_positive_int(instance_id),
            plugin_position=self._normalize_non_negative_int(plugin_position),
            source=ParameterSource.AUTOMATION
        )
        await self._process_update(update, source_client=None)

    def get_cached_value(
        self,
        plugin_uri: str,
        param_index: int,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> Optional[float]:
        """Get current cached value for a parameter."""
        return self._param_cache.get(
            self._parameter_key(
                plugin_uri,
                param_index,
                instance_id=instance_id,
                plugin_position=plugin_position,
            )
        )

    def set_cached_value(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ):
        """Set cached value without triggering updates (for initialization)."""
        self._param_cache[
            self._parameter_key(
                plugin_uri,
                param_index,
                instance_id=instance_id,
                plugin_position=plugin_position,
            )
        ] = value

    def get_stats(self) -> Dict[str, Any]:
        """Get bridge statistics."""
        return {
            **self._stats,
            'connected_clients': len(self._clients),
            'cached_params': len(self._param_cache),
            'active_subscriptions': sum(len(s) for s in self._subscriptions.values()),
            'queue_size': self._update_queue.qsize(),
        }


# Global singleton instance
rt_parameter_bridge = RealTimeParameterBridge()
