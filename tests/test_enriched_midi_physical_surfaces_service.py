from __future__ import annotations

import asyncio
from types import SimpleNamespace

from app.services import enriched_midi_physical_surfaces as enriched_module


class _FakeMaschineService:
    def get_status(self) -> dict[str, object]:
        return {
            "connected": False,
            "websocket_connected": False,
            "audio_grid": {},
        }

    def get_hid_history(self, limit: int = 50) -> list[dict[str, object]]:
        return []


class _FakePushManager:
    async def get_health(self) -> dict[str, object]:
        return {"running": False, "discovery": {}, "active_device": None}

    async def get_state_snapshot(self) -> dict[str, object]:
        return {"state": {}}


class _FakeGroundControlService:
    def __init__(self) -> None:
        self.sessions = {"session-a": {}, "session-b": {}}
        self.artifacts = {"artifact-a": {}, "artifact-b": {}, "artifact-c": {}}
        self.jobs = {
            "job-a": SimpleNamespace(status="running"),
            "job-b": SimpleNamespace(status="completed"),
        }

    async def get_ports(self) -> dict[str, object]:
        return {
            "inputs": [{"name": "Ground Control Pro In", "connected": True}],
            "outputs": [{"name": "Ground Control Pro Out", "connected": True}],
        }


class _FakeRegistry:
    async def inspect_local_ports(self) -> dict[str, object]:
        return {
            "count": 3,
            "devices": [
                {
                    "device_id": "meloaudio_midi_commander:floor",
                    "profile_id": "meloaudio_midi_commander",
                    "profile_name": "MeloAudio MIDI Commander",
                    "port_names": ["MIDI Commander"],
                    "connected": True,
                },
                {
                    "device_id": "novation_launch_control:desk",
                    "profile_id": "novation_launch_control",
                    "profile_name": "Novation Launch Control Family",
                    "port_names": ["Launch Control XL"],
                    "connected": True,
                },
                {
                    "device_id": "mackie_mcu_pro:front",
                    "profile_id": "mackie_mcu_pro",
                    "profile_name": "Mackie MCU Pro",
                    "port_names": ["Mackie MCU Pro"],
                    "connected": True,
                },
            ],
            "profiles": [
                {
                    "profile_id": "meloaudio_midi_commander",
                    "metadata": {
                        "shared_stack_unit_id": "meloaudio-midi-commander",
                    },
                },
                {
                    "profile_id": "novation_launch_control",
                    "metadata": {
                        "shared_stack_unit_id": "novation-launch-control",
                        "template_strategy": "components-managed-custom-modes",
                        "display_capabilities": {
                            "transport": "launch_control_led_feedback",
                            "supports_led_feedback": True,
                        },
                    },
                },
                {
                    "profile_id": "mackie_mcu_pro",
                    "metadata": {
                        "shared_stack_unit_id": "mackie-mcu-pro",
                        "display_capabilities": {
                            "transport": "mcu_scribble_strip",
                            "motor_faders": 9,
                            "supports_channel_labels": True,
                        },
                    },
                },
            ],
        }


class _FakeSessionService:
    async def resolve_session(
        self,
        unit_id: str,
        *,
        derived_view_id: str,
        derived_view_source: str,
        available_view_ids: list[str],
        derived_recent_target,
    ) -> dict[str, object]:
        assert derived_view_id in available_view_ids
        return {
            "current_view_id": derived_view_id,
            "current_view_source": derived_view_source,
            "recent_target": derived_recent_target,
            "is_override_active": False,
            "updated_at": None,
        }


def test_enriched_surface_summary_promotes_ground_control_and_profile_driven_families(monkeypatch):
    monkeypatch.setattr(enriched_module, "_scan_usb_devices", lambda: [])
    monkeypatch.setattr(enriched_module, "_scan_sound_cards", lambda: [])
    monkeypatch.setattr(enriched_module, "get_maschine_service", lambda: _FakeMaschineService())
    monkeypatch.setattr(enriched_module, "get_push_surface_manager", lambda: _FakePushManager())
    monkeypatch.setattr(enriched_module, "get_ground_control_pro_service", lambda: _FakeGroundControlService())
    monkeypatch.setattr(enriched_module, "get_midi_device_registry", lambda: _FakeRegistry())
    monkeypatch.setattr(enriched_module, "get_enriched_surface_session_service", lambda: _FakeSessionService())
    monkeypatch.setattr(
        enriched_module,
        "device_profile_service",
        SimpleNamespace(
            get_profile=lambda profile_id: {
                "profile_id": profile_id,
                "footswitches": [{} for _ in range(8)],
                "expression_pedals": [{} for _ in range(2)],
                "supports_firmware_update": True,
            },
            get_active_profile=lambda: {"profile_id": "meloaudio_commander", "name": "MeloAudio MIDI Commander"},
            get_current_bank=lambda profile_id=None: 2,
            get_all_expression_calibrations=lambda: {"EXP1": {"curve": "linear"}, "EXP2": {"curve": "logarithmic"}},
        ),
    )

    summary = asyncio.run(enriched_module.EnrichedMidiPhysicalSurfacesService().get_summary())
    units = {unit["unit_id"]: unit for unit in summary["units"]}

    assert len(summary["host_observations"]["midi_hub_devices"]) == 3

    ground_control = units["ground-control-pro"]
    assert ground_control["status"] == "online"
    assert ground_control["service_state"]["session_count"] == 2
    assert ground_control["view_state"]["current_view_id"] == "surface-lab"
    assert ground_control["surface_lab"]["snapshot"]["active_job_count"] == 1

    commander = units["meloaudio-midi-commander"]
    assert commander["specialized_route"] == "/midi-commander"
    assert commander["status"] == "online"
    assert commander["matched_midi_devices"][0]["profile_id"] == "meloaudio_midi_commander"
    assert commander["surface_lab"]["snapshot"]["current_bank"] == 2

    launch_control = units["novation-launch-control"]
    assert launch_control["status"] == "detected"
    assert launch_control["matched_midi_devices"][0]["profile_id"] == "novation_launch_control"
    assert launch_control["service_state"]["profile"]["metadata"]["template_strategy"] == "components-managed-custom-modes"
    assert any(layer["status"] == "attention" for layer in launch_control["transport_layers"])

    mackie = units["mackie-mcu-pro"]
    assert mackie["status"] == "detected"
    assert mackie["specialized_route"] == "/mcu"
    assert mackie["view_state"]["current_view_source"] == "midi-hub-profile-detected"
    assert mackie["surface_lab"]["snapshot"]["scribble_strip_transport"] == "mcu_scribble_strip"
