"""T2483 loop 17 / iter 163 — backend tests for the new
GET /api/midi/bindings/matrix route (T2483-8).

Exercises the route handler directly. (The router IS mounted in
app/main.py:1153 per the loop-21 audit; calling the handler
directly is still simpler than spinning up a TestClient for these
behavior assertions.)

Pattern: temp sqlite DB + authority writes a small fixture set +
call get_bindings_matrix() and assert on the aggregated shape.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority, MidiBindingCreate
from app.services.midi.routes import (
    BindingsMatrixResponse,
    MatrixCell,
    get_bindings_matrix,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'matrix-endpoint.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _snapshot_payload(
    consumer_id: str,
    *,
    consumer_type: str = "plugin_param",
    source_type: str = "midi_cc",
    enabled: bool = True,
    **overrides,
) -> MidiBindingCreate:
    base = dict(
        consumer_type=consumer_type,
        consumer_id=consumer_id,
        consumer_label=f"test-{consumer_id}",
        source_type=source_type,
        source_descriptor={"channel": 0, "cc": 7},
        target_type="engine_param",
        target_descriptor={"plugin_uri": "lv2:foo", "param_index": 0},
        scope="global",
        scope_id=None,
        enabled=enabled,
        created_by="iter163-test",
        source="iter163-test",
    )
    base.update(overrides)
    return MidiBindingCreate(**base)


def test_route_response_model():
    """Verify the route exposes the right Pydantic shape."""
    from app.services.midi.routes import router

    matrix_route = next(
        r for r in router.routes if getattr(r, "path", "") == "/api/midi/bindings/matrix"
    )
    assert matrix_route.response_model is BindingsMatrixResponse


def test_empty_db_returns_empty_matrix(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        return await get_bindings_matrix()

    response = asyncio.run(_run())
    assert response.matrix == {}
    assert response.total_bindings == 0


def test_aggregates_by_source_and_consumer_type(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # 2 midi_cc → plugin_param (one enabled, one disabled)
            await authority.create(_snapshot_payload("foo:0", enabled=True))
            await authority.create(_snapshot_payload("foo:1", enabled=False))
            # 1 midi_note → plugin_param (enabled)
            await authority.create(_snapshot_payload("foo:2", source_type="midi_note", enabled=True))
            # 1 midi_clock → transport (enabled)
            await authority.create(
                _snapshot_payload(
                    "transport:beat",
                    consumer_type="transport",
                    source_type="midi_clock",
                    enabled=True,
                    target_type="engine_command",
                    target_descriptor={"command_path": "transport.beat"},
                )
            )
        return await get_bindings_matrix()

    response = asyncio.run(_run())
    # midi_cc → plugin_param: 2 total, 1 enabled
    cell = response.matrix["midi_cc"]["plugin_param"]
    assert cell == MatrixCell(count=2, enabled_count=1)
    # midi_note → plugin_param: 1 total, 1 enabled
    cell = response.matrix["midi_note"]["plugin_param"]
    assert cell == MatrixCell(count=1, enabled_count=1)
    # midi_clock → transport: 1 total, 1 enabled
    cell = response.matrix["midi_clock"]["transport"]
    assert cell == MatrixCell(count=1, enabled_count=1)
    # total: 4
    assert response.total_bindings == 4


def test_omits_empty_groups(tmp_path):
    """Empty source × consumer pairs should not appear in the dict."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_snapshot_payload("foo:0"))
        return await get_bindings_matrix()

    response = asyncio.run(_run())
    # Only midi_cc row exists
    assert list(response.matrix.keys()) == ["midi_cc"]
    # Inside that row, only plugin_param column exists
    assert list(response.matrix["midi_cc"].keys()) == ["plugin_param"]
