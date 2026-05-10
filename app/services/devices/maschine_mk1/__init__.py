"""Maschine MK1 device-pack Configurator integration.

Phase 2.1 of the T2499 mega-epic (2026-05-09) registers the
existing Maschine MK1 daemon (under ``app/services/maschine``) as a
first-class Configurator pack.

The pack contributes:
  - ``MaschineMk1Detector`` — reads daemon state to report presence
  - ``MaschineMk1OverrideStore`` — per-installation YAML at
    ``~/.map2/devices/maschine_mk1-overrides.yaml`` (HID + MIDI
    bindings, calibration, profile assignments)
  - ``MaschineMk1LearnEventSource`` — exposes the latest HID event
    from the daemon's ring buffer in the canonical
    ``DeviceLearnEvent`` shape

Subsequent slices (T2499-B Phase 2.2-2.8) build on this foundation:
LCD profiles, LED animations, calibration UI, full T700 onboarding.
"""
from .configurator import (
    MaschineMk1Detector,
    MaschineMk1LearnEventSource,
    MaschineMk1OverrideStore,
    PACK_ID,
    build_registration,
    register_default,
)

__all__ = [
    "MaschineMk1Detector",
    "MaschineMk1LearnEventSource",
    "MaschineMk1OverrideStore",
    "PACK_ID",
    "build_registration",
    "register_default",
]
