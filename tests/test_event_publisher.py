import asyncio
from datetime import datetime, timezone

import pytest

from app.services.event_publisher import EventPublisher, EventType


@pytest.mark.asyncio
async def test_publish_message_threadsafe_uses_current_loop_without_bound_websocket_loop(monkeypatch):
    publisher = EventPublisher()
    delivered: list[tuple[tuple[str, ...], dict[str, object]]] = []

    async def fake_publish(message: dict[str, object], *, topics) -> None:
        delivered.append((tuple(topics), dict(message)))

    monkeypatch.setattr(publisher, "publish_message", fake_publish)

    publisher.publish_message_threadsafe({"type": "midi:route_changed"}, topics=("midi:routes",))

    for _ in range(5):
        if delivered:
            break
        await asyncio.sleep(0)

    assert delivered == [
        (("midi:routes",), {"type": "midi:route_changed"})
    ]


@pytest.mark.asyncio
async def test_publish_uses_utc_timestamp(monkeypatch):
    publisher = EventPublisher()
    delivered: list[dict[str, object]] = []
    publisher._ws_manager = object()

    async def fake_publish_message(message: dict[str, object], *, topics) -> None:
        delivered.append(dict(message))

    monkeypatch.setattr(publisher, "publish_message", fake_publish_message)

    await publisher.publish("system", EventType.SYSTEM_STATUS, {"ok": True})

    parsed = datetime.fromisoformat(str(delivered[0]["timestamp"]))
    assert parsed.tzinfo == timezone.utc
