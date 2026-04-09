"""Normalized Push drum projection for renderer-friendly state."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.services.push_surface.drum_browser import get_push_drum_browser_service
from app.services.push_surface.drum_registry import DrumMachineInstanceDescriptor

if TYPE_CHECKING:
    from app.services.push_surface.drum_runtime import PushDrumSessionState


PUSH_DRUM_PADS_PER_BANK = 16


def _selected_pad_index(session: PushDrumSessionState) -> int:
    if session.selected_step_instrument is not None:
        return int(session.selected_step_instrument) % PUSH_DRUM_PADS_PER_BANK
    if session.pad_velocity_source_pad is not None:
        return int(session.pad_velocity_source_pad) % PUSH_DRUM_PADS_PER_BANK
    return 0


def _pad_name(active_kit: dict[str, Any] | None, pad_index: int) -> str:
    instruments = list((active_kit or {}).get("instruments") or [])
    if pad_index < len(instruments):
        return str(instruments[pad_index].get("name") or f"Pad {pad_index + 1}")
    return f"Pad {pad_index + 1}"


def _pad_color(control: dict[str, Any], source: str) -> str:
    if bool(control.get("solo")):
        return "yellow"
    if bool(control.get("mute")):
        return "gray"
    if source == "hybrid":
        return "purple"
    if source == "synth":
        return "blue"
    return "green"


def _pad_projection(state: dict[str, Any], active_kit: dict[str, Any] | None, bank_index: int) -> list[dict[str, Any]]:
    controls = list(state.get("pad_controls") or [])
    sources = list(state.get("pad_sound_sources") or [])
    start = bank_index * PUSH_DRUM_PADS_PER_BANK
    pads: list[dict[str, Any]] = []
    for physical_pad in range(PUSH_DRUM_PADS_PER_BANK):
        logical_pad = start + physical_pad
        control = dict(controls[physical_pad]) if physical_pad < len(controls) else {}
        source = str(sources[physical_pad]) if physical_pad < len(sources) else "sample"
        pads.append(
            {
                "physical_pad": physical_pad,
                "logical_pad": logical_pad,
                "name": _pad_name(active_kit, physical_pad),
                "mute": bool(control.get("mute", False)),
                "solo": bool(control.get("solo", False)),
                "armed": bool(not control.get("mute", False)),
                "source": source,
                "color": _pad_color(control, source),
                "bus_assignment": int(control.get("bus_assignment", min(physical_pad // 2, 7))),
                "volume": float(control.get("volume", 100.0)),
            }
        )
    return pads


def _step_grid_projection(
    *,
    pattern: dict[str, Any] | None,
    position: dict[str, Any],
    session: PushDrumSessionState,
) -> dict[str, Any]:
    selected_pad = _selected_pad_index(session)
    page = int(session.step_grid_page)
    page_start = page * PUSH_DRUM_PADS_PER_BANK
    page_end = page_start + PUSH_DRUM_PADS_PER_BANK - 1
    rows = list((pattern or {}).get("steps") or [])
    selected_row = list(rows[selected_pad]) if selected_pad < len(rows) else []
    cells: list[dict[str, Any]] = []
    selected_step_payload: dict[str, Any] | None = None
    for step_index in range(page_start, min(page_end + 1, len(selected_row))):
        step = dict(selected_row[step_index] or {})
        cell = {
            "step": step_index,
            "active": int(step.get("velocity", 0)) > 0 or bool(step.get("accent", False)),
            "velocity": int(step.get("velocity", 0)),
            "probability": float(step.get("probability", 1.0)),
            "micro_timing": int(step.get("micro_timing", 0)),
            "pitch": step.get("lock_pitch"),
            "length": step.get("gate_length"),
            "ratchet_count": int(step.get("ratchet_count", 1)),
            "is_playhead": int(position.get("step", 0)) == step_index,
            "selected": session.selected_step_index == step_index,
        }
        cells.append(cell)
        if session.selected_step_index == step_index:
            selected_step_payload = dict(cell)
    return {
        "pattern_id": int(position.get("pattern_id", position.get("pattern", 0))),
        "selected_pad": selected_pad,
        "page": page,
        "page_start_step": page_start,
        "page_end_step": page_end,
        "selected_step_index": session.selected_step_index,
        "selected_step_instrument": session.selected_step_instrument,
        "selected_step": selected_step_payload,
        "steps": cells,
    }


def _display_projection(
    *,
    position: dict[str, Any],
    active_kit: dict[str, Any] | None,
    session: PushDrumSessionState,
) -> dict[str, Any]:
    selected_pad = _selected_pad_index(session)
    return {
        "transport_safe": False,
        "fallback": "led_only",
        "title": f"Pattern {int(position.get('pattern_id', position.get('pattern', 0))) + 1:03d}",
        "lines": [
            str((active_kit or {}).get("name") or "No kit loaded"),
            _pad_name(active_kit, selected_pad),
            f"Step {int(position.get('step', 0)) + 1:02d}",
            "LED fallback",
        ],
    }


def build_push_drum_projection(
    *,
    descriptor: DrumMachineInstanceDescriptor | None,
    state: dict[str, Any],
    transport: dict[str, Any],
    position: dict[str, Any],
    active_kit: dict[str, Any] | None,
    session: PushDrumSessionState,
    pattern: dict[str, Any] | None,
) -> dict[str, Any]:
    browser = get_push_drum_browser_service().get_projection()
    return {
        "instance": descriptor.to_dict() if descriptor is not None else None,
        "transport": {
            "is_playing": bool(transport.get("is_playing", False)),
            "bpm": int(transport.get("bpm", state.get("bpm", 120))),
            "pattern_id": int(position.get("pattern_id", position.get("pattern", state.get("pattern", 0)))),
            "step": int(position.get("step", 0)),
            "bar": int(position.get("bar", 1)),
            "beat": int(position.get("beat", 1)),
        },
        "pads": _pad_projection(state, active_kit, session.pad_bank_index),
        "current_bank": {
            "index": int(session.pad_bank_index),
            "start_pad": int(session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK),
            "end_pad": int((session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK) + PUSH_DRUM_PADS_PER_BANK - 1),
        },
        "modes": {
            "pad_velocity_mode": {
                "enabled": bool(session.pad_velocity_mode_enabled),
                "source_pad": session.pad_velocity_source_pad,
            },
            "repeat": {"enabled": bool(session.repeat_enabled), "rate": session.repeat_rate},
            "quantize": {
                "enabled": bool(session.quantize_enabled),
                "grid": session.quantize_grid,
                "strength": int(session.quantize_strength),
            },
            "fixed_length": {
                "enabled": bool(session.fixed_length_enabled),
                "preset": session.fixed_length_preset,
            },
            "loop_selector": {
                "enabled": bool(session.loop_selector_enabled),
                "page": int(session.loop_selector_page),
                "start_step": session.loop_start_step,
                "end_step": session.loop_end_step,
            },
        },
        "step_grid": _step_grid_projection(pattern=pattern, position=position, session=session),
        "browser": browser,
        "confirmation": session.pending_confirmation.to_dict() if session.pending_confirmation is not None else None,
        "display": _display_projection(position=position, active_kit=active_kit, session=session),
    }
