import asyncio
from pathlib import Path

import pytest

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.script_engine import MidiScriptEngine


def _make_engine(tmp_path: Path) -> tuple[MidiHub, MidiScriptEngine]:
    hub = MidiHub(auto_discover_alsa=False)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json")
    engine = MidiScriptEngine(
        hub=hub,
        router=router,
        scripts_path=tmp_path / "scripts.json",
        state_path=tmp_path / "state.json",
    )
    return hub, engine


@pytest.mark.asyncio
async def test_script_engine_runs_backend_code_and_emits_midi(tmp_path: Path):
    hub, engine = _make_engine(tmp_path)
    destination = VirtualMidiPort(port_id="virtual:dst", name="Destination", direction="duplex")
    hub.register_port(destination, open_now=False)
    hub.start()

    engine.upsert_script(
        script_id="script_a",
        name="Script A",
        enabled=True,
        code=(
            "def main(event):\n"
            "    state.set('last_tag', event.get('tag'))\n"
            "    log.info(f\"ran {event.get('tag', 'none')}\")\n"
            "    midi.cc('virtual:dst', 2, 74, 99)\n"
        ),
    )

    result = await engine.run_script("script_a", {"tag": "intro"})
    await asyncio.sleep(0.05)

    transmitted = destination.read_transmitted(max_messages=8)
    console = engine.get_console("script_a", limit=20)
    hub.stop()

    assert result == {"ok": True, "script_id": "script_a"}
    assert engine.get_state_value("last_tag") == "intro"
    assert transmitted
    assert transmitted[0].data == bytes([0xB1, 74, 99])
    assert any("INFO ran intro" in line for line in console["lines"])
    assert any("INFO execution completed" in line for line in console["lines"])


@pytest.mark.asyncio
async def test_script_engine_rejects_imports_outside_safe_builtins(tmp_path: Path):
    hub, engine = _make_engine(tmp_path)

    engine.upsert_script(
        script_id="script_b",
        name="Script B",
        enabled=True,
        code=(
            "import os\n"
            "\n"
            "def main(event):\n"
            "    return os.getcwd()\n"
        ),
    )

    result = await engine.run_script("script_b", {})
    console = engine.get_console("script_b", limit=20)

    assert result["ok"] is False
    assert result["script_id"] == "script_b"
    assert "__import__" in result["error"]
    assert any("ERROR execution failed" in line for line in console["lines"])
