import asyncio
from types import SimpleNamespace

from app.services.avb import srp_admission
from app.services.avb.srp_admission import (
    MsrpdAdapter,
    MrpdAdapter,
    SrpAdmissionRequest,
    SrpAdmissionService,
)


def _srp_config_values(required: bool = True):
    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": required,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }

    def _get(key, default=None):
        return values.get(key, default)

    return _get


def test_admission_denied_when_required_and_daemon_missing(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))
    monkeypatch.setattr(service, "_resolve_adapter", lambda: (None, None, None, []))

    captured = {}

    async def _capture(request, result):
        captured["decision"] = result.decision
        captured["reason_code"] = result.reason_code

    monkeypatch.setattr(service, "_persist", _capture)

    result = asyncio.run(service.admit(SrpAdmissionRequest(endpoint="router.connect")))

    assert result.decision == "denied"
    assert result.reason_code == "SRP_DAEMON_UNAVAILABLE"
    assert captured["decision"] == "denied"


def test_admission_allowed_when_adapter_acks(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))

    class _FakeAdapter:
        daemon_type = "mrpd"

        async def reserve(self, **_kwargs):
            return SimpleNamespace(
                success=True,
                reason_code="SRP_ADMITTED",
                reason="ok",
                raw_response="ACK",
            )

    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (_FakeAdapter(), "/tmp/mrp_socket", "/usr/sbin/mrpd", []),
    )
    monkeypatch.setattr(srp_admission.os.path, "exists", lambda p: p == "/tmp/mrp_socket")

    async def _noop_persist(_request, _result):
        return None

    monkeypatch.setattr(service, "_persist", _noop_persist)

    result = asyncio.run(
        service.admit(
            SrpAdmissionRequest(
                endpoint="router.connect",
                stream_id="talker->listener",
                talker_id="t1",
                listener_id="l1",
            )
        )
    )

    assert result.decision == "allowed"
    assert result.reason_code == "SRP_ADMITTED"
    assert result.reservation_id is not None
    assert result.daemon_type == "mrpd"


def test_release_updates_log_store(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))

    class _FakeAdapter:
        daemon_type = "mrpd"

        async def release(self, **_kwargs):
            return SimpleNamespace(
                success=True,
                reason_code="SRP_RELEASED",
                reason="released",
                raw_response="OK",
            )

    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (_FakeAdapter(), "/tmp/mrp_socket", "/usr/sbin/mrpd", []),
    )

    captured = {}

    async def _mark_release(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(service._log_store, "mark_release", _mark_release)

    result = asyncio.run(
        service.release(
            reservation_id="srp-res-1",
            endpoint="router.disconnect",
            stream_id="a->b",
            talker_id="a",
            listener_id="b",
        )
    )

    assert result.success is True
    assert captured["reservation_id"] == "srp-res-1"
    assert captured["success"] is True


def test_status_reports_selected_daemon(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))

    fake_adapter = SimpleNamespace(daemon_type="mrpd")
    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (fake_adapter, "/tmp/mrp_socket", "/usr/sbin/mrpd", [{"daemon_type": "mrpd"}]),
    )

    async def _ping(_adapter, _socket_path):
        return True, None

    monkeypatch.setattr(service, "_ping_daemon", _ping)

    status = asyncio.run(service.get_status())

    assert status["enabled"] is True
    assert status["required"] is True
    assert status["daemon_type"] == "mrpd"
    assert status["running"] is True


def test_status_reports_daemon_down_error(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))

    fake_adapter = SimpleNamespace(daemon_type="mrpd")
    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (fake_adapter, "/tmp/mrp_socket", "/usr/sbin/mrpd", [{"daemon_type": "mrpd"}]),
    )

    async def _ping(_adapter, _socket_path):
        return False, "SRP daemon ping failed: timeout"

    monkeypatch.setattr(service, "_ping_daemon", _ping)

    status = asyncio.run(service.get_status())

    assert status["running"] is False
    assert status["last_error"] == "SRP daemon ping failed: timeout"


def test_status_clears_last_error_when_daemon_recovers(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))

    fake_adapter = SimpleNamespace(daemon_type="mrpd")
    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (fake_adapter, "/tmp/mrp_socket", "/usr/sbin/mrpd", [{"daemon_type": "mrpd"}]),
    )

    ping_results = [
        (False, "SRP daemon ping failed: timeout"),
        (True, None),
    ]

    async def _ping(_adapter, _socket_path):
        return ping_results.pop(0)

    monkeypatch.setattr(service, "_ping_daemon", _ping)

    down_status = asyncio.run(service.get_status())
    up_status = asyncio.run(service.get_status())

    assert down_status["running"] is False
    assert down_status["last_error"] == "SRP daemon ping failed: timeout"
    assert up_status["running"] is True
    assert up_status["last_error"] is None


def test_mrpd_adapter_formats_normalized_reserve_and_release_messages():
    adapter = MrpdAdapter()
    request = SrpAdmissionRequest(
        endpoint="router.connect",
        stream_id="11:22:33:44:55:66:77:88",
        talker_id="0011223344556677:0",
        listener_id="8899AABBCCDDEEFF:1",
    )

    reserve = adapter.build_reserve_message(
        request=request,
        reservation_id="srp-abc123",
        vlan_id=2,
        sr_class="A",
        priority=3,
    )
    release = adapter.build_release_message("srp-abc123")

    assert reserve.startswith("S++:")
    assert "S=1122334455667788" in reserve
    assert "T=00:11:22:33:44:55" in reserve
    assert "L=88:99:aa:bb:cc:dd" in reserve
    assert "V=2" in reserve
    assert "C=A" in reserve
    assert "P=3" in reserve
    assert "R=srp-abc123" in reserve
    assert release == "S--:R=srp-abc123"


def test_msrpd_adapter_formats_normalized_reserve_and_release_messages():
    adapter = MsrpdAdapter()
    request = SrpAdmissionRequest(
        endpoint="avdecc.connections",
        stream_id="0xAABBCCDDEEFF0011",
        talker_mac="00:aa:bb:cc:dd:ee",
        listener_id="1122334455667788:1",
    )

    reserve = adapter.build_reserve_message(
        request=request,
        reservation_id="srp-789",
        vlan_id=3,
        sr_class="B",
        priority=2,
    )
    release = adapter.build_release_message("srp-789")

    assert reserve.startswith("RESERVE ")
    assert "STREAM_ID=aabbccddeeff0011" in reserve
    assert "TALKER_MAC=00:aa:bb:cc:dd:ee" in reserve
    assert "LISTENER_MAC=11:22:33:44:55:66" in reserve
    assert "VLAN_ID=3" in reserve
    assert "CLASS=B" in reserve
    assert "PRIORITY=2" in reserve
    assert "RESERVATION_ID=srp-789" in reserve
    assert release == "RELEASE RESERVATION_ID=srp-789"


def test_classify_response_denies_not_ready_phrase():
    success, reason_code, reason = srp_admission._BaseSrpAdapter._classify_response("NOT READY")

    assert success is False
    assert reason_code == "SRP_DENIED"
    assert "rejected" in reason


def test_classify_response_prefers_deny_when_ack_and_error_both_present():
    success, reason_code, reason = srp_admission._BaseSrpAdapter._classify_response("ACK ERROR")

    assert success is False
    assert reason_code == "SRP_DENIED"
    assert "rejected" in reason


def test_adapter_reserve_timeout_maps_to_timeout_reason(monkeypatch):
    adapter = MrpdAdapter()

    async def _timeout_exchange(_socket, _message, _timeout_ms):
        raise TimeoutError("timed out")

    monkeypatch.setattr(srp_admission._UnixSocketTransport, "exchange", _timeout_exchange)

    result = asyncio.run(
        adapter.reserve(
            control_socket="/tmp/nonexistent.sock",
            timeout_ms=100,
            request=SrpAdmissionRequest(endpoint="router.connect"),
            reservation_id="srp-timeout",
            vlan_id=2,
            sr_class="A",
        )
    )

    assert result.success is False
    assert result.reason_code == "SRP_TIMEOUT"


def test_adapter_release_timeout_maps_to_timeout_reason(monkeypatch):
    adapter = MrpdAdapter()

    async def _timeout_exchange(_socket, _message, _timeout_ms):
        raise TimeoutError("timed out")

    monkeypatch.setattr(srp_admission._UnixSocketTransport, "exchange", _timeout_exchange)

    result = asyncio.run(
        adapter.release(
            control_socket="/tmp/nonexistent.sock",
            timeout_ms=100,
            reservation_id="srp-timeout",
        )
    )

    assert result.success is False
    assert result.reason_code == "SRP_RELEASE_TIMEOUT"


def test_auto_detect_prefers_mrpd_when_both_binaries_exist(monkeypatch):
    service = SrpAdmissionService()

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }

    monkeypatch.setattr(srp_admission, "config_get", lambda key, default=None: values.get(key, default))
    monkeypatch.setattr(
        srp_admission.shutil,
        "which",
        lambda cmd: f"/usr/sbin/{cmd}" if cmd in {"mrpd", "msrpd"} else None,
    )
    monkeypatch.setattr(srp_admission.os.path, "exists", lambda _path: False)

    adapter, socket_path, binary_path, _detected = service._resolve_adapter()

    assert adapter is not None
    assert adapter.daemon_type == "mrpd"
    assert binary_path == "/usr/sbin/mrpd"
    assert socket_path in {"/var/run/mrp_socket", "/run/mrp_socket"}


def test_auto_detect_falls_back_to_msrpd(monkeypatch):
    service = SrpAdmissionService()

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }

    monkeypatch.setattr(srp_admission, "config_get", lambda key, default=None: values.get(key, default))

    def _which(cmd):
        if cmd == "msrpd":
            return "/usr/sbin/msrpd"
        return None

    monkeypatch.setattr(srp_admission.shutil, "which", _which)
    monkeypatch.setattr(srp_admission.os.path, "exists", lambda _path: False)

    adapter, socket_path, binary_path, _detected = service._resolve_adapter()

    assert adapter is not None
    assert adapter.daemon_type == "msrpd"
    assert binary_path == "/usr/sbin/msrpd"
    assert socket_path in {"/run/msrpd/msrpd.sock", "/var/run/msrpd.sock", "/run/msrpd.sock"}


def test_auto_detect_prefers_live_socket_when_other_daemon_only_has_binary(monkeypatch):
    service = SrpAdmissionService()

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }

    monkeypatch.setattr(srp_admission, "config_get", lambda key, default=None: values.get(key, default))
    monkeypatch.setattr(
        srp_admission.shutil,
        "which",
        lambda cmd: f"/usr/sbin/{cmd}" if cmd in {"mrpd", "msrpd"} else None,
    )
    monkeypatch.setattr(
        srp_admission.os.path,
        "exists",
        lambda path: path == "/run/msrpd/msrpd.sock",
    )

    adapter, socket_path, binary_path, _detected = service._resolve_adapter()

    assert adapter is not None
    assert adapter.daemon_type == "msrpd"
    assert socket_path == "/run/msrpd/msrpd.sock"
    assert binary_path == "/usr/sbin/msrpd"


def test_auto_detect_selects_socket_only_daemon_over_binary_only_daemon(monkeypatch):
    service = SrpAdmissionService()

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }

    monkeypatch.setattr(srp_admission, "config_get", lambda key, default=None: values.get(key, default))

    def _which(cmd):
        if cmd == "msrpd":
            return "/usr/sbin/msrpd"
        return None

    monkeypatch.setattr(srp_admission.shutil, "which", _which)
    monkeypatch.setattr(
        srp_admission.os.path,
        "exists",
        lambda path: path == "/var/run/mrp_socket",
    )

    adapter, socket_path, binary_path, _detected = service._resolve_adapter()

    assert adapter is not None
    assert adapter.daemon_type == "mrpd"
    assert socket_path == "/var/run/mrp_socket"
    assert binary_path is None


def test_admit_auto_falls_back_to_alternate_daemon_on_transport_failure(monkeypatch):
    service = SrpAdmissionService()

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }
    monkeypatch.setattr(srp_admission, "config_get", lambda key, default=None: values.get(key, default))
    monkeypatch.setattr(
        srp_admission.os.path,
        "exists",
        lambda path: path in {"/tmp/mrpd.sock", "/tmp/msrpd.sock"},
    )

    class _PrimaryAdapter:
        daemon_type = "mrpd"

        def __init__(self):
            self.calls = 0

        async def reserve(self, **_kwargs):
            self.calls += 1
            return SimpleNamespace(
                success=False,
                reason_code="SRP_TIMEOUT",
                reason="timeout",
                raw_response=None,
            )

    class _SecondaryAdapter:
        daemon_type = "msrpd"

        def __init__(self):
            self.calls = 0

        async def reserve(self, **_kwargs):
            self.calls += 1
            return SimpleNamespace(
                success=True,
                reason_code="SRP_ADMITTED",
                reason="ok",
                raw_response="ACK",
            )

    primary = _PrimaryAdapter()
    secondary = _SecondaryAdapter()
    service._adapters = {"mrpd": primary, "msrpd": secondary}

    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (
            primary,
            "/tmp/mrpd.sock",
            "/usr/sbin/mrpd",
            [
                {
                    "daemon_type": "mrpd",
                    "binary_path": "/usr/sbin/mrpd",
                    "control_socket": "/tmp/mrpd.sock",
                    "socket_exists": True,
                },
                {
                    "daemon_type": "msrpd",
                    "binary_path": "/usr/sbin/msrpd",
                    "control_socket": "/tmp/msrpd.sock",
                    "socket_exists": True,
                },
            ],
        ),
    )

    async def _noop_persist(_request, _result):
        return None

    monkeypatch.setattr(service, "_persist", _noop_persist)

    result = asyncio.run(service.admit(SrpAdmissionRequest(endpoint="router.connect")))

    assert result.decision == "allowed"
    assert result.daemon_type == "msrpd"
    assert primary.calls == 1
    assert secondary.calls == 1


def test_status_auto_falls_back_to_healthy_alternate_daemon(monkeypatch):
    service = SrpAdmissionService()
    monkeypatch.setattr(srp_admission, "config_get", _srp_config_values(required=True))

    primary = SimpleNamespace(daemon_type="mrpd")
    secondary = SimpleNamespace(daemon_type="msrpd")
    service._adapters = {"mrpd": primary, "msrpd": secondary}

    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (
            primary,
            "/tmp/mrpd.sock",
            "/usr/sbin/mrpd",
            [
                {
                    "daemon_type": "mrpd",
                    "binary_path": "/usr/sbin/mrpd",
                    "control_socket": "/tmp/mrpd.sock",
                    "socket_exists": True,
                },
                {
                    "daemon_type": "msrpd",
                    "binary_path": "/usr/sbin/msrpd",
                    "control_socket": "/tmp/msrpd.sock",
                    "socket_exists": True,
                },
            ],
        ),
    )

    async def _ping(adapter, _socket_path):
        if adapter.daemon_type == "mrpd":
            return False, "mrpd timeout"
        return True, None

    monkeypatch.setattr(service, "_ping_daemon", _ping)

    status = asyncio.run(service.get_status())

    assert status["running"] is True
    assert status["daemon_type"] == "msrpd"
    assert status["control_socket"] == "/tmp/msrpd.sock"
    assert status["last_error"] is None


def test_release_auto_falls_back_to_alternate_daemon_on_transport_failure(monkeypatch):
    service = SrpAdmissionService()

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.srp.daemon": "auto",
        "avb.srp.control_socket": "",
        "avb.srp.timeout_ms": 500,
        "avb.srp.vlan_id": 2,
        "avb.srp.class": "A",
    }
    monkeypatch.setattr(srp_admission, "config_get", lambda key, default=None: values.get(key, default))
    monkeypatch.setattr(
        srp_admission.os.path,
        "exists",
        lambda path: path in {"/tmp/mrpd.sock", "/tmp/msrpd.sock"},
    )

    class _PrimaryAdapter:
        daemon_type = "mrpd"

        def __init__(self):
            self.calls = 0

        async def release(self, **_kwargs):
            self.calls += 1
            return SimpleNamespace(
                success=False,
                reason_code="SRP_RELEASE_TIMEOUT",
                reason="timeout",
                raw_response=None,
            )

    class _SecondaryAdapter:
        daemon_type = "msrpd"

        def __init__(self):
            self.calls = 0

        async def release(self, **_kwargs):
            self.calls += 1
            return SimpleNamespace(
                success=True,
                reason_code="SRP_RELEASED",
                reason="released",
                raw_response="OK",
            )

    primary = _PrimaryAdapter()
    secondary = _SecondaryAdapter()
    service._adapters = {"mrpd": primary, "msrpd": secondary}

    monkeypatch.setattr(
        service,
        "_resolve_adapter",
        lambda: (
            primary,
            "/tmp/mrpd.sock",
            "/usr/sbin/mrpd",
            [
                {
                    "daemon_type": "mrpd",
                    "binary_path": "/usr/sbin/mrpd",
                    "control_socket": "/tmp/mrpd.sock",
                    "socket_exists": True,
                },
                {
                    "daemon_type": "msrpd",
                    "binary_path": "/usr/sbin/msrpd",
                    "control_socket": "/tmp/msrpd.sock",
                    "socket_exists": True,
                },
            ],
        ),
    )

    captured = {}

    async def _mark_release(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(service._log_store, "mark_release", _mark_release)

    result = asyncio.run(
        service.release(
            reservation_id="srp-res-1",
            endpoint="router.disconnect",
            stream_id="a->b",
            talker_id="a",
            listener_id="b",
        )
    )

    assert result.success is True
    assert result.daemon_type == "msrpd"
    assert primary.calls == 1
    assert secondary.calls == 1
    assert captured["reservation_id"] == "srp-res-1"
    assert captured["success"] is True
