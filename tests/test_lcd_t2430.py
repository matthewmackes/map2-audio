"""Backend pytest for T2430 LCD refactor — routes, manager, hook evaluator, morph."""
from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolate_hooks_dir(monkeypatch, tmp_path):
    """Redirect hook storage to a tmp dir per-test so tests don't clobber user data."""
    monkeypatch.setenv("HOME", str(tmp_path))
    yield


# ---------- lcd_hook_evaluator ----------


def test_get_hook_returns_none_for_unknown_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    from app.services.snapshot.lcd_hook_evaluator import get_hook
    assert get_hook("unknown-snapshot") is None


def test_set_and_get_hook_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    from app.services.snapshot.lcd_hook_evaluator import set_hook, get_hook
    hook = {"preset": "performing"}
    set_hook("snap-42", hook)
    assert get_hook("snap-42") == hook


def test_set_hook_none_deletes(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    from app.services.snapshot.lcd_hook_evaluator import set_hook, get_hook
    set_hook("snap-42", {"preset": "silent"})
    set_hook("snap-42", None)
    assert get_hook("snap-42") is None


def test_resolve_hook_preset_member():
    from app.services.snapshot.lcd_hook_evaluator import resolve_hook
    preset = {
        "displays": [
            {"id": 0, "brightness": 255, "default_page": "vu", "auto_cycle_interval_s": 45},
            {"id": 1, "brightness": 255, "default_page": "chain", "auto_cycle_interval_s": 45},
        ],
    }
    resolved = resolve_hook({"preset": "performing"}, load_preset=lambda _name: preset)
    assert resolved is not None
    # Only snapshot-aware fields survive (brightness is node-local → dropped).
    assert resolved["displays"][0]["default_page"] == "vu"
    assert resolved["displays"][0]["auto_cycle_interval_s"] == 45
    assert "brightness" not in resolved["displays"][0]


def test_resolve_hook_inline_member():
    from app.services.snapshot.lcd_hook_evaluator import resolve_hook
    hook = {"inline": {"displays": [{"id": 0, "default_page": "perf", "alert_sound": False}]}}
    resolved = resolve_hook(hook, load_preset=lambda _name: None)
    assert resolved == {"displays": [{"id": 0, "default_page": "perf", "alert_sound": False}]}


def test_resolve_hook_none_returns_none():
    from app.services.snapshot.lcd_hook_evaluator import resolve_hook
    assert resolve_hook(None, load_preset=lambda n: None) is None
    assert resolve_hook({}, load_preset=lambda n: None) is None


def test_resolve_hook_unknown_preset_returns_none():
    from app.services.snapshot.lcd_hook_evaluator import resolve_hook
    result = resolve_hook({"preset": "nonexistent"}, load_preset=lambda _name: None)
    assert result is None


# ---------- interpolate_snapshot_aware ----------


def _corner_with(id_: int, **fields):
    return {"displays": [{"id": id_, **fields}]}


def test_interpolate_bilinear_numeric_at_midpoint():
    from app.services.snapshot.lcd_hook_evaluator import interpolate_snapshot_aware
    corners = {
        "A": _corner_with(0, auto_cycle_interval_s=30),
        "B": _corner_with(0, auto_cycle_interval_s=60),
        "C": _corner_with(0, auto_cycle_interval_s=45),
        "D": _corner_with(0, auto_cycle_interval_s=90),
    }
    r = interpolate_snapshot_aware(corners, x=0.5, y=0.5)
    assert r is not None
    # Midpoint = (30+60+45+90)/4 = 56.25
    assert r["displays"][0]["auto_cycle_interval_s"] == pytest.approx(56.25)


def test_interpolate_corner_snap_for_categorical():
    from app.services.snapshot.lcd_hook_evaluator import interpolate_snapshot_aware
    corners = {
        "A": _corner_with(0, default_page="status"),
        "B": _corner_with(0, default_page="vu"),
        "C": _corner_with(0, default_page="chain"),
        "D": _corner_with(0, default_page="perf"),
    }
    # (0,0) should pick A; (1,0) → B; (0,1) → C; (1,1) → D.
    assert interpolate_snapshot_aware(corners, x=0.0, y=0.0)["displays"][0]["default_page"] == "status"
    assert interpolate_snapshot_aware(corners, x=1.0, y=0.0)["displays"][0]["default_page"] == "vu"
    assert interpolate_snapshot_aware(corners, x=0.0, y=1.0)["displays"][0]["default_page"] == "chain"
    assert interpolate_snapshot_aware(corners, x=1.0, y=1.0)["displays"][0]["default_page"] == "perf"


def test_interpolate_bool_threshold_at_half():
    from app.services.snapshot.lcd_hook_evaluator import interpolate_snapshot_aware
    corners = {
        "A": _corner_with(0, alert_sound=False),
        "B": _corner_with(0, alert_sound=True),
        "C": _corner_with(0, alert_sound=False),
        "D": _corner_with(0, alert_sound=True),
    }
    # At x < 0.5, avg < 0.5 → False; at x > 0.5, avg > 0.5 → True.
    assert interpolate_snapshot_aware(corners, x=0.25, y=0.5)["displays"][0]["alert_sound"] is False
    assert interpolate_snapshot_aware(corners, x=0.75, y=0.5)["displays"][0]["alert_sound"] is True


def test_interpolate_all_corners_none_returns_none():
    from app.services.snapshot.lcd_hook_evaluator import interpolate_snapshot_aware
    assert interpolate_snapshot_aware({"A": None, "B": None, "C": None, "D": None}, x=0.5, y=0.5) is None


def test_interpolate_position_clamped_to_unit_square():
    from app.services.snapshot.lcd_hook_evaluator import interpolate_snapshot_aware
    corners = {"A": _corner_with(0, auto_cycle_interval_s=10), "B": None, "C": None, "D": None}
    # x=-5, y=100 should clamp to (0,0) corner = 10.
    r = interpolate_snapshot_aware(corners, x=-5.0, y=100.0)
    assert r["displays"][0]["auto_cycle_interval_s"] == pytest.approx(10.0)


# ---------- LCDMorphEvaluator ----------


@pytest.mark.asyncio
async def test_morph_evaluator_runs_at_configured_period():
    from app.services.snapshot.lcd_morph_evaluator import LCDMorphEvaluator

    applied = []

    async def apply(hook):
        applied.append(hook)

    ev = LCDMorphEvaluator(
        position_source=lambda: None,  # no-op source
        apply_hook=apply,
        preset_loader=lambda n: None,
        period_s=0.05,
    )
    await ev.start()
    await asyncio.sleep(0.2)
    await ev.stop()
    # Expect ~4 evals at 50 ms period over 200 ms.
    assert ev.get_stats()["evals"] >= 3
    # No corners → no applies.
    assert ev.get_stats()["applies"] == 0


@pytest.mark.asyncio
async def test_morph_evaluator_backpressure_suppresses_small_changes(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    from app.services.snapshot.lcd_morph_evaluator import LCDMorphEvaluator, MorphState
    from app.services.snapshot.lcd_hook_evaluator import set_hook

    # Two corners with tiny numeric delta (< NUMERIC_EPSILON=2).
    set_hook("s-A", {"inline": {"displays": [{"id": 0, "auto_cycle_interval_s": 30}]}})
    set_hook("s-B", {"inline": {"displays": [{"id": 0, "auto_cycle_interval_s": 31}]}})

    applied = []

    async def apply(hook):
        applied.append(hook)

    state = MorphState(x=0.5, y=0.0, corners={"A": "s-A", "B": "s-B", "C": None, "D": None})

    ev = LCDMorphEvaluator(
        position_source=lambda: state,
        apply_hook=apply,
        preset_loader=lambda n: None,
        period_s=0.05,
    )
    await ev.start()
    await asyncio.sleep(0.25)
    await ev.stop()
    # First tick applies; subsequent ticks with same interpolated value should be suppressed.
    assert ev.get_stats()["applies"] == 1
    assert ev.get_stats()["suppressed"] >= 1


# ---------- LCDManager multi-adapter ----------


@pytest.mark.asyncio
async def test_lcd_manager_multi_adapter_init():
    from app.drivers.lcd_display import MockLCDDisplay
    from app.services.lcd_manager import LCDManager

    mgr = LCDManager(
        "NODE-A",
        "Test",
        lcds=[MockLCDDisplay(), MockLCDDisplay()],
    )
    assert len(mgr.lcds) == 2
    assert mgr.lcd is mgr.lcds[0]  # back-compat alias


@pytest.mark.asyncio
async def test_lcd_manager_driver_health_report():
    from app.drivers.lcd_display import MockLCDDisplay
    from app.services.lcd_manager import LCDManager

    mgr = LCDManager("NODE-A", "Test", lcds=[MockLCDDisplay(), MockLCDDisplay()])
    health = mgr.get_driver_health()
    assert len(health) == 2
    assert health[0]["lcd_id"] == 0
    assert health[0]["adapter"] == "mock"
    assert health[0]["is_mock"] is True
    assert health[0]["driver_class"] == "MockLCDDisplay"


@pytest.mark.asyncio
async def test_lcd_manager_emit_operator_action(monkeypatch):
    """Smoke-test PlatformEvent emission on semantic operator actions."""
    monkeypatch.setenv("PLATFORM_EVENT_BUS_ENABLED", "1")
    from app.drivers.lcd_display import MockLCDDisplay
    from app.services.lcd_manager import LCDManager
    from app.services.platform_event.bus import (
        PlatformEventBus,
        PlatformEventFilter,
    )
    # Use a dedicated instance so we don't depend on the global singleton state.
    bus = PlatformEventBus(enabled=True)
    received = []

    async def cb(ev):
        received.append(ev)

    sub = await bus.subscribe_callback(cb, PlatformEventFilter())

    mgr = LCDManager(
        "NODE-A",
        "Test",
        lcds=[MockLCDDisplay()],
        platform_event_bus=bus,
    )
    await mgr.emit_operator_action(
        "page_changed",
        title="LCD → vu",
        message="page set",
        context={"page": "vu"},
    )
    await asyncio.sleep(0.05)
    sub.close()

    assert len(received) == 1
    e = received[0]
    assert e.kind == "lcd.user"
    assert e.source_service == "lcd_manager"
    assert e.context["operator_action"] == "page_changed"
    assert e.context["page"] == "vu"


# ---------- LCD routes integration ----------


def test_lcd_routes_registered_expected_endpoints():
    """Every new T2430 route must be in the router."""
    from app.routes import lcd
    paths = {r.path for r in lcd.router.routes}
    for expected in [
        "/api/lcd/displays-config",
        "/api/lcd/health",
        "/api/lcd/reconnect/{lcd_id}",
        "/api/lcd/native/write",
        "/api/lcd/morph-stats",
        "/api/lcd/snapshot-hooks",
        "/api/lcd/snapshot-hooks/{snapshot_id}",
        "/api/lcd/presets/{name}",
        "/api/lcd/presets/{name}/rename",
        "/api/lcd/presets/{name}/duplicate",
        "/api/lcd/presets/{name}/apply",
    ]:
        assert expected in paths, f"Missing route: {expected}"


def test_lcd_config_schema_has_per_lcd_displays():
    from app.config_schema import LCD_SCHEMA, LCD_SNAPSHOT_AWARE_FIELDS
    displays = LCD_SCHEMA["lcd.displays"].default
    assert isinstance(displays, list)
    assert len(displays) == 2
    for entry in displays:
        # 14 per-LCD fields + id + address = 16 keys.
        assert len(entry) == 16
        # Snapshot-aware subset present.
        for field in LCD_SNAPSHOT_AWARE_FIELDS:
            assert field in entry


def test_lcd_builtin_presets_complete():
    """Q7b: 5 built-in read-only presets must be defined with the right names."""
    # Import directly from routes module (where built-ins live).
    import importlib
    lcd_routes = importlib.import_module("app.routes.lcd")
    builtins = getattr(lcd_routes, "_BUILTIN_LCD_PRESETS")
    expected = {"factory-default", "performing", "rehearsal", "setup", "silent"}
    assert set(builtins.keys()) == expected
    for name, spec in builtins.items():
        assert "displays" in spec["config"]
        assert len(spec["config"]["displays"]) == 2


def test_ft232h_driver_importable_without_pyftdi():
    """FT232H driver module should always import; connect() raises if pyftdi missing."""
    from app.drivers.ft232h_lcd_display import FT232HLCDDisplay
    drv = FT232HLCDDisplay(address=0x27)
    assert drv.address == 0x27
    assert not drv.connected
