"""Current advanced-stack regression tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.services.plugin_catalog import (
    AdvancedPluginManager,
    LazyPluginMetadataManager,
    PluginMetadataFull,
    PluginMetadataLite,
    PluginSearchIndex,
)
from app.services.tui_screen_manager import DebouncedScreenUpdater, ScreenManager
from tui.screens import ChainsManagerScreen, MIDIScreen
from tui.screens.dashboard_screen import DashboardScreen
from tui.screens.effects_manager_screen import EffectsManagerScreen


class _FakeScreenDriver:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def clear(self) -> None:
        self.calls.append(("clear", None))

    def render_full_layout(self, data: dict) -> None:
        self.calls.append(("full", data))

    def render_region(self, region: str, data: dict) -> None:
        self.calls.append(("region", region))

    def refresh(self) -> None:
        self.calls.append(("refresh", None))


def test_lazy_plugin_metadata_manager_cache_round_trip(tmp_path: Path) -> None:
    manager = LazyPluginMetadataManager(tmp_path / "cache")
    lite = PluginMetadataLite(
        uri="urn:map2:test:delay",
        name="Delay Line",
        category="Delay",
        version="1.0.0",
        in_ports=2,
        out_ports=2,
    )
    full = PluginMetadataFull(
        uri=lite.uri,
        name=lite.name,
        category=lite.category,
        version=lite.version,
        in_ports=lite.in_ports,
        out_ports=lite.out_ports,
        parameters=[{"index": 0, "name": "Mix"}],
        presets=["Wide"],
        file_path="/tmp/delay.lv2",
        file_size=128,
        file_hash="abc123",
    )

    manager.add_lite(lite)
    manager.add_full(full)
    manager.save_to_cache()

    restored = LazyPluginMetadataManager(tmp_path / "cache")
    assert restored.load_from_cache() is True
    assert restored.get_lite(lite.uri).name == "Delay Line"
    assert restored.get_full(full.uri).parameters == [{"index": 0, "name": "Mix"}]


def test_plugin_search_index_matches_name_and_category() -> None:
    index = PluginSearchIndex()
    delay = PluginMetadataLite(uri="urn:delay", name="Tape Delay", category="Delay")
    reverb = PluginMetadataLite(uri="urn:reverb", name="Room Reverb", category="Reverb")
    index.add_plugin(delay)
    index.add_plugin(reverb)

    assert index.search_by_category("Delay") == {"urn:delay"}
    assert index.search_by_name("room") == {"urn:reverb"}
    assert set(index.get_categories()) == {"Delay", "Reverb"}


def test_advanced_plugin_manager_discovers_and_searches(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    lv2_root = tmp_path / "lv2"
    delay_dir = lv2_root / "tape-delay.lv2"
    reverb_dir = lv2_root / "plate-reverb.lv2"
    delay_dir.mkdir(parents=True)
    reverb_dir.mkdir(parents=True)
    (delay_dir / "manifest.ttl").write_text("", encoding="utf-8")
    (reverb_dir / "manifest.ttl").write_text("", encoding="utf-8")

    monkeypatch.setattr(Path, "home", lambda: tmp_path)

    manager = AdvancedPluginManager([str(lv2_root)])
    manager.start()
    try:
        plugins = manager.get_all_plugins()
        assert len(plugins) == 2
        names = {plugin["name"] for plugin in plugins}
        assert names == {"Tape Delay", "Plate Reverb"}
        assert {plugin["category"] for plugin in plugins} == {"Delay", "Reverb"}
        assert manager.search("tape")[0]["uri"] == "urn:map2:lv2:tape-delay.lv2"
        assert manager.search("", category="Reverb")[0]["uri"] == "urn:map2:lv2:plate-reverb.lv2"
    finally:
        manager.stop()


@pytest.mark.asyncio
async def test_debounced_screen_updater_flushes_latest_full_update() -> None:
    screen = _FakeScreenDriver()
    updater = DebouncedScreenUpdater(screen, debounce_ms=50.0, max_updates_per_second=1.0)

    await updater.request_update({"page": "first"})
    await updater.request_update({"page": "second"})
    await updater.flush()

    assert ("full", {"page": "second"}) in screen.calls
    assert screen.calls[-1] == ("refresh", None)


@pytest.mark.asyncio
async def test_screen_manager_updates_multiple_regions() -> None:
    screen = _FakeScreenDriver()
    manager = ScreenManager(screen)

    await manager.update_multiple(
        {
            "chains": {"count": 2},
            "midi": {"ports": 4},
        }
    )
    await manager.flush()

    region_calls = [call for call in screen.calls if call[0] == "region"]
    assert ("region", "chains") in region_calls
    assert ("region", "midi") in region_calls
    assert await manager.get_component_data("chains") == {"count": 2}


def test_current_tui_screen_exports_point_to_live_classes() -> None:
    assert ChainsManagerScreen.__name__ == "ChainsManagerScreen"
    assert MIDIScreen.__name__ == "MIDIScreen"
    assert DashboardScreen.__name__ == "DashboardScreen"
    assert EffectsManagerScreen.__name__ == "EffectsManagerScreen"
