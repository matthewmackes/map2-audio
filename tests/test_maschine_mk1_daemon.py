from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace

import app.config as app_config_module
import app.services.maschine.maschine_mk1_daemon as maschine_mk1_daemon_module
from app.services.maschine.maschine_mk1_daemon import (
    DaemonConfig,
    LastTouchedControl,
    MaschineMK1Daemon,
    VirtualMidiOutput,
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


def test_load_runtime_transport_overrides_reloads_only_when_config_file_changes(monkeypatch, tmp_path) -> None:
    class _FakeRuntimeConfigManager:
        def __init__(self, config_path: Path) -> None:
            self.config_path = config_path
            self.reload_count = 0
            self._values = {
                "maschine.transport_preference": "hidapi",
                "maschine.allow_kernel_detach": False,
            }
            self._pending_values = dict(self._values)

        def get(self, key: str, default=None):
            return self._values.get(key, default)

        def stage(self, **values) -> None:
            self._pending_values.update(values)

        def reload(self) -> None:
            self.reload_count += 1
            self._values = dict(self._pending_values)

    config_path = tmp_path / "config.json"
    config_path.write_text("{}", encoding="utf-8")
    fake_manager = _FakeRuntimeConfigManager(config_path)

    monkeypatch.setattr(app_config_module, "get_config", lambda: fake_manager)
    maschine_mk1_daemon_module._reset_runtime_transport_override_cache()

    assert maschine_mk1_daemon_module._load_runtime_transport_overrides() == ("hidapi", False)
    assert maschine_mk1_daemon_module._load_runtime_transport_overrides() == ("hidapi", False)
    assert fake_manager.reload_count == 0

    fake_manager.stage(
        **{
            "maschine.transport_preference": "pyusb-bulk",
            "maschine.allow_kernel_detach": True,
        }
    )
    next_mtime_ns = config_path.stat().st_mtime_ns + 1_000_000
    config_path.write_text('{"maschine":{"transport_preference":"pyusb-bulk"}}', encoding="utf-8")
    os.utime(config_path, ns=(next_mtime_ns, next_mtime_ns))

    assert maschine_mk1_daemon_module._load_runtime_transport_overrides() == ("pyusb-bulk", True)
    assert fake_manager.reload_count == 1
    assert maschine_mk1_daemon_module._load_runtime_transport_overrides() == ("pyusb-bulk", True)
    assert fake_manager.reload_count == 1


def test_resolve_transport_policy_prefers_env_aliases_over_runtime_values(monkeypatch) -> None:
    monkeypatch.setattr(
        maschine_mk1_daemon_module,
        "_load_runtime_transport_overrides",
        lambda: ("hidapi", True),
    )
    monkeypatch.setenv("MAP2_MASCHINE_TRANSPORT", "bulk")
    monkeypatch.setenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH", "off")

    assert maschine_mk1_daemon_module._resolve_transport_policy(
        default_preference="auto",
        default_allow_kernel_detach=False,
    ) == ("pyusb-bulk", False)


def test_resolve_transport_policy_falls_back_to_runtime_then_defaults(monkeypatch) -> None:
    monkeypatch.delenv("MAP2_MASCHINE_TRANSPORT", raising=False)
    monkeypatch.delenv("MAP2_MASCHINE_ALLOW_KERNEL_DETACH", raising=False)
    monkeypatch.setattr(
        maschine_mk1_daemon_module,
        "_load_runtime_transport_overrides",
        lambda: ("hidapi", True),
    )

    assert maschine_mk1_daemon_module._resolve_transport_policy(
        default_preference="auto",
        default_allow_kernel_detach=False,
    ) == ("hidapi", True)

    monkeypatch.setattr(
        maschine_mk1_daemon_module,
        "_load_runtime_transport_overrides",
        lambda: (None, None),
    )

    assert maschine_mk1_daemon_module._resolve_transport_policy(
        default_preference="pyusb-bulk",
        default_allow_kernel_detach=True,
    ) == ("pyusb-bulk", True)


def test_refresh_transport_controller_applies_changed_runtime_overrides_when_disconnected(monkeypatch) -> None:
    created: list[SimpleNamespace] = []

    class _FakeTransportController:
        def __init__(self, *, vendor_id: int, product_id: int, preference: str, allow_kernel_detach: bool) -> None:
            self.connected = False
            self.preference = preference
            self.allow_kernel_detach = allow_kernel_detach
            created.append(
                SimpleNamespace(
                    vendor_id=vendor_id,
                    product_id=product_id,
                    preference=preference,
                    allow_kernel_detach=allow_kernel_detach,
                )
            )

        def runtime_info(self) -> dict[str, object]:
            return {"transport": self.preference, "candidates": []}

        def disconnect(self) -> None:
            return None

    monkeypatch.setattr(maschine_mk1_daemon_module, "MaschineTransportController", _FakeTransportController)
    monkeypatch.setattr(
        maschine_mk1_daemon_module,
        "_load_runtime_transport_overrides",
        lambda: ("pyusb-bulk", True),
    )

    daemon = MaschineMK1Daemon(DaemonConfig(transport_preference="auto", allow_kernel_detach=False))

    assert created[0].preference == "auto"
    assert created[0].allow_kernel_detach is False

    daemon._refresh_transport_controller_from_runtime()

    assert daemon.config.transport_preference == "pyusb-bulk"
    assert daemon.config.allow_kernel_detach is True
    assert created[-1].preference == "pyusb-bulk"
    assert created[-1].allow_kernel_detach is True
    assert len(created) == 2


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
