from __future__ import annotations

from app.services.maschine.maschine_mk1_daemon import (
    DaemonConfig,
    MaschineMK1Daemon,
    build_screensaver_frames,
)
from app.services.maschine.mk1_protocol import Button, Led, PadEvent
from app.services.maschine.screensaver import MaschineScreensaverState


def test_screensaver_state_activates_after_idle_and_wakes_on_pressure() -> None:
    state = MaschineScreensaverState(idle_timeout_seconds=2.0, wake_pressure_min=96)
    state.note_activity(now=10.0)

    assert state.update(now=11.5) is False
    assert state.update(now=12.1) is True
    assert state.wake_from_pressure(raw_pressure=80, now=12.2) is False
    assert state.wake_from_pressure(raw_pressure=120, now=12.3) is True
    assert state.active is False


def test_build_screensaver_frames_produce_valid_bitmaps() -> None:
    frames = build_screensaver_frames(
        profile_id="t3_brws",
        transport_state={"is_playing": True, "bpm": 123, "active_owner": "midi_recorder"},
        backend_connected=True,
        device_connected=True,
        idle_seconds=615.0,
    )

    assert frames["left"]["format"] == "xbm"
    assert frames["right"]["format"] == "xbm"
    assert len(frames["left"]["framebuffer"]) == 21760
    assert len(frames["right"]["framebuffer"]) == 21760


def test_daemon_build_led_array_uses_screensaver_overrides() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._state.backend_connected = True
    daemon._state.device_connected = True
    daemon._state.screensaver_active = True
    daemon._state.drum_transport_state = {"is_playing": True, "bpm": 120}

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.DisplayBacklight)] > 0
    assert led[int(Led.Navigate)] > 0
    assert led[int(Led.Play)] > 0


def test_pad_pressure_wakes_screensaver_without_emitting_live_action() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._screensaver.active = True
    daemon._state.screensaver_active = True
    sent_messages: list[bytes] = []
    daemon._midi.send_messages = lambda messages: sent_messages.extend(messages)
    daemon._enqueue_backend_message = lambda payload: None

    class _FakeClient:
        def post(self, *_args, **_kwargs):
            raise AssertionError("wake gesture should not hit backend")

    daemon._dispatch_pad_event(_FakeClient(), PadEvent(pad=0, pressure=128, pressed=True), {}, {})

    assert daemon._state.screensaver_active is False
    assert sent_messages == []


def test_button_press_wakes_screensaver_without_changing_context() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._screensaver.active = True
    daemon._state.screensaver_active = True
    daemon._state.display_context = "t3_brws"

    class _FakeClient:
        def post(self, *_args, **_kwargs):
            raise AssertionError("wake gesture should not hit backend")

    daemon._dispatch_button(
        _FakeClient(),
        type("Change", (), {"button": int(Button.Navigate), "pressed": True})(),
        set(),
        False,
    )

    assert daemon._state.screensaver_active is False
    assert daemon._state.display_context == "t3_brws"
