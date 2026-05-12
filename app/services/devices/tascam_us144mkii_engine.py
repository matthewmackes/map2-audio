"""T2515-4 — engine-side guards specific to the TASCAM US-144MKII.

Two guards live here:

1. ``ensure_jack_direct_or_raise()`` — the US-144MKII suffers ~5 ms scheduling
   jitter under ALSA-via-PipeWire, per the standing platform rule
   ``MAP2_AUDIO_PREFER_JACK=1`` (feedback_jack_direct_required.md). Tier-1 boot
   for this device refuses to come up unless that env var is set.

2. ``apply_sample_rate_change()`` — the snd-usb-us144mkii driver hangs when a
   sample-rate change is issued mid-stream. This helper enforces a
   stop-streams → switch → restart sequence. It also enforces the Tier A lock
   (48 kHz only) so the engine cannot accidentally drive this device at
   another rate even if a caller bypasses the API-level lock.

Both helpers are intentionally engine-side primitives — no FastAPI imports,
no router code — so they can be called from the JUCE service boot path
without dragging the web layer into a test rig.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional, Protocol

logger = logging.getLogger(__name__)

# Tier A lock: 48 kHz only on the tier-1 ship of this device.
TIER1_SAMPLE_RATE = 48000

# Standing platform rule from feedback_jack_direct_required.md.
JACK_DIRECT_ENV_VAR = "MAP2_AUDIO_PREFER_JACK"
JACK_DIRECT_ENV_VALUE = "1"


class JackDirectRequiredError(RuntimeError):
    """Raised when boot is attempted without MAP2_AUDIO_PREFER_JACK=1."""


class SampleRateLockedError(ValueError):
    """Raised when a caller tries to drive this device off-tier1 SR."""


@dataclass(frozen=True)
class SampleRateChangeResult:
    requested_rate: int
    applied_rate: int
    streams_were_running: bool
    streams_restarted: bool


# ----------------------------------------------------------------------------
# Public guards
# ----------------------------------------------------------------------------

def ensure_jack_direct_or_raise(environ: Optional[dict] = None) -> None:
    """Refuse to boot the device through ALSA-via-PipeWire.

    The systemd unit bakes ``MAP2_AUDIO_PREFER_JACK=1`` per T2498, but the
    operator can still set up a non-systemd run (test rig, dev shell). This
    guard is the explicit gate.
    """
    env = environ if environ is not None else os.environ
    if env.get(JACK_DIRECT_ENV_VAR) != JACK_DIRECT_ENV_VALUE:
        raise JackDirectRequiredError(
            "TASCAM US-144MKII tier-1 requires MAP2_AUDIO_PREFER_JACK=1 in the "
            "environment to avoid ALSA-via-PipeWire scheduling jitter (~5 ms). "
            "Export MAP2_AUDIO_PREFER_JACK=1 or run via the map2-backend systemd "
            "unit which bakes this in (see T2498)."
        )


class _EngineLike(Protocol):
    """Minimal duck-typed protocol over the JUCE-engine binding."""

    def stop_audio(self) -> None: ...
    def start_audio(self) -> None: ...
    def is_audio_running(self) -> bool: ...
    def set_sample_rate(self, rate: int) -> None: ...


def apply_sample_rate_change(engine: _EngineLike,
                             requested_rate: int,
                             *,
                             allow_off_tier1: bool = False) -> SampleRateChangeResult:
    """Safely apply a sample-rate change on the US-144MKII.

    The driver hangs if PCM streams are open during a sample-rate change.
    This helper:

      1. Refuses any rate other than 48 kHz unless ``allow_off_tier1=True``.
      2. Stops audio if running.
      3. Issues ``set_sample_rate``.
      4. Restarts audio iff it was running before.

    Returns a :class:`SampleRateChangeResult` describing what happened.
    """
    if requested_rate != TIER1_SAMPLE_RATE and not allow_off_tier1:
        raise SampleRateLockedError(
            f"TASCAM US-144MKII tier-1 is pinned to {TIER1_SAMPLE_RATE} Hz "
            f"(Tier A lock). Requested {requested_rate} Hz refused. "
            f"Pass allow_off_tier1=True only from operator-confirmed flows."
        )

    was_running = bool(engine.is_audio_running())
    if was_running:
        logger.info(
            "tascam.us144mkii.sr_change stop_audio_first rate=%d (was_running=True)",
            requested_rate,
        )
        engine.stop_audio()

    engine.set_sample_rate(requested_rate)

    if was_running:
        logger.info(
            "tascam.us144mkii.sr_change restart_audio rate=%d",
            requested_rate,
        )
        engine.start_audio()

    return SampleRateChangeResult(
        requested_rate=requested_rate,
        applied_rate=requested_rate,
        streams_were_running=was_running,
        streams_restarted=was_running,
    )
