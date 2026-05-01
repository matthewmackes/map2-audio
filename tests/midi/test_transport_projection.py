"""T2482-P2.6 part 1: transport projection tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.transport import (
    list_transport_bindings,
    make_create_payload,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'transport.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_make_payload_clock_binding():
    p = make_create_payload(
        consumer_id="clock", source_type="midi_clock", channel=0, role="master"
    )
    assert p.consumer_type == "transport"
    assert p.consumer_id == "clock"
    assert p.scope == "global"
    assert p.target_descriptor["transport_target"] == "clock"
    assert p.target_descriptor["role"] == "master"
    assert "master" in p.consumer_label


def test_make_payload_transport_control_binding():
    p = make_create_payload(
        consumer_id="transport-control",
        source_type="midi_cc",
        channel=0,
        cc=64,
        target_command="start",
    )
    assert p.consumer_id == "transport-control"
    assert p.source_descriptor == {"channel": 0, "cc": 64}
    assert p.target_descriptor["command"] == "start"
    assert "start" in p.consumer_label


def test_make_payload_song_position():
    p = make_create_payload(
        consumer_id="song-position", source_type="midi_pc", channel=0
    )
    assert p.consumer_id == "song-position"
    assert p.target_descriptor == {"transport_target": "song-position"}


def test_make_payload_mtc():
    p = make_create_payload(consumer_id="mtc", source_type="midi_clock")
    assert p.consumer_id == "mtc"


def test_make_payload_rejects_unknown_consumer_id():
    with pytest.raises(ValueError):
        make_create_payload(consumer_id="bogus-target", source_type="midi_clock")


def test_make_payload_extras_pass_through():
    p = make_create_payload(
        consumer_id="clock",
        source_type="midi_clock",
        extras={"jitter_filter": True, "ppqn": 24},
    )
    assert p.metadata["extra"]["jitter_filter"] is True
    assert p.metadata["extra"]["ppqn"] == 24


def test_make_payload_cc_descriptor_only_for_cc_source():
    """Setting cc=64 with source_type='midi_note' shouldn't put cc in
    source_descriptor — only note + channel."""
    p = make_create_payload(
        consumer_id="transport-control",
        source_type="midi_note",
        channel=0,
        note=60,
        cc=64,
        target_command="start",
    )
    assert "cc" not in p.source_descriptor
    assert p.source_descriptor == {"channel": 0, "note": 60}


# ---------- DB-backed listing ----------


def test_list_transport_bindings_unfiltered(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(consumer_id="clock", source_type="midi_clock", role="master")
            )
            await authority.create(
                make_create_payload(
                    consumer_id="transport-control",
                    source_type="midi_cc",
                    channel=0,
                    cc=64,
                    target_command="start",
                )
            )
            await session.commit()
            all_transport = await list_transport_bindings(authority)
            assert len(all_transport) == 2
            ids = {b.consumer_id for b in all_transport}
            assert ids == {"clock", "transport-control"}

    asyncio.run(_run())


def test_list_transport_bindings_filtered_by_consumer_id(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(consumer_id="clock", source_type="midi_clock", role="master")
            )
            await authority.create(
                make_create_payload(
                    consumer_id="transport-control",
                    source_type="midi_cc",
                    channel=0,
                    cc=64,
                    target_command="start",
                )
            )
            await authority.create(
                make_create_payload(
                    consumer_id="transport-control",
                    source_type="midi_cc",
                    channel=0,
                    cc=65,
                    target_command="stop",
                )
            )
            await session.commit()
            clocks = await list_transport_bindings(authority, consumer_id="clock")
            controls = await list_transport_bindings(authority, consumer_id="transport-control")
            assert len(clocks) == 1
            assert len(controls) == 2
            assert clocks[0].consumer_id == "clock"

    asyncio.run(_run())


def test_list_rejects_unknown_consumer_id_filter(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            with pytest.raises(ValueError):
                await list_transport_bindings(authority, consumer_id="bogus")

    asyncio.run(_run())
