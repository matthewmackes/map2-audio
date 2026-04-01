import asyncio
from unittest.mock import patch

import pytest

from app import database as database_module
from app.database import MIDIDeviceConfig, get_session
from sqlalchemy import select
from app.services.midi_hub.device_registry import MidiDeviceRegistry, MidiDeviceProfile
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort


def _init_temp_db(tmp_path):
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-registry.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_registry_profile_matching_and_custom_profile(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)

        custom = MidiDeviceProfile(
            profile_id="my_controller",
            name="My Controller",
            match_patterns=["my ctrl"],
            default_channel=2,
            supports_sysex=False,
        )
        registry.add_custom_profile(custom)

        port = VirtualMidiPort(port_id="p1", name="My CTRL Surface")
        hub.register_port(port)

        payload = await registry.refresh()
        assert payload["count"] == 1
        device = payload["devices"][0]
        assert device["profile_id"] == "my_controller"

        async with get_session(read_only=True) as session:
            rows = (await session.execute(select(MIDIDeviceConfig))).scalars().all()
            assert len(rows) == 1
            assert rows[0].device_name.startswith("my_controller:")

    asyncio.run(_run())


def test_registry_emits_online_and_offline_deltas(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)

        port = VirtualMidiPort(port_id="p1", name="Lexicon MPX1")
        hub.register_port(port)

        first = await registry.refresh()
        assert first["online_events"]

        hub.unregister_port("p1")
        second = await registry.refresh()
        assert second["count"] == 0
        assert second["offline_events"]

    asyncio.run(_run())


def test_registry_manual_assignment_persistence(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)
        hub.register_port(VirtualMidiPort(port_id="p1", name="USB MIDI Cable"))

        await registry.assign_port(port_name="USB MIDI Cable", device_id="lexicon_mpx1:main")
        refreshed = await registry.refresh()
        assert refreshed["count"] == 1
        assert refreshed["devices"][0]["device_id"] == "lexicon_mpx1:main"
        assert refreshed["devices"][0]["manual_assignment"] == "USB MIDI Cable"

        async with get_session(read_only=True) as session:
            rows = (await session.execute(select(MIDIDeviceConfig))).scalars().all()
            assignment_rows = [row for row in rows if row.device_type == "assignment"]
            assert len(assignment_rows) == 1

    asyncio.run(_run())


def test_registry_vid_pid_profile_match(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)
        registry.add_custom_profile(
            MidiDeviceProfile(
                profile_id="vid_pid_profile",
                name="VIDPID Profile",
                match_patterns=["nope"],
                usb_vid_pid=["1234:abcd"],
                supports_sysex=True,
            )
        )
        hub.register_port(VirtualMidiPort(port_id="p1", name="Unknown MIDI Device"))

        with patch(
            "app.services.midi_hub.device_registry.discover_alsa_port_descriptors",
            return_value=[
                {
                    "name": "Unknown MIDI Device",
                    "direction": "duplex",
                    "vendor_id": "1234",
                    "product_id": "abcd",
                }
            ],
        ):
            refreshed = await registry.refresh()

        assert refreshed["count"] == 1
        assert refreshed["devices"][0]["profile_id"] == "vid_pid_profile"

    asyncio.run(_run())


def test_registry_builtin_midisport_profile_matches_name(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)
        hub.register_port(VirtualMidiPort(port_id="p1", name="M-Audio MIDISPORT 4x4 Port A"))

        refreshed = await registry.refresh()

        assert refreshed["count"] == 1
        assert refreshed["devices"][0]["profile_id"] == "m_audio_midisport_4x4"
        assert refreshed["devices"][0]["profile_name"] == "M-Audio MIDISPORT 4x4"

    asyncio.run(_run())


def test_registry_builtin_maschine_profile_matches_name_and_vid_pid(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)
        hub.register_port(VirtualMidiPort(port_id="p1", name="MAP2:Maschine-MK1"))

        with patch(
            "app.services.midi_hub.device_registry.discover_alsa_port_descriptors",
            return_value=[
                {
                    "name": "MAP2:Maschine-MK1",
                    "direction": "duplex",
                    "vendor_id": "17cc",
                    "product_id": "0808",
                }
            ],
        ):
            refreshed = await registry.refresh()

        assert refreshed["count"] == 1
        device = refreshed["devices"][0]
        assert device["profile_id"] == "maschine_mk1"

        profile = registry.get_profile("maschine_mk1")
        assert profile is not None
        assert profile["channels"] == [1, 2]
        assert profile["metadata"]["role"] == "control_surface"
        assert profile["metadata"]["virtual_port_name"] == "MAP2:Maschine-MK1"

    asyncio.run(_run())


def test_registry_merge_remote_devices_and_global_snapshot(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)

        hub.register_port(VirtualMidiPort(port_id="p1", name="Lexicon MPX1"))
        await registry.refresh()

        registry.merge_remote_devices(
            "NODE-B",
            [
                {
                    "device_id": "lexicon_mpx1:remote",
                    "profile_id": "lexicon_mpx1",
                    "profile_name": "Lexicon MPX1",
                    "port_ids": ["remote-1"],
                    "port_names": ["Lexicon MPX1 Port"],
                    "connected": True,
                    "responding": True,
                    "health": "online",
                }
            ],
        )

        snapshot = registry.get_global_snapshot()
        assert snapshot["count"] == 2
        assert snapshot["node_count"] == 2
        assert any(node["node_id"] == "NODE-B" for node in snapshot["nodes"])
        remote_devices = registry.get_node_devices("NODE-B")
        assert len(remote_devices) == 1
        assert remote_devices[0]["remote"] is True
        assert remote_devices[0]["node_id"] == "NODE-B"

    asyncio.run(_run())


def test_registry_remove_node_devices_marks_remote_entries_offline(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        registry = MidiDeviceRegistry(MidiHub(auto_discover_alsa=False))
        registry.merge_remote_devices(
            "NODE-B",
            [
                {
                    "device_id": "usb_din_adapter:remote",
                    "profile_id": "usb_din_adapter",
                    "profile_name": "Generic USB-to-DIN Adapter",
                    "port_ids": ["remote-1"],
                    "port_names": ["DIN A"],
                    "connected": True,
                    "responding": True,
                    "health": "online",
                }
            ],
        )

        removed = registry.remove_node_devices("NODE-B")
        remote_devices = registry.get_node_devices("NODE-B")

        assert removed == 1
        assert remote_devices[0]["connected"] is False
        assert remote_devices[0]["health"] == "offline"

    asyncio.run(_run())


def test_registry_find_equivalent_port_uses_profile_match(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        hub = MidiHub(auto_discover_alsa=False)
        registry = MidiDeviceRegistry(hub)
        hub.register_port(VirtualMidiPort(port_id="p1", name="Lexicon MPX1"))
        await registry.refresh()

        registry.merge_remote_devices(
            "NODE-B",
            [
                {
                    "device_id": "lexicon_mpx1:remote",
                    "profile_id": "lexicon_mpx1",
                    "profile_name": "Lexicon MPX1",
                    "port_ids": ["remote-1"],
                    "port_names": ["Rack Port"],
                    "connected": True,
                    "responding": True,
                    "health": "online",
                }
            ],
        )

        match = registry.find_equivalent_port("Lexicon MPX1", exclude_node_id=registry._local_node())
        assert match is not None
        assert match["node_id"] == "NODE-B"
        assert match["profile_id"] == "lexicon_mpx1"

    asyncio.run(_run())
