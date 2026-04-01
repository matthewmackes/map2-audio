from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import database as database_module
from app.routes import maschine as maschine_routes
from app.routes import transport as transport_routes
from app.services.maschine_lcd_service import (
    get_maschine_lcd_render_service,
    reset_maschine_lcd_render_service,
)
from app.services.maschine_service import get_maschine_service, reset_maschine_service
from app.services.midi_hub import recorder as recorder_module
from app.services.midi_hub.recorder import MidiRecorder
from app.services.transport_service import reset_transport_service


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'maschine-mk1.db'}")


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(maschine_routes.router)
    app.include_router(transport_routes.router)
    return TestClient(app)


def test_maschine_mk1_routes_and_transport_work_together(tmp_path):
    _init_temp_db(tmp_path)
    reset_maschine_service()
    reset_maschine_lcd_render_service()
    reset_transport_service()
    recorder_module._midi_recorder_singleton = MidiRecorder(storage_dir=tmp_path / 'recordings')

    service = get_maschine_service()
    renderer = get_maschine_lcd_render_service()

    async def _fake_snapshot(_session):
        return {
            "id": 11,
            "name": "Maschine Live",
            "paths": [
                {
                    "id": "path-a",
                    "name": "Main Path",
                    "label": "Main",
                    "snapshot_chain_id": 201,
                    "runtime_chain_id": 301,
                    "plugins": [
                        {
                            "uri": "urn:test:eq",
                            "name": "EQ",
                            "position": 0,
                            "bypass": False,
                            "parameters": {
                                "gain": "+3.0",
                                "mix": "20",
                            },
                        }
                    ],
                }
            ],
        }

    async def _fake_health():
        return {"uptime_seconds": 42.0, "cpu_percent": 7.0}

    async def _fake_audio():
        return {"cpu_load": 0.15, "sample_rate": 48000, "buffer_size": 256}

    async def _fake_midi():
        return {"route_count": 4, "traffic": {"captured_total": 9}}

    service._get_live_snapshot_detail = _fake_snapshot  # type: ignore[method-assign]
    renderer._get_health_payload = _fake_health  # type: ignore[method-assign]
    renderer._get_audio_payload = _fake_audio  # type: ignore[method-assign]
    renderer._get_midi_payload = _fake_midi  # type: ignore[method-assign]

    client = _build_client()

    register_response = client.post(
        "/api/maschine/register",
        json={
            "daemon_version": "0.2.0",
            "virtual_port_name": "MAP2:Maschine-MK1",
            "hid_device": {"vendor_id": "17cc", "product_id": "0808"},
            "firmware_info": {"version": "1.8"},
            "capabilities": {"protocol_version": "open-maschine"},
        },
    )
    assert register_response.status_code == 200
    assert register_response.json()["state"]["connected"] is True

    encoder_response = client.post(
        "/api/maschine/encoder-map",
        json={
            "encoder_map": {
                "enc2": {"block_id": "path-a:0", "param_id": "gain", "label": "Gain"},
                "enc3": {"block_id": "path-a:0", "param_id": "mix", "label": "Mix"},
            }
        },
    )
    assert encoder_response.status_code == 200
    assert encoder_response.json()["encoder_map"]["enc2"]["param_id"] == "gain"

    status_response = client.get("/api/maschine/status")
    assert status_response.status_code == 200
    assert status_response.json()["state"]["virtual_port_name"] == "MAP2:Maschine-MK1"

    audio_grid_response = client.get("/api/maschine/audio-grid")
    assert audio_grid_response.status_code == 200
    audio_grid = audio_grid_response.json()["audio_grid"]
    assert audio_grid["blocks"][0]["plugin_name"] == "EQ"
    assert audio_grid["selected_block_id"] == "path-a:0"

    lcd_render_response = client.get("/api/maschine/lcd/render?context=stats&focus_metric=audio.cpu_load")
    assert lcd_render_response.status_code == 200
    assert lcd_render_response.json()["render"]["context"] == "stats"
    assert lcd_render_response.json()["render"]["meta"]["focus_metric"] == "audio.cpu_load"

    transport_state = client.get("/api/transport/state")
    assert transport_state.status_code == 200
    assert transport_state.json()["active_owner"] == "midi_recorder"

    play_response = client.post("/api/transport/play")
    assert play_response.status_code == 200
    assert play_response.json()["owner"] == "midi_recorder"
    current_session_id = play_response.json()["owner_state"]["current_session_id"]
    assert current_session_id

    stop_response = client.post("/api/transport/stop")
    assert stop_response.status_code == 200
    session_path = tmp_path / "recordings" / f"{current_session_id}.json"
    assert session_path.exists()

    with client.websocket_connect("/api/maschine/ws") as websocket:
        first_message = websocket.receive_json()
        second_message = websocket.receive_json()
        welcome = first_message if first_message["type"] == "maschine:welcome" else second_message
        status_message = second_message if welcome is first_message else first_message
        assert welcome["type"] == "maschine:welcome"
        assert welcome["data"]["encoder_map"]["enc3"]["label"] == "Mix"
        assert welcome["data"]["audio_grid"]["blocks"][0]["plugin_name"] == "EQ"
        assert status_message["type"] == "maschine:status"

        websocket.send_json(
            {
                "type": "hid_event",
                "payload": {
                    "direction": "in",
                    "report_id": 9,
                    "decoded_type": "pad_press",
                    "raw_hex": "09010203",
                },
            }
        )
        response_by_type = {}
        for _ in range(8):
            message = websocket.receive_json()
            response_by_type[message["type"]] = message
            if {
                "maschine:hid_traffic",
                "maschine:status",
                "maschine:ack",
            }.issubset(response_by_type) and response_by_type["maschine:status"]["data"].get("last_event_type") == "hid_event":
                break

        assert response_by_type["maschine:hid_traffic"]["data"]["decoded_type"] == "pad_press"
        assert response_by_type["maschine:status"]["data"]["last_event_type"] == "hid_event"
        assert response_by_type["maschine:ack"]["data"]["report_id"] == 9
