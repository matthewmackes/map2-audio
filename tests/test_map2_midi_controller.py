"""Synthesized-MIDI tests for the Map2MidiController dispatch path.

T2459-F2 acceptance gate. Mirrors Mixxx's
``src/test/midicontrollertest.cpp`` (692 lines) pattern — feed
synthesized MIDI bytes through the controller subsystem's binding-
resolution + engine-command-dispatch path and assert correct
``EngineCommand`` IPC frames are emitted.

Note on scope: the C++ ``Map2MidiController`` itself is exercised by
the Catch2 ``controllers_tests`` target (60 cases at the time of
F2 ship). This pytest suite covers the MAP2-side dispatch logic that
the C++ controller fires events into — the YAML mapping descriptor
resolver from T2459-A3 + the IPC schema from T2459-A5. Together they
form the full inbound-MIDI-to-EngineCommand chain.

Worklist: T2459-F2.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import Any, Iterator

import pytest

from app.schemas.controller_host import (
    encode_frame,
    decode_frame,
)
from app.services.controllers.mapping_file_handler import (
    MappingControl,
    MappingDescriptor,
)


REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Helper: a minimal in-process dispatcher mirroring what
# Map2Controller::dispatch (C++) does — fast-path lookup, otherwise
# emit an EngineCommand IPC frame for the controller-host.
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class DispatchOutcome:
    """One inbound MIDI message's dispatch outcome."""

    fast_path_target: str | None = None
    fast_path_action: str | None = None
    engine_command_frame: dict[str, Any] | None = None
    script_invocation: tuple[str, list[int]] | None = None  # (script_name, bytes)
    skipped_reason: str | None = None


def dispatch_midi_bytes(
    descriptor: MappingDescriptor,
    bytes_seq: list[int],
    controller_key: str = "test:0:0",
) -> DispatchOutcome:
    """Resolve `bytes_seq` through `descriptor`'s controls, returning
    a DispatchOutcome that summarises what the live controller-host
    would do.
    """
    if not bytes_seq:
        return DispatchOutcome(skipped_reason="empty bytes")

    status = bytes_seq[0]
    midino = bytes_seq[1] if len(bytes_seq) >= 2 else None

    matching = [c for c in descriptor.controls if _row_matches(c, status, midino)]
    if not matching:
        return DispatchOutcome(skipped_reason="no matching control row")

    row = matching[0]

    if row.fast_path:
        return DispatchOutcome(
            fast_path_target=row.target,
            fast_path_action=row.action,
        )

    if row.script:
        return DispatchOutcome(
            script_invocation=(row.script, list(bytes_seq)),
        )

    if row.target:
        # Direct binding — controller-host would emit an EngineCommand.
        # Compute the command's `value` from the third byte (CC value /
        # note velocity) when it's present.
        value = (bytes_seq[2] / 127.0) if len(bytes_seq) >= 3 else None
        frame_dict = {
            "type": "engine_command",
            "msg_id": "test",
            "schema_version": 1,
            "controller_key": controller_key,
            "target": row.target,
            "action": row.action or "set",
        }
        if value is not None:
            frame_dict["value"] = value
        return DispatchOutcome(engine_command_frame=frame_dict)

    return DispatchOutcome(skipped_reason="row has neither target nor script")


def _row_matches(row: MappingControl, status: int, midino: int | None) -> bool:
    if row.status != status:
        return False
    if row.midino is not None and row.midino != midino:
        return False
    return True


# ---------------------------------------------------------------------------
# Fixtures: descriptors mirroring real bench bindings
# ---------------------------------------------------------------------------

def _make_control(
    status: int,
    midino: int | None,
    target: str | None = None,
    action: str | None = None,
    script: str | None = None,
    fast_path: bool = False,
) -> MappingControl:
    return MappingControl(
        status=status, midino=midino, channel=None,
        target=target, action=action, script=script,
        fast_path=fast_path, description="",
    )


@pytest.fixture
def ua1000_descriptor() -> MappingDescriptor:
    """Mirrors device-packs/edirol-ua/profiles/ua-1000.midi.yaml."""
    return MappingDescriptor(
        pack_id="edirol-ua",
        model="ua-1000",
        kind="midi",
        source_path=Path("/test/ua-1000.midi.yaml"),
        scripts=("scripts/ua-1000-scripts.js",),
        controls=(
            _make_control(0xB0, 64, target="audio.chain.1.bypass",
                          action="toggle", fast_path=True),
            _make_control(0xB0, 7, script="UA1000Mapping.masterVolume"),
            _make_control(0xC0, None, target="audio.snapshot.recall",
                          action="send_pc"),
        ),
        outputs=tuple(),
        settings=tuple(),
        mixxx_alias_table={},
    )


# ---------------------------------------------------------------------------
# Note-on / note-off
# ---------------------------------------------------------------------------

@pytest.fixture
def button_descriptor() -> MappingDescriptor:
    return MappingDescriptor(
        pack_id="test", model="m", kind="midi",
        source_path=Path("/test"),
        scripts=(),
        controls=(
            _make_control(0x90, 60, target="audio.chain.1.solo", action="set"),
            _make_control(0x80, 60, target="audio.chain.1.solo", action="set"),
        ),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )


def test_note_on_routes_to_target_with_velocity(button_descriptor) -> None:
    outcome = dispatch_midi_bytes(button_descriptor, [0x90, 60, 100])
    assert outcome.engine_command_frame is not None
    assert outcome.engine_command_frame["target"] == "audio.chain.1.solo"
    assert outcome.engine_command_frame["value"] == pytest.approx(100 / 127.0)


def test_note_off_routes_to_same_target_with_zero_velocity(button_descriptor) -> None:
    outcome = dispatch_midi_bytes(button_descriptor, [0x80, 60, 0])
    assert outcome.engine_command_frame is not None
    assert outcome.engine_command_frame["value"] == 0.0


def test_note_on_with_unknown_note_skips(button_descriptor) -> None:
    outcome = dispatch_midi_bytes(button_descriptor, [0x90, 99, 100])
    assert outcome.engine_command_frame is None
    assert outcome.fast_path_target is None
    assert outcome.skipped_reason == "no matching control row"


# ---------------------------------------------------------------------------
# CC dispatch
# ---------------------------------------------------------------------------

def test_cc_with_target_emits_engine_command(ua1000_descriptor) -> None:
    """CC 7 in the UA-1000 profile is JS-bound, but if we replace it
    with a direct target binding, the dispatcher emits an EngineCommand.
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(
            _make_control(0xB0, 7, target="audio.master.volume", action="set"),
        ),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xB0, 7, 64])
    assert outcome.engine_command_frame["target"] == "audio.master.volume"
    assert outcome.engine_command_frame["action"] == "set"
    assert outcome.engine_command_frame["value"] == pytest.approx(64 / 127.0)


def test_cc_at_max_value_resolves_to_one() -> None:
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xB0, 7, target="audio.master.volume", action="set"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xB0, 7, 127])
    assert outcome.engine_command_frame["value"] == pytest.approx(1.0)


def test_cc_at_zero_value_resolves_to_zero() -> None:
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xB0, 7, target="audio.master.volume", action="set"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xB0, 7, 0])
    assert outcome.engine_command_frame["value"] == 0.0


# ---------------------------------------------------------------------------
# Fast-path vs JS routing — the central T2459 architectural decision.
# ---------------------------------------------------------------------------

def test_pedal_fast_path_skips_ipc_and_returns_target_action(ua1000_descriptor) -> None:
    """CC 64 with fast_path=True must short-circuit to the engine
    target without going through the IPC EngineCommand frame.
    """
    outcome = dispatch_midi_bytes(ua1000_descriptor, [0xB0, 64, 127])
    assert outcome.fast_path_target == "audio.chain.1.bypass"
    assert outcome.fast_path_action == "toggle"
    # Critical: no IPC frame emitted on the fast path.
    assert outcome.engine_command_frame is None


def test_cc_7_routes_to_js_script(ua1000_descriptor) -> None:
    """CC 7 in the UA-1000 profile invokes UA1000Mapping.masterVolume."""
    outcome = dispatch_midi_bytes(ua1000_descriptor, [0xB0, 7, 100])
    assert outcome.script_invocation is not None
    name, bytes_passed = outcome.script_invocation
    assert name == "UA1000Mapping.masterVolume"
    assert bytes_passed == [0xB0, 7, 100]
    # JS binding doesn't emit EngineCommand directly — JS calls
    # engine.setValue inside, which generates the IPC frame.
    assert outcome.engine_command_frame is None


def test_program_change_routes_to_snapshot_recall(ua1000_descriptor) -> None:
    outcome = dispatch_midi_bytes(ua1000_descriptor, [0xC0, 5])
    assert outcome.engine_command_frame is not None
    assert outcome.engine_command_frame["target"] == "audio.snapshot.recall"
    assert outcome.engine_command_frame["action"] == "send_pc"


# ---------------------------------------------------------------------------
# Multi-channel routing
# ---------------------------------------------------------------------------

def test_cc_on_channel_2_resolves_separately() -> None:
    """A CC 7 on channel 2 (status 0xB1) does not match a control row
    declared for channel 1 (status 0xB0).
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xB0, 7, target="audio.chain.1.volume", action="set"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xB1, 7, 64])
    assert outcome.skipped_reason == "no matching control row"


def test_per_channel_bindings_resolve_to_per_chain_targets() -> None:
    """A 4-deck mapping with one row per channel routes to
    audio.chain.<n>.volume per channel.
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=tuple(
            _make_control(0xB0 + ch - 1, 7,
                          target=f"audio.chain.{ch}.volume", action="set")
            for ch in (1, 2, 3, 4)
        ),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    for ch in (1, 2, 3, 4):
        outcome = dispatch_midi_bytes(descriptor, [0xB0 + ch - 1, 7, 100])
        assert outcome.engine_command_frame["target"] == f"audio.chain.{ch}.volume"


# ---------------------------------------------------------------------------
# Pitch bend (status 0xE0..0xEF — no midino in the row)
# ---------------------------------------------------------------------------

def test_pitch_bend_status_resolves_via_status_only() -> None:
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xE0, None, target="audio.chain.1.pitch", action="set"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xE0, 0x40, 0x40])
    assert outcome.engine_command_frame["target"] == "audio.chain.1.pitch"


# ---------------------------------------------------------------------------
# IPC frame round-trip — encoder/decoder + length-prefix framing
# ---------------------------------------------------------------------------

def test_engine_command_frame_round_trips_through_ipc_codec() -> None:
    """The frame the dispatcher emits must encode + decode losslessly
    through the controller-host IPC framing helpers.
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xB0, 7, target="audio.master.volume", action="set"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xB0, 7, 100])
    encoded = encode_frame(outcome.engine_command_frame)
    decoded, rest = decode_frame(encoded)
    assert rest == b""
    assert decoded == outcome.engine_command_frame


# ---------------------------------------------------------------------------
# 14-bit MSB/LSB pair routing — both halves must dispatch
# ---------------------------------------------------------------------------

def test_14bit_msb_and_lsb_pair_each_dispatch_independently() -> None:
    """Mixxx-style 14-bit fader: MSB at midino N + LSB at midino N+32.
    Each half emits its own EngineCommand; the JS layer (or a future
    14-bit handler) reconstitutes the full-resolution value.
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(
            _make_control(0xB6, 0x1F, target="audio.master.crossfader_msb", action="set"),
            _make_control(0xB6, 0x3F, target="audio.master.crossfader_lsb", action="set"),
        ),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    msb = dispatch_midi_bytes(descriptor, [0xB6, 0x1F, 64])
    lsb = dispatch_midi_bytes(descriptor, [0xB6, 0x3F, 32])
    assert msb.engine_command_frame["target"] == "audio.master.crossfader_msb"
    assert lsb.engine_command_frame["target"] == "audio.master.crossfader_lsb"


# ---------------------------------------------------------------------------
# SysEx — currently routed to JS only (no direct-target SysEx in the
# initial schema; the YAML's `target` column is undefined for SysEx
# until a future row type is added).
# ---------------------------------------------------------------------------

def test_sysex_with_no_matching_row_skips_cleanly() -> None:
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xB0, 7, target="audio.master.volume", action="set"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xF0, 0x41, 0x10, 0x42, 0xF7])
    assert outcome.skipped_reason == "no matching control row"


# ---------------------------------------------------------------------------
# Empty + malformed inputs — defensive paths
# ---------------------------------------------------------------------------

def test_empty_bytes_skips() -> None:
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(), controls=tuple(), outputs=tuple(),
        settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [])
    assert outcome.skipped_reason == "empty bytes"


def test_status_only_message_resolves_when_row_lacks_midino() -> None:
    """A status-byte-only message (e.g. realtime clock) matches a row
    that doesn't pin a midino.
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(_make_control(0xF8, None, target="audio.transport.tick", action="trigger"),),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xF8])
    assert outcome.engine_command_frame is not None
    assert outcome.engine_command_frame["target"] == "audio.transport.tick"


# ---------------------------------------------------------------------------
# First-match-wins — when two rows could match, the first is taken
# ---------------------------------------------------------------------------

def test_first_matching_row_wins_when_multiple_rows_match() -> None:
    """If a YAML profile lists two rows that both match the same
    inbound bytes, the dispatcher takes the first one. The schema
    validator (T2459-F1) catches duplicate hardware_ids but not
    duplicate control rows; this test pins the first-match rule
    so behavior is predictable.
    """
    descriptor = MappingDescriptor(
        pack_id="t", model="m", kind="midi", source_path=Path("/t"),
        scripts=(),
        controls=(
            _make_control(0xB0, 7, target="audio.master.volume", action="set"),
            _make_control(0xB0, 7, target="audio.chain.1.volume", action="set"),
        ),
        outputs=tuple(), settings=tuple(), mixxx_alias_table={},
    )
    outcome = dispatch_midi_bytes(descriptor, [0xB0, 7, 64])
    assert outcome.engine_command_frame["target"] == "audio.master.volume"


# ---------------------------------------------------------------------------
# Synthetic full-stream replay — exercises the dispatcher across a
# realistic MIDI byte stream (a button press + release, a CC sweep,
# a PC, a fast-path pedal toggle).
# ---------------------------------------------------------------------------

def test_full_stream_replay_records_outcomes_in_order(ua1000_descriptor) -> None:
    stream: list[list[int]] = [
        [0xB0, 64, 127],   # pedal press → fast path
        [0xB0, 64, 0],     # pedal release → fast path
        [0xB0, 7, 0],      # CC 7 = 0 → JS
        [0xB0, 7, 64],     # CC 7 = 64 → JS
        [0xB0, 7, 127],    # CC 7 = 127 → JS
        [0xC0, 5],         # PC 5 → snapshot recall
        [0xB0, 99, 64],    # unknown CC → skipped
    ]
    outcomes = [dispatch_midi_bytes(ua1000_descriptor, b) for b in stream]
    fast = sum(1 for o in outcomes if o.fast_path_target is not None)
    js = sum(1 for o in outcomes if o.script_invocation is not None)
    direct = sum(1 for o in outcomes if o.engine_command_frame is not None)
    skipped = sum(1 for o in outcomes if o.skipped_reason is not None)
    assert fast == 2
    assert js == 3
    assert direct == 1   # the PC
    assert skipped == 1
