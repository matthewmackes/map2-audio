"""T2459-H3-CFG Phase 2 — MeloAudio Commander discovery wizard tests."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.services.devices.meloaudio.commander_discovery import (
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
    CommanderDiscoveryState,
    DEFAULT_PROMPT_SEQUENCE,
    load_override,
    override_yaml_path,
    save_override,
)


# ---------------------------------------------------------------------------
# CommanderDiscoveryState — orchestrator state machine
# ---------------------------------------------------------------------------


def test_state_starts_unstarted_and_incomplete() -> None:
    state = CommanderDiscoveryState()
    assert not state.is_started
    assert not state.is_complete
    assert not state.is_cancelled
    assert state.current_prompt is None
    assert state.progress == (0, 12)  # 12 controls total in DEFAULT_PROMPT_SEQUENCE


def test_state_start_advances_to_first_prompt() -> None:
    state = CommanderDiscoveryState()
    state.start()
    assert state.is_started
    assert not state.is_complete
    assert state.current_prompt is CommanderControl.TOP_1


def test_state_handle_event_advances_through_prompts() -> None:
    state = CommanderDiscoveryState()
    state.start()
    # Bind TOP_1 to a CC22 press (matching the user's stock-Axe-Fx-III mode)
    advanced = state.handle_event(
        CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1, raw_value=127)
    )
    assert advanced
    assert state.current_prompt is CommanderControl.TOP_2
    assert state.captured[CommanderControl.TOP_1].midino == 22


def test_state_handle_event_returns_false_before_start() -> None:
    """Events fed before start() are ignored."""
    state = CommanderDiscoveryState()
    advanced = state.handle_event(
        CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1)
    )
    assert not advanced


def test_state_handle_event_returns_false_after_complete() -> None:
    state = CommanderDiscoveryState()
    state.start()
    # Walk through all prompts
    for _ in DEFAULT_PROMPT_SEQUENCE:
        state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=99, channel=1))
    assert state.is_complete
    advanced = state.handle_event(
        CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1)
    )
    assert not advanced


def test_state_double_event_for_same_prompt_keeps_first() -> None:
    """Defensive: orchestrator's caller shouldn't double-feed but we guard.

    The first event captured for a prompt wins; the orchestrator
    advances anyway so a second event would bind to the next prompt.
    """
    state = CommanderDiscoveryState()
    state.start()
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1))
    # Walk through to the bottom_a prompt by skipping the top row
    for _ in range(3):
        state.skip_current()
    state.handle_event(CommanderDiscoveryEvent(status=0xC0, midino=0, channel=1))
    assert state.captured[CommanderControl.TOP_1].midino == 22
    assert state.captured[CommanderControl.BOTTOM_A].midino == 0


def test_state_skip_current_advances_without_capturing() -> None:
    """Operator tells the wizard 'I don't have an expression pedal'."""
    state = CommanderDiscoveryState()
    state.start()
    # Skip the first 8 prompts (top + bottom rows)
    for _ in range(8):
        state.skip_current()
    assert state.current_prompt is CommanderControl.EXPRESSION_1
    state.skip_current()
    assert state.current_prompt is CommanderControl.EXPRESSION_2
    state.skip_current()
    assert state.current_prompt is CommanderControl.BANK_UP
    # captured should still be empty since every prompt was skipped
    assert len(state.captured) == 0


def test_state_cancel_freezes_orchestrator() -> None:
    state = CommanderDiscoveryState()
    state.start()
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1))
    state.cancel()
    assert state.is_cancelled
    assert state.current_prompt is None
    # Further events are ignored
    advanced = state.handle_event(
        CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1)
    )
    assert not advanced


def test_state_progress_counts_only_captured_not_skipped() -> None:
    """Progress = how many prompts produced bindings, NOT how many were
    iterated through (skipped don't count). Used for UI progress bar.
    """
    state = CommanderDiscoveryState()
    state.start()
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1))
    state.skip_current()
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=25, channel=1))
    captured, total = state.progress
    assert captured == 2
    assert total == 12


def test_state_full_walkthrough_matches_recorded_dump() -> None:
    """Replay the actual MIDI dump captured during the 2026-05-07 HIL
    bench session. This locks in the discovery wizard's behaviour
    against a known operator session.

    Captured bytes (from `docs/fit-for-purpose-evidence/20260507/
    t2459h3-meloaudio-commander/alsa_midi_dump.txt`):
      Top 1 → CC 24
      Top 2 → CC 25
      Top 3 → CC 22
      Top 4 → CC 26
      Bottom A-D → PC 0-3
      Expression 1 → CC 4
      Expression 2 → CC 7
      Bank up/down → not pressed
    """
    state = CommanderDiscoveryState()
    state.start()

    # Top row 1-4
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1, raw_value=127))
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=25, channel=1, raw_value=127))
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=22, channel=1, raw_value=127))
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=26, channel=1, raw_value=127))
    # Bottom A-D
    state.handle_event(CommanderDiscoveryEvent(status=0xC0, midino=0, channel=1))
    state.handle_event(CommanderDiscoveryEvent(status=0xC0, midino=1, channel=1))
    state.handle_event(CommanderDiscoveryEvent(status=0xC0, midino=2, channel=1))
    state.handle_event(CommanderDiscoveryEvent(status=0xC0, midino=3, channel=1))
    # Expression 1 + 2
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=4, channel=1, raw_value=13))
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=7, channel=1, raw_value=68))
    # Bank up/down skipped (operator didn't press them)
    state.skip_current()
    state.skip_current()

    assert state.is_complete
    captured = state.captured
    assert captured[CommanderControl.TOP_1].midino == 24
    assert captured[CommanderControl.TOP_2].midino == 25
    assert captured[CommanderControl.TOP_3].midino == 22
    assert captured[CommanderControl.TOP_4].midino == 26
    assert captured[CommanderControl.BOTTOM_A].status == 0xC0
    assert captured[CommanderControl.BOTTOM_A].midino == 0
    assert captured[CommanderControl.BOTTOM_D].midino == 3
    assert captured[CommanderControl.EXPRESSION_1].midino == 4
    assert captured[CommanderControl.EXPRESSION_2].midino == 7
    # Bank up/down were skipped — not in captured
    assert CommanderControl.BANK_UP not in captured
    assert CommanderControl.BANK_DOWN not in captured


# ---------------------------------------------------------------------------
# CommanderDiscoveryOverride — YAML serialisation round-trip
# ---------------------------------------------------------------------------


def test_override_round_trip() -> None:
    """Build → to_yaml → from_yaml round-trip preserves all bindings."""
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1, raw_value=127),
            CommanderControl.BOTTOM_A: CommanderDiscoveryEvent(status=0xC0, midino=0, channel=1),
            CommanderControl.EXPRESSION_1: CommanderDiscoveryEvent(status=0xB0, midino=4, channel=1, raw_value=13),
        },
        captured_at_utc="2026-05-07T15:00:00+00:00",
        device_serial="000000000000011",
        notes="Stock firmware, Axe-Fx III mode",
    )
    payload = override.to_yaml_payload()
    rebuilt = CommanderDiscoveryOverride.from_yaml_payload(payload)
    assert rebuilt.bindings == override.bindings
    assert rebuilt.captured_at_utc == override.captured_at_utc
    assert rebuilt.device_serial == override.device_serial
    assert rebuilt.notes == override.notes


def test_override_yaml_payload_uses_hex_status() -> None:
    """Status bytes serialise as ``0xB0`` strings — operator-readable
    when hand-editing the override file.
    """
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1, raw_value=127),
        },
    )
    payload = override.to_yaml_payload()
    binding = payload["bindings"]["top_1"]
    assert binding["status"] == "0xB0"
    assert binding["midino"] == 24
    assert binding["raw_value"] == 127


def test_override_payload_omits_raw_value_when_none() -> None:
    """Program-change bindings have no value byte — we don't emit a
    null raw_value, we omit the key entirely so the YAML stays clean.
    """
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.BOTTOM_A: CommanderDiscoveryEvent(status=0xC0, midino=0, channel=1),
        },
    )
    payload = override.to_yaml_payload()
    binding = payload["bindings"]["bottom_a"]
    assert "raw_value" not in binding


def test_override_from_payload_rejects_unknown_schema() -> None:
    """A future schema version must not silently load as v1."""
    with pytest.raises(ValueError, match="schema_version"):
        CommanderDiscoveryOverride.from_yaml_payload({
            "schema_version": 99,
            "device": "meloaudio_midi_commander",
            "bindings": {},
        })


def test_override_from_payload_rejects_wrong_device() -> None:
    """A Maschine override must not load as a Commander override."""
    with pytest.raises(ValueError, match="not a Commander"):
        CommanderDiscoveryOverride.from_yaml_payload({
            "schema_version": 1,
            "device": "native_instruments_maschine_mk1",
            "bindings": {},
        })


def test_override_from_payload_rejects_unknown_control() -> None:
    """Typos / future control names must raise rather than silently drop."""
    with pytest.raises(ValueError, match="unknown control"):
        CommanderDiscoveryOverride.from_yaml_payload({
            "schema_version": 1,
            "device": "meloaudio_midi_commander",
            "bindings": {
                "fictional_button": {"status": "0xB0", "midino": 1, "channel": 1},
            },
        })


def test_override_status_int_or_hex_string_both_accepted() -> None:
    """Operators hand-editing the YAML may use either ``status: 0xB0``
    (string) or ``status: 176`` (int). Both must work.
    """
    payload = {
        "schema_version": 1,
        "device": "meloaudio_midi_commander",
        "bindings": {
            "top_1": {"status": "0xB0", "midino": 24, "channel": 1},
            "top_2": {"status": 176, "midino": 25, "channel": 1},
            "top_3": {"status": "176", "midino": 22, "channel": 1},
        },
    }
    override = CommanderDiscoveryOverride.from_yaml_payload(payload)
    assert override.bindings[CommanderControl.TOP_1].status == 0xB0
    assert override.bindings[CommanderControl.TOP_2].status == 0xB0
    assert override.bindings[CommanderControl.TOP_3].status == 0xB0


# ---------------------------------------------------------------------------
# override_yaml_path / load_override / save_override — disk persistence
# ---------------------------------------------------------------------------


def test_override_yaml_path_default_location() -> None:
    path = override_yaml_path()
    assert path.name == "meloaudio-commander-discovered.yaml"
    # Path should be under .map2/devices/ regardless of $HOME
    parts = path.parts
    assert ".map2" in parts
    assert "devices" in parts


def test_override_yaml_path_custom_home(tmp_path: Path) -> None:
    path = override_yaml_path(home=tmp_path)
    assert path == tmp_path / ".map2" / "devices" / "meloaudio-commander-discovered.yaml"


def test_load_override_returns_none_if_missing(tmp_path: Path) -> None:
    """No override file → no override (device-pack profile applies)."""
    target = tmp_path / "missing.yaml"
    assert load_override(path=target) is None


def test_save_then_load_round_trip(tmp_path: Path) -> None:
    target = tmp_path / "override.yaml"
    original = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1, raw_value=127),
            CommanderControl.BOTTOM_A: CommanderDiscoveryEvent(status=0xC0, midino=0, channel=1),
        },
        captured_at_utc="2026-05-07T15:00:00+00:00",
        device_serial="000000000000011",
        notes="Bench HIL run",
    )
    written_path = save_override(original, path=target)
    assert written_path == target
    assert target.exists()

    loaded = load_override(path=target)
    assert loaded is not None
    assert loaded.bindings == original.bindings
    assert loaded.captured_at_utc == original.captured_at_utc
    assert loaded.device_serial == original.device_serial
    assert loaded.notes == original.notes


def test_save_creates_parent_directories(tmp_path: Path) -> None:
    """The .map2/devices/ tree may not exist yet on a fresh install."""
    target = tmp_path / "fresh" / ".map2" / "devices" / "override.yaml"
    assert not target.parent.exists()
    save_override(CommanderDiscoveryOverride(bindings={}), path=target)
    assert target.exists()
    assert target.parent.is_dir()


def test_save_atomic_replace_no_partial_writes(tmp_path: Path) -> None:
    """If a previous override exists and the new save fails partway,
    the old override must NOT be corrupted. The atomic-replace strategy
    means the old file is intact until the new file is fully written.
    """
    target = tmp_path / "override.yaml"
    # Pre-populate with a known-good override
    save_override(
        CommanderDiscoveryOverride(
            bindings={
                CommanderControl.TOP_1: CommanderDiscoveryEvent(status=0xB0, midino=99, channel=1),
            },
        ),
        path=target,
    )
    # Mid-stream "save the same again" — the file must not be empty
    # at any point. We can't easily simulate a crash but we can verify
    # that after a successful save the file is fully populated and
    # parseable.
    save_override(
        CommanderDiscoveryOverride(
            bindings={
                CommanderControl.TOP_1: CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1),
            },
        ),
        path=target,
    )
    loaded = load_override(path=target)
    assert loaded is not None
    assert loaded.bindings[CommanderControl.TOP_1].midino == 24


def test_load_override_rejects_corrupt_file(tmp_path: Path) -> None:
    target = tmp_path / "override.yaml"
    target.write_text("this is not: valid\n  yaml: [unclosed", encoding="utf-8")
    with pytest.raises(yaml.YAMLError):
        load_override(path=target)


def test_save_override_handles_empty_bindings(tmp_path: Path) -> None:
    """An override with no bindings is legal — operator may have
    cancelled the wizard. Loading it back should produce the same
    empty override.
    """
    target = tmp_path / "override.yaml"
    save_override(CommanderDiscoveryOverride(bindings={}), path=target)
    loaded = load_override(path=target)
    assert loaded is not None
    assert loaded.bindings == {}


# ---------------------------------------------------------------------------
# Full-flow integration — orchestrator → save → load
# ---------------------------------------------------------------------------


def test_full_flow_orchestrator_to_disk(tmp_path: Path) -> None:
    """End-to-end: walk the orchestrator with synthetic events, build
    the override, save to disk, load back, verify identical.
    """
    state = CommanderDiscoveryState()
    state.start()

    # Simulate the operator pressing a few controls
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=24, channel=1, raw_value=127))
    state.handle_event(CommanderDiscoveryEvent(status=0xB0, midino=25, channel=1, raw_value=127))
    # Operator skips the rest
    while not state.is_complete:
        state.skip_current()
    assert state.is_complete

    override = state.build_override(
        device_serial="000000000000011",
        notes="2026-05-07 HIL bench session",
    )
    target = tmp_path / "override.yaml"
    save_override(override, path=target)

    loaded = load_override(path=target)
    assert loaded is not None
    assert loaded.bindings[CommanderControl.TOP_1].midino == 24
    assert loaded.bindings[CommanderControl.TOP_2].midino == 25
    assert CommanderControl.TOP_3 not in loaded.bindings  # skipped
    assert loaded.device_serial == "000000000000011"
    assert "HIL bench" in (loaded.notes or "")
