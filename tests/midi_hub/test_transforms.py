from app.services.midi_hub.transforms import MidiTransformEngine


def _apply(engine: MidiTransformEngine, data: bytes, chain, route_id: str = "r1"):
    return engine.apply_chain(data, chain, route_id=route_id, source_port="src")


def test_transform_registry_has_expected_surface():
    engine = MidiTransformEngine()
    kinds = {row["type"] for row in engine.TRANSFORM_TYPES}
    assert "cc_scale" in kinds
    assert "nrpn_pack" in kinds
    assert "mpe_zone" in kinds
    assert "value_scale" in kinds
    assert "maschine_pad_to_chain_cc" in kinds


def test_cc_scale_and_translation_transforms():
    engine = MidiTransformEngine()
    cc_scaled = _apply(
        engine,
        b"\xB0\x07\x64",
        [{"type": "cc_scale", "cc": 7, "curve": "linear", "min_output": 0, "max_output": 127}],
    )
    assert cc_scaled and cc_scaled[0].data[0] == 0xB0

    cc_to_note = _apply(
        engine,
        b"\xB0\x10\x7F",
        [{"type": "cc_to_note", "cc": 16, "note": 60, "velocity": 100}],
    )
    assert cc_to_note and (cc_to_note[0].data[0] & 0xF0) == 0x90

    note_to_cc = _apply(
        engine,
        b"\x90\x3C\x64",
        [{"type": "note_to_cc", "note": 60, "cc": 74}],
    )
    assert note_to_cc and note_to_cc[0].data[:2] == bytes([0xB0, 74])

    cc_to_pc = _apply(
        engine,
        b"\xB0\x0A\x7F",
        [{"type": "cc_to_program_change", "cc": 10, "program": 42}],
    )
    assert cc_to_pc and (cc_to_pc[0].data[0] & 0xF0) == 0xC0

    pc_to_cc = _apply(
        engine,
        b"\xC0\x2A",
        [{"type": "program_change_to_cc", "cc": 11}],
    )
    assert pc_to_cc and (pc_to_cc[0].data[0] & 0xF0) == 0xB0


def test_note_velocity_program_sysex_transforms():
    engine = MidiTransformEngine()
    velocity = _apply(
        engine,
        b"\x90\x40\x64",
        [{"type": "velocity_curve", "mode": "compress"}],
    )
    assert velocity and velocity[0].data[0] == 0x90

    harmonized = _apply(
        engine,
        b"\x90\x3C\x64",
        [{"type": "note_transpose_quantize_harmonize", "transpose": 2, "harmonize": [0, 4, 7]}],
    )
    assert len(harmonized) == 3

    remapped_pc = _apply(
        engine,
        b"\xC0\x05",
        [{"type": "program_change_remap", "remap": {"5": 12}, "bank_msb": 1, "bank_lsb": 2}],
    )
    assert len(remapped_pc) == 3

    sysex_builder = _apply(
        engine,
        b"\xB0\x07\x40",
        [{"type": "sysex_builder", "template": [0xF0, 0x7D, "{data1}", "{data2}", 0xF7]}],
    )
    assert sysex_builder and sysex_builder[0].data[0] == 0xF0 and sysex_builder[0].data[-1] == 0xF7

    sysex_parser = _apply(
        engine,
        bytes([0xF0, 0x7D, 0x10, 0x20, 0xF7]),
        [{"type": "sysex_parser", "mode": "cc", "cc": 33, "value_index": 3}],
    )
    assert sysex_parser and (sysex_parser[0].data[0] & 0xF0) == 0xB0


def test_logic_flow_and_curve_transforms():
    engine = MidiTransformEngine()
    dropped = _apply(
        engine,
        b"\xB0\x10\x20",
        [{"type": "conditional", "field": "data2", "op": "<", "value": 64, "action": "drop"}],
    )
    assert dropped == []

    split = _apply(
        engine,
        b"\x90\x3C\x64",
        [{"type": "message_split", "copies": 3, "interval_ms": 5}],
    )
    assert len(split) == 3
    assert split[2].delay_ms >= split[0].delay_ms

    throttled_first = _apply(
        engine,
        b"\xB0\x07\x40",
        [{"type": "throttle", "min_interval_ms": 200}],
        route_id="throttle",
    )
    throttled_second = _apply(
        engine,
        b"\xB0\x07\x41",
        [{"type": "throttle", "min_interval_ms": 200}],
        route_id="throttle",
    )
    assert throttled_first
    assert throttled_second == []

    delayed = _apply(
        engine,
        b"\x90\x30\x64",
        [{"type": "message_delay", "delay_ms": 15}],
    )
    assert delayed and delayed[0].delay_ms >= 15

    pitch_curve = _apply(
        engine,
        b"\xE0\x00\x40",
        [{"type": "pitch_aftertouch_curve", "curve": "s_curve"}],
    )
    assert pitch_curve and pitch_curve[0].data[0] == 0xE0

    split_note = _apply(
        engine,
        b"\x90\x40\x64",
        [{"type": "key_velocity_split", "note_range": [60, 72], "velocity_range": [1, 127], "tag": "upper"}],
    )
    assert split_note and split_note[0].metadata.get("split_tag") == "upper"


def test_nrpn_mpe_and_legacy_transforms():
    engine = MidiTransformEngine()

    nrpn_packed = _apply(
        engine,
        b"\xB0\x10\x40",
        [{"type": "nrpn_pack", "parameter": 300}],
    )
    assert len(nrpn_packed) == 4

    # NRPN unpack requires a 4-message sequence.
    chain = [{"type": "nrpn_unpack", "target_cc": 74}]
    assert _apply(engine, bytes([0xB0, 99, 0x02]), chain) == []
    assert _apply(engine, bytes([0xB0, 98, 0x0C]), chain) == []
    assert _apply(engine, bytes([0xB0, 6, 0x01]), chain) == []
    unpacked = _apply(engine, bytes([0xB0, 38, 0x20]), chain)
    assert unpacked and unpacked[0].data[1] == 74

    mpe = _apply(
        engine,
        b"\x92\x3C\x64",  # channel 3 note-on
        [{"type": "mpe_zone", "zone_low": 2, "zone_high": 16, "master_channel": 1, "remap_to_master": True}],
    )
    assert mpe and (mpe[0].data[0] & 0x0F) == 0x00

    ch_remap = _apply(engine, b"\x92\x3C\x64", [{"type": "channel_remap", "channel": 1}])
    assert ch_remap and (ch_remap[0].data[0] & 0x0F) == 0

    cc_remap = _apply(engine, b"\xB0\x07\x64", [{"type": "cc_remap", "mapping": {"7": 11}}])
    assert cc_remap and cc_remap[0].data[1] == 11

    value_scale = _apply(engine, b"\xB0\x07\x64", [{"type": "value_scale", "scale": 0.5}])
    assert value_scale and value_scale[0].data[2] == 50


def test_maschine_pad_to_chain_cc_transform():
    engine = MidiTransformEngine()

    note_on = _apply(
        engine,
        b"\x90\x24\x64",
        [{"type": "maschine_pad_to_chain_cc", "select_cc": 110, "bypass_cc": 111, "base_note": 36}],
    )
    assert note_on and note_on[0].data == bytes([0xB0, 110, 0])
    assert note_on[0].metadata["pad_index"] == 0

    note_off = _apply(
        engine,
        b"\x80\x27\x00",
        [{"type": "maschine_pad_to_chain_cc", "select_cc": 110, "bypass_cc": 111, "base_note": 36}],
    )
    assert note_off and note_off[0].data == bytes([0xB0, 111, 3])
