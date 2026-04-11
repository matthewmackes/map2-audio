from __future__ import annotations

from datetime import timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.lcd_models.lcd_event import EventSeverity, EventType, LCDEvent
from app.routes import lcd_events as lcd_events_routes


class _FakeLcdManager:
    node_id = "node-1"
    node_label = "NODE-1"

    def __init__(self) -> None:
        self.published: list[LCDEvent] = []

    async def publish_event(self, event: LCDEvent) -> None:
        event.event_id = event.event_id or "generated-event"
        self.published.append(event)

    def get_recent_local_events(self, _limit: int):
        return []

    def get_recent_remote_events(self, _limit: int):
        return []

    def get_all_recent_events(self, _limit: int):
        return []


def test_create_event_route_uses_utc_timestamp(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(lcd_events_routes.router)
    manager = _FakeLcdManager()
    monkeypatch.setattr(lcd_events_routes, "lcd_manager", manager)
    monkeypatch.setattr(lcd_events_routes, "get_lcd_persistence", lambda: None)

    client = TestClient(app)
    response = client.post(
        "/api/lcd/events",
        json={
            "title": "Heads up",
            "message": "UTC event",
            "event_type": EventType.USER.value,
            "severity": EventSeverity.INFO.value,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "event_id": "generated-event",
        "message": "Event published",
    }
    assert len(manager.published) == 1
    assert manager.published[0].timestamp.tzinfo == timezone.utc
