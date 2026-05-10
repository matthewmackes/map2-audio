"""
T2499-B Slice 3 — Maschine MK1 onboarding orchestrator (state machine).

Top-level service that owns the on-initial-connection flow. Drives the
existing daemon primitives (boot_sequence, profile_runtime,
incident_log) in a defined order and writes per-unit calibration to
the Slice-2 calibration store.

Per the T700 audit ([T700_LOCKED_DECISIONS_AUDIT.md] architecture (b)):

- Calibration UI runs as a temporary profile in the Q58/Q67 retained-
  mode render pipeline; this module does NOT render anything itself.
- Calibration data lands at ~/.map2/devices/maschine-mk1-<USB_SERIAL>-
  calibrated.yaml — the global-default layer, NOT snapshot JSONB
  (T700 Q49).
- On USB connect, this module decides between:
    * Q4 hot-load — the unit's calibration file exists; emit a
      `READY` event so the daemon comes alive on the saved profile.
    * Q50 first-connection tour — no file exists; walk the operator
      through the 10-step LCD tour, then the four T2499-B calibration
      phases (pad sensitivity → pressure curves → LCD calibration →
      profile selection), saving each phase incrementally.
- The Q50 ERASE-skip path always saves the default calibration before
  marking the orchestrator complete, so Q4 hot-load on the next
  connect skips the tour even if every phase was skipped.

Slice 3 ships:
- The state machine (transition table + transition guards + observer
  fan-out).
- Helpers for the daemon's USB-connect / disconnect / phase-completion
  signals to drive the machine without owning state itself.
- Tests covering every documented transition + the Q4-vs-Q50 decision
  + skip-completes invariant.

Slice 3 does NOT ship:
- The daemon wiring (boot_sequence subscriber, USB-serial probe).
  Daemon-side wiring is a follow-on slice once the per-USB-serial
  identity probe is added to mk1_usb_transport.
- The calibration phase implementations (pad sweep, pressure fit,
  LCD grid). Those are Slices 4-6.
"""

from __future__ import annotations

import enum
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.services.maschine.calibration_store import (
    MaschineCalibrationStore,
    REQUIRED_CALIBRATION_KEYS,
    default_calibration_payload,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------


class OnboardingState(str, enum.Enum):
    """Orchestrator state. Persisted neither to disk nor across daemon
    restarts — the machine restarts at IDLE when the daemon comes up
    and re-decides based on the on-disk calibration file."""

    IDLE = "idle"  # waiting for USB connect
    DECIDING = "deciding"  # USB connected, classifying Q4 vs Q50
    HOT_LOAD = "hot_load"  # Q4 path: existing calibration found → READY
    TOUR = "tour"  # Q50 step 1-10, before any calibration
    PAD_SENSITIVITY = "pad_sensitivity"  # T2499-B phase 1
    PRESSURE_CURVES = "pressure_curves"  # T2499-B phase 2
    LCD_CALIBRATION = "lcd_calibration"  # T2499-B phase 3
    PROFILE_SELECTION = "profile_selection"  # T2499-B phase 4 (T700 Q68 catalog)
    READY = "ready"  # calibration complete; daemon may activate
    DISCONNECTED = "disconnected"  # USB unplugged mid-flow


# Transition graph. Source state → set of allowed destination states.
# Anything outside this graph is a programming error and raises.
_TRANSITIONS: Dict[OnboardingState, set[OnboardingState]] = {
    OnboardingState.IDLE: {OnboardingState.DECIDING, OnboardingState.DISCONNECTED},
    OnboardingState.DECIDING: {
        OnboardingState.HOT_LOAD,
        OnboardingState.TOUR,
        OnboardingState.DISCONNECTED,
    },
    OnboardingState.HOT_LOAD: {OnboardingState.READY, OnboardingState.DISCONNECTED},
    OnboardingState.TOUR: {
        # Operator can finish the tour and start calibration, OR
        # press ERASE to skip — both land in PAD_SENSITIVITY (the
        # skip path uses defaults, but the state machine still walks
        # through the phases so the orchestrator records each save).
        OnboardingState.PAD_SENSITIVITY,
        OnboardingState.READY,  # full ERASE-skip — write defaults + go straight to ready
        OnboardingState.DISCONNECTED,
    },
    OnboardingState.PAD_SENSITIVITY: {
        OnboardingState.PRESSURE_CURVES,
        OnboardingState.DISCONNECTED,
    },
    OnboardingState.PRESSURE_CURVES: {
        OnboardingState.LCD_CALIBRATION,
        OnboardingState.DISCONNECTED,
    },
    OnboardingState.LCD_CALIBRATION: {
        OnboardingState.PROFILE_SELECTION,
        OnboardingState.DISCONNECTED,
    },
    OnboardingState.PROFILE_SELECTION: {
        OnboardingState.READY,
        OnboardingState.DISCONNECTED,
    },
    OnboardingState.READY: {OnboardingState.DISCONNECTED},
    OnboardingState.DISCONNECTED: {OnboardingState.IDLE},
}


class OnboardingTransitionError(RuntimeError):
    """Raised when the orchestrator is asked for a transition the
    machine doesn't allow. Always indicates a programming bug —
    operator-side state changes should always come through the
    documented signals (`on_usb_connect`, `on_phase_complete`, etc.)."""


# ---------------------------------------------------------------------------
# Event payload — what observers receive on every transition
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OnboardingEvent:
    """Emitted to every observer on every state change."""

    timestamp: datetime
    usb_serial: Optional[str]
    previous_state: OnboardingState
    new_state: OnboardingState
    reason: str
    payload: Dict[str, Any] = field(default_factory=dict)


ObserverCallable = Callable[[OnboardingEvent], None]


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class MaschineOnboardingOrchestrator:
    """Drives the onboarding state machine for one MK1 unit at a time.

    The class is single-instance per MK1 unit — instantiate it on USB
    connect, dispose on USB disconnect. All transitions go through
    `_transition()` which validates the move against `_TRANSITIONS`,
    records the event, and fans out to observers.
    """

    def __init__(
        self,
        *,
        calibration_directory: Optional[Path] = None,
    ) -> None:
        self._directory = calibration_directory
        self._state = OnboardingState.IDLE
        self._usb_serial: Optional[str] = None
        self._store: Optional[MaschineCalibrationStore] = None
        self._observers: List[ObserverCallable] = []
        self._lock = threading.RLock()
        self._history: List[OnboardingEvent] = []

    # -- public surface ----------------------------------------------------

    @property
    def state(self) -> OnboardingState:
        with self._lock:
            return self._state

    @property
    def usb_serial(self) -> Optional[str]:
        with self._lock:
            return self._usb_serial

    @property
    def history(self) -> List[OnboardingEvent]:
        with self._lock:
            return list(self._history)

    def add_observer(self, observer: ObserverCallable) -> None:
        with self._lock:
            self._observers.append(observer)

    def remove_observer(self, observer: ObserverCallable) -> None:
        with self._lock:
            try:
                self._observers.remove(observer)
            except ValueError:
                pass

    # -- signals from the daemon ------------------------------------------

    def on_usb_connect(self, usb_serial: str) -> OnboardingState:
        """Daemon calls this when MK1 enumerates on USB.

        Decision logic:
        - Calibration file exists + valid → HOT_LOAD → READY (Q4).
        - Calibration file absent → TOUR (Q50 first-connection tour).
        - Calibration file exists but corrupt → log warning, fall
          through to TOUR (treat as if absent).
        """
        with self._lock:
            if self._state != OnboardingState.IDLE:
                raise OnboardingTransitionError(
                    f"on_usb_connect() requires IDLE, got {self._state}",
                )
            self._usb_serial = usb_serial
            self._store = MaschineCalibrationStore(
                usb_serial=usb_serial,
                directory=self._directory,
            )
            self._transition(
                OnboardingState.DECIDING,
                reason="usb_connect",
                payload={"usb_serial": usb_serial},
            )
            try:
                existing = self._store.load()
            except Exception as exc:
                logger.warning(
                    "T2499-B onboarding: calibration load raised for serial=%r — "
                    "treating as missing and entering TOUR. exc=%s",
                    usb_serial,
                    exc,
                )
                existing = None
            if existing is not None and self._calibration_complete(existing):
                self._transition(
                    OnboardingState.HOT_LOAD,
                    reason="hot_load",
                    payload={"usb_serial": usb_serial},
                )
                self._transition(
                    OnboardingState.READY,
                    reason="hot_load_ready",
                    payload={"calibrated_at": existing.get("calibrated_at")},
                )
            else:
                self._transition(
                    OnboardingState.TOUR,
                    reason="first_connection_tour",
                    payload={"usb_serial": usb_serial},
                )
            return self._state

    def on_tour_complete(self) -> OnboardingState:
        """Operator advanced past the Q50 10-step tour normally."""
        with self._lock:
            if self._state != OnboardingState.TOUR:
                raise OnboardingTransitionError(
                    f"on_tour_complete() requires TOUR, got {self._state}",
                )
            self._transition(
                OnboardingState.PAD_SENSITIVITY,
                reason="tour_complete",
            )
            return self._state

    def on_skip_calibration(self) -> OnboardingState:
        """Operator pressed ERASE during the Q50 tour to skip the
        whole onboarding flow.

        Per Slice-2 contract, we save the default calibration so the
        next USB-connect takes the Q4 hot-load path even though no
        operator-driven calibration ever happened.
        """
        with self._lock:
            if self._state != OnboardingState.TOUR:
                raise OnboardingTransitionError(
                    f"on_skip_calibration() requires TOUR, got {self._state}",
                )
            assert self._store is not None and self._usb_serial is not None
            self._store.save(default_calibration_payload(self._usb_serial))
            self._transition(
                OnboardingState.READY,
                reason="erase_skip",
                payload={"calibration": "default"},
            )
            return self._state

    def on_phase_complete(
        self,
        phase: OnboardingState,
        section_payload: Any,
    ) -> OnboardingState:
        """Operator finished one calibration phase. Saves the section
        to the per-unit YAML and advances to the next phase.
        """
        with self._lock:
            if self._state != phase:
                raise OnboardingTransitionError(
                    f"on_phase_complete({phase}) requires state={phase}, got {self._state}",
                )
            assert self._store is not None and self._usb_serial is not None
            section_key = self._phase_to_section(phase)
            self._store.update(**{section_key: section_payload})
            next_state = self._next_state_after_phase(phase)
            self._transition(
                next_state,
                reason=f"phase_complete:{phase.value}",
                payload={"section": section_key},
            )
            return self._state

    def on_disconnect(self) -> OnboardingState:
        """USB unplug signal from the daemon."""
        with self._lock:
            if self._state == OnboardingState.DISCONNECTED:
                return self._state
            self._transition(
                OnboardingState.DISCONNECTED,
                reason="usb_disconnect",
            )
            self._usb_serial = None
            self._store = None
            return self._state

    def reset_for_reconnect(self) -> OnboardingState:
        """Daemon calls this after acknowledging a disconnect; returns
        the machine to IDLE so the next connect can decide again."""
        with self._lock:
            if self._state != OnboardingState.DISCONNECTED:
                raise OnboardingTransitionError(
                    f"reset_for_reconnect() requires DISCONNECTED, got {self._state}",
                )
            self._transition(
                OnboardingState.IDLE,
                reason="reset",
            )
            return self._state

    # -- introspection -----------------------------------------------------

    @property
    def store(self) -> Optional[MaschineCalibrationStore]:
        with self._lock:
            return self._store

    # -- internals ---------------------------------------------------------

    def _transition(
        self,
        new_state: OnboardingState,
        *,
        reason: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        previous = self._state
        allowed = _TRANSITIONS.get(previous, set())
        if new_state not in allowed:
            raise OnboardingTransitionError(
                f"Transition {previous} → {new_state} is not allowed "
                f"(allowed: {sorted(s.value for s in allowed)})",
            )
        self._state = new_state
        event = OnboardingEvent(
            timestamp=datetime.now(timezone.utc),
            usb_serial=self._usb_serial,
            previous_state=previous,
            new_state=new_state,
            reason=reason,
            payload=dict(payload or {}),
        )
        self._history.append(event)
        for observer in list(self._observers):
            try:
                observer(event)
            except Exception:
                logger.exception(
                    "T2499-B onboarding observer raised on event %s",
                    event,
                )

    @staticmethod
    def _calibration_complete(payload: Dict[str, Any]) -> bool:
        """Q4 hot-load gate — every required section must be present."""
        return REQUIRED_CALIBRATION_KEYS.issubset(payload.keys())

    @staticmethod
    def _phase_to_section(phase: OnboardingState) -> str:
        return {
            OnboardingState.PAD_SENSITIVITY: "pad_sensitivity",
            OnboardingState.PRESSURE_CURVES: "pressure_curves",
            OnboardingState.LCD_CALIBRATION: "lcd",
            OnboardingState.PROFILE_SELECTION: "selected_profile",
        }[phase]

    @staticmethod
    def _next_state_after_phase(phase: OnboardingState) -> OnboardingState:
        return {
            OnboardingState.PAD_SENSITIVITY: OnboardingState.PRESSURE_CURVES,
            OnboardingState.PRESSURE_CURVES: OnboardingState.LCD_CALIBRATION,
            OnboardingState.LCD_CALIBRATION: OnboardingState.PROFILE_SELECTION,
            OnboardingState.PROFILE_SELECTION: OnboardingState.READY,
        }[phase]
