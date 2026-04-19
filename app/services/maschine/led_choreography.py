"""Audio-reactive and Brain-aware LED choreography helpers for Maschine MK1."""

from __future__ import annotations

import math
from typing import Any

from app.services.maschine.mk1_protocol import Led


BRAIN_PROFILE_IDS: frozenset[str] = frozenset(
    {
        "t7_b_l",
        "t8_b_r",
        "t10_brain_seq",
        "t15_quad_morph_editor",
    }
)

_FREQUENCY_FLOOR_HZ = 30.0
_FREQUENCY_CEIL_HZ = 16000.0


def is_brain_profile(profile_id: str | None) -> bool:
    return str(profile_id or "").strip().lower() in BRAIN_PROFILE_IDS


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _db_to_unit(value: Any, *, floor: float = -60.0, ceiling: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if numeric <= floor:
        return 0.0
    if numeric >= ceiling:
        return 1.0
    return _clamp_unit((numeric - floor) / max(0.001, ceiling - floor))


def _frequency_to_unit(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    numeric = max(_FREQUENCY_FLOOR_HZ, min(_FREQUENCY_CEIL_HZ, numeric))
    low = math.log10(_FREQUENCY_FLOOR_HZ)
    high = math.log10(_FREQUENCY_CEIL_HZ)
    return _clamp_unit((math.log10(numeric) - low) / max(0.001, high - low))


def _level_for_intensity(intensity: float) -> str:
    if intensity <= 0.05:
        return "off"
    if intensity < 0.22:
        return "dim"
    if intensity < 0.45:
        return "mid"
    if intensity < 0.75:
        return "bright"
    return "full"


def _animation_for_intensity(intensity: float, *, accent: bool = False, flavor: str = "steady") -> str:
    if accent and intensity >= 0.75:
        return "pulse_fast"
    if intensity >= 0.6 and flavor != "steady":
        return flavor
    if intensity >= 0.35:
        return "pulse_slow"
    return "steady"


def _quarter_note_phase(*, now: float, bpm: Any, beat_anchor_monotonic: float) -> float:
    try:
        bpm_value = float(bpm)
    except (TypeError, ValueError):
        bpm_value = 0.0
    if bpm_value <= 0.0 or beat_anchor_monotonic <= 0.0:
        return 0.0
    period = 60.0 / bpm_value
    if period <= 0.0:
        return 0.0
    return ((now - beat_anchor_monotonic) / period) % 1.0


def beat_flash_strength(
    *,
    transport_state: dict[str, Any],
    beat_anchor_monotonic: float,
    now: float,
) -> float:
    if not bool(transport_state.get("is_playing")):
        return 0.0
    phase = _quarter_note_phase(
        now=now,
        bpm=transport_state.get("bpm") or 120.0,
        beat_anchor_monotonic=beat_anchor_monotonic,
    )
    if phase < 0.16:
        return 1.0 - (phase / 0.16)
    if phase < 0.28:
        return 0.24 - ((phase - 0.16) / 0.12 * 0.24)
    return 0.0


def build_audio_reactive_pad_overlay(
    *,
    audio_levels: dict[str, Any],
    spectrum_state: dict[str, Any],
    transport_state: dict[str, Any],
    beat_anchor_monotonic: float,
    now: float,
    pad_count: int = 16,
) -> list[dict[str, Any]]:
    left_level = max(
        _db_to_unit(audio_levels.get("output_left")),
        _db_to_unit(audio_levels.get("input_left")),
    )
    right_level = max(
        _db_to_unit(audio_levels.get("output_right")),
        _db_to_unit(audio_levels.get("input_right")),
    )
    peak_focus = int(round(_frequency_to_unit(spectrum_state.get("peak_frequency")) * 7.0))
    centroid_focus = int(round(_frequency_to_unit(spectrum_state.get("spectral_centroid")) * 7.0))
    beat = beat_flash_strength(
        transport_state=transport_state,
        beat_anchor_monotonic=beat_anchor_monotonic,
        now=now,
    )

    overlay: list[dict[str, Any]] = []
    for index in range(max(0, pad_count)):
        local_index = index % 8
        half_level = left_level if index < 8 else right_level
        focus_distance = min(abs(local_index - peak_focus), abs(local_index - centroid_focus))
        focus_gain = max(0.2, 1.0 - (focus_distance / 4.0))
        intensity = _clamp_unit((half_level * 0.72 * focus_gain) + (beat * 0.24))
        accent = local_index in {peak_focus, centroid_focus}
        if accent:
            intensity = _clamp_unit(intensity + 0.14)
        overlay.append(
            {
                "index": index,
                "brightness_level": _level_for_intensity(intensity),
                "animation": _animation_for_intensity(intensity, accent=accent, flavor="shimmer_fast"),
                "state": _level_for_intensity(intensity),
                "choreography": "audio-reactive",
            }
        )
    return overlay


def build_brain_choreography_pad_overlay(
    *,
    brain_state: dict[str, Any],
    brain_sequence: dict[str, Any],
    transport_state: dict[str, Any],
    beat_anchor_monotonic: float,
    now: float,
    pad_count: int = 16,
) -> list[dict[str, Any]]:
    slots = [dict(slot) for slot in list(brain_state.get("slots") or []) if isinstance(slot, dict)]
    lanes = {
        int(lane.get("slot_id") or 0): dict(lane)
        for lane in list(brain_sequence.get("lanes") or [])
        if isinstance(lane, dict)
    }
    active_slot = int(brain_state.get("active_slot") or 0)
    beat = beat_flash_strength(
        transport_state=transport_state,
        beat_anchor_monotonic=beat_anchor_monotonic,
        now=now,
    )
    phase = _quarter_note_phase(
        now=now,
        bpm=transport_state.get("bpm") or 120.0,
        beat_anchor_monotonic=beat_anchor_monotonic,
    )
    step_cursor = int((phase * 16.0)) % 16 if bool(transport_state.get("is_playing")) else -1

    overlay: list[dict[str, Any]] = []
    for index in range(max(0, pad_count)):
        slot = slots[index] if index < len(slots) else {}
        lane = lanes.get(int(slot.get("slot_id") or index), {})
        active_steps = int(lane.get("active_steps") or 0)
        selected = index == active_slot
        preview_hit = index == step_cursor
        base = _clamp_unit((min(active_steps, 8) / 8.0) * 0.7)
        intensity = max(base, 0.28 if active_steps > 0 else 0.0)
        if preview_hit:
            intensity = max(intensity, 0.68 + (beat * 0.18))
        if selected:
            intensity = max(intensity, 0.86 + (beat * 0.14))

        mode = str(slot.get("mode") or "drum").strip().lower()
        flavor = {
            "drum": "double_pulse",
            "chromatic": "swing",
            "hybrid": "shimmer",
        }.get(mode, "pulse_slow")
        overlay.append(
            {
                "index": index,
                "brightness_level": _level_for_intensity(intensity),
                "animation": _animation_for_intensity(intensity, accent=(selected or preview_hit), flavor=flavor),
                "state": _level_for_intensity(intensity),
                "brain_slot_mode": mode,
                "choreography": "brain-sequence",
            }
        )
    return overlay


def build_choreography_button_overrides(
    *,
    profile_id: str,
    transport_state: dict[str, Any],
    audio_levels: dict[str, Any],
    true_peak_state: dict[str, Any],
    brain_state: dict[str, Any],
    brain_sequence: dict[str, Any],
    beat_anchor_monotonic: float,
    now: float,
) -> dict[int, dict[str, str]]:
    beat = beat_flash_strength(
        transport_state=transport_state,
        beat_anchor_monotonic=beat_anchor_monotonic,
        now=now,
    )
    clip_active = float(true_peak_state.get("true_peak") or -100.0) >= -1.0
    stereo_energy = max(
        _db_to_unit(audio_levels.get("output_left")),
        _db_to_unit(audio_levels.get("output_right")),
    )
    overrides: dict[int, dict[str, str]] = {
        int(Led.Grid): {
            "level": _level_for_intensity(max(beat, 0.14 if bool(transport_state.get("is_playing")) else 0.0)),
            "animation": "pulse_fast" if beat > 0.1 else "steady",
        },
        int(Led.Sampling): {
            "level": "full" if clip_active else _level_for_intensity(stereo_energy * 0.65),
            "animation": "strobe_triplet" if clip_active else _animation_for_intensity(stereo_energy, flavor="shimmer"),
        },
    }

    if not is_brain_profile(profile_id):
        return overrides

    slots = [dict(slot) for slot in list(brain_state.get("slots") or []) if isinstance(slot, dict)]
    lanes = {
        int(lane.get("slot_id") or 0): dict(lane)
        for lane in list(brain_sequence.get("lanes") or [])
        if isinstance(lane, dict)
    }
    active_slot = int(brain_state.get("active_slot") or 0)
    group_buttons = (
        Led.GroupA,
        Led.GroupB,
        Led.GroupC,
        Led.GroupD,
        Led.GroupE,
        Led.GroupF,
        Led.GroupG,
        Led.GroupH,
    )
    for slot_id, button in enumerate(group_buttons):
        slot = slots[slot_id] if slot_id < len(slots) else {}
        lane = lanes.get(slot_id, {})
        active_steps = int(lane.get("active_steps") or 0)
        intensity = max(0.18 if active_steps > 0 else 0.0, min(active_steps, 8) / 8.0)
        if slot_id == active_slot:
            intensity = max(intensity, 0.82 + (beat * 0.12))
        overrides[int(button)] = {
            "level": _level_for_intensity(intensity),
            "animation": "pulse_fast" if slot_id == active_slot else _animation_for_intensity(intensity, flavor="pulse_slow"),
        }

    patterns = [dict(pattern) for pattern in list(brain_sequence.get("patterns") or []) if isinstance(pattern, dict)]
    current_pattern = int(brain_sequence.get("current_pattern") or 0)
    active_pattern = next(
        (pattern for pattern in patterns if int(pattern.get("pattern_id") or -1) == current_pattern),
        {},
    )
    fill_enabled = bool(active_pattern.get("fill_enabled")) or bool(brain_sequence.get("fill_mode"))
    overrides[int(Led.Scene)] = {
        "level": "bright" if fill_enabled else "off",
        "animation": "double_pulse" if fill_enabled else "steady",
    }
    return overrides
