from __future__ import annotations

import time

from app.services.maschine.led_choreography import (
    build_audio_reactive_pad_overlay,
    build_brain_choreography_pad_overlay,
    build_choreography_button_overrides,
)
from app.services.maschine.mk1_protocol import Led


def test_audio_reactive_overlay_tracks_energy_and_focus() -> None:
    now = time.monotonic()
    overlay = build_audio_reactive_pad_overlay(
        audio_levels={
            "output_left": -6.0,
            "output_right": -12.0,
        },
        spectrum_state={
            "peak_frequency": 7000.0,
            "spectral_centroid": 6000.0,
        },
        transport_state={"is_playing": True, "bpm": 120},
        beat_anchor_monotonic=now - 0.02,
        now=now,
        pad_count=16,
    )

    assert len(overlay) == 16
    assert overlay[7]["brightness_level"] in {"bright", "full"}
    assert overlay[0]["brightness_level"] != "off"
    assert overlay[15]["animation"] in {"pulse_fast", "shimmer_fast"}


def test_brain_choreography_overlay_marks_active_slot_and_mode() -> None:
    now = time.monotonic()
    overlay = build_brain_choreography_pad_overlay(
        brain_state={
            "active_slot": 3,
            "slots": [{"slot_id": index, "mode": "drum"} for index in range(16)],
        },
        brain_sequence={
            "lanes": [
                {"slot_id": 3, "active_steps": 6},
                {"slot_id": 5, "active_steps": 3},
            ],
        },
        transport_state={"is_playing": True, "bpm": 124},
        beat_anchor_monotonic=now - 0.01,
        now=now,
        pad_count=16,
    )

    assert overlay[3]["brightness_level"] == "full"
    assert overlay[3]["animation"] == "pulse_fast"
    assert overlay[5]["brightness_level"] in {"mid", "bright"}
    assert overlay[0]["brain_slot_mode"] == "drum"


def test_button_overrides_expose_clip_alert_and_brain_group_flash() -> None:
    now = time.monotonic()
    overrides = build_choreography_button_overrides(
        profile_id="t10_brain_seq",
        transport_state={"is_playing": True, "bpm": 120},
        audio_levels={"output_left": -4.0, "output_right": -5.0},
        true_peak_state={"true_peak": -0.2},
        brain_state={
            "active_slot": 1,
            "slots": [{"slot_id": index, "mode": "drum"} for index in range(16)],
        },
        brain_sequence={
            "current_pattern": 2,
            "lanes": [
                {"slot_id": 0, "active_steps": 2},
                {"slot_id": 1, "active_steps": 6},
            ],
            "patterns": [{"pattern_id": 2, "fill_enabled": True}],
            "fill_mode": "manual+auto",
        },
        beat_anchor_monotonic=now - 0.02,
        now=now,
    )

    assert overrides[int(Led.Grid)]["level"] in {"dim", "mid", "bright", "full"}
    assert overrides[int(Led.Sampling)] == {"level": "full", "animation": "strobe_triplet"}
    assert overrides[int(Led.GroupA)]["level"] != "off"
    assert overrides[int(Led.GroupB)]["animation"] == "pulse_fast"
    assert overrides[int(Led.Scene)]["level"] == "bright"
