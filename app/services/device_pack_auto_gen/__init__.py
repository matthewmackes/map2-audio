"""
T2492 — Device-pack auto-generation from discovery + public info.

When an unknown USB MIDI adapter is detected, this service synthesizes
a draft `.MAP2.yaml` manifest + skeleton XML mapping + skeleton JS
script using:
  - Mixxx VID:PID lookup index at `device-packs/_lookup-index/mixxx-controllers.json`
  - USB-IF vendor table at `device-packs/_lookup-index/usb.ids`

Operator drives a 5-step Carbon Modal wizard from the frontend.
Backend exposes `lookup`, `synthesize`, `commit` as separate ops so
the wizard can let the operator review at each step.

See `docs/architecture/DEVICE_PACK_AUTO_GENERATION.md`.
"""

from .lookup import LookupResult, MixxxLookup, UsbIfLookup
from .synthesis import ManifestSynthesizer, SynthesisResult

__all__ = [
    "LookupResult",
    "MixxxLookup",
    "UsbIfLookup",
    "ManifestSynthesizer",
    "SynthesisResult",
]
