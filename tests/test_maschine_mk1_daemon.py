from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import app.services.maschine.maschine_mk1_daemon as maschine_mk1_daemon_module
from app.services.maschine.maschine_mk1_daemon import (
    DaemonConfig,
    LastTouchedControl,
    MaschineMK1Daemon,
    VirtualMidiOutput,
    build_last_touched_bitmap,
    build_reconnecting_frames,
)
from app.services.maschine_lcd_service import LCD_HEIGHT, LCD_WIDTH


ROOT = Path(__file__).resolve().parents[1]


def test_reconnecting_frames_produce_valid_bitmaps_for_both_panels() -> None:
    reconnecting = build_reconnecting_frames()
    assert reconnecting["left"]["width"] == LCD_WIDTH
    assert reconnecting["left"]["height"] == LCD_HEIGHT
    assert reconnecting["left"]["format"] == "xbm"
    # 255x64 XBM: ceil(255/8)*64 = 32*64 = 2048 bytes → 4096 hex chars
    assert len(reconnecting["left"]["data"]) == 4096
    assert len(reconnecting["right"]["data"]) == 4096
    # Framebuffer field exists for device output (10,880 bytes → 21,760 hex chars)
    assert "framebuffer" in reconnecting["left"]
    assert len(reconnecting["left"]["framebuffer"]) == 21760


def test_last_touched_bitmap_produces_valid_output() -> None:
    touched = LastTouchedControl(label="Gain", display_value="+3.5", midi_value=80)
    result = build_last_touched_bitmap(touched)
    assert result["width"] == LCD_WIDTH
    assert result["height"] == LCD_HEIGHT
    assert "framebuffer" in result
    assert len(result["framebuffer"]) == 21760


def test_audio_grid_with_last_touched_inserts_parameter_into_selected_block() -> None:
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


def test_audio_grid_with_last_touched_returns_original_when_no_control() -> None:
    audio_grid = {"selected_block_id": "b1", "blocks": [{"block_id": "b1"}]}
    result = MaschineMK1Daemon._audio_grid_with_last_touched(audio_grid, None)
    assert result is audio_grid


def test_encoder_delta_wraparound_matches_relative_navigation_expectations() -> None:
    assert MaschineMK1Daemon._resolve_encoder_delta(None, 10) == 0
    assert MaschineMK1Daemon._resolve_encoder_delta(10, 15) == 1
    assert MaschineMK1Daemon._resolve_encoder_delta(15, 10) == -1
    assert MaschineMK1Daemon._resolve_encoder_delta(126, 2) == 1
    assert MaschineMK1Daemon._resolve_encoder_delta(2, 126) == -1


def test_virtual_midi_output_disposes_rtmidi_client(monkeypatch) -> None:
    class _FakeMidiOut:
        def __init__(self) -> None:
            self.closed = False
            self.deleted = False
            self.opened_name = None

        def open_virtual_port(self, name: str) -> None:
            self.opened_name = name

        def close_port(self) -> None:
            self.closed = True

        def delete(self) -> None:
            self.deleted = True

    created: list[_FakeMidiOut] = []

    def _make_midi_out() -> _FakeMidiOut:
        client = _FakeMidiOut()
        created.append(client)
        return client

    monkeypatch.setattr(maschine_mk1_daemon_module, "rtmidi", SimpleNamespace(MidiOut=_make_midi_out))

    output = VirtualMidiOutput("MAP2:Maschine-MK1")

    assert output.open() is True
    output.close()
    assert created[0].opened_name == "MAP2:Maschine-MK1"
    assert created[0].closed is True
    assert created[0].deleted is True


def test_daemon_config_from_env_defaults(monkeypatch) -> None:
    monkeypatch.delenv("MAP2_BACKEND_URL", raising=False)
    monkeypatch.delenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH", raising=False)
    config = DaemonConfig.from_env()
    assert config.backend_url == "http://localhost:8080"
    assert config.allow_kernel_detach is True


def test_daemon_config_from_env_respects_kernel_detach_env(monkeypatch) -> None:
    monkeypatch.setenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH", "false")
    config = DaemonConfig.from_env()
    assert config.allow_kernel_detach is False


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
