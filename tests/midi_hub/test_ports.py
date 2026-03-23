from app.services.midi_hub.ports import VirtualMidiPort
from app.services.midi_hub.midi2 import Midi2Manager


def test_virtual_midi_port_inject_receive_and_send():
    port = VirtualMidiPort(port_id="v1", name="Virtual 1")
    assert port.open() is True

    assert port.inject(b"\x90\x3c\x64", source_port="test_src")
    received = port.receive(max_messages=8)
    assert len(received) == 1
    assert received[0].data == b"\x90\x3c\x64"
    assert received[0].source_port == "test_src"

    assert port.send(b"\x80\x3c\x00")
    tx = port.read_transmitted(max_messages=8)
    assert len(tx) == 1
    assert tx[0].data == b"\x80\x3c\x00"


def test_virtual_midi_port_metadata_tracks_buffers():
    port = VirtualMidiPort(port_id="v2", name="Virtual 2")
    assert port.open() is True

    assert port.inject(b"\xF8")
    assert port.send(b"\xFA")

    metadata = port.metadata()
    assert metadata["rx"]["size"] >= 1
    assert metadata["tx"]["size"] >= 1


def test_midi2_manager_translates_channel_voice_ump_round_trip():
    manager = Midi2Manager(enabled=True)

    words = manager.midi1_to_ump(bytes([0x90, 60, 100]))
    assert len(words) == 1
    assert (words[0] >> 28) & 0xF == 0x2
    assert manager.ump_to_midi1(words) == bytes([0x90, 60, 100])


def test_midi2_manager_translates_short_messages_and_discovery_payload():
    manager = Midi2Manager(enabled=True)

    program_change = manager.midi1_to_ump(bytes([0xC1, 10]))
    assert len(program_change) == 1
    assert manager.ump_to_midi1(program_change) == bytes([0xC1, 10])

    clock = manager.midi1_to_ump(bytes([0xF8]))
    assert len(clock) == 1
    assert (clock[0] >> 28) & 0xF == 0x1
    assert manager.ump_to_midi1(clock) == bytes([0xF8])

    discovery = manager.build_discovery_sysex()
    assert discovery[0] == 0xF0
    assert discovery[-1] == 0xF7
    assert discovery[3:6] == [0x0D, 0x70, 0x02]


def test_midi2_manager_translates_sysex7_to_ump_round_trip():
    manager = Midi2Manager(enabled=True)

    message = bytes([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7])
    words = manager.midi1_to_ump(message)

    assert len(words) == 2
    assert (words[0] >> 28) & 0xF == 0x3
    assert manager.ump_to_midi1(words) == message


def test_midi2_manager_inspects_utility_channel_voice_and_sysex8_ump_packets():
    manager = Midi2Manager(enabled=True)

    messages = manager.inspect_ump(
        [
            0x01011234,
            0x40903C00,
            0x12345678,
            0x50000412,
            0x01020300,
            0x00000000,
            0x00000000,
        ]
    )

    assert messages[0]["kind"] == "jr_clock"
    assert messages[0]["ticks"] == 0x1234
    assert messages[1]["kind"] == "note_on"
    assert messages[1]["note"] == 60
    assert messages[1]["velocity"] == 0x12345678
    assert messages[2]["type"] == "sysex8_or_data"
    assert messages[2]["stream_id"] == 0x12
    assert messages[2]["data_hex"] == "01 02 03"
