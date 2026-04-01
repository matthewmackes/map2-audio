from __future__ import annotations

from pathlib import Path

from app.services.maschine.maschine_mk1_daemon import (
    LastTouchedControl,
    MaschineMK1Daemon,
    build_lcd_output_reports,
    build_led_output_report,
    build_reconnecting_frames,
    decode_hid_report,
)


ROOT = Path(__file__).resolve().parents[1]


def test_decode_hid_report_translates_pad_encoder_transport_and_group_messages() -> None:
    pad_event = decode_hid_report(bytes([0x01, 0x03, 0x64, 0x01]))
    assert pad_event is not None
    assert pad_event.decoded_type == "pad_press"
    assert pad_event.payload["pad_index"] == 3
    assert pad_event.payload["note"] == 39
    assert pad_event.midi_messages == (bytes([0x90, 39, 100]),)

    encoder_event = decode_hid_report(bytes([0x02, 0x01, 0x40]))
    assert encoder_event is not None
    assert encoder_event.decoded_type == "encoder"
    assert encoder_event.payload["control"] == 2
    assert encoder_event.midi_messages == (bytes([0xB0, 2, 64]),)

    transport_event = decode_hid_report(bytes([0x03, 0x02, 0x01]))
    assert transport_event is not None
    assert transport_event.decoded_type == "transport_press"
    assert transport_event.payload["transport_action"] == "record"
    assert transport_event.midi_messages == (bytes([0x91, 62, 127]),)

    group_event = decode_hid_report(bytes([0x04, 0x05, 0x01]))
    assert group_event is not None
    assert group_event.decoded_type == "group_press"
    assert group_event.payload["control"] == 25
    assert group_event.midi_messages == (bytes([0xB0, 25, 127]),)


def test_decode_hid_report_handles_master_knob_and_long_press_variants() -> None:
    master_knob_event = decode_hid_report(bytes([0x28, 0x7F]))
    assert master_knob_event is not None
    assert master_knob_event.decoded_type == "master_knob"
    assert master_knob_event.payload["control_index"] == 8
    assert master_knob_event.payload["control"] == 9
    assert master_knob_event.midi_messages == (bytes([0xB0, 9, 127]),)

    long_press_event = decode_hid_report(bytes([0x05, 0x00, 0x01, 0x01]))
    assert long_press_event is not None
    assert long_press_event.decoded_type == "encoder_push_long"
    assert long_press_event.payload["control_index"] == 0
    assert long_press_event.payload["long_press"] is True


def test_led_and_lcd_output_reports_are_stable_and_chunked() -> None:
    led_state = {
        "pads": [
            {"state": "off"},
            {"state": "dim"},
            {"state": "bright"},
            {"state": "pulsing"},
        ],
    }
    led_report = build_led_output_report(led_state)
    assert led_report[0] == 0x80
    assert led_report[1:5] == bytes([0, 1, 2, 3])
    assert len(led_report) == 17

    bitmap = {"format": "xbm", "data": ("AA" * 80)}
    reports = build_lcd_output_reports("right", bitmap)
    assert len(reports) == 2
    assert reports[0][:4] == bytes([0x82, 0x00, 0x02, 56])
    assert reports[1][:4] == bytes([0x82, 0x01, 0x02, 24])


def test_reconnecting_frames_and_last_touched_overlay_produce_valid_bitmaps() -> None:
    reconnecting = build_reconnecting_frames()
    assert reconnecting["left"]["width"] == 128
    assert reconnecting["left"]["height"] == 64
    assert reconnecting["left"]["format"] == "xbm"
    assert len(reconnecting["left"]["data"]) == 2048
    assert len(reconnecting["right"]["data"]) == 2048

    audio_grid = {
        "selected_block_id": "block-2",
        "blocks": [
            {
                "block_id": "block-1",
                "plugin_name": "EQ",
                "top_parameters": [{"param_id": "gain", "value": "+3.0"}],
            },
            {
                "block_id": "block-2",
                "plugin_name": "Delay",
                "top_parameters": [{"param_id": "mix", "value": "20"}],
            },
        ],
    }
    touched = LastTouchedControl(label="Feedback", display_value="52", midi_value=52)
    rendered = MaschineMK1Daemon._audio_grid_with_last_touched(audio_grid, touched)
    assert rendered["blocks"][1]["top_parameters"][0] == {"param_id": "Feedback", "value": "52"}


def test_encoder_delta_wraparound_matches_relative_navigation_expectations() -> None:
    assert MaschineMK1Daemon._resolve_encoder_delta(None, 10) == 0
    assert MaschineMK1Daemon._resolve_encoder_delta(10, 15) == 1
    assert MaschineMK1Daemon._resolve_encoder_delta(15, 10) == -1
    assert MaschineMK1Daemon._resolve_encoder_delta(126, 2) == 1
    assert MaschineMK1Daemon._resolve_encoder_delta(2, 126) == -1


def test_maschine_systemd_unit_targets_backend_and_daemon_script() -> None:
    unit_text = (ROOT / "systemd" / "map2-maschine.service").read_text(encoding="utf-8")

    assert "After=network.target map2-backend.service" in unit_text
    assert "Wants=map2-backend.service" in unit_text
    assert "ExecStart=/usr/bin/python3 /home/mm/map2-audio/app/services/maschine/maschine_mk1_daemon.py" in unit_text
    assert 'Environment="PYTHONPATH=/home/mm/map2-audio"' in unit_text
    assert 'Environment="MAP2_BACKEND_URL=http://localhost:8080"' in unit_text
    assert "Restart=always" in unit_text
    assert "RestartSec=3" in unit_text
    assert "Nice=-5" in unit_text
    assert "LimitRTPRIO=60" in unit_text
    assert "WantedBy=multi-user.target" in unit_text
