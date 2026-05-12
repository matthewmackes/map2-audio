"""T2517-5 — Hardware singleton-lock regression tests."""

from __future__ import annotations

import pytest

from app.services.effects.hardware_singleton_lock import (
    HardwareSingletonInUseError,
    HardwareSingletonLock,
)
from app.services.plugin_uris import (
    LEXICON_MPX1_URI,
    LEXICON_MPX1_URI_LEGACY_SPDIF,
)


def _make_lock() -> HardwareSingletonLock:
    lock = HardwareSingletonLock()
    lock.register_aliases(LEXICON_MPX1_URI, [LEXICON_MPX1_URI_LEGACY_SPDIF])
    return lock


def test_first_acquire_succeeds_and_lock_is_held():
    lock = _make_lock()
    lease = lock.acquire(LEXICON_MPX1_URI, "chain-A")
    assert lease.canonical_uri == LEXICON_MPX1_URI
    assert lease.chain_id == "chain-A"
    assert lock.is_held(LEXICON_MPX1_URI)
    assert lock.held_by(LEXICON_MPX1_URI) == "chain-A"


def test_second_acquire_from_different_chain_raises_structured_error():
    lock = _make_lock()
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    with pytest.raises(HardwareSingletonInUseError) as exc_info:
        lock.acquire(LEXICON_MPX1_URI, "chain-B")
    err = exc_info.value
    assert err.uri == LEXICON_MPX1_URI
    assert err.in_use_by_chain == "chain-A"
    structured = err.to_structured()
    assert structured["code"] == "hardware_singleton_in_use"
    assert structured["uri"] == LEXICON_MPX1_URI
    assert structured["in_use_by_chain"] == "chain-A"


def test_second_acquire_from_same_chain_is_idempotent():
    lock = _make_lock()
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    lease = lock.acquire(LEXICON_MPX1_URI, "chain-A")
    assert lease.chain_id == "chain-A"


def test_acquire_with_legacy_alias_collides_with_canonical():
    """A snapshot using the legacy URI must still hit the same lock slot."""
    lock = _make_lock()
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    with pytest.raises(HardwareSingletonInUseError):
        lock.acquire(LEXICON_MPX1_URI_LEGACY_SPDIF, "chain-B")


def test_release_with_matching_chain_succeeds():
    lock = _make_lock()
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    assert lock.release(LEXICON_MPX1_URI, "chain-A") is True
    assert not lock.is_held(LEXICON_MPX1_URI)


def test_release_with_mismatched_chain_is_a_noop():
    """Late teardown callbacks shouldn't release a lock another chain took over."""
    lock = _make_lock()
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    assert lock.release(LEXICON_MPX1_URI, "chain-Z") is False
    assert lock.is_held(LEXICON_MPX1_URI)
    assert lock.held_by(LEXICON_MPX1_URI) == "chain-A"


def test_release_without_holder_returns_false():
    lock = _make_lock()
    assert lock.release(LEXICON_MPX1_URI, "anyone") is False


def test_acquire_after_release_succeeds_from_a_different_chain():
    lock = _make_lock()
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    lock.release(LEXICON_MPX1_URI, "chain-A")
    lease = lock.acquire(LEXICON_MPX1_URI, "chain-B")
    assert lease.chain_id == "chain-B"


def test_snapshot_reports_all_active_holders():
    lock = _make_lock()
    # Use two different canonical URIs (no two hardware singletons share)
    other_uri = "hardware://eventide-h8000"
    lock.acquire(LEXICON_MPX1_URI, "chain-A")
    lock.acquire(other_uri, "chain-B")
    snap = lock.snapshot()
    assert snap[LEXICON_MPX1_URI] == "chain-A"
    assert snap[other_uri] == "chain-B"


def test_global_singleton_returns_same_instance():
    from app.services.effects.hardware_singleton_lock import get_hardware_singleton_lock

    assert get_hardware_singleton_lock() is get_hardware_singleton_lock()
