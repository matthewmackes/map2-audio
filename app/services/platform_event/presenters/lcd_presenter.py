from __future__ import annotations

from app.lcd_models.lcd_event import EventSeverity, EventType
from app.services.platform_event.policy import hints_for

from ..envelope import PlatformEvent
from ..presenter import Presenter, SurfaceAction


class LCDPresenter(Presenter):
    surface = "lcd"

    def wants(self, event: PlatformEvent) -> bool:
        return not event.target_surfaces or "lcd" in event.target_surfaces or event.kind.startswith("lcd.")

    def present(self, event: PlatformEvent) -> SurfaceAction | None:
        if not self.wants(event):
            return None
        hints = hints_for(event)
        event_type = EventType.ALERT if hints.urgent else EventType.SYSTEM
        severity = (
            EventSeverity.CRITICAL
            if event.severity.value == "critical"
            else EventSeverity.WARNING
            if event.severity.value in {"warning", "error"}
            else EventSeverity.INFO
        )
        return SurfaceAction(
            surface=self.surface,
            action_type="lcd_event",
            event_id=event.event_id,
            payload={
                "event_id": event.event_id,
                "event_type": event_type.value,
                "severity": severity.value,
                "title": f"{hints.lcd_icon} {event.title}"[:40],
                "message": event.message[:200],
                "source_node": event.source_node,
                "broadcast": event.broadcast,
            },
        )

