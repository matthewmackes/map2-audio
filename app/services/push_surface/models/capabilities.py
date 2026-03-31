"""Capability and color models for the Push surface subsystem."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class CapabilityTier(str, Enum):
    """Capability tiers exposed by a surface profile."""

    GENERIC_MIDI = "generic_midi"
    ENHANCED_SURFACE = "enhanced_surface"
    ADVANCED_DISPLAY = "advanced_display"


class MappingConfidence(str, Enum):
    """Confidence tags for hardware mappings and protocol assumptions."""

    CONFIRMED = "CONFIRMED"
    INFERRED = "INFERRED"
    UNVERIFIED = "UNVERIFIED"


class SurfaceColor(str, Enum):
    """Abstract palette that profiles map to device-specific values."""

    OFF = "OFF"
    DIM = "DIM"
    WHITE = "WHITE"
    BLUE = "BLUE"
    CYAN = "CYAN"
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    AMBER = "AMBER"
    ORANGE = "ORANGE"
    RED = "RED"
    MAGENTA = "MAGENTA"


@dataclass(frozen=True)
class DeviceCapabilities:
    """Feature matrix for a discovered surface."""

    pad_columns: int = 8
    pad_rows: int = 8
    supports_leds: bool = True
    supports_encoder_rings: bool = False
    supports_display: bool = False
    supports_aftertouch: bool = False
    supports_poly_aftertouch: bool = False
    supports_touchstrip: bool = False
    supports_encoder_touch: bool = False
    supported_tiers: tuple[CapabilityTier, ...] = (CapabilityTier.GENERIC_MIDI,)
    mapping_confidence: MappingConfidence = MappingConfidence.UNVERIFIED
