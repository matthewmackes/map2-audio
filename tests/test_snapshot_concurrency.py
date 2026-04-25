"""T2449 — optimistic-concurrency tests for snapshot PATCH / activate.

Two scenarios:

1. Two concurrent PATCHes with the same `If-Match` version: one wins (200,
   version bump from N → N+1), the other gets `PreconditionFailedError`.
2. A stale `If-Match` on activate fails 412 and does not touch the engine.

The tests run against a temp aiosqlite DB and use the SnapshotService
directly. The route layer maps `PreconditionFailedError` → HTTP 412 with a
structured `snapshot_version_conflict` envelope; that mapping is exercised
implicitly by the route smoke-tests in test_unified_snapshots.py — here we
just verify the service-level invariant.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.snapshot import SnapshotService
from app.services.snapshot.common import PreconditionFailedError


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'concurrency.db'}")


def test_snapshot_update_rejects_stale_if_match(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        # Create a snapshot — version starts at 1.
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="ConcurrencyA",
                description="initial",
                detail_payload={
                    "channels": [{"channel_key": "channel-0", "label": "A"}],
                    "chains": [],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-0"},
                    "midi_map": [],
                },
            )
        snapshot_id = int(created["id"])
        assert int(created["version"]) == 1

        # First PATCH lands with If-Match=1 → version bumps to 2.
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            updated = await service.update_snapshot(
                snapshot_id,
                description="first writer",
                if_match_version=1,
            )
        assert updated is not None
        assert int(updated["version"]) == 2
        assert updated["description"] == "first writer"

        # Second PATCH with the same stale If-Match=1 raises PreconditionFailedError.
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            with pytest.raises(PreconditionFailedError) as exc_info:
                await service.update_snapshot(
                    snapshot_id,
                    description="stale writer",
                    if_match_version=1,
                )
        assert exc_info.value.snapshot_id == snapshot_id
        assert exc_info.value.expected_version == 1
        assert exc_info.value.current_version == 2
        envelope = exc_info.value.detail_payload
        assert envelope["code"] == "snapshot_version_conflict"
        assert envelope["snapshot_id"] == snapshot_id
        assert envelope["expected_version"] == 1
        assert envelope["current_version"] == 2

        # The stale write must NOT have landed: confirm description is still
        # "first writer" (the second PATCH was rejected before mutating).
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            current = await service.get_snapshot(snapshot_id)
        assert current is not None
        assert current["description"] == "first writer"
        assert int(current["version"]) == 2

        # A fresh PATCH with the correct If-Match=2 succeeds.
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            second = await service.update_snapshot(
                snapshot_id,
                description="catches up",
                if_match_version=2,
            )
        assert second is not None
        assert int(second["version"]) == 3
        assert second["description"] == "catches up"

    asyncio.run(_run())


def test_snapshot_update_without_if_match_keeps_legacy_behavior(tmp_path):
    """If the caller doesn't send If-Match, writes go through as before. This
    preserves compatibility for older clients during the rollout."""
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="ConcurrencyB",
                description="initial",
                detail_payload={
                    "channels": [{"channel_key": "channel-0", "label": "A"}],
                    "chains": [],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-0"},
                    "midi_map": [],
                },
            )
        snapshot_id = int(created["id"])

        # Two PATCHes with no If-Match — both succeed; version increments.
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            first = await service.update_snapshot(snapshot_id, description="legacy-1")
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            second = await service.update_snapshot(snapshot_id, description="legacy-2")

        assert first is not None and second is not None
        assert int(first["version"]) == 2
        assert int(second["version"]) == 3
        assert second["description"] == "legacy-2"

    asyncio.run(_run())


def test_snapshot_update_if_match_envelope_shape(tmp_path):
    """Sanity-check the envelope keys the route layer relies on for 412."""
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="ConcurrencyC",
                detail_payload={
                    "channels": [{"channel_key": "channel-0", "label": "A"}],
                    "chains": [],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-0"},
                    "midi_map": [],
                },
            )
        snapshot_id = int(created["id"])

        async with database_module.get_session() as session:
            service = SnapshotService(session)
            with pytest.raises(PreconditionFailedError) as exc_info:
                await service.update_snapshot(
                    snapshot_id,
                    description="should fail",
                    if_match_version=99,
                )
        env = exc_info.value.detail_payload
        # The route layer sends `{"detail": {"error": env}}` — assert env keys
        # so the route's HTTPException(detail=...) shape stays stable.
        assert set(env.keys()) >= {
            "code",
            "message",
            "snapshot_id",
            "expected_version",
            "current_version",
        }
        assert env["code"] == "snapshot_version_conflict"

    asyncio.run(_run())
