import asyncio

from app.services import snapshot_controller_display_push_service as service


class _FakePort:
    def can_send(self) -> bool:
        return True


class _FakeHub:
    def __init__(self):
        self.sent: list[dict[str, object]] = []

    def resolve_port(self, port_id: str):
        return _FakePort() if port_id in {"mc6-out", "mc8-out"} else None

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


class _FakeRegistry:
    def __init__(self, profile_id: str, port_id: str):
        self._profile_id = profile_id
        self._port_id = port_id

    def snapshot(self):
        return {
            "devices": [
                {
                    "device_id": f"{self._profile_id}:main",
                    "profile_id": self._profile_id,
                    "port_ids": [self._port_id],
                    "connected": True,
                }
            ]
        }

    async def refresh(self):
        return self.snapshot()

    def get_display_capabilities(self, profile_id: str):
        if profile_id == "morningstar_mc6":
            return {
                "transport": "morningstar_short_name",
                "supports_per_switch_labels": True,
                "switch_count": 6,
                "label_max_length": 8,
                "model_id": 0x03,
            }
        if profile_id == "morningstar_mc8":
            return {
                "transport": "morningstar_short_name",
                "supports_per_switch_labels": True,
                "switch_count": 8,
                "label_max_length": 10,
                "model_id": 0x04,
            }
        return {}


def test_push_snapshot_controller_display_preview_sends_compact_morningstar_summary(monkeypatch):
    async def _run():
        fake_hub = _FakeHub()
        monkeypatch.setattr(service, "get_midi_hub", lambda: fake_hub)
        monkeypatch.setattr(
            service,
            "get_midi_device_registry",
            lambda: _FakeRegistry("morningstar_mc6", "mc6-out"),
        )

        result = await service.push_snapshot_controller_display_preview(
            snapshot_id=41,
            snapshot_name="LeadScene",
            preview_payload={
                "slots": [
                    {
                        "slot_index": 0,
                        "slot_number": 1,
                        "display_label": "Clean",
                        "slot_state": "active",
                        "key_parameter": {
                            "parameter_symbol": "feedback",
                            "formatted_value": "42%",
                        },
                    }
                ]
            },
        )

        assert result == {
            "snapshot_id": 41,
            "slots_pushed": 1,
            "device_count": 1,
            "devices": ["morningstar_mc6:main"],
        }
        assert bytes(fake_hub.sent[0]["data"][9:17]).decode("ascii") == "Clean42%"
        assert fake_hub.sent[0]["metadata"]["event"] == "snapshot_controller_display"

    asyncio.run(_run())


def test_refresh_live_snapshot_controller_display_for_parameter_updates_rebuilds_preview_and_syncs(monkeypatch):
    async def _run():
        fake_hub = _FakeHub()
        synced_payloads: list[dict[str, object]] = []
        runtime_services = []

        class _FakeRuntimeStateService:
            def __init__(self, _session):
                runtime_services.append(self)

            async def get_live_state(self):
                return {
                    "state": "live",
                    "snapshot_id": 77,
                    "snapshot_revision": "rev-1",
                    "live_snapshot_payload": {
                        "id": 77,
                        "name": "UnifiedSnapshot",
                        "snapshot_revision": "rev-1",
                        "chains": [
                            {
                                "id": 11,
                                "name": "Main",
                                "plugins": [
                                    {
                                        "uri": "map2://juce/delay",
                                        "name": "Native Delay",
                                        "position": 3,
                                        "bypass": False,
                                        "parameters": {"feedback": 42.0, "mix": 50.0},
                                    }
                                ],
                            }
                        ],
                        "controls": {
                            "midi_map": [
                                {"action": "footswitch_label_map", "label_map": {"1": "Clean"}},
                            ]
                        },
                    },
                }

            async def sync_live_snapshot_payload(
                self,
                *,
                snapshot_id: int,
                live_snapshot_payload: dict[str, object],
                snapshot_revision: str | None = None,
            ):
                synced_payloads.append(
                    {
                        "snapshot_id": snapshot_id,
                        "snapshot_revision": snapshot_revision,
                        "payload": live_snapshot_payload,
                    }
                )
                return {
                    "snapshot_id": snapshot_id,
                    "snapshot_revision": snapshot_revision,
                    "live_snapshot_payload": live_snapshot_payload,
                }

        async def _fake_get_all_commands(_session):
            return [
                {
                    "id": 91,
                    "name": "Slot 1 Delay",
                    "command_type": "cc_toggle",
                    "channel": 1,
                    "data1": 80,
                    "action_type": "toggle_plugin",
                    "target_plugin_uri": "map2://juce/delay",
                    "target_plugin_position": 3,
                    "action_data": {"slot_index": 0},
                    "is_enabled": True,
                }
            ]

        monkeypatch.setattr(service, "SnapshotRuntimeStateService", _FakeRuntimeStateService)
        monkeypatch.setattr(service.midi_service, "get_all_commands", _fake_get_all_commands)
        monkeypatch.setattr(service, "get_midi_hub", lambda: fake_hub)
        monkeypatch.setattr(
            service,
            "get_midi_device_registry",
            lambda: _FakeRegistry("morningstar_mc8", "mc8-out"),
        )

        result = await service.refresh_live_snapshot_controller_display_for_parameter_updates(
            session=object(),
            parameter_updates=[
                {
                    "plugin_uri": "map2://juce/delay",
                    "parameter_symbol": "feedback",
                    "value": 43.0,
                    "plugin_position": 3,
                }
            ],
        )

        assert result["updated"] is True
        assert result["snapshot_id"] == 77
        assert result["matched_plugins"] == 1
        assert result["matched_slots"] == 1
        assert synced_payloads[0]["snapshot_id"] == 77
        synced_preview = synced_payloads[0]["payload"]["controller_display_preview"]
        assert synced_preview["slots"][0]["key_parameter"]["current_value"] == 43.0
        assert synced_preview["slots"][0]["key_parameter"]["formatted_value"] == "43%"
        assert synced_preview["slots"][0]["summary_text"] == "Clean - Feedback 43%"
        assert bytes(fake_hub.sent[0]["data"][9:19]).decode("ascii") == "Clean 43% "

    asyncio.run(_run())
