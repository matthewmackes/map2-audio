import asyncio
from unittest.mock import patch

from app import database as database_module
from app.database import MIDIDeviceConfig, get_session
from sqlalchemy import select
from app.services.midi_hub.device_registry import MidiDeviceRegistry, MidiDeviceProfile
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-registry.db'}")


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
