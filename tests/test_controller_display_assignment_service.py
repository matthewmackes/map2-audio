from app.services.controller_display_assignment_service import build_controller_display_assignments


def test_build_controller_display_assignments_extracts_toggle_slots_and_label_overrides():
    payload = build_controller_display_assignments(
        [
            {
                "id": 4,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 81,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "map2://juce/delay",
                "target_plugin_position": 3,
                "action_data": {"slot_index": 1},
                "name": "CC81 -> Toggle Delay",
                "is_enabled": True,
            },
            {
                "id": 9,
                "command_type": "program_change",
                "channel": 0,
                "data1": 2,
                "action_type": "activate_chain",
                "target_chain_id": 3,
                "action_data": {},
                "name": "PC2 -> Chain 3",
                "is_enabled": True,
            },
        ],
        snapshot_midi_map_entries=[
            {
                "action": "footswitch_label_map",
                "label_map": {"2": "Delay", "4": "Lead"},
            }
        ],
    )

    assert payload["label_map"] == {"2": "Delay", "4": "Lead"}
    assert payload["conflicts"] == []
    assert payload["skipped"] == []
    assert payload["assignments"] == [
        {
            "slot_index": 1,
            "slot_number": 2,
            "command_id": 4,
            "command_name": "CC81 -> Toggle Delay",
            "command_type": "cc_toggle",
            "channel": 0,
            "trigger_value": 81,
            "target_plugin_uri": "map2://juce/delay",
            "target_plugin_position": 3,
            "label_override": "Delay",
        }
    ]


def test_build_controller_display_assignments_reports_duplicate_slot_collisions_and_keeps_latest():
    payload = build_controller_display_assignments(
        [
            {
                "id": 10,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 82,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "map2://juce/modulation/phaser",
                "target_plugin_position": 1,
                "action_data": {"slot_index": 2},
                "is_enabled": True,
            },
            {
                "id": 11,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 83,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "map2://juce/convolution/reverb",
                "target_plugin_position": 4,
                "action_data": {"slot_index": 2},
                "is_enabled": True,
            },
        ]
    )

    assert payload["assignments"][0]["command_id"] == 11
    assert payload["assignments"][0]["target_plugin_uri"] == "map2://juce/convolution/reverb"
    assert payload["conflicts"] == [
        {
            "type": "duplicate_slot_assignment",
            "slot_index": 2,
            "slot_number": 3,
            "kept_command_id": 10,
            "replaced_by_command_id": 11,
        }
    ]


def test_build_controller_display_assignments_reports_missing_slot_and_target_diagnostics():
    payload = build_controller_display_assignments(
        [
            {
                "id": 20,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 84,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "map2://juce/nam",
                "action_data": {},
                "is_enabled": True,
            },
            {
                "id": 21,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 85,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "",
                "action_data": {"slot_index": 0},
                "is_enabled": True,
            },
            {
                "id": 22,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 86,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "map2://juce/delay",
                "action_data": {"slot_index": 8},
                "is_enabled": True,
            },
            {
                "id": 23,
                "command_type": "cc_toggle",
                "channel": 0,
                "data1": 87,
                "action_type": "toggle_plugin",
                "target_plugin_uri": "map2://juce/delay",
                "action_data": {"slot_index": 0},
                "is_enabled": False,
            },
        ],
        max_slots=8,
    )

    assert payload["assignments"] == []
    assert payload["conflicts"] == []
    assert payload["skipped"] == [
        {
            "source_index": 0,
            "command_id": 20,
            "reason": "missing_slot_index",
        },
        {
            "source_index": 1,
            "command_id": 21,
            "reason": "missing_target_plugin_uri",
            "slot_index": 0,
        },
        {
            "source_index": 2,
            "command_id": 22,
            "reason": "slot_out_of_range",
            "slot_index": 8,
            "max_slots": 8,
        },
        {
            "source_index": 3,
            "command_id": 23,
            "reason": "disabled_command",
        },
    ]
