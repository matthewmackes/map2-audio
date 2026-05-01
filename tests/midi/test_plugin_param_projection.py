"""T2482-P2.7: plugin-parameter projection tests.

Verifies the consumer_id format round-trips, payload shaping covers
the per-effect inline editor cases (CC, Note, with curve, with
feedback CC, with parameter label), and snapshot-scoping is honored.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.plugin_param import (
    list_plugin_param_bindings_for_param,
    list_plugin_param_bindings_for_snapshot,
    make_consumer_id,
    make_create_payload,
    parse_consumer_id,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'plugin-param.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- consumer_id format ----------


def test_make_consumer_id_simple_uri():
    assert make_consumer_id(chain_id=1, plugin_uri="map2:fx:eq", param_index=2) == "1:map2:fx:eq:2"


def test_make_consumer_id_lv2_url_with_colons():
    cid = make_consumer_id(
        chain_id=3, plugin_uri="http://lv2plug.in/plugins/eg-amp", param_index=7
    )
    assert cid == "3:http://lv2plug.in/plugins/eg-amp:7"


def test_parse_consumer_id_round_trip_simple():
    cid = make_consumer_id(chain_id=1, plugin_uri="map2:fx:eq", param_index=2)
    chain_id, uri, param = parse_consumer_id(cid)
    assert (chain_id, uri, param) == (1, "map2:fx:eq", 2)


def test_parse_consumer_id_round_trip_lv2():
    cid = make_consumer_id(
        chain_id=3, plugin_uri="http://lv2plug.in/plugins/eg-amp", param_index=7
    )
    chain_id, uri, param = parse_consumer_id(cid)
    assert (chain_id, uri, param) == (3, "http://lv2plug.in/plugins/eg-amp", 7)


def test_parse_consumer_id_rejects_malformed():
    with pytest.raises(ValueError):
        parse_consumer_id("no_colons_at_all")
    with pytest.raises(ValueError):
        parse_consumer_id("only_one:colon")
    with pytest.raises(ValueError):
        parse_consumer_id("not_an_int:plugin:also_not_an_int")


# ---------- payload shaping ----------


def test_payload_for_cc_binding():
    payload = make_create_payload(
        chain_id=1,
        plugin_uri="map2:fx:eq",
        param_index=0,
        snapshot_id=42,
        source_type="midi_cc",
        channel=0,
        cc=7,
    )
    assert payload.consumer_type == "plugin_param"
    assert payload.consumer_id == "1:map2:fx:eq:0"
    assert payload.scope == "snapshot"
    assert payload.scope_id == "42"
    assert payload.source_type == "midi_cc"
    assert payload.source_descriptor == {"channel": 0, "cc": 7}
    assert payload.target_type == "engine_param"
    assert payload.target_descriptor == {
        "chain_id": 1,
        "plugin_uri": "map2:fx:eq",
        "param_index": 0,
    }


def test_payload_with_curve_and_range():
    payload = make_create_payload(
        chain_id=2,
        plugin_uri="map2:fx:nam",
        param_index=3,
        snapshot_id=99,
        source_type="midi_cc",
        channel=1,
        cc=11,
        curve="exponential",
        range_min=-12.0,
        range_max=12.0,
    )
    assert payload.source_descriptor == {
        "channel": 1,
        "cc": 11,
        "curve": "exponential",
        "min": -12.0,
        "max": 12.0,
    }


def test_payload_with_feedback_cc_and_label():
    payload = make_create_payload(
        chain_id=1,
        plugin_uri="map2:fx:eq",
        param_index=0,
        snapshot_id=42,
        source_type="midi_cc",
        channel=0,
        cc=7,
        feedback_cc=8,
        parameter_label="Low Gain",
    )
    assert payload.target_descriptor["feedback_cc"] == 8
    assert payload.target_descriptor["parameter_label"] == "Low Gain"
    assert "Low Gain" in payload.consumer_label
    assert "42" in payload.consumer_label


def test_payload_for_note_binding():
    payload = make_create_payload(
        chain_id=1,
        plugin_uri="map2:fx:gate",
        param_index=0,
        snapshot_id=42,
        source_type="midi_note",
        channel=0,
        note=60,
    )
    assert payload.source_type == "midi_note"
    assert payload.source_descriptor == {"channel": 0, "note": 60}


def test_payload_extras_pass_through_metadata():
    payload = make_create_payload(
        chain_id=1,
        plugin_uri="map2:fx:eq",
        param_index=0,
        snapshot_id=42,
        source_type="midi_cc",
        channel=0,
        cc=7,
        extras={"vendor_curve": "custom_a", "fade_ms": 50},
    )
    assert payload.metadata["extra"]["vendor_curve"] == "custom_a"
    assert payload.metadata["extra"]["fade_ms"] == 50


def test_provenance_defaults_to_snapshot_editor():
    payload = make_create_payload(
        chain_id=1,
        plugin_uri="map2:fx:eq",
        param_index=0,
        snapshot_id=42,
        source_type="midi_cc",
        channel=0,
        cc=7,
    )
    assert payload.created_by == "snapshot-editor"
    assert payload.source == "snapshot-editor"


# ---------- DB-backed listings ----------


def test_list_plugin_param_bindings_for_snapshot_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # Snapshot 42: 2 plugin_param bindings + 1 snapshot-action binding
            await authority.create(
                make_create_payload(
                    chain_id=1, plugin_uri="map2:fx:eq", param_index=0,
                    snapshot_id=42, source_type="midi_cc", channel=0, cc=7,
                )
            )
            await authority.create(
                make_create_payload(
                    chain_id=1, plugin_uri="map2:fx:eq", param_index=1,
                    snapshot_id=42, source_type="midi_cc", channel=0, cc=8,
                )
            )
            from app.services.midi.projections.snapshot import (
                legacy_entry_to_create_payload,
            )
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 9, "action": "ab-toggle"},
                    snapshot_id=42, legacy_entry_index=0,
                )
            )
            # Snapshot 99: 1 plugin_param binding
            await authority.create(
                make_create_payload(
                    chain_id=2, plugin_uri="map2:fx:nam", param_index=0,
                    snapshot_id=99, source_type="midi_cc", channel=0, cc=7,
                )
            )
            await session.commit()

            for_42 = await list_plugin_param_bindings_for_snapshot(authority, 42)
            for_99 = await list_plugin_param_bindings_for_snapshot(authority, 99)
            # Snapshot 42 has 2 plugin_param bindings (the snapshot
            # consumer binding is filtered OUT — different consumer_type).
            assert len(for_42) == 2
            assert len(for_99) == 1
            assert all(b.consumer_type == "plugin_param" for b in for_42)

    asyncio.run(_run())


def test_list_plugin_param_bindings_for_param_across_snapshots(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(
                    chain_id=1, plugin_uri="map2:fx:eq", param_index=0,
                    snapshot_id=42, source_type="midi_cc", channel=0, cc=7,
                )
            )
            await authority.create(
                make_create_payload(
                    chain_id=1, plugin_uri="map2:fx:eq", param_index=0,
                    snapshot_id=99, source_type="midi_cc", channel=0, cc=7,
                )
            )
            await session.commit()

            for_param = await list_plugin_param_bindings_for_param(
                authority, chain_id=1, plugin_uri="map2:fx:eq", param_index=0,
            )
            # Same param bound across two snapshots.
            assert len(for_param) == 2
            scope_ids = {b.scope_id for b in for_param}
            assert scope_ids == {"42", "99"}

    asyncio.run(_run())
