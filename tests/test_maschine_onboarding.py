from __future__ import annotations

from typing import Any

import app.services.maschine.onboarding as onboarding_module
from app.services.maschine.maschine_mk1_daemon import (
    DaemonConfig,
    MaschineMK1Daemon,
    build_onboarding_frames,
)
from app.services.maschine.mk1_protocol import Button, Led
from app.services.maschine.onboarding import MaschineOnboardingTour


class _FakeConfig:
    def __init__(self, initial: dict[str, Any] | None = None) -> None:
        self.values = dict(initial or {})
        self.save_calls = 0

    def get(self, key: str, default: Any = None) -> Any:
        return self.values.get(key, default)

    def set(self, key: str, value: Any, save: bool = True) -> bool:
        self.values[key] = value
        if save:
            self.save()
        return True

    def save(self) -> bool:
        self.save_calls += 1
        return True


def test_onboarding_tour_resumes_and_completes_with_initial_config_write() -> None:
    config = _FakeConfig()
    tour = MaschineOnboardingTour(config_manager=config)

    assert tour.activate_if_needed() is True
    assert tour.snapshot()["step_number"] == 1
    assert tour.advance() is True
    assert config.values["maschine.onboarding.step_index"] == 1

    resumed = MaschineOnboardingTour(config_manager=config)
    assert resumed.activate_if_needed() is True
    assert resumed.snapshot()["step_number"] == 2

    while resumed.is_active():
        resumed.advance()

    assert config.values["maschine.onboarding.completed"] is True
    assert config.values["maschine.transport_preference"] == "auto"
    assert config.values["maschine.allow_kernel_detach"] is False
    assert "maschine.onboarding.initial_config_written_at" in config.values


def test_onboarding_skip_suppresses_repeat_activation() -> None:
    config = _FakeConfig()
    tour = MaschineOnboardingTour(config_manager=config)

    assert tour.activate_if_needed() is True
    assert tour.skip() is True

    repeated = MaschineOnboardingTour(config_manager=config)
    assert repeated.activate_if_needed() is False
    assert config.values["maschine.onboarding.skipped"] is True


def test_onboarding_activate_if_needed_persists_only_on_first_activation() -> None:
    config = _FakeConfig()
    tour = MaschineOnboardingTour(config_manager=config)

    assert tour.activate_if_needed() is True
    assert config.save_calls == 1
    assert tour.activate_if_needed() is False
    assert config.save_calls == 1


def test_build_onboarding_frames_produce_valid_bitmaps() -> None:
    frames = build_onboarding_frames(
        {
            "title": "WELCOME",
            "subtitle": "MAP2 + MK1",
            "detail": "HEADLESS CONTROL SURFACE",
            "step_number": 1,
            "total_steps": 10,
            "progress": 0.1,
        }
    )

    assert frames["left"]["format"] == "xbm"
    assert frames["right"]["format"] == "xbm"
    assert len(frames["left"]["framebuffer"]) == 21760
    assert len(frames["right"]["framebuffer"]) == 21760


def test_daemon_onboarding_buttons_advance_and_skip_without_live_action(monkeypatch) -> None:
    config = _FakeConfig()
    monkeypatch.setattr(onboarding_module, "get_runtime_config_manager", lambda: config)
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._enqueue_backend_message = lambda payload: None
    daemon._onboarding.activate_if_needed()
    daemon._state.onboarding_active = True

    class _FakeClient:
        def post(self, *_args, **_kwargs):
            raise AssertionError("onboarding controls should not hit backend")

    daemon._dispatch_button(
        _FakeClient(),
        type("Change", (), {"button": int(Button.NoteRepeat), "pressed": True})(),
        set(),
        False,
    )
    assert daemon._onboarding.snapshot()["step_number"] == 2

    daemon._dispatch_button(
        _FakeClient(),
        type("Change", (), {"button": int(Button.Erase), "pressed": True})(),
        set(),
        False,
    )
    assert daemon._onboarding.is_active() is False
    assert config.values["maschine.onboarding.skipped"] is True


def test_daemon_build_led_array_uses_onboarding_overrides(monkeypatch) -> None:
    config = _FakeConfig()
    monkeypatch.setattr(onboarding_module, "get_runtime_config_manager", lambda: config)
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._onboarding.activate_if_needed()
    daemon._state.onboarding_active = True

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.NoteRepeat)] > 0
    assert led[int(Led.Erase)] > 0
    assert led[int(Led.DisplayBacklight)] > 0
