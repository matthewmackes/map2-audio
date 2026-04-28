from __future__ import annotations

from pathlib import Path

import pytest

from app.services.controllers.mapping_file_handler import MappingControl, MappingDescriptor
from app.services.midi_host_client import MidiHostClient, MidiHostClientError


def test_descriptor_payload_serializes_mapping_descriptor_dataclass() -> None:
    descriptor = MappingDescriptor(
        pack_id="meloaudio",
        model="midi-commander",
        kind="midi",
        source_path=Path("device-packs/meloaudio/profiles/midi-commander.midi.yaml"),
        scripts=("scripts/commander.js",),
        controls=(
            MappingControl(
                status=0xB0,
                midino=80,
                channel=1,
                target="audio.chain.1.bypass",
                action="toggle",
                script="MeloAudioCommander.toggle_chain_1_bypass",
                fast_path=False,
                description="toggle",
            ),
        ),
        outputs=(),
        settings=({"id": "curve", "default": "linear"},),
        mixxx_alias_table={"[Master]": "audio.master"},
    )

    payload = MidiHostClient._descriptor_payload(descriptor)

    assert payload["pack_id"] == "meloaudio"
    assert payload["model"] == "midi-commander"
    assert payload["scripts"] == ["scripts/commander.js"]
    assert payload["controls"][0]["midino"] == 80
    assert payload["controls"][0]["script"] == "MeloAudioCommander.toggle_chain_1_bypass"
    assert payload["mixxx_alias_table"]["[Master]"] == "audio.master"


def test_load_script_sends_expected_payload(monkeypatch) -> None:
    client = MidiHostClient(socket_path=Path("/tmp/not-used.sock"))
    captured: dict[str, object] = {}

    def _capture(req: dict) -> None:
        captured.update(req)

    monkeypatch.setattr(client, "_send_only", _capture)

    msg_id = client.load_script(
        controller_key="alsa-seq:MIDI Commander:0",
        pack_id="meloaudio",
        model="midi-commander",
        script_path="/tmp/commander.js",
        script_body="globalThis['x']=1;",
    )

    assert captured["type"] == "script_load_request"
    assert captured["controller_key"] == "alsa-seq:MIDI Commander:0"
    assert captured["pack_id"] == "meloaudio"
    assert captured["model"] == "midi-commander"
    assert captured["script_path"] == "/tmp/commander.js"
    assert captured["script_body"] == "globalThis['x']=1;"
    assert captured["msg_id"] == msg_id


def test_activate_mapping_sends_expected_payload(monkeypatch) -> None:
    client = MidiHostClient(socket_path=Path("/tmp/not-used.sock"))
    captured: dict[str, object] = {}

    def _capture(req: dict) -> None:
        captured.update(req)

    monkeypatch.setattr(client, "_send_only", _capture)

    descriptor = {
        "pack_id": "meloaudio",
        "model": "midi-commander",
        "kind": "midi",
        "scripts": ["scripts/commander.js"],
        "controls": [],
        "outputs": [],
        "settings": [],
        "mixxx_alias_table": {},
    }

    msg_id = client.activate_mapping(
        controller_key="alsa-seq:MIDI Commander:0",
        descriptor=descriptor,
    )

    assert captured["type"] == "mapping_activate"
    assert captured["controller_key"] == "alsa-seq:MIDI Commander:0"
    assert captured["descriptor"] == descriptor
    assert captured["msg_id"] == msg_id


def test_open_midi_input_sends_expected_payload(monkeypatch) -> None:
    client = MidiHostClient(socket_path=Path("/tmp/not-used.sock"))
    captured: dict[str, object] = {}

    def _capture(req: dict) -> None:
        captured.update(req)

    monkeypatch.setattr(client, "_send_only", _capture)

    msg_id = client.open_midi_input(
        controller_key="alsa-seq:MIDI Commander:0",
        port_id="MIDI Commander:0",
    )

    assert captured["type"] == "midi_open_input_request"
    assert captured["controller_key"] == "alsa-seq:MIDI Commander:0"
    assert captured["port_id"] == "MIDI Commander:0"
    assert captured["msg_id"] == msg_id


def test_send_surfaces_raise_on_unreachable_socket(tmp_path: Path) -> None:
    client = MidiHostClient(socket_path=tmp_path / "missing.sock", timeout_s=0.2)

    with pytest.raises(MidiHostClientError):
        client.load_script(
            controller_key="k",
            pack_id="p",
            model="m",
            script_path="/tmp/x.js",
            script_body="",
        )
