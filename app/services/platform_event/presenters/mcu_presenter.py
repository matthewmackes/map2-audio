from __future__ import annotations

from app.services.platform_event.policy import hints_for

from ..envelope import PlatformEvent
from ..presenter import Presenter, SurfaceAction


def _truncate(text: str, limit: int = 7) -> str:
    return str(text or "").strip().upper()[:limit]


class MCUPresenter(Presenter):
    surface = "mcu"

    def wants(self, event: PlatformEvent) -> bool:
        return not event.target_surfaces or "mcu" in event.target_surfaces

    def present(self, event: PlatformEvent) -> SurfaceAction | None:
        if not self.wants(event):
            return None
        hints = hints_for(event)
        label = _truncate(f"{hints.mcu_prefix}{event.title}")
        return SurfaceAction(
            surface=self.surface,
            action_type="scribble_strip",
            event_id=event.event_id,
            payload={
                "labels": [label] + [""] * 7,
                "title": label,
                "message": event.message[:56],
            },
        )

