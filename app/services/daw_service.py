"""T2503 Set 3 — DAW service Python facade.

Thin Python-side facade for the MAP2-native DAW core (juce-engine/Source/Daw/).
The C++ engine owns the audio callback and the ModeSwitchCoordinator state
machine; this module exposes the mode-switch surface to FastAPI and the
engine_command bus.

When the engine is built without ``-DMAP2_DAW_MODE=ON``, every operation
returns the standard error envelope with ``code: "daw_mode_unavailable"`` and
HTTP 503. This keeps the FastAPI route surface registered (so OpenAPI is
stable across builds) while making it impossible to accidentally drive a
flag-OFF engine into DAW mode.
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class EngineMode(str, Enum):
    """Mirrors map2::daw::EngineMode in juce-engine/Source/Daw/ModeSwitchCoordinator.h."""

    LIVE = "live"
    DAW = "daw"


class TransitionState(str, Enum):
    """Mirrors map2::daw::TransitionState."""

    IDLE = "idle"
    STOPPING = "stopping"
    RELEASING = "releasing"
    INITIALIZING = "initializing"
    RUNNING = "running"


@dataclass
class DawModeStatus:
    """Snapshot of the DAW mode coordinator state."""

    mode: EngineMode
    state: TransitionState
    daw_mode_available: bool
    last_error: Optional[str] = None


class DawModeUnavailableError(RuntimeError):
    """Raised when an operation is requested on a flag-OFF engine."""


class DawService:
    """Python facade over the C++ ModeSwitchCoordinator.

    The C++ side runs the actual state machine; this class provides a thread-
    safe Python view + a pluggable engine bridge for tests and for the
    flag-OFF case. Set 4 will replace the in-process bridge with the real
    engine_command IPC; for Set 3 the bridge is in-memory.
    """

    def __init__(
        self,
        *,
        daw_mode_available: Optional[bool] = None,
        bridge: Optional["DawEngineBridge"] = None,
    ) -> None:
        self._lock = threading.Lock()
        self._mode = EngineMode.LIVE
        self._state = TransitionState.RUNNING
        self._last_error: Optional[str] = None
        self._daw_mode_available = (
            daw_mode_available
            if daw_mode_available is not None
            else _detect_daw_mode_build_flag()
        )
        self._bridge = bridge

    @property
    def daw_mode_available(self) -> bool:
        return self._daw_mode_available

    def status(self) -> DawModeStatus:
        with self._lock:
            return DawModeStatus(
                mode=self._mode,
                state=self._state,
                daw_mode_available=self._daw_mode_available,
                last_error=self._last_error,
            )

    def request_mode_switch(self, target: EngineMode) -> DawModeStatus:
        if not self._daw_mode_available:
            raise DawModeUnavailableError(
                "MAP2_DAW_MODE not enabled in this build"
            )
        with self._lock:
            self._last_error = None
            if self._mode == target and self._state == TransitionState.RUNNING:
                # Idempotent — match the C++ coordinator's behavior.
                logger.info("daw.mode: already in %s, no-op", target.value)
                return DawModeStatus(
                    mode=self._mode,
                    state=self._state,
                    daw_mode_available=True,
                )
            # Drive the engine bridge if we have one (Set 4 replaces this with
            # the engine_command path). For Set 3 the bridge is optional —
            # without one, we simulate the synchronous-completion case (every
            # transition completes immediately) so the API contract is stable
            # and tests can exercise it without an engine.
            self._state = TransitionState.STOPPING
        if self._bridge is not None:
            self._bridge.request_mode_switch(target)
        else:
            self._simulate_completion(target)
        return self.status()

    def _simulate_completion(self, target: EngineMode) -> None:
        """In-memory transition for the bridge-less default path.

        Mirrors the C++ state machine in shape so callers see the same final
        state. Set 4 wires this through the real IPC.
        """
        with self._lock:
            self._state = TransitionState.RELEASING
        with self._lock:
            self._state = TransitionState.INITIALIZING
        with self._lock:
            self._mode = target
            self._state = TransitionState.RUNNING

    # --- engine bridge callbacks (Set 4 wires these to engine_command) ---
    def on_state_changed(self, state: TransitionState) -> None:
        with self._lock:
            self._state = state

    def on_mode_changed(self, mode: EngineMode) -> None:
        with self._lock:
            self._mode = mode

    def on_error(self, message: str) -> None:
        with self._lock:
            self._last_error = message
            self._state = TransitionState.RUNNING


class DawEngineBridge:
    """Interface between the Python facade and the engine.

    Set 3 ships an in-memory simulator; Set 4 will introduce a real
    engine_command-based implementation.
    """

    def request_mode_switch(self, target: EngineMode) -> None:
        raise NotImplementedError


def _detect_daw_mode_build_flag() -> bool:
    """Detect whether the running juce-engine binary was built with
    ``-DMAP2_DAW_MODE=ON``.

    Set 3 supports an env-override: ``MAP2_DAW_MODE_AVAILABLE=1`` flips the
    Python facade into available state without inspecting the binary. This is
    primarily for tests and for flag-OFF deployments where an operator wants
    to see what the route surface would look like (returns 200 with simulated
    state). Set 4 replaces this with a real engine handshake over
    engine_command.
    """
    return os.environ.get("MAP2_DAW_MODE_AVAILABLE", "0") == "1"


# Singleton accessor — kept simple. The route module gets the same instance
# across a process. Tests can construct fresh DawService() instances for
# isolation (the route module re-binds via dependency injection).
_DEFAULT_INSTANCE: Optional[DawService] = None


def get_daw_service() -> DawService:
    global _DEFAULT_INSTANCE
    if _DEFAULT_INSTANCE is None:
        _DEFAULT_INSTANCE = DawService()
    return _DEFAULT_INSTANCE


def reset_default_daw_service() -> None:
    """Test-only helper to clear the singleton so each test gets a fresh facade."""
    global _DEFAULT_INSTANCE
    _DEFAULT_INSTANCE = None
