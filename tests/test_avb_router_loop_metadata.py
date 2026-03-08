import asyncio

import app.services.avb.avb_router as avb_router_module
from app.services.avb.avb_router import AudioEndpoint, AvbRouter, StreamDirection


def _endpoint(
    *,
    entity_id: str,
    unique_id: int,
    direction: StreamDirection,
    node_id: str,
) -> AudioEndpoint:
    return AudioEndpoint(
        entity_id=entity_id,
        unique_id=unique_id,
        direction=direction,
        device_type="map2",
        device_name=node_id,
        channels=2,
        sample_rate=48000,
        node_id=node_id,
        node_address=f"http://{node_id}:8080",
        available=True,
    )


def test_connect_and_disconnect_preserve_effects_loop_metadata(monkeypatch):
    router = AvbRouter()

    talker = _endpoint(
        entity_id="0011223344556677",
        unique_id=0,
        direction=StreamDirection.TALKER,
        node_id="node-a",
    )
    listener = _endpoint(
        entity_id="8899aabbccddeeff",
        unique_id=1,
        direction=StreamDirection.LISTENER,
        node_id="node-b",
    )

    talker_id = talker.endpoint_id()
    listener_id = listener.endpoint_id()
    router.endpoints[talker_id] = talker
    router.endpoints[listener_id] = listener

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)
    monkeypatch.setattr(router, "_connect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=True))
    monkeypatch.setattr(router, "_disconnect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=True))

    connect_result = asyncio.run(
        router.connect(
            talker_id,
            listener_id,
            return_details=True,
            connection_role="effects_loop_send",
            loop_id="loop_unit_1",
        )
    )

    assert connect_result["success"] is True
    assert connect_result["connection_role"] == "effects_loop_send"
    assert connect_result["loop_id"] == "loop_unit_1"

    conn_id = f"{talker_id}→{listener_id}"
    assert conn_id in router.connections
    assert router.connections[conn_id].connection_role == "effects_loop_send"
    assert router.connections[conn_id].loop_id == "loop_unit_1"

    disconnect_result = asyncio.run(router.disconnect(talker_id, listener_id, return_details=True))
    assert disconnect_result["success"] is True
    assert disconnect_result["connection_role"] == "effects_loop_send"
    assert disconnect_result["loop_id"] == "loop_unit_1"


def test_connect_normalizes_unknown_connection_role(monkeypatch):
    router = AvbRouter()

    talker = _endpoint(
        entity_id="0011223344556677",
        unique_id=0,
        direction=StreamDirection.TALKER,
        node_id="node-a",
    )
    listener = _endpoint(
        entity_id="8899aabbccddeeff",
        unique_id=1,
        direction=StreamDirection.LISTENER,
        node_id="node-b",
    )

    talker_id = talker.endpoint_id()
    listener_id = listener.endpoint_id()
    router.endpoints[talker_id] = talker
    router.endpoints[listener_id] = listener

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)
    monkeypatch.setattr(router, "_connect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=True))

    connect_result = asyncio.run(
        router.connect(
            talker_id,
            listener_id,
            return_details=True,
            connection_role="not-a-valid-role",
            loop_id="loop_unit_2",
        )
    )

    assert connect_result["success"] is True
    assert connect_result["connection_role"] == "general_route"
