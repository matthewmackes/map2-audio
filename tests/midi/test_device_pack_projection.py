"""T2482-P2.5 part 1: device-pack defaults projection tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.device_pack import (
    list_all_device_pack_defaults,
    list_device_pack_defaults,
    make_consumer_id,
    make_create_payload,
    replace_device_pack_defaults,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'device-pack.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- consumer_id format ----------


def test_make_consumer_id_uses_profile_key_directly():
    assert make_consumer_id("native-instruments/maschine-mk1.midi") == (
        "native-instruments/maschine-mk1.midi"
    )


def test_make_consumer_id_strips_whitespace():
    assert make_consumer_id("  native-instruments/maschine-mk1.midi  ") == (
        "native-instruments/maschine-mk1.midi"
    )


def test_make_consumer_id_rejects_empty():
    with pytest.raises(ValueError):
        make_consumer_id("")
    with pytest.raises(ValueError):
        make_consumer_id("   ")


# ---------- payload shaping ----------


def test_payload_basic_shape():
    p = make_create_payload(
        profile_key="native-instruments/maschine-mk1.midi",
        binding_label="Pad 1 → ch10 note 36",
        source_type="midi_note",
        source_descriptor={"channel": 9, "note": 36},
        target_type="engine_command",
        target_descriptor={"command": "trigger_pad", "pad": 1},
    )
    assert p.consumer_type == "device_pack"
    assert p.consumer_id == "native-instruments/maschine-mk1.midi"
    assert p.scope == "global"
    assert p.consumer_label == "Pad 1 → ch10 note 36"
    assert p.source_type == "midi_note"
    assert p.source_descriptor == {"channel": 9, "note": 36}
    assert p.target_type == "engine_command"
    assert p.target_descriptor == {"command": "trigger_pad", "pad": 1}


def test_payload_convenience_descriptor_population():
    """When source_descriptor is empty and channel/cc/note are passed,
    the helper populates the descriptor."""
    p = make_create_payload(
        profile_key="meloaudio/midi-commander.midi",
        binding_label="Btn 1",
        source_type="midi_cc",
        source_descriptor={},
        target_type="engine_command",
        target_descriptor={"command": "snapshot_select", "index": 1},
        channel=0,
        cc=20,
    )
    assert p.source_descriptor == {"channel": 0, "cc": 20}


def test_payload_explicit_descriptor_takes_precedence():
    p = make_create_payload(
        profile_key="meloaudio/midi-commander.midi",
        binding_label="Btn 1",
        source_type="midi_cc",
        source_descriptor={"channel": 5, "cc": 99},
        target_type="engine_command",
        target_descriptor={"command": "snapshot_select"},
        channel=0,  # would be ignored
        cc=20,  # would be ignored
    )
    assert p.source_descriptor == {"channel": 5, "cc": 99}


def test_payload_pack_version_in_metadata():
    p = make_create_payload(
        profile_key="meloaudio/midi-commander.midi",
        binding_label="Btn 1",
        source_type="midi_cc",
        source_descriptor={"channel": 0, "cc": 20},
        target_type="engine_command",
        target_descriptor={"command": "snapshot_select"},
        pack_version="1.2.0",
    )
    assert p.metadata["pack_version"] == "1.2.0"


def test_payload_provenance_defaults():
    p = make_create_payload(
        profile_key="meloaudio/midi-commander.midi",
        binding_label="Btn 1",
        source_type="midi_cc",
        source_descriptor={"channel": 0, "cc": 20},
        target_type="engine_command",
        target_descriptor={},
    )
    assert p.created_by == "device-pack-projection"
    assert p.source == "pack-yaml"


# ---------- DB-backed listing ----------


def test_list_for_specific_pack(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(
                    profile_key="native-instruments/maschine-mk1.midi",
                    binding_label="Pad 1",
                    source_type="midi_note",
                    source_descriptor={"channel": 9, "note": 36},
                    target_type="engine_command",
                    target_descriptor={"command": "trigger_pad", "pad": 1},
                )
            )
            await authority.create(
                make_create_payload(
                    profile_key="meloaudio/midi-commander.midi",
                    binding_label="Btn 1",
                    source_type="midi_cc",
                    source_descriptor={"channel": 0, "cc": 20},
                    target_type="engine_command",
                    target_descriptor={"command": "snapshot_select"},
                )
            )
            await session.commit()
            for_maschine = await list_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi"
            )
            for_commander = await list_device_pack_defaults(
                authority, "meloaudio/midi-commander.midi"
            )
            assert len(for_maschine) == 1
            assert len(for_commander) == 1
            assert for_maschine[0].consumer_label == "Pad 1"

    asyncio.run(_run())


def test_list_all_returns_every_pack_default(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            for i in range(3):
                await authority.create(
                    make_create_payload(
                        profile_key="native-instruments/maschine-mk1.midi",
                        binding_label=f"Pad {i}",
                        source_type="midi_note",
                        source_descriptor={"channel": 9, "note": 36 + i},
                        target_type="engine_command",
                        target_descriptor={"command": "trigger_pad", "pad": i},
                    )
                )
            for i in range(2):
                await authority.create(
                    make_create_payload(
                        profile_key="meloaudio/midi-commander.midi",
                        binding_label=f"Btn {i}",
                        source_type="midi_cc",
                        source_descriptor={"channel": 0, "cc": 20 + i},
                        target_type="engine_command",
                        target_descriptor={"command": "snapshot_select"},
                    )
                )
            await session.commit()
            all_defaults = await list_all_device_pack_defaults(authority)
            assert len(all_defaults) == 5

    asyncio.run(_run())


def test_replace_replaces_set_atomically(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # Initial set: 3 pads
            for i in range(3):
                await authority.create(
                    make_create_payload(
                        profile_key="native-instruments/maschine-mk1.midi",
                        binding_label=f"Pad {i}",
                        source_type="midi_note",
                        source_descriptor={"channel": 9, "note": 36 + i},
                        target_type="engine_command",
                        target_descriptor={"command": "trigger_pad", "pad": i},
                    )
                )
            await session.commit()
            assert len(await list_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi"
            )) == 3

            # Replace with 2 different pads
            new_payloads = [
                make_create_payload(
                    profile_key="native-instruments/maschine-mk1.midi",
                    binding_label=f"NewPad {i}",
                    source_type="midi_note",
                    source_descriptor={"channel": 9, "note": 50 + i},
                    target_type="engine_command",
                    target_descriptor={"command": "trigger_pad", "pad": i},
                )
                for i in range(2)
            ]
            replaced = await replace_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi", new_payloads
            )
            await session.commit()
            assert len(replaced) == 2
            current = await list_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi"
            )
            assert len(current) == 2
            labels = {b.consumer_label for b in current}
            assert labels == {"NewPad 0", "NewPad 1"}

    asyncio.run(_run())


def test_replace_does_not_touch_other_packs(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                make_create_payload(
                    profile_key="native-instruments/maschine-mk1.midi",
                    binding_label="Pad 1",
                    source_type="midi_note",
                    source_descriptor={"channel": 9, "note": 36},
                    target_type="engine_command",
                    target_descriptor={"command": "trigger_pad"},
                )
            )
            await authority.create(
                make_create_payload(
                    profile_key="meloaudio/midi-commander.midi",
                    binding_label="Btn 1",
                    source_type="midi_cc",
                    source_descriptor={"channel": 0, "cc": 20},
                    target_type="engine_command",
                    target_descriptor={"command": "snapshot_select"},
                )
            )
            await session.commit()
            # Replace Maschine's set with empty
            await replace_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi", []
            )
            await session.commit()
            assert await list_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi"
            ) == []
            assert len(await list_device_pack_defaults(
                authority, "meloaudio/midi-commander.midi"
            )) == 1

    asyncio.run(_run())
