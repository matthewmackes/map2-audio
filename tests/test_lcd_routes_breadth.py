"""
Breadth HTTP route coverage for /api/lcd (T2430-N-2a).

Phase 1 pyramid (T2430-N) covered the novel engineering: hook evaluator
math, morph back-pressure, PlatformEvent emission contract, multi-adapter
manager. This module fills in breadth: every top-level LCD route exercised
via TestClient with a mocked LCDManager, covering both the happy path and
the 503-when-manager-absent error path where applicable.

Uses FastAPI TestClient with a bespoke FastAPI app that mounts
``app.routes.lcd.router`` directly, so we don't drag in the full app
lifespan (systemd, platform-event-bus, websockets, etc.).
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import lcd as lcd_routes


@pytest.fixture
def app_no_manager():
    """App with LCD routes but no manager registered."""
    lcd_routes.set_lcd_manager(None)
    _app = FastAPI()
    _app.include_router(lcd_routes.router)
    return _app


@pytest.fixture
def client_no_manager(app_no_manager):
    return TestClient(app_no_manager, raise_server_exceptions=False)


@pytest.fixture
def stub_manager():
    """AsyncMock-based LCDManager stub with the methods routes call."""
    m = MagicMock()
    m.set_page = MagicMock()
    m.get_simulation_output = MagicMock(return_value="LINE1\nLINE2\nLINE3\nLINE4")
    m.last_lines = ["LCD 1", "Ready", "LCD 2", "Ready"]

    # Driver stubs
    driver0 = MagicMock()
    driver0.set_backlight = AsyncMock()
    driver0.write_lines = AsyncMock()
    driver0.connected = True
    driver0.backlight_level = 100
    driver0.address = 0x27
    driver1 = MagicMock()
    driver1.set_backlight = AsyncMock()
    driver1.write_lines = AsyncMock()
    driver1.connected = True
    driver1.backlight_level = 100
    driver1.address = 0x3F
    m.lcds = [driver0, driver1]

    # Health + reconnect + native_raw_write
    m.get_driver_health = MagicMock(
        return_value=[
            {"lcd_id": 0, "driver_class": "MockLCDDisplay", "connected": True,
             "adapter": "native-i2c", "address": 0x27, "backlight_level": 100,
             "last_write_ago_s": 0.5, "write_error_count": 0, "is_mock": True},
            {"lcd_id": 1, "driver_class": "MockLCDDisplay", "connected": True,
             "adapter": "ft232h", "address": 0x3F, "backlight_level": 100,
             "last_write_ago_s": 1.2, "write_error_count": 0, "is_mock": True},
        ]
    )
    m.reconnect_driver = AsyncMock()
    m.native_raw_write = AsyncMock()

    # Operator-action emission
    m.emit_operator_action = AsyncMock()

    # Status payload fields
    m.is_running = MagicMock(return_value=True)
    m.current_page = MagicMock(return_value="status")
    m.uptime_seconds = MagicMock(return_value=120.5)
    m.get_hardware_info = MagicMock(return_value={"displays": [], "bus": 1})
    m.get_statistics = MagicMock(
        return_value={"updates": 42, "page_changes": 3, "errors": 0, "input_events": 10, "start_time": None}
    )
    m.is_simulation = MagicMock(return_value=True)
    return m


@pytest.fixture
def app_with_manager(stub_manager):
    lcd_routes.set_lcd_manager(stub_manager)
    _app = FastAPI()
    _app.include_router(lcd_routes.router)
    yield _app
    lcd_routes.set_lcd_manager(None)


@pytest.fixture
def client(app_with_manager):
    return TestClient(app_with_manager, raise_server_exceptions=False)


# ==========================================================================
# 503-when-manager-absent
# ==========================================================================


@pytest.mark.parametrize("method,path", [
    ("POST", "/api/lcd/page"),
    ("POST", "/api/lcd/input/up"),
    ("POST", "/api/lcd/test/0"),
    ("POST", "/api/lcd/backlight/0"),
    ("GET", "/api/lcd/health"),
    ("POST", "/api/lcd/reconnect/0"),
    ("POST", "/api/lcd/native/write"),
    ("POST", "/api/lcd/message"),
    ("POST", "/api/lcd/reset/0"),
    ("GET", "/api/lcd/simulation/both"),
])
def test_routes_return_503_when_manager_absent(client_no_manager, method, path):
    """Every manager-dependent route returns 503 when LCD system is not initialized."""
    body = {}
    if method == "POST" and path == "/api/lcd/page":
        body = {"page": "status"}
    elif method == "POST" and path == "/api/lcd/native/write":
        body = {"line1": "test"}
    elif method == "POST" and path == "/api/lcd/message":
        body = {"lcd_id": 0, "line1": "x", "line2": "", "duration": 1}

    resp = client_no_manager.request(method, path, json=body)
    assert resp.status_code == 503, f"{method} {path} expected 503, got {resp.status_code}"


# ==========================================================================
# Hardware / driver-health surface
# ==========================================================================


def test_health_returns_driver_snapshot(client, stub_manager):
    resp = client.get("/api/lcd/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "drivers" in data
    assert len(data["drivers"]) == 2
    assert data["drivers"][0]["adapter"] == "native-i2c"
    assert data["drivers"][1]["adapter"] == "ft232h"


def test_reconnect_driver_happy_path(client, stub_manager):
    resp = client.post("/api/lcd/reconnect/1")
    assert resp.status_code == 200
    assert resp.json() == {"success": True, "lcd_id": 1}
    stub_manager.reconnect_driver.assert_awaited_once_with(1)


def test_reconnect_driver_value_error_is_400(client, stub_manager):
    stub_manager.reconnect_driver.side_effect = ValueError("lcd_id 5 out of range")
    resp = client.post("/api/lcd/reconnect/5")
    assert resp.status_code == 400
    assert "out of range" in resp.json()["detail"]


def test_native_raw_write_happy_path(client, stub_manager):
    resp = client.post("/api/lcd/native/write", json={
        "line1": "Hello", "line2": "World", "line3": "", "line4": "",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["lines"] == ["Hello", "World", "", ""]
    stub_manager.native_raw_write.assert_awaited_once_with("Hello", "World", "", "")


def test_native_raw_write_empty_body_uses_defaults(client, stub_manager):
    """Empty body should default every line to empty string (not 500)."""
    resp = client.post("/api/lcd/native/write", json={})
    assert resp.status_code == 200


def test_backlight_toggles_via_driver(client, stub_manager):
    resp = client.post("/api/lcd/backlight/0?enabled=true")
    assert resp.status_code == 200
    assert resp.json()["backlight"] is True
    stub_manager.lcds[0].set_backlight.assert_awaited_once_with(100)


def test_backlight_off_via_driver(client, stub_manager):
    resp = client.post("/api/lcd/backlight/0?enabled=false")
    assert resp.status_code == 200
    stub_manager.lcds[0].set_backlight.assert_awaited_once_with(0)


def test_backlight_both_displays_when_minus_one(client, stub_manager):
    resp = client.post("/api/lcd/backlight/-1?enabled=true")
    assert resp.status_code == 200
    stub_manager.lcds[0].set_backlight.assert_awaited_once_with(100)
    stub_manager.lcds[1].set_backlight.assert_awaited_once_with(100)


# ==========================================================================
# Per-LCD config (Settings backing)
# ==========================================================================


def test_displays_config_round_trip(client, stub_manager, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))

    # GET returns current config (from ConfigManager default).
    resp = client.get("/api/lcd/displays-config")
    assert resp.status_code == 200
    assert "displays" in resp.json()

    # PUT replaces it.
    payload = {
        "displays": [
            {"id": 0, "address": 0x27, "enabled": True, "adapter": "native-i2c",
             "brightness": 128, "contrast": 30, "auto_scroll": True, "scroll_delay_ms": 200,
             "alert_sound": False, "alert_sound_freq_hz": 800, "alert_sound_duration_ms": 50,
             "idle_dim_timeout_s": 120, "idle_dim_brightness": 30,
             "auto_cycle_enabled": True, "auto_cycle_interval_s": 45, "default_page": "vu"},
            {"id": 1, "address": 0x3F, "enabled": False, "adapter": "ft232h",
             "brightness": 64, "contrast": 40, "auto_scroll": False, "scroll_delay_ms": 100,
             "alert_sound": True, "alert_sound_freq_hz": 1200, "alert_sound_duration_ms": 100,
             "idle_dim_timeout_s": 60, "idle_dim_brightness": 50,
             "auto_cycle_enabled": False, "auto_cycle_interval_s": 30, "default_page": "status"},
        ],
    }
    resp = client.put("/api/lcd/displays-config", json=payload)
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    # Brightness was applied live — 128/255 → 50%.
    stub_manager.lcds[0].set_backlight.assert_awaited_with(50)
    # Semantic action fired.
    stub_manager.emit_operator_action.assert_awaited()


# ==========================================================================
# Snapshot hooks CRUD
# ==========================================================================


def test_snapshot_hook_roundtrip(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))

    # Initially absent.
    resp = client.get("/api/lcd/snapshot-hooks/snap-123")
    assert resp.status_code == 200
    assert resp.json() == {"snapshot_id": "snap-123", "hook": None}

    # PUT preset variant.
    resp = client.put("/api/lcd/snapshot-hooks/snap-123", json={"preset": "performing"})
    assert resp.status_code == 200

    # GET reads it back.
    resp = client.get("/api/lcd/snapshot-hooks/snap-123")
    assert resp.json()["hook"] == {"preset": "performing"}

    # List includes it.
    resp = client.get("/api/lcd/snapshot-hooks")
    hook_ids = [h["snapshot_id"] for h in resp.json()["hooks"]]
    assert "snap-123" in hook_ids

    # PUT inline variant.
    inline = {"inline": {"displays": [{"id": 0, "default_page": "vu"}]}}
    resp = client.put("/api/lcd/snapshot-hooks/snap-123", json=inline)
    assert resp.status_code == 200

    # DELETE clears it.
    resp = client.delete("/api/lcd/snapshot-hooks/snap-123")
    assert resp.status_code == 200
    resp = client.get("/api/lcd/snapshot-hooks/snap-123")
    assert resp.json()["hook"] is None


def test_snapshot_hook_rejects_both_members(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.put("/api/lcd/snapshot-hooks/snap-xyz", json={
        "preset": "performing",
        "inline": {"displays": []},
    })
    assert resp.status_code == 400
    assert "Exactly one of" in resp.json()["detail"]


def test_snapshot_hook_empty_body_clears(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.put("/api/lcd/snapshot-hooks/snap-empty", json={})
    assert resp.status_code == 200
    assert resp.json()["cleared"] is True


def test_morph_stats_when_no_evaluator(client):
    # Evaluator is None by default (not registered in the test app).
    resp = client.get("/api/lcd/morph-stats")
    assert resp.status_code == 200
    assert resp.json() == {"running": False, "stats": None}


# ==========================================================================
# Presets CRUD
# ==========================================================================


def test_get_presets_includes_all_5_builtins(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.get("/api/lcd/presets")
    assert resp.status_code == 200
    presets = resp.json()["presets"]
    builtin_names = {p["name"] for p in presets if p["builtin"]}
    assert builtin_names == {"factory-default", "performing", "rehearsal", "setup", "silent"}


def test_cannot_save_preset_with_builtin_name(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.post("/api/lcd/presets", json={"name": "performing", "description": "steal", "config": {}})
    assert resp.status_code == 400
    assert "built-in" in resp.json()["detail"].lower()


def test_cannot_delete_builtin_preset(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.delete("/api/lcd/presets/performing")
    assert resp.status_code == 400


def test_user_preset_save_delete_roundtrip(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    # Save with inline config.
    inline_config = {"displays": [{"id": 0, "default_page": "midi"}]}
    resp = client.post("/api/lcd/presets", json={
        "name": "my-preset",
        "description": "Test preset",
        "config": inline_config,
    })
    assert resp.status_code == 200

    # Appears in list as non-builtin.
    resp = client.get("/api/lcd/presets")
    mine = [p for p in resp.json()["presets"] if p["name"] == "my-preset"]
    assert len(mine) == 1
    assert mine[0]["builtin"] is False

    # Delete it.
    resp = client.delete("/api/lcd/presets/my-preset")
    assert resp.status_code == 200

    # Gone from list.
    resp = client.get("/api/lcd/presets")
    assert not any(p["name"] == "my-preset" for p in resp.json()["presets"])


def test_delete_nonexistent_preset_is_404(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.delete("/api/lcd/presets/does-not-exist")
    assert resp.status_code == 404


def test_rename_builtin_rejected(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.post("/api/lcd/presets/silent/rename", json={"new_name": "muted"})
    assert resp.status_code == 400


def test_rename_user_preset_works(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    # Save then rename.
    client.post("/api/lcd/presets", json={"name": "foo", "description": "", "config": {}})
    resp = client.post("/api/lcd/presets/foo/rename", json={"new_name": "bar"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["old_name"] == "foo"
    assert data["new_name"] == "bar"


def test_rename_to_builtin_name_rejected(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    client.post("/api/lcd/presets", json={"name": "foo2", "description": "", "config": {}})
    resp = client.post("/api/lcd/presets/foo2/rename", json={"new_name": "silent"})
    assert resp.status_code == 400


def test_rename_collision_is_409(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    client.post("/api/lcd/presets", json={"name": "src", "description": "", "config": {}})
    client.post("/api/lcd/presets", json={"name": "dst", "description": "", "config": {}})
    resp = client.post("/api/lcd/presets/src/rename", json={"new_name": "dst"})
    assert resp.status_code == 409


def test_duplicate_builtin_into_user(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.post("/api/lcd/presets/performing/duplicate", json={"new_name": "my-performing"})
    assert resp.status_code == 200

    # Now appears in user list.
    resp = client.get("/api/lcd/presets")
    user_names = {p["name"] for p in resp.json()["presets"] if not p["builtin"]}
    assert "my-performing" in user_names


def test_duplicate_nonexistent_is_404(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.post("/api/lcd/presets/nonexistent/duplicate", json={"new_name": "copy"})
    assert resp.status_code == 404


def test_apply_builtin_preset(client, tmp_path, monkeypatch, stub_manager):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.post("/api/lcd/presets/performing/apply")
    assert resp.status_code == 200
    data = resp.json()
    assert data["applied_displays"] == 2
    # Preset-load action was emitted.
    stub_manager.emit_operator_action.assert_awaited()


def test_apply_nonexistent_user_preset_is_404(client, tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    resp = client.post("/api/lcd/presets/ghost/apply")
    assert resp.status_code == 404


# ==========================================================================
# Alert config surface
# ==========================================================================


def test_alerts_config_get_defaults_when_router_missing(client):
    resp = client.get("/api/lcd/alerts/config")
    assert resp.status_code == 200
    # Either config dict or graceful fallback; both acceptable.
    body = resp.json()
    assert isinstance(body, dict)


def test_alerts_active_get_defaults_when_router_missing(client):
    resp = client.get("/api/lcd/alerts/active")
    assert resp.status_code == 200
    body = resp.json()
    assert "queue_length" in body or "alerts" in body
