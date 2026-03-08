import pytest

from app.services import native_inventory


@pytest.mark.asyncio
async def test_evaluate_inventory_gate_catalog_only(monkeypatch):
    monkeypatch.setattr(native_inventory, "load_native_catalog", lambda: ["map2://juce/dynamics/compressor"])
    monkeypatch.setattr(native_inventory, "config_get", lambda key, default=None: True if key.endswith("required") else 1)

    payload = await native_inventory.evaluate_inventory_gate(probe_load=False)

    assert payload["catalog_count"] == 1
    assert payload["state"] == "catalog_only"
    assert payload["ready"] is True
    assert payload["gate_pass"] is True


class _FakeEngine:
    is_available = True
    is_running = True

    async def load_plugin(self, uri: str) -> int:
        if uri.endswith("compressor"):
            return 101
        return -1

    async def unload_plugin(self, instance_id: int) -> bool:
        return True


@pytest.mark.asyncio
async def test_probe_native_loadability_reports_failures(monkeypatch):
    monkeypatch.setattr(
        native_inventory,
        "load_native_catalog",
        lambda: ["map2://juce/dynamics/compressor", "map2://juce/dynamics/limiter"],
    )
    monkeypatch.setattr(native_inventory, "config_get", lambda key, default=None: True if key.endswith("required") else 1)

    from app.services import juce_engine_service

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: _FakeEngine())

    payload = await native_inventory.probe_native_loadability(probe_load=True)

    assert payload["state"] == "probed"
    assert payload["loadable_count"] == 1
    assert payload["failed_count"] == 1
    assert payload["ready"] is True
