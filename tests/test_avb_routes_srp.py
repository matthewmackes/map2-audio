import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routes import avb as avb_routes
from app.services.avb import avb_router as avb_router_module
from app.services.avb import avb_service as avb_service_module
from app.services.avb import srp_admission as srp_admission_module
from app.services.avb import srp_log_store as srp_log_store_module


class _Admission:
    def __init__(
        self,
        *,
        decision: str,
        admission_id: str = "adm-1",
        reservation_id: str | None = None,
        reason_code: str = "SRP_DENIED",
        reason: str = "denied",
    ) -> None:
        self.decision = decision
        self.admission_id = admission_id
        self.reservation_id = reservation_id
        self.reason_code = reason_code
        self.reason = reason
        self.remediation = ["start daemon"]
        self.daemon_type = "mrpd"
        self.daemon_socket = "/tmp/mrp_socket"
        self.endpoint = "test"

    def to_dict(self):
        return {
            "decision": self.decision,
            "admission_id": self.admission_id,
            "reservation_id": self.reservation_id,
            "reason_code": self.reason_code,
            "reason": self.reason,
        }


class _DummySrpService:
    def __init__(self, admission: _Admission):
        self._admission = admission
        self.releases = []

    async def admit(self, _request):
        return self._admission

    async def release(self, **kwargs):
        self.releases.append(kwargs)
        return SimpleNamespace(
            success=True,
            reason_code="SRP_RELEASED",
            reason="released",
            raw_response="OK",
            to_dict=lambda: {
                "success": True,
                "reason_code": "SRP_RELEASED",
                "reason": "released",
            },
        )


def _enable_strict_srp(monkeypatch):
    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
    }

    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: values.get(key, default))


def _enable_optional_srp(monkeypatch):
    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": False,
    }

    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: values.get(key, default))


def test_router_connect_returns_409_when_admission_denied(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "0011223344556677:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "8899aabbccddeeff:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            return True

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(_Admission(decision="denied")),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.connect_streams(
                {"talker_id": "0011223344556677:0", "listener_id": "8899aabbccddeeff:1"}
            )
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_DENIED"


def test_router_connect_returns_srp_admission_on_allowed(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "0011223344556677:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "8899aabbccddeeff:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            return True

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(_Admission(decision="allowed", reservation_id="res-1")),
    )

    result = asyncio.run(
        avb_routes.connect_streams(
            {"talker_id": "0011223344556677:0", "listener_id": "8899aabbccddeeff:1"}
        )
    )

    assert result["success"] is True
    assert result["srp_admission"]["reservation_id"] == "res-1"
    assert result["connection_id"] == "0011223344556677:0→8899aabbccddeeff:1"


def test_router_connect_strict_srp_fails_when_allowed_without_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "0011223344556677:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "8899aabbccddeeff:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            raise AssertionError("connect must not be invoked without reservation in strict SRP mode")

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(_Admission(decision="allowed", reservation_id=None)),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.connect_streams(
                {"talker_id": "0011223344556677:0", "listener_id": "8899aabbccddeeff:1"}
            )
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_INVALID"


def test_router_connect_rolls_back_reservation_on_connect_exception(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "0011223344556677:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "8899aabbccddeeff:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            raise RuntimeError("router connect boom")

    releases = []

    class _SrpService(_DummySrpService):
        async def release(self, **kwargs):
            releases.append(kwargs)
            return await super().release(**kwargs)

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _SrpService(_Admission(decision="allowed", reservation_id="res-rollback")),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.connect_streams(
                {"talker_id": "0011223344556677:0", "listener_id": "8899aabbccddeeff:1"}
            )
        )

    assert exc.value.status_code == 500
    assert any(r.get("reservation_id") == "res-rollback" for r in releases)


def test_router_connect_allows_srp_bypass_when_not_required(monkeypatch):
    _enable_optional_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "0011223344556677:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "8899aabbccddeeff:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            return True

    bypass_admission = _Admission(decision="bypass", reservation_id=None)

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(bypass_admission),
    )

    result = asyncio.run(
        avb_routes.connect_streams(
            {"talker_id": "0011223344556677:0", "listener_id": "8899aabbccddeeff:1"}
        )
    )

    assert result["success"] is True
    assert result["connection_id"] == "0011223344556677:0→8899aabbccddeeff:1"
    # For bypass we still return admission payload; ensure decision propagated.
    assert result["srp_admission"]["decision"] == "bypass"


def test_router_connect_returns_500_on_srp_admission_exception(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "0011223344556677:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "8899aabbccddeeff:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            return True

    class _SrpService:
        async def admit(self, _request):
            raise RuntimeError("srp daemon unreachable")

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _SrpService())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.connect_streams(
                {"talker_id": "0011223344556677:0", "listener_id": "8899aabbccddeeff:1"}
            )
        )

    assert exc.value.status_code == 500
    assert "srp daemon unreachable" in str(exc.value.detail)


def test_router_connect_passes_reservation_to_router(monkeypatch):
    _enable_strict_srp(monkeypatch)

    captured = {}

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(self, talker_id, listener_id, reservation_id=None, admission_id=None):
            captured["talker_id"] = talker_id
            captured["listener_id"] = listener_id
            captured["reservation_id"] = reservation_id
            captured["admission_id"] = admission_id
            return True

    admission = _Admission(
        decision="allowed",
        admission_id="adm-allow",
        reservation_id="res-allow",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    result = asyncio.run(
        avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"})
    )

    assert result["success"] is True
    assert captured["reservation_id"] == "res-allow"
    assert captured["admission_id"] == "adm-allow"
    assert result["srp_admission"]["admission_id"] == "adm-allow"


def test_router_connect_fails_when_allowed_missing_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, *_args, **_kwargs):
            raise AssertionError("router.connect must not be called without reservation_id in allowed decision")

    admission = _Admission(
        decision="allowed",
        admission_id="adm-missing",
        reservation_id=None,
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"})
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_INVALID"
    assert exc.value.detail["reason_code"] == "SRP_INVALID_ADMISSION"


def test_router_connect_returns_404_when_endpoints_missing_before_srp_admission(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Router:
        endpoints = {}

        async def connect(self, *_args, **_kwargs):
            raise AssertionError("router.connect must not be called when endpoints are missing")

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: (_ for _ in ()).throw(AssertionError("SRP admission must not run for missing endpoints")),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 404
    assert "talker_id=t:0" in str(exc.value.detail)
    assert "listener_id=l:1" in str(exc.value.detail)


def test_router_connect_bypass_passes_sentinel_reservation(monkeypatch):
    _enable_optional_srp(monkeypatch)

    captured = {}

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        endpoints = {
            "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
            "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
        }

        async def connect(self, _talker_id, _listener_id, reservation_id=None, admission_id=None):
            captured["reservation_id"] = reservation_id
            captured["admission_id"] = admission_id
            return True

    admission = _Admission(
        decision="bypass",
        admission_id="adm-bypass",
        reservation_id=None,
        reason_code="SRP_OPTIONAL_BYPASS",
        reason="optional bypass",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    result = asyncio.run(
        avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"})
    )

    assert result["success"] is True
    assert captured["reservation_id"] == ""
    assert captured["admission_id"] is None


def test_router_connect_exception_releases_route_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(self, *_args, **_kwargs):
            raise RuntimeError("router connect crashed")

    admission = _Admission(
        decision="allowed",
        admission_id="adm-exc",
        reservation_id="res-exc",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 500
    assert "router connect crashed" in str(exc.value.detail)
    assert srp_service.releases == [
        {
            "reservation_id": "res-exc",
            "endpoint": "router.connect.exception",
            "stream_id": "t:0->l:1",
            "talker_id": "t:0",
            "listener_id": "l:1",
        }
    ]


def test_router_connect_failure_with_release_warning_returns_structured_500(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(
            self,
            _talker_id,
            _listener_id,
            reservation_id=None,
            admission_id=None,
            return_details=False,
        ):
            assert return_details is True
            assert reservation_id == "res-allow-warning"
            assert admission_id == "adm-allow-warning"
            return {
                "success": False,
                "reason": "Connection failed",
                "srp_release_warning": {
                    "code": "SRP_RELEASE_FAILED",
                    "reason": "Router connect failed and SRP rollback release failed",
                    "reservation_id": "res-allow-warning",
                    "detail": "rollback timeout",
                    "remediation": ["check daemon"],
                },
            }

    admission = _Admission(
        decision="allowed",
        admission_id="adm-allow-warning",
        reservation_id="res-allow-warning",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ROUTER_CONNECT_FAILED"
    assert exc.value.detail["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert exc.value.detail["srp_release_warning"]["reservation_id"] == "res-allow-warning"


def test_router_connect_failure_with_release_payload_returns_structured_500(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(
            self,
            _talker_id,
            _listener_id,
            reservation_id=None,
            admission_id=None,
            return_details=False,
        ):
            assert return_details is True
            assert reservation_id == "res-allow-release"
            assert admission_id == "adm-allow-release"
            return {
                "success": False,
                "reason": "Connection failed",
                "srp_release": {
                    "success": True,
                    "reason_code": "SRP_RELEASED",
                    "reason": "released",
                    "reservation_id": "res-allow-release",
                },
            }

    admission = _Admission(
        decision="allowed",
        admission_id="adm-allow-release",
        reservation_id="res-allow-release",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ROUTER_CONNECT_FAILED"
    assert exc.value.detail["message"] == "Connection failed"
    assert exc.value.detail["srp_release"]["reason_code"] == "SRP_RELEASED"
    assert exc.value.detail["srp_release"]["reservation_id"] == "res-allow-release"


def test_router_connect_failure_with_reason_returns_structured_500(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(
            self,
            _talker_id,
            _listener_id,
            reservation_id=None,
            admission_id=None,
            return_details=False,
        ):
            assert return_details is True
            return {
                "success": False,
                "reason": "Engine refused reservation",
            }

    admission = _Admission(
        decision="allowed",
        admission_id="adm-allow-reason",
        reservation_id="res-allow-reason",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ROUTER_CONNECT_FAILED"
    assert exc.value.detail["message"] == "Engine refused reservation"
    assert "srp_release" not in exc.value.detail
    assert "srp_release_warning" not in exc.value.detail


def test_router_connect_legacy_bool_failure_keeps_plain_500(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(self, _talker_id, _listener_id, reservation_id=None, admission_id=None):
            return False

    admission = _Admission(
        decision="allowed",
        admission_id="adm-allow-legacy",
        reservation_id="res-allow-legacy",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 500
    assert exc.value.detail == "Connection failed"


def test_router_disconnect_includes_srp_release_payload_from_router(monkeypatch):
    class _Router:
        async def disconnect(self, _talker_id, _listener_id, return_details=False):
            assert return_details is True
            return {
                "success": True,
                "srp_release": {
                    "success": True,
                    "reason_code": "SRP_RELEASED",
                    "reason": "released",
                    "reservation_id": "res-router-disconnect",
                },
            }

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())

    result = asyncio.run(avb_routes.disconnect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert result["success"] is True
    assert result["message"] == "Stream disconnected successfully"
    assert result["srp_release"]["reason_code"] == "SRP_RELEASED"
    assert result["srp_release"]["reservation_id"] == "res-router-disconnect"


def test_router_disconnect_includes_srp_release_warning_from_router(monkeypatch):
    class _Router:
        async def disconnect(self, _talker_id, _listener_id, return_details=False):
            assert return_details is True
            return {
                "success": True,
                "srp_release_warning": {
                    "code": "SRP_RELEASE_FAILED",
                    "reason": "Router disconnect succeeded but SRP reservation release failed",
                    "reservation_id": "res-router-warn",
                    "detail": "SRP_RELEASE_TIMEOUT: timeout",
                    "remediation": ["check daemon"],
                },
            }

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())

    result = asyncio.run(avb_routes.disconnect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert result["success"] is True
    assert result["message"] == "Stream disconnected successfully"
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "res-router-warn"


def test_router_disconnect_legacy_router_signature_still_supported(monkeypatch):
    class _Router:
        async def disconnect(self, _talker_id, _listener_id):
            return True

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())

    result = asyncio.run(avb_routes.disconnect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert result["success"] is True
    assert result["message"] == "Stream disconnected successfully"
    assert "srp_release" not in result
    assert "srp_release_warning" not in result


def test_router_connect_post_success_exception_does_not_release(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Endpoint:
        def __init__(self, mac_address, device_type):
            self.mac_address = mac_address
            self.device_type = device_type

    class _Router:
        def __init__(self):
            self.endpoints = {
                "t:0": _Endpoint("00:11:22:33:44:55", "map2"),
                "l:1": _Endpoint("66:77:88:99:aa:bb", "map2"),
            }

        async def connect(self, *_args, **_kwargs):
            return True

    class _BrokenAdmission(_Admission):
        def to_dict(self):
            raise RuntimeError("response serialization failed")

    admission = _BrokenAdmission(
        decision="allowed",
        admission_id="adm-success-exc",
        reservation_id="res-success-exc",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_router_module, "get_avb_router", lambda: _Router())
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_streams({"talker_id": "t:0", "listener_id": "l:1"}))

    assert exc.value.status_code == 500
    assert "response serialization failed" in str(exc.value.detail)
    assert srp_service.releases == []


def test_start_stream_strict_mode_denies_when_admission_denied(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return None

        def bind_srp_reservation(self, *_args, **_kwargs):
            return True

        async def start_stream(self, _stream_id):
            return {"status": "started"}

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(_Admission(decision="denied")),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-1"))

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_DENIED"


def test_start_stream_fails_when_allowed_missing_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return None

        def bind_srp_reservation(self, *_args, **_kwargs):
            raise AssertionError("bind_srp_reservation must not be called without reservation_id")

        async def start_stream(self, _stream_id):
            raise AssertionError("start_stream must not be called without reservation_id")

    admission = _Admission(
        decision="allowed",
        admission_id="adm-missing-stream",
        reservation_id=None,
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-missing-res"))

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_INVALID"
    assert exc.value.detail["reason_code"] == "SRP_INVALID_ADMISSION"


def test_start_stream_exception_releases_created_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self._binding = None
            self.cleared = []

        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return self._binding

        def bind_srp_reservation(self, _stream_id, reservation_id, admission_id=None, metadata=None):
            self._binding = {
                "reservation_id": reservation_id,
                "admission_id": admission_id,
                "metadata": dict(metadata or {}),
            }
            return True

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            self._binding = None
            return None

        async def start_stream(self, _stream_id):
            raise RuntimeError("start failed unexpectedly")

    service = _Service()
    admission = _Admission(
        decision="allowed",
        admission_id="adm-start-exc",
        reservation_id="res-start-exc",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-start-exc"))

    assert exc.value.status_code == 500
    assert "start failed unexpectedly" in str(exc.value.detail)
    assert srp_service.releases == [
        {
            "reservation_id": "res-start-exc",
            "endpoint": "streams.start.exception",
            "stream_id": "stream-start-exc",
        }
    ]
    assert service.cleared == ["stream-start-exc"]


def test_start_stream_post_success_exception_does_not_release(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self._binding = None
            self.cleared = []

        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return self._binding

        def bind_srp_reservation(self, _stream_id, reservation_id, admission_id=None, metadata=None):
            self._binding = {
                "reservation_id": reservation_id,
                "admission_id": admission_id,
                "metadata": dict(metadata or {}),
            }
            return True

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            self._binding = None

        async def start_stream(self, _stream_id):
            return ("started",)

    service = _Service()
    admission = _Admission(
        decision="allowed",
        admission_id="adm-post-success",
        reservation_id="res-post-success",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-post-success"))

    assert exc.value.status_code == 500
    assert "tuple" in str(exc.value.detail)
    assert srp_service.releases == []
    assert service.cleared == []


def test_start_stream_bind_failure_releases_admission_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return None

        def bind_srp_reservation(self, *_args, **_kwargs):
            return False

        def clear_srp_reservation(self, _stream_id):
            raise AssertionError("clear_srp_reservation must not run when binding never succeeded")

        async def start_stream(self, _stream_id):
            raise AssertionError("start_stream must not run when SRP binding fails")

    service = _Service()
    admission = _Admission(
        decision="allowed",
        admission_id="adm-bind-fail",
        reservation_id="res-bind-fail",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-bind-fail"))

    assert exc.value.status_code == 500
    assert exc.value.detail == "Failed to bind SRP reservation to stream"
    assert srp_service.releases == [
        {
            "reservation_id": "res-bind-fail",
            "endpoint": "streams.start.exception",
            "stream_id": "stream-bind-fail",
        }
    ]


def test_start_stream_failure_preserves_status_when_rollback_release_raises(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self._binding = None
            self.cleared = []

        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return self._binding

        def bind_srp_reservation(self, _stream_id, reservation_id, admission_id=None, metadata=None):
            self._binding = {
                "reservation_id": reservation_id,
                "admission_id": admission_id,
                "metadata": dict(metadata or {}),
            }
            return True

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            self._binding = None
            return None

        async def start_stream(self, _stream_id):
            return {"error": "engine start failed", "code": "START_FAILED"}

    class _FailingSrpService:
        def __init__(self, admission):
            self._admission = admission

        async def admit(self, _request):
            return self._admission

        async def release(self, **_kwargs):
            raise RuntimeError("rollback release failed")

    service = _Service()
    admission = _Admission(
        decision="allowed",
        admission_id="adm-start-fail",
        reservation_id="res-start-fail",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _FailingSrpService(admission),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-start-fail"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "engine start failed"
    assert service.cleared == []
    assert service._binding is not None


def test_start_stream_failure_rolls_back_once(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self._binding = None
            self.cleared = []

        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return self._binding

        def bind_srp_reservation(self, _stream_id, reservation_id, admission_id=None, metadata=None):
            self._binding = {
                "reservation_id": reservation_id,
                "admission_id": admission_id,
                "metadata": dict(metadata or {}),
            }
            return True

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            self._binding = None
            return None

        async def start_stream(self, _stream_id):
            return {"error": "engine start failed", "code": "START_FAILED"}

    class _CountingSrpService:
        def __init__(self, admission):
            self._admission = admission
            self.release_calls = []

        async def admit(self, _request):
            return self._admission

        async def release(self, **kwargs):
            self.release_calls.append(kwargs)
            return SimpleNamespace(
                success=True,
                reason_code="SRP_RELEASED",
                reason="released",
                raw_response="OK",
                to_dict=lambda: {
                    "success": True,
                    "reason_code": "SRP_RELEASED",
                    "reason": "released",
                },
            )

    service = _Service()
    admission = _Admission(
        decision="allowed",
        admission_id="adm-start-fail-once",
        reservation_id="res-start-fail-once",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _CountingSrpService(admission)

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: srp_service,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.start_stream("stream-start-fail-once"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "engine start failed"
    assert len(srp_service.release_calls) == 1
    assert srp_service.release_calls[0]["endpoint"] == "streams.start.rollback"
    assert service.cleared == ["stream-start-fail-once"]


def test_start_stream_optional_mode_allows_bypass_without_binding(monkeypatch):
    _enable_optional_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self.bind_calls = []

        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "config": {"channels": 2, "sample_rate": 48000},
            }

        def get_srp_binding(self, _stream_id):
            return None

        def bind_srp_reservation(self, stream_id, reservation_id, **kwargs):
            self.bind_calls.append((stream_id, reservation_id, kwargs))
            return True

        async def start_stream(self, _stream_id):
            return {"status": "started"}

    service = _Service()
    admission = _Admission(
        decision="bypass",
        admission_id="adm-bypass-stream",
        reservation_id=None,
        reason_code="SRP_OPTIONAL_BYPASS",
        reason="optional bypass",
    )

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(admission),
    )

    result = asyncio.run(avb_routes.start_stream("stream-optional"))

    assert result["status"] == "started"
    assert result["srp_admission"]["decision"] == "bypass"
    assert service.bind_calls == []


def test_delete_stream_release_failure_returns_warning_and_succeeds(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self.cleared = []

        def is_available(self):
            return True

        def get_srp_binding(self, _stream_id):
            return {"reservation_id": "res-delete-fail", "admission_id": "adm-delete-fail"}

        async def delete_stream(self, _stream_id):
            return {"status": "deleted"}

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            return None

    class _FailingSrpService:
        async def release(self, **_kwargs):
            raise RuntimeError("delete release timeout")

    service = _Service()

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _FailingSrpService(),
    )

    result = asyncio.run(avb_routes.delete_stream("stream-delete-fail"))

    assert result["status"] == "deleted"
    assert "srp_release" not in result
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "res-delete-fail"
    assert "delete release timeout" in result["srp_release_warning"]["detail"]
    assert service.cleared == []


def test_stop_stream_releases_bound_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self.cleared = []

        def is_available(self):
            return True

        def get_srp_binding(self, _stream_id):
            return {"reservation_id": "res-1", "admission_id": "adm-1"}

        async def stop_stream(self, _stream_id):
            return {"status": "stopped"}

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            return None

    service = _Service()
    srp_service = _DummySrpService(_Admission(decision="allowed", reservation_id="res-1"))

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    result = asyncio.run(avb_routes.stop_stream("stream-1"))

    assert result["status"] == "stopped"
    assert result["srp_release"]["success"] is True
    assert result["srp_release"]["reservation_id"] == "res-1"
    assert service.cleared == ["stream-1"]


def test_stop_stream_release_failure_returns_warning_and_succeeds(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Service:
        def __init__(self):
            self.cleared = []

        def is_available(self):
            return True

        def get_srp_binding(self, _stream_id):
            return {"reservation_id": "res-stop-fail", "admission_id": "adm-stop-fail"}

        async def stop_stream(self, _stream_id):
            return {"status": "stopped"}

        def clear_srp_reservation(self, stream_id):
            self.cleared.append(stream_id)
            return None

    class _FailingSrpService:
        async def release(self, **_kwargs):
            raise RuntimeError("stop release timeout")

    service = _Service()

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: service)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _FailingSrpService(),
    )

    result = asyncio.run(avb_routes.stop_stream("stream-stop-fail"))

    assert result["status"] == "stopped"
    assert "srp_release" not in result
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "res-stop-fail"
    assert "stop release timeout" in result["srp_release_warning"]["detail"]
    assert service.cleared == []


def test_avdecc_connect_returns_409_when_admission_denied(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Engine:
        def connect_stream(self, *_args):
            raise AssertionError("connect_stream should not be called when SRP admission is denied")

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(_Admission(decision="denied")),
    )

    req = avb_routes.StreamConnectionRequest(
        talker_entity_id="0011223344556677",
        talker_stream_index=0,
        listener_entity_id="8899aabbccddeeff",
        listener_stream_index=1,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_stream(req))

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_DENIED"


def test_avdecc_connect_fails_when_allowed_missing_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    class _Engine:
        def connect_stream(self, *_args):
            raise AssertionError("connect_stream must not be called without reservation_id in allowed decision")

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _DummySrpService(
            _Admission(
                decision="allowed",
                admission_id="adm-missing-acmp",
                reservation_id=None,
                reason_code="SRP_ADMITTED",
                reason="ok",
            )
        ),
    )

    req = avb_routes.StreamConnectionRequest(
        talker_entity_id="0011223344556677",
        talker_stream_index=0,
        listener_entity_id="8899aabbccddeeff",
        listener_stream_index=1,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_stream(req))

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "SRP_ADMISSION_INVALID"
    assert exc.value.detail["reason_code"] == "SRP_INVALID_ADMISSION"


def test_avdecc_connect_exception_releases_admission_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    class _Engine:
        def connect_stream(self, *_args):
            raise RuntimeError("acmp connect exploded")

    admission = _Admission(
        decision="allowed",
        admission_id="adm-acmp-exc",
        reservation_id="res-acmp-exc",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    req = avb_routes.StreamConnectionRequest(
        talker_entity_id="0011223344556677",
        talker_stream_index=0,
        listener_entity_id="8899aabbccddeeff",
        listener_stream_index=1,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_stream(req))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ACMP_CONNECTION_FAILED"
    assert "acmp connect exploded" in exc.value.detail["message"]
    assert exc.value.detail["srp_release"]["success"] is True
    assert exc.value.detail["srp_release"]["reservation_id"] == "res-acmp-exc"
    assert srp_service.releases == [
        {
            "reservation_id": "res-acmp-exc",
            "endpoint": "avdecc.connections.rollback",
            "stream_id": "0011223344556677:0->8899aabbccddeeff:1",
            "talker_id": "0011223344556677",
            "listener_id": "8899aabbccddeeff",
        }
    ]


def test_avdecc_connect_failure_with_release_warning_returns_structured_500(monkeypatch):
    _enable_strict_srp(monkeypatch)

    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    class _Engine:
        def connect_stream(self, *_args):
            return False

    class _FailingSrpService:
        def __init__(self, admission):
            self._admission = admission
            self.releases = []

        async def admit(self, _request):
            return self._admission

        async def release(self, **kwargs):
            self.releases.append(kwargs)
            raise RuntimeError("acmp rollback release timeout")

    admission = _Admission(
        decision="allowed",
        admission_id="adm-acmp-fail-warning",
        reservation_id="res-acmp-fail-warning",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _FailingSrpService(admission)

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    req = avb_routes.StreamConnectionRequest(
        talker_entity_id="0011223344556677",
        talker_stream_index=0,
        listener_entity_id="8899aabbccddeeff",
        listener_stream_index=1,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_stream(req))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ACMP_CONNECTION_FAILED"
    assert "timeout or rejected" in exc.value.detail["message"]
    assert exc.value.detail["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert exc.value.detail["srp_release_warning"]["reservation_id"] == "res-acmp-fail-warning"
    assert "acmp rollback release timeout" in exc.value.detail["srp_release_warning"]["detail"]
    assert srp_service.releases == [
        {
            "reservation_id": "res-acmp-fail-warning",
            "endpoint": "avdecc.connections.rollback",
            "stream_id": "0011223344556677:0->8899aabbccddeeff:1",
            "talker_id": "0011223344556677",
            "listener_id": "8899aabbccddeeff",
        }
    ]


def test_avdecc_connect_failure_with_release_payload_returns_structured_500(monkeypatch):
    _enable_strict_srp(monkeypatch)

    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    class _Engine:
        def connect_stream(self, *_args):
            return False

    admission = _Admission(
        decision="allowed",
        admission_id="adm-acmp-fail-release",
        reservation_id="res-acmp-fail-release",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    req = avb_routes.StreamConnectionRequest(
        talker_entity_id="0011223344556677",
        talker_stream_index=0,
        listener_entity_id="8899aabbccddeeff",
        listener_stream_index=1,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_stream(req))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ACMP_CONNECTION_FAILED"
    assert "timeout or rejected" in exc.value.detail["message"]
    assert exc.value.detail["srp_release"]["success"] is True
    assert exc.value.detail["srp_release"]["reservation_id"] == "res-acmp-fail-release"
    assert "srp_release_warning" not in exc.value.detail
    assert srp_service.releases == [
        {
            "reservation_id": "res-acmp-fail-release",
            "endpoint": "avdecc.connections.rollback",
            "stream_id": "0011223344556677:0->8899aabbccddeeff:1",
            "talker_id": "0011223344556677",
            "listener_id": "8899aabbccddeeff",
        }
    ]


def test_avdecc_connect_post_success_exception_does_not_release(monkeypatch):
    _enable_strict_srp(monkeypatch)

    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    class _Engine:
        def connect_stream(self, *_args):
            return True

    class _BrokenAdmission(_Admission):
        def to_dict(self):
            raise RuntimeError("admission payload failed")

    admission = _BrokenAdmission(
        decision="allowed",
        admission_id="adm-acmp-post-success",
        reservation_id="res-acmp-post-success",
        reason_code="SRP_ADMITTED",
        reason="ok",
    )
    srp_service = _DummySrpService(admission)

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    req = avb_routes.StreamConnectionRequest(
        talker_entity_id="0011223344556677",
        talker_stream_index=0,
        listener_entity_id="8899aabbccddeeff",
        listener_stream_index=1,
    )
    connection_id = "0011223344556677:0:8899aabbccddeeff:1"
    avb_routes._acmp_srp_reservations.pop(connection_id, None)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.connect_stream(req))

    assert exc.value.status_code == 500
    assert exc.value.detail["code"] == "ACMP_CONNECTION_FAILED"
    assert "admission payload failed" in exc.value.detail["message"]
    assert "srp_release" not in exc.value.detail
    assert "srp_release_warning" not in exc.value.detail
    assert srp_service.releases == []
    assert avb_routes._acmp_srp_reservations.get(connection_id) == {
        "reservation_id": "res-acmp-post-success",
        "admission_id": "adm-acmp-post-success",
    }
    avb_routes._acmp_srp_reservations.pop(connection_id, None)


def test_avdecc_disconnect_releases_bound_reservation(monkeypatch):
    _enable_strict_srp(monkeypatch)

    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    class _Engine:
        def disconnect_stream(self, *_args):
            return True

    srp_service = _DummySrpService(_Admission(decision="allowed"))
    connection_id = "0011223344556677:0:8899aabbccddeeff:1"
    avb_routes._acmp_srp_reservations[connection_id] = {
        "reservation_id": "res-acmp-1",
        "admission_id": "adm-acmp-1",
    }

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)
    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: srp_service)

    result = asyncio.run(avb_routes.disconnect_stream(connection_id))

    assert result["status"] == "disconnected"
    assert result["srp_release"]["success"] is True
    assert result["srp_release"]["reservation_id"] == "res-acmp-1"
    assert srp_service.releases == [
        {
            "reservation_id": "res-acmp-1",
            "endpoint": "avdecc.disconnect",
            "stream_id": connection_id,
            "talker_id": "0011223344556677",
            "listener_id": "8899aabbccddeeff",
        }
    ]
    assert connection_id not in avb_routes._acmp_srp_reservations


def test_avdecc_disconnect_release_failure_returns_warning_and_succeeds(monkeypatch):
    _enable_strict_srp(monkeypatch)

    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    class _Engine:
        def disconnect_stream(self, *_args):
            return True

    class _FailingSrpService:
        async def release(self, **_kwargs):
            raise RuntimeError("release socket timeout")

    connection_id = "0011223344556677:0:8899aabbccddeeff:1"
    avb_routes._acmp_srp_reservations[connection_id] = {
        "reservation_id": "res-acmp-fail",
        "admission_id": "adm-acmp-fail",
    }

    monkeypatch.setattr(avb_routes, "_get_engine", lambda: _Engine())
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)
    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)
    monkeypatch.setattr(
        srp_admission_module,
        "get_srp_admission_service",
        lambda: _FailingSrpService(),
    )

    result = asyncio.run(avb_routes.disconnect_stream(connection_id))

    assert result["status"] == "disconnected"
    assert result["connection_id"] == connection_id
    assert "srp_release" not in result
    assert result["srp_release_warning"]["code"] == "SRP_RELEASE_FAILED"
    assert result["srp_release_warning"]["reservation_id"] == "res-acmp-fail"
    assert "release socket timeout" in result["srp_release_warning"]["detail"]
    assert connection_id not in avb_routes._acmp_srp_reservations


def test_get_srp_admissions_applies_filters(monkeypatch):
    captured = {}

    class _Store:
        async def list_admissions(self, **kwargs):
            captured.update(kwargs)
            return [{"admission_id": "adm-1", "decision": "denied"}]

    monkeypatch.setattr(srp_log_store_module, "SrpAdmissionLogStore", lambda: _Store())

    result = asyncio.run(
        avb_routes.get_srp_admissions(
            decision="denied",
            since="2026-02-15T00:00:00Z",
            limit=25,
            endpoint="router.connect",
        )
    )

    assert result["count"] == 1
    assert result["admissions"][0]["admission_id"] == "adm-1"
    assert captured["decision"] == "denied"
    assert captured["endpoint"] == "router.connect"
    assert captured["limit"] == 25
    assert captured["since"] is not None
    assert captured["since"].tzinfo is None


def test_get_srp_admissions_rejects_invalid_since():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.get_srp_admissions(since="not-a-date"))

    assert exc.value.status_code == 400


def test_get_srp_admissions_rejects_invalid_decision():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.get_srp_admissions(decision="unexpected"))

    assert exc.value.status_code == 400
    assert "Invalid decision filter" in str(exc.value.detail)


def test_get_srp_status_returns_service_payload(monkeypatch):
    class _Service:
        async def get_status(self):
            return {
                "enabled": True,
                "required": True,
                "daemon_type": "mrpd",
                "running": True,
                "protocol_mode": "msrp-message-exchange",
                "last_error": None,
            }

    monkeypatch.setattr(srp_admission_module, "get_srp_admission_service", lambda: _Service())

    result = asyncio.run(avb_routes.get_srp_status())

    assert result["enabled"] is True
    assert result["daemon_type"] == "mrpd"
    assert result["running"] is True


def test_get_srp_admissions_applies_limit_and_endpoint(monkeypatch):
    captured = {}

    class _Store:
        async def list_admissions(self, **kwargs):
            captured.update(kwargs)
            return [
                {"admission_id": "adm-1"},
                {"admission_id": "adm-2"},
                {"admission_id": "adm-3"},
            ]

    monkeypatch.setattr(srp_log_store_module, "SrpAdmissionLogStore", lambda: _Store())

    result = asyncio.run(
        avb_routes.get_srp_admissions(decision="allowed", limit=2, endpoint="router.connect")
    )

    assert result["count"] == 3  # route returns all rows from store
    assert result["filters"]["limit"] == 2
    assert result["filters"]["endpoint"] == "router.connect"
    assert captured["limit"] == 2
    assert captured["endpoint"] == "router.connect"


def test_get_srp_admissions_clamps_limit_to_500(monkeypatch):
    class _Store:
        async def list_admissions(self, **kwargs):
            return [{"admission_id": f"adm-{i}"} for i in range(3)]

    monkeypatch.setattr(srp_log_store_module, "SrpAdmissionLogStore", lambda: _Store())

    result = asyncio.run(avb_routes.get_srp_admissions(limit=999))

    assert result["filters"]["limit"] == 500


def test_get_srp_admissions_supports_offset(monkeypatch):
    captured = {}

    class _Store:
        async def list_admissions(self, **kwargs):
            captured.update(kwargs)
            return [{"admission_id": f"adm-{i}"} for i in range(5)]

    monkeypatch.setattr(srp_log_store_module, "SrpAdmissionLogStore", lambda: _Store())

    result = asyncio.run(avb_routes.get_srp_admissions(limit=2, decision=None, endpoint=None, since=None, offset=4))

    assert result["filters"]["limit"] == 2
    assert result["filters"]["endpoint"] is None
    assert captured["offset"] == 4


def test_get_srp_admission_returns_404_when_missing(monkeypatch):
    class _Store:
        async def get_admission(self, _admission_id):
            return None

    monkeypatch.setattr(srp_log_store_module, "SrpAdmissionLogStore", lambda: _Store())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.get_srp_admission("missing"))

    assert exc.value.status_code == 404


def test_get_srp_admission_returns_row(monkeypatch):
    class _Store:
        async def get_admission(self, admission_id):
            return {"admission_id": admission_id, "decision": "allowed"}

    monkeypatch.setattr(srp_log_store_module, "SrpAdmissionLogStore", lambda: _Store())

    result = asyncio.run(avb_routes.get_srp_admission("adm-42"))

    assert result["admission_id"] == "adm-42"
    assert result["decision"] == "allowed"
