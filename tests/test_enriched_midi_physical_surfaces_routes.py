from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import enriched_midi_physical_surfaces as enriched_routes


class _FakeService:
    def __init__(self) -> None:
        self.override_view_id: str | None = None

    async def get_summary(self) -> dict[str, object]:
        current_view_id = self.override_view_id or "synth-parameters-primary"
        current_view_label = "Surface Lab" if current_view_id == "surface-lab" else "Primary Synth Parameters"
        return {
            "stack_name": "Enriched_MIDI_Physical_Surfaces",
            "summary_generated_at": "2026-04-07T16:10:00Z",
            "shared_operator_contract": {
                "primary_role": "synth_control",
                "sub_menu_policy": "non-synth-functions-live-in-submenus",
                "multi_synth_mode": "parallel",
                "page_layout_mode": "fixed-zones-per-family",
                "view_sync": "independent-per-surface",
                "target_follow_policy": "follow-most-recently-touched-or-armed",
                "snapshot_strategy": "external-midi-program-control-passthrough",
                "community_firmware_support": "first-class",
                "surface_lab_mode": "integrated-per-device",
            },
            "host_observations": {
                "usb_devices": [],
                "sound_cards": [],
                "python_modules": {"hid": False, "rtmidi": True},
            },
            "units": [
                {
                    "unit_id": "maschine-mk1",
                    "display_name": "Native Instruments Maschine MK1",
                    "status": "detected",
                    "status_reason": "USB hardware is present on this host.",
                    "transport_layers": [],
                    "capabilities": [],
                    "integration_notes": [],
                    "matched_usb_devices": [],
                    "matched_sound_cards": [],
                    "service_state": {
                        "daemon_connected": False,
                        "websocket_connected": False,
                        "audio_grid": {"selected_block_id": "node-1"},
                    },
                    "firmware_posture": {
                        "status": "official-ni-downloads-plus-legacy-midi-templates",
                        "detail": "Native Instruments still publishes MK1 downloads.",
                    },
                    "view_state": {
                        "page_layout_mode": "fixed-zones-per-family",
                        "view_sync": "independent-per-surface",
                        "target_follow_policy": "follow-most-recently-touched-or-armed",
                        "current_view_id": current_view_id,
                        "current_view_label": current_view_label,
                        "current_view_source": "operator" if self.override_view_id else "maschine-audio-grid-selection",
                        "views": [
                            {
                                "view_id": "synth-parameters-primary",
                                "label": "Primary Synth Parameters",
                                "category": "synth_control",
                                "zones": [],
                            },
                            {
                                "view_id": "surface-lab",
                                "label": "Surface Lab",
                                "category": "advanced",
                                "zones": [],
                            },
                        ],
                        "recent_target": {
                            "target_id": "node-1",
                            "label": "node-1",
                            "kind": "maschine-audio-grid-block",
                            "source": "maschine-audio-grid-selection",
                        },
                        "is_override_active": bool(self.override_view_id),
                    },
                    "surface_lab": {
                        "enabled": True,
                        "access": "integrated-advanced-mode",
                        "features": ["raw-midi-monitor"],
                        "snapshot": {"hid_history_depth": 0},
                    },
                    "operator_session": {
                        "current_view_id": current_view_id,
                        "current_view_source": "operator" if self.override_view_id else "maschine-audio-grid-selection",
                        "is_override_active": bool(self.override_view_id),
                        "recent_target": {
                            "target_id": "node-1",
                            "label": "node-1",
                            "kind": "maschine-audio-grid-block",
                            "source": "maschine-audio-grid-selection",
                        },
                    },
                }
            ],
        }


class _FakeSessionService:
    def __init__(self, fake_service: _FakeService) -> None:
        self.fake_service = fake_service

    async def set_view_override(self, unit_id: str, *, view_id: str | None, source: str = "operator") -> dict[str, object]:
        assert unit_id == "maschine-mk1"
        self.fake_service.override_view_id = view_id
        return {
            "current_view_override": view_id,
            "current_view_override_source": source,
        }

    async def set_recent_target(
        self,
        unit_id: str,
        *,
        target_id: str,
        label: str | None = None,
        kind: str | None = None,
        source: str = "operator",
    ) -> dict[str, object]:
        assert unit_id == "maschine-mk1"
        return {
            "recent_target": {
                "target_id": target_id,
                "label": label or target_id,
                "kind": kind or "operator-target",
                "source": source,
            }
        }


def test_enriched_midi_physical_surfaces_summary_route(monkeypatch):
    fake_service = _FakeService()
    monkeypatch.setattr(
        enriched_routes,
        "get_enriched_midi_physical_surfaces_service",
        lambda: fake_service,
    )
    monkeypatch.setattr(
        enriched_routes,
        "get_enriched_surface_session_service",
        lambda: _FakeSessionService(fake_service),
    )

    app = FastAPI()
    app.include_router(enriched_routes.router)
    client = TestClient(app)

    response = client.get("/api/enriched-midi-physical-surfaces/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["summary"]["stack_name"] == "Enriched_MIDI_Physical_Surfaces"
    assert payload["summary"]["shared_operator_contract"]["primary_role"] == "synth_control"
    assert payload["summary"]["units"][0]["unit_id"] == "maschine-mk1"
    assert payload["summary"]["units"][0]["firmware_posture"]["status"] == "official-ni-downloads-plus-legacy-midi-templates"
    assert payload["summary"]["units"][0]["view_state"]["current_view_id"] == "synth-parameters-primary"


def test_enriched_midi_physical_surfaces_view_update_route(monkeypatch):
    fake_service = _FakeService()
    monkeypatch.setattr(
        enriched_routes,
        "get_enriched_midi_physical_surfaces_service",
        lambda: fake_service,
    )
    monkeypatch.setattr(
        enriched_routes,
        "get_enriched_surface_session_service",
        lambda: _FakeSessionService(fake_service),
    )

    app = FastAPI()
    app.include_router(enriched_routes.router)
    client = TestClient(app)

    response = client.put(
        "/api/enriched-midi-physical-surfaces/units/maschine-mk1/view",
        json={"view_id": "surface-lab", "source": "operator"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["session"]["current_view_override"] == "surface-lab"
    assert payload["unit"]["view_state"]["current_view_id"] == "surface-lab"
