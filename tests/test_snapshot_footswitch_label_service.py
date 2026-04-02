import asyncio

from app.services import snapshot_footswitch_label_service as service


class _FakeHub:
    def __init__(self):
        self.sent: list[dict[str, object]] = []

    def resolve_port(self, port_id: str):
        return _FakePort() if port_id == "mc6-out" else None

    def send(self, *, source_port: str, destination_port: str, data: bytes, metadata=None) -> bool:
        self.sent.append(
            {
                "source_port": source_port,
                "destination_port": destination_port,
                "data": data,
                "metadata": dict(metadata or {}),
            }
        )
        return True


class _FakePort:
    def can_send(self) -> bool:
        return True


class _FakeRegistry:
    def __init__(self):
        self.refresh_calls = 0

    def snapshot(self):
        return {
            "devices": [
                {
                    "device_id": "morningstar_mc6:main",
                    "profile_id": "morningstar_mc6",
                    "port_ids": ["mc6-out"],
                    "connected": True,
                }
            ]
        }

    async def refresh(self):
        self.refresh_calls += 1
        return self.snapshot()


class _FakeLCDManager:
    def __init__(self):
        self.events = []

    async def publish_event(self, event):
        self.events.append(event)


def test_extract_and_replace_snapshot_footswitch_label_map():
    entries = [
        {"action": "load_snapshot", "program_number": 4},
        {"action": service.SNAPSHOT_FOOTSWITCH_LABEL_ACTION, "label_map": {"1": "Clean", "2": " Lead Tone "}},
    ]

    assert service.extract_snapshot_footswitch_label_map(entries) == {
        "1": "Clean",
        "2": "Lead Ton",
    }
    assert service.replace_snapshot_footswitch_label_map(entries, {"3": "Solo"}) == [
        {"action": "load_snapshot", "program_number": 4},
        {"action": service.SNAPSHOT_FOOTSWITCH_LABEL_ACTION, "label_map": {"3": "Solo"}, "max_length": 8},
    ]


def test_build_morningstar_preset_short_name_sysex_matches_documented_layout():
    packet = service.build_morningstar_preset_short_name_sysex(
        profile_id="morningstar_mc6",
        preset_index=1,
        label="Lead",
    )

    assert packet[0] == 0xF0
    assert packet[-1] == 0xF7
    assert list(packet[1:8]) == [0x00, 0x39, 0x03, 0x7F, 0x0B, 0x01, 0x00]
    assert packet[8] == 0x01
    assert bytes(packet[9:17]).decode("ascii") == "Lead    "
    assert packet[-2] == sum(packet[1:-2]) % 128


def test_push_snapshot_footswitch_labels_sends_to_morningstar_and_lcd(monkeypatch):
    async def _run():
        fake_hub = _FakeHub()
        fake_registry = _FakeRegistry()
        fake_lcd = _FakeLCDManager()

        monkeypatch.setattr(service, "get_midi_hub", lambda: fake_hub)
        monkeypatch.setattr(service, "get_midi_device_registry", lambda: fake_registry)
        monkeypatch.setattr(service, "get_lcd_manager", lambda: fake_lcd)

        result = await service.push_snapshot_footswitch_labels(
            snapshot_id=42,
            snapshot_name="LeadScene",
            midi_map_entries=[
                {
                    "action": service.SNAPSHOT_FOOTSWITCH_LABEL_ACTION,
                    "label_map": {"1": "Clean", "2": "Lead"},
                }
            ],
        )

        assert result == {
            "snapshot_id": 42,
            "labels_pushed": 2,
            "device_count": 1,
            "devices": ["morningstar_mc6:main"],
            "lcd_updated": True,
        }
        assert [payload["destination_port"] for payload in fake_hub.sent] == ["mc6-out", "mc6-out"]
        assert fake_hub.sent[0]["metadata"]["profile_id"] == "morningstar_mc6"
        assert fake_lcd.events[0].title == "LeadScene labels"

    asyncio.run(_run())
