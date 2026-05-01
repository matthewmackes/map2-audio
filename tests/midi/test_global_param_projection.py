"""T2482-P2.8 part 1: global_param projection + chain-less migration tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import text

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.global_param import (
    list_global_param_bindings,
    list_global_param_bindings_for_param,
    make_consumer_id,
    make_create_payload,
    migrate_chain_less_midi_mappings,
    parse_consumer_id,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'global-param.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- consumer_id format ----------


def test_make_consumer_id_simple():
    assert make_consumer_id(plugin_uri="map2:fx:eq", param_index=2) == "map2:fx:eq:2"


def test_make_consumer_id_lv2_url():
    cid = make_consumer_id(
        plugin_uri="http://lv2plug.in/plugins/eg-amp", param_index=7
    )
    assert cid == "http://lv2plug.in/plugins/eg-amp:7"


def test_make_consumer_id_rejects_empty_uri():
    with pytest.raises(ValueError):
        make_consumer_id(plugin_uri="", param_index=0)


def test_parse_consumer_id_round_trip():
    cid = make_consumer_id(plugin_uri="http://lv2plug.in/plugins/eg-amp", param_index=7)
    plugin_uri, param = parse_consumer_id(cid)
    assert (plugin_uri, param) == ("http://lv2plug.in/plugins/eg-amp", 7)


def test_parse_consumer_id_rejects_malformed():
    with pytest.raises(ValueError):
        parse_consumer_id("no_colons_at_all")
    with pytest.raises(ValueError):
        parse_consumer_id(":just_a_param_index")
    with pytest.raises(ValueError):
        parse_consumer_id("plugin:not_an_int")


# ---------- payload shaping ----------


def test_payload_basic_cc():
    p = make_create_payload(
        plugin_uri="map2:fx:eq",
        param_index=0,
        source_type="midi_cc",
        channel=0,
        cc=7,
    )
    assert p.consumer_type == "global_param"
    assert p.consumer_id == "map2:fx:eq:0"
    assert p.scope == "global"
    assert p.scope_id is None
    assert p.source_descriptor == {"channel": 0, "cc": 7}
    assert p.target_type == "engine_param"
    assert p.target_descriptor == {"plugin_uri": "map2:fx:eq", "param_index": 0}


def test_payload_with_curve_and_range():
    p = make_create_payload(
        plugin_uri="map2:fx:nam",
        param_index=3,
        source_type="midi_cc",
        channel=1,
        cc=11,
        curve="exponential",
        range_min=-12.0,
        range_max=12.0,
    )
    assert p.source_descriptor["curve"] == "exponential"
    assert p.source_descriptor["min"] == -12.0
    assert p.source_descriptor["max"] == 12.0


def test_payload_with_feedback_and_label():
    p = make_create_payload(
        plugin_uri="map2:fx:eq",
        param_index=0,
        source_type="midi_cc",
        channel=0,
        cc=7,
        feedback_cc=8,
        parameter_label="Master Gain",
    )
    assert p.target_descriptor["feedback_cc"] == 8
    assert p.target_descriptor["parameter_label"] == "Master Gain"
    assert p.consumer_label == "Master Gain"


def test_payload_extras_pass_through():
    p = make_create_payload(
        plugin_uri="map2:fx:eq",
        param_index=0,
        source_type="midi_cc",
        channel=0,
        cc=7,
        extras={"vendor_field": "value"},
    )
    assert p.metadata["extra"]["vendor_field"] == "value"


# ---------- DB-backed listing ----------


def test_list_global_param_bindings_unfiltered(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(
                    plugin_uri="map2:fx:eq",
                    param_index=0,
                    source_type="midi_cc",
                    channel=0,
                    cc=7,
                )
            )
            await authority.create(
                make_create_payload(
                    plugin_uri="map2:fx:nam",
                    param_index=3,
                    source_type="midi_cc",
                    channel=0,
                    cc=8,
                )
            )
            await session.commit()
            all_global = await list_global_param_bindings(authority)
            assert len(all_global) == 2

    asyncio.run(_run())


def test_list_for_specific_param(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(
                    plugin_uri="map2:fx:eq",
                    param_index=0,
                    source_type="midi_cc",
                    channel=0,
                    cc=7,
                )
            )
            await authority.create(
                make_create_payload(
                    plugin_uri="map2:fx:eq",
                    param_index=1,
                    source_type="midi_cc",
                    channel=0,
                    cc=8,
                )
            )
            await session.commit()
            for_param0 = await list_global_param_bindings_for_param(
                authority, plugin_uri="map2:fx:eq", param_index=0
            )
            for_param1 = await list_global_param_bindings_for_param(
                authority, plugin_uri="map2:fx:eq", param_index=1
            )
            assert len(for_param0) == 1
            assert len(for_param1) == 1

    asyncio.run(_run())


# ---------- Migration tests ----------


def test_migrate_chain_less_midi_mappings(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            # Seed 3 chain-less rows + 1 chain-bound (should be ignored
            # by this migration; the plugin_param migration handles it)
            await session.execute(text("INSERT INTO chains (id, name) VALUES (1, 'Bound')"))
            await session.execute(
                text(
                    "INSERT INTO midi_mappings ("
                    "channel, cc, chain_id, target_plugin_uri, "
                    "target_plugin_position, target_param_index, "
                    "is_enabled, feedback_enabled"
                    ") VALUES "
                    "(0, 7, NULL, 'http://example.com/amp', 0, 0, 1, 1), "
                    "(0, 8, NULL, 'plugin://gain', 0, 0, 1, 1), "
                    "(1, 11, NULL, 'map2:fx:eq', 0, 2, 1, 1), "
                    "(1, 78, 1, 'map2:fx:nam', 0, 0, 1, 1)"
                )
            )
            await session.commit()

            authority = MidiBindingAuthority(session)
            stats = await migrate_chain_less_midi_mappings(authority)
            await session.commit()

            assert stats["mappings_migrated"] == 3
            assert stats["mappings_skipped"] == 0

            globals_ = await list_global_param_bindings(authority)
            assert len(globals_) == 3
            # Verify provenance + descriptor fidelity
            for b in globals_:
                assert b.metadata["legacy_table"] == "midi_mappings"
                assert "legacy_row_id" in b.metadata
                assert b.scope == "global"
                assert b.scope_id is None
                assert b.source == "legacy-migration"
                assert b.created_by == "phase2-migration"

    asyncio.run(_run())


def test_migrate_idempotent(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            await session.execute(
                text(
                    "INSERT INTO midi_mappings ("
                    "channel, cc, chain_id, target_plugin_uri, "
                    "target_plugin_position, target_param_index, "
                    "is_enabled, feedback_enabled"
                    ") VALUES (0, 7, NULL, 'plugin://gain', 0, 0, 1, 1)"
                )
            )
            await session.commit()
            authority = MidiBindingAuthority(session)
            first = await migrate_chain_less_midi_mappings(authority)
            await session.commit()
            second = await migrate_chain_less_midi_mappings(authority)
            await session.commit()
            assert first["mappings_migrated"] == 1
            assert second["mappings_migrated"] == 0
            assert second["mappings_skipped"] == 1
            assert await authority.count() == 1

    asyncio.run(_run())


def test_migrate_skips_rows_missing_plugin_uri(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            await session.execute(
                text(
                    "INSERT INTO midi_mappings ("
                    "channel, cc, chain_id, target_param_index, "
                    "is_enabled, feedback_enabled"
                    ") VALUES (0, 7, NULL, 0, 1, 1)"
                )
            )
            await session.commit()
            authority = MidiBindingAuthority(session)
            stats = await migrate_chain_less_midi_mappings(authority)
            await session.commit()
            assert stats["mappings_migrated"] == 0
            assert stats["mappings_skipped"] == 1

    asyncio.run(_run())
