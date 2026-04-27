"""Heuristic classifier for the MIDI learn wizard.

T2459-D4. Pattern reference: Mixxx ``learningutils.cpp`` (325 lines,
GPLv2-or-later) — algorithmic inspiration only; this is a clean
MAP2-authored rewrite.

Given a sequence of inbound MIDI bytes captured while the operator
wiggled a hardware control, classify the control type:

- ``button`` — single status with a clear on/off pair.
- ``knob_absolute`` — CC with monotonic-ish progression hitting near
  the full 0-127 range; a typical pot/fader signature.
- ``knob_relative`` — CC with values clustering around 1/127 (signed
  magnitude) or a small set near 64 (two's-complement); typical
  encoder signature.
- ``encoder_14bit`` — a CC pair (MSB+LSB) with status/midino offset
  by 32 — Mixxx 14-bit encoder convention.
- ``pitch_bend`` — status 0xE0..0xEF.
- ``unknown`` — none of the above; the wizard surfaces a "couldn't
  classify, please pick manually" prompt.

Architecture: ``docs/architecture/CONTROLLER_LAYER.md`` §2.1.
"""

from __future__ import annotations

import dataclasses
import logging
from typing import Iterable

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class CapturedMessage:
    """One MIDI message observed during the learn capture window."""

    timestamp_ns: int
    bytes: tuple[int, ...]


@dataclasses.dataclass(frozen=True)
class ClassificationResult:
    """The heuristic's verdict on a captured sequence."""

    kind: str
    confidence: float        # 0.0 - 1.0
    status: int | None
    midino: int | None
    channel: int | None
    notes: str = ""


def classify(messages: Iterable[CapturedMessage]) -> ClassificationResult:
    """Classify a captured stream into a control type.

    Returns ``ClassificationResult(kind="unknown", ...)`` if the
    stream is empty or doesn't match any known pattern.
    """
    msgs = list(messages)
    if not msgs:
        return ClassificationResult(
            kind="unknown", confidence=0.0,
            status=None, midino=None, channel=None,
            notes="empty capture",
        )

    # Reduce to messages with at least 2 bytes (status + data1).
    valid = [m for m in msgs if len(m.bytes) >= 2]
    if not valid:
        return ClassificationResult(
            kind="unknown", confidence=0.0,
            status=None, midino=None, channel=None,
            notes="no messages with status+data1",
        )

    # Most common status byte.
    statuses = [m.bytes[0] for m in valid]
    primary_status = max(set(statuses), key=statuses.count)
    primary_messages = [m for m in valid if m.bytes[0] == primary_status]
    coverage = len(primary_messages) / len(valid)

    # MIDI status nibble + channel.
    status_high = primary_status & 0xF0
    channel = (primary_status & 0x0F) + 1

    # ---- Pitch bend (0xE0..0xEF) ----
    if status_high == 0xE0:
        return ClassificationResult(
            kind="pitch_bend", confidence=0.9 * coverage,
            status=primary_status, midino=None, channel=channel,
            notes="pitch bend status range",
        )

    # ---- Note-on / note-off → button ----
    if status_high in (0x80, 0x90):
        midino = primary_messages[0].bytes[1] if primary_messages else None
        return ClassificationResult(
            kind="button", confidence=0.85 * coverage,
            status=primary_status, midino=midino, channel=channel,
            notes="note on/off pair",
        )

    # ---- CC (0xB0..0xBF) — knob_absolute / knob_relative / encoder_14bit ----
    if status_high == 0xB0:
        # Pick the most common (status, midino) pair.
        pairs = [(m.bytes[0], m.bytes[1]) for m in primary_messages]
        primary_pair = max(set(pairs), key=pairs.count)
        primary_pair_msgs = [m for m in primary_messages
                              if (m.bytes[0], m.bytes[1]) == primary_pair]
        midino = primary_pair[1]

        values = [m.bytes[2] for m in primary_pair_msgs if len(m.bytes) >= 3]
        if not values:
            return ClassificationResult(
                kind="unknown", confidence=0.0,
                status=primary_status, midino=midino, channel=channel,
                notes="CC without value byte",
            )

        # 14-bit encoder pair: an MSB at midino N + an LSB at midino N+32
        # (the Mixxx convention). Either N or N+32 may show up first as
        # the "primary" — check both directions before locking in a
        # mono-CC classification.
        partner_candidates = []
        if midino + 32 <= 127:
            partner_candidates.append(midino + 32)
        if midino - 32 >= 0:
            partner_candidates.append(midino - 32)
        partner_midino: int | None = None
        for candidate in partner_candidates:
            if any(
                (m.bytes[0] & 0xF0) == 0xB0 and m.bytes[1] == candidate
                for m in valid
            ):
                partner_midino = candidate
                break
        if partner_midino is not None:
            return ClassificationResult(
                kind="encoder_14bit", confidence=0.85 * coverage,
                status=primary_status, midino=midino, channel=channel,
                notes=f"14-bit pair with CC {partner_midino}",
            )

        # Disambiguate {0, 127}-only: that's a binary button on a CC
        # (some controllers do this for stateful buttons), not a
        # signed-magnitude encoder. SM-relative encoders emit a `1`
        # for forward ticks. Require a real `1` before claiming SM.
        unique_values = set(values)
        if unique_values.issubset({0, 127}):
            return ClassificationResult(
                kind="button", confidence=0.7 * coverage,
                status=primary_status, midino=midino, channel=channel,
                notes="CC with binary on/off values",
            )

        # Relative encoder: values cluster around 1/127 (signed-magnitude
        # — must contain a `1`) or 62-66 (two's-complement near zero).
        sm_relative = (
            unique_values.issubset({0, 1, 127})
            and 1 in unique_values
        )
        tc_relative = unique_values.issubset({62, 63, 64, 65, 66})
        if sm_relative or tc_relative:
            return ClassificationResult(
                kind="knob_relative", confidence=0.85 * coverage,
                status=primary_status, midino=midino, channel=channel,
                notes=("signed-magnitude" if sm_relative else "two's-complement"),
            )

        # Absolute knob: values span a meaningful range.
        value_range = (max(values) - min(values)) if values else 0
        if value_range >= 32:
            return ClassificationResult(
                kind="knob_absolute", confidence=0.85 * coverage,
                status=primary_status, midino=midino, channel=channel,
                notes=f"absolute range {min(values)}-{max(values)}",
            )

        return ClassificationResult(
            kind="unknown", confidence=0.4 * coverage,
            status=primary_status, midino=midino, channel=channel,
            notes=f"CC with narrow range ({min(values)}-{max(values)})",
        )

    # ---- Unknown status family ----
    return ClassificationResult(
        kind="unknown", confidence=0.0,
        status=primary_status, midino=None, channel=channel,
        notes=f"unrecognised status family 0x{status_high:02X}",
    )
