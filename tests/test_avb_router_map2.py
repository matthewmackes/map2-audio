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
        node_id="node-a",
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
        node_id="node-b",
    )
    return StreamConnection(talker=talker, listener=listener, state=ConnectionState.CONNECTING)


def test_connect_map2_to_map2_success(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    calls = []

    async def fake_provision(endpoint, stream_config):
        calls.append((endpoint.endpoint_id(), dict(stream_config)))
        return True, ""

    monkeypatch.setattr(router, "_provision_map2_stream", fake_provision)

    ok = asyncio.run(router._connect_map2_to_map2(connection))
    assert ok is True
    assert len(calls) == 2
    talker_payload = next(payload for endpoint_id, payload in calls if endpoint_id == connection.talker.endpoint_id())
    listener_payload = next(payload for endpoint_id, payload in calls if endpoint_id == connection.listener.endpoint_id())

    assert talker_payload["owner_node_id"] == "node-a"
    assert talker_payload["peer_node_id"] == "node-b"
    assert talker_payload["talker_node_id"] == "node-a"
    assert talker_payload["listener_node_id"] == "node-b"
    assert talker_payload["owner_endpoint_id"] == connection.talker.endpoint_id()
    assert talker_payload["peer_endpoint_id"] == connection.listener.endpoint_id()
    assert talker_payload["talker_endpoint_id"] == connection.talker.endpoint_id()
    assert talker_payload["listener_endpoint_id"] == connection.listener.endpoint_id()

    assert listener_payload["owner_node_id"] == "node-b"
    assert listener_payload["peer_node_id"] == "node-a"
    assert listener_payload["talker_node_id"] == "node-a"
    assert listener_payload["listener_node_id"] == "node-b"
    assert listener_payload["owner_endpoint_id"] == connection.listener.endpoint_id()
    assert listener_payload["peer_endpoint_id"] == connection.talker.endpoint_id()
    assert listener_payload["talker_endpoint_id"] == connection.talker.endpoint_id()
    assert listener_payload["listener_endpoint_id"] == connection.listener.endpoint_id()


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


def test_connect_map2_to_map2_retries_transient_talker_provision(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    attempts = {"talker": 0, "listener": 0}

    monkeypatch.setattr(
        avb_router_module,
        "config_get",
        lambda key, default=None: (
            2
            if key == "avb.router.retry.max_attempts"
            else 0
            if key in {"avb.router.retry.base_delay_ms", "avb.router.retry.max_delay_ms"}
            else False
            if "avb.srp" in key
            else default
        ),
    )

    async def fake_provision(endpoint, stream_config):
        if stream_config["direction"] == "talker":
            attempts["talker"] += 1
            if attempts["talker"] == 1:
                return False, "temporary timeout while provisioning talker"
            return True, ""
        attempts["listener"] += 1
        return True, ""

    monkeypatch.setattr(router, "_provision_map2_stream", fake_provision)

    ok = asyncio.run(router._connect_map2_to_map2(connection))
    assert ok is True
    assert attempts["talker"] == 2
    assert attempts["listener"] == 1


def test_connect_map2_to_map2_listener_failure_reports_rollback_failure(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    rollback_attempts = {"count": 0}

    monkeypatch.setattr(
        avb_router_module,
        "config_get",
        lambda key, default=None: (
            2
            if key == "avb.router.retry.max_attempts"
            else 0
            if key in {"avb.router.retry.base_delay_ms", "avb.router.retry.max_delay_ms"}
            else False
            if "avb.srp" in key
            else default
        ),
    )

    async def fake_provision(_endpoint, stream_config):
        if stream_config["direction"] == "talker":
            return True, ""
        return False, "listener timeout"

    async def fake_deprovision(_endpoint, _stream_id):
        rollback_attempts["count"] += 1
        return False, "rollback timeout"

    monkeypatch.setattr(router, "_provision_map2_stream", fake_provision)
    monkeypatch.setattr(router, "_deprovision_map2_stream", fake_deprovision)

    ok = asyncio.run(router._connect_map2_to_map2(connection))
    assert ok is False
    assert rollback_attempts["count"] == 2
    assert "listener provision failed: listener timeout" in (connection.error_message or "")
    assert "talker rollback failed: rollback timeout" in (connection.error_message or "")


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


def test_disconnect_map2_to_map2_retries_transient_deprovision(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_attempts = {"count": 0}
    listener_attempts = {"count": 0}

    monkeypatch.setattr(
        avb_router_module,
        "config_get",
        lambda key, default=None: (
            2
            if key == "avb.router.retry.max_attempts"
            else 0
            if key in {"avb.router.retry.base_delay_ms", "avb.router.retry.max_delay_ms"}
            else False
            if "avb.srp" in key
            else default
        ),
    )

    async def fake_deprovision(endpoint, _stream_id):
        if endpoint.direction == StreamDirection.TALKER:
            talker_attempts["count"] += 1
            if talker_attempts["count"] == 1:
                return False, "temporary network timeout"
            return True, ""
        listener_attempts["count"] += 1
        return True, ""

    monkeypatch.setattr(router, "_deprovision_map2_stream", fake_deprovision)

    ok = asyncio.run(router._disconnect_map2_to_map2(connection))
    assert ok is True
    assert talker_attempts["count"] == 2
    assert listener_attempts["count"] == 1


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


def test_connect_return_details_includes_trace_id_and_stage_outcomes(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)
    monkeypatch.setattr(router, "_connect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=True))

    result = asyncio.run(router.connect(talker_id, listener_id, return_details=True))

    assert result["success"] is True
    assert result["trace_id"].startswith("connect-")
    assert isinstance(result.get("stages"), list)
    assert any(stage.get("stage") == "connect.complete" and stage.get("status") == "ok" for stage in result["stages"])


def test_router_stats_include_loop_health_fields():
    router = AvbRouter()
    stats = router.get_stats()

    assert "loops" in stats
    assert stats["loops"]["running"] is False
    assert stats["loops"]["discovery_running"] is False
    assert stats["loops"]["cleanup_running"] is False
    assert stats["loops"]["discovery_cycles"] == 0
    assert stats["loops"]["cleanup_cycles"] == 0
    assert stats["loops"]["stale_removed_total"] == 0


def test_connect_return_details_marks_optional_allowed_without_reservation_warning(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": False,
    }
    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: values.get(key, default))
    monkeypatch.setattr(router, "_connect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=True))

    class _Admission:
        decision = "allowed"
        reservation_id = None
        admission_id = "adm-optional"
        reason_code = "SRP_ADMITTED"
        reason = "ok"

    class _SrpService:
        async def admit(self, _request):
            return _Admission()

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    result = asyncio.run(router.connect(talker_id, listener_id, return_details=True))

    assert result["success"] is True
    assert any(
        stage.get("stage") == "connect.srp_admit"
        and stage.get("status") == "warning"
        and "allowed without reservation_id" in stage.get("detail", "")
        for stage in result.get("stages", [])
    )


def test_connect_rejects_unexpected_srp_admission_decision(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": False,
    }
    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: values.get(key, default))

    async def _unexpected_connect(_connection):
        raise AssertionError("connect handler should not run for unexpected SRP decision")

    monkeypatch.setattr(router, "_connect_map2_to_map2", _unexpected_connect)

    class _Admission:
        decision = "mystery"
        reservation_id = None
        admission_id = "adm-mystery"
        reason_code = "SRP_UNKNOWN"
        reason = "unknown"

    class _SrpService:
        async def admit(self, _request):
            return _Admission()

    import app.services.avb.srp_admission as srp_admission_module

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    result = asyncio.run(router.connect(talker_id, listener_id, return_details=True))

    assert result["success"] is False
    assert result["reason"] == "Unexpected SRP admission decision: mystery"
    assert any(
        stage.get("stage") == "connect.srp_admit"
        and stage.get("status") == "error"
        and "Unexpected SRP admission decision: mystery" in stage.get("detail", "")
        for stage in result.get("stages", [])
    )


def test_connect_failure_records_rollback_release_skipped_without_reservation(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    router.endpoints[talker_id] = connection.talker
    router.endpoints[listener_id] = connection.listener

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)
    monkeypatch.setattr(router, "_connect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=False))

    result = asyncio.run(router.connect(talker_id, listener_id, return_details=True))

    assert result["success"] is False
    assert result["reason"] == "Connection failed"
    assert any(
        stage.get("stage") == "connect.rollback_release" and stage.get("status") == "skipped"
        for stage in result.get("stages", [])
    )


def test_disconnect_return_details_includes_trace_id_and_stage_outcomes(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    talker_id = connection.talker.endpoint_id()
    listener_id = connection.listener.endpoint_id()
    conn_id = connection.connection_id()
    connection.state = ConnectionState.CONNECTED
    router.connections[conn_id] = connection

    monkeypatch.setattr(router, "_disconnect_map2_to_map2", lambda _connection: asyncio.sleep(0, result=True))

    result = asyncio.run(router.disconnect(talker_id, listener_id, return_details=True))

    assert result["success"] is True
    assert result["trace_id"].startswith("disconnect-")
    assert isinstance(result.get("stages"), list)
    assert any(
        stage.get("stage") == "disconnect.complete" and stage.get("status") == "ok"
        for stage in result["stages"]
    )


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


def test_connect_failure_transitions_to_error_and_retries_to_connected(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    router.endpoints[connection.talker.endpoint_id()] = connection.talker
    router.endpoints[connection.listener.endpoint_id()] = connection.listener
    conn_id = connection.connection_id()

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)

    async def failing_connect(_connection):
        return False

    async def successful_connect(_connection):
        return True

    monkeypatch.setattr(router, "_connect_map2_to_map2", failing_connect)
    assert asyncio.run(router.connect(connection.talker.endpoint_id(), connection.listener.endpoint_id())) is False
    assert conn_id in router.connections
    assert router.connections[conn_id].state == ConnectionState.ERROR
    assert router.connections[conn_id].error_message == "Connection failed"

    monkeypatch.setattr(router, "_connect_map2_to_map2", successful_connect)
    assert asyncio.run(router.connect(connection.talker.endpoint_id(), connection.listener.endpoint_id())) is True
    assert conn_id in router.connections
    assert router.connections[conn_id].state == ConnectionState.CONNECTED


def test_disconnect_failure_transitions_to_error_and_retries_to_removed(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    conn_id = connection.connection_id()
    router.connections[conn_id] = connection
    router.endpoints[connection.talker.endpoint_id()] = connection.talker
    router.endpoints[connection.listener.endpoint_id()] = connection.listener

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)

    async def failing_disconnect(_connection):
        return False

    async def successful_disconnect(_connection):
        return True

    monkeypatch.setattr(router, "_disconnect_map2_to_map2", failing_disconnect)
    assert asyncio.run(router.disconnect(connection.talker.endpoint_id(), connection.listener.endpoint_id())) is False
    assert conn_id in router.connections
    assert router.connections[conn_id].state == ConnectionState.ERROR
    assert router.connections[conn_id].error_message == "Disconnection failed"

    monkeypatch.setattr(router, "_disconnect_map2_to_map2", successful_disconnect)
    assert asyncio.run(router.disconnect(connection.talker.endpoint_id(), connection.listener.endpoint_id())) is True
    assert conn_id not in router.connections


def test_connect_and_disconnect_wait_for_inflight_state_transitions(monkeypatch):
    router = AvbRouter()
    connection = _make_connection()
    router.endpoints[connection.talker.endpoint_id()] = connection.talker
    router.endpoints[connection.listener.endpoint_id()] = connection.listener

    monkeypatch.setattr(avb_router_module, "config_get", lambda key, default=None: False if "avb.srp" in key else default)

    connect_start = asyncio.Event()
    connect_proceed = asyncio.Event()

    async def delayed_connect(_connection):
        connect_start.set()
        await connect_proceed.wait()
        return True

    monkeypatch.setattr(router, "_connect_map2_to_map2", delayed_connect)

    async def run_connect():
        return await router.connect(connection.talker.endpoint_id(), connection.listener.endpoint_id())

    async def connect_and_check():
        connect_task = asyncio.create_task(run_connect())
        await asyncio.wait_for(connect_start.wait(), 1.0)
        conn_id = connection.connection_id()
        assert conn_id in router.connections
        assert router.connections[conn_id].state == ConnectionState.CONNECTING
        connect_proceed.set()
        assert await asyncio.wait_for(connect_task, 1.0) is True
        assert router.connections[connection.connection_id()].state == ConnectionState.CONNECTED

    asyncio.run(connect_and_check())

    disconnect_start = asyncio.Event()
    disconnect_proceed = asyncio.Event()
    router.endpoints[connection.talker.endpoint_id()] = connection.talker
    router.endpoints[connection.listener.endpoint_id()] = connection.listener

    async def delayed_disconnect(_connection):
        disconnect_start.set()
        await disconnect_proceed.wait()
        return True

    # Ensure connection remains available for explicit disconnect attempt
    connection.state = ConnectionState.CONNECTED
    router.connections[connection.connection_id()] = connection
    monkeypatch.setattr(router, "_disconnect_map2_to_map2", delayed_disconnect)

    async def run_disconnect():
        return await router.disconnect(connection.talker.endpoint_id(), connection.listener.endpoint_id())

    async def disconnect_and_check():
        disconnect_task = asyncio.create_task(run_disconnect())
        await asyncio.wait_for(disconnect_start.wait(), 1.0)
        assert connection.connection_id() in router.connections
        assert router.connections[connection.connection_id()].state == ConnectionState.DISCONNECTING
        disconnect_proceed.set()
        assert await asyncio.wait_for(disconnect_task, 1.0) is True
        assert connection.connection_id() not in router.connections

    asyncio.run(disconnect_and_check())


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


def test_extract_avdecc_entity_uses_engine_level_pybind_api():
    class _Engine:
        def get_avdecc_entities(self):
            return []

    engine = _Engine()
    assert avb_router_module._extract_avdecc_entity(engine) is engine


def test_discover_avdecc_endpoints_from_engine_level_api():
    class _Engine:
        def get_avdecc_entities(self):
            return [
                {
                    "entity_id": "0011223344556677",
                    "entity_name": "StageBox",
                    "group_name": "stage-a.local",
                    "mac_address": "00:11:22:33:44:55",
                    "talker_stream_sources": 1,
                    "listener_stream_sinks": 1,
                    "streams": [
                        {
                            "direction": "talker",
                            "unique_id": 3,
                            "channels": 8,
                            "sample_rate": 96000,
                            "format": "32-bit PCM",
                        },
                        {
                            "direction": "listener",
                            "unique_id": 7,
                            "channels": 4,
                            "sample_rate": 48000,
                            "format": "24-bit PCM",
                        },
                    ],
                }
            ]

    router = AvbRouter(avdecc_entity=_Engine())
    asyncio.run(router._discover_avdecc_endpoints())

    talkers = router.get_talkers()
    listeners = router.get_listeners()

    assert len(talkers) == 1
    assert len(listeners) == 1

    talker = talkers[0]
    listener = listeners[0]

    assert talker.device_type == "avdecc"
    assert talker.device_name == "StageBox @ stage-a.local"
    assert talker.host == "stage-a.local"
    assert talker.node_address == "avdecc://stage-a.local"
    assert talker.channels == 8
    assert talker.sample_rate == 96000
    assert talker.format == "32-bit PCM"
    assert talker.unique_id == 3

    assert listener.device_name == "StageBox @ stage-a.local"
    assert listener.host == "stage-a.local"
    assert listener.channels == 4
    assert listener.sample_rate == 48000
    assert listener.format == "24-bit PCM"
    assert listener.unique_id == 7


def test_resolve_avdecc_stream_profiles_parses_current_format_from_descriptor_arrays():
    router = AvbRouter()
    entity = {
        "entity_id": "0011223344556677",
        "talker_stream_sources": 1,
        "listener_stream_sinks": 1,
        "stream_inputs": [
            {
                "stream_index": 4,
                "current_format": 0x0200000818000005,
            }
        ],
        "stream_outputs": [
            {
                "stream_index": 2,
                "current_format": "0x0200000418000007",
            }
        ],
    }

    talker_profiles = router._resolve_avdecc_stream_profiles(entity, StreamDirection.TALKER)
    listener_profiles = router._resolve_avdecc_stream_profiles(entity, StreamDirection.LISTENER)

    assert len(talker_profiles) == 1
    assert len(listener_profiles) == 1
    assert talker_profiles[0] == {
        "unique_id": 4,
        "channels": 8,
        "sample_rate": 48000,
        "format": "24-bit PCM",
    }
    assert listener_profiles[0] == {
        "unique_id": 2,
        "channels": 4,
        "sample_rate": 96000,
        "format": "24-bit PCM",
    }


def test_discover_avdecc_endpoints_falls_back_to_default_when_format_data_is_missing():
    class _Engine:
        def get_avdecc_entities(self):
            return [
                {
                    "entity_id": "aabbccddeeff0011",
                    "entity_name": "FallbackNode",
                    "group_name": "fallback.local",
                    "talker_stream_sources": 1,
                    "listener_stream_sinks": 1,
                    "stream_inputs": [
                        {"stream_index": 0},
                    ],
                    "stream_outputs": [
                        {"stream_index": 1},
                    ],
                }
            ]

    router = AvbRouter(avdecc_entity=_Engine())
    asyncio.run(router._discover_avdecc_endpoints())

    talkers = router.get_talkers()
    listeners = router.get_listeners()

    assert len(talkers) == 1
    assert len(listeners) == 1
    assert talkers[0].channels == 1
    assert talkers[0].sample_rate == 1
    assert listeners[0].channels == 1
    assert listeners[0].sample_rate == 1


def test_connect_and_disconnect_via_avdecc_supports_snake_case_methods():
    class _Engine:
        def __init__(self):
            self.calls = []

        def connect_stream(self, *args):
            self.calls.append(("connect", args))
            return True

        def disconnect_stream(self, *args):
            self.calls.append(("disconnect", args))
            return True

    engine = _Engine()
    router = AvbRouter(avdecc_entity=engine)
    talker = AudioEndpoint(
        entity_id="0011223344556677",
        unique_id=2,
        direction=StreamDirection.TALKER,
        device_type="avdecc",
        device_name="Talker",
        channels=2,
        sample_rate=48000,
    )
    listener = AudioEndpoint(
        entity_id="8899aabbccddeeff",
        unique_id=5,
        direction=StreamDirection.LISTENER,
        device_type="avdecc",
        device_name="Listener",
        channels=2,
        sample_rate=48000,
    )
    connection = StreamConnection(talker=talker, listener=listener)

    assert asyncio.run(router._connect_via_avdecc(connection)) is True
    assert asyncio.run(router._disconnect_via_avdecc(connection)) is True

    assert engine.calls == [
        ("connect", (0x0011223344556677, 2, 0x8899AABBCCDDEEFF, 5)),
        ("disconnect", (0x0011223344556677, 2, 0x8899AABBCCDDEEFF, 5)),
    ]
