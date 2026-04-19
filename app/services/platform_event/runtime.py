from __future__ import annotations

import logging
from app.services.platform_event.presenters import (
    LCDPresenter,
    MCUPresenter,
    MK1EventPresenter,
    PushPresenter,
    TUIPresenter,
)
from app.utils.singleton import Singleton

from .bus import PlatformEventBus, Subscription, get_platform_event_bus
from .envelope import PlatformEvent
from .presenter import Presenter, SurfaceAction

logger = logging.getLogger(__name__)


class PlatformEventPresenterRuntime(Singleton):
    def __init__(
        self,
        *,
        bus: PlatformEventBus | None = None,
        presenters: list[Presenter] | None = None,
    ) -> None:
        self._bus = bus or get_platform_event_bus()
        self._presenters = presenters or [
            MK1EventPresenter(),
            LCDPresenter(),
            TUIPresenter(),
            PushPresenter(),
            MCUPresenter(),
        ]
        self._subscriptions: list[Subscription] = []
        self._started = False

    async def start(self) -> None:
        if self._started or not self._bus.enabled:
            return
        self._started = True
        for presenter in self._presenters:
            subscription = await self._bus.subscribe_callback(
                lambda event, bound_presenter=presenter: self._handle_event(bound_presenter, event),
            )
            self._subscriptions.append(subscription)

    async def stop(self) -> None:
        if not self._started:
            return
        for subscription in self._subscriptions:
            subscription.close()
        self._subscriptions.clear()
        self._started = False

    async def _handle_event(self, presenter: Presenter, event: PlatformEvent) -> None:
        try:
            action = presenter.present(event)
            if action is None:
                return
            await self._execute_action(action)
        except Exception:
            logger.exception("PlatformEvent presenter failed for %s", presenter.surface)

    async def _execute_action(self, action: SurfaceAction) -> None:
        if action.surface == "mk1":
            await self._execute_mk1_action(action)
            return
        if action.surface == "tui":
            await self._execute_tui_action(action)
            return
        if action.surface == "push":
            await self._execute_push_action(action)
            return
        if action.surface == "mcu":
            await self._execute_mcu_action(action)
            return
        if action.surface == "lcd":
            logger.debug("LCD presenter action ready: %s", action.payload.get("title"))
            return

    async def _execute_mk1_action(self, action: SurfaceAction) -> None:
        from app.services.maschine_service import get_maschine_service

        service = get_maschine_service()
        if action.action_type == "clear_overlay":
            await service.clear_platform_event_overlay(event_id=str(action.payload.get("event_id") or action.event_id))
            return
        await service.set_platform_event_overlay(
            event_id=action.event_id,
            title=str(action.payload.get("title") or ""),
            message=str(action.payload.get("message") or ""),
            severity=str(action.payload.get("severity") or "info"),
            mode=str(action.payload.get("mode") or "shared_receipt"),
            pads=list(action.payload.get("pads") or []),
            lcd=dict(action.payload.get("lcd") or {}),
            ttl_seconds=max(0, int(action.payload.get("ttl_seconds") or 300)),
        )

    async def _execute_tui_action(self, action: SurfaceAction) -> None:
        from app.services.tui_screen_manager import get_screen_manager

        manager = get_screen_manager()
        if manager is None:
            return
        await manager.update_component(
            str(action.payload.get("region") or "platform_event"),
            {
                "status_line": action.payload.get("status_line"),
                "message": action.payload.get("message"),
                "severity": action.payload.get("severity"),
            },
        )

    async def _execute_push_action(self, action: SurfaceAction) -> None:
        from app.services.push_surface import get_push_surface_manager

        manager = get_push_surface_manager()
        await manager.present_platform_event(
            title=str(action.payload.get("title") or ""),
            lines=tuple(str(line) for line in list(action.payload.get("lines") or [])[:2]),
            urgent=bool(action.payload.get("urgent")),
        )

    async def _execute_mcu_action(self, action: SurfaceAction) -> None:
        from app.services.mcu_surface import get_mcu_surface_service

        service = get_mcu_surface_service()
        labels = [str(label) for label in list(action.payload.get("labels") or [])[:8]]
        for port in service.list_output_ports():
            destination_port = str(port.get("port_id") or port.get("name") or "").strip()
            if destination_port:
                service.push_scribble_strip(destination_port=destination_port, labels=labels)


def get_platform_event_presenter_runtime() -> PlatformEventPresenterRuntime:
    return PlatformEventPresenterRuntime.get_instance()


__all__ = ["PlatformEventPresenterRuntime", "get_platform_event_presenter_runtime"]
