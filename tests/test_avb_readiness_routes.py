import asyncio

from app.routes import audio as audio_routes
from app.routes import avb as avb_routes
from app.services.avb import readiness as readiness_module
from app.services.avb import avb_service as avb_service_module
from app.services import juce_engine_service


def test_get_avb_readiness_uses_env_interface_override(monkeypatch):
    monkeypatch.setenv("MAP2_AVB_INTERFACE", "enp3s0")
    monkeypatch.setenv("MAP2_AVB_ENABLED", "1")

    monkeypatch.setattr(
        "app.config.config_get",
        lambda key, default=None: {
            "avb.enabled": True,
            "avb.interface": "eth0",
        }.get(key, default),
    )
    monkeypatch.setattr(
        readiness_module,
        "_read_marker_metadata",
        lambda path=readiness_module._AVB_MARKER_PATH: {"interface": "eth1", "enabled": "true"},
    )
    monkeypatch.setattr(
        readiness_module.os.path,
        "exists",
        lambda path: path in {
            readiness_module._AVB_MARKER_PATH,
            "/sys/class/net/eth0",
            "/sys/class/net/eth1",
            "/sys/class/net/enp3s0",
        },
    )
    monkeypatch.setattr(readiness_module.shutil, "which", lambda binary: "/usr/sbin/ptp4l" if binary == "ptp4l" else None)
    monkeypatch.setattr(readiness_module, "_is_ptp4l_running", lambda: (True, "pidof"))

    class _Engine:
        def is_avb_available(self):
            return True

    monkeypatch.setattr(readiness_module, "_resolve_engine", lambda engine: _Engine())

    readiness = readiness_module.get_avb_readiness()

    assert readiness["enabled"] is True
    assert readiness["interface"] == "enp3s0"
    assert readiness["interface_source"] == "env_override"
    assert readiness["operational"] is True
    assert readiness["available"] is True
    assert readiness["state"] == "operational"


def test_status_and_devices_share_canonical_availability(monkeypatch):
    class _Service:
        def get_readiness(self):
            return {
                "enabled": True,
                "configured": True,
                "operational": False,
                "degraded": True,
                "available": False,
                "state": "degraded",
                "interface": "enp3s0",
                "interface_source": "config",
                "reason": "ptp4l is not running",
                "checks": {},
            }

        def get_device_names(self):
            return ["AVB Talker (Local)"]

        def get_discovered_devices(self):
            return [{"endpoint_id": "0011223344556677:0", "direction": "talker"}]

    async def _fake_ptp_status():
        return {"available": False, "error": "ptp4l is not running"}

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(avb_routes, "get_ptp_status", _fake_ptp_status)
    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: default)

    status_payload = asyncio.run(avb_routes.get_avb_status())
    devices_payload = asyncio.run(avb_routes.get_avb_devices())

    assert status_payload["available"] is False
    assert devices_payload["available"] is False
    assert status_payload["state"] == "degraded"
    assert devices_payload["readiness"]["state"] == "degraded"


def test_channel_capabilities_route_and_audio_ports_adapter(monkeypatch):
    capabilities_payload = {
        "available": True,
        "readiness": {
            "enabled": True,
            "configured": True,
            "operational": True,
            "degraded": False,
            "available": True,
            "state": "operational",
            "interface": "enp3s0",
            "interface_source": "config",
            "reason": None,
            "checks": {},
        },
        "device": "Jogg USB Audio",
        "local_inputs": [
            {"index": 0, "name": "Left", "type": "input", "source": "juce_local", "available": True},
            {"index": 1, "name": "Right", "type": "input", "source": "juce_local", "available": True},
        ],
        "local_outputs": [
            {"index": 0, "name": "Left", "type": "output", "source": "juce_local", "available": True},
            {"index": 1, "name": "Right", "type": "output", "source": "juce_local", "available": True},
        ],
        "avb_talkers": [{"endpoint_id": "0011223344556677:0", "direction": "talker"}],
        "avb_listeners": [{"endpoint_id": "0011223344556677:1", "direction": "listener"}],
        "sample_rates": [48000],
        "summary": {
            "local_input_count": 2,
            "local_output_count": 2,
            "avb_talker_count": 1,
            "avb_listener_count": 1,
        },
    }

    class _AvbService:
        def get_channel_capabilities(self, *, system_info=None):
            return capabilities_payload

    class _AudioService:
        is_available = True

        def get_system_info(self):
            return {
                "audio_device": "Jogg USB Audio",
                "input_channels": 2,
                "output_channels": 2,
            }

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _AvbService())
    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: _AudioService())
    monkeypatch.setattr(audio_routes, "get_audio_engine", lambda: _AudioService())

    avb_capabilities = asyncio.run(avb_routes.get_avb_channel_capabilities())
    audio_ports = asyncio.run(audio_routes.get_available_ports())

    assert avb_capabilities["summary"]["avb_talker_count"] == 1
    assert audio_ports["device"] == "Jogg USB Audio"
    assert audio_ports["avb_readiness"]["state"] == "operational"
    assert len(audio_ports["inputs"]) == 2
    assert len(audio_ports["outputs"]) == 2
    assert len(audio_ports["avb_talkers"]) == 1
    assert len(audio_ports["avb_listeners"]) == 1
