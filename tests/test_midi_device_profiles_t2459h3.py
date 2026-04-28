from __future__ import annotations

import pytest

from app.services.midi_commander_surface.protocol import MIDI_COMMANDER_PROFILE_ID
from app.services.midi_device_profiles import MIDIDeviceProfileService


class _FakeMidiService:
    def __init__(self) -> None:
        self.commands = []

    async def create_command(self, dto, _session) -> int:
        self.commands.append(dto)
        return len(self.commands)


@pytest.mark.asyncio
async def test_meloaudio_profile_loads_from_device_pack() -> None:
    service = MIDIDeviceProfileService()

    profile = service.get_profile(MIDI_COMMANDER_PROFILE_ID)

    assert profile is not None
    assert profile["profile_id"] == MIDI_COMMANDER_PROFILE_ID
    assert profile["manufacturer"] == "MeloAudio"
    assert {entry["switch_id"] for entry in profile["footswitches"]} >= {"A", "B", "C", "D", "1", "2", "3", "4"}
    assert {entry["pedal_id"] for entry in profile["expression_pedals"]} == {"EXP1", "EXP2"}
    assert profile["bank_config"]["enabled"] is True


@pytest.mark.asyncio
async def test_legacy_meloaudio_profile_id_alias_resolves() -> None:
    service = MIDIDeviceProfileService()

    legacy = service.get_profile("meloaudio_commander")

    assert legacy is not None
    assert legacy["profile_id"] == MIDI_COMMANDER_PROFILE_ID
    assert legacy["profile_id_canonical"] == MIDI_COMMANDER_PROFILE_ID


@pytest.mark.asyncio
async def test_apply_profile_accepts_legacy_alias_and_emits_expected_commands() -> None:
    service = MIDIDeviceProfileService()
    fake_midi = _FakeMidiService()
    service.set_midi_service(fake_midi)

    result = await service.apply_profile("meloaudio_commander", session=object(), clear_existing=False)

    assert result["profile_id"] == "meloaudio_commander"
    assert result["profile_id_canonical"] == MIDI_COMMANDER_PROFILE_ID
    assert result["commands_created"] == 7
    assert result["expression_configs"] == 2

    command_names = {cmd.name for cmd in fake_midi.commands}
    assert "PC0 → Chain 1" in command_names
    assert "PC1 → Chain 2" in command_names
    assert "CC80 → Toggle Slot 1" in command_names
    assert "CC81 → Toggle Slot 2" in command_names
    assert "CC82 → Toggle Slot 3" in command_names

    active = service.get_active_profile()
    assert active is not None
    assert active["profile_id"] == "meloaudio_commander"
    assert active["profile_id_canonical"] == MIDI_COMMANDER_PROFILE_ID


@pytest.mark.asyncio
async def test_meloaudio_profile_detection_returns_canonical_id() -> None:
    service = MIDIDeviceProfileService()

    profile_id = await service.detect_device("MeloAudio MIDI Commander USB")

    assert profile_id == MIDI_COMMANDER_PROFILE_ID
