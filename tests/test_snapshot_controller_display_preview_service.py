from app.services.plugin_key_parameter_registry import attach_plugin_key_parameter_metadata
from app.services.snapshot_controller_display_preview_service import (
    build_snapshot_controller_display_preview,
)


def test_build_snapshot_controller_display_preview_merges_assignments_labels_and_key_parameter_values():
    plugin_catalog = {
        "map2://juce/delay": attach_plugin_key_parameter_metadata(
            {
                "uri": "map2://juce/delay",
                "name": "Native Delay",
                "category": "Delay",
                "parameters": [
                    {
                        "index": 0,
                        "name": "Feedback",
                        "symbol": "feedback",
                        "min": 0.0,
                        "max": 100.0,
                        "default": 30.0,
                        "is_toggled": False,
                        "unit": "%",
                    },
                    {
                        "index": 1,
                        "name": "Mix",
                        "symbol": "mix",
                        "min": 0.0,
                        "max": 100.0,
                        "default": 50.0,
                        "is_toggled": False,
                        "unit": "%",
                    },
                ],
            }
        )
    }

    payload = build_snapshot_controller_display_preview(
        {
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
        [
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
        ],
        plugin_catalog=plugin_catalog,
    )

    assert payload["label_map"] == {"1": "Clean"}
    assert payload["unresolved"] == []
    assert payload["slots"][0]["display_label"] == "Clean"
    assert payload["slots"][0]["status_text"] == "Feedback 42%"
    assert payload["slots"][0]["summary_text"] == "Clean - Feedback 42%"
    assert payload["slots"][0]["chain_name"] == "Main"
    assert payload["slots"][0]["plugin_name"] == "Native Delay"
    assert payload["slots"][0]["key_parameter"]["parameter_symbol"] == "feedback"
    assert payload["slots"][0]["key_parameter"]["unit"] == "%"
    assert payload["slots"][0]["key_parameter"]["formatted_value"] == "42%"


def test_build_snapshot_controller_display_preview_marks_missing_snapshot_plugins_unresolved():
    payload = build_snapshot_controller_display_preview(
        {
            "chains": [],
            "controls": {
                "midi_map": [
                    {"action": "footswitch_label_map", "label_map": {"2": "Lead"}},
                ]
            },
        },
        [
            {
                "id": 12,
                "name": "Slot 2 Missing",
                "command_type": "cc_toggle",
                "channel": 1,
                "data1": 81,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "urn:test:missing",
                "target_plugin_position": 1,
                "action_data": {"slot_index": 1},
                "is_enabled": True,
            }
        ],
        plugin_catalog={},
    )

    assert payload["slots"][0]["display_label"] == "Lead"
    assert payload["slots"][0]["status_text"] == "Unavailable"
    assert payload["slots"][0]["slot_state"] == "unresolved"
    assert payload["unresolved"] == [
        {
            "slot_index": 1,
            "slot_number": 2,
            "command_id": 12,
            "target_plugin_uri": "urn:test:missing",
            "target_plugin_position": 1,
            "reason": "target_plugin_missing_in_snapshot",
        }
    ]
