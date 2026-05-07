"""T2459-H3-CFG Phase 6 — Profile-resolver tests.

Cover the three resolution rules:
  1. Override wins for any control the override binds.
  2. Device-pack defaults fill in unbound controls.
  3. Reverse-lookup find_binding works for both override and default paths.
"""

from __future__ import annotations

import pytest

from app.services.devices.meloaudio import (
    CC_STATUS_BYTE,
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
    DEFAULT_MIDI_CHANNEL,
    EffectiveCommanderProfile,
    PC_STATUS_BYTE,
    ResolvedBinding,
    resolve_commander_profile,
)
from app.services.midi_commander_surface.protocol import (
    BANK_DOWN_CC,
    BANK_UP_CC,
    BUTTON_CC_BY_ID,
    BUTTON_PC_BY_ID,
    EXPRESSION_CC_BY_ID,
)


# ---------------------------------------------------------------------------
# Pure device-pack path (no override at all)
# ---------------------------------------------------------------------------


def test_resolve_with_no_override_returns_device_pack_defaults() -> None:
    profile = resolve_commander_profile(override=None)
    assert profile.has_override is False
    # All 12 controls bound from defaults.
    assert len(profile.bindings) == 12
    top_1 = profile.bindings[CommanderControl.TOP_1]
    assert top_1.status == CC_STATUS_BYTE
    assert top_1.midino == BUTTON_CC_BY_ID["1"]
    assert top_1.channel == DEFAULT_MIDI_CHANNEL
    assert top_1.source == "device_pack"

    bottom_a = profile.bindings[CommanderControl.BOTTOM_A]
    assert bottom_a.status == PC_STATUS_BYTE
    assert bottom_a.midino == BUTTON_PC_BY_ID["A"]
    assert bottom_a.source == "device_pack"

    bank_up = profile.bindings[CommanderControl.BANK_UP]
    assert bank_up.midino == BANK_UP_CC
    bank_down = profile.bindings[CommanderControl.BANK_DOWN]
    assert bank_down.midino == BANK_DOWN_CC


def test_resolve_with_empty_override_still_uses_defaults() -> None:
    """An override file with no bindings is a no-op — same as None."""
    override = CommanderDiscoveryOverride(bindings={})
    profile = resolve_commander_profile(override=override)
    assert profile.has_override is False
    assert len(profile.bindings) == 12


# ---------------------------------------------------------------------------
# Override-wins path
# ---------------------------------------------------------------------------


def test_override_wins_for_bound_control() -> None:
    """The override binding overrides the device-pack default for the
    same control. Other controls keep their defaults."""
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(
                status=0xB0,
                midino=24,  # operator's mode emits CC 24 instead of CC 80
                channel=1,
                raw_value=127,
            ),
        }
    )
    profile = resolve_commander_profile(override=override)
    assert profile.has_override is True

    top_1 = profile.bindings[CommanderControl.TOP_1]
    assert top_1.midino == 24
    assert top_1.source == "override"
    # Adjacent unbound controls fall through to device-pack defaults.
    top_2 = profile.bindings[CommanderControl.TOP_2]
    assert top_2.midino == BUTTON_CC_BY_ID["2"]
    assert top_2.source == "device_pack"


def test_override_can_change_status_byte() -> None:
    """Override on a CC button can re-route to PC, etc. The resolver is
    agnostic — whatever the operator's firmware mode emits, that's what
    gets recorded and used."""
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(
                status=0xC0,  # mode emits PC where the device-pack expects CC
                midino=10,
                channel=1,
            ),
        }
    )
    profile = resolve_commander_profile(override=override)
    top_1 = profile.bindings[CommanderControl.TOP_1]
    assert top_1.status == 0xC0
    assert top_1.midino == 10


def test_override_can_change_channel() -> None:
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.EXPRESSION_1: CommanderDiscoveryEvent(
                status=0xB0,
                midino=11,
                channel=10,  # operator put exp pedal on ch 10
            ),
        }
    )
    profile = resolve_commander_profile(override=override)
    exp_1 = profile.bindings[CommanderControl.EXPRESSION_1]
    assert exp_1.channel == 10


def test_override_covers_every_control() -> None:
    """The full-override case (operator ran the wizard for all 12
    controls) replaces every default."""
    override = CommanderDiscoveryOverride(
        bindings={
            ctrl: CommanderDiscoveryEvent(
                status=0xB0, midino=20 + idx, channel=1
            )
            for idx, ctrl in enumerate(CommanderControl)
        }
    )
    profile = resolve_commander_profile(override=override)
    assert profile.has_override is True
    assert len(profile.bindings) == 12
    for binding in profile.bindings.values():
        assert binding.source == "override"


# ---------------------------------------------------------------------------
# Reverse lookup — find_binding
# ---------------------------------------------------------------------------


def test_find_binding_resolves_default_top_1() -> None:
    profile = resolve_commander_profile(override=None)
    binding = profile.find_binding(
        status_byte=CC_STATUS_BYTE,
        data1=BUTTON_CC_BY_ID["1"],
        channel=DEFAULT_MIDI_CHANNEL,
    )
    assert binding is not None
    assert binding.control == CommanderControl.TOP_1


def test_find_binding_resolves_overridden_top_1() -> None:
    override = CommanderDiscoveryOverride(
        bindings={
            CommanderControl.TOP_1: CommanderDiscoveryEvent(
                status=0xB0, midino=24, channel=1
            ),
        }
    )
    profile = resolve_commander_profile(override=override)
    # The default CC 80 no longer matches anything.
    assert (
        profile.find_binding(
            status_byte=CC_STATUS_BYTE,
            data1=BUTTON_CC_BY_ID["1"],
            channel=1,
        )
        is None
    )
    # CC 24 now resolves to TOP_1.
    binding = profile.find_binding(
        status_byte=CC_STATUS_BYTE, data1=24, channel=1,
    )
    assert binding is not None
    assert binding.control == CommanderControl.TOP_1


def test_find_binding_returns_none_for_unknown_message() -> None:
    profile = resolve_commander_profile(override=None)
    # CC 121 is not bound.
    assert (
        profile.find_binding(
            status_byte=CC_STATUS_BYTE, data1=121, channel=1,
        )
        is None
    )


def test_find_binding_respects_channel() -> None:
    """A message on the wrong channel does not match — even if status +
    data1 line up. (Operators on multi-receiver setups care about this.)"""
    profile = resolve_commander_profile(override=None)
    # default channel is 1; ch 2 message must not match.
    assert (
        profile.find_binding(
            status_byte=CC_STATUS_BYTE,
            data1=BUTTON_CC_BY_ID["1"],
            channel=2,
        )
        is None
    )


def test_pc_default_resolves_to_bottom_row() -> None:
    """Bottom A-D are program-change events — exercised separately
    because PC has only one data byte and a different status nibble."""
    profile = resolve_commander_profile(override=None)
    binding = profile.find_binding(
        status_byte=PC_STATUS_BYTE,
        data1=BUTTON_PC_BY_ID["A"],
        channel=1,
    )
    assert binding is not None
    assert binding.control == CommanderControl.BOTTOM_A


def test_expression_default_resolves() -> None:
    profile = resolve_commander_profile(override=None)
    binding = profile.find_binding(
        status_byte=CC_STATUS_BYTE,
        data1=EXPRESSION_CC_BY_ID["EXP1"],
        channel=1,
    )
    assert binding is not None
    assert binding.control == CommanderControl.EXPRESSION_1


def test_resolved_binding_matches_method() -> None:
    """ResolvedBinding.matches is the cheap inline path the runtime
    callback can use without going through find_binding's iteration."""
    binding = ResolvedBinding(
        control=CommanderControl.TOP_1,
        status=0xB0,
        midino=80,
        channel=1,
        source="device_pack",
    )
    assert binding.matches(0xB0, 80, 1) is True
    assert binding.matches(0xB0, 81, 1) is False
    assert binding.matches(0xC0, 80, 1) is False
    assert binding.matches(0xB0, 80, 2) is False
