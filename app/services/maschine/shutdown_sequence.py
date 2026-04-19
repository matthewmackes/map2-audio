"""Maschine shutdown ceremony sequencing."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.services.maschine.mk1_protocol import Led


@dataclass(frozen=True)
class ShutdownStage:
    stage_id: str
    duration_seconds: float
    title: str
    subtitle: str


_SHUTDOWN_STAGES: tuple[ShutdownStage, ...] = (
    ShutdownStage("saving", 0.60, "SAVING STATE", "SNAPSHOT AND LOG"),
    ShutdownStage("receipts", 0.60, "RECEIPTS", "ENGINE / AUDIO"),
    ShutdownStage("summary", 0.60, "SESSION SUMMARY", "READY TO STOP"),
    ShutdownStage("farewell", 0.60, "FAREWELL", "LED WAVE"),
    ShutdownStage("goodbye", 0.60, "GOODBYE", "POWER SAFE"),
)


class MaschineShutdownSequence:
    @property
    def total_duration_seconds(self) -> float:
        return sum(stage.duration_seconds for stage in _SHUTDOWN_STAGES)

    def stage_snapshots(self) -> list[dict[str, Any]]:
        running_total = 0.0
        snapshots: list[dict[str, Any]] = []
        for index, stage in enumerate(_SHUTDOWN_STAGES):
            running_total += stage.duration_seconds
            snapshots.append(
                {
                    "stage_id": stage.stage_id,
                    "stage_index": index,
                    "stage_count": len(_SHUTDOWN_STAGES),
                    "progress": min(1.0, running_total / max(0.001, self.total_duration_seconds)),
                    "title": stage.title,
                    "subtitle": stage.subtitle,
                    "duration_seconds": stage.duration_seconds,
                }
            )
        return snapshots


def build_shutdown_pad_overlay(*, stage_index: int, pad_count: int = 16) -> list[dict[str, Any]]:
    pads: list[dict[str, Any]] = []
    cutoff = max(0, pad_count - (stage_index * 3))
    for index in range(max(0, pad_count)):
        if index < cutoff:
            level = "bright" if index % 2 == 0 else "mid"
            animation = "pulse_slow"
        else:
            level = "off"
            animation = "steady"
        pads.append({"index": index, "brightness_level": level, "animation": animation, "state": level})
    return pads


def build_shutdown_button_overrides(*, stage_id: str) -> dict[int, dict[str, str]]:
    overrides: dict[int, dict[str, str]] = {
        int(Led.Navigate): {"level": "dim", "animation": "pulse_slow"},
        int(Led.Play): {"level": "dim", "animation": "steady"},
    }
    if stage_id in {"farewell", "goodbye"}:
        overrides[int(Led.GroupA)] = {"level": "mid", "animation": "pulse_slow"}
        overrides[int(Led.GroupH)] = {"level": "mid", "animation": "pulse_slow"}
    return overrides
