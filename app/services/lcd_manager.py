"""
LCD Manager

Consumes canonical PlatformEvents, projects them onto the LCD surface, and
drives the physical display.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Awaitable, Callable, Optional

from app.drivers.lcd_display import LCDDisplay, MockLCDDisplay
from app.lcd_models.lcd_event import LCDEvent
from app.services.platform_event.bus import (
    PlatformEventBus,
    PlatformEventFilter,
    Subscription,
    get_platform_event_bus,
)
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.lcd_projection import lcd_event_from_platform_event
from app.services.platform_event.presenters.lcd_presenter import LCDPresenter
from app.services.platform_event.store import PlatformEventStore, get_platform_event_store
from app.services.ws_federation import get_ws_federator

logger = logging.getLogger(__name__)


# Active LCD manager instance for routes/services that need runtime access.
lcd_manager: Optional["LCDManager"] = None


def set_lcd_manager(manager: Optional["LCDManager"]) -> None:
    """Register or clear the active LCD manager instance."""
    global lcd_manager
    lcd_manager = manager


def get_lcd_manager() -> Optional["LCDManager"]:
    """Return the active LCD manager instance, if one is registered."""
    return lcd_manager


class LCDManager:
    """PlatformEvent-backed LCD runtime."""

    def __init__(
        self,
        node_id: str,
        node_label: str,
        lcd_port: str = "/dev/ttyUSB0",
        use_mock_lcd: bool = False,
        mdns_discovery=None,
        platform_event_bus: PlatformEventBus | None = None,
        platform_event_store: PlatformEventStore | None = None,
    ) -> None:
        self.node_id = node_id
        self.node_label = node_label
        self.mdns_discovery = mdns_discovery
        self.platform_event_bus = platform_event_bus or get_platform_event_bus()
        self.platform_event_store = platform_event_store or get_platform_event_store()
        self._presenter = LCDPresenter()
        self._connected_peers: set[str] = set()
        self._event_subscription: Subscription | None = None

        if use_mock_lcd:
            self.lcd = MockLCDDisplay()
        else:
            self.lcd = LCDDisplay(port=lcd_port)

        self.display_queue: asyncio.Queue[LCDEvent] = asyncio.Queue()
        self.current_event: Optional[LCDEvent] = None
        self._display_task: asyncio.Task[None] | None = None
        self._cleanup_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Start LCD runtime and subscribe to platform events."""
        logger.info("Starting LCD Manager for %s", self.node_label)

        try:
            await self.lcd.connect()
            logger.info("LCD connected successfully")
        except FileNotFoundError as e:
            logger.warning("LCD device not found (%s), using mock display", e)
            self.lcd = MockLCDDisplay()
            await self.lcd.connect()
        except PermissionError as e:
            logger.warning("No permission to access LCD device (%s), using mock display", e)
            self.lcd = MockLCDDisplay()
            await self.lcd.connect()
        except Exception as e:
            logger.warning("Failed to connect LCD (%s: %s), using mock display", type(e).__name__, e)
            self.lcd = MockLCDDisplay()
            await self.lcd.connect()

        self._event_subscription = await self.platform_event_bus.subscribe_callback(
            self._queue_platform_event,
            PlatformEventFilter(surfaces=frozenset({"lcd"})),
        )

        if self.mdns_discovery:
            await self.mdns_discovery.start()
            self.mdns_discovery.subscribe(self._handle_peer_discovery)

        self._display_task = asyncio.create_task(self._update_display_loop())
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        await self._show_welcome()
        logger.info("LCD Manager started successfully")

    async def stop(self) -> None:
        """Stop the LCD runtime."""
        logger.info("Stopping LCD Manager")

        if self._event_subscription:
            self._event_subscription.close()
            self._event_subscription = None

        if self._display_task:
            self._display_task.cancel()
        if self._cleanup_task:
            self._cleanup_task.cancel()
        for task in (self._display_task, self._cleanup_task):
            if task is None:
                continue
            try:
                await task
            except asyncio.CancelledError:
                pass

        if self.mdns_discovery:
            await self.mdns_discovery.stop()

        await self.lcd.disconnect()
        logger.info("LCD Manager stopped")

    async def _show_welcome(self) -> None:
        await self.lcd.write_lines([
            "MAP2 AUDIO PLATFORM",
            self.node_label,
            "",
            "Initializing...",
        ])
        await asyncio.sleep(2)

    async def _queue_platform_event(self, event: PlatformEvent) -> None:
        if not self._presenter.wants(event):
            return
        lcd_event = lcd_event_from_platform_event(event)
        if not lcd_event.should_display_on_node(self.node_id):
            return
        await self.display_queue.put(lcd_event)
        logger.debug("Queued LCD PlatformEvent %s for display", event.event_id)

    async def _update_display_loop(self) -> None:
        while True:
            try:
                event = await self.display_queue.get()
                await self._display_event(event)
                if event.sound:
                    await self.lcd.play_sound()
                self.current_event = event
                await asyncio.sleep(5 if event.dismiss_auto else 15)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Display update error: %s", e)

    async def _display_event(self, event: LCDEvent) -> None:
        source = "[LOCAL]" if event.source_node in {self.node_id, self.node_label} else "[REMOTE]"
        header = f"MAP2 - {self.node_label[:16]}"
        line1 = f"{source} {event.icon} {event.title}"[:20]
        line2 = event.message[:20]
        if len(event.message) > 20:
            line3 = event.message[20:40]
        else:
            timestamp = event.timestamp.strftime("%H:%M:%S")
            line3 = f"{event.source_node[:13]} {timestamp}"[:20]

        await self.lcd.write_lines([header, line1, line2, line3])
        logger.info("Displayed LCD PlatformEvent: %s", event.title)

    async def _cleanup_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(3600)
                self.platform_event_store.cleanup_old_events()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Cleanup error: %s", e)

    async def connect_to_peer(self, node_id: str, node_url: str) -> None:
        """Best-effort platform-event federation hook for peer-link routes."""
        del node_url
        self._connected_peers.add(str(node_id))
        try:
            await get_ws_federator().subscribe_remote(str(node_id), "platform:events")
        except Exception as exc:
            logger.debug("Peer platform-event federation subscribe skipped for %s", node_id, exc_info=exc)

    def _handle_peer_discovery(self, action: str, node_id: str, info: dict) -> None:
        if action != "discovered":
            return
        url = str(info.get("url") or "").strip()
        if url:
            asyncio.create_task(self.connect_to_peer(node_id, url))

    async def publish_event(self, event: PlatformEvent) -> None:
        await self.platform_event_bus.emit(event)

    async def subscribe_live(
        self,
        callback: Callable[[LCDEvent], Awaitable[None] | None],
    ) -> Subscription:
        async def _handle(event: PlatformEvent) -> None:
            if not self._presenter.wants(event):
                return
            result = callback(lcd_event_from_platform_event(event))
            if inspect.isawaitable(result):
                await result

        return await self.platform_event_bus.subscribe_callback(
            _handle,
            PlatformEventFilter(surfaces=frozenset({"lcd"})),
        )

    def get_recent_local_events(
        self,
        limit: int = 50,
        *,
        hours: int = 24,
        event_type: str | None = None,
        severity: str | None = None,
    ) -> list[LCDEvent]:
        return self._query_recent_events(
            limit=limit,
            hours=hours,
            source_node=self.node_label,
            event_type=event_type,
            severity=severity,
        )

    def get_recent_remote_events(
        self,
        limit: int = 50,
        *,
        hours: int = 24,
        event_type: str | None = None,
        severity: str | None = None,
    ) -> list[LCDEvent]:
        return self._query_recent_events(
            limit=limit,
            hours=hours,
            exclude_source_node=self.node_label,
            event_type=event_type,
            severity=severity,
        )

    def get_all_recent_events(
        self,
        limit: int = 100,
        *,
        hours: int = 24,
        event_type: str | None = None,
        severity: str | None = None,
    ) -> list[LCDEvent]:
        return self._query_recent_events(
            limit=limit,
            hours=hours,
            event_type=event_type,
            severity=severity,
        )

    def get_events_by_node(self, node_id: str, *, limit: int = 100, hours: int = 24) -> list[LCDEvent]:
        return self._query_recent_events(limit=limit, hours=hours, source_node=node_id)

    def get_active_nodes(self, *, hours: int = 24) -> list[str]:
        events = self.platform_event_store.query_events(limit=500, hours=hours)
        active_nodes = {
            event.source_node
            for event in events
            if self._presenter.wants(event)
        }
        return sorted(active_nodes)

    def get_connected_peers(self) -> list[str]:
        return sorted(self._connected_peers)

    def get_connection_stats(self) -> dict[str, object]:
        peers = self.get_connected_peers()
        return {
            "total_peers": len(peers),
            "connected_peers": len(peers),
            "offline_peers": 0,
            "total_pending_events": 0,
            "peer_status": {
                peer_id: {"connected": True, "pending_events": 0}
                for peer_id in peers
            },
        }

    def _query_recent_events(
        self,
        *,
        limit: int,
        hours: int,
        source_node: str | None = None,
        exclude_source_node: str | None = None,
        event_type: str | None = None,
        severity: str | None = None,
    ) -> list[LCDEvent]:
        fetch_limit = max(int(limit) * 6, 100)
        events = self.platform_event_store.query_events(
            limit=fetch_limit,
            hours=hours,
            source_node=source_node,
            exclude_source_node=exclude_source_node,
            severities=[severity] if severity else None,
        )

        projected: list[LCDEvent] = []
        normalized_event_type = str(event_type or "").strip().lower()
        for event in events:
            if not self._presenter.wants(event):
                continue
            lcd_event = lcd_event_from_platform_event(event)
            if normalized_event_type and lcd_event.event_type.value != normalized_event_type:
                continue
            projected.append(lcd_event)
            if len(projected) >= int(limit):
                break
        return projected
