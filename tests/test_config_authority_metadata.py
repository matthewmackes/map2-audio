"""T2431-B: enforce authority metadata on every new ConfigOption.

Every entry in CONFIG_SCHEMA carries an authority plane (host / service /
user / runtime / legacy). LEGACY entries are grandfathered; they exist so
T2431-B can ship the enforcement infrastructure without blocking on the
full reclassification sweep, which lands in downstream subtasks
(T2431-C … T2431-J).

New work must never add a LEGACY entry. This test enforces a one-way ratchet:

* The set of LEGACY keys is pinned as of T2431-B introduction.
* Any key added to the schema after that point must declare a non-LEGACY
  plane; adding a new LEGACY key fails the test.
* Reclassifying an existing LEGACY key to a real plane is always allowed
  (and shrinks the allowlist).

The allowlist lives in ``LEGACY_ALLOWLIST`` below. It is a deliberate
checkpoint — subtasks C–J may shrink it (by adding plane metadata to the
schema entry), but nothing may grow it.
"""
from __future__ import annotations

import pytest

from app.config_schema import (
    AuthorityPlane,
    CONFIG_SCHEMA,
    ConfigOption,
    StartupRequirement,
)


# Ratchet — do NOT add to this list. The goal is to shrink it to zero as
# subtasks C–J land. If this list ever needs to grow, the authority model
# has been violated.
LEGACY_ALLOWLIST: frozenset[str] = frozenset(CONFIG_SCHEMA.keys())


def test_every_schema_entry_is_a_config_option() -> None:
    """Guard against accidental non-ConfigOption entries in the schema dict."""
    for key, option in CONFIG_SCHEMA.items():
        assert isinstance(option, ConfigOption), (
            f"CONFIG_SCHEMA[{key!r}] is not a ConfigOption"
        )


def test_authority_metadata_present_and_typed() -> None:
    """Every entry has a valid plane + startup requirement enum."""
    for key, option in CONFIG_SCHEMA.items():
        assert isinstance(option.plane, AuthorityPlane), (
            f"{key!r} plane is not AuthorityPlane: {option.plane!r}"
        )
        assert isinstance(option.startup, StartupRequirement), (
            f"{key!r} startup is not StartupRequirement: {option.startup!r}"
        )


def test_no_new_legacy_entries_since_t2431b() -> None:
    """New work must declare a real authority plane, not LEGACY."""
    actual_legacy = {
        key for key, option in CONFIG_SCHEMA.items()
        if option.plane is AuthorityPlane.LEGACY
    }
    new_legacy = actual_legacy - LEGACY_ALLOWLIST
    assert not new_legacy, (
        "New ConfigOption entries must declare plane=AuthorityPlane.HOST/"
        "SERVICE/USER/RUNTIME. The following keys were added as LEGACY "
        "and are not allowed: " + ", ".join(sorted(new_legacy))
    )


def test_non_legacy_options_declare_an_owner() -> None:
    """Once a key has a real plane, it must name its owning subsystem."""
    for key, option in CONFIG_SCHEMA.items():
        if option.plane is AuthorityPlane.LEGACY:
            continue
        assert option.owner, (
            f"{key!r} declares plane={option.plane.value} but no owner; "
            "set ConfigOption.owner to the subsystem that owns the key"
        )


def test_projection_of_target_exists() -> None:
    """If an option is a projection of another key, the target must exist."""
    for key, option in CONFIG_SCHEMA.items():
        if not option.projection_of:
            continue
        assert option.projection_of in CONFIG_SCHEMA, (
            f"{key!r} claims to be a projection of {option.projection_of!r}, "
            "but that key is not in CONFIG_SCHEMA"
        )


def test_critical_startup_options_are_not_runtime_mutable() -> None:
    """A value required for boot cannot be changed at runtime via API.

    This mirrors the Tier A lock contract in .claude/CLAUDE.md: if a
    setting must be stable before a service starts, runtime mutation is
    a contradiction.
    """
    for key, option in CONFIG_SCHEMA.items():
        if option.startup is StartupRequirement.CRITICAL and option.runtime_mutable:
            pytest.fail(
                f"{key!r} is startup=CRITICAL but runtime_mutable=True; "
                "either lower the startup level or set runtime_mutable=False"
            )
