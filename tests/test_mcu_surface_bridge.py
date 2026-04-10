from __future__ import annotations

from typing import Any

from app.services.mcu_surface.bridge import (
    MCU_BANK_LEFT_NOTE,
    MCU_BANK_RIGHT_NOTE,
    MCU_CHANNEL_SELECT_BASE_NOTE,
    MCU_FAST_FORWARD_NOTE,
    MCU_PLAY_NOTE,
    MCU_RECORD_NOTE,
    MCU_REWIND_NOTE,
    MCU_STOP_NOTE,
    McuSnapshotEditorBridgeService,
)


class _FakeMaschineService:
    def __init__(self, projection: dict[str, Any]) -> None:
        self.projection = projection
        self.selected: list[str] = []

    async def get_audio_grid_projection(self, _session) -> dict[str, Any]:
        return self.projection

    async def select_audio_grid_block(self, _session, block_id: str) -> dict[str, Any]:
        self.selected.append(block_id)
        self.projection = {
            **self.projection,
            "selected_block_id": block_id,
        }
        return self.projection


class _FakeMcuSurfaceService:
    def __init__(self) -> None:
        self.scribble_updates: list[dict[str, Any]] = []
        self.fader_updates: list[dict[str, Any]] = []
        self.meter_updates: list[dict[str, Any]] = []

    def push_scribble_strip(self, *, destination_port: str, labels: list[str], source_port: str = "map2:mcu_surface", metadata=None) -> bool:
        self.scribble_updates.append(
            {
                "destination_port": destination_port,
                "labels": list(labels),
                "source_port": source_port,
                "metadata": dict(metadata or {}),
            }
        )
        return True

    def push_fader_positions(self, *, destination_port: str, normalized_values: list[float], source_port: str = "map2:mcu_surface", metadata=None) -> bool:
        self.fader_updates.append(
            {
                "destination_port": destination_port,
                "normalized_values": list(normalized_values),
                "source_port": source_port,
                "metadata": dict(metadata or {}),
            }
        )
        return True

    def push_meter_bridge(self, *, destination_port: str, levels: list[int], source_port: str = "map2:mcu_surface", metadata=None) -> bool:
        self.meter_updates.append(
            {
                "destination_port": destination_port,
                "levels": list(levels),
                "source_port": source_port,
                "metadata": dict(metadata or {}),
            }
        )
        return True


class _FakePublisher:
    def __init__(self) -> None:
        self.messages: list[tuple[tuple[str, ...], dict[str, Any]]] = []

    async def publish_message(self, payload: dict[str, Any], *, topics: tuple[str, ...]) -> None:
        self.messages.append((topics, payload))


class _FakeTransport:
    def __init__(self) -> None:
        self.actions: list[str] = []

    async def dispatch(self, action: str) -> dict[str, Any]:
        self.actions.append(action)
        return {"ok": True, "action": action}


class _FakeParameterApplier:
    def __init__(self) -> None:
        self.calls: list[tuple[dict[str, Any], dict[str, Any]]] = []

    async def apply(self, context: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((dict(context), dict(update)))
        return {"applied": True, "reason": "applied"}


async def _snapshot_provider(_session) -> dict[str, Any]:
    return {
        "id": 77,
        "name": "Live Snapshot",
        "paths": [
            {
                "id": "path-a",
                "name": "Main Path",
                "plugins": [
                    {
                        "uri": "urn:test:eq",
                        "name": "Parametric EQ",
                        "category": "EQ",
                        "class_label": "EQ",
                        "position": 0,
                        "parameters": {
                            "band0_freq": 120.0,
                            "band0_gain": 3.0,
                            "band0_q": 0.7,
                            "band1_freq": 1800.0,
                            "band1_gain": -2.0,
                            "band1_q": 1.2,
                            "output_gain": 1.5,
                        },
                    },
                    {
                        "uri": "urn:test:delay",
                        "name": "Delay",
                        "category": "Delay",
                        "class_label": "Delay",
                        "position": 1,
                        "parameters": {
                            "time": 420.0,
                            "feedback": 0.42,
                            "mix": 0.35,
                        },
                    },
                ],
            }
        ],
    }


def _plugin_catalog() -> dict[str, dict[str, Any]]:
    return {
        "urn:test:eq": {
            "uri": "urn:test:eq",
            "name": "Parametric EQ",
            "category": "EQ",
            "class_label": "EQ",
            "parameters": [
                {"index": 0, "name": "Band 1 Frequency", "symbol": "band0_freq", "min": 20.0, "max": 20000.0, "default": 1000.0, "is_toggled": False, "is_log": True},
                {"index": 1, "name": "Band 1 Gain", "symbol": "band0_gain", "min": -18.0, "max": 18.0, "default": 0.0, "is_toggled": False, "is_log": False},
                {"index": 2, "name": "Band 1 Q", "symbol": "band0_q", "min": 0.1, "max": 12.0, "default": 1.0, "is_toggled": False, "is_log": False},
                {"index": 3, "name": "Band 2 Frequency", "symbol": "band1_freq", "min": 20.0, "max": 20000.0, "default": 1000.0, "is_toggled": False, "is_log": True},
                {"index": 4, "name": "Band 2 Gain", "symbol": "band1_gain", "min": -18.0, "max": 18.0, "default": 0.0, "is_toggled": False, "is_log": False},
                {"index": 5, "name": "Band 2 Q", "symbol": "band1_q", "min": 0.1, "max": 12.0, "default": 1.0, "is_toggled": False, "is_log": False},
                {"index": 6, "name": "Output Gain", "symbol": "output_gain", "min": -18.0, "max": 18.0, "default": 0.0, "is_toggled": False, "is_log": False},
            ],
        },
        "urn:test:delay": {
            "uri": "urn:test:delay",
            "name": "Delay",
            "category": "Delay",
            "class_label": "Delay",
            "parameters": [
                {"index": 0, "name": "Time", "symbol": "time", "min": 1.0, "max": 2000.0, "default": 250.0, "is_toggled": False, "is_log": False},
                {"index": 1, "name": "Feedback", "symbol": "feedback", "min": 0.0, "max": 0.95, "default": 0.3, "is_toggled": False, "is_log": False},
                {"index": 2, "name": "Mix", "symbol": "mix", "min": 0.0, "max": 1.0, "default": 0.25, "is_toggled": False, "is_log": False},
            ],
        },
    }


def _build_projection() -> dict[str, Any]:
    return {
        "blocks": [
            {
                "block_id": "path-a:0",
                "path_id": "path-a",
                "plugin_name": "Parametric EQ",
                "plugin_uri": "urn:test:eq",
                "plugin_position": 0,
                "snapshot_chain_id": 401,
                "pad_index": 0,
            },
            {
                "block_id": "path-a:1",
                "path_id": "path-a",
                "plugin_name": "Delay",
                "plugin_uri": "urn:test:delay",
                "plugin_position": 1,
                "snapshot_chain_id": 401,
                "pad_index": 1,
            },
        ],
        "selected_block_id": "path-a:0",
    }


async def test_mcu_bridge_builds_parameter_projection_and_pushes_scribble_strip() -> None:
    maschine = _FakeMaschineService(_build_projection())
    mcu = _FakeMcuSurfaceService()
    publisher = _FakePublisher()
    service = McuSnapshotEditorBridgeService(
        maschine_service=maschine,
        mcu_surface_service=mcu,
        publisher=publisher,
        plugin_catalog_provider=_plugin_catalog,
        snapshot_provider=_snapshot_provider,
    )

    projection = await service.build_projection(object(), destination_port="MCU Out")

    assert projection["selected_plugin"]["plugin_uri"] == "urn:test:eq"
    assert projection["active_bank"]["group_id"] == "eq"
    assert [strip["symbol"] for strip in projection["channel_strips"] if strip.get("assigned")] == [
        "band0_freq",
        "band0_gain",
        "band0_q",
        "band1_freq",
        "band1_gain",
        "band1_q",
        "output_gain",
    ]
    assert projection["channel_strips"][0]["value"] == 120.0
    assert projection["channel_strips"][3]["value"] == 1800.0
    assert mcu.scribble_updates[-1]["destination_port"] == "MCU Out"
    assert mcu.fader_updates[-1]["destination_port"] == "MCU Out"
    assert mcu.meter_updates[-1]["destination_port"] == "MCU Out"
    assert publisher.messages[-1][0] == ("mcu_surface:projection", "mcu_surface")


async def test_mcu_bridge_channel_select_buttons_focus_audio_grid_blocks() -> None:
    maschine = _FakeMaschineService(_build_projection())
    service = McuSnapshotEditorBridgeService(
        maschine_service=maschine,
        mcu_surface_service=_FakeMcuSurfaceService(),
        publisher=_FakePublisher(),
        plugin_catalog_provider=_plugin_catalog,
        snapshot_provider=_snapshot_provider,
    )

    result = await service.handle_surface_event(
        object(),
        {"event_type": "button", "pressed": True, "note": MCU_CHANNEL_SELECT_BASE_NOTE + 1},
    )

    assert result["status"] == "completed"
    assert result["action"] == "select_block"
    assert result["selected_block_id"] == "path-a:1"
    assert maschine.selected == ["path-a:1"]
    assert result["projection"]["selected_plugin"]["plugin_uri"] == "urn:test:delay"


async def test_mcu_bridge_bank_buttons_navigate_parameter_pages() -> None:
    projection = _build_projection()
    projection["blocks"][0]["plugin_name"] = "Macro Rack"
    projection["blocks"][0]["plugin_uri"] = "urn:test:macro"
    maschine = _FakeMaschineService(projection)

    async def _macro_snapshot_provider(_session) -> dict[str, Any]:
        return {
            "paths": [
                {
                    "id": "path-a",
                    "plugins": [
                        {
                            "uri": "urn:test:macro",
                            "name": "Macro Rack",
                            "category": "Utility",
                            "class_label": "Utility",
                            "position": 0,
                            "parameters": {f"macro_{index + 1}": index / 10 for index in range(10)},
                        }
                    ],
                }
            ]
        }

    def _macro_catalog() -> dict[str, dict[str, Any]]:
        return {
            "urn:test:macro": {
                "uri": "urn:test:macro",
                "name": "Macro Rack",
                "category": "Utility",
                "class_label": "Utility",
                "parameters": [
                    {"index": index, "name": f"Macro {index + 1}", "symbol": f"macro_{index + 1}", "min": 0.0, "max": 1.0, "default": 0.0, "is_toggled": False, "is_log": False}
                    for index in range(10)
                ],
            }
        }

    service = McuSnapshotEditorBridgeService(
        maschine_service=maschine,
        mcu_surface_service=_FakeMcuSurfaceService(),
        publisher=_FakePublisher(),
        plugin_catalog_provider=_macro_catalog,
        snapshot_provider=_macro_snapshot_provider,
    )

    first_projection = await service.build_projection(object())
    assert first_projection["bank_count"] == 2
    assert first_projection["bank_index"] == 0
    assert first_projection["active_bank"]["title"] == "Utility 1/2"

    second_page = await service.handle_surface_event(
        object(),
        {"event_type": "button", "pressed": True, "note": MCU_BANK_RIGHT_NOTE},
    )
    assert second_page["status"] == "completed"
    assert second_page["projection"]["bank_index"] == 1
    assert second_page["projection"]["active_bank"]["title"] == "Utility 2/2"
    assert [strip["symbol"] for strip in second_page["projection"]["channel_strips"] if strip.get("assigned")] == [
        "macro_9",
        "macro_10",
    ]

    first_page = await service.handle_surface_event(
        object(),
        {"event_type": "button", "pressed": True, "note": MCU_BANK_LEFT_NOTE},
    )
    assert first_page["projection"]["bank_index"] == 0


async def test_mcu_bridge_transport_buttons_dispatch_transport_actions() -> None:
    transport = _FakeTransport()
    service = McuSnapshotEditorBridgeService(
        maschine_service=_FakeMaschineService(_build_projection()),
        mcu_surface_service=_FakeMcuSurfaceService(),
        publisher=_FakePublisher(),
        plugin_catalog_provider=_plugin_catalog,
        snapshot_provider=_snapshot_provider,
        transport_dispatcher=transport.dispatch,
    )

    for note, action in (
        (MCU_REWIND_NOTE, "rew"),
        (MCU_FAST_FORWARD_NOTE, "ff"),
        (MCU_STOP_NOTE, "stop"),
        (MCU_PLAY_NOTE, "play"),
        (MCU_RECORD_NOTE, "record"),
    ):
        result = await service.handle_surface_event(object(), {"event_type": "button", "pressed": True, "note": note})
        assert result["status"] == "completed"
        assert result["transport_action"] == action

    assert transport.actions == ["rew", "ff", "stop", "play", "record"]


async def test_mcu_bridge_jog_wheel_updates_last_touched_parameter() -> None:
    parameter_applier = _FakeParameterApplier()
    service = McuSnapshotEditorBridgeService(
        maschine_service=_FakeMaschineService(_build_projection()),
        mcu_surface_service=_FakeMcuSurfaceService(),
        publisher=_FakePublisher(),
        plugin_catalog_provider=_plugin_catalog,
        snapshot_provider=_snapshot_provider,
        parameter_applier=parameter_applier.apply,
    )

    projection = await service.build_projection(object())
    assert projection["focused_strip_index"] == 0

    focus_result = await service.handle_surface_event(
        object(),
        {"event_type": "vpot", "vpot_index": 3, "delta": 1},
    )
    assert focus_result["action"] == "focus_parameter"
    assert focus_result["focused_strip_index"] == 3

    jog_result = await service.handle_surface_event(
        object(),
        {"event_type": "jog_wheel", "delta": 2},
    )
    assert jog_result["status"] == "completed"
    assert jog_result["action"] == "jog_wheel"
    assert jog_result["parameter_symbol"] == "band1_freq"
    assert parameter_applier.calls[-1][1]["symbol"] == "band1_freq"
    assert parameter_applier.calls[-1][1]["value"] > 1800.0
