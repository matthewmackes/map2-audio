from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services import plugin_preset_lifecycle as lifecycle_module


@pytest.fixture(autouse=True)
def _reset_lifecycle_singleton():
    lifecycle_module.PluginPresetLifecycle.reset_instance()
    yield
    lifecycle_module.PluginPresetLifecycle.reset_instance()


@pytest.mark.asyncio
async def test_lifecycle_events_emit_utc_timestamps(monkeypatch):
    lifecycle = lifecycle_module.PluginPresetLifecycle()
    captured: list[dict[str, object]] = []

    async def _listener(payload):
        captured.append(payload)

    lifecycle.register_listener("preset_created", _listener)
    fixed_now = datetime(2026, 4, 11, 12, 40, tzinfo=timezone.utc)
    monkeypatch.setattr(lifecycle_module, "utc_now", lambda: fixed_now)

    await lifecycle.on_preset_created(7, "Lead", "urn:test", {"gain": 0.7})

    assert lifecycle._loaded_presets_cache[7]["created_at"] == fixed_now.isoformat()
    assert captured == [
        {
            "preset_id": 7,
            "name": "Lead",
            "plugin_uri": "urn:test",
            "timestamp": fixed_now.isoformat(),
        }
    ]


@pytest.mark.asyncio
async def test_cleanup_unused_presets_uses_utc_cutoff(tmp_path, monkeypatch):
    from app import database as database_module

    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'plugin-preset-lifecycle.db'}")

    fixed_now = datetime(2026, 4, 11, 12, 50, tzinfo=timezone.utc)
    monkeypatch.setattr(lifecycle_module, "utc_now", lambda: fixed_now)
    lifecycle = lifecycle_module.PluginPresetLifecycle()

    async with database_module.get_session() as session:
        old_preset = database_module.PluginPreset(
            name="Old",
            plugin_uri="urn:old",
            plugin_name="Old Plugin",
            parameters="{}",
            created_at=fixed_now - timedelta(days=45),
            usage_count=0,
            is_favorite=False,
            is_default=False,
        )
        recent_preset = database_module.PluginPreset(
            name="Recent",
            plugin_uri="urn:new",
            plugin_name="New Plugin",
            parameters="{}",
            created_at=fixed_now - timedelta(days=5),
            usage_count=0,
            is_favorite=False,
            is_default=False,
        )
        session.add(old_preset)
        session.add(recent_preset)
        await session.flush()

    cleaned = await lifecycle.cleanup_unused_presets(days_threshold=30)

    assert cleaned == 1


def test_get_preset_lifecycle_uses_shared_singleton():
    first = lifecycle_module.get_preset_lifecycle()
    second = lifecycle_module.get_preset_lifecycle()

    assert first is second
