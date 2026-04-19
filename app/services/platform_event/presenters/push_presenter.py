from __future__ import annotations

from app.services.platform_event.policy import hints_for

from ..envelope import PlatformEvent
from ..presenter import Presenter, SurfaceAction


class PushPresenter(Presenter):
    surface = "push"

    def wants(self, event: PlatformEvent) -> bool:
        return not event.target_surfaces or "push" in event.target_surfaces

    def present(self, event: PlatformEvent) -> SurfaceAction | None:
        if not self.wants(event):
            return None
        hints = hints_for(event)
        urgent_controls = ["top_row_0", "top_row_1"] if hints.urgent else []
        return SurfaceAction(
            surface=self.surface,
            action_type="render_frame",
            event_id=event.event_id,
            payload={
                "title": event.title[:32],
                "lines": [event.message[:32], event.source_node[:32]],
                "urgent": hints.urgent,
                "urgent_controls": urgent_controls,
                "color": hints.led_color,
            },
        )

