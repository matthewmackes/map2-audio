import asyncio
from types import SimpleNamespace

from app.services.avb.avb_router import (
    AudioEndpoint,
    AvbRouter,
    ConnectionState,
    StreamConnection,
    StreamDirection,
)
import app.services.avb.avb_router as avb_router_module


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


def test_disconnect_releases_srp_reservation(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    connection.srp_reservation_id = "srp-res-1"
    router.connections[connection.connection_id()] = connection

    captured = {}

    async def fake_disconnect(_connection):
        return True

    class _FakeSrpService:
        async def release(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(success=True, reason_code="SRP_RELEASED", reason="released")

    monkeypatch.setattr(router, "_disconnect_map2_to_map2", fake_disconnect)

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _FakeSrpService())

    ok = asyncio.run(
        router.disconnect(
            connection.talker.endpoint_id(),
            connection.listener.endpoint_id(),
        )
    )

    assert ok is True
    assert captured["reservation_id"] == "srp-res-1"
    assert captured["endpoint"] == "router.disconnect"


def test_disconnect_return_details_reports_release_warning_on_unsuccessful_release(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    connection.srp_reservation_id = "srp-res-2"
    router.connections[connection.connection_id()] = connection

    async def fake_disconnect(_connection):
        return True

    class _FakeSrpService:
        async def release(self, **_kwargs):
            return SimpleNamespace(success=False, reason_code="SRP_RELEASE_TIMEOUT", reason="timeout")

    monkeypatch.setattr(router, "_disconnect_map2_to_map2", fake_disconnect)

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _FakeSrpService())

    result = asyncio.run(
        router.disconnect(
            connection.talker.endpoint_id(),
            connection.listener.endpoint_id(),
            return_details=True,
        )
    )

    assert result["success"] is True
    assert result["srp_release"]["success"] is False
    assert result["srp_release"]["reservation_id"] == "srp-res-2"
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "srp-res-2"
    assert connection.connection_id() not in router.connections


def test_disconnect_return_details_reports_release_warning_on_release_exception(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    connection.srp_reservation_id = "srp-res-3"
    router.connections[connection.connection_id()] = connection

    async def fake_disconnect(_connection):
        return True

    class _FakeSrpService:
        async def release(self, **_kwargs):
            raise RuntimeError("release crashed")

    monkeypatch.setattr(router, "_disconnect_map2_to_map2", fake_disconnect)

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _FakeSrpService())

    result = asyncio.run(
        router.disconnect(
            connection.talker.endpoint_id(),
            connection.listener.endpoint_id(),
            return_details=True,
        )
    )

    assert result["success"] is True
    assert "srp_release" not in result
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "srp-res-3"
    assert "release crashed" in result["srp_release_warning"]["detail"]
    assert connection.connection_id() not in router.connections


def test_connect_fail_closed_when_allowed_missing_reservation(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
    }
    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: values.get(key, default))

    async def _unexpected_connect(_connection):
        raise AssertionError("connect handler should not run when SRP reservation_id is missing")

    monkeypatch.setattr(router, "_connect_map2_to_map2", _unexpected_connect)

    class _Admission:
        decision = "allowed"
        reservation_id = None
        admission_id = "adm-missing"
        reason_code = "SRP_ADMITTED"
        reason = "ok"

    class _SrpService:
        async def admit(self, _request):
            return _Admission()

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    ok = asyncio.run(router.connect(talker_id, listener_id))

    assert ok is False


def test_connect_releases_pre_acquired_reservation_on_endpoint_validation_failure(monkeypatch):
    router = AvbRouter()
    talker_id = "0011223344556677:1"
    listener_id = "8899aabbccddeeff:2"
    captured = {}

    class _SrpService:
        async def release(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(success=True, reason_code="SRP_RELEASED", reason="released")

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    ok = asyncio.run(router.connect(talker_id, listener_id, reservation_id="srp-res-precheck"))

    assert ok is False
    assert captured["reservation_id"] == "srp-res-precheck"
    assert captured["endpoint"] == "router.connect.reject"
    assert captured["stream_id"] == f"{talker_id}->{listener_id}"
    assert captured["talker_id"] == talker_id
    assert captured["listener_id"] == listener_id


def test_connect_return_details_includes_release_warning_on_rollback_exception(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    async def _failed_connect(_connection):
        return False

    class _SrpService:
        async def release(self, **_kwargs):
            raise RuntimeError("rollback socket error")

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(router, "_connect_map2_to_map2", _failed_connect)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    result = asyncio.run(
        router.connect(
            talker_id,
            listener_id,
            reservation_id="srp-res-rollback",
            return_details=True,
        )
    )

    assert result["success"] is False
    assert result["reason"] == "Connection failed"
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "srp-res-rollback"
    assert "rollback socket error" in result["srp_release_warning"]["detail"]


def test_connect_return_details_includes_release_warning_on_rollback_release_failure(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    async def _failed_connect(_connection):
        return False

    class _SrpService:
        async def release(self, **_kwargs):
            return SimpleNamespace(
                success=False,
                reason_code="SRP_RELEASE_TIMEOUT",
                reason="rollback timeout",
            )

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(router, "_connect_map2_to_map2", _failed_connect)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    result = asyncio.run(
        router.connect(
            talker_id,
            listener_id,
            reservation_id="srp-res-rollback-failed",
            return_details=True,
        )
    )

    assert result["success"] is False
    assert result["srp_release"]["success"] is False
    assert result["srp_release"]["reservation_id"] == "srp-res-rollback-failed"
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "srp-res-rollback-failed"
    assert "rollback timeout" in result["srp_release_warning"]["detail"]


def test_connect_return_details_includes_release_warning_on_reject_release_exception(monkeypatch):
    router = AvbRouter()
    talker_id = "0011223344556677:1"
    listener_id = "8899aabbccddeeff:2"

    class _SrpService:
        async def release(self, **_kwargs):
            raise RuntimeError("reject release crashed")

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    result = asyncio.run(
        router.connect(
            talker_id,
            listener_id,
            reservation_id="srp-res-reject",
            return_details=True,
        )
    )

    assert result["success"] is False
    assert result["reason"] == "Endpoint not found"
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "srp-res-reject"
    assert "reject release crashed" in result["srp_release_warning"]["detail"]


def test_connect_return_details_includes_release_warning_on_reject_release_failure(monkeypatch):
    router = AvbRouter()
    talker_id = "0011223344556677:1"
    listener_id = "8899aabbccddeeff:2"

    class _SrpService:
        async def release(self, **_kwargs):
            return SimpleNamespace(
                success=False,
                reason_code="SRP_RELEASE_FAILED",
                reason="daemon timeout",
            )

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    result = asyncio.run(
        router.connect(
            talker_id,
            listener_id,
            reservation_id="srp-res-reject-failed",
            return_details=True,
        )
    )

    assert result["success"] is False
    assert result["reason"] == "Endpoint not found"
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "srp-res-reject-failed"
    assert "daemon timeout" in result["srp_release_warning"]["detail"]


def test_router_connect_disconnect_multiple_pairs_cleans_state(monkeypatch):
    router = AvbRouter()
    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)

    # Build three pairs with alternating device types to cover both local and avdecc branches
    connections = []
    for idx in range(3):
        talker = AudioEndpoint(
            entity_id=f"aa{idx:02x}" * 4,
            unique_id=idx,
            direction=StreamDirection.TALKER,
            device_type="map2" if idx % 2 == 0 else "avdecc",
            device_name=f"talker-{idx}",
            channels=2,
            sample_rate=48000,
            node_address="http://127.0.0.1:8080",
        )
        listener = AudioEndpoint(
            entity_id=f"bb{idx:02x}" * 4,
            unique_id=idx + 10,
            direction=StreamDirection.LISTENER,
            device_type="map2",
            device_name=f"listener-{idx}",
            channels=2,
            sample_rate=48000,
            node_address="http://127.0.0.1:8080",
        )
        router.endpoints[talker.endpoint_id()] = talker
        router.endpoints[listener.endpoint_id()] = listener
        connections.append((talker.endpoint_id(), listener.endpoint_id()))

    # Provision/deprovision stubs
    async def _provision(_endpoint, _cfg):
        return True, ""

    async def _deprovision(_endpoint, _stream_id):
        return True, ""

    async def _connect_via_avdecc(_connection):
        return True

    async def _disconnect_via_avdecc(_connection):
        return True

    monkeypatch.setattr(router, "_provision_map2_stream", _provision)
    monkeypatch.setattr(router, "_deprovision_map2_stream", _deprovision)
    monkeypatch.setattr(router, "_connect_via_avdecc", _connect_via_avdecc)
    monkeypatch.setattr(router, "_disconnect_via_avdecc", _disconnect_via_avdecc)

    # Connect all pairs
    for talker_id, listener_id in connections:
        assert asyncio.run(router.connect(talker_id, listener_id)) is True

    assert len(router.connections) == 3

    # Disconnect all pairs
    for talker_id, listener_id in connections:
        assert asyncio.run(router.disconnect(talker_id, listener_id)) is True

    assert router.connections == {}


def test_build_engine_discovered_devices_payload_is_sorted_and_normalized():
    router = AvbRouter()
    talker = AudioEndpoint(
        entity_id="8899aabbccddeeff",
        unique_id=5,
        direction=StreamDirection.TALKER,
        device_type="map2",
        device_name="alpha-node",
        channels=2,
        sample_rate=48000,
        format="24-bit PCM",
        node_address="http://10.0.0.2:8080",
    )
    listener = AudioEndpoint(
        entity_id="0011223344556677",
        unique_id=1,
        direction=StreamDirection.LISTENER,
        device_type="avdecc",
        device_name="beta-endpoint",
        channels=0,
        sample_rate=0,
        format="",
        node_address="http://avb-node.local:8080",
        available=False,
    )
    router.endpoints[talker.endpoint_id()] = talker
    router.endpoints[listener.endpoint_id()] = listener

    payload = router._build_engine_discovered_devices_payload()

    assert [item["endpoint_id"] for item in payload] == [
        listener.endpoint_id(),
        talker.endpoint_id(),
    ]
    assert payload[0]["device_name"] == (
        f"AVB Listener [{listener.device_name}::{listener.endpoint_id()}]"
    )
    assert payload[0]["channels"] == 1
    assert payload[0]["sample_rate"] == 1
    assert payload[0]["audio_format"] == "24-bit PCM"
    assert payload[0]["host"] == "avb-node.local"
    assert payload[0]["available"] is False

    assert payload[1]["device_name"] == (
        f"AVB Talker [{talker.device_name}::{talker.endpoint_id()}]"
    )
    assert payload[1]["host"] == "10.0.0.2"


def test_sync_engine_discovered_devices_prefers_snake_case_setter():
    class _Engine:
        def __init__(self):
            self.snake_calls = []
            self.camel_calls = []

        def set_avb_discovered_devices(self, payload):
            self.snake_calls.append(payload)
            return {"success": True}

        def setAvbDiscoveredDevices(self, payload):
            self.camel_calls.append(payload)
            return {"success": True}

    engine = _Engine()
    router = AvbRouter(engine_service=SimpleNamespace(_engine=engine))
    endpoint = AudioEndpoint(
        entity_id="0011223344556677",
        unique_id=9,
        direction=StreamDirection.TALKER,
        device_type="map2",
        device_name="node-a",
        channels=2,
        sample_rate=48000,
    )
    router.endpoints[endpoint.endpoint_id()] = endpoint

    asyncio.run(router._sync_engine_discovered_devices())

    assert len(engine.snake_calls) == 1
    assert len(engine.camel_calls) == 0
    assert engine.snake_calls[0][0]["endpoint_id"] == endpoint.endpoint_id()


def test_sync_engine_discovered_devices_falls_back_to_camel_case_setter():
    class _Engine:
        def __init__(self):
            self.calls = []

        def setAvbDiscoveredDevices(self, payload):
            self.calls.append(payload)
            return {"success": True}

    engine = _Engine()
    router = AvbRouter(engine_service=SimpleNamespace(_engine=engine))

    asyncio.run(router._sync_engine_discovered_devices())

    assert engine.calls == [[]]


def test_stop_clears_router_state_and_syncs_empty_cache():
    class _Engine:
        def __init__(self):
            self.calls = []

        def set_avb_discovered_devices(self, payload):
            self.calls.append(payload)
            return {"success": True}

    engine = _Engine()
    router = AvbRouter(engine_service=SimpleNamespace(_engine=engine))
    connection = _make_connection()

    router.endpoints[connection.talker.endpoint_id()] = connection.talker
    router.connections[connection.connection_id()] = connection
    router._running = True

    asyncio.run(router.stop())

    assert router._running is False
    assert router.endpoints == {}
    assert router.connections == {}
    assert engine.calls[-1] == []
