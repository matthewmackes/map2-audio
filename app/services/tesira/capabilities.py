"""
Tesira family capability registry.

Maps detected device model strings to normalized capability envelopes used by
API/UI layers for feature gating.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class TesiraCapabilities:
    model_family: str
    analog_inputs: int
    analog_outputs: int
    usb_channels: int
    avb_max_channels: int
    aec_channels: int
    gpio_count: int
    rs232: bool
    dsp_partitions: int


_CAPABILITY_REGISTRY: Dict[str, TesiraCapabilities] = {
    # Forte family
    "FORTE_CI": TesiraCapabilities("FORTE_CI", 12, 8, 0, 128, 0, 4, False, 1),
    "FORTE_X": TesiraCapabilities("FORTE_X", 8, 8, 8, 128, 0, 4, False, 1),
    "FORTE_DAN_CI": TesiraCapabilities("FORTE_DAN_CI", 12, 8, 0, 128, 0, 4, False, 1),
    # Server family
    "SERVER_IO": TesiraCapabilities("SERVER_IO", 0, 0, 0, 420, 0, 8, True, 4),
    "SERVER": TesiraCapabilities("SERVER", 0, 0, 0, 420, 0, 8, True, 4),
    # Fallback
    "UNKNOWN": TesiraCapabilities("UNKNOWN", 0, 0, 0, 128, 0, 0, False, 1),
}


def _normalize_model(model: Optional[str]) -> str:
    raw = (model or "").strip().upper().replace("-", "_").replace(" ", "_")
    if not raw:
        return "UNKNOWN"
    if "FORTE" in raw and "DAN" in raw and "CI" in raw:
        return "FORTE_DAN_CI"
    if "FORTE" in raw and "CI" in raw:
        return "FORTE_CI"
    if "FORTE" in raw and "X" in raw:
        return "FORTE_X"
    if "SERVER" in raw and "IO" in raw:
        return "SERVER_IO"
    if "SERVER" in raw:
        return "SERVER"
    return "UNKNOWN"


def get_capabilities_for_model(model: Optional[str]) -> TesiraCapabilities:
    key = _normalize_model(model)
    return _CAPABILITY_REGISTRY.get(key, _CAPABILITY_REGISTRY["UNKNOWN"])


def capabilities_to_dict(caps: TesiraCapabilities) -> Dict[str, object]:
    return asdict(caps)

