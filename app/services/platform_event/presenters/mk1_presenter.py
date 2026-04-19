from __future__ import annotations

from app.services.platform_event.policy import hints_for

from ..envelope import PlatformEvent
from ..presenter import Presenter, SurfaceAction


def _mk1_overlay_pads(color: str, animation: str) -> list[dict[str, object]]:
    return [
        {
            "index": index,
            "state": "full",
            "color": color,
            "selected": False,
            "brightness_level": "full",
            "animation": animation,
        }
        for index in range(16)
    ]


class MK1EventPresenter(Presenter):
    surface = "mk1"

    def wants(self, event: PlatformEvent) -> bool:
        return not event.target_surfaces or "mk1" in event.target_surfaces

    def present(self, event: PlatformEvent) -> SurfaceAction | None:
        if not self.wants(event):
            return None

        hints = hints_for(event)
        exclusive = event.severity.value in {"warning", "error", "critical"}
        if not exclusive and not (
            event.kind.startswith("workflow.")
            or event.kind.endswith(".progress")
            or event.kind in {"ir.download.progress", "soundfont.download.progress"}
        ):
            return None

        return SurfaceAction(
            surface=self.surface,
            action_type="overlay" if exclusive else "long_op",
            event_id=event.event_id,
            payload={
                "mode": "exclusive_overlay" if exclusive else "shared_receipt",
                "event_id": event.event_id,
                "severity": event.severity.value,
                "kind": event.kind,
                "title": event.title,
                "message": event.message,
                "ttl_seconds": hints.ttl_seconds,
                "pads": _mk1_overlay_pads(hints.led_color, hints.led_animation),
                "lcd": {
                    "left": {
                        "title": f"{hints.lcd_icon} {event.title}"[:24],
                        "body": event.message[:80],
                    },
                    "right": {
                        "title": event.source_node[:24],
                        "body": event.kind[:80],
                    },
                },
            },
        )

    def on_dismiss(self, event_id: str) -> SurfaceAction | None:
        return SurfaceAction(
            surface=self.surface,
            action_type="clear_overlay",
            event_id=event_id,
            payload={"event_id": event_id},
        )

