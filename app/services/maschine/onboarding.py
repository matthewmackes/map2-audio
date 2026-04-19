"""Maschine first-connection onboarding tour helpers."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.config import get_config as get_runtime_config_manager
from app.services.maschine.mk1_protocol import Led


def _utcnow_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass(frozen=True)
class MaschineOnboardingStep:
    title: str
    subtitle: str
    detail: str


_DEFAULT_STEPS: tuple[MaschineOnboardingStep, ...] = (
    MaschineOnboardingStep("WELCOME", "MAP2 + MK1", "HEADLESS CONTROL SURFACE"),
    MaschineOnboardingStep("CONTROL", "MAIN PROFILE", "SNAPSHOT + BLOCK OVERVIEW"),
    MaschineOnboardingStep("STEP", "CHAIN DETAIL", "FOCUSED EFFECT EDITOR"),
    MaschineOnboardingStep("AUTO", "MONITOR VIEW", "LIVE HEALTH + METRICS"),
    MaschineOnboardingStep("NAVIGATE", "OPEN MENU", "TURN NAV TO MOVE"),
    MaschineOnboardingStep("NOTE REPEAT", "SELECT PROFILE", "SHIFT+NR = CATEGORY"),
    MaschineOnboardingStep("SHIFT+NAV", "INSPECT LEDS", "ASSIGNED / MUTED / AUTO"),
    MaschineOnboardingStep("PADS", "SELECT BLOCKS", "HOLD FOR BYPASS TOGGLE"),
    MaschineOnboardingStep("SCREENSAVER", "AMBIENT MODE", "FIRST INPUT WAKES ONLY"),
    MaschineOnboardingStep("READY", "START OPERATING", "NR NEXT • ERASE SKIP"),
)


class MaschineOnboardingTour:
    def __init__(
        self,
        *,
        config_manager: Any | None = None,
        steps: tuple[MaschineOnboardingStep, ...] = _DEFAULT_STEPS,
    ) -> None:
        self._config = config_manager or get_runtime_config_manager()
        self._steps = steps
        self._active = False
        self._step_index = self._load_step_index()

    @property
    def total_steps(self) -> int:
        return len(self._steps)

    def is_completed(self) -> bool:
        return bool(self._config.get("maschine.onboarding.completed", False))

    def is_skipped(self) -> bool:
        return bool(self._config.get("maschine.onboarding.skipped", False))

    def is_active(self) -> bool:
        return self._active

    def activate_if_needed(self) -> bool:
        if self.is_completed() or self.is_skipped():
            self._active = False
            return False
        if self._active:
            return False
        self._active = True
        self._persist(state="active")
        return True

    def snapshot(self) -> dict[str, Any]:
        step_index = max(0, min(self._step_index, max(0, self.total_steps - 1)))
        step = self._steps[step_index]
        return {
            "active": self._active,
            "step_index": step_index,
            "step_number": step_index + 1,
            "total_steps": self.total_steps,
            "title": step.title,
            "subtitle": step.subtitle,
            "detail": step.detail,
            "can_go_back": step_index > 0,
            "progress": float(step_index + 1) / float(max(1, self.total_steps)),
        }

    def advance(self) -> bool:
        if not self._active:
            return False
        if self._step_index >= (self.total_steps - 1):
            self.complete()
            return True
        self._step_index += 1
        self._persist(state="active")
        return True

    def previous(self) -> bool:
        if not self._active or self._step_index <= 0:
            return False
        self._step_index -= 1
        self._persist(state="active")
        return True

    def skip(self) -> bool:
        if self.is_completed() or self.is_skipped():
            self._active = False
            return False
        self._active = False
        self._config.set("maschine.onboarding.skipped", True, save=False)
        self._config.set("maschine.onboarding.skipped_at", _utcnow_iso(), save=False)
        self._persist(state="skipped")
        return True

    def complete(self) -> bool:
        if self.is_completed():
            self._active = False
            return False
        self._active = False
        self._config.set("maschine.onboarding.completed", True, save=False)
        self._config.set("maschine.onboarding.completed_at", _utcnow_iso(), save=False)
        self._config.set("maschine.onboarding.skipped", False, save=False)
        self._config.set("maschine.onboarding.skipped_at", None, save=False)
        # Persist the initial transport policy explicitly so first-run state is
        # no longer implicit in schema defaults alone.
        self._config.set(
            "maschine.transport_preference",
            self._config.get("maschine.transport_preference", "auto") or "auto",
            save=False,
        )
        self._config.set(
            "maschine.allow_kernel_detach",
            bool(self._config.get("maschine.allow_kernel_detach", False)),
            save=False,
        )
        self._config.set("maschine.onboarding.initial_config_written_at", _utcnow_iso(), save=False)
        self._persist(state="completed")
        return True

    def _load_step_index(self) -> int:
        try:
            return max(0, min(int(self._config.get("maschine.onboarding.step_index", 0) or 0), max(0, self.total_steps - 1)))
        except (TypeError, ValueError):
            return 0

    def _persist(self, *, state: str) -> None:
        self._config.set("maschine.onboarding.state", state, save=False)
        self._config.set("maschine.onboarding.step_index", int(self._step_index), save=False)
        self._config.save()


def build_onboarding_pad_overlay(*, step_index: int, total_steps: int, pad_count: int = 16) -> list[dict[str, Any]]:
    visible_steps = min(max(0, total_steps), max(0, pad_count))
    overlay: list[dict[str, Any]] = []
    for index in range(max(0, pad_count)):
        if index < step_index:
            overlay.append({"index": index, "state": "full", "brightness_level": "full", "animation": "steady"})
        elif index == step_index and index < visible_steps:
            overlay.append({"index": index, "state": "bright", "brightness_level": "bright", "animation": "pulse_fast"})
        elif index < visible_steps:
            overlay.append({"index": index, "state": "dim", "brightness_level": "dim", "animation": "steady"})
        else:
            overlay.append({"index": index, "state": "off", "brightness_level": "off", "animation": "steady"})
    return overlay


def build_onboarding_button_overrides(*, can_go_back: bool) -> dict[int, dict[str, str]]:
    return {
        int(Led.NoteRepeat): {"level": "full", "animation": "steady"},
        int(Led.Erase): {"level": "bright", "animation": "steady"},
        int(Led.Navigate): {"level": "mid" if can_go_back else "dim", "animation": "steady"},
    }
