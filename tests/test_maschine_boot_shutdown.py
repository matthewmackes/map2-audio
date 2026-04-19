from __future__ import annotations

from app.services.maschine.boot_sequence import MaschineBootSequence
from app.services.maschine.maschine_mk1_daemon import (
    DaemonConfig,
    MaschineMK1Daemon,
    build_boot_sequence_frames,
)
from app.services.maschine.mk1_protocol import Button, Led
from app.services.maschine.shutdown_sequence import MaschineShutdownSequence


def test_boot_sequence_transitions_and_skip() -> None:
    sequence = MaschineBootSequence()
    sequence.start(now=10.0)

    snapshot = sequence.snapshot(
        profile_id="t1_ctrl",
        backend_connected=False,
        device_connected=False,
        now=10.2,
    )
    assert snapshot["active"] is True
    assert snapshot["stage_id"] == "wordmark"
    assert sequence.skip() is True
    assert sequence.is_active(now=10.3) is False


def test_build_boot_sequence_frames_produce_valid_bitmaps() -> None:
    sequence = MaschineBootSequence()
    sequence.start(now=5.0)
    frames = build_boot_sequence_frames(
        sequence.snapshot(
            profile_id="t3_brws",
            backend_connected=True,
            device_connected=True,
            now=5.4,
        )
    )

    assert frames["left"]["format"] == "xbm"
    assert frames["right"]["format"] == "xbm"
    assert len(frames["left"]["framebuffer"]) == 21760
    assert len(frames["right"]["framebuffer"]) == 21760


def test_daemon_build_led_array_uses_boot_sequence_overrides() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._boot_sequence.start(now=0.0)
    daemon._state.boot_active = True
    daemon._state.backend_connected = True
    daemon._state.device_connected = True

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.Navigate)] > 0
    assert led[int(Led.DisplayButton1)] > 0
    assert led[int(Led.DisplayBacklight)] > 0


def test_button_press_skips_boot_sequence_without_live_action() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._boot_sequence.start()
    daemon._state.boot_active = True
    daemon._state.display_context = "t3_brws"

    class _FakeClient:
        def post(self, *_args, **_kwargs):
            raise AssertionError("boot skip should swallow live action")

    daemon._dispatch_button(
        _FakeClient(),
        type("Change", (), {"button": int(Button.Navigate), "pressed": True})(),
        set(),
        False,
    )

    assert daemon._state.boot_active is False
    assert daemon._state.display_context == "t3_brws"


def test_daemon_stop_plays_shutdown_sequence_directly(monkeypatch) -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    writes: list[tuple[str, int]] = []

    class _FakeTransport:
        is_open = True

        def write_leds(self, payload, *, timeout_ms=500):
            writes.append(("led", timeout_ms))

        def write_display_frame(self, display_index, payload, *, timeout_ms=500):
            writes.append((f"display-{display_index}", timeout_ms))

        def close(self):
            writes.append(("close", 0))

    daemon._transport = _FakeTransport()
    daemon._hotplug_monitor.stop = lambda: None
    daemon._midi.close = lambda: None
    monkeypatch.setattr("app.services.maschine.maschine_mk1_daemon.time.sleep", lambda _value: None)

    daemon.stop()

    assert any(kind == "led" for kind, _size in writes)
    assert any(kind == "display-0" for kind, _size in writes)
    assert any(kind == "display-1" for kind, _size in writes)
    assert all(timeout_ms <= 50 for kind, timeout_ms in writes if kind != "close")
    assert writes[-1][0] == "close"


def test_shutdown_sequence_has_expected_stage_count() -> None:
    assert len(MaschineShutdownSequence().stage_snapshots()) == 5
