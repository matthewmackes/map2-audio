"""T2482-P2.5 parts 1 + 2: device-pack defaults projection tests."""

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
    payloads_for_profile,
    project_all_packs,
    replace_device_pack_defaults,
    yaml_control_to_payload,
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


# ---------- Part 2: YAML → payload converter ----------


def test_yaml_control_note_on():
    """0x90 (note on, channel 0) + midino 36 → midi_note source on ch 0."""
    payload = yaml_control_to_payload(
        profile_key="native-instruments/maschine-mk1.midi",
        control={
            "status": 0x90,
            "midino": 36,
            "script": "MaschineMK1.pad_1",
            "description": "Pad 1.",
        },
    )
    assert payload is not None
    assert payload.source_type == "midi_note"
    assert payload.source_descriptor == {"channel": 0, "note": 36}
    assert payload.target_type == "engine_command"
    assert payload.target_descriptor["kind"] == "script"
    assert payload.target_descriptor["script"] == "MaschineMK1.pad_1"
    assert payload.consumer_label == "Pad 1."


def test_yaml_control_cc_with_explicit_target():
    """0xB0 (CC, channel 0) + target+action → engine_target binding."""
    payload = yaml_control_to_payload(
        profile_key="edirol-ua/ua-1000.midi",
        control={
            "status": 0xB0,
            "midino": 64,
            "target": "audio.chain.1.bypass",
            "action": "toggle",
            "fast_path": True,
        },
    )
    assert payload is not None
    assert payload.source_type == "midi_cc"
    assert payload.source_descriptor == {"channel": 0, "cc": 64}
    assert payload.target_descriptor["kind"] == "engine_target"
    assert payload.target_descriptor["target"] == "audio.chain.1.bypass"
    assert payload.target_descriptor["action"] == "toggle"
    assert payload.target_descriptor["fast_path"] is True


def test_yaml_control_channel_in_status_low_nibble():
    """Channel 9 → status 0x99 (note on ch9)."""
    payload = yaml_control_to_payload(
        profile_key="x/y.midi",
        control={"status": 0x99, "midino": 60, "target": "audio.foo"},
    )
    assert payload is not None
    assert payload.source_descriptor == {"channel": 9, "note": 60}


def test_yaml_control_program_change_has_no_midino():
    """0xC0 (PC) lacks midino; descriptor has only channel."""
    payload = yaml_control_to_payload(
        profile_key="edirol-ua/ua-1000.midi",
        control={
            "status": 0xC0,
            "target": "audio.snapshot.recall",
            "action": "send_pc",
        },
    )
    assert payload is not None
    assert payload.source_type == "midi_pc"
    assert payload.source_descriptor == {"channel": 0}
    assert "note" not in payload.source_descriptor
    assert "cc" not in payload.source_descriptor


def test_yaml_control_accepts_hex_string_status():
    """Some packs store status as a hex string; the converter coerces."""
    payload = yaml_control_to_payload(
        profile_key="x/y.midi",
        control={"status": "0xB0", "midino": 7},
    )
    assert payload is not None
    assert payload.source_type == "midi_cc"


def test_yaml_control_missing_status_returns_none():
    assert yaml_control_to_payload(
        profile_key="x/y.midi", control={"midino": 60}
    ) is None


def test_yaml_control_unknown_status_returns_none():
    # 0xF0 (sysex) isn't in the channel-voice table.
    assert yaml_control_to_payload(
        profile_key="x/y.midi", control={"status": 0xF0, "midino": 0}
    ) is None


def test_yaml_control_unbound_when_no_target_or_script():
    payload = yaml_control_to_payload(
        profile_key="x/y.midi",
        control={"status": 0xB0, "midino": 7, "description": "Wheel"},
    )
    assert payload is not None
    assert payload.target_descriptor["kind"] == "unbound"


def test_yaml_control_label_falls_back_to_synthetic():
    payload = yaml_control_to_payload(
        profile_key="x/y.midi",
        control={"status": 0xB0, "midino": 42},
    )
    assert payload is not None
    assert "status=0xB0" in payload.consumer_label
    assert "midino=42" in payload.consumer_label


def test_payloads_for_profile_skips_bad_entries():
    document = {
        "controls": [
            {"status": 0x90, "midino": 36, "target": "a"},   # good
            "not-a-dict",                                      # skipped
            {"midino": 60},                                    # no status → skipped
            {"status": 0xB0, "midino": 7, "target": "b"},   # good
        ]
    }
    payloads = payloads_for_profile(
        profile_key="x/y.midi",
        document=document,
    )
    assert len(payloads) == 2


def test_payloads_for_profile_empty_controls():
    assert payloads_for_profile(profile_key="x/y.midi", document={}) == []
    assert payloads_for_profile(
        profile_key="x/y.midi", document={"controls": None}
    ) == []


# ---------- Part 2: project_all_packs walker ----------


class _FakePack:
    def __init__(self, manifest):
        self.manifest = manifest


class _FakeProfile:
    def __init__(self, pack_id, model, kind, document):
        self.pack_id = pack_id
        self.model = model
        self.kind = kind
        self.document = document


class _FakeRegistry:
    """Duck-typed stand-in for ProfileRegistry — only the methods
    project_all_packs touches need to exist."""

    def __init__(self, profiles, packs=None):
        self._profiles = list(profiles)
        self._packs = packs or {}

    def profiles(self, kind=None):
        if kind is None:
            return tuple(self._profiles)
        return tuple(p for p in self._profiles if p.kind == kind)

    def get_pack(self, pack_id):
        return self._packs.get(pack_id)


def test_project_all_packs_writes_rows_per_profile(tmp_path):
    _init_temp_db(tmp_path)

    registry = _FakeRegistry(
        profiles=[
            _FakeProfile(
                pack_id="native-instruments",
                model="maschine-mk1",
                kind="midi",
                document={
                    "controls": [
                        {"status": 0x90, "midino": 36, "target": "pad.1"},
                        {"status": 0x90, "midino": 37, "target": "pad.2"},
                    ]
                },
            ),
            _FakeProfile(
                pack_id="edirol-ua",
                model="ua-1000",
                kind="midi",
                document={
                    "controls": [
                        {"status": 0xB0, "midino": 64, "target": "bypass"},
                    ]
                },
            ),
            # An audio profile must be ignored.
            _FakeProfile(
                pack_id="edirol-ua",
                model="ua-1000",
                kind="audio",
                document={"controls": [{"status": 0x90, "midino": 99}]},
            ),
        ],
        packs={
            "native-instruments": _FakePack({"version": "1.0.0"}),
            "edirol-ua": _FakePack({}),
        },
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            summary = await project_all_packs(authority, registry)
            await session.commit()

            assert summary == {
                "native-instruments/maschine-mk1.midi": 2,
                "edirol-ua/ua-1000.midi": 1,
            }
            all_defaults = await list_all_device_pack_defaults(authority)
            assert len(all_defaults) == 3
            # Pack version flows into metadata when present.
            maschine = await list_device_pack_defaults(
                authority, "native-instruments/maschine-mk1.midi"
            )
            assert all(b.metadata.get("pack_version") == "1.0.0" for b in maschine)

    asyncio.run(_run())


def test_project_all_packs_is_idempotent(tmp_path):
    """Running twice in a row leaves the same row set — re-projection
    replaces, never duplicates."""
    _init_temp_db(tmp_path)

    registry = _FakeRegistry(
        profiles=[
            _FakeProfile(
                pack_id="x",
                model="y",
                kind="midi",
                document={
                    "controls": [
                        {"status": 0x90, "midino": 36, "target": "a"},
                        {"status": 0x90, "midino": 37, "target": "b"},
                    ]
                },
            ),
        ],
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await project_all_packs(authority, registry)
            await session.commit()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await project_all_packs(authority, registry)
            await session.commit()
            rows = await list_device_pack_defaults(authority, "x/y.midi")
            assert len(rows) == 2

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
