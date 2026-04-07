"""
TesiraFleet — manages up to 5 Biamp Tesira Forte AVB units simultaneously.

Responsibilities:
  - Connect/reconnect each configured TesiraDevice
  - Register Tesira AVB streams as endpoints in the existing AvbRouter
  - Start TTP push-based metering subscriptions
  - Poll PTP status and broadcast tesira:ptp WebSocket events
  - Broadcast tesira:meters, tesira:device_state, tesira:preset_change topics

Configuration is read from app/config.py: tesira.devices (list of dicts).
Each dict: {host, port=23, name='', metering_tags=[], enabled=true}
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MAX_DEVICES = 5


@dataclass
class TesiraDeviceConfig:
    host: str
    port: int = 23
    name: str = ''
    enabled: bool = True
    metering_tags: List[str] = field(default_factory=list)
    metering_interval_ms: int = 100
    transport: str = "auto"
    ssh_enabled: bool = True
    ssh_port: int = 22
    ssh_username: str = "default"
    ssh_password: str = field(default="default", repr=False)


class TesiraFleet:
    """
    Singleton fleet manager for up to 5 Tesira Forte AVB units.

    Call start() once from the FastAPI lifespan context.
    """

    def __init__(self) -> None:
        from app.services.tesira.tesira_device import TesiraDevice
        self._devices: Dict[str, "TesiraDevice"] = {}     # device_id → TesiraDevice
        self._configs: List[TesiraDeviceConfig] = []
        self._ptp_poll_task: Optional[asyncio.Task] = None
        self._offline_retry_task: Optional[asyncio.Task] = None
        self._preset_poll_task: Optional[asyncio.Task] = None
        self._stopping = False
        self._preset_interlock: Optional[Any] = None
        self._last_seen_presets: Dict[str, int] = {}
        self._offline_retry_failures: Dict[str, int] = {}
        self._offline_next_retry_at: Dict[str, float] = {}
        self._reverse_preset_sync = True
        self._meter_broadcast_tasks: set[asyncio.Task] = set()
        self.MAX_PENDING_METER_BROADCASTS = 64

    # Seconds between reconnect attempts for offline devices
    OFFLINE_RETRY_INTERVAL = 30
    OFFLINE_RETRY_MAX_INTERVAL = 300
    PRESET_POLL_INTERVAL = 2
    TASK_CANCEL_TIMEOUT_SECONDS = 2.0
    DEVICE_DISCONNECT_TIMEOUT_SECONDS = 1.0

    # ──────────────────────────────────────────────────────────────────────────
    # Lifecycle
    # ──────────────────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Load config, connect all devices, start background tasks."""
        self._stopping = False
        self._offline_retry_failures.clear()
        self._offline_next_retry_at.clear()
        self._load_config()

        if not self._configs:
            logger.info("TesiraFleet: no devices configured, skipping")
            return

        # Connect each device concurrently
        tasks = [self._connect_device(cfg) for cfg in self._configs[:MAX_DEVICES]]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Start PTP poll loop
        self._ptp_poll_task = asyncio.create_task(
            self._ptp_poll_loop(), name="tesira_ptp_poll"
        )
        # Start offline retry loop — probes port 61451 + retries TTP for offline devices
        self._offline_retry_task = asyncio.create_task(
            self._offline_retry_loop(), name="tesira_offline_retry"
        )
        self._preset_poll_task = asyncio.create_task(
            self._preset_poll_loop(), name="tesira_preset_poll"
        )
        logger.info(
            "TesiraFleet started: %d/%d devices connected",
            sum(1 for d in self._devices.values() if d.connected),
            len(self._configs),
        )

    async def stop(self) -> None:
        """Disconnect all devices and cancel background tasks."""
        self._stopping = True
        for task in (self._ptp_poll_task, self._offline_retry_task, self._preset_poll_task):
            if task and not task.done():
                task.cancel()
                try:
                    await asyncio.wait_for(task, timeout=self.TASK_CANCEL_TIMEOUT_SECONDS)
                except asyncio.TimeoutError:
                    logger.warning(
                        "TesiraFleet task %s did not stop within %.1fs",
                        task.get_name(),
                        self.TASK_CANCEL_TIMEOUT_SECONDS,
                    )
                except (asyncio.CancelledError, Exception):
                    pass

        for task in list(self._meter_broadcast_tasks):
            if task.done():
                self._meter_broadcast_tasks.discard(task)
                continue
            task.cancel()
            try:
                await asyncio.wait_for(task, timeout=self.TASK_CANCEL_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                logger.warning(
                    "TesiraFleet meter broadcast task %s did not stop within %.1fs",
                    task.get_name(),
                    self.TASK_CANCEL_TIMEOUT_SECONDS,
                )
            except (asyncio.CancelledError, Exception):
                pass
        self._meter_broadcast_tasks.clear()

        for device in list(self._devices.values()):
            try:
                await asyncio.wait_for(
                    device.disconnect(),
                    timeout=self.DEVICE_DISCONNECT_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "TesiraFleet disconnect timed out for %s after %.1fs",
                    device.device_id,
                    self.DEVICE_DISCONNECT_TIMEOUT_SECONDS,
                )
            except Exception as exc:
                logger.warning("Disconnect error for %s: %s", device.device_id, exc)

        self._devices.clear()
        self._offline_retry_failures.clear()
        self._offline_next_retry_at.clear()
        logger.info("TesiraFleet stopped")

    # ──────────────────────────────────────────────────────────────────────────
    # Device access
    # ──────────────────────────────────────────────────────────────────────────

    def get_device(self, device_id: str) -> Optional[Any]:
        """Return a TesiraDevice by device_id, or None."""
        return self._devices.get(device_id)

    def list_devices(self) -> List[Dict[str, Any]]:
        """Return summary dicts for all managed devices."""
        result = []
        for device in self._devices.values():
            result.append({
                'device_id': device.device_id,
                'host': device.host,
                'port': device.port,
                'name': device.name,
                'connected': device.connected,
                'transport': device.transport,
                'transport_port': device.transport_port,
                'serial_number': device.info.serial_number if device.info else None,
                'firmware_version': device.info.firmware_version if device.info else None,
                'fault_count': 0,           # Populated lazily on request
                'avb_stream_count': 0,      # Populated lazily on request
                'ptp_state': None,
            })
        # Also include configured-but-not-yet-connected devices
        connected_hosts = {d.host for d in self._devices.values()}
        for cfg in self._configs:
            if cfg.host not in connected_hosts:
                result.append({
                    'device_id': f"tesira_{cfg.host.replace('.', '_')}",
                    'host': cfg.host,
                    'port': cfg.port,
                    'name': cfg.name or cfg.host,
                    'connected': False,
                    'transport': cfg.transport if cfg.transport != "auto" else "unknown",
                    'transport_port': cfg.port if cfg.transport in ("telnet", "auto") else cfg.ssh_port,
                    'serial_number': None,
                    'firmware_version': None,
                    'fault_count': 0,
                    'avb_stream_count': 0,
                    'ptp_state': None,
                })
        return result

    def is_healthy(self) -> bool:
        """Return True if at least one device is connected."""
        return any(d.connected for d in self._devices.values())

    def set_preset_interlock(self, interlock: Any) -> None:
        """Attach preset interlock service for reverse-sync detection callbacks."""
        self._preset_interlock = interlock

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: connect a single device
    # ──────────────────────────────────────────────────────────────────────────

    async def _connect_device(self, cfg: TesiraDeviceConfig) -> None:
        from app.services.tesira.tesira_device import TesiraDevice
        device = TesiraDevice(
            host=cfg.host,
            port=cfg.port,
            name=cfg.name,
            transport=cfg.transport,
            ssh_enabled=cfg.ssh_enabled,
            ssh_port=cfg.ssh_port,
            ssh_username=cfg.ssh_username,
            ssh_password=cfg.ssh_password,
        )
        device.on_push(self._on_meter_push)
        try:
            await device.connect()
        except Exception as exc:
            logger.error(
                "TesiraFleet: could not connect to %s:%d: %s", cfg.host, cfg.port, exc
            )
            # Still register the device so the API can show it as offline
            self._devices[device.device_id] = device
            self._record_offline_retry_failure(device.device_id)
            await self._broadcast_device_state(device.device_id, 'disconnected', str(exc))
            return

        self._devices[device.device_id] = device
        self._clear_offline_retry_backoff(device.device_id)
        await self._broadcast_device_state(device.device_id, 'connected')
        try:
            active = await device.get_active_preset()
            if active is not None:
                self._last_seen_presets[device.device_id] = active
        except Exception:
            pass

        # Register AVB streams as AvbRouter endpoints
        await self._register_endpoints(device)

        # Start metering subscriptions for configured tags
        for tag in cfg.metering_tags:
            try:
                await device.start_metering(tag, cfg.metering_interval_ms)
            except Exception as exc:
                logger.warning("TesiraFleet: metering start failed for %s/%s: %s", device.device_id, tag, exc)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: AVB endpoint registration
    # ──────────────────────────────────────────────────────────────────────────

    async def _register_endpoints(self, device: Any) -> None:
        """Register Tesira AVB streams as endpoints in the AvbRouter."""
        try:
            from app.services.avb import get_avb_router
            router = get_avb_router()
            if router is None:
                logger.debug("AvbRouter not available; skipping Tesira endpoint registration")
                return
            streams = await device.get_avb_streams()
            if not streams:
                logger.debug("TesiraFleet: no AVB streams found on %s", device.device_id)
                return
            from app.services.avb.avb_router import register_tesira_endpoint
            for stream in streams:
                register_tesira_endpoint(router, device.device_id, stream)
            logger.info(
                "TesiraFleet: registered %d AVB endpoints for %s",
                len(streams), device.device_id,
            )
        except ImportError:
            logger.debug("AvbRouter not importable; Tesira endpoints not registered")
        except Exception as exc:
            logger.warning("TesiraFleet: endpoint registration error for %s: %s", device.device_id, exc)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: metering push handler
    # ──────────────────────────────────────────────────────────────────────────

    def _on_meter_push(
        self,
        device_id: str,
        instance_tag: str,
        attribute: str,
        value: Any,
    ) -> None:
        """Called from TTPClient read loop when a subscription push arrives."""
        if attribute != 'level':
            return
        levels: list[float] = []
        if isinstance(value, list):
            levels = [float(v) for v in value]
        elif value is not None:
            try:
                levels = [float(value)]
            except (TypeError, ValueError):
                return

        payload = {
            'device_id': device_id,
            'instance_tag': instance_tag,
            'levels_dbu': levels,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        try:
            from app.services.tesira import get_tesira_metrics_store
            get_tesira_metrics_store().push(device_id, instance_tag, levels)
        except Exception:
            # Meter history should never block live websocket updates.
            pass
        # Keep meter push fanout bounded so a slow websocket path does not
        # accumulate unbounded background tasks under sustained metering load.
        self._schedule_meter_broadcast(payload)

    def _schedule_meter_broadcast(self, payload: Dict[str, Any]) -> None:
        self._meter_broadcast_tasks = {
            task for task in self._meter_broadcast_tasks if not task.done()
        }
        if len(self._meter_broadcast_tasks) >= int(self.MAX_PENDING_METER_BROADCASTS):
            logger.debug(
                "TesiraFleet dropping meter broadcast for %s/%s because %d broadcasts are already pending",
                payload.get("device_id"),
                payload.get("instance_tag"),
                len(self._meter_broadcast_tasks),
            )
            return
        task = asyncio.create_task(
            self._broadcast("tesira:meters", payload),
            name="tesira_meter_broadcast",
        )
        self._meter_broadcast_tasks.add(task)
        task.add_done_callback(self._meter_broadcast_tasks.discard)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: Offline device retry loop
    # ──────────────────────────────────────────────────────────────────────────

    async def _offline_retry_loop(self) -> None:
        """
        Every OFFLINE_RETRY_INTERVAL seconds, retry TTP connection for any
        device that is currently offline.  Before each TTP attempt, fire a
        best-effort port-61451 probe (experimental: may enable Telnet on some
        firmware versions).

        When a device connects, the normal _broadcast_device_state('connected')
        call handles UI notification.  While still offline we broadcast a
        'reconnecting' event so the frontend can show status.
        """
        from app.services.tesira.port61451_probe import probe_and_enable_ttp

        await asyncio.sleep(self.OFFLINE_RETRY_INTERVAL)   # initial delay

        while not self._stopping:
            now = time.monotonic()
            due_devices = []
            next_sleep = float(self.OFFLINE_RETRY_INTERVAL)

            for device_id, device in list(self._devices.items()):
                if device.connected:
                    self._clear_offline_retry_backoff(device_id)
                    continue
                due_in = self._offline_retry_due_in(device_id, now=now)
                if due_in <= 0:
                    due_devices.append((device_id, device))
                else:
                    next_sleep = min(next_sleep, due_in)

            if due_devices:
                logger.debug(
                    "TesiraFleet offline retry: %d device(s) due", len(due_devices)
                )
                results = await asyncio.gather(
                    *(
                        self._retry_offline_device(
                            device_id,
                            device,
                            probe_and_enable_ttp,
                        )
                        for device_id, device in due_devices
                    ),
                    return_exceptions=True,
                )
                for (device_id, _), result in zip(due_devices, results):
                    if isinstance(result, Exception):
                        logger.debug(
                            "TesiraFleet[%s]: offline retry task failed: %s",
                            device_id,
                            result,
                        )
                continue

            await asyncio.sleep(max(1.0, next_sleep))

    async def _retry_offline_device(
        self,
        device_id: str,
        device: Any,
        probe_and_enable_ttp,
    ) -> None:
        if self._stopping:
            return

        host = device.host

        # 1. Experimental: probe port 61451 to try to enable Telnet
        try:
            probe = await probe_and_enable_ttp(host)
            if probe.ttp_now_open:
                logger.info(
                    "TesiraFleet[%s]: port 23 now open after port-61451 probe", host
                )
            if probe.ssh_open:
                logger.info(
                    "TesiraFleet[%s]: SSH (port 22) is open — consider SSH TTP", host
                )
        except Exception as exc:
            logger.debug("TesiraFleet[%s]: port-61451 probe error: %s", host, exc)

        cfg = next((c for c in self._configs if c.host == host), None)
        if cfg is None:
            return

        try:
            await device.connect()
            if device.connected:
                logger.info("TesiraFleet[%s]: reconnected after offline retry", host)
                self._clear_offline_retry_backoff(device_id)
                await self._broadcast_device_state(device_id, 'connected')
                await self._register_endpoints(device)
                try:
                    active = await device.get_active_preset()
                    if active is not None:
                        self._last_seen_presets[device.device_id] = active
                except Exception:
                    pass
                return
        except Exception as exc:
            logger.debug("TesiraFleet[%s]: retry connect failed: %s", host, exc)

        next_retry_s = self._record_offline_retry_failure(device_id)
        await self._broadcast('tesira:device_state', {
            'device_id': device_id,
            'event': 'reconnecting',
            'next_retry_s': int(next_retry_s),
            'detail': f"TTP port 23 unreachable; retrying in {int(next_retry_s)}s",
            'timestamp': datetime.now(timezone.utc).isoformat(),
        })

    def _record_offline_retry_failure(self, device_id: str) -> float:
        failures = self._offline_retry_failures.get(device_id, 0) + 1
        self._offline_retry_failures[device_id] = failures
        delay = min(
            float(self.OFFLINE_RETRY_INTERVAL * (2 ** (failures - 1))),
            float(self.OFFLINE_RETRY_MAX_INTERVAL),
        )
        self._offline_next_retry_at[device_id] = time.monotonic() + delay
        return delay

    def _clear_offline_retry_backoff(self, device_id: str) -> None:
        self._offline_retry_failures.pop(device_id, None)
        self._offline_next_retry_at.pop(device_id, None)

    def _offline_retry_due_in(self, device_id: str, *, now: Optional[float] = None) -> float:
        current = time.monotonic() if now is None else now
        next_retry_at = self._offline_next_retry_at.get(device_id, current)
        return max(0.0, next_retry_at - current)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: PTP poll loop
    # ──────────────────────────────────────────────────────────────────────────

    async def _ptp_poll_loop(self) -> None:
        """Poll every device for PTP status and broadcast tesira:ptp events."""
        while not self._stopping:
            await asyncio.sleep(1.0)
            for device in list(self._devices.values()):
                if not device.connected:
                    continue
                try:
                    ptp = await device.get_ptp_status()
                    payload = {
                        'device_id': device.device_id,
                        **ptp,
                        'timestamp': datetime.now(timezone.utc).isoformat(),
                    }
                    await self._broadcast('tesira:ptp', payload)
                except Exception as exc:
                    logger.debug("PTP poll error for %s: %s", device.device_id, exc)

    async def _preset_poll_loop(self) -> None:
        """Poll active presets and broadcast reverse-sync events on device-side changes."""
        while not self._stopping:
            await asyncio.sleep(float(self.PRESET_POLL_INTERVAL))
            if not self._reverse_preset_sync:
                continue
            for device in list(self._devices.values()):
                if not device.connected:
                    continue
                try:
                    active = await device.get_active_preset()
                    if active is None:
                        continue
                    previous = self._last_seen_presets.get(device.device_id)
                    self._last_seen_presets[device.device_id] = active
                    if previous is None or previous == active:
                        continue
                    payload = {
                        "device_id": device.device_id,
                        "preset_index": active,
                        "previous_preset_index": previous,
                        "source": "device",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    await self._broadcast("tesira:preset_change", payload)
                    if self._preset_interlock is not None:
                        await self._preset_interlock.on_tesira_preset_changed(device.device_id, active)
                except Exception as exc:
                    logger.debug("Preset poll error for %s: %s", device.device_id, exc)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: WebSocket helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _broadcast(self, topic: str, data: Dict[str, Any]) -> None:
        """Broadcast a message on a WebSocket topic via WebSocketManager."""
        try:
            from app.services.websocket_manager import get_websocket_manager
            ws_manager = get_websocket_manager()
            await ws_manager.broadcast_json({'type': topic, 'data': data}, topic=topic)
        except Exception as exc:
            logger.debug("WS broadcast error on %s: %s", topic, exc)

    async def _broadcast_device_state(
        self,
        device_id: str,
        event: str,
        detail: Optional[str] = None,
    ) -> None:
        payload: Dict[str, Any] = {
            'device_id': device_id,
            'event': event,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
        if detail:
            payload['detail'] = detail
        await self._broadcast('tesira:device_state', payload)

    # ──────────────────────────────────────────────────────────────────────────
    # Internal: config loading
    # ──────────────────────────────────────────────────────────────────────────

    def _load_config(self) -> None:
        """Load device configs from app config (tesira.devices list)."""
        try:
            from app.config import config_get
            devices_raw: List[Dict[str, Any]] = config_get('tesira.devices', []) or []
            interval_ms: int = config_get('tesira.metering_interval_ms', 100)
            default_transport = str(config_get("tesira.transport", "auto") or "auto")
            default_ssh_enabled = bool(config_get("tesira.ssh_enabled", True))
            default_ssh_port = int(config_get("tesira.ssh_port", 22))
            creds = config_get("tesira.ssh_credentials", {}) or {}
            default_ssh_username = str(creds.get("username", config_get("tesira.ssh_username", "default")))
            default_ssh_password = str(creds.get("password", config_get("tesira.ssh_password", "default")))
            self._reverse_preset_sync = bool(config_get("tesira.reverse_preset_sync", True))
        except Exception:
            devices_raw = []
            interval_ms = 100
            default_transport = "auto"
            default_ssh_enabled = True
            default_ssh_port = 22
            default_ssh_username = "default"
            default_ssh_password = "default"
            self._reverse_preset_sync = True

        self._configs = []
        for raw in devices_raw[:MAX_DEVICES]:
            if not raw.get('enabled', True):
                continue
            if not raw.get('host'):
                continue
            self._configs.append(TesiraDeviceConfig(
                host=raw['host'],
                port=int(raw.get('port', 23)),
                name=raw.get('name', ''),
                enabled=bool(raw.get('enabled', True)),
                metering_tags=list(raw.get('metering_tags', [])),
                metering_interval_ms=interval_ms,
                transport=str(raw.get("transport", default_transport) or "auto").lower(),
                ssh_enabled=bool(raw.get("ssh_enabled", default_ssh_enabled)),
                ssh_port=int(raw.get("ssh_port", default_ssh_port)),
                ssh_username=str(raw.get("ssh_username", default_ssh_username)),
                ssh_password=str(raw.get("ssh_password", default_ssh_password)),
            ))
        logger.info("TesiraFleet: loaded %d device config(s)", len(self._configs))
