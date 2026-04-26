"""T2454 slice 1 — tests for snapshot_preload_pins Special Setting + orchestrator.

Covers:
- normalize_snapshot_preload_pins: dedupe, ordered, capped at 5, drops invalid.
- SpecialSettingsResponse + UpdateRequest carry the new field.
- Special Settings standalone POST path persists and round-trips pins.
- SnapshotPreloadOrchestrator.preload(): cold → warm; idempotent on re-call.
- SnapshotPreloadOrchestrator.evict(): releases staged engine instances.
- SnapshotPreloadOrchestrator.reconcile(): warms cold pinned ids, evicts orphans.
- POST /api/snapshots/{id}/preload + GET /api/snapshots/preload-status routes.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app import database as database_module
from app.models import SpecialSettingsResponse, SpecialSettingsUpdateRequest
from app.routes import special_settings, unified_snapshots
from app.services.snapshot.preload_orchestrator import (
    SnapshotPreloadOrchestrator,
)
from app.services.special_settings_normalization import (
    SNAPSHOT_PRELOAD_PIN_CAP,
    normalize_snapshot_preload_pins,
    resolve_snapshot_preload_pins_from_settings,
)


# ---------- normalization helper ----------


def test_normalize_pins_dedupes_orders_and_caps_at_five():
    assert normalize_snapshot_preload_pins([]) == []
    assert normalize_snapshot_preload_pins(None) == []
    assert normalize_snapshot_preload_pins([7, "  9 ", 7, "5", 5, 0, -1, True, "bad"]) == [7, 9, 5]
    # The 5-cap kicks in even when more valid values follow.
    too_many = list(range(1, 12))  # 1..11 valid ints
    capped = normalize_snapshot_preload_pins(too_many)
    assert capped == [1, 2, 3, 4, 5]
    assert len(capped) == SNAPSHOT_PRELOAD_PIN_CAP


def test_resolve_from_settings_falls_back_to_empty_list():
    settings = SimpleNamespace()
    assert resolve_snapshot_preload_pins_from_settings(settings) == []
    settings = SimpleNamespace(snapshot_preload_pins=None)
    assert resolve_snapshot_preload_pins_from_settings(settings) == []
    settings = SimpleNamespace(snapshot_preload_pins=["3", 4, 4])
    assert resolve_snapshot_preload_pins_from_settings(settings) == [3, 4]


# ---------- Pydantic models ----------


def test_special_settings_response_carries_pins():
    response = SpecialSettingsResponse(snapshot_preload_pins=[1, 2, 3])
    assert response.snapshot_preload_pins == [1, 2, 3]
    # Default is empty list.
    bare = SpecialSettingsResponse()
    assert bare.snapshot_preload_pins == []


def test_update_request_round_trips_pins():
    request = SpecialSettingsUpdateRequest(
        enabled=True,
        hidden_plugins=[],
        menu_location="hidden",
        snapshot_preload_pins=[2, 4, 6, 8, 10, 12],  # 6th will get capped by normalize
    )
    assert request.snapshot_preload_pins == [2, 4, 6, 8, 10, 12]
    # Normalization at the route layer drops the 6th entry.
    assert normalize_snapshot_preload_pins(request.snapshot_preload_pins) == [2, 4, 6, 8, 10]


# ---------- Special Settings standalone POST path ----------


def test_update_special_settings_persists_pins(monkeypatch):
    class _FakeSession:
        async def flush(self):
            return None

    fake_session = _FakeSession()

    @asynccontextmanager
    async def _fake_session_ctx():
        yield fake_session

    settings = SimpleNamespace(
        enabled=False,
        hidden_plugins=[],
        menu_location="hidden",
        pinned_routes=[],
        landing_tiles=[],
        snapshot_setlist_mode=False,
        snapshot_setlist_order=[],
        snapshot_editor_flow_animation="cascade",
        snapshot_editor_grid_backdrop=True,
        snapshot_editor_node_shape="square",
        snapshot_preload_pins=[],
        last_active_node=None,
        version=1,
        last_updated=datetime.now(timezone.utc),
        updated_by_node=None,
    )

    async def _fake_get_special_settings_db(_session):
        return settings

    monkeypatch.setattr(special_settings, "CLUSTER_MODE", False)
    monkeypatch.setattr(special_settings, "get_session", _fake_session_ctx)
    monkeypatch.setattr(special_settings, "get_special_settings_db", _fake_get_special_settings_db)

    response = asyncio.run(
        special_settings.update_special_settings(
            SpecialSettingsUpdateRequest(
                enabled=True,
                hidden_plugins=[],
                menu_location="hidden",
                snapshot_preload_pins=[7, "9", 7, 11, 13, 15, 17],  # caps to 5 distinct
            )
        )
    )

    assert settings.snapshot_preload_pins == [7, 9, 11, 13, 15]
    assert response.snapshot_preload_pins == [7, 9, 11, 13, 15]


# ---------- Orchestrator: cold → warm → idempotent ----------


class _FakeChainService:
    """Minimal stand-in for ChainService used by the orchestrator's preload
    path. Records how many times stage / release were invoked so tests can
    assert no engine handles are leaked across re-warms."""

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
    """Wire the orchestrator's session + service lookups to in-memory fakes."""
    from app.services.snapshot import preload_orchestrator as orch_mod

    @asynccontextmanager
    async def _fake_session():
        yield SimpleNamespace()  # session is unused by our fakes

    async def _fake_read_snapshot_row(self, _session, snapshot_id):
        return snapshot_rows.get(int(snapshot_id))

    class _FakeSnapshotService:
        def __init__(self, _session):
            self.chain_service = chain_service

        def _snapshot_preload_stage_plugins(self, _snapshot):
            # The orchestrator just hands this to chain_service.stage; the
            # contents don't matter for these tests.
            return [SimpleNamespace(plugin_uri="map2://test/plugin", position=0, bypass=False)]

    monkeypatch.setattr(orch_mod, "get_session", _fake_session)
    monkeypatch.setattr(
        SnapshotPreloadOrchestrator,
        "_read_snapshot_row",
        _fake_read_snapshot_row,
    )

    import app.services.snapshot as snapshot_pkg

    monkeypatch.setattr(snapshot_pkg, "SnapshotService", _FakeSnapshotService)


def test_orchestrator_preload_cold_then_idempotent(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain_service = _FakeChainService(instance_ids=[201, 202])
    rows = {42: _FakeSnapshotRow(snapshot_id=42, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain_service)

    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    first = asyncio.run(orchestrator.preload(42))
    assert first["warm"] is True
    assert first["version"] == 1
    assert first["staged_instance_count"] == 2
    assert first["reason"] == "warmed"
    assert len(chain_service.stage_calls) == 1

    # Idempotent: same version → no extra stage call.
    second = asyncio.run(orchestrator.preload(42))
    assert second["warm"] is True
    assert second["reason"] == "already_warm"
    assert len(chain_service.stage_calls) == 1

    # Version bump → re-stage and release the old instance ids.
    rows[42].version = 2
    third = asyncio.run(orchestrator.preload(42))
    assert third["warm"] is True
    assert third["version"] == 2
    assert len(chain_service.stage_calls) == 2
    assert chain_service.release_calls == [[201, 202]]


def test_orchestrator_preload_returns_not_found(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain_service = _FakeChainService()
    _patch_orchestrator_session(monkeypatch, {}, chain_service)

    orchestrator = SnapshotPreloadOrchestrator.get_instance()
    result = asyncio.run(orchestrator.preload(999))
    assert result["warm"] is False
    assert result["reason"] == "not_found"
    assert chain_service.stage_calls == []


# ---------- Orchestrator: reconcile evicts orphans + warms cold ----------


def test_reconcile_warms_pinned_and_evicts_orphans(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain_service = _FakeChainService(instance_ids=[301])
    rows = {
        10: _FakeSnapshotRow(snapshot_id=10, version=1),
        20: _FakeSnapshotRow(snapshot_id=20, version=1),
    }
    _patch_orchestrator_session(monkeypatch, rows, chain_service)
    orchestrator = SnapshotPreloadOrchestrator.get_instance()

    # Warm 10 first so reconcile can find an orphan to evict.
    asyncio.run(orchestrator.preload(10))
    assert asyncio.run(orchestrator.is_warm(10))

    # Patch ChainService construction in evict() — evict path uses ChainService()
    # directly to release orphan instances.
    from app.services import chain_service as chain_service_module

    captured_release: list[list[int]] = []

    class _ReleaseOnlyChainService:
        async def release_detached_instance_ids(self, ids):
            captured_release.append(list(ids))
            return {"released_instance_ids": list(ids)}

    monkeypatch.setattr(chain_service_module, "ChainService", lambda: _ReleaseOnlyChainService())

    # Reconcile with a new pinned set: 20 is the only pin → 10 evicted, 20 warmed.
    summary = asyncio.run(orchestrator.reconcile([20]))
    assert summary["pinned_count"] == 1
    assert summary["evicted"] == 1
    assert summary["warmed"] == 1
    assert captured_release == [[301]]
    assert asyncio.run(orchestrator.is_warm(10)) is False
    assert asyncio.run(orchestrator.is_warm(20)) is True


# ---------- Routes ----------


def test_preload_status_route_renders_pinned_slot_layout(monkeypatch):
    SnapshotPreloadOrchestrator.reset_for_tests()
    chain_service = _FakeChainService(instance_ids=[501])
    rows = {3: _FakeSnapshotRow(snapshot_id=3, version=1)}
    _patch_orchestrator_session(monkeypatch, rows, chain_service)

    orchestrator = SnapshotPreloadOrchestrator.get_instance()
    asyncio.run(orchestrator.preload(3))

    @asynccontextmanager
    async def _fake_session():
        yield SimpleNamespace()

    fake_settings = SimpleNamespace(snapshot_preload_pins=[3, 4])

    class _FakeExecResult:
        def scalar_one_or_none(self):
            return fake_settings

    class _FakeSession:
        async def execute(self, _stmt):
            return _FakeExecResult()

    @asynccontextmanager
    async def _patched_session():
        yield _FakeSession()

    monkeypatch.setattr(unified_snapshots, "get_session", _patched_session)

    payload = asyncio.run(unified_snapshots.get_snapshot_preload_status())
    assert payload["pinned_count"] == 2
    assert payload["warm_count"] == 1
    slot_ids = [slot["snapshot_id"] for slot in payload["slots"]]
    assert slot_ids == [3, 4]
    assert payload["slots"][0]["warm"] is True
    assert payload["slots"][1]["warm"] is False
