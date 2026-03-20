import asyncio
from pathlib import Path

from app.services.midi_hub.clock_engine import MidiClockEngine
from app.services.midi_hub.event_list_service import MidiHubEventListService
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.macros import MidiMacroService
from app.services.midi_hub.osc_namespace import OscNamespaceRouter
from app.services.midi_hub.preset_service import MidiHubPresetService
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.virtual_gpio import VirtualGpioService


def test_osc_namespace_routes_parameters_transport_and_feedback(tmp_path: Path) -> None:
    hub = MidiHub(auto_discover_alsa=False)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json")
    preset_service = MidiHubPresetService(router=router, hub=hub, storage_path=tmp_path / "presets.json")
    macro_service = MidiMacroService(hub=hub, router=router, preset_service=preset_service, storage_path=tmp_path / "macros.json")
    event_list_service = MidiHubEventListService(
        hub=hub,
        preset_service=preset_service,
        macro_service=macro_service,
        storage_path=tmp_path / "event-lists.json",
    )
    gpio = VirtualGpioService()
    clock = MidiClockEngine(hub=hub)
    namespace = OscNamespaceRouter(
        clock_engine=clock,
        preset_service=preset_service,
        macro_service=macro_service,
        event_list_service=event_list_service,
        virtual_gpio=gpio,
    )

    asyncio.run(preset_service.save_preset(preset_id="preset-1", name="Preset 1"))
    preset_service.set_default_preset("preset-1")
    preset_service.set_chain("chain-a", ["preset-1"])
    macro_service.upsert_macro(macro_id="macro-1", name="Macro 1", trigger={}, actions=[], enabled=True)
    event_list_service.upsert_event_list(
        event_list_id="show",
        name="Show",
        list_type="mtc",
        source_id="local",
        internal_clock_enabled=True,
        first_time="00:00:00:00",
        last_time="00:10:00:00",
        fps=30,
        timezone="UTC",
        enabled=True,
    )
    event_list_service.upsert_event(
        event_list_id="show",
        event_id="cue-1",
        order=1,
        time_address="00:00:01:00",
        action_type="RecallPreset",
        label="Cue 1",
        payload={"preset_id": "preset-1"},
        enabled=True,
    )

    plugin_param = asyncio.run(namespace.dispatch("/map2/plugin/demo/param/gain", 0.75))
    assert plugin_param["ok"] is True
    assert plugin_param["value"] == 0.75

    bypass = asyncio.run(namespace.dispatch("/map2/plugin/demo/bypass"))
    assert bypass["ok"] is True
    assert bypass["value"] is True

    bpm = asyncio.run(namespace.dispatch("/map2/transport/bpm", 132.5))
    assert bpm["ok"] is True
    assert abs(float(bpm["value"]) - 132.5) < 0.001

    chain = asyncio.run(namespace.dispatch("/map2/chain/chain-a/preset/1/fire"))
    assert chain["ok"] is True
    assert chain["value"] == "preset-1"

    cue = asyncio.run(namespace.dispatch("/map2/cue/show/1/fire"))
    assert cue["ok"] is True

    preset = asyncio.run(namespace.dispatch("/map2/preset/preset-1/fire"))
    assert preset["ok"] is True

    macro = asyncio.run(namespace.dispatch("/map2/macro/macro-1/fire"))
    assert macro["ok"] is True

    gpio_out = asyncio.run(namespace.dispatch("/map2/gpio/out/1", True))
    assert gpio_out["ok"] is True
    assert gpio_out["value"] is True

    ping = asyncio.run(namespace.dispatch("/map2/ping", 17))
    assert ping["ok"] is True
    assert ping["events"][0]["address"] == "/map2/out/ping"

    catalog = namespace.catalog()
    addresses = {entry["address"] for entry in catalog["entries"]}
    assert "/map2/transport/bpm" in addresses
    assert "/map2/out/ping" in addresses
    assert catalog["recent_events"]
