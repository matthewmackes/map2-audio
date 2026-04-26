"""T2454-B — tests for the orchestrator claim/mark_consumed lifecycle.

Covers:
- claim() returns a snapshot of the warm entry's staged instance ids and
  marks the entry in-flight; subsequent claim() calls return None until
  mark_consumed() releases the lock.
- evict() respects the in_flight lock — reconciler tick can't release
  staged instances out from under an active activation.
- mark_consumed(success=True) and mark_consumed(success=False) both
  invalidate the warm cache so the reconciler re-warms next tick (the
  Q4=D self-healing fallback). The difference is just the consume_outcome
  field for diagnostics.
- preload() refuses to re-stage an in-flight entry.
- reconcile() skips in-flight entries from both eviction and re-warming.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any

import pytest

from app.services.snapshot.preload_orchestrator import (
    SnapshotPreloadOrchestrator,
)


# ---------- Test fixtures (reused from test_snapshot_preload_pins.py) ----------


class _FakeChainService:
    def __init__(self, *, status: str = "ready", instance_ids: list[int] | None = None) -> None:
        self.status = status
        self.instance_ids = list(instance_ids or [101, 102, 103])
        self.stage_calls: list[list[Any]] = []
        self.release_calls: list[list[int]] = []

    async def stage_detached_chain_plugins(self, chain_plugins):
        self.stage_calls.append(list(chain_plugins))
        return {
            "status": self.status,
            "staged_instance_ids": list(self.instance_ids),
            "warnings": [],
        }

    async def release_detached_instance_ids(self, ids):
        self.release_calls.append(list(ids))
        return {"released_instance_ids": list(ids)}


class _FakeSnapshotRow:
    def __init__(self, snapshot_id: int, version: int = 1) -> None:
        self.id = snapshot_id
        self.version = version


def _patch_orchestrator_session(
    monkeypatch,
    snapshot_rows: dict[int, _FakeSnapshotRow],
    chain_service: _FakeChainService,
) -> None:
    from app.services.snapshot import preload_orchestrator as orch_mod

    @asynccontextmanager
    async def _fake_session():
        yield SimpleNamespace()

    async def _fake_read_snapshot_row(self, _session, snapshot_id):
        return snapshot_rows.get(int(snapshot_id))

    class _FakeSnapshotService:
        def __init__(self, _session):
            self.chain_service = chain_service

        def _snapshot_preload_stage_plugins(self, _snapshot):
            return [SimpleNamespace(plugin_uri="map2://test/plugin", position=0, bypass=False)]

    monkeypatch.setattr(orch_mod, "get_session", _fake_session)
    monkeypatch.setattr(
        SnapshotPreloadOrchestrator,
        "_read_snapshot_row",
        _fake_read_snapshot_row,
    )

    import app.services.snapshot as snapshot_pkg
    monkeypatch.setattr(snapshot_pkg, "SnapshotService", _FakeSnapshotService)


# Patch ChainService for the evict() release-path used by mark_consumed.
@pytest.fixture
def patch_chain_service_for_evict(monkeypatch):
    from app.services import chain_service as chain_service_module

    captured_release: list[list[int]] = []

    class _ReleaseOnlyChainService:
        async def release_detached_instance_ids(self, ids):
            captured_release.append(list(ids))
            return {"released_instance_ids": list(ids)}

    monkeypatch.setattr(chain_service_module, "ChainService", lambda: _ReleaseOnlyChainService())
    return captured_release


# ---------- claim() lifecycle ----------


def test_claim_returns_none_when_entry_is_cold(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService()
    _patch_orchestrator_session(monkeypatch, {}, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    # No entries at all — claim returns None.
    assert asyncio.run(orchestrator.claim(99)) is None


def test_claim_succeeds_for_warm_entry_then_blocks_until_mark_consumed(
    monkeypatch, patch_chain_service_for_evict
):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService(instance_ids=[1001, 1002])
    rows = {7: _FakeSnapshotRow(snapshot_id=7, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    # Warm 7 first.
    asyncio.run(orchestrator.preload(7))
    assert asyncio.run(orchestrator.is_warm(7)) is True

    # First claim succeeds and returns the staged instance ids.
    claim = asyncio.run(orchestrator.claim(7))
    assert claim is not None
    assert claim.snapshot_id == 7
    assert claim.version == 1
    assert claim.staged_instance_ids == (1001, 1002)

    # Second claim while in-flight returns None.
    assert asyncio.run(orchestrator.claim(7)) is None

    # mark_consumed(success=True) clears the in-flight lock and evicts the
    # entry — the staged instances are now part of the live graph.
    consume = asyncio.run(orchestrator.mark_consumed(7, success=True))
    assert consume["consumed"] is True
    assert consume["consume_outcome"] == "success"
    assert consume["evicted"] is True
    # The warm cache is now empty for snapshot 7.
    assert asyncio.run(orchestrator.is_warm(7)) is False
    # And the staged instances were released through the chain service so
    # they aren't leaked even though we marked the consume successful (the
    # engine has already adopted them, but the orchestrator's cached
    # references should be cleared on consume regardless).
    assert patch_chain_service_for_evict == [[1001, 1002]]


def test_mark_consumed_failure_evicts_for_reconciler_to_re_warm(
    monkeypatch, patch_chain_service_for_evict
):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService(instance_ids=[2001])
    rows = {8: _FakeSnapshotRow(snapshot_id=8, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    asyncio.run(orchestrator.preload(8))
    claim = asyncio.run(orchestrator.claim(8))
    assert claim is not None

    # Simulate the FSM's warm-path failing.
    consume = asyncio.run(orchestrator.mark_consumed(8, success=False))
    assert consume["consumed"] is True
    assert consume["consume_outcome"] == "failure"
    assert consume["evicted"] is True
    # The evict() under the hood released the staged instances so the
    # next reconciler tick re-warms from a clean slate.
    assert patch_chain_service_for_evict == [[2001]]
    assert asyncio.run(orchestrator.is_warm(8)) is False


def test_mark_consumed_no_warm_entry_reports_not_warm(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService()
    _patch_orchestrator_session(monkeypatch, {}, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    consume = asyncio.run(orchestrator.mark_consumed(42, success=True))
    assert consume == {"snapshot_id": 42, "consumed": False, "reason": "not_warm"}


# ---------- in_flight semantics ----------


def test_evict_skips_in_flight_unless_force(monkeypatch, patch_chain_service_for_evict):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService(instance_ids=[3001])
    rows = {9: _FakeSnapshotRow(snapshot_id=9, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    asyncio.run(orchestrator.preload(9))
    claim = asyncio.run(orchestrator.claim(9))
    assert claim is not None

    # Reconciler-style evict (force=False) is refused while in-flight.
    result = asyncio.run(orchestrator.evict(9))
    assert result == {"snapshot_id": 9, "evicted": False, "reason": "in_flight"}
    assert patch_chain_service_for_evict == []  # no release

    # Forced evict (used by mark_consumed) succeeds.
    forced = asyncio.run(orchestrator.evict(9, force=True))
    assert forced["evicted"] is True
    assert patch_chain_service_for_evict == [[3001]]


def test_preload_refuses_to_restage_in_flight_entry(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService(instance_ids=[4001])
    rows = {11: _FakeSnapshotRow(snapshot_id=11, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    asyncio.run(orchestrator.preload(11))  # initial stage
    initial_stage_calls = len(chain.stage_calls)
    claim = asyncio.run(orchestrator.claim(11))
    assert claim is not None

    # Concurrent preload() while we hold the claim — must NOT re-stage.
    result = asyncio.run(orchestrator.preload(11))
    assert result["reason"] == "in_flight"
    assert len(chain.stage_calls) == initial_stage_calls  # no second stage call


def test_reconcile_skips_in_flight_entries(monkeypatch, patch_chain_service_for_evict):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain = _FakeChainService(instance_ids=[5001])
    rows = {13: _FakeSnapshotRow(snapshot_id=13, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    asyncio.run(orchestrator.preload(13))
    claim = asyncio.run(orchestrator.claim(13))
    assert claim is not None
    initial_stage_calls = len(chain.stage_calls)

    # Reconcile with a pinned set that includes 13 — the in-flight entry
    # must be skipped (not re-warmed, not evicted).
    summary = asyncio.run(orchestrator.reconcile([13]))
    assert summary["pinned_count"] == 1
    assert summary["evicted"] == 0  # in_flight prevents eviction
    assert len(chain.stage_calls) == initial_stage_calls  # in_flight prevents re-warming

    # Pull our claim back so we don't leave the singleton in a weird state
    # for downstream tests in the same process.
    asyncio.run(orchestrator.mark_consumed(13, success=True))
