"""Tests for app.services.controllers.mixxx_control_object_bridge.

T2459-B3.
"""

from __future__ import annotations

import pytest

from app.services.controllers.mixxx_control_object_bridge import (
    UNSUPPORTED_KEYS,
    WELL_KNOWN,
    BridgeResult,
    resolve,
)


# ---------------------------------------------------------------------------
# Well-known table coverage
# ---------------------------------------------------------------------------

def test_master_volume_resolves() -> None:
    result = resolve("[Master]", "volume")
    assert result.resolved
    assert result.target == "audio.master.volume"


def test_channel1_volume_resolves_to_chain_1() -> None:
    result = resolve("[Channel1]", "volume")
    assert result.resolved
    assert result.target == "audio.chain.1.volume"


def test_channel4_filterMidKill_resolves() -> None:
    result = resolve("[Channel4]", "filterMidKill")
    assert result.resolved
    assert result.target == "audio.chain.4.eq.mid_kill"


def test_hotcue_3_activate_resolves() -> None:
    result = resolve("[Channel2]", "hotcue_3_activate")
    assert result.resolved
    assert result.target == "audio.chain.2.hotcue.3.activate"


# ---------------------------------------------------------------------------
# Alias table override
# ---------------------------------------------------------------------------

def test_alias_table_overrides_well_known() -> None:
    alias = {"[Channel1]": "audio.chain.7"}
    result = resolve("[Channel1]", "volume", alias)
    assert result.resolved
    # Alias takes precedence over the well-known [Channel1]→audio.chain.1.
    assert result.target == "audio.chain.7.volume"


def test_alias_table_supports_arbitrary_target() -> None:
    alias = {"[Channel5]": "audio.chain.5"}
    result = resolve("[Channel5]", "play", alias)
    assert result.resolved
    assert result.target == "audio.chain.5.play"


# ---------------------------------------------------------------------------
# Fail-soft behavior
# ---------------------------------------------------------------------------

def test_unknown_group_key_fails_soft() -> None:
    result = resolve("[Unknown]", "mystery_key")
    assert not result.resolved
    assert result.target is None
    assert "Unknown Mixxx ControlObject" in (result.fail_soft_reason or "")


def test_explicitly_unsupported_key_fails_soft_with_specific_message() -> None:
    # Pick a key from UNSUPPORTED_KEYS to exercise that branch
    key = next(iter(UNSUPPORTED_KEYS))
    result = resolve("[Channel1]", key)
    # If the well-known table happens to have it, that's fine. If not,
    # the explicit-unsupported branch should fire.
    if (("[Channel1]", key) in WELL_KNOWN):
        assert result.resolved
    else:
        assert not result.resolved
        assert "explicitly unsupported" in (result.fail_soft_reason or "")


def test_sampler_group_fails_soft() -> None:
    result = resolve("[Sampler1]", "play")
    assert not result.resolved
    assert "not supported" in (result.fail_soft_reason or "").lower()


def test_quick_effect_rack_fails_soft() -> None:
    result = resolve("[QuickEffectRack1_[Channel1]]", "super1")
    assert not result.resolved


# ---------------------------------------------------------------------------
# Coverage smoke
# ---------------------------------------------------------------------------

def test_well_known_table_has_substantial_coverage() -> None:
    """The bridge should ship with enough well-known mappings to cover
    a typical Mixxx mapping. 100+ entries is the floor.
    """
    assert len(WELL_KNOWN) >= 100, (
        f"WELL_KNOWN has only {len(WELL_KNOWN)} entries; expected ≥100. "
        "Add more rows in mixxx_control_object_bridge.py."
    )


def test_bridge_result_dataclass_round_trip() -> None:
    r = BridgeResult(target="x")
    assert r.resolved
    r = BridgeResult(target=None, fail_soft_reason="oops")
    assert not r.resolved
    assert r.fail_soft_reason == "oops"
