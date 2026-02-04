"""
API Client for MAP2 Audio Platform TUI
Provides async wrapper functions for all backend API endpoints with error handling.

Performance optimizations:
- Connection pooling with keep-alive connections
- Request batching for parameter updates
- Retry logic for transient failures
"""

import logging
import asyncio
import json
from dataclasses import dataclass, field
from typing import Optional, Any, Dict, List, Callable
import httpx
import time

logger = logging.getLogger(__name__)


@dataclass
class APIResult:
    """Result object for API calls with success/error handling."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    status_code: Optional[int] = None


@dataclass
class BatchedParameterUpdate:
    """Represents a batched parameter update."""
    chain_id: int
    plugin_uri: str
    param_uri: str
    value: float
    timestamp: float = field(default_factory=time.time)


class MAP2APIClient:
    """
    Async API client for MAP2 Audio Platform backend.

    Features:
    - Connection pooling with configurable limits
    - Keep-alive connections for reduced latency
    - Request batching for parameter updates
    - Automatic retry for transient failures
    """

    # Connection pool configuration
    MAX_CONNECTIONS = 10
    MAX_KEEPALIVE_CONNECTIONS = 5
    KEEPALIVE_EXPIRY = 30.0  # seconds

    # Batching configuration
    BATCH_DELAY_MS = 50  # Wait this long before flushing parameter batch
    MAX_BATCH_SIZE = 20  # Maximum parameters per batch request

    def __init__(self, base_url: str = "http://localhost:8080", timeout: float = 10.0):
        """
        Initialize API client with connection pooling.

        Args:
            base_url: Backend API base URL
            timeout: Request timeout in seconds
        """
        self.base_url = base_url
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

        # Parameter batching state
        self._param_batch: List[BatchedParameterUpdate] = []
        self._batch_task: Optional[asyncio.Task] = None
        self._batch_lock = asyncio.Lock()

        # Request statistics
        self._request_count = 0
        self._batch_count = 0

        # Logging callback for TUI API log widget
        self._log_callback: Optional[Callable[[str, str, str, str, float], None]] = None

    def _create_client(self) -> httpx.AsyncClient:
        """Create HTTP client with connection pooling."""
        limits = httpx.Limits(
            max_connections=self.MAX_CONNECTIONS,
            max_keepalive_connections=self.MAX_KEEPALIVE_CONNECTIONS,
            keepalive_expiry=self.KEEPALIVE_EXPIRY
        )
        return httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            limits=limits,
            http2=False,  # HTTP/1.1 for lower latency on small requests
        )

    async def __aenter__(self):
        """Async context manager entry."""
        self._client = self._create_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def close(self):
        """Close the HTTP client, flush pending batches, and disconnect WebSocket."""
        # Disconnect WebSocket if connected
        if hasattr(self, '_ws_connected') and self._ws_connected:
            await self.disconnect_websocket()

        # Flush any pending parameter updates
        if self._param_batch:
            await self._flush_parameter_batch()

        # Cancel batch task if running
        if self._batch_task and not self._batch_task.done():
            self._batch_task.cancel()
            try:
                await self._batch_task
            except asyncio.CancelledError:
                pass

        # Close HTTP client
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _request(self, method: str, endpoint: str, retries: int = 2, **kwargs) -> APIResult:
        """
        Internal request wrapper with error handling and retry logic.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            retries: Number of retry attempts for transient failures
            **kwargs: Additional arguments for httpx request

        Returns:
            APIResult with success status and data/error
        """
        if not self._client:
            self._client = self._create_client()

        start_time = time.time()
        last_error = None
        for attempt in range(retries + 1):
            try:
                self._request_count += 1
                response = await self._client.request(method, endpoint, **kwargs)
                duration_ms = (time.time() - start_time) * 1000

                if response.status_code in (200, 201):
                    try:
                        data = response.json()
                        result_summary = str(data)[:50] if data else "OK"
                        self._log_call(method, endpoint, "success", result_summary, duration_ms)
                        return APIResult(success=True, data=data, status_code=response.status_code)
                    except Exception:
                        # Response might not be JSON
                        self._log_call(method, endpoint, "success", response.text[:50], duration_ms)
                        return APIResult(success=True, data=response.text, status_code=response.status_code)
                elif response.status_code >= 500 and attempt < retries:
                    # Server error - retry
                    last_error = f"HTTP {response.status_code}: {response.text[:200]}"
                    await asyncio.sleep(0.1 * (attempt + 1))  # Backoff
                    continue
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                    self._log_call(method, endpoint, "error", error_msg[:50], duration_ms)
                    return APIResult(success=False, error=error_msg, status_code=response.status_code)

            except httpx.TimeoutException:
                duration_ms = (time.time() - start_time) * 1000
                if attempt < retries:
                    last_error = "Request timed out"
                    await asyncio.sleep(0.1 * (attempt + 1))
                    continue
                self._log_call(method, endpoint, "error", "Timeout", duration_ms)
                return APIResult(success=False, error="Request timed out. Is the backend running?")
            except httpx.ConnectError:
                duration_ms = (time.time() - start_time) * 1000
                if attempt < retries:
                    last_error = "Connection error"
                    await asyncio.sleep(0.2 * (attempt + 1))
                    continue
                self._log_call(method, endpoint, "error", "Connect error", duration_ms)
                return APIResult(success=False, error="Cannot connect to backend. Is it running?")
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                last_error = str(e)
                if attempt < retries:
                    await asyncio.sleep(0.1 * (attempt + 1))
                    continue
                self._log_call(method, endpoint, "error", str(e)[:50], duration_ms)
                return APIResult(success=False, error=f"Unexpected error: {str(e)}")

        duration_ms = (time.time() - start_time) * 1000
        self._log_call(method, endpoint, "error", f"Failed after {retries + 1} attempts", duration_ms)
        return APIResult(success=False, error=f"Failed after {retries + 1} attempts: {last_error}")

    # ==================== PARAMETER BATCHING ====================

    async def batch_set_parameter(
        self,
        chain_id: int,
        plugin_uri: str,
        param_uri: str,
        value: float
    ) -> None:
        """
        Queue a parameter update for batched sending.

        Multiple rapid parameter changes (e.g., from knob turns) are
        collected and sent in a single request after a short delay.

        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
            param_uri: Parameter URI
            value: New parameter value
        """
        async with self._batch_lock:
            # Add to batch, replacing any existing update for same parameter
            update = BatchedParameterUpdate(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                param_uri=param_uri,
                value=value
            )

            # Remove any existing update for the same parameter
            self._param_batch = [
                p for p in self._param_batch
                if not (p.chain_id == chain_id and
                       p.plugin_uri == plugin_uri and
                       p.param_uri == param_uri)
            ]
            self._param_batch.append(update)

            # Flush immediately if batch is full
            if len(self._param_batch) >= self.MAX_BATCH_SIZE:
                await self._flush_parameter_batch()
            elif not self._batch_task or self._batch_task.done():
                # Schedule delayed flush
                self._batch_task = asyncio.create_task(self._delayed_batch_flush())

    async def _delayed_batch_flush(self) -> None:
        """Flush parameter batch after delay."""
        await asyncio.sleep(self.BATCH_DELAY_MS / 1000.0)
        await self._flush_parameter_batch()

    async def _flush_parameter_batch(self) -> None:
        """Send all batched parameter updates."""
        async with self._batch_lock:
            if not self._param_batch:
                return

            batch = self._param_batch
            self._param_batch = []
            self._batch_count += 1

        # Group updates by chain for efficient sending
        updates_by_chain: Dict[int, List[Dict]] = {}
        for update in batch:
            if update.chain_id not in updates_by_chain:
                updates_by_chain[update.chain_id] = []
            updates_by_chain[update.chain_id].append({
                "plugin_uri": update.plugin_uri,
                "param_uri": update.param_uri,
                "value": update.value
            })

        # Send updates for each chain
        for chain_id, params in updates_by_chain.items():
            try:
                await self._request(
                    "POST",
                    f"/api/chains/{chain_id}/parameters/batch",
                    json={"parameters": params},
                    retries=1
                )
            except Exception as e:
                logger.warning(f"Batch parameter update failed for chain {chain_id}: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get API client statistics."""
        return {
            "request_count": self._request_count,
            "batch_count": self._batch_count,
            "pending_batch_size": len(self._param_batch),
            "connection_pool": {
                "max_connections": self.MAX_CONNECTIONS,
                "max_keepalive": self.MAX_KEEPALIVE_CONNECTIONS
            },
            "websocket_connected": self._ws_connected if hasattr(self, '_ws_connected') else False
        }

    def set_log_callback(self, callback: Callable[[str, str, str, str, float], None]) -> None:
        """
        Set callback for API call logging.

        Args:
            callback: Function called with (method, endpoint, status, result, duration_ms)
        """
        self._log_callback = callback

    def _log_call(self, method: str, endpoint: str, status: str,
                  result: str, duration_ms: float) -> None:
        """
        Log an API call if callback is set.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            status: "success" or "error"
            result: Result summary or error message
            duration_ms: Response time in milliseconds
        """
        if self._log_callback:
            try:
                self._log_callback(method, endpoint, status, result, duration_ms)
            except Exception:
                pass  # Don't let logging errors break API calls

    # ==================== WEBSOCKET REAL-TIME UPDATES ====================

    async def connect_websocket(
        self,
        on_message: Optional[Callable[[Dict[str, Any]], None]] = None,
        topics: Optional[List[str]] = None
    ) -> bool:
        """
        Connect to WebSocket for real-time updates.

        This replaces polling with push-based updates for:
        - Audio levels and meters
        - CPU usage changes
        - Chain/plugin state changes
        - System events

        Args:
            on_message: Callback for incoming messages
            topics: List of topics to subscribe to (e.g., ["audio_levels", "cpu_usage"])

        Returns:
            True if connection established
        """
        try:
            import websockets
        except ImportError:
            logger.warning("websockets package not available, falling back to polling")
            return False

        self._ws_on_message = on_message
        self._ws_topics = topics or ["audio_levels", "cpu_usage", "chain_events"]
        self._ws_connected = False
        self._ws_task: Optional[asyncio.Task] = None

        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/ws/events"

        try:
            self._ws_task = asyncio.create_task(self._ws_listener(ws_url))
            self._ws_connected = True
            logger.info(f"WebSocket connection started to {ws_url}")
            return True
        except Exception as e:
            logger.warning(f"Failed to start WebSocket: {e}")
            return False

    async def _ws_listener(self, ws_url: str) -> None:
        """
        WebSocket listener loop with automatic reconnection.

        Args:
            ws_url: WebSocket URL
        """
        try:
            import websockets
        except ImportError:
            return

        reconnect_delay = 1
        max_reconnect_delay = 30

        while self._ws_connected:
            try:
                async with websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5
                ) as ws:
                    # Subscribe to topics
                    if self._ws_topics:
                        await ws.send(json.dumps({
                            "action": "subscribe",
                            "topics": self._ws_topics
                        }))

                    # Reset reconnect delay on successful connection
                    reconnect_delay = 1
                    logger.debug("WebSocket connected and subscribed")

                    # Listen for messages
                    async for message in ws:
                        try:
                            data = json.loads(message)
                            if self._ws_on_message:
                                self._ws_on_message(data)
                        except json.JSONDecodeError:
                            logger.debug(f"Invalid JSON from WebSocket: {message[:100]}")

            except websockets.ConnectionClosed:
                logger.debug("WebSocket connection closed, reconnecting...")
            except Exception as e:
                logger.debug(f"WebSocket error: {e}")

            if self._ws_connected:
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)

    async def disconnect_websocket(self) -> None:
        """Disconnect WebSocket and stop listener."""
        self._ws_connected = False
        if hasattr(self, '_ws_task') and self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass
        logger.info("WebSocket disconnected")

    def subscribe_to_events(
        self,
        callback: Callable[[Dict[str, Any]], None],
        topics: Optional[List[str]] = None
    ) -> asyncio.Task:
        """
        Subscribe to real-time events via WebSocket.

        This is a convenience method that starts the WebSocket connection
        and returns a task that can be cancelled to stop receiving events.

        Args:
            callback: Function to call with each event
            topics: Event topics to subscribe to

        Returns:
            Task that manages the subscription

        Example:
            async def handle_event(event):
                if event.get("type") == "audio_levels":
                    update_meters(event["data"])

            task = api_client.subscribe_to_events(handle_event, ["audio_levels"])
            # Later: task.cancel() to stop
        """
        async def subscribe():
            await self.connect_websocket(on_message=callback, topics=topics)

        return asyncio.create_task(subscribe())

    # ==================== CONVENIENCE METHODS ====================

    async def get(self, endpoint: str, **kwargs) -> Optional[dict]:
        """
        Simple GET request that returns data directly or None on error.
        For backward compatibility with code using api_client.get().
        """
        result = await self._request("GET", endpoint, **kwargs)
        if result.success:
            return result.data
        return None

    async def post(self, endpoint: str, **kwargs) -> Optional[dict]:
        """
        Simple POST request that returns data directly or None on error.
        For backward compatibility with code using api_client.post().
        """
        result = await self._request("POST", endpoint, **kwargs)
        if result.success:
            return result.data
        return None

    # ==================== AUDIO ENGINE ====================
    # Note: Audio control methods are defined in the AUDIO CONTROL section below

    # ==================== SIGNAL CHAINS ====================

    async def list_chains(self) -> APIResult:
        """List all signal chains."""
        return await self._request("GET", "/api/chains/")

    async def create_chain(self, name: str) -> APIResult:
        """
        Create new signal chain.

        Args:
            name: Chain name (1-256 characters)
        """
        return await self._request("POST", "/api/chains/", json={"name": name})

    async def get_chain(self, chain_id: int) -> APIResult:
        """Get chain details by ID."""
        return await self._request("GET", f"/api/chains/{chain_id}")

    async def delete_chain(self, chain_id: int) -> APIResult:
        """Delete a chain."""
        return await self._request("DELETE", f"/api/chains/{chain_id}")

    async def rename_chain(self, chain_id: int, new_name: str) -> APIResult:
        """Rename a chain."""
        return await self._request("PUT", f"/api/chains/{chain_id}/rename", params={"new_name": new_name})

    async def activate_chain(self, chain_id: int) -> APIResult:
        """Activate a chain (sets it as active signal chain)."""
        return await self._request("POST", f"/api/chains/{chain_id}/activate")

    async def deactivate_chain(self, chain_id: int) -> APIResult:
        """Deactivate a chain."""
        return await self._request("POST", f"/api/chains/{chain_id}/deactivate")

    async def toggle_plugin_bypass(self, chain_id: int, plugin_uri: str, bypass: bool) -> APIResult:
        """
        Toggle plugin bypass in chain.

        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
            bypass: True to bypass (mute), False to enable
        """
        # URL-encode the plugin URI
        import urllib.parse
        encoded_uri = urllib.parse.quote(plugin_uri, safe='')
        return await self._request("POST", f"/api/chains/{chain_id}/plugins/{encoded_uri}/bypass",
                                   params={"bypass": bypass})

    async def add_plugin_to_chain(self, chain_id: int, plugin_uri: str) -> APIResult:
        """Add a plugin to a chain."""
        if not plugin_uri:
            return APIResult(success=False, error="Plugin URI is required")
        return await self._request("POST", f"/api/chains/{chain_id}/plugins", params={"plugin_uri": plugin_uri})

    async def remove_plugin_from_chain(self, chain_id: int, plugin_uri: str) -> APIResult:
        """Remove a plugin from a chain."""
        import urllib.parse
        encoded_uri = urllib.parse.quote(plugin_uri, safe='')
        return await self._request("DELETE", f"/api/chains/{chain_id}/plugins/{encoded_uri}")

    async def move_plugin_in_chain(self, chain_id: int, plugin_uri: str, new_position: int) -> APIResult:
        """Move a plugin to a new position in the chain."""
        import urllib.parse
        encoded_uri = urllib.parse.quote(plugin_uri, safe='')
        return await self._request("POST", f"/api/chains/{chain_id}/plugins/{encoded_uri}/move",
                                   params={"position": new_position})

    async def set_plugin_bypass(self, chain_id: int, plugin_uri: str, bypass: bool) -> APIResult:
        """Set plugin bypass state (same as toggle_plugin_bypass)."""
        return await self.toggle_plugin_bypass(chain_id, plugin_uri, bypass)

    async def reorder_plugins(self, chain_id: int, plugin_uris: List[str]) -> APIResult:
        """
        Reorder plugins in chain.

        Args:
            chain_id: Chain ID
            plugin_uris: Ordered list of plugin URIs
        """
        return await self._request("POST", f"/api/chains/{chain_id}/reorder", json=plugin_uris)

    # ==================== CHAIN PRESETS ====================

    async def save_preset(self, chain_id: int, preset_name: str) -> APIResult:
        """Save chain as preset (alias for save_chain_preset)."""
        return await self.save_chain_preset(chain_id, preset_name)

    async def save_chain_preset(self, chain_id: int, preset_name: str) -> APIResult:
        """Save chain as preset."""
        return await self._request("POST", f"/api/chains/{chain_id}/preset/save",
                                   params={"preset_name": preset_name})

    async def load_chain_preset(self, preset_id: int) -> APIResult:
        """Load a preset (creates new chain)."""
        return await self._request("POST", f"/api/chains/preset/{preset_id}/load")

    async def list_chain_presets(self) -> APIResult:
        """List all chain presets."""
        return await self._request("GET", "/api/chains/presets")

    async def delete_chain_preset(self, preset_id: int) -> APIResult:
        """Delete a chain preset."""
        return await self._request("DELETE", f"/api/chains/preset/{preset_id}")

    # ==================== CHAIN TEMPLATES (DEMO PEDALBOARDS) ====================

    async def list_templates(self) -> APIResult:
        """List available chain templates (demo pedalboards).

        Returns:
            APIResult with list of templates containing name, description, plugin_count
        """
        return await self._request("GET", "/api/chains/templates/list")

    async def load_template(self, template_name: str) -> APIResult:
        """Load a chain template (demo pedalboard).

        Creates a new chain from the template configuration.

        Args:
            template_name: Name of the template (e.g., "Rock Distortion", "Clean Tone")

        Returns:
            APIResult with created chain including plugins
        """
        return await self._request("POST", "/api/chains/templates/load",
                                   params={"template_name": template_name})


    # ==================== PLUGINS (JUCE Engine Integration) ====================

    async def discover_plugins(self, refresh: bool = False) -> APIResult:
        """Discover available LV2 plugins using JUCE engine."""
        endpoint = "/api/plugins/discover"
        if refresh:
            endpoint += "?refresh=true"
        return await self._request("GET", endpoint)

    async def refresh_plugins(self) -> APIResult:
        """Force refresh of plugin cache and return updated list."""
        return await self._request("POST", "/api/plugins/refresh")

    async def list_plugins(self) -> APIResult:
        """List all available plugins from JUCE engine."""
        return await self._request("GET", "/api/engine/plugins")

    async def load_plugin(self, uri: str) -> APIResult:
        """Load a plugin by URI into JUCE engine."""
        return await self._request("POST", "/api/engine/plugins/load", json={"uri": uri})

    async def unload_plugin(self, instance_id: int) -> APIResult:
        """Unload a plugin from JUCE engine by instance ID."""
        return await self._request("POST", f"/api/engine/plugins/unload/{instance_id}")

    async def get_plugin_info(self, uri: str) -> APIResult:
        """Get detailed plugin information from JUCE engine."""
        import urllib.parse
        encoded_uri = urllib.parse.quote(uri, safe='')
        return await self._request("GET", f"/api/engine/plugins/{encoded_uri}")

    async def get_plugin_parameters(self, chain_id: int, plugin_uri: str) -> APIResult:
        """Get parameters for a plugin from JUCE engine."""
        import urllib.parse
        encoded_uri = urllib.parse.quote(plugin_uri, safe='')
        return await self._request("GET", f"/api/plugins/{encoded_uri}/parameters")

    async def set_plugin_parameter(self, chain_id: int, plugin_uri: str, param_index: int, value: float) -> APIResult:
        """Set a plugin parameter value in JUCE engine."""
        import urllib.parse
        encoded_uri = urllib.parse.quote(plugin_uri, safe='')
        return await self._request(
            "POST",
            f"/api/plugins/{encoded_uri}/parameters/{param_index}",
            params={"value": value}
        )


    # ==================== JUCE ENGINE ====================

    async def get_juce_status(self) -> APIResult:
        """Get comprehensive JUCE engine status."""
        return await self._request("GET", "/api/engine/status")

    async def get_juce_version(self) -> APIResult:
        """Get JUCE engine version."""
        return await self._request("GET", "/api/engine/version")

    async def initialize_juce(self, sample_rate: int = 48000, buffer_size: int = 256,
                              audio_device: str = "default", enable_midi: bool = True) -> APIResult:
        """Initialize JUCE engine with configuration."""
        return await self._request("POST", "/api/engine/initialize", json={
            "sample_rate": sample_rate,
            "buffer_size": buffer_size,
            "audio_device": audio_device,
            "enable_midi": enable_midi
        })

    async def shutdown_juce(self) -> APIResult:
        """Shutdown JUCE engine."""
        return await self._request("POST", "/api/engine/shutdown")

    # ==================== AUDIO CONTROL ====================

    async def start_audio(self) -> APIResult:
        """Start audio processing."""
        return await self._request("POST", "/api/audio/start")

    async def stop_audio(self) -> APIResult:
        """Stop audio processing."""
        return await self._request("POST", "/api/audio/stop")

    async def get_audio_status(self) -> APIResult:
        """Get audio processing status."""
        return await self._request("GET", "/api/audio/status")

    async def get_pipedal_status(self) -> APIResult:
        """Get PiPedal/engine status (CPU load, xruns, etc.)."""
        return await self._request("GET", "/api/pipedal/status")

    async def get_audio_pipedal_metrics(self) -> APIResult:
        """Get PiPedal-specific audio metrics (CPU load, underruns, etc.)."""
        return await self._request("GET", "/api/audio/pipedal")

    async def get_audio_latency(self) -> APIResult:
        """Get current audio latency in milliseconds."""
        return await self._request("GET", "/api/audio/latency")

    async def get_audio_levels(self) -> APIResult:
        """Get current audio input/output levels."""
        return await self._request("GET", "/api/audio/levels")


    # ==================== SNAPSHOTS ====================

    async def list_snapshots(self) -> APIResult:
        """List all available snapshots (0-5) from JUCE engine."""
        return await self._request("GET", "/api/engine/snapshots")

    async def get_current_snapshot(self) -> APIResult:
        """Get current snapshot ID from JUCE engine."""
        return await self._request("GET", "/api/engine/snapshot/current")

    async def load_snapshot(self, snapshot_id: int) -> APIResult:
        """Load a snapshot (0-5) in JUCE engine."""
        return await self._request("POST", "/api/engine/snapshots/load", json={
            "snapshot_id": snapshot_id
        })

    # ==================== PEDALBOARD/CHAIN ====================

    async def get_current_pedalboard(self) -> APIResult:
        """Get current pedalboard/chain configuration from JUCE engine."""
        return await self._request("GET", "/api/engine/chain")

    async def load_pedalboard(self, name: str) -> APIResult:
        """Load a pedalboard by name in JUCE engine."""
        return await self._request("POST", "/api/sessions/load", json={
            "name": name
        })

    async def save_pedalboard(self, name: str) -> APIResult:
        """Save current pedalboard in JUCE engine."""
        return await self._request("POST", "/api/sessions/save", json={
            "name": name
        })

    # ==================== MIDI (JUCE-Based) ====================

    async def get_midi_status(self) -> APIResult:
        """Get MIDI system status from JUCE engine."""
        return await self._request("GET", "/api/engine/midi/status")

    async def enable_midi(self, enable: bool = True) -> APIResult:
        """Enable or disable MIDI via JUCE engine.

        Args:
            enable: True to enable, False to disable MIDI
        """
        return await self._request("POST", "/api/engine/midi/enable", params={"enable": enable})

    async def get_midi_devices(self) -> APIResult:
        """Get available MIDI devices from JUCE engine."""
        return await self._request("GET", "/api/engine/midi/devices")

    async def start_midi(self) -> APIResult:
        """Start MIDI engine (alias for enable_midi(True))."""
        return await self.enable_midi(True)

    async def stop_midi(self) -> APIResult:
        """Stop MIDI engine (alias for enable_midi(False))."""
        return await self.enable_midi(False)

    async def open_midi_input(self, device_index: int) -> APIResult:
        """Open a MIDI input device via JUCE."""
        return await self._request("POST", f"/api/engine/midi/input/open/{device_index}")

    async def close_midi_input(self) -> APIResult:
        """Close the current MIDI input device via JUCE."""
        return await self._request("POST", "/api/engine/midi/input/close")

    async def open_midi_output(self, device_index: int) -> APIResult:
        """Open a MIDI output device via JUCE."""
        return await self._request("POST", f"/api/engine/midi/output/open/{device_index}")

    async def close_midi_output(self) -> APIResult:
        """Close the current MIDI output device via JUCE."""
        return await self._request("POST", "/api/engine/midi/output/close")

    async def list_midi_mappings(self) -> APIResult:
        """List all MIDI CC mappings from JUCE engine."""
        return await self._request("GET", "/api/engine/midi/mappings")

    async def create_midi_mapping(self, midi_channel: int, cc_number: int,
                                   plugin_uri: str, parameter_index: int,
                                   parameter_name: str = "") -> APIResult:
        """
        Create MIDI CC mapping via JUCE engine.

        Args:
            midi_channel: MIDI channel (1-16)
            cc_number: CC number (0-127)
            plugin_uri: Target plugin URI
            parameter_index: Parameter index in plugin
            parameter_name: Parameter name (unused, for compatibility)
        """
        return await self._request("POST", "/api/engine/midi/mappings", json={
            "channel": midi_channel,
            "cc_number": cc_number,
            "plugin_uri": plugin_uri,
            "param_index": parameter_index
        })

    async def delete_midi_mapping(self, channel: int, cc_number: int) -> APIResult:
        """Delete MIDI CC mapping via JUCE engine."""
        return await self._request("DELETE", f"/api/engine/midi/mappings/{channel}/{cc_number}")

    async def clear_midi_mappings(self) -> APIResult:
        """Clear all MIDI CC mappings via JUCE engine."""
        return await self._request("POST", "/api/engine/midi/mappings/clear")

    async def start_midi_learn(self, plugin_uri: str = "", param_index: int = 0) -> APIResult:
        """Start MIDI learn mode via JUCE engine.

        Args:
            plugin_uri: Target plugin URI
            param_index: Target parameter index
        """
        return await self._request("POST", "/api/engine/midi/learn/start", json={
            "plugin_uri": plugin_uri,
            "param_index": param_index
        })

    async def stop_midi_learn(self) -> APIResult:
        """Stop MIDI learn mode via JUCE engine."""
        return await self._request("POST", "/api/engine/midi/learn/stop")

    async def get_midi_learn_status(self) -> APIResult:
        """Get MIDI learn status from JUCE engine."""
        return await self._request("GET", "/api/engine/midi/learn/status")

    async def toggle_midi_learn(self, plugin_uri: str = "", param_index: int = 0) -> APIResult:
        """Toggle MIDI learn mode on/off via JUCE engine."""
        status_result = await self.get_midi_learn_status()
        if status_result.success and status_result.data:
            is_learning = status_result.data.get("active", False)
            if is_learning:
                return await self.stop_midi_learn()
            else:
                return await self.start_midi_learn(plugin_uri, param_index)
        return await self.start_midi_learn(plugin_uri, param_index)

    async def refresh_midi_devices(self) -> APIResult:
        """Refresh/rescan MIDI devices."""
        return await self._request("POST", "/api/midi/refresh")

    # ==================== GUITAR CHAIN ====================

    async def get_guitar_status(self) -> APIResult:
        """Get guitar chain status."""
        return await self._request("GET", "/api/guitar/")

    async def load_nam_model(self, model_name: str) -> APIResult:
        """Load NAM amp model."""
        return await self._request("POST", f"/api/guitar/nam/model/{model_name}")

    async def load_cabinet_ir(self, ir_name: str) -> APIResult:
        """Load cabinet IR."""
        return await self._request("POST", f"/api/guitar/cabinet/ir/{ir_name}")

    async def load_reverb_ir(self, ir_name: str) -> APIResult:
        """Load reverb IR."""
        return await self._request("POST", f"/api/guitar/reverb/ir/{ir_name}")

    async def set_guitar_mix(self, nam: Optional[float] = None,
                            cabinet: Optional[float] = None,
                            reverb: Optional[float] = None) -> APIResult:
        """
        Set wet/dry mix for guitar chain stages.

        Args:
            nam: NAM mix level (0.0-1.0)
            cabinet: Cabinet mix level (0.0-1.0)
            reverb: Reverb mix level (0.0-1.0)
        """
        mix_data = {}
        if nam is not None:
            mix_data["nam"] = nam
        if cabinet is not None:
            mix_data["cabinet"] = cabinet
        if reverb is not None:
            mix_data["reverb"] = reverb

        return await self._request("POST", "/api/guitar/mix", json=mix_data)

    async def set_guitar_bypass(self, nam: Optional[bool] = None,
                               cabinet: Optional[bool] = None,
                               reverb: Optional[bool] = None) -> APIResult:
        """
        Set bypass states for guitar chain stages.

        Args:
            nam: NAM bypass state
            cabinet: Cabinet bypass state
            reverb: Reverb bypass state
        """
        bypass_data = {}
        if nam is not None:
            bypass_data["nam"] = nam
        if cabinet is not None:
            bypass_data["cabinet"] = cabinet
        if reverb is not None:
            bypass_data["reverb"] = reverb

        return await self._request("POST", "/api/guitar/bypass", json=bypass_data)

    async def get_nam_models(self) -> APIResult:
        """Get available NAM models."""
        return await self._request("GET", "/api/nam/models")

    async def get_nam_status(self) -> APIResult:
        """Get NAM processor status."""
        return await self._request("GET", "/api/nam/")

    async def activate_nam_model(self, model_name: str) -> APIResult:
        """
        Activate a NAM model.

        Args:
            model_name: Name of the NAM model to activate

        Returns:
            APIResult with activation status
        """
        return await self._request("POST", f"/api/nam/models/{model_name}/activate")

    async def get_cabinet_irs(self) -> APIResult:
        """Get available cabinet IRs."""
        return await self._request("GET", "/api/ir/cabinets")

    async def get_reverb_irs(self) -> APIResult:
        """Get available reverb IRs."""
        return await self._request("GET", "/api/ir/reverbs")

    # ==================== SESSIONS ====================

    async def list_sessions(self) -> APIResult:
        """List all sessions."""
        return await self._request("GET", "/api/sessions/list")

    async def save_session(self, name: str, description: str = "", tags: List[str] = None) -> APIResult:
        """
        Save current state as session.

        Args:
            name: Session name
            description: Optional description
            tags: Optional list of tags
        """
        session_data = {
            "name": name,
            "description": description,
            "tags": tags or []
        }
        return await self._request("POST", "/api/sessions/save", json=session_data)

    async def load_session(self, session_id: int) -> APIResult:
        """Load a session."""
        return await self._request("POST", f"/api/sessions/load/{session_id}")

    async def delete_session(self, session_id: int) -> APIResult:
        """Delete a session."""
        return await self._request("DELETE", f"/api/sessions/{session_id}")

    # ==================== METRICS & PERFORMANCE ====================

    async def get_current_metrics(self) -> APIResult:
        """Get current system metrics."""
        return await self._request("GET", "/api/metrics/current")

    async def export_metrics_json(self) -> APIResult:
        """Export metrics in JSON format."""
        return await self._request("GET", "/api/metrics/export")

    async def export_metrics_prometheus(self) -> APIResult:
        """Export metrics in Prometheus format."""
        return await self._request("GET", "/api/metrics/prometheus")

    # Alias methods for convenience
    async def get_metrics(self) -> APIResult:
        """Alias for get_current_metrics()."""
        return await self.get_current_metrics()

    async def export_metrics(self) -> APIResult:
        """Alias for export_metrics_json()."""
        return await self.export_metrics_json()

    async def get_profiling_data(self) -> APIResult:
        """Get plugin performance profiling data."""
        return await self._request("GET", "/api/profiling/plugins")

    async def reset_profiling(self) -> APIResult:
        """Reset profiling counters."""
        return await self._request("POST", "/api/profiling/reset")

    async def save_profiling_snapshot(self) -> APIResult:
        """Save profiling snapshot to database."""
        return await self._request("POST", "/api/profiling/snapshot")

    # ==================== SYSTEM ====================

    async def get_health(self) -> APIResult:
        """Get system health status."""
        return await self._request("GET", "/api/health")

    # ==================== PLUGIN PARAMETERS ====================
    # Note: Plugin parameter methods are defined above in the PiPedal section
    # using /api/pipedal/plugins/{uri}/parameters endpoints

    # ==================== CHAIN PLUGIN MANAGEMENT ====================
    # Note: Plugin management methods (add_plugin_to_chain, remove_plugin_from_chain,
    # move_plugin_in_chain, set_plugin_bypass) are defined in SIGNAL CHAINS section above

    # ===== Impulse Response (IR) Management =====

    async def get_ir_status(self) -> APIResult:
        """Get IR processor status."""
        return await self._request("GET", "/api/ir/")

    async def list_cabinet_irs(self) -> APIResult:
        """List available cabinet impulse responses."""
        return await self._request("GET", "/api/ir/cabinets")

    async def list_reverb_irs(self) -> APIResult:
        """List available reverb impulse responses."""
        return await self._request("GET", "/api/ir/reverbs")

    async def load_ir_cabinet(self, ir_name: str) -> APIResult:
        """
        Load a cabinet IR via IR processor (not guitar chain).

        For guitar chain cabinet IR, use load_cabinet_ir() instead.

        Args:
            ir_name: Name of the IR file (without extension)

        Returns:
            APIResult with load status
        """
        return await self._request(
            "POST",
            f"/api/ir/cabinets/{ir_name}/load"
        )

    async def load_ir_reverb(self, ir_name: str) -> APIResult:
        """
        Load a reverb IR via IR processor (not guitar chain).

        For guitar chain reverb IR, use load_reverb_ir() instead.

        Args:
            ir_name: Name of the IR file (without extension)

        Returns:
            APIResult with load status
        """
        return await self._request(
            "POST",
            f"/api/ir/reverbs/{ir_name}/load"
        )

    async def upload_cabinet_ir(self, file_path: str) -> APIResult:
        """
        Upload a cabinet IR file.

        Args:
            file_path: Path to WAV file to upload

        Returns:
            APIResult with upload status
        """
        import os
        from pathlib import Path

        path = Path(file_path)
        if not path.exists():
            return APIResult(success=False, error=f"File not found: {file_path}")

        if path.suffix.lower() not in ['.wav', '.flac', '.aiff', '.aif']:
            return APIResult(success=False, error=f"Unsupported format: {path.suffix}. Use WAV, FLAC, or AIFF.")

        if not self._client:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)

        try:
            with open(file_path, 'rb') as f:
                files = {'file': (path.name, f, 'audio/wav')}
                response = await self._client.post("/api/ir/cabinets/upload", files=files)

            if response.status_code in (200, 201):
                try:
                    data = response.json()
                    return APIResult(success=True, data=data, status_code=response.status_code)
                except Exception:
                    return APIResult(success=True, data={"status": "uploaded", "filename": path.name}, status_code=response.status_code)
            else:
                return APIResult(success=False, error=f"Upload failed: HTTP {response.status_code}", status_code=response.status_code)

        except Exception as e:
            return APIResult(success=False, error=f"Upload error: {str(e)}")

    async def upload_reverb_ir(self, file_path: str) -> APIResult:
        """
        Upload a reverb IR file.

        Args:
            file_path: Path to WAV file to upload

        Returns:
            APIResult with upload status
        """
        import os
        from pathlib import Path

        path = Path(file_path)
        if not path.exists():
            return APIResult(success=False, error=f"File not found: {file_path}")

        if path.suffix.lower() not in ['.wav', '.flac', '.aiff', '.aif']:
            return APIResult(success=False, error=f"Unsupported format: {path.suffix}. Use WAV, FLAC, or AIFF.")

        if not self._client:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)

        try:
            with open(file_path, 'rb') as f:
                files = {'file': (path.name, f, 'audio/wav')}
                response = await self._client.post("/api/ir/reverbs/upload", files=files)

            if response.status_code in (200, 201):
                try:
                    data = response.json()
                    return APIResult(success=True, data=data, status_code=response.status_code)
                except Exception:
                    return APIResult(success=True, data={"status": "uploaded", "filename": path.name}, status_code=response.status_code)
            else:
                return APIResult(success=False, error=f"Upload failed: HTTP {response.status_code}", status_code=response.status_code)

        except Exception as e:
            return APIResult(success=False, error=f"Upload error: {str(e)}")

    async def upload_nam_model(self, file_path: str) -> APIResult:
        """
        Upload a NAM model file.

        Args:
            file_path: Path to .nam file to upload

        Returns:
            APIResult with upload status
        """
        import os
        from pathlib import Path

        try:
            path = Path(file_path)
            if not path.exists():
                return APIResult(success=False, error=f"File not found: {file_path}")

            if not path.suffix.lower() == '.nam':
                return APIResult(success=False, error="Only .nam files are supported")

            with open(path, 'rb') as f:
                files = {'file': (path.name, f, 'application/octet-stream')}
                response = await self._client.post("/api/packages/upload/nam", files=files)

            if response.status_code == 200:
                try:
                    data = response.json()
                    return APIResult(success=True, data=data, status_code=response.status_code)
                except Exception:
                    return APIResult(success=True, data={"status": "uploaded", "filename": path.name}, status_code=response.status_code)
            else:
                return APIResult(success=False, error=f"Upload failed: HTTP {response.status_code}", status_code=response.status_code)

        except Exception as e:
            return APIResult(success=False, error=f"Upload error: {str(e)}")

    # ===== IR Library Management =====

    async def list_ir_library(self, category: str = None, library: str = None) -> APIResult:
        """
        List IRs from the library with optional filtering.

        Args:
            category: Filter by category (cabinet, reverb, room, etc.)
            library: Filter by library source (conners, openair, user, etc.)

        Returns:
            APIResult with list of IRs
        """
        params = {}
        if category:
            params["category"] = category
        if library:
            params["library"] = library
        return await self._request("GET", "/irs/", params=params)

    async def get_ir_categories(self) -> APIResult:
        """Get IR category hierarchy."""
        return await self._request("GET", "/irs/categories/")

    async def get_ir_libraries(self) -> APIResult:
        """Get available IR library sources."""
        return await self._request("GET", "/irs/libraries/")

    async def search_irs(self, query: str, category: str = None, library: str = None) -> APIResult:
        """
        Search IRs with text query and filters.

        Args:
            query: Search text
            category: Filter by category
            library: Filter by library source

        Returns:
            APIResult with matching IRs
        """
        search_data = {"query": query}
        if category:
            search_data["category"] = category
        if library:
            search_data["library"] = library
        return await self._request("POST", "/irs/search", json=search_data)

    async def start_ir_download(self, sources: List[str] = None) -> APIResult:
        """
        Start downloading IRs from library sources.

        Args:
            sources: List of sources to download (conners, openair, etc.)
                    If None, downloads from all sources.

        Returns:
            APIResult with download status
        """
        data = {}
        if sources:
            data["sources"] = sources
        return await self._request("POST", "/irs/download", json=data)

    async def get_ir_download_status(self) -> APIResult:
        """Get current IR download progress."""
        return await self._request("GET", "/irs/download/status")

    async def get_ir_metadata(self, ir_id: int) -> APIResult:
        """
        Get detailed IR metadata including RT60, EDT, peak location.

        Args:
            ir_id: IR database ID

        Returns:
            APIResult with IR metadata
        """
        return await self._request("GET", f"/irs/{ir_id}")

    # ===== DSP Management =====

    async def get_dsp_status(self) -> APIResult:
        """Get DSP manager status including CPU budget and utilization."""
        return await self._request("GET", "/api/dsp/status")

    async def set_quality_mode(self, mode: str) -> APIResult:
        """
        Set DSP quality mode.

        Args:
            mode: "performance", "balanced", or "quality"

        Returns:
            APIResult with mode change status
        """
        return await self._request(
            "POST",
            "/api/dsp/mode",
            json={"mode": mode}
        )

    async def get_plugin_priorities(self) -> APIResult:
        """Get all plugin priorities."""
        return await self._request("GET", "/api/dsp/priorities")

    async def set_plugin_priority(self, plugin_uri: str, priority: int) -> APIResult:
        """
        Set plugin priority (1-10).

        Args:
            plugin_uri: Plugin URI
            priority: Priority level (1=lowest, 10=highest)

        Returns:
            APIResult with priority update status
        """
        return await self._request(
            "POST",
            "/api/dsp/priority",
            json={"plugin_uri": plugin_uri, "priority": priority}
        )

    async def set_target_cpu(self, target_percent: float) -> APIResult:
        """
        Set target CPU utilization percentage.

        Args:
            target_percent: Target CPU percentage (10-95)

        Returns:
            APIResult with new budget info
        """
        return await self._request(
            "POST",
            "/api/dsp/target_cpu",
            json={"target_percent": target_percent}
        )

    async def evaluate_chain(self, plugin_uris: List[str]) -> APIResult:
        """
        Evaluate which plugins can run within CPU budget.

        Args:
            plugin_uris: List of plugin URIs to evaluate

        Returns:
            APIResult with active/bypassed plugin lists
        """
        return await self._request(
            "POST",
            "/api/dsp/evaluate",
            json={"plugin_uris": plugin_uris}
        )

    async def optimize_dsp(self) -> APIResult:
        """Run DSP optimization to re-evaluate all plugins."""
        return await self._request("POST", "/api/dsp/optimize")

    async def get_cpu_headroom(self) -> APIResult:
        """Get available CPU headroom."""
        return await self._request("GET", "/api/dsp/headroom")

    # ===== Preset Management =====

    async def list_presets(
        self,
        category: Optional[str] = None,
        tags: Optional[str] = None,
        favorites_only: bool = False,
        search: Optional[str] = None
    ) -> APIResult:
        """List presets with optional filtering."""
        params = {}
        if category:
            params["category"] = category
        if tags:
            params["tags"] = tags
        if favorites_only:
            params["favorites_only"] = "true"
        if search:
            params["search"] = search

        return await self._request("GET", "/api/presets/", params=params)

    async def create_preset(
        self,
        name: str,
        chain_id: int,
        plugin_states: Dict[str, Any],
        tags: List[str] = None,
        category: str = "User"
    ) -> APIResult:
        """Create a new preset."""
        return await self._request(
            "POST",
            "/api/presets/",
            json={
                "name": name,
                "chain_id": chain_id,
                "plugin_states": plugin_states,
                "tags": tags or [],
                "category": category
            }
        )

    async def load_preset(self, preset_id: int) -> APIResult:
        """Load a preset."""
        return await self._request("POST", f"/api/presets/{preset_id}/load")

    async def delete_preset(self, preset_id: int) -> APIResult:
        """Delete a preset."""
        return await self._request("DELETE", f"/api/presets/{preset_id}")

    async def update_preset(
        self,
        preset_id: int,
        name: Optional[str] = None,
        tags: Optional[List[str]] = None,
        category: Optional[str] = None,
        description: Optional[str] = None,
        is_favorite: Optional[bool] = None
    ) -> APIResult:
        """Update preset metadata.

        Args:
            preset_id: Preset ID
            name: New name (optional)
            tags: New tags (optional)
            category: New category (optional)
            description: New description (optional)
            is_favorite: New favorite status (optional)

        Returns:
            API result
        """
        data = {}
        if name is not None:
            data["name"] = name
        if tags is not None:
            data["tags"] = tags
        if category is not None:
            data["category"] = category
        if description is not None:
            data["description"] = description
        if is_favorite is not None:
            data["is_favorite"] = is_favorite

        return await self._request("PATCH", f"/api/presets/{preset_id}", json=data)

    # ==================== LCD ====================

    async def get_lcd_status(self) -> APIResult:
        """Get LCD system status."""
        return await self._request("GET", "/api/lcd/status")

    async def set_lcd_page(self, page: str) -> APIResult:
        """Set the current LCD page."""
        return await self._request("POST", "/api/lcd/page", json={"page": page})

    async def get_lcd_simulation(self) -> APIResult:
        """Get ASCII simulation of current LCD display."""
        return await self._request("GET", "/api/lcd/simulation")

    async def send_lcd_input(self, action: str) -> APIResult:
        """Send an input action to the LCD."""
        return await self._request("POST", f"/api/lcd/input/{action}")

    async def get_lcd_pages(self) -> APIResult:
        """Get list of available LCD pages."""
        return await self._request("GET", "/api/lcd/pages")

    # ==================== MAINTENANCE ====================

    async def restart_backend(self) -> APIResult:
        """Restart the backend service."""
        return await self._request("POST", "/api/system/restart-backend")

    async def restart_system(self) -> APIResult:
        """Restart the entire system."""
        return await self._request("POST", "/api/system/restart")

    async def get_realtime_status(self) -> APIResult:
        """Get real-time audio system configuration status."""
        return await self._request("GET", "/api/system/realtime-status")

    async def get_branding_status(self) -> APIResult:
        """Get branding installation status."""
        return await self._request("GET", "/api/system/branding-status")

    async def reinstall_branding(self) -> APIResult:
        """Reinstall boot splash and welcome message."""
        return await self._request("POST", "/api/system/reinstall-branding")

    # ==================== USB AUDIO DEVICES ====================

    async def get_usb_devices(self) -> APIResult:
        """Get USB audio device status."""
        return await self._request("GET", "/api/usb/devices")

    async def get_hotone_supported(self) -> APIResult:
        """Get list of supported Hotone devices."""
        return await self._request("GET", "/api/usb/hotone/supported")

    async def get_hotone_primary(self) -> APIResult:
        """Get primary Hotone device status."""
        return await self._request("GET", "/api/usb/hotone/primary")

    async def disable_hotone_autosuspend(self) -> APIResult:
        """Disable USB autosuspend for all Hotone devices."""
        return await self._request("POST", "/api/usb/hotone/disable-autosuspend")

    async def get_udev_rules(self) -> APIResult:
        """Get udev rules for Hotone devices."""
        return await self._request("GET", "/api/usb/udev-rules")

    async def install_udev_rules(self) -> APIResult:
        """Install udev rules for Hotone devices (requires root)."""
        return await self._request("POST", "/api/usb/udev-rules/install")

    async def get_alsa_config(self) -> APIResult:
        """Get optimized ALSA configuration for Hotone devices."""
        return await self._request("GET", "/api/usb/alsa-config")

    async def get_usb_diagnostics(self) -> APIResult:
        """Get comprehensive USB audio diagnostics."""
        return await self._request("GET", "/api/usb/diagnostics")

    # ==================== BACKUP ====================

    async def list_backups(self) -> APIResult:
        """List all available backups."""
        return await self._request("GET", "/api/backup/")

    async def get_backup_status(self) -> APIResult:
        """Get overall backup status and statistics."""
        return await self._request("GET", "/api/backup/status")

    async def create_backup(self, description: str = "") -> APIResult:
        """
        Create a new backup.

        Args:
            description: Optional description for the backup
        """
        return await self._request("POST", "/api/backup/create", json={"description": description})

    async def get_backup(self, backup_id: str) -> APIResult:
        """Get details about a specific backup."""
        return await self._request("GET", f"/api/backup/{backup_id}")

    async def restore_backup(
        self,
        backup_id: str,
        restore_database: bool = True,
        restore_user_data: bool = True,
        restore_config: bool = True
    ) -> APIResult:
        """
        Restore from a backup.

        Args:
            backup_id: ID of the backup to restore
            restore_database: Whether to restore the database
            restore_user_data: Whether to restore user data directories
            restore_config: Whether to restore config files
        """
        return await self._request(
            "POST",
            f"/api/backup/{backup_id}/restore",
            json={
                "restore_database": restore_database,
                "restore_user_data": restore_user_data,
                "restore_config": restore_config
            }
        )

    async def delete_backup(self, backup_id: str) -> APIResult:
        """Delete a backup."""
        return await self._request("DELETE", f"/api/backup/{backup_id}")

    async def get_backup_settings(self) -> APIResult:
        """Get current backup settings."""
        return await self._request("GET", "/api/backup/settings/current")

    async def update_backup_settings(
        self,
        max_backups: Optional[int] = None,
        retention_days: Optional[int] = None,
        auto_cleanup: Optional[bool] = None
    ) -> APIResult:
        """
        Update backup settings.

        Args:
            max_backups: Maximum number of backups to keep
            retention_days: Days to retain backups
            auto_cleanup: Enable automatic cleanup
        """
        data = {}
        if max_backups is not None:
            data["max_backups"] = max_backups
        if retention_days is not None:
            data["retention_days"] = retention_days
        if auto_cleanup is not None:
            data["auto_cleanup"] = auto_cleanup
        return await self._request("PUT", "/api/backup/settings/current", json=data)

    async def cleanup_backups(self) -> APIResult:
        """Manually trigger backup cleanup."""
        return await self._request("POST", "/api/backup/cleanup")

    async def get_backup_skip_list(self) -> APIResult:
        """Get list of items not included in backups."""
        return await self._request("GET", "/api/backup/skip-list")

    async def update_backup(self, backup_id: str) -> APIResult:
        """
        Update an existing backup with the latest reinstaller and documentation.

        Args:
            backup_id: ID of the backup to update
        """
        return await self._request("POST", f"/api/backup/{backup_id}/update")

    async def update_all_backups(self) -> APIResult:
        """Update all valid backups with the latest reinstaller and documentation."""
        return await self._request("POST", "/api/backup/update-all")

    async def generate_rebuild_script(self, output_path: Optional[str] = None) -> APIResult:
        """
        Generate a standalone rebuild script for the MAP2 Audio Platform.

        Creates a self-contained bash script that can reinstall all packages,
        build all code, and setup Python packages required to rebuild the
        system from scratch on a fresh Fedora Server installation.

        Args:
            output_path: Optional custom path to save the script

        Returns:
            APIResult with information about the generated script
        """
        data = {}
        if output_path:
            data["output_path"] = output_path
        return await self._request("POST", "/api/backup/generate-rebuild-script", json=data if data else None)

    # ==================== AUTOMATION ====================

    async def get_automation_status(self) -> APIResult:
        """Get automation playback status."""
        return await self._request("GET", "/api/automation/status")

    async def start_automation(self) -> APIResult:
        """Start automation playback."""
        return await self._request("POST", "/api/automation/start")

    async def stop_automation(self) -> APIResult:
        """Stop automation playback."""
        return await self._request("POST", "/api/automation/stop")

    async def pause_automation(self) -> APIResult:
        """Pause automation playback."""
        return await self._request("POST", "/api/automation/pause")

    async def rewind_automation(self) -> APIResult:
        """Rewind automation to start."""
        return await self._request("POST", "/api/automation/rewind")

    async def set_automation_loop(self, enabled: bool) -> APIResult:
        """Enable/disable automation loop."""
        return await self._request("POST", "/api/automation/loop", json={"enabled": enabled})

    async def list_automation_lanes(self) -> APIResult:
        """List all automation lanes."""
        return await self._request("GET", "/api/automation/lanes")

    async def create_automation_lane(self, parameter_id: str, parameter_name: str) -> APIResult:
        """Create a new automation lane for a parameter."""
        return await self._request("POST", "/api/automation/lanes", json={
            "parameter_id": parameter_id,
            "parameter_name": parameter_name
        })

    async def delete_automation_lane(self, lane_id: int) -> APIResult:
        """Delete an automation lane."""
        return await self._request("DELETE", f"/api/automation/lanes/{lane_id}")

    async def add_automation_point(self, lane_id: int, time: float,
                                    value: float, curve_type: str = "linear") -> APIResult:
        """
        Add an automation point to a lane.

        Args:
            lane_id: Lane ID
            time: Time position in seconds
            value: Normalized value (0.0-1.0)
            curve_type: Interpolation curve (linear, exponential, logarithmic, s_curve, step)
        """
        return await self._request("POST", f"/api/automation/lanes/{lane_id}/points", json={
            "time": time,
            "value": value,
            "curve_type": curve_type
        })

    async def delete_automation_point(self, lane_id: int, point_id: int) -> APIResult:
        """Delete an automation point."""
        return await self._request("DELETE", f"/api/automation/lanes/{lane_id}/points/{point_id}")

    async def clear_automation_lane(self, lane_id: int) -> APIResult:
        """Clear all points from an automation lane."""
        return await self._request("POST", f"/api/automation/lanes/{lane_id}/clear")

    async def set_lfo(self, parameter_id: str, rate_hz: float, depth: float,
                      waveform: str = "sine") -> APIResult:
        """
        Configure LFO for a parameter.

        Args:
            parameter_id: Parameter ID
            rate_hz: LFO rate in Hz (0.1-20)
            depth: Modulation depth (0.0-1.0)
            waveform: LFO waveform (sine, triangle, square, saw)
        """
        return await self._request("POST", f"/api/automation/lfo/{parameter_id}", json={
            "rate_hz": rate_hz,
            "depth": depth,
            "waveform": waveform
        })

    async def remove_lfo(self, parameter_id: str) -> APIResult:
        """Remove LFO from a parameter."""
        return await self._request("DELETE", f"/api/automation/lfo/{parameter_id}")

    async def list_lfos(self) -> APIResult:
        """List all active LFOs."""
        return await self._request("GET", "/api/automation/lfo")

    # ==================== HISTORY (UNDO/REDO) ====================

    async def get_history_status(self) -> APIResult:
        """Get undo/redo availability and next actions."""
        return await self._request("GET", "/api/history/status")

    async def get_history_list(self) -> APIResult:
        """Get full history list."""
        return await self._request("GET", "/api/history/list")

    async def undo(self) -> APIResult:
        """Undo the last action."""
        return await self._request("POST", "/api/history/undo")

    async def redo(self) -> APIResult:
        """Redo the last undone action."""
        return await self._request("POST", "/api/history/redo")

    async def clear_history(self) -> APIResult:
        """Clear all history."""
        return await self._request("POST", "/api/history/clear")

    async def create_snapshot(self, name: str = None) -> APIResult:
        """Create a named snapshot of current state."""
        data = {}
        if name:
            data["name"] = name
        return await self._request("POST", "/api/history/snapshot", json=data)

    async def restore_snapshot(self, snapshot_index: int) -> APIResult:
        """Restore to a specific snapshot."""
        return await self._request("POST", f"/api/history/snapshot/{snapshot_index}/restore")

    async def list_snapshots_history(self) -> APIResult:
        """List all snapshots."""
        return await self._request("GET", "/api/history/snapshots")

    # ==================== NETWORK CONFIGURATION ====================

    async def get_network_status(self) -> APIResult:
        """Get comprehensive network status."""
        return await self._request("GET", "/api/network/status")

    async def get_ethernet_interfaces(self) -> APIResult:
        """Get ethernet interface details."""
        return await self._request("GET", "/api/network/ethernet")

    async def get_wifi_interfaces(self) -> APIResult:
        """Get WiFi interface details."""
        return await self._request("GET", "/api/network/wifi")

    async def scan_wifi_networks(self) -> APIResult:
        """Scan for available WiFi networks."""
        return await self._request("GET", "/api/network/wifi/scan")

    async def connect_wifi(self, ssid: str, password: str = None,
                           security: str = "wpa2") -> APIResult:
        """
        Connect to a WiFi network.

        Args:
            ssid: Network SSID
            password: Network password (None for open networks)
            security: Security type (open, wep, wpa, wpa2, wpa3)
        """
        data = {"ssid": ssid, "security": security}
        if password:
            data["password"] = password
        return await self._request("POST", "/api/network/wifi/connect", json=data)

    async def disconnect_wifi(self, interface: str = "wlan0") -> APIResult:
        """Disconnect from WiFi."""
        return await self._request("POST", f"/api/network/wifi/{interface}/disconnect")

    async def get_ip_config(self, interface: str) -> APIResult:
        """Get IP configuration for an interface."""
        return await self._request("GET", f"/api/network/interfaces/{interface}/ip")

    async def set_ip_config(self, interface: str, mode: str = "dhcp",
                            ip_address: str = None, netmask: str = None,
                            gateway: str = None) -> APIResult:
        """
        Set IP configuration for an interface.

        Args:
            interface: Interface name (eth0, wlan0)
            mode: "dhcp" or "static"
            ip_address: Static IP (required if mode=static)
            netmask: Network mask (required if mode=static)
            gateway: Default gateway (optional)
        """
        data = {"mode": mode}
        if mode == "static":
            data["ip_address"] = ip_address
            data["netmask"] = netmask
            if gateway:
                data["gateway"] = gateway
        return await self._request("POST", f"/api/network/interfaces/{interface}/ip", json=data)

    async def get_dns_config(self) -> APIResult:
        """Get DNS configuration."""
        return await self._request("GET", "/api/network/dns")

    async def set_dns_servers(self, servers: List[str]) -> APIResult:
        """Set DNS servers."""
        return await self._request("POST", "/api/network/dns", json={"servers": servers})

    async def get_hostname(self) -> APIResult:
        """Get current hostname."""
        return await self._request("GET", "/api/network/hostname")

    async def set_hostname(self, hostname: str) -> APIResult:
        """Set system hostname."""
        return await self._request("POST", "/api/network/hostname", json={"hostname": hostname})

    async def get_firewall_status(self) -> APIResult:
        """Get firewall status and rules."""
        return await self._request("GET", "/api/network/firewall")

    async def set_firewall_enabled(self, enabled: bool) -> APIResult:
        """Enable or disable firewall."""
        return await self._request("POST", "/api/network/firewall", json={"enabled": enabled})

    async def ping_host(self, host: str, count: int = 4) -> APIResult:
        """Ping a host to test connectivity."""
        return await self._request("POST", "/api/network/ping", json={"host": host, "count": count})

    # ==================== WWW / WEB SERVER ====================

    async def get_www_status(self) -> APIResult:
        """Get web server status."""
        return await self._request("GET", "/api/www/status")

    async def get_www_config(self) -> APIResult:
        """Get web server configuration."""
        return await self._request("GET", "/api/www/config")

    async def set_www_config(self, port: int = None, ssl_enabled: bool = None,
                              cors_enabled: bool = None) -> APIResult:
        """Update web server configuration."""
        data = {}
        if port is not None:
            data["port"] = port
        if ssl_enabled is not None:
            data["ssl_enabled"] = ssl_enabled
        if cors_enabled is not None:
            data["cors_enabled"] = cors_enabled
        return await self._request("PUT", "/api/www/config", json=data)

    async def get_ssl_config(self) -> APIResult:
        """Get SSL/TLS configuration."""
        return await self._request("GET", "/api/www/ssl")

    async def generate_ssl_certificate(self, hostname: str = None) -> APIResult:
        """Generate a self-signed SSL certificate."""
        data = {}
        if hostname:
            data["hostname"] = hostname
        return await self._request("POST", "/api/www/ssl/generate", json=data)

    async def get_cors_config(self) -> APIResult:
        """Get CORS configuration."""
        return await self._request("GET", "/api/www/cors")

    async def set_cors_origins(self, origins: List[str]) -> APIResult:
        """Set allowed CORS origins."""
        return await self._request("PUT", "/api/www/cors", json={"origins": origins})

    async def get_api_endpoints(self) -> APIResult:
        """List all API endpoints."""
        return await self._request("GET", "/api/www/endpoints")

    async def get_access_logs(self, limit: int = 100, offset: int = 0) -> APIResult:
        """Get recent access logs."""
        return await self._request("GET", f"/api/www/logs?limit={limit}&offset={offset}")

    async def clear_access_logs(self) -> APIResult:
        """Clear access logs."""
        return await self._request("DELETE", "/api/www/logs")

    async def get_websocket_stats(self) -> APIResult:
        """Get WebSocket connection statistics."""
        return await self._request("GET", "/api/www/websocket/stats")

    async def restart_web_server(self) -> APIResult:
        """Restart the web server."""
        return await self._request("POST", "/api/www/restart")

    # ==================== MIDI DEVICE MANAGEMENT ====================

    async def list_midi_devices(self) -> APIResult:
        """List all MIDI devices (inputs and outputs)."""
        return await self._request("GET", "/api/midi/devices")

    async def get_midi_routing(self) -> APIResult:
        """Get MIDI routing configuration."""
        return await self._request("GET", "/api/midi/routing")

    async def set_midi_route(self, input_port: str, output_port: str,
                             channel: int = None, enabled: bool = True) -> APIResult:
        """
        Create or update a MIDI route.

        Args:
            input_port: Input port name
            output_port: Output port name
            channel: Specific channel (None for all)
            enabled: Whether route is active
        """
        data = {
            "input_port": input_port,
            "output_port": output_port,
            "enabled": enabled
        }
        if channel is not None:
            data["channel"] = channel
        return await self._request("POST", "/api/midi/routing", json=data)

    async def delete_midi_route(self, route_id: int) -> APIResult:
        """Delete a MIDI route."""
        return await self._request("DELETE", f"/api/midi/routing/{route_id}")

    async def get_midi_filters(self) -> APIResult:
        """Get MIDI filter configuration."""
        return await self._request("GET", "/api/midi/filters")

    async def set_midi_filters(self, filters: Dict[str, bool]) -> APIResult:
        """
        Set MIDI message type filters.

        Args:
            filters: Dict with message types as keys, enabled state as values
                     e.g., {"note_on": True, "note_off": True, "cc": True, "sysex": False}
        """
        return await self._request("PUT", "/api/midi/filters", json=filters)

    async def get_midi_monitor(self, limit: int = 50) -> APIResult:
        """Get recent MIDI messages (monitor mode)."""
        return await self._request("GET", f"/api/midi/monitor?limit={limit}")

    async def clear_midi_monitor(self) -> APIResult:
        """Clear MIDI monitor message buffer."""
        return await self._request("POST", "/api/midi/monitor/clear")

    async def get_midi_clock_config(self) -> APIResult:
        """Get MIDI clock configuration."""
        return await self._request("GET", "/api/midi/clock")

    async def set_midi_clock_config(self, mode: str = "internal", bpm: float = 120,
                                     send_clock: bool = True, receive_clock: bool = True) -> APIResult:
        """
        Configure MIDI clock.

        Args:
            mode: "internal" or "external"
            bpm: Tempo in BPM (for internal mode)
            send_clock: Send MIDI clock messages
            receive_clock: Receive/sync to external clock
        """
        return await self._request("PUT", "/api/midi/clock", json={
            "mode": mode,
            "bpm": bpm,
            "send_clock": send_clock,
            "receive_clock": receive_clock
        })

    async def start_midi_clock(self) -> APIResult:
        """Start MIDI clock."""
        return await self._request("POST", "/api/midi/clock/start")

    async def stop_midi_clock(self) -> APIResult:
        """Stop MIDI clock."""
        return await self._request("POST", "/api/midi/clock/stop")

    async def save_midi_preset(self, name: str) -> APIResult:
        """Save current MIDI configuration as a preset."""
        return await self._request("POST", "/api/midi/presets", json={"name": name})

    async def load_midi_preset(self, preset_id: int) -> APIResult:
        """Load a MIDI preset."""
        return await self._request("POST", f"/api/midi/presets/{preset_id}/load")

    async def list_midi_presets(self) -> APIResult:
        """List MIDI presets."""
        return await self._request("GET", "/api/midi/presets")

    async def delete_midi_preset(self, preset_id: int) -> APIResult:
        """Delete a MIDI preset."""
        return await self._request("DELETE", f"/api/midi/presets/{preset_id}")

    # ==================== MIDI v2 API (Enhanced Features) ====================

    async def list_midi_mappings_v2(self, chain_id: int = None, plugin_uri: str = None) -> APIResult:
        """
        List CC mappings with enhanced v2 features.

        Args:
            chain_id: Filter by chain (per-chain scope)
            plugin_uri: Filter by plugin

        Returns:
            APIResult with mappings including curve_type, min_val, max_val, etc.
        """
        params = {}
        if chain_id:
            params["chain_id"] = chain_id
        if plugin_uri:
            params["plugin_uri"] = plugin_uri
        return await self._request("GET", "/api/v2/midi/mappings", params=params)

    async def create_midi_mapping_v2(
        self,
        channel: int,
        cc: int,
        chain_id: int,
        target_plugin_uri: str,
        target_param_index: int,
        target_param_symbol: str = "",
        min_val: float = 0.0,
        max_val: float = 1.0,
        curve_type: str = "linear",
        invert: bool = False,
        feedback_enabled: bool = True,
        name: str = ""
    ) -> APIResult:
        """
        Create CC mapping with enhanced v2 features.

        Args:
            channel: MIDI channel (0=omni, 1-16=specific)
            cc: CC number (0-127)
            chain_id: Chain ID for per-chain scope
            target_plugin_uri: Target plugin URI
            target_param_index: Target parameter index
            target_param_symbol: Target parameter symbol (optional)
            min_val: Minimum output value
            max_val: Maximum output value
            curve_type: Curve type (linear, logarithmic, exponential, s_curve)
            invert: Invert mapping
            feedback_enabled: Send value back to controller
            name: User-friendly name

        Returns:
            APIResult with created mapping ID
        """
        return await self._request("POST", "/api/v2/midi/mappings", json={
            "channel": channel,
            "cc": cc,
            "chain_id": chain_id,
            "target_plugin_uri": target_plugin_uri,
            "target_param_index": target_param_index,
            "target_param_symbol": target_param_symbol,
            "min_val": min_val,
            "max_val": max_val,
            "curve_type": curve_type,
            "invert": invert,
            "feedback_enabled": feedback_enabled,
            "name": name,
        })

    async def update_midi_mapping_v2(self, mapping_id: int, **updates) -> APIResult:
        """
        Update a MIDI mapping.

        Args:
            mapping_id: Mapping ID
            **updates: Fields to update (min_val, max_val, curve_type, etc.)

        Returns:
            APIResult with update status
        """
        return await self._request("PATCH", f"/api/v2/midi/mappings/{mapping_id}", json=updates)

    async def delete_midi_mapping_v2(self, mapping_id: int) -> APIResult:
        """Delete a MIDI mapping by ID."""
        return await self._request("DELETE", f"/api/v2/midi/mappings/{mapping_id}")

    async def list_midi_commands(self) -> APIResult:
        """
        List chain switching commands (Program Change mappings).

        Returns:
            APIResult with list of chain→PC mappings
        """
        return await self._request("GET", "/api/v2/midi/commands")

    async def create_midi_command(
        self,
        chain_id: int,
        program_number: int,
        bank_msb: int = 0,
        bank_lsb: int = 0,
        send_pc_on_activate: bool = True
    ) -> APIResult:
        """
        Create chain switching command via Program Change.

        Args:
            chain_id: Chain to activate
            program_number: Program Change number (0-127)
            bank_msb: Bank Select MSB (CC#0)
            bank_lsb: Bank Select LSB (CC#32)
            send_pc_on_activate: Send PC back when chain activates programmatically

        Returns:
            APIResult with created command ID
        """
        return await self._request("POST", "/api/v2/midi/commands", json={
            "chain_id": chain_id,
            "program_number": program_number,
            "bank_msb": bank_msb,
            "bank_lsb": bank_lsb,
            "send_pc_on_activate": send_pc_on_activate,
        })

    async def delete_midi_command(self, command_id: int) -> APIResult:
        """Delete a chain switching command."""
        return await self._request("DELETE", f"/api/v2/midi/commands/{command_id}")

    async def get_midi_activity(self, limit: int = 50) -> APIResult:
        """
        Get recent MIDI activity for real-time monitoring.

        Args:
            limit: Maximum number of messages to return

        Returns:
            APIResult with recent MIDI messages (CC, notes, PC, etc.)
        """
        return await self._request("GET", f"/api/v2/midi/activity?limit={limit}")

    async def save_midi_preset_v2(self, name: str, include_mappings: bool = True,
                                   include_commands: bool = True) -> APIResult:
        """
        Save complete MIDI configuration as preset.

        Args:
            name: Preset name
            include_mappings: Include CC mappings
            include_commands: Include chain switching commands

        Returns:
            APIResult with preset ID
        """
        return await self._request("POST", "/api/v2/midi/presets", json={
            "name": name,
            "include_mappings": include_mappings,
            "include_commands": include_commands,
        })

    async def load_midi_preset_v2(self, preset_id: int) -> APIResult:
        """Load a complete MIDI preset."""
        return await self._request("POST", f"/api/v2/midi/presets/{preset_id}/load")

    # ==================== FAVORITES ====================

    async def get_favorites(self, category: str = None) -> APIResult:
        """
        Get user favorites.

        Args:
            category: Filter by category (plugins, presets, sessions, chains)
        """
        params = {}
        if category:
            params["category"] = category
        return await self._request("GET", "/api/favorites", params=params)

    async def add_favorite(self, category: str, item_id: str, name: str = None) -> APIResult:
        """Add an item to favorites."""
        data = {"category": category, "item_id": item_id}
        if name:
            data["name"] = name
        return await self._request("POST", "/api/favorites", json=data)

    async def remove_favorite(self, category: str, item_id: str) -> APIResult:
        """Remove an item from favorites."""
        return await self._request("DELETE", f"/api/favorites/{category}/{item_id}")

    async def toggle_favorite(self, category: str, item_id: str) -> APIResult:
        """Toggle favorite status for an item."""
        return await self._request("POST", f"/api/favorites/{category}/{item_id}/toggle")

    # ==================== A/B MODE ====================

    async def get_ab_mode_status(self) -> APIResult:
        """Get A/B mode status."""
        return await self._request("GET", "/api/chains/ab-mode/status")

    async def enable_ab_mode(self, chain_a_id: int, chain_b_id: int) -> APIResult:
        """Enable A/B comparison mode."""
        return await self._request("POST", "/api/chains/ab-mode/enable", json={
            "chain_a_id": chain_a_id,
            "chain_b_id": chain_b_id
        })

    async def disable_ab_mode(self) -> APIResult:
        """Disable A/B mode."""
        return await self._request("POST", "/api/chains/ab-mode/disable")

    async def set_ab_blend(self, blend: float) -> APIResult:
        """
        Set A/B blend position.

        Args:
            blend: Blend value (0=100% A, 50=50/50, 100=100% B)
        """
        return await self._request("POST", "/api/chains/ab-mode/blend", json={"blend": blend})

    async def swap_ab_chains(self) -> APIResult:
        """Swap A and B chains."""
        return await self._request("POST", "/api/chains/ab-mode/swap")

    async def duplicate_chain_for_ab(self, source_chain_id: int, new_name: str) -> APIResult:
        """Duplicate a chain for A/B comparison."""
        return await self._request("POST", f"/api/chains/{source_chain_id}/duplicate", json={
            "name": new_name,
            "include_settings": True
        })

    # ==================== HEALTH MONITORING ====================

    async def get_health_dashboard(self) -> APIResult:
        """
        Get comprehensive health dashboard data.

        Returns combined data for all services, alerts, and metrics
        in a single request for efficient dashboard rendering.
        """
        return await self._request("GET", "/api/health-monitor/dashboard")

    async def get_health_status(self) -> APIResult:
        """
        Get overall system health status summary.

        Returns:
            Health summary with overall status, uptime, and service counts.
        """
        return await self._request("GET", "/api/health-monitor/status")

    async def get_health_overall(self) -> APIResult:
        """
        Get quick overall health status.

        Lightweight endpoint for status indicators.
        """
        return await self._request("GET", "/api/health-monitor/overall")

    async def get_monitored_services(self) -> APIResult:
        """
        Get list of all monitored services with their current status.

        Returns:
            List of services with health metrics.
        """
        return await self._request("GET", "/api/health-monitor/services")

    async def get_service_details(self, service_name: str) -> APIResult:
        """
        Get detailed information for a specific service.

        Args:
            service_name: Name of the service (e.g., 'database', 'juce_engine')

        Returns:
            Detailed service metrics including history.
        """
        return await self._request("GET", f"/api/health-monitor/services/{service_name}")

    async def get_service_history(self, service_name: str, hours: int = 24) -> APIResult:
        """
        Get historical metrics for a service.

        Args:
            service_name: Name of the service
            hours: Number of hours of history to retrieve (default: 24)

        Returns:
            Time-series health data for the service.
        """
        return await self._request(
            "GET",
            f"/api/health-monitor/services/{service_name}/history",
            params={"hours": hours}
        )

    async def get_active_alerts(self, service_name: Optional[str] = None) -> APIResult:
        """
        Get currently active alerts.

        Args:
            service_name: Optional filter by service name

        Returns:
            List of active alerts with severity and details.
        """
        params = {}
        if service_name:
            params["service"] = service_name
        return await self._request("GET", "/api/health-monitor/alerts", params=params)

    async def get_alert_history(
        self,
        severity: Optional[str] = None,
        limit: int = 100
    ) -> APIResult:
        """
        Get alert history.

        Args:
            severity: Filter by severity (CRITICAL, WARNING, INFO)
            limit: Maximum number of alerts to return

        Returns:
            Historical alert records.
        """
        params = {"limit": limit}
        if severity:
            params["severity"] = severity
        return await self._request("GET", "/api/health-monitor/alerts/history", params=params)

    async def get_service_dependencies(self) -> APIResult:
        """
        Get service dependency graph.

        Returns:
            Dependency relationships between services.
        """
        return await self._request("GET", "/api/health-monitor/dependencies")

    async def get_health_stats(self) -> APIResult:
        """
        Get comprehensive health statistics.

        Returns:
            Aggregated statistics across all services.
        """
        return await self._request("GET", "/api/health-monitor/stats")

    # ==================== SYSTEM METRICS ====================

    async def get_current_metrics(self) -> APIResult:
        """
        Get current system metrics snapshot.

        Returns:
            CPU, memory, disk, and audio metrics.
        """
        return await self._request("GET", "/api/metrics/current")

    async def get_cpu_history(self, limit: int = 60) -> APIResult:
        """
        Get CPU usage history.

        Args:
            limit: Number of data points to return

        Returns:
            Time-series CPU usage data.
        """
        return await self._request("GET", "/api/metrics/cpu", params={"limit": limit})

    async def get_memory_history(self, limit: int = 60) -> APIResult:
        """
        Get memory usage history.

        Args:
            limit: Number of data points to return

        Returns:
            Time-series memory usage data.
        """
        return await self._request("GET", "/api/metrics/memory", params={"limit": limit})

    async def get_latency_history(self, limit: int = 60) -> APIResult:
        """
        Get audio latency history.

        Args:
            limit: Number of data points to return

        Returns:
            Time-series latency data.
        """
        return await self._request("GET", "/api/metrics/latency", params={"limit": limit})

    async def get_jack_metrics(self) -> APIResult:
        """
        Get JACK audio server metrics.

        Returns:
            JACK server status and metrics.
        """
        return await self._request("GET", "/api/metrics/jack")

    async def get_jack_latency(self) -> APIResult:
        """
        Get JACK latency metrics.

        Returns:
            Latency in frames and milliseconds.
        """
        return await self._request("GET", "/api/metrics/jack/latency")

    async def get_metrics_prometheus(self) -> APIResult:
        """
        Get metrics in Prometheus format.

        Returns:
            Prometheus-formatted metrics text.
        """
        return await self._request("GET", "/api/metrics/prometheus")

    # ==================== SYSTEM LOGS ====================

    async def get_system_logs(
        self,
        level: Optional[str] = None,
        service: Optional[str] = None,
        limit: int = 100
    ) -> APIResult:
        """
        Get system logs.

        Args:
            level: Filter by log level (error, warn, info, debug)
            service: Filter by service name
            limit: Maximum number of log entries

        Returns:
            List of log entries.
        """
        params = {"limit": limit}
        if level:
            params["level"] = level
        if service:
            params["service"] = service
        return await self._request("GET", "/api/system/logs", params=params)

    async def close(self) -> None:
        """Close the API client and cleanup resources."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global singleton instance (will be initialized in app.py)
api_client: Optional[MAP2APIClient] = None


def get_api_client() -> MAP2APIClient:
    """Get global API client instance."""
    global api_client
    if api_client is None:
        api_client = MAP2APIClient()
    return api_client
