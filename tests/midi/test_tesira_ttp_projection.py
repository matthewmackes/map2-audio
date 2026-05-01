"""T2482-P2.6 part 3: Tesira TTP bridge projection tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.tesira_ttp import (
    list_tesira_ttp_bindings,
    make_consumer_id,
    make_midi_to_ttp_payload,
    make_ttp_to_midi_payload,
    parse_consumer_id,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'tesira-ttp.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- consumer_id format ----------


def test_make_consumer_id_simple():
    assert make_consumer_id(instance_tag="DanteOut1", attribute_path="level") == "ttp:DanteOut1:level"


def test_make_consumer_id_with_dotted_attribute_path():
    assert (
        make_consumer_id(instance_tag="Mixer1", attribute_path="input.1.gain")
        == "ttp:Mixer1:input.1.gain"
    )


def test_make_consumer_id_rejects_colons_in_instance_tag():
    with pytest.raises(ValueError):
        make_consumer_id(instance_tag="Bad:Tag", attribute_path="level")


def test_make_consumer_id_rejects_empty():
    with pytest.raises(ValueError):
        make_consumer_id(instance_tag="", attribute_path="level")
    with pytest.raises(ValueError):
        make_consumer_id(instance_tag="DanteOut1", attribute_path="")


def test_parse_consumer_id_round_trip():
    cid = make_consumer_id(instance_tag="Mixer1", attribute_path="input.1.gain")
    assert parse_consumer_id(cid) == ("Mixer1", "input.1.gain")


def test_parse_consumer_id_rejects_malformed():
    with pytest.raises(ValueError):
        parse_consumer_id("not_ttp:Mixer1:level")
    with pytest.raises(ValueError):
        parse_consumer_id("ttp:no_attribute_path")
    with pytest.raises(ValueError):
        parse_consumer_id("ttp::missing_tag")


# ---------- payload shaping ----------


def test_midi_to_ttp_payload():
    p = make_midi_to_ttp_payload(
        instance_tag="DanteOut1",
        attribute_path="level",
        source_type="midi_cc",
        channel=0,
        cc=7,
        range_min=-60.0,
        range_max=12.0,
        curve="exponential",
    )
    assert p.consumer_type == "tesira_ttp"
    assert p.consumer_id == "ttp:DanteOut1:level"
    assert p.scope == "global"
    assert p.source_type == "midi_cc"
    assert p.source_descriptor["channel"] == 0
    assert p.source_descriptor["cc"] == 7
    assert p.source_descriptor["min"] == -60.0
    assert p.source_descriptor["max"] == 12.0
    assert p.source_descriptor["curve"] == "exponential"
    assert p.target_type == "device_command"
    assert p.target_descriptor["instance_tag"] == "DanteOut1"
    assert p.target_descriptor["attribute_path"] == "level"
    assert p.target_descriptor["direction"] == "midi_to_ttp"


def test_ttp_to_midi_payload_cc():
    p = make_ttp_to_midi_payload(
        instance_tag="DanteOut1",
        attribute_path="level",
        midi_channel=0,
        midi_cc=7,
        range_min=-60.0,
        range_max=12.0,
    )
    assert p.consumer_type == "tesira_ttp"
    assert p.source_type == "ttp_subscription"
    assert p.source_descriptor["instance_tag"] == "DanteOut1"
    assert p.source_descriptor["attribute_path"] == "level"
    assert p.source_descriptor["direction"] == "ttp_to_midi"
    assert p.source_descriptor["min"] == -60.0
    assert p.target_descriptor == {"channel": 0, "cc": 7}


def test_ttp_to_midi_payload_note():
    p = make_ttp_to_midi_payload(
        instance_tag="DanteOut1",
        attribute_path="mute",
        midi_channel=2,
        midi_note=60,
    )
    assert p.target_descriptor == {"channel": 2, "note": 60}


def test_ttp_to_midi_requires_cc_or_note():
    with pytest.raises(ValueError):
        make_ttp_to_midi_payload(
            instance_tag="DanteOut1",
            attribute_path="level",
            midi_channel=0,
        )


def test_extras_pass_through_metadata():
    p = make_midi_to_ttp_payload(
        instance_tag="DanteOut1",
        attribute_path="level",
        source_type="midi_cc",
        channel=0,
        cc=7,
        extras={"vendor_smoothing_ms": 25},
    )
    assert p.metadata["extra"]["vendor_smoothing_ms"] == 25


# ---------- DB-backed listing ----------


def test_list_unfiltered(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_ttp_payload(
                    instance_tag="DanteOut1",
                    attribute_path="level",
                    source_type="midi_cc",
                    channel=0,
                    cc=7,
                )
            )
            await authority.create(
                make_ttp_to_midi_payload(
                    instance_tag="Mixer1",
                    attribute_path="output.1.peak",
                    midi_channel=0,
                    midi_cc=8,
                )
            )
            await session.commit()
            all_ttp = await list_tesira_ttp_bindings(authority)
            assert len(all_ttp) == 2

    asyncio.run(_run())


def test_list_filtered_by_instance_tag(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_ttp_payload(
                    instance_tag="DanteOut1",
                    attribute_path="level",
                    source_type="midi_cc",
                    channel=0,
                    cc=7,
                )
            )
            await authority.create(
                make_midi_to_ttp_payload(
                    instance_tag="Mixer1",
                    attribute_path="input.1.gain",
                    source_type="midi_cc",
                    channel=0,
                    cc=8,
                )
            )
            await session.commit()
            for_dante = await list_tesira_ttp_bindings(authority, instance_tag="DanteOut1")
            for_mixer = await list_tesira_ttp_bindings(authority, instance_tag="Mixer1")
            assert len(for_dante) == 1
            assert len(for_mixer) == 1

    asyncio.run(_run())


def test_list_filtered_by_direction(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_midi_to_ttp_payload(
                    instance_tag="DanteOut1",
                    attribute_path="level",
                    source_type="midi_cc",
                    channel=0,
                    cc=7,
                )
            )
            await authority.create(
                make_ttp_to_midi_payload(
                    instance_tag="DanteOut1",
                    attribute_path="meter",
                    midi_channel=0,
                    midi_cc=8,
                )
            )
            await session.commit()
            into_ttp = await list_tesira_ttp_bindings(authority, direction="midi_to_ttp")
            from_ttp = await list_tesira_ttp_bindings(authority, direction="ttp_to_midi")
            assert len(into_ttp) == 1
            assert len(from_ttp) == 1

    asyncio.run(_run())
