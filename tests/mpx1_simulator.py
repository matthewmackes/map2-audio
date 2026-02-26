"""
MPX-1 SysEx Simulator.

Emulates the MIDI I/O behaviour of a Lexicon MPX-1 for offline testing.

Wire into MPX1Service by setting the environment variable MPX1_SIMULATOR=1
before constructing the service (only effective when python-rtmidi is absent).

Usage in tests::

    import os
    os.environ["MPX1_SIMULATOR"] = "1"
    from app.services.mpx1_service import get_mpx1_service
    svc = get_mpx1_service()
    # svc will use the simulator for MIDI I/O

The simulator stores a param state dict keyed by (addr_b0, addr_b1, addr_b2, addr_b3).
On each incoming SysEx write, it records the value and emits an echo reply
(the same message as a readback) to the `on_message` callback.

Configurable drop/jitter::

    sim = MPX1Simulator(drop_rate=0.05, jitter_max_ms=10)
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import Any, Callable, Dict, List, Optional, Tuple


_SYSEX_PREFIX = [0xF0, 0x06, 0x7F, 0x11]
_SYSEX_SUFFIX = 0xF7


def _encode_14bit(value: int) -> Tuple[int, int]:
    value = max(0, min(16383, int(value)))
    lo = value & 0x7F
    hi = (value >> 7) & 0x7F
    return lo, hi


def _decode_14bit(lo: int, hi: int) -> int:
    return ((int(hi) & 0x7F) << 7) | (int(lo) & 0x7F)


def _valid_sysex(message: List[int]) -> bool:
    if len(message) < 11:
        return False
    return (
        message[:4] == _SYSEX_PREFIX
        and message[-1] == _SYSEX_SUFFIX
    )


class MPX1Simulator:
    """Software emulation of the MPX-1 MIDI SysEx interface.

    Parameters
    ----------
    drop_rate:
        Probability (0.0–1.0) that an incoming message is silently dropped
        (simulates unreliable MIDI links).  Default 0 (no drops).
    jitter_max_ms:
        Maximum additional reply latency in milliseconds.  The simulator adds
        a uniform random delay in [0, jitter_max_ms] before delivering the
        echo reply.  Default 0 (no jitter).
    """

    def __init__(self, drop_rate: float = 0.0, jitter_max_ms: float = 0.0) -> None:
        self.drop_rate = max(0.0, min(1.0, float(drop_rate)))
        self.jitter_max_ms = max(0.0, float(jitter_max_ms))

        # Internal parameter state: address_tuple → 14-bit value
        self._params: Dict[Tuple[int, int, int, int], int] = {}
        self._current_program: int = 0

        # Callbacks: list of callables that receive List[int] (SysEx) or MIDI bytes
        self._on_sysex: List[Callable[[List[int]], None]] = []
        self._on_program_change: List[Callable[[int], None]] = []

        # Stats
        self.rx_count: int = 0
        self.tx_count: int = 0
        self.dropped_count: int = 0

    # -------------------------------------------------------------------------
    # Subscription API
    # -------------------------------------------------------------------------

    def add_sysex_listener(self, cb: Callable[[List[int]], None]) -> None:
        """Register a callback to receive outgoing SysEx reply messages."""
        self._on_sysex.append(cb)

    def add_program_change_listener(self, cb: Callable[[int], None]) -> None:
        """Register a callback invoked on program-change events."""
        self._on_program_change.append(cb)

    # -------------------------------------------------------------------------
    # Receive from host (write path)
    # -------------------------------------------------------------------------

    def receive(self, message: List[int]) -> Optional[List[int]]:
        """Process an incoming MIDI/SysEx message from the host controller.

        Returns the reply message (or None if dropped/not applicable).
        Also fires registered callbacks.
        """
        self.rx_count += 1

        # Simulate packet loss
        if self.drop_rate > 0.0 and random.random() < self.drop_rate:
            self.dropped_count += 1
            return None

        if not message:
            return None

        status = int(message[0]) & 0xFF

        # --- SysEx parameter write ---
        if status == 0xF0 and _valid_sysex(message):
            return self._handle_param_write(message)

        # --- Program change (C0 channel 1) ---
        if (status & 0xF0) == 0xC0:
            program = int(message[1]) & 0x7F if len(message) > 1 else 0
            self._current_program = program
            for cb in self._on_program_change:
                cb(program)
            return None

        return None

    async def receive_async(self, message: List[int]) -> Optional[List[int]]:
        """Async wrapper with optional jitter delay before callback delivery."""
        if self.jitter_max_ms > 0.0:
            delay = random.uniform(0.0, self.jitter_max_ms / 1000.0)
            await asyncio.sleep(delay)
        return self.receive(message)

    # -------------------------------------------------------------------------
    # Internal handlers
    # -------------------------------------------------------------------------

    def _handle_param_write(self, message: List[int]) -> List[int]:
        """Store the parameter value and return an echo readback."""
        address: Tuple[int, int, int, int] = tuple(int(v) & 0x7F for v in message[4:8])  # type: ignore[assignment]
        lo = int(message[8]) & 0x7F
        hi = int(message[9]) & 0x7F
        value = _decode_14bit(lo, hi)
        self._params[address] = value

        # Echo the same message back as a readback
        reply = list(message)
        self.tx_count += 1
        for cb in self._on_sysex:
            cb(reply)
        return reply

    # -------------------------------------------------------------------------
    # Query state
    # -------------------------------------------------------------------------

    def get_param(self, address: Tuple[int, int, int, int]) -> Optional[int]:
        """Return stored 14-bit value for address, or None if not written."""
        return self._params.get(address)

    def get_all_params(self) -> Dict[Tuple[int, int, int, int], int]:
        """Return a copy of the full param state."""
        return dict(self._params)

    def get_program(self) -> int:
        """Return current program number."""
        return self._current_program

    def reset(self) -> None:
        """Clear all stored param values and reset program."""
        self._params.clear()
        self._current_program = 0
        self.rx_count = 0
        self.tx_count = 0
        self.dropped_count = 0

    # -------------------------------------------------------------------------
    # Convenience: build SysEx message (same format as MPX1Service)
    # -------------------------------------------------------------------------

    @staticmethod
    def build_sysex(address: Tuple[int, int, int, int], value: int) -> List[int]:
        """Build a valid MPX-1-style SysEx message for the given address + value."""
        addr_bytes = [int(v) & 0x7F for v in address]
        lo, hi = _encode_14bit(value)
        return [*_SYSEX_PREFIX, *addr_bytes, lo, hi, _SYSEX_SUFFIX]

    def inject_param(self, address: Tuple[int, int, int, int], value: int) -> None:
        """Inject a simulated hardware-initiated parameter change (fires callbacks)."""
        message = self.build_sysex(address, value)
        self._params[address] = value
        self.tx_count += 1
        for cb in self._on_sysex:
            cb(message)


# ---------------------------------------------------------------------------
# Integration glue: SimulatedMidiOut / SimulatedMidiIn
# ---------------------------------------------------------------------------

class SimulatedMidiOut:
    """Drop-in replacement for rtmidi.MidiOut used when MPX1_SIMULATOR=1."""

    def __init__(self, simulator: MPX1Simulator) -> None:
        self._sim = simulator

    def send_message(self, message: List[int]) -> None:
        self._sim.receive(message)

    def open_port(self, index: int) -> None:  # noqa: D401
        pass

    def close_port(self) -> None:
        pass


class SimulatedMidiIn:
    """Drop-in replacement for rtmidi.MidiIn used when MPX1_SIMULATOR=1.

    Queues replies produced by the simulator so _midi_poll_loop() can read them.
    """

    def __init__(self, simulator: MPX1Simulator) -> None:
        self._sim = simulator
        self._queue: asyncio.Queue = asyncio.Queue()
        self._sim.add_sysex_listener(self._enqueue)

    def _enqueue(self, message: List[int]) -> None:
        try:
            self._queue.put_nowait((message, 0.0))
        except asyncio.QueueFull:
            pass

    def get_message(self) -> Optional[Tuple[List[int], float]]:
        """Non-blocking get (mirrors rtmidi API)."""
        try:
            return self._queue.get_nowait()
        except Exception:
            return None

    def open_port(self, index: int) -> None:
        pass

    def close_port(self) -> None:
        pass

    def ignore_types(self, **kwargs: Any) -> None:
        pass


# ---------------------------------------------------------------------------
# Module-level singleton used by MPX1Service integration
# ---------------------------------------------------------------------------

_global_simulator: Optional[MPX1Simulator] = None


def get_simulator(drop_rate: float = 0.0, jitter_max_ms: float = 0.0) -> MPX1Simulator:
    """Return (creating if needed) the global simulator instance."""
    global _global_simulator
    if _global_simulator is None:
        _global_simulator = MPX1Simulator(drop_rate=drop_rate, jitter_max_ms=jitter_max_ms)
    return _global_simulator


def reset_simulator() -> None:
    """Reset the global simulator (useful between tests)."""
    global _global_simulator
    if _global_simulator is not None:
        _global_simulator.reset()
    _global_simulator = None
