"""Normalized surface and backend event models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SurfaceEventType(str, Enum):
    """Normalized events produced from raw MIDI input."""

    PAD_PRESS = "pad_press"
    PAD_RELEASE = "pad_release"
    BUTTON_PRESS = "button_press"
    BUTTON_RELEASE = "button_release"
    ENCODER_TURN = "encoder_turn"
    ENCODER_TOUCH = "encoder_touch"
    ENCODER_RELEASE = "encoder_release"
    TOUCHSTRIP_CHANGE = "touchstrip_change"
    AFTERTOUCH = "aftertouch"
    POLY_AFTERTOUCH = "poly_aftertouch"
    PEDAL_CHANGE = "pedal_change"
    UNKNOWN_MIDI_EVENT = "unknown_midi_event"


class Map2EventType(str, Enum):
    """Backend events consumed by the Push surface manager."""

    CHAIN_SELECTED = "chain_selected"
    NODE_SELECTED = "node_selected"
    PARAMETER_CHANGED = "parameter_changed"
    BYPASS_CHANGED = "bypass_changed"
    PRESET_LOADED = "preset_loaded"
    ROUTE_CHANGED = "route_changed"
    CLUSTER_STATUS_CHANGED = "cluster_status_changed"
    WARNING_RAISED = "warning_raised"
    FAULT_RAISED = "fault_raised"
    SNAPSHOT_RUNTIME_CHANGED = "snapshot_runtime_changed"
    HEARTBEAT = "heartbeat"


@dataclass(frozen=True)
class SurfaceEvent:
    """Device-agnostic event emitted by the input parser."""

    device_id: str
    event_type: SurfaceEventType
    control_id: str
    value: int | float | bool | str | None
    timestamp: float
    pressure: int = 0
    delta: int = 0
    raw_data: bytes = b""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Map2Event:
    """Normalized event emitted by a MAP2 bridge."""

    event_type: Map2EventType
    timestamp: float
    payload: dict[str, Any] = field(default_factory=dict)
