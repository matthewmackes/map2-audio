"""T2459-H10 — `consumer_id="*"` wildcard backing for the
`/midi/bindings` Bindings page filter.

The page's "Consumer ID (use * for any)" hint advertises a wildcard.
Before H10 the authority did an exact-string match on `consumer_id`,
so `*` matched nothing. This module covers:

  1. The new `MidiBindingAuthority.list_by_consumer_type(...)` method
     returns every row of the given consumer_type regardless of
     consumer_id.
  2. The `list_bindings` route honors `consumer_id="*"` by dispatching
     to that new method.
  3. A literal (non-`*`) `consumer_id` still uses the exact-match path
     — the wildcard branch must not regress the canonical filter.
  4. The `enabled_only` flag composes with the wildcard.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority, MidiBindingCreate
from app.services.midi.routes import list_bindings


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'consumer-id-wildcard.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _plugin_param_payload(
    consumer_id: str,
    *,
    enabled: bool = True,
    **overrides,
) -> MidiBindingCreate:
    base = dict(
        consumer_type="plugin_param",
        consumer_id=consumer_id,
        consumer_label=f"test-{consumer_id}",
        source_type="midi_cc",
        source_descriptor={"channel": 0, "cc": 7},
        target_type="engine_param",
        target_descriptor={"plugin_uri": "lv2:foo", "param_index": 0},
        scope="snapshot",
        scope_id="13",
        enabled=enabled,
        created_by="t2459h10-test",
        source="t2459h10-test",
    )
    base.update(overrides)
    return MidiBindingCreate(**base)


def test_authority_list_by_consumer_type_returns_all(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # 3 plugin_param rows with different consumer_ids.
            await authority.create(_plugin_param_payload("40:urn:lv2:plugin:neural-amp-modeler:0"))
            await authority.create(_plugin_param_payload("41:urn:lv2:plugin:cabinet:0"))
            await authority.create(_plugin_param_payload("42:urn:lv2:plugin:reverb:0"))
            # 1 row of a different consumer_type — must be filtered out.
            await authority.create(
                _plugin_param_payload(
                    "transport:beat",
                    consumer_type="transport",
                    target_type="engine_command",
                    target_descriptor={"command_path": "transport.beat"},
                )
            )
            await session.commit()
        async with database_module.get_session(read_only=True) as session:
            authority = MidiBindingAuthority(session)
            rows = await authority.list_by_consumer_type("plugin_param")
        return rows

    rows = asyncio.run(_run())
    assert len(rows) == 3
    assert all(r.consumer_type == "plugin_param" for r in rows)
    assert {r.consumer_id for r in rows} == {
        "40:urn:lv2:plugin:neural-amp-modeler:0",
        "41:urn:lv2:plugin:cabinet:0",
        "42:urn:lv2:plugin:reverb:0",
    }


def test_authority_list_by_consumer_type_honors_enabled_only(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_plugin_param_payload("a:0", enabled=True))
            await authority.create(_plugin_param_payload("b:0", enabled=False))
            await session.commit()
        async with database_module.get_session(read_only=True) as session:
            authority = MidiBindingAuthority(session)
            all_rows = await authority.list_by_consumer_type("plugin_param")
            enabled_rows = await authority.list_by_consumer_type(
                "plugin_param", enabled_only=True
            )
        return all_rows, enabled_rows

    all_rows, enabled_rows = asyncio.run(_run())
    assert len(all_rows) == 2
    assert len(enabled_rows) == 1
    assert enabled_rows[0].consumer_id == "a:0"


def test_route_wildcard_returns_all_of_consumer_type(tmp_path):
    """GET /api/midi/bindings?consumer_type=plugin_param&consumer_id=*
    must return every plugin_param binding regardless of consumer_id.
    Calls the route handler directly (same pattern as
    test_matrix_endpoint.py).
    """
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_plugin_param_payload("40:urn:lv2:plugin:neural-amp-modeler:0"))
            await authority.create(_plugin_param_payload("41:urn:lv2:plugin:cabinet:0"))
            # Off-type row — must not be returned.
            await authority.create(
                _plugin_param_payload(
                    "transport:beat",
                    consumer_type="transport",
                    target_type="engine_command",
                    target_descriptor={"command_path": "transport.beat"},
                )
            )
            await session.commit()
        return await list_bindings(
            consumer_type="plugin_param",
            consumer_id="*",
            device_id=None,
            scope=None,
            scope_id=None,
            enabled_only=False,
        )

    rows = asyncio.run(_run())
    assert len(rows) == 2
    assert all(r.consumer_type == "plugin_param" for r in rows)
    assert {r.consumer_id for r in rows} == {
        "40:urn:lv2:plugin:neural-amp-modeler:0",
        "41:urn:lv2:plugin:cabinet:0",
    }


def test_route_literal_consumer_id_still_exact_match(tmp_path):
    """Regression guard: a literal (non-`*`) consumer_id must still
    use the exact-match path. Don't broaden filters as a side-effect
    of the wildcard branch.
    """
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_plugin_param_payload("40:urn:lv2:plugin:neural-amp-modeler:0"))
            await authority.create(_plugin_param_payload("41:urn:lv2:plugin:cabinet:0"))
            await session.commit()
        # Exact-match — only the cabinet row.
        return await list_bindings(
            consumer_type="plugin_param",
            consumer_id="41:urn:lv2:plugin:cabinet:0",
            device_id=None,
            scope=None,
            scope_id=None,
            enabled_only=False,
        )

    rows = asyncio.run(_run())
    assert len(rows) == 1
    assert rows[0].consumer_id == "41:urn:lv2:plugin:cabinet:0"


def test_route_wildcard_with_enabled_only(tmp_path):
    """The `*` wildcard composes with `enabled_only=True`."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_plugin_param_payload("a:0", enabled=True))
            await authority.create(_plugin_param_payload("b:0", enabled=False))
            await session.commit()
        return await list_bindings(
            consumer_type="plugin_param",
            consumer_id="*",
            device_id=None,
            scope=None,
            scope_id=None,
            enabled_only=True,
        )

    rows = asyncio.run(_run())
    assert len(rows) == 1
    assert rows[0].consumer_id == "a:0"
    assert rows[0].enabled is True
