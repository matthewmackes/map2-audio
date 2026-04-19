from __future__ import annotations

from app.services.platform_event.policy import hints_for

from ..envelope import PlatformEvent
from ..presenter import Presenter, SurfaceAction


class TUIPresenter(Presenter):
    surface = "tui"

    def wants(self, event: PlatformEvent) -> bool:
        return not event.target_surfaces or "tui" in event.target_surfaces

    def present(self, event: PlatformEvent) -> SurfaceAction | None:
        if not self.wants(event):
            return None
        hints = hints_for(event)
        status_line = f"{hints.mcu_prefix.strip()} {event.title}".strip()[:48]
        return SurfaceAction(
            surface=self.surface,
            action_type="screen_update",
            event_id=event.event_id,
            payload={
                "region": "platform_event",
                "status_line": status_line,
                "message": event.message,
                "severity": event.severity.value,
                "urgent": hints.urgent,
            },
        )

