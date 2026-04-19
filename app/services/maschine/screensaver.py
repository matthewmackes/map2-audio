"""Maschine idle screensaver and presence-wake helpers."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

from app.services.maschine.mk1_protocol import Led


DEFAULT_IDLE_TIMEOUT_SECONDS = 600.0
DEFAULT_WAKE_PRESSURE_MIN = 96


def _safe_label(value: Any, *, limit: int = 18, fallback: str = "---") -> str:
    text = str(value or fallback).strip().upper()
    return (text or fallback)[:limit]


@dataclass
class ScreensaverSnapshot:
    profile_label: str
    idle_label: str
    wake_label: str
    transport_label: str
    owner_label: str
    status_label: str


class MaschineScreensaverState:
    def __init__(
        self,
        *,
        idle_timeout_seconds: float = DEFAULT_IDLE_TIMEOUT_SECONDS,
        wake_pressure_min: int = DEFAULT_WAKE_PRESSURE_MIN,
    ) -> None:
        self.idle_timeout_seconds = max(1.0, float(idle_timeout_seconds))
        self.wake_pressure_min = max(1, int(wake_pressure_min))
        self.last_activity_monotonic = time.monotonic()
        self.active = False

    def note_activity(self, *, now: float | None = None) -> bool:
        self.last_activity_monotonic = time.monotonic() if now is None else float(now)
        was_active = self.active
        self.active = False
        return was_active

    def update(self, *, now: float | None = None) -> bool:
        current = time.monotonic() if now is None else float(now)
        self.active = (current - self.last_activity_monotonic) >= self.idle_timeout_seconds
        return self.active

    def idle_seconds(self, *, now: float | None = None) -> float:
        current = time.monotonic() if now is None else float(now)
        return max(0.0, current - self.last_activity_monotonic)

    def wake_from_pressure(self, *, raw_pressure: int, now: float | None = None) -> bool:
        if not self.active:
            return False
        if int(raw_pressure) < self.wake_pressure_min:
            return False
        self.note_activity(now=now)
        return True

    def wake(self, *, now: float | None = None) -> bool:
        if not self.active:
            self.note_activity(now=now)
            return False
        self.note_activity(now=now)
        return True


def build_screensaver_snapshot(
    *,
    profile_id: str,
    transport_state: dict[str, Any],
    backend_connected: bool,
    device_connected: bool,
    idle_seconds: float,
) -> ScreensaverSnapshot:
    minutes = int(idle_seconds // 60)
    seconds = int(idle_seconds % 60)
    transport_text = "PLAYING" if bool(transport_state.get("is_playing")) else "IDLE"
    bpm = int(transport_state.get("bpm") or 120)
    owner = transport_state.get("active_owner") or "none"
    status_parts = [
        "BACKEND" if backend_connected else "BACKEND DOWN",
        "DEVICE" if device_connected else "DEVICE DOWN",
    ]
    return ScreensaverSnapshot(
        profile_label=_safe_label(profile_id.replace("_", " "), limit=16, fallback="AMBIENT"),
        idle_label=f"IDLE {minutes:02d}:{seconds:02d}",
        wake_label=f"PAD>{DEFAULT_WAKE_PRESSURE_MIN} WAKE",
        transport_label=_safe_label(f"{transport_text} {bpm} BPM", limit=18),
        owner_label=_safe_label(f"OWNER {owner}", limit=18),
        status_label=_safe_label(" / ".join(status_parts), limit=24),
    )


def build_screensaver_pad_overlay(*, now: float, pad_count: int = 16) -> list[dict[str, Any]]:
    overlay: list[dict[str, Any]] = []
    for index in range(max(0, pad_count)):
        phase = ((now / 2.8) + (index / max(1, pad_count))) % 1.0
        intensity = 0.14 + (0.18 * (0.5 + 0.5 * math.sin(phase * math.tau)))
        overlay.append(
            {
                "index": index,
                "brightness_level": "mid" if intensity >= 0.22 else "dim",
                "animation": "breathe" if index % 2 == 0 else "pulse_slow",
                "state": "dim",
                "choreography": "screensaver",
            }
        )
    return overlay


def build_screensaver_button_overrides(
    *,
    backend_connected: bool,
    device_connected: bool,
    transport_state: dict[str, Any],
) -> dict[int, dict[str, str]]:
    return {
        int(Led.Navigate): {
            "level": "mid" if backend_connected else "dim",
            "animation": "heartbeat" if backend_connected else "blink_slow",
        },
        int(Led.Play): {
            "level": "mid" if bool(transport_state.get("is_playing")) else "off",
            "animation": "steady" if bool(transport_state.get("is_playing")) else "steady",
        },
        int(Led.DisplayButton1): {
            "level": "dim" if device_connected else "off",
            "animation": "breathe" if device_connected else "steady",
        },
        int(Led.DisplayButton8): {
            "level": "dim" if device_connected else "off",
            "animation": "breathe" if device_connected else "steady",
        },
    }
