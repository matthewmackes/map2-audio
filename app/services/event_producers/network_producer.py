"""
Network Event Producer

Monitors peer connectivity and emits canonical PlatformEvents targeted at the
LCD surface.
"""

from __future__ import annotations

import asyncio
import logging

import aiohttp

from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.severity import Severity

logger = logging.getLogger(__name__)


class NetworkEventProducer:
    """Produces network-related LCD PlatformEvents."""

    def __init__(self, event_bus: PlatformEventBus, *, node_label: str):
        self.event_bus = event_bus
        self.node_label = node_label
        self.peers = {}
        self._monitor_task = None

    async def start(self):
        logger.info("Starting Network Event Producer")
        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        logger.info("Stopping Network Event Producer")
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

    async def _monitor_loop(self):
        while True:
            try:
                await self._check_peer_connectivity()
                await asyncio.sleep(15)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Network monitoring error: %s", e)
                await asyncio.sleep(30)

    async def _emit(
        self,
        *,
        severity: Severity,
        title: str,
        message: str,
        icon: str | None = None,
        color: str | None = None,
        context: dict | None = None,
    ) -> None:
        await self.event_bus.emit(
            make_lcd_surface_event(
                event_type="network",
                severity=severity,
                source_node=self.node_label,
                source_service="network_event_producer",
                title=title,
                message=message,
                icon=icon,
                color=color,
                context=context,
            )
        )

    async def _check_peer_connectivity(self):
        for node_id, info in self.peers.items():
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{info['url']}/api/health",
                        timeout=aiohttp.ClientTimeout(total=3),
                    ) as response:
                        connected = response.status == 200
                        await self._update_peer_status(node_id, connected)
            except Exception:
                await self._update_peer_status(node_id, False)

    async def _update_peer_status(self, node_id: str, connected: bool):
        if node_id not in self.peers:
            return

        previous_status = self.peers[node_id].get("connected", False)
        if connected == previous_status:
            return

        self.peers[node_id]["connected"] = connected
        if connected:
            await self.on_peer_connected(node_id)
        else:
            await self.on_peer_disconnected(node_id)

    async def register_peer(self, node_id: str, node_url: str):
        self.peers[node_id] = {"url": node_url, "connected": False}
        logger.info("Registered peer for monitoring: %s", node_id)

    async def on_peer_connected(self, node_id: str):
        await self._emit(
            severity=Severity.INFO,
            title="Peer Connected",
            message=f"{node_id} is now online",
            icon="🔗",
            color="green",
            context={"peer_node": node_id},
        )
        logger.info("Peer connected: %s", node_id)

    async def on_peer_disconnected(self, node_id: str):
        await self._emit(
            severity=Severity.WARNING,
            title="Peer Disconnected",
            message=f"{node_id} went offline",
            icon="⚠️",
            color="yellow",
            context={"peer_node": node_id},
        )
        logger.warning("Peer disconnected: %s", node_id)

    async def on_high_latency(self, node_id: str, latency_ms: float):
        await self._emit(
            severity=Severity.WARNING,
            title="High Network Latency",
            message=f"{node_id}: {latency_ms:.0f}ms",
            color="yellow",
            context={"peer_node": node_id, "latency_ms": latency_ms},
        )
