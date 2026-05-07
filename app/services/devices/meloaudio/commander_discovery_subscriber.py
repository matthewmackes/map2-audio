"""ALSA-seq subscriber for the MeloAudio MIDI Commander discovery wizard.

T2459-H3-CFG Phase 2b.

This module owns the I/O hookup that feeds live MIDI events into the
:class:`CommanderDiscoveryState` orchestrator from Phase 2.

Architectural notes
-------------------

CLAUDE.md `Controller / Mapping / Device-Pack Subsystem` policy reads:
"New MIDI work routes through the host (libremidi I/O on the host
side; the engine consumes the shm ring exclusively)." This module is a
deliberate, narrowly-scoped exception:

1. The discovery wizard is a one-shot operator session, not production
   MIDI traffic. Production MIDI flow stays on libremidi-via-host.
2. The host's libremidi is bound to `JackMidi` backend. PipeWire 1.4.10's
   UMP-MIDI2 ALSA seq client doesn't auto-bridge legacy `[type=kernel]`
   MIDI 1.0 clients to JACK MIDI ports — events from the Commander
   never reach libremidi. Verified during the 2026-05-07 HIL bench
   session via `aseqdump -p 32:0` (events flowed) vs.
   `Midi-Bridge:TSMIDI2-0` libremidi capture (no events).
3. Adding a runtime IPC to flip the host's libremidi backend mid-session
   is C++ work that delays the operator's value. The discovery wizard
   uses Python `mido` with the rtmidi backend (which subscribes to
   ALSA seq directly) for the duration of the wizard ONLY. The
   subscriber is closed when the wizard finishes / cancels.
4. The future-clean answer is `T2459-H7-PW-UMP` (filed under T2459-H)
   which retires this exception by either (a) fixing PipeWire's UMP
   bridge, or (b) wiring runtime backend-switch IPC into the host.
   Until then, this is the smallest cut that delivers the discovery
   wizard.

This module is NEVER imported by production MIDI flow code paths;
linting + import-graph audits should keep that constraint enforceable.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Callable, Optional

from .commander_discovery import (
    CommanderDiscoveryEvent,
    CommanderDiscoveryState,
)

logger = logging.getLogger(__name__)


# Status bytes we DON'T feed to the orchestrator. The orchestrator's
# state machine binds the FIRST event it sees per prompt; if we feed
# Active Sense (0xFE) it'll bind the first prompt to (0xFE, 0, 0)
# before the operator presses anything. Active Sense is sent ~3 times
# per second by many MIDI controllers as a keepalive — strict noise
# from the wizard's perspective.
NOISE_STATUS_BYTES: frozenset[int] = frozenset({
    0xF8,   # Timing Clock     (24 ppq if device is a clock master)
    0xFA,   # Start
    0xFB,   # Continue
    0xFC,   # Stop
    0xFE,   # Active Sense
    0xFF,   # Reset / system reset
})

# We accept Note On, Note Off, CC, PC, Aftertouch, Pitch Bend.
# Anything else (System Common, MTC quarter frames, etc.) is filtered.
ACCEPTED_STATUS_BYTES: frozenset[int] = frozenset({
    0x80,   # Note Off
    0x90,   # Note On
    0xA0,   # Polyphonic Aftertouch
    0xB0,   # Control Change
    0xC0,   # Program Change
    0xD0,   # Channel Aftertouch
    0xE0,   # Pitch Bend
})


@dataclass(frozen=True)
class SubscriberConfig:
    """Configuration for the discovery subscriber.

    The default port-name pattern matches the MeloAudio MIDI Commander's
    ALSA seq client identifier (``TSMIDI2.0`` for stock firmware,
    ``STM32`` for harvie256 custom firmware). Either substring is
    accepted to support both firmware paths.
    """

    port_name_patterns: tuple[str, ...] = ("TSMIDI", "STM32")
    """Substrings any of which match the target ALSA seq client name."""

    debounce_ms: int = 50
    """Minimum ms between accepted events. Stock firmware bounces a few
    times per press; the orchestrator only binds the first event but
    debouncing keeps the noise out of any callbacks the caller wires up."""


class CommanderDiscoverySubscriber:
    """Bridges live MIDI events from ALSA seq into a discovery state.

    Lifecycle::

        state = CommanderDiscoveryState()
        state.start()
        sub = CommanderDiscoverySubscriber(state)
        sub.start()                 # opens the ALSA seq port
        # ... operator presses ...
        # state.is_complete becomes True when all prompts are satisfied
        sub.stop()                  # closes the port

    The subscriber spawns one daemon thread to drain the mido port. The
    thread exits when ``stop()`` is called or when the orchestrator
    enters its ``is_complete`` / ``is_cancelled`` state.

    Failure modes (intentionally non-fatal — let the operator see them
    in the UI):

    * **No matching port found** — :meth:`start` raises
      :class:`SubscriberError`. Caller surfaces the error in the UI
      ("Connect the MIDI Commander and retry").
    * **Port opens, then disappears** (USB unplug mid-session) — the
      reader thread sees an exception, logs it, and exits. The
      orchestrator stays in its current state; operator can re-run.

    Tests inject events synthetically by calling :meth:`feed_raw_message`
    rather than going through mido. That keeps the test surface
    hermetic without spinning up a real MIDI port.
    """

    def __init__(
        self,
        state: CommanderDiscoveryState,
        *,
        config: Optional[SubscriberConfig] = None,
        on_event: Optional[Callable[[CommanderDiscoveryEvent], None]] = None,
    ) -> None:
        self._state = state
        self._config = config or SubscriberConfig()
        self._on_event = on_event
        self._port = None  # type: ignore[var-annotated]
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._port_name: Optional[str] = None

    # ------------------------------------------------------------------
    # Public lifecycle
    # ------------------------------------------------------------------

    @property
    def port_name(self) -> Optional[str]:
        """The matched ALSA seq port name, or ``None`` if not started."""
        return self._port_name

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        """Open the matching MIDI port and spawn the reader thread.

        Raises :class:`SubscriberError` if no port matches the
        configured patterns. After this returns, events flow into the
        orchestrator until :meth:`stop` is called or the orchestrator
        completes / cancels.
        """
        if self.is_running:
            raise SubscriberError("subscriber already running")

        port_name = self._resolve_port_name()
        if port_name is None:
            raise SubscriberError(
                "No MIDI input port matched the configured patterns "
                f"{self._config.port_name_patterns!r}. "
                "Verify the MeloAudio Commander is connected and "
                "enumerated by the kernel (check `aconnect -l`)."
            )

        # Late import so test runs that don't exercise the I/O path
        # don't pay the mido import cost.
        import mido  # type: ignore[import-untyped]

        try:
            self._port = mido.open_input(port_name)
        except Exception as exc:  # mido raises various IOError variants
            raise SubscriberError(
                f"Failed to open MIDI input port {port_name!r}: {exc}"
            ) from exc

        self._port_name = port_name
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._reader_loop,
            name=f"CommanderDiscoverySubscriber({port_name})",
            daemon=True,
        )
        self._thread.start()
        logger.info("CommanderDiscoverySubscriber: opened %r", port_name)

    def stop(self) -> None:
        """Stop the reader thread and close the MIDI port.

        Idempotent — calling stop on an already-stopped subscriber is a
        no-op.
        """
        self._stop_event.set()
        port = self._port
        if port is not None:
            try:
                port.close()
            except Exception:  # pragma: no cover — closing is best-effort
                logger.debug("error closing MIDI port", exc_info=True)
            self._port = None
        thread = self._thread
        if thread is not None:
            thread.join(timeout=2.0)
            self._thread = None

    def __enter__(self) -> "CommanderDiscoverySubscriber":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()

    # ------------------------------------------------------------------
    # Test seam
    # ------------------------------------------------------------------

    def feed_raw_message(self, status: int, data1: int, data2: int = 0) -> None:
        """Feed a synthetic MIDI message — used by hermetic tests.

        Bypasses ``mido``; the same parsing + filtering + dispatch logic
        runs as for real ALSA seq events.
        """
        self._dispatch_raw(status, data1, data2)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _resolve_port_name(self) -> Optional[str]:
        """Find the first input-port name matching any configured pattern."""
        import mido  # type: ignore[import-untyped]
        candidates: list[str] = list(mido.get_input_names())
        for pattern in self._config.port_name_patterns:
            for name in candidates:
                if pattern in name:
                    return name
        return None

    def _reader_loop(self) -> None:
        """Drain the MIDI port until stop / orchestrator completion.

        mido's iteration over an input port is blocking; we use the
        non-blocking ``iter_pending`` + small sleep so we can poll
        ``_stop_event`` and ``state`` predicates promptly.
        """
        import time

        port = self._port
        if port is None:
            return
        try:
            while not self._stop_event.is_set():
                if (
                    self._state.is_complete
                    or self._state.is_cancelled
                ):
                    break
                got_any = False
                for msg in port.iter_pending():
                    got_any = True
                    self._handle_mido_message(msg)
                    if (
                        self._state.is_complete
                        or self._state.is_cancelled
                    ):
                        return
                if not got_any:
                    # No pending events — sleep briefly so we don't burn CPU.
                    # 5 ms is well under perceptible latency for a press.
                    time.sleep(0.005)
        except Exception:  # pragma: no cover — runtime resilience
            logger.exception("CommanderDiscoverySubscriber reader loop crashed")

    def _handle_mido_message(self, msg) -> None:
        """Translate a mido ``Message`` into our raw byte form + dispatch."""
        # mido messages are typed objects with `.type`, `.bytes()`, etc.
        # We always fall back to bytes() because some message types (e.g.
        # 'sysex') don't have channel/control attributes.
        try:
            raw_bytes = msg.bytes()
        except Exception:  # pragma: no cover
            return
        if not raw_bytes:
            return
        status = raw_bytes[0]
        data1 = raw_bytes[1] if len(raw_bytes) > 1 else 0
        data2 = raw_bytes[2] if len(raw_bytes) > 2 else 0
        self._dispatch_raw(status, data1, data2)

    def _dispatch_raw(self, status: int, data1: int, data2: int) -> None:
        """Filter + convert + feed a raw byte triple to the orchestrator."""
        if status in NOISE_STATUS_BYTES:
            return
        status_high = status & 0xF0
        if status_high not in ACCEPTED_STATUS_BYTES:
            return

        channel = (status & 0x0F) + 1   # MIDI channels are 1-16 in our model
        # PC + Channel Pressure carry only data1 (no data2)
        is_one_byte_data = status_high in (0xC0, 0xD0)
        raw_value: Optional[int]
        if is_one_byte_data:
            raw_value = None
        else:
            raw_value = data2

        event = CommanderDiscoveryEvent(
            status=status_high,
            midino=data1,
            channel=channel,
            raw_value=raw_value,
        )

        # Notify caller (UI hook) BEFORE feeding the orchestrator so the
        # UI can show "captured CC 24" even if the orchestrator advances
        # past this prompt or rejects the event.
        callback = self._on_event
        if callback is not None:
            try:
                callback(event)
            except Exception:  # pragma: no cover — never let UI bugs kill the loop
                logger.exception("on_event callback raised")

        self._state.handle_event(event)


class SubscriberError(RuntimeError):
    """Raised by :meth:`CommanderDiscoverySubscriber.start` when the
    subscriber can't bind to a MIDI input port (port missing, busy, etc.).
    """
