"""Render-state models for the Push output renderer."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.push_surface.models.capabilities import SurfaceColor


@dataclass(frozen=True)
class ControlLightState:
    """Abstract LED state for a pad or button."""

    color: SurfaceColor = SurfaceColor.OFF
    brightness: int = 127
    pulse: bool = False
    blink: bool = False
    label: str | None = None


@dataclass(frozen=True)
class EncoderRingState:
    """Abstract encoder ring state."""

    position: int = 0
    color: SurfaceColor = SurfaceColor.WHITE


@dataclass(frozen=True)
class DisplayFrame:
    """Logical display frame for optional Push screens."""

    title: str = ""
    lines: tuple[str, ...] = ()


@dataclass(frozen=True)
class RenderFrame:
    """Full logical frame for a surface refresh."""

    pad_lights: dict[str, ControlLightState] = field(default_factory=dict)
    button_lights: dict[str, ControlLightState] = field(default_factory=dict)
    encoder_rings: dict[str, EncoderRingState] = field(default_factory=dict)
    display: DisplayFrame | None = None

    @classmethod
    def empty(cls) -> "RenderFrame":
        return cls()
