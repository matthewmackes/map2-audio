import asyncio

from app.services.avb.avb_router import (
    AudioEndpoint,
    AvbRouter,
    ConnectionState,
    StreamConnection,
    StreamDirection,
)


def _make_connection() -> StreamConnection:
    talker = AudioEndpoint(
        entity_id="0011223344556677",
        unique_id=1,
        direction=StreamDirection.TALKER,
        device_type="map2",
        device_name="talker-node",
        channels=2,
        sample_rate=48000,
        node_address="http://127.0.0.1:8080",
        mac_address="00:11:22:33:44:55",
    )
    listener = AudioEndpoint(
        entity_id="8899aabbccddeeff",
        unique_id=2,
        direction=StreamDirection.LISTENER,
        device_type="map2",
        device_name="listener-node",
        channels=2,
        sample_rate=48000,
        node_address="http://127.0.0.1:8080",
        mac_address="66:77:88:99:aa:bb",
    )
    return StreamConnection(talker=talker, listener=listener, state=ConnectionState.CONNECTING)


def test_connect_map2_to_map2_success(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    calls = []

    async def fake_provision(endpoint, stream_config):
        calls.append((endpoint.endpoint_id(), stream_config["stream_id"]))
        return True, ""

    monkeypatch.setattr(router, "_provision_map2_stream", fake_provision)

    ok = asyncio.run(router._connect_map2_to_map2(connection))
    assert ok is True
    assert len(calls) == 2


def test_connect_map2_to_map2_rolls_back_talker_on_listener_failure(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    deprovisioned = []

    async def fake_provision(endpoint, stream_config):
        if stream_config["direction"] == "talker":
            return True, ""
        return False, "listener create failed"

    async def fake_deprovision(endpoint, stream_id):
        deprovisioned.append((endpoint.endpoint_id(), stream_id))
        return True, ""

    monkeypatch.setattr(router, "_provision_map2_stream", fake_provision)
    monkeypatch.setattr(router, "_deprovision_map2_stream", fake_deprovision)

    ok = asyncio.run(router._connect_map2_to_map2(connection))
    assert ok is False
    assert "listener provision failed" in (connection.error_message or "")
    assert len(deprovisioned) == 1
    assert deprovisioned[0][0] == connection.talker.endpoint_id()


def test_disconnect_map2_to_map2_surfaces_errors(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()

    async def fake_deprovision(endpoint, stream_id):
        if endpoint.direction == StreamDirection.TALKER:
            return False, "talker stop failed"
        return True, ""

    monkeypatch.setattr(router, "_deprovision_map2_stream", fake_deprovision)

    ok = asyncio.run(router._disconnect_map2_to_map2(connection))
    assert ok is False
    assert "talker stop failed" in (connection.error_message or "")
