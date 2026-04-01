from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import database as database_module
from app.routes import maschine as maschine_routes
from app.services.maschine_lcd_service import reset_maschine_lcd_render_service
from app.services.maschine_service import reset_maschine_service


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'maschine-routes.db'}")


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(maschine_routes.router)
    return TestClient(app)


def test_maschine_routes_rest_and_websocket(tmp_path):
    _init_temp_db(tmp_path)
    reset_maschine_service()
    reset_maschine_lcd_render_service()
    client = _build_client()
    fake_audio_grid = {
        "blocks": [
            {
                "block_id": "path-a:0",
                "pad_index": 0,
                "runtime_chain_id": 101,
                "plugin_uri": "urn:test:eq",
                "plugin_name": "EQ",
                "plugin_position": 0,
                "bypassed": False,
            }
        ],
        "selected_block_id": "path-a:0",
        "page_index": 0,
        "updated_at": "2026-04-01T12:00:00Z",
        "snapshot_id": 1,
        "snapshot_name": "Live Snapshot",
    }
    toggled_audio_grid = {
        **fake_audio_grid,
        "blocks": [{**fake_audio_grid["blocks"][0], "bypassed": True}],
    }
    audio_grid_calls = {"count": 0}

    async def _fake_get_audio_grid_projection(_session):
        audio_grid_calls["count"] += 1
        return fake_audio_grid

    async def _fake_select_audio_grid_block(_session, block_id: str):
        return {**fake_audio_grid, "selected_block_id": block_id}

    async def _fake_toggle_audio_grid_block_bypass(_session, block_id: str):
        assert block_id == "path-a:0"
        return toggled_audio_grid

    monkeypatch = __import__("pytest").MonkeyPatch()
    monkeypatch.setattr(maschine_routes.get_maschine_service(), "get_audio_grid_projection", _fake_get_audio_grid_projection)
    monkeypatch.setattr(maschine_routes.get_maschine_service(), "select_audio_grid_block", _fake_select_audio_grid_block)
    monkeypatch.setattr(maschine_routes.get_maschine_service(), "toggle_audio_grid_block_bypass", _fake_toggle_audio_grid_block_bypass)
    async def _fake_render(*, session, maschine_service, context="audio_grid", focus_metric=None):
        assert context in {"audio_grid", "stats"}
        return {
            "context": context,
            "left": {"width": 128, "height": 64, "format": "xbm", "data": "AA"},
            "right": {"width": 128, "height": 64, "format": "xbm", "data": "55"},
            "meta": {"focus_metric": focus_metric},
        }
    monkeypatch.setattr(maschine_routes.get_maschine_lcd_render_service(), "render", _fake_render)

    register_response = client.post(
        "/api/maschine/register",
        json={
            "daemon_version": "0.1.0",
            "virtual_port_name": "MAP2:Maschine-MK1",
            "hid_device": {"vendor_id": "17cc", "product_id": "0808"},
            "firmware_info": {"version": "1.8"},
            "capabilities": {"lcd": True, "pads": 16},
        },
    )
    assert register_response.status_code == 200
    state = register_response.json()["state"]
    assert state["connected"] is True
    assert state["daemon_version"] == "0.1.0"
    assert register_response.json()["websocket_url"] == "/api/maschine/ws"

    status_response = client.get("/api/maschine/status")
    assert status_response.status_code == 200
    assert status_response.json()["state"]["virtual_port_name"] == "MAP2:Maschine-MK1"

    encoder_map_response = client.get("/api/maschine/encoder-map")
    assert encoder_map_response.status_code == 200
    encoder_map = encoder_map_response.json()["encoder_map"]
    assert encoder_map["enc1"] is None
    assert encoder_map["vol"]["fixed"] is True

    update_encoder_map = client.post(
        "/api/maschine/encoder-map",
        json={
            "encoder_map": {
                "enc2": {"block_id": "block-1", "param_id": "mix", "label": "Mix"},
                "enc1": {"ignored": True},
            }
        },
    )
    assert update_encoder_map.status_code == 200
    assert update_encoder_map.json()["encoder_map"]["enc2"]["param_id"] == "mix"
    assert update_encoder_map.json()["encoder_map"]["enc1"] is None

    lcd_response = client.post(
        "/api/maschine/lcd",
        json={
            "side": "left",
            "bitmap": {"width": 128, "height": 64, "format": "xbm", "data": "AA55"},
        },
    )
    assert lcd_response.status_code == 200
    assert lcd_response.json()["lcd"]["left"]["data"] == "AA55"

    rendered_lcd_response = client.get("/api/maschine/lcd/render?context=stats&focus_metric=audio.cpu_load")
    assert rendered_lcd_response.status_code == 200
    assert rendered_lcd_response.json()["render"]["context"] == "stats"
    assert rendered_lcd_response.json()["lcd"]["left"]["source"] == "render:stats"
    assert rendered_lcd_response.json()["render"]["meta"]["focus_metric"] == "audio.cpu_load"

    audio_grid_response = client.get("/api/maschine/audio-grid")
    assert audio_grid_response.status_code == 200
    assert audio_grid_response.json()["audio_grid"]["blocks"][0]["plugin_name"] == "EQ"

    select_response = client.post("/api/maschine/audio-grid/select", json={"block_id": "path-a:0"})
    assert select_response.status_code == 200
    assert select_response.json()["audio_grid"]["selected_block_id"] == "path-a:0"

    bypass_response = client.post("/api/maschine/audio-grid/bypass", json={"block_id": "path-a:0"})
    assert bypass_response.status_code == 200
    assert bypass_response.json()["audio_grid"]["blocks"][0]["bypassed"] is True

    with client.websocket_connect("/api/maschine/ws") as websocket:
        welcome = websocket.receive_json()
        assert welcome["type"] == "maschine:welcome"
        assert welcome["data"]["encoder_map"]["enc2"]["label"] == "Mix"
        assert welcome["data"]["audio_grid"]["blocks"][0]["plugin_name"] == "EQ"
        ws_connected = websocket.receive_json()
        assert ws_connected["type"] == "maschine:status"
        assert ws_connected["data"]["websocket_connected"] is True

        websocket.send_json(
            {
                "type": "hid_event",
                "payload": {
                    "direction": "in",
                    "report_id": 1,
                    "decoded_type": "pad_press",
                    "raw_hex": "01020304",
                },
            }
        )
        hid_broadcast = websocket.receive_json()
        assert hid_broadcast["type"] == "maschine:hid_traffic"
        assert hid_broadcast["data"]["decoded_type"] == "pad_press"

        status_broadcast = websocket.receive_json()
        assert status_broadcast["type"] == "maschine:status"
        assert status_broadcast["data"]["last_event_type"] == "hid_event"

        ack = websocket.receive_json()
        assert ack["type"] == "maschine:ack"
        assert ack["data"]["decoded_type"] == "pad_press"

    final_status = client.get("/api/maschine/status").json()["state"]
    assert final_status["websocket_connected"] is False
    assert final_status["connected"] is True

    led_state_response = client.get("/api/maschine/led-state")
    assert led_state_response.status_code == 200
    assert len(led_state_response.json()["led_state"]["pads"]) == 16
    monkeypatch.undo()
