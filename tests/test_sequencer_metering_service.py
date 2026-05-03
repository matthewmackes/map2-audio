"""Tests for the per-slot Performance Sequencer ConsoleView metering service.

The service drives 16 channel-strip meters from real MIDI activity (note-on
velocity → excitation impulse, decayed over ~180ms) modulated by per-slot
fader and mute state. It ships through the WebSocket `sequencer_metering` topic
at 30 fps and is also exposed for polling fallback at
GET /api/engine/sequencer/metering.
"""

from __future__ import annotations

import time
from typing import Any
from unittest import mock

import pytest

from app.services.sequencer_metering_service import (
    SequencerMeteringService,
    SlotMeterReading,
    _MIN_DB,
)
from app.services.midi_hub.ports import MidiMessage


def _midi(data: bytes) -> MidiMessage:
    return MidiMessage(data=data, timestamp_ns=0, source_port="test")


def _slot(slot_id: int, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "slot_id": slot_id,
        "mode": "drum",
        "trigger_notes": [36 + slot_id],
        "key_low": 0,
        "key_high": 127,
        "level": 1.0,
        "mute": False,
    }
    base.update(overrides)
    return base


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch) -> SequencerMeteringService:
    svc = SequencerMeteringService()
    # Patch the brain-service slot lookup so tests don't need a fully
    # initialised SequencerService. The default 16 drum slots map
    # MIDI notes 36..51 to slots 0..15.
    fake_slots = [_slot(i) for i in range(16)]
    monkeypatch.setattr(
        "app.services.sequencer_metering_service.get_sequencer_service",
        lambda: mock.Mock(get_slots=lambda: fake_slots),
    )
    return svc


def test_idle_slots_report_minimum_db(service: SequencerMeteringService) -> None:
    readings = service.read_slot_meters()
    assert len(readings) == 16
    for r in readings:
        assert r.peak_db == _MIN_DB
        assert r.rms_db == _MIN_DB
        assert r.clipping is False


def test_note_on_excites_only_the_matching_slot(service: SequencerMeteringService) -> None:
    # Note 36 → slot 0 by the default drum mapping.
    service._on_midi(_midi(bytes([0x90, 36, 100])))
    readings = service.read_slot_meters()
    assert readings[0].peak_db > _MIN_DB
    assert readings[0].rms_db > _MIN_DB
    for other in readings[1:]:
        assert other.peak_db == _MIN_DB


def test_excitation_decays_to_floor(service: SequencerMeteringService) -> None:
    service._on_midi(_midi(bytes([0x90, 36, 127])))
    immediately = service.read_slot_meters()[0].peak_db
    assert immediately > -10  # full velocity → near 0 dBFS
    # Push the internal clock forward past the decay constant.
    state = service._states[0]
    state.last_update_ts -= 2.0
    later = service.read_slot_meters()[0].peak_db
    assert later == _MIN_DB


def test_velocity_zero_is_treated_as_note_off(service: SequencerMeteringService) -> None:
    service._on_midi(_midi(bytes([0x90, 36, 0])))
    readings = service.read_slot_meters()
    assert readings[0].peak_db == _MIN_DB


def test_muted_slot_reads_silent_even_after_excitation(service: SequencerMeteringService, monkeypatch: pytest.MonkeyPatch) -> None:
    service._on_midi(_midi(bytes([0x90, 36, 127])))
    # Re-patch the slot lookup to mute slot 0 between excitation and read.
    muted_slots = [_slot(0, mute=True), *(_slot(i) for i in range(1, 16))]
    monkeypatch.setattr(
        "app.services.sequencer_metering_service.get_sequencer_service",
        lambda: mock.Mock(get_slots=lambda: muted_slots),
    )
    readings = service.read_slot_meters()
    assert readings[0].peak_db == _MIN_DB
    assert readings[0].clipping is False


def test_fader_level_scales_peak(service: SequencerMeteringService, monkeypatch: pytest.MonkeyPatch) -> None:
    service._on_midi(_midi(bytes([0x90, 36, 127])))
    full_peak = service.read_slot_meters()[0].peak_db

    half_slots = [_slot(0, level=0.5), *(_slot(i) for i in range(1, 16))]
    monkeypatch.setattr(
        "app.services.sequencer_metering_service.get_sequencer_service",
        lambda: mock.Mock(get_slots=lambda: half_slots),
    )
    # Re-excite at full velocity so we can compare a truthful current read.
    service._on_midi(_midi(bytes([0x90, 36, 127])))
    half_peak = service.read_slot_meters()[0].peak_db
    # 0.5x linear amplitude → ~6 dB drop.
    assert half_peak < full_peak - 4.0
    assert half_peak > full_peak - 8.0


def test_clipping_flag_fires_at_zero_dbfs(service: SequencerMeteringService) -> None:
    service._on_midi(_midi(bytes([0x90, 36, 127])))
    reading = service.read_slot_meters()[0]
    # Velocity 127 + level 1.0 + fresh excitation should clip per the
    # service's documented contract.
    assert reading.peak_db >= 0.0
    assert reading.clipping is True


def test_chromatic_slot_keyrange_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    svc = SequencerMeteringService()
    chromatic_slots = [
        _slot(0, mode="chromatic", trigger_notes=[], key_low=60, key_high=72),
        _slot(1),
    ]
    monkeypatch.setattr(
        "app.services.sequencer_metering_service.get_sequencer_service",
        lambda: mock.Mock(get_slots=lambda: chromatic_slots),
    )
    svc._on_midi(_midi(bytes([0x90, 64, 90])))  # E4 in slot 0's range
    readings = svc.read_slot_meters()
    assert readings[0].peak_db > _MIN_DB
    assert readings[1].peak_db == _MIN_DB


def test_read_payload_shape(service: SequencerMeteringService) -> None:
    service._on_midi(_midi(bytes([0x90, 36, 90])))
    payload = service.read_payload()
    assert "running" in payload
    assert "slots" in payload
    assert len(payload["slots"]) == 16
    sample = payload["slots"][0]
    assert set(sample) == {"slot_id", "peak_db", "rms_db", "clipping"}
    assert isinstance(sample["peak_db"], float)
    assert isinstance(sample["clipping"], bool)


def test_short_or_non_note_on_messages_are_ignored(service: SequencerMeteringService) -> None:
    service._on_midi(_midi(b""))
    service._on_midi(_midi(bytes([0x90])))
    service._on_midi(_midi(bytes([0xB0, 7, 100])))  # CC, not note-on
    readings = service.read_slot_meters()
    for r in readings:
        assert r.peak_db == _MIN_DB
