"""Maschine boot ceremony sequencing."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.services.maschine.mk1_protocol import Led


@dataclass(frozen=True)
class BootStage:
    stage_id: str
    duration_seconds: float
    title: str
    subtitle: str


_BOOT_STAGES: tuple[BootStage, ...] = (
    BootStage("wordmark", 0.55, "MAP2", "PIXEL WIPE"),
    BootStage("status", 0.80, "SYSTEM STATUS", "BACKEND AND USB"),
    BootStage("led_chase", 0.75, "LED CHASE", "SURFACE TEST"),
    BootStage("lcd_test", 0.45, "LCD TEST", "DUAL PANEL"),
    BootStage("profile_load", 0.55, "PROFILE LOAD", "CTRL READY"),
)


class MaschineBootSequence:
    def __init__(self) -> None:
        self.started_monotonic = time.monotonic()
        self.skipped = False
        self.completed = False

    def start(self, *, now: float | None = None) -> None:
        self.started_monotonic = time.monotonic() if now is None else float(now)
        self.skipped = False
        self.completed = False

    @property
    def total_duration_seconds(self) -> float:
        return sum(stage.duration_seconds for stage in _BOOT_STAGES)

    def skip(self) -> bool:
        if self.completed:
            return False
        self.skipped = True
        self.completed = True
        return True

    def is_active(self, *, now: float | None = None) -> bool:
        if self.skipped or self.completed:
            return False
        current = time.monotonic() if now is None else float(now)
        if (current - self.started_monotonic) >= self.total_duration_seconds:
            self.completed = True
            return False
        return True

    def snapshot(
        self,
        *,
        profile_id: str,
        backend_connected: bool,
        device_connected: bool,
        now: float | None = None,
    ) -> dict[str, Any]:
        current = time.monotonic() if now is None else float(now)
        elapsed = max(0.0, current - self.started_monotonic)
        running_total = 0.0
        current_stage = _BOOT_STAGES[-1]
        stage_index = len(_BOOT_STAGES) - 1
        stage_elapsed = 0.0
        for index, stage in enumerate(_BOOT_STAGES):
            next_total = running_total + stage.duration_seconds
            if elapsed < next_total:
                current_stage = stage
                stage_index = index
                stage_elapsed = elapsed - running_total
                break
            running_total = next_total
        progress = min(1.0, elapsed / max(0.001, self.total_duration_seconds))
        stage_progress = min(1.0, stage_elapsed / max(0.001, current_stage.duration_seconds))
        return {
            "active": self.is_active(now=current),
            "stage_id": current_stage.stage_id,
            "stage_index": stage_index,
            "stage_count": len(_BOOT_STAGES),
            "progress": progress,
            "stage_progress": stage_progress,
            "title": current_stage.title,
            "subtitle": current_stage.subtitle,
            "profile_label": str(profile_id or "t1_ctrl").replace("_", " ").upper()[:16],
            "backend_label": "BACKEND OK" if backend_connected else "BACKEND WAIT",
            "device_label": "DEVICE OK" if device_connected else "DEVICE WAIT",
        }


def build_boot_pad_overlay(*, stage_index: int, stage_progress: float, pad_count: int = 16) -> list[dict[str, Any]]:
    active_pad = min(max(0, stage_index * 3 + int(stage_progress * 3)), pad_count - 1)
    pads: list[dict[str, Any]] = []
    for index in range(max(0, pad_count)):
        if index == active_pad:
            level = "full"
            animation = "pulse_fast"
        elif abs(index - active_pad) <= 1:
            level = "bright"
            animation = "pulse_slow"
        else:
            level = "dim"
            animation = "steady"
        pads.append({"index": index, "brightness_level": level, "animation": animation, "state": level})
    return pads


def build_boot_button_overrides(*, stage_id: str, backend_connected: bool, device_connected: bool) -> dict[int, dict[str, str]]:
    overrides: dict[int, dict[str, str]] = {
        int(Led.Navigate): {
            "level": "mid" if backend_connected else "dim",
            "animation": "heartbeat" if backend_connected else "blink_slow",
        },
        int(Led.DisplayButton1): {"level": "bright", "animation": "pulse_slow"},
        int(Led.DisplayButton8): {"level": "bright", "animation": "pulse_slow"},
    }
    if stage_id == "led_chase":
        overrides[int(Led.GroupA)] = {"level": "full", "animation": "pulse_fast"}
        overrides[int(Led.GroupH)] = {"level": "full", "animation": "pulse_fast"}
    if device_connected:
        overrides[int(Led.Play)] = {"level": "mid", "animation": "steady"}
    return overrides
