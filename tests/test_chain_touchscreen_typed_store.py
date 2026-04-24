"""T2436-B — round-trip tests for the typed chain_touchscreen_assignments store.

Locks the contract that the new typed store replaces the SystemConfig
JSON-blob surface without changing the public API shape of
`ChainService.get_touchscreen_state` / `set_touchscreen_stomp_assignments`.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app import database as database_module
from app.services.chain_service import ChainService


def _init_temp_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "chain-touchscreen.db"
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_db(f"sqlite:///{db_path}")
    database_module.init_async_db(f"sqlite+aiosqlite:///{db_path}")
    return db_path


async def _seed_chain_with_plugins(
    session, chain_name: str, plugin_uris: list[tuple[str, int]]
) -> int:
    chain = database_module.Chain(name=chain_name, is_active=False)
    session.add(chain)
    await session.flush()
    for uri, position in plugin_uris:
        session.add(
            database_module.ChainPlugin(
                chain_id=chain.id,
                plugin_uri=uri,
                position=position,
                bypass=False,
            )
        )
    await session.flush()
    return int(chain.id)


@pytest.mark.asyncio
async def test_touchscreen_state_returns_empty_when_no_rows(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_id = await _seed_chain_with_plugins(
            session, "Empty Chain", [("urn:x:gain", 0)]
        )
        service = ChainService(session)
        state = await service.get_touchscreen_state(chain_id)
    assert state == {"chain_id": chain_id, "stomp_assignments": []}


@pytest.mark.asyncio
async def test_set_then_get_touchscreen_round_trips(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_id = await _seed_chain_with_plugins(
            session,
            "Stomp Chain",
            [("urn:x:drive", 0), ("urn:x:reverb", 1), ("urn:x:delay", 2)],
        )
        service = ChainService(session)
        result = await service.set_touchscreen_stomp_assignments(
            chain_id,
            [
                {"slot": 1, "plugin_uri": "urn:x:drive", "plugin_position": 0},
                {"slot": 3, "plugin_uri": "urn:x:reverb", "plugin_position": 1},
            ],
        )
    assert result == {
        "chain_id": chain_id,
        "stomp_assignments": [
            {"slot": 1, "plugin_uri": "urn:x:drive", "plugin_position": 0},
            {"slot": 3, "plugin_uri": "urn:x:reverb", "plugin_position": 1},
        ],
    }

    async with database_module.get_session() as session:
        state = await ChainService(session).get_touchscreen_state(chain_id)
    assert state["stomp_assignments"] == [
        {"slot": 1, "plugin_uri": "urn:x:drive", "plugin_position": 0},
        {"slot": 3, "plugin_uri": "urn:x:reverb", "plugin_position": 1},
    ]


@pytest.mark.asyncio
async def test_set_is_replace_all_semantics(tmp_path: Path) -> None:
    """Writing a new set of assignments must remove anything not in the
    new payload — the legacy JSON-blob surface had the same contract."""
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_id = await _seed_chain_with_plugins(
            session,
            "Replace Chain",
            [("urn:x:a", 0), ("urn:x:b", 1), ("urn:x:c", 2)],
        )
        service = ChainService(session)
        await service.set_touchscreen_stomp_assignments(
            chain_id,
            [
                {"slot": 1, "plugin_uri": "urn:x:a", "plugin_position": 0},
                {"slot": 2, "plugin_uri": "urn:x:b", "plugin_position": 1},
            ],
        )
        # New payload has only slot 5 — the prior slots must disappear.
        await service.set_touchscreen_stomp_assignments(
            chain_id,
            [
                {"slot": 5, "plugin_uri": "urn:x:c", "plugin_position": 2},
            ],
        )
        state = await service.get_touchscreen_state(chain_id)
    assert state["stomp_assignments"] == [
        {"slot": 5, "plugin_uri": "urn:x:c", "plugin_position": 2},
    ]


@pytest.mark.asyncio
async def test_set_drops_assignments_for_plugins_not_in_chain(tmp_path: Path) -> None:
    """An assignment that points at a missing plugin URI/position combo
    must not be persisted — the normalize step filters the caller's
    payload against the actual chain."""
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_id = await _seed_chain_with_plugins(
            session,
            "Filter Chain",
            [("urn:x:real", 0)],
        )
        service = ChainService(session)
        result = await service.set_touchscreen_stomp_assignments(
            chain_id,
            [
                {"slot": 1, "plugin_uri": "urn:x:real", "plugin_position": 0},
                {"slot": 2, "plugin_uri": "urn:x:ghost", "plugin_position": 99},
            ],
        )
    assert result["stomp_assignments"] == [
        {"slot": 1, "plugin_uri": "urn:x:real", "plugin_position": 0},
    ]


def test_model_declares_unique_slot_per_chain() -> None:
    """DDL-level guard: the unique constraint on (chain_id, slot) must
    exist on the model even if future callers bypass the normalize step."""
    constraints = database_module.ChainTouchscreenAssignment.__table__.constraints
    names = {c.name for c in constraints if getattr(c, "name", None)}
    assert "uq_chain_touchscreen_slot" in names


def test_model_declares_chain_foreign_key() -> None:
    """Orphan assignments must cascade-delete with their chain."""
    fks = list(database_module.ChainTouchscreenAssignment.__table__.foreign_keys)
    assert any(fk.column.table.name == "chains" for fk in fks)
    # Cascade behavior is what keeps the table from collecting orphans.
    chain_fk = next(fk for fk in fks if fk.column.table.name == "chains")
    assert chain_fk.ondelete == "CASCADE"
