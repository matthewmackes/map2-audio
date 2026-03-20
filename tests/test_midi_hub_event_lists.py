from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.midi_hub.event_list_service import MidiHubEventListService


class FakeHub:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []

    def send(self, *, source_port: str, destination_port: str, data: bytes, metadata=None) -> bool:
        self.sent.append(
            {
                "source_port": source_port,
                "destination_port": destination_port,
                "data": data,
                "metadata": metadata or {},
            }
        )
        return True


class FakePresetService:
    def __init__(self) -> None:
        self.recalled: list[str] = []

    async def recall_preset(self, preset_id: str):
        self.recalled.append(preset_id)
        return {"preset_id": preset_id}


class FakeMacroService:
    def __init__(self) -> None:
        self.triggered: list[tuple[str, dict[str, object]]] = []

    async def trigger_macro(self, macro_id: str, payload=None):
        self.triggered.append((macro_id, dict(payload or {})))
        return {"ok": True, "macro_id": macro_id}


def build_service(tmp_path) -> tuple[MidiHubEventListService, FakeHub, FakePresetService, FakeMacroService]:
    hub = FakeHub()
    preset_service = FakePresetService()
    macro_service = FakeMacroService()
    service = MidiHubEventListService(
        hub=hub,
        preset_service=preset_service,
        macro_service=macro_service,
        storage_path=tmp_path / "event-lists.json",
    )
    return service, hub, preset_service, macro_service


def test_event_list_and_event_crud(tmp_path):
    service, _hub, _preset_service, _macro_service = build_service(tmp_path)

    created = service.upsert_event_list(
        event_list_id="show-open",
        name="Show Open",
        list_type="mtc",
        source_id="internal",
        internal_clock_enabled=True,
        first_time="00:00:00:00",
        last_time="00:00:05:00",
        fps=30,
        timezone="UTC",
    )
    assert created["event_list_id"] == "show-open"
    assert service.list_event_lists()[0]["name"] == "Show Open"

    event = service.upsert_event(
        event_list_id="show-open",
        event_id="cue-1",
        order=1,
        time_address="00:00:01:00",
        action_type="RecallPreset",
        label="Cue 1",
        payload={"preset_id": "baseline"},
    )
    assert event["event_id"] == "cue-1"
    assert service.list_events("show-open")[0]["label"] == "Cue 1"

    assert service.delete_event("show-open", "cue-1") is True
    assert service.list_events("show-open") == []
    assert service.delete_event_list("show-open") is True
    assert service.list_event_lists() == []


@pytest.mark.asyncio
async def test_mtc_clock_tick_fires_recall_and_loops(tmp_path):
    service, _hub, preset_service, _macro_service = build_service(tmp_path)

    service.upsert_event_list(
        event_list_id="show-open",
        name="Show Open",
        list_type="mtc",
        source_id="internal",
        internal_clock_enabled=True,
        first_time="00:00:00:00",
        last_time="00:00:00:00",
        fps=30,
        timezone="UTC",
    )
    service.upsert_event(
        event_list_id="show-open",
        event_id="cue-1",
        order=1,
        time_address="00:00:00:00",
        action_type="RecallPreset",
        label="Cue 1",
        payload={"preset_id": "baseline"},
    )

    await service._tick_mtc("show-open")

    status = service.get_event_list_status("show-open")
    assert preset_service.recalled == ["baseline"]
    assert status["current_timecode"] == "00:00:00:00"
    assert status["fired_event_ids"] == []


@pytest.mark.asyncio
async def test_rtc_scheduler_supports_weekly_macro_triggers(tmp_path):
    service, _hub, _preset_service, macro_service = build_service(tmp_path)

    service.upsert_event_list(
        event_list_id="weekly-show",
        name="Weekly Show",
        list_type="rtc",
        source_id="calendar",
        internal_clock_enabled=True,
        first_time="00:00:00:00",
        last_time="00:00:00:00",
        fps=30,
        timezone="UTC",
    )
    now_utc = datetime.now(tz=ZoneInfo("UTC"))
    recurrence = f"weekly:{now_utc.weekday()}:{now_utc.strftime('%H:%M')}"
    service.upsert_event(
        event_list_id="weekly-show",
        event_id="macro-1",
        order=1,
        time_address=(now_utc - timedelta(minutes=5)).isoformat(),
        action_type="FireMacro",
        label="Macro 1",
        payload={"macro_id": "house-open", "recurrence": recurrence},
    )

    await service._tick_rtc("weekly-show")

    assert macro_service.triggered == [("house-open", {"macro_id": "house-open", "recurrence": recurrence})]
    status = service.get_event_list_status("weekly-show")
    assert status["current_datetime"] is not None
    assert status["fired_event_ids"] == ["macro-1"]


def test_msc_builder_and_raw_output(tmp_path):
    service, hub, _preset_service, _macro_service = build_service(tmp_path)

    built = service.build_msc_message(
        device_id=7,
        command_format=2,
        command="go",
        cue_number="12",
        list_number="main",
    )
    assert built["message"] == [240, 127, 7, 2, 2, 1, 109, 97, 105, 110, 0, 49, 50, 247]
    assert built["message_hex"] == "f07f070202016d61696e003132f7"


@pytest.mark.asyncio
async def test_msc_send_and_learn_mode_capture(tmp_path):
    service, hub, _preset_service, _macro_service = build_service(tmp_path)

    service.upsert_event_list(
        event_list_id="learn-show",
        name="Learn Show",
        list_type="mtc",
        source_id="internal",
        internal_clock_enabled=True,
        first_time="00:00:00:00",
        last_time="00:01:00:00",
        fps=30,
        timezone="UTC",
    )
    service.upsert_event_list(
        event_list_id="raw-out",
        name="Raw Out",
        list_type="mtc",
        source_id="internal",
        internal_clock_enabled=True,
        first_time="00:00:00:00",
        last_time="00:01:00:00",
        fps=30,
        timezone="UTC",
    )

    await service.send_msc_message(
        destination_port="lighting",
        device_id=1,
        command_format=0,
        command="fire",
        cue_number="99",
        list_number=None,
    )
    assert hub.sent[-1]["destination_port"] == "lighting"
    assert hub.sent[-1]["data"] == bytes([0xF0, 0x7F, 0x01, 0x02, 0x00, 0x07, 0x39, 0x39, 0xF7])

    service.upsert_event(
        event_list_id="raw-out",
        event_id="raw-1",
        order=1,
        time_address="00:00:00:00",
        action_type="SendMidiRaw",
        label="Kick",
        payload={"destination_port": "drums", "message": [0x99, 60, 127]},
    )
    await service._tick_mtc("raw-out")
    assert hub.sent[-1]["destination_port"] == "drums"
    assert hub.sent[-1]["data"] == bytes([0x99, 60, 127])

    await service.set_learn_mode(
        "learn-show",
        enabled=True,
        action_type="SendMSC",
        label="Captured Cue",
        payload={"destination_port": "lighting", "command": "go", "cue_number": "17"},
    )
    service._event_lists["learn-show"].current_frame = 90
    captured = service.capture_learn_event("learn-show")

    assert captured["label"] == "Captured Cue"
    assert captured["time_address"] == "00:00:03:00"
    assert service.list_events("learn-show")[0]["action_type"] == "SendMSC"
