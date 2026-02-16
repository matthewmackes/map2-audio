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
