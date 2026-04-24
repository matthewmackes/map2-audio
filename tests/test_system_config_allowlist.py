"""T2431-G: system_config allowlist freeze.

Locks the set of permitted ``system_config`` keys so new generic-bucket
usage fails at call time. The allowlist shrinks over time as each listed
domain moves to a typed store; new entries may never be added.
"""
from __future__ import annotations

import pytest

from app.database import (
    SystemConfigFrozenError,
    _SYSTEM_CONFIG_ALLOWLIST_EXACT,
    _SYSTEM_CONFIG_ALLOWLIST_PREFIXES,
    _assert_system_config_key_allowed,
)


ALLOWED_EXACT: set[str] = set()  # T2436-A emptied the exact allowlist.
ALLOWED_PREFIXES = ("touchscreen_", "chain_preset_")


def test_allowlist_constants_match_expected_domains() -> None:
    """Guard the allowlist contents so nobody quietly adds a new key."""
    assert _SYSTEM_CONFIG_ALLOWLIST_EXACT == frozenset(ALLOWED_EXACT)
    assert _SYSTEM_CONFIG_ALLOWLIST_PREFIXES == ALLOWED_PREFIXES


def test_exact_allowlist_is_empty_after_T2436_A() -> None:
    """The exact-match allowlist must shrink toward zero; T2436-A removed
    `state_authority.activation_hooks`, the last exact entry."""
    assert _SYSTEM_CONFIG_ALLOWLIST_EXACT == frozenset()


@pytest.mark.parametrize("key", [
    "touchscreen_1",
    "touchscreen_42",
    "chain_preset_Lead_Drive",
    "chain_preset_bright-solo",
])
def test_allowed_prefix_keys_pass(key: str) -> None:
    _assert_system_config_key_allowed(key)


@pytest.mark.parametrize("key", [
    "arbitrary_operator_key",
    "new.feature.flag",
    "system.everything",
    "backup_location",
    "legacy_key",
    # T2436-A: moved to schema; no longer permitted through the generic bucket.
    "state_authority.activation_hooks",
])
def test_disallowed_keys_raise_frozen_error(key: str) -> None:
    with pytest.raises(SystemConfigFrozenError) as excinfo:
        _assert_system_config_key_allowed(key)
    assert "T2431-G allowlist" in str(excinfo.value)
    assert "typed domain store" in str(excinfo.value)


def test_similar_prefixes_are_rejected() -> None:
    # Guard against wildcard creep — only exact prefixes.
    with pytest.raises(SystemConfigFrozenError):
        _assert_system_config_key_allowed("touchscreen")  # no trailing _
    with pytest.raises(SystemConfigFrozenError):
        _assert_system_config_key_allowed("chain_preset")
    with pytest.raises(SystemConfigFrozenError):
        _assert_system_config_key_allowed("state_authority.other_hook")


def test_command_queue_update_config_handler_was_removed() -> None:
    """T2431-G deleted the generic UPDATE_CONFIG command. Verify it cannot
    be invoked via the public CommandType enum."""
    from app.services.command_queue import CommandType

    assert not hasattr(CommandType, "UPDATE_CONFIG")
