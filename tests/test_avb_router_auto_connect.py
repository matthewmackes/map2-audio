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


def test_start_runs_auto_connect_when_enabled(monkeypatch):
    router = AvbRouter()
    calls = []

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

    values = {
        "avb.auto_connect": True,
        "avb.auto_connect.startup_attempts": 1,
        "avb.auto_connect.retry_delay_ms": 0,
    }
    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: values.get(key, default))

    async def _no_op_loop():
        await asyncio.sleep(0)

    async def _discover_map2():
        router.endpoints[talker.endpoint_id()] = talker
        router.endpoints[listener.endpoint_id()] = listener

    async def _discover_avdecc():
        return None

    async def _sync_engine():
        return None

    async def _connect(talker_id, listener_id, reservation_id=None, admission_id=None, return_details=False):
        calls.append((talker_id, listener_id, return_details))
        return {"success": True}

    monkeypatch.setattr(router, "_discovery_loop", _no_op_loop)
    monkeypatch.setattr(router, "_cleanup_loop", _no_op_loop)
    monkeypatch.setattr(router, "_discover_map2_endpoints", _discover_map2)
    monkeypatch.setattr(router, "_discover_avdecc_endpoints", _discover_avdecc)
    monkeypatch.setattr(router, "_sync_engine_discovered_devices", _sync_engine)
    monkeypatch.setattr(router, "connect", _connect)

    async def _run():
        await router.start()
        if router._auto_connect_task is not None:
            await router._auto_connect_task
        await router.stop()

    asyncio.run(_run())

    assert calls == [(talker.endpoint_id(), listener.endpoint_id(), True)]
    assert router._auto_connect_runs == 1
    assert router._last_auto_connect_summary is not None
    assert router._last_auto_connect_summary["connected"] == 1


def test_start_skips_auto_connect_when_disabled(monkeypatch):
    router = AvbRouter()

    values = {
        "avb.auto_connect": False,
        "avb.auto_connect.startup_attempts": 1,
        "avb.auto_connect.retry_delay_ms": 0,
    }
    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: values.get(key, default))

    async def _no_op_loop():
        await asyncio.sleep(0)

    async def _unexpected_connect(*_args, **_kwargs):
        raise AssertionError("connect should not run when avb.auto_connect is disabled")

    monkeypatch.setattr(router, "_discovery_loop", _no_op_loop)
    monkeypatch.setattr(router, "_cleanup_loop", _no_op_loop)
    monkeypatch.setattr(router, "connect", _unexpected_connect)

    async def _run():
        await router.start()
        await asyncio.sleep(0)
        await router.stop()

    asyncio.run(_run())

    assert router._auto_connect_task is None
    assert router._auto_connect_runs == 0
