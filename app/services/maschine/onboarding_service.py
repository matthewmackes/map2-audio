"""T2499-B — process-scoped onboarding service wrapping the orchestrator.

The orchestrator (`MaschineOnboardingOrchestrator`) is a per-unit state
machine with no process-lifetime ownership. This service holds the single
live orchestrator instance for the host, gives the HTTP routes a stable
serialization contract, and exposes the four calibration-phase drivers so an
operator-facing flow (web wizard now; MK1 LCD later) can complete onboarding
end-to-end without the daemon being wired in.

It is the seam between the pure state machine + calibration drivers (slices
2-7, all shipped) and the operator surface (routes + UI). The daemon, when it
later grows a USB-serial probe, drives the same orchestrator via
`on_usb_connect` / `on_disconnect` — this service does not duplicate that
logic, it shares the instance.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.maschine.onboarding_orchestrator import (
    MaschineOnboardingOrchestrator,
    OnboardingEvent,
    OnboardingState,
    OnboardingTransitionError,
)

# Section payload validators live in the calibration store; reused so the
# routes reject malformed phase payloads with the same error class the
# orchestrator's store would raise.
from app.services.maschine.calibration_store import CalibrationSchemaError


# Ordered phases for the operator wizard progress UI.
PHASE_ORDER: List[OnboardingState] = [
    OnboardingState.TOUR,
    OnboardingState.PAD_SENSITIVITY,
    OnboardingState.PRESSURE_CURVES,
    OnboardingState.LCD_CALIBRATION,
    OnboardingState.PROFILE_SELECTION,
    OnboardingState.READY,
]


def _event_to_dict(event: OnboardingEvent) -> Dict[str, Any]:
    return {
        "timestamp": event.timestamp.isoformat(),
        "usb_serial": event.usb_serial,
        "previous_state": event.previous_state.value,
        "new_state": event.new_state.value,
        "reason": event.reason,
        "payload": dict(event.payload),
    }


class MaschineOnboardingService:
    """Owns the single live orchestrator for this host."""

    def __init__(self, *, calibration_directory: Optional[Path] = None) -> None:
        self._lock = threading.RLock()
        self._directory = calibration_directory
        self._orchestrator = MaschineOnboardingOrchestrator(
            calibration_directory=calibration_directory,
        )

    # -- lifecycle ---------------------------------------------------------

    def connect(self, usb_serial: str) -> Dict[str, Any]:
        """Begin (or restart) onboarding for a unit identified by serial.

        Idempotent for the operator: if a previous flow left the machine
        past IDLE for a *different* serial, we reset it first so the web
        wizard can always start cleanly. Mirrors the daemon's
        connect/disconnect/reset cycle without requiring a physical unplug.
        """
        with self._lock:
            current = self._orchestrator.state
            if current != OnboardingState.IDLE:
                # Bring the machine back to IDLE through the documented path
                # so a fresh connect is always legal.
                if current != OnboardingState.DISCONNECTED:
                    self._orchestrator.on_disconnect()
                self._orchestrator.reset_for_reconnect()
            self._orchestrator.on_usb_connect(usb_serial)
            return self.status()

    def tour_complete(self) -> Dict[str, Any]:
        with self._lock:
            self._orchestrator.on_tour_complete()
            return self.status()

    def skip(self) -> Dict[str, Any]:
        with self._lock:
            self._orchestrator.on_skip_calibration()
            return self.status()

    def complete_phase(self, phase: str, payload: Any) -> Dict[str, Any]:
        """Advance one calibration phase with the operator-produced section
        payload (already in the calibration-store schema shape)."""
        with self._lock:
            try:
                phase_state = OnboardingState(phase)
            except ValueError as exc:
                raise CalibrationSchemaError(
                    f"unknown onboarding phase {phase!r}"
                ) from exc
            self._orchestrator.on_phase_complete(phase_state, payload)
            return self.status()

    def disconnect(self) -> Dict[str, Any]:
        with self._lock:
            self._orchestrator.on_disconnect()
            return self.status()

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            if self._orchestrator.state != OnboardingState.DISCONNECTED:
                self._orchestrator.on_disconnect()
            self._orchestrator.reset_for_reconnect()
            return self.status()

    # -- introspection -----------------------------------------------------

    def status(self) -> Dict[str, Any]:
        with self._lock:
            state = self._orchestrator.state
            try:
                phase_index = PHASE_ORDER.index(state)
            except ValueError:
                phase_index = -1
            return {
                "state": state.value,
                "usb_serial": self._orchestrator.usb_serial,
                "phase_index": phase_index,
                "phase_order": [p.value for p in PHASE_ORDER],
                "is_ready": state == OnboardingState.READY,
                "history": [
                    _event_to_dict(e) for e in self._orchestrator.history
                ],
            }

    def calibration(self) -> Optional[Dict[str, Any]]:
        """Current on-disk calibration for the connected unit, if any."""
        with self._lock:
            store = self._orchestrator.store
            if store is None:
                return None
            try:
                return store.load()
            except Exception:
                return None


_service_singleton: Optional[MaschineOnboardingService] = None
_singleton_lock = threading.Lock()


def get_maschine_onboarding_service() -> MaschineOnboardingService:
    """Process-scoped accessor (one orchestrator per host).

    Honors ``MAP2_MASCHINE_DEVICES_DIR`` so deployments / tests can point the
    per-unit calibration YAML at a non-default location.
    """
    global _service_singleton
    if _service_singleton is None:
        with _singleton_lock:
            if _service_singleton is None:
                override = os.environ.get("MAP2_MASCHINE_DEVICES_DIR")
                directory = Path(override).expanduser() if override else None
                _service_singleton = MaschineOnboardingService(
                    calibration_directory=directory,
                )
    return _service_singleton


def reset_maschine_onboarding_service_for_tests() -> None:
    """Test seam — drop the singleton so each test gets a fresh machine."""
    global _service_singleton
    with _singleton_lock:
        _service_singleton = None


__all__ = [
    "MaschineOnboardingService",
    "get_maschine_onboarding_service",
    "reset_maschine_onboarding_service_for_tests",
    "PHASE_ORDER",
]
