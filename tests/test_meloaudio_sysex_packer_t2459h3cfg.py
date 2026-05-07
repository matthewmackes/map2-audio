"""T2459-H3-CFG Phase 3 — SysEx packer tests.

Slice 1 covers Global_Settings + Bank_Naming. Slice 2 will add
Button_Settings.
"""

from __future__ import annotations

import pytest

from app.services.devices.meloaudio.sysex_packer import (
    BANK_LARGE_NAME_LEN,
    BANK_SMALL_INFO_LEN,
    BankNaming,
    GLOBAL_SETTINGS_CHANNEL_OFFSET,
    GLOBAL_SETTINGS_CONFIG_NAME_LEN,
    GLOBAL_SETTINGS_REALTIME_PASS_OFFSET,
    GLOBAL_SETTINGS_REGION_SIZE,
    GlobalSettings,
    _ascii_fixed,
    pack_bank_strings,
    pack_global_settings,
)


# ---------------------------------------------------------------------------
# _ascii_fixed — ASCII pad/truncate primitive
# ---------------------------------------------------------------------------


def test_ascii_fixed_pads_short_string_with_spaces() -> None:
    assert _ascii_fixed("ABC", 8) == b"ABC     "


def test_ascii_fixed_truncates_long_string() -> None:
    assert _ascii_fixed("ABCDEFGHIJ", 4) == b"ABCD"


def test_ascii_fixed_handles_none() -> None:
    """None → empty string → all spaces. Operators may leave bank info
    empty in the YAML; that should encode as 'no label' not crash.
    """
    assert _ascii_fixed(None, 4) == b"    "


def test_ascii_fixed_handles_empty_string() -> None:
    assert _ascii_fixed("", 8) == b"        "


def test_ascii_fixed_replaces_non_ascii_chars() -> None:
    """Non-ASCII characters get ``?`` rather than raising. Operators
    might type 'Café' as a bank label; we don't want that to brick
    the flash.
    """
    out = _ascii_fixed("Café", 4)
    assert len(out) == 4
    assert b"?" in out


def test_ascii_fixed_exact_length_no_padding() -> None:
    """Exact length → no padding, no truncation."""
    assert _ascii_fixed("EXACTLY8", 8) == b"EXACTLY8"


# ---------------------------------------------------------------------------
# GlobalSettings dataclass — validation
# ---------------------------------------------------------------------------


def test_global_settings_accepts_valid_input() -> None:
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="MAP2")
    assert settings.midi_channel == 1
    assert settings.realtime_passthrough is False
    assert settings.config_name == "MAP2"


def test_global_settings_rejects_channel_out_of_range() -> None:
    with pytest.raises(ValueError, match="midi_channel must be 1-16"):
        GlobalSettings(midi_channel=0, realtime_passthrough=False, config_name="X")
    with pytest.raises(ValueError, match="midi_channel must be 1-16"):
        GlobalSettings(midi_channel=17, realtime_passthrough=False, config_name="X")


def test_global_settings_rejects_non_int_channel() -> None:
    with pytest.raises(TypeError):
        GlobalSettings(midi_channel="1", realtime_passthrough=False, config_name="X")  # type: ignore[arg-type]


def test_global_settings_rejects_non_str_config_name() -> None:
    with pytest.raises(TypeError):
        GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name=123)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# pack_global_settings — wire-format
# ---------------------------------------------------------------------------


def test_pack_global_settings_total_length() -> None:
    """Region + name = 16 + 16 = 32 bytes total."""
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="MAP2 Canonical")
    out = pack_global_settings(settings)
    assert len(out) == GLOBAL_SETTINGS_REGION_SIZE + GLOBAL_SETTINGS_CONFIG_NAME_LEN
    assert len(out) == 32


def test_pack_global_settings_channel_zero_indexed_on_wire() -> None:
    """Operator says channel 1 → wire byte is 0x00 (firmware uses 0-15)."""
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X")
    out = pack_global_settings(settings)
    assert out[GLOBAL_SETTINGS_CHANNEL_OFFSET] == 0x00


def test_pack_global_settings_channel_16_wraps_to_0x0F() -> None:
    settings = GlobalSettings(midi_channel=16, realtime_passthrough=False, config_name="X")
    out = pack_global_settings(settings)
    assert out[GLOBAL_SETTINGS_CHANNEL_OFFSET] == 0x0F


def test_pack_global_settings_realtime_pass_flag_off() -> None:
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X")
    out = pack_global_settings(settings)
    assert out[GLOBAL_SETTINGS_REALTIME_PASS_OFFSET] == 0


def test_pack_global_settings_realtime_pass_flag_on() -> None:
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=True, config_name="X")
    out = pack_global_settings(settings)
    assert out[GLOBAL_SETTINGS_REALTIME_PASS_OFFSET] == 1


def test_pack_global_settings_reserved_bytes_are_zero() -> None:
    """Bytes 2-15 of the region are reserved; firmware expects 0x00 fill."""
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=True, config_name="X")
    out = pack_global_settings(settings)
    for i in range(2, 16):
        assert out[i] == 0x00, f"reserved byte {i} not zero"


def test_pack_global_settings_config_name_padded_to_16() -> None:
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="MAP2")
    out = pack_global_settings(settings)
    name_bytes = out[GLOBAL_SETTINGS_REGION_SIZE:]
    assert name_bytes == b"MAP2            "  # 4 chars + 12 spaces


def test_pack_global_settings_config_name_truncated_to_16() -> None:
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="A" * 30)
    out = pack_global_settings(settings)
    name_bytes = out[GLOBAL_SETTINGS_REGION_SIZE:]
    assert name_bytes == b"A" * 16


def test_pack_global_settings_returns_bytes_not_bytearray() -> None:
    """Return type is immutable bytes, not mutable bytearray, so caller
    can't accidentally mutate the encoded image after the fact.
    """
    settings = GlobalSettings(midi_channel=1, realtime_passthrough=False, config_name="X")
    out = pack_global_settings(settings)
    assert isinstance(out, bytes)


# ---------------------------------------------------------------------------
# BankNaming dataclass — validation + defaults
# ---------------------------------------------------------------------------


def test_bank_naming_defaults_to_empty_strings() -> None:
    bank = BankNaming(bank_number=0)
    assert bank.large_name == ""
    assert bank.small_info == ""


def test_bank_naming_rejects_non_int_bank_number() -> None:
    with pytest.raises(TypeError):
        BankNaming(bank_number="0")  # type: ignore[arg-type]


def test_bank_naming_rejects_negative_bank_number() -> None:
    with pytest.raises(ValueError):
        BankNaming(bank_number=-1)


# ---------------------------------------------------------------------------
# pack_bank_strings — table layout
# ---------------------------------------------------------------------------


def test_pack_bank_strings_each_bank_is_12_bytes() -> None:
    banks = [BankNaming(bank_number=0, large_name="MAIN", small_info="Default")]
    out = pack_bank_strings(banks)
    assert len(out) == BANK_LARGE_NAME_LEN + BANK_SMALL_INFO_LEN
    assert len(out) == 12


def test_pack_bank_strings_layout_is_large_then_small() -> None:
    banks = [BankNaming(bank_number=0, large_name="ABCD", small_info="EFGHIJKL")]
    out = pack_bank_strings(banks)
    assert out[:4] == b"ABCD"
    assert out[4:12] == b"EFGHIJKL"


def test_pack_bank_strings_pads_short_names_with_spaces() -> None:
    banks = [BankNaming(bank_number=0, large_name="A", small_info="B")]
    out = pack_bank_strings(banks)
    assert out[:4] == b"A   "
    assert out[4:12] == b"B       "


def test_pack_bank_strings_truncates_long_names() -> None:
    banks = [BankNaming(bank_number=0, large_name="TOOLONG", small_info="EXCEEDSEIGHT")]
    out = pack_bank_strings(banks)
    assert out[:4] == b"TOOL"
    assert out[4:12] == b"EXCEEDSE"


def test_pack_bank_strings_concatenates_in_order() -> None:
    banks = [
        BankNaming(bank_number=0, large_name="ONE", small_info="First"),
        BankNaming(bank_number=1, large_name="TWO", small_info="Second"),
    ]
    out = pack_bank_strings(banks)
    assert len(out) == 24
    assert out[:4] == b"ONE "
    assert out[4:12] == b"First   "
    assert out[12:16] == b"TWO "
    assert out[16:24] == b"Second  "


def test_pack_bank_strings_handles_empty_list() -> None:
    """Edge case: caller may pass empty banks list during a draft
    config; encoder must produce empty output, not crash.
    """
    assert pack_bank_strings([]) == b""


def test_pack_bank_strings_handles_full_8_bank_table() -> None:
    """8 banks × 12 bytes = 96 bytes. The firmware's bank table is
    sized for 8 banks max.
    """
    banks = [
        BankNaming(bank_number=i, large_name=f"B{i}", small_info=f"Info{i}")
        for i in range(8)
    ]
    out = pack_bank_strings(banks)
    assert len(out) == 96
    # Sanity: the first bank's large name should be at offset 0
    assert out[:4] == b"B0  "


def test_pack_bank_strings_ignores_bank_number_for_layout() -> None:
    """The encoder emits banks in list order, NOT sorted by bank_number.
    Caller is responsible for sort order. (We could add a sort here but
    the upstream doesn't, and operators may want non-monotonic orders
    for some configurations.)
    """
    banks = [
        BankNaming(bank_number=5, large_name="FIVE", small_info="Five"),
        BankNaming(bank_number=0, large_name="ZERO", small_info="Zero"),
    ]
    out = pack_bank_strings(banks)
    # FIVE first because it's first in the list
    assert out[:4] == b"FIVE"
    assert out[12:16] == b"ZERO"
