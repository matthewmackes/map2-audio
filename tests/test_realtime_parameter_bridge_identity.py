import json
import asyncio

import pytest

from app.services.realtime_parameter_bridge import RealTimeParameterBridge


class _FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.text_messages: list[dict] = []
        self.binary_messages: list[bytes] = []

    async def accept(self):
        self.accepted = True

    async def send_text(self, payload: str):
        self.text_messages.append(json.loads(payload))

    async def send_bytes(self, payload: bytes):
        self.binary_messages.append(payload)


@pytest.mark.asyncio
async def test_update_from_engine_broadcasts_only_matching_plugin_position():
    bridge = RealTimeParameterBridge()
    ws_a = _FakeWebSocket()
    ws_b = _FakeWebSocket()

    await bridge.connect_client(ws_a, "client-a")
    await bridge.connect_client(ws_b, "client-b")
    ws_a.text_messages.clear()
    ws_b.text_messages.clear()

    await bridge.handle_message(
        "client-a",
        json.dumps(
            {
                "action": "subscribe",
                "plugin_uri": "urn:test:duplicate",
                "param_index": 0,
                "plugin_position": 0,
            }
        ),
    )
    await bridge.handle_message(
        "client-b",
        json.dumps(
            {
                "action": "subscribe",
                "plugin_uri": "urn:test:duplicate",
                "param_index": 0,
                "plugin_position": 1,
            }
        ),
    )

    await bridge.update_from_engine(
        "urn:test:duplicate",
        0,
        0.75,
        plugin_position=1,
    )

    assert ws_a.text_messages == []
    assert ws_b.text_messages == [
        {
            "type": "param_update",
            "plugin_uri": "urn:test:duplicate",
            "param_index": 0,
            "plugin_position": 1,
            "value": 0.75,
            "source": "internal",
            "timestamp": ws_b.text_messages[0]["timestamp"] if ws_b.text_messages else None,
        }
    ]


@pytest.mark.asyncio
async def test_process_loop_passes_plugin_position_to_engine_callback():
    bridge = RealTimeParameterBridge()
    ws = _FakeWebSocket()
    received: list[tuple[str, int, float, int | None, int | None]] = []

    bridge.set_engine_callback(
        lambda plugin_uri, param_index, value, instance_id, plugin_position: received.append(
            (plugin_uri, param_index, value, instance_id, plugin_position)
        )
    )

    await bridge.connect_client(ws, "client")
    await bridge.start()
    await bridge.handle_message(
        "client",
        json.dumps(
            {
                "action": "param_update",
                "plugin_uri": "urn:test:duplicate",
                "param_index": 2,
                "value": 0.33,
                "plugin_position": 4,
            }
        ),
    )
    await asyncio.sleep(0.03)
    await bridge.stop()

    assert received == [("urn:test:duplicate", 2, 0.33, None, 4)]
    assert bridge.get_cached_value("urn:test:duplicate", 2, plugin_position=4) == pytest.approx(0.33)
