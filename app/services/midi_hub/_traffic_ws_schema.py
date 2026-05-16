"""Canonical Pydantic schemas for the midi:traffic WebSocket frame envelope.

Run-14c cycle 2 (2026-05-16). Third application of the run-14b pick #1
canonical-schema pattern (after `_meter_ws_schema.py` + `_events_ws_schema.py`).

One frame topic — `midi:traffic` — emitted by:
  - `MidiRouter._emit_traffic_event()` (routed-outbound events)
  - `InboundMidiTrafficBridge._publish()` (raw-inbound events)

Both emitters share the same payload shape (`direction` field
discriminates inbound vs outbound) so a single schema covers both.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Canonical wire-protocol constants
# ---------------------------------------------------------------------------

TRAFFIC_FRAME_TYPE = "midi:traffic"
SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# Decoded MIDI message body
# ---------------------------------------------------------------------------


# `message_type` is open-ended (parser uses a status-family mapping
# table + falls back to "system"). We pin the common cases as a Literal
# but accept arbitrary strings so a future parser extension doesn't
# require a schema bump.
MidiMessageType = Literal[
    "note_on",
    "note_off",
    "polypressure",
    "cc",
    "program",
    "aftertouch",
    "pitchbend",
    "system",
]


class DecodedMidiMessage(BaseModel):
    """Parsed MIDI message body. Mirrors `MidiRouter._parse_message()` output."""

    message_type: str = Field(
        ...,
        description=(
            "MIDI message class. Standard values: note_on / note_off / "
            "polypressure / cc / program / aftertouch / pitchbend / system. "
            "Open string type so future parser extensions don't bump the schema."
        ),
    )
    channel: int = Field(
        ...,
        ge=0,
        le=15,
        description="MIDI channel (0-15).",
    )
    data1: int = Field(..., ge=0, le=255, description="Status byte data1.")
    data2: int = Field(..., ge=0, le=255, description="Status byte data2.")


# ---------------------------------------------------------------------------
# Traffic payload (the `data` field of the WS frame)
# ---------------------------------------------------------------------------


TrafficDirection = Literal["inbound", "outbound"]


class MidiTrafficPayload(BaseModel):
    """One MIDI traffic record emitted to the midi:traffic topic.

    Shared between MidiRouter (routed-outbound) and
    InboundMidiTrafficBridge (raw-inbound) — `direction` discriminates.
    """

    timestamp_ns: int = Field(
        ...,
        description="Capture time (monotonic-relative ns; time.time_ns()).",
    )
    source_port: str = Field(
        ...,
        description="Source MIDI port (libremidi port name or virtual port ID).",
    )
    destination_port: str = Field(
        default="",
        description=(
            "Destination MIDI port. Empty string for raw-inbound events "
            "(InboundMidiTrafficBridge sets `destination_port or ''`)."
        ),
    )
    direction: TrafficDirection = Field(
        ...,
        description=(
            "`inbound` = raw arrival from a physical/virtual MIDI input; "
            "`outbound` = post-routing forward to a destination port."
        ),
    )
    route_id: Optional[str] = Field(
        default=None,
        description=(
            "Route ID for outbound events; None for inbound. Lets the UI "
            "show 'which route dispatched this' for outbound traffic."
        ),
    )
    raw_hex: str = Field(
        ...,
        description="Raw MIDI bytes hex-encoded (e.g. '90 3c 7f').",
    )
    decoded: DecodedMidiMessage = Field(
        ...,
        description="Parsed view of the same message.",
    )


# ---------------------------------------------------------------------------
# Frame envelope
# ---------------------------------------------------------------------------


class MidiTrafficFrame(BaseModel):
    """The midi:traffic WS frame.

    NOTE on envelope shape: unlike `device_peak_meters:*` and
    `sonobus:*`, the midi:traffic emitters don't carry a `schema_version`
    field today — they emit `{"type": "midi:traffic", "data": <payload>}`
    directly. The canonical model accepts that legacy shape via
    `schema_version` defaulting to 1; tests pin the default so a future
    bump must move the field explicitly.
    """

    type: Literal["midi:traffic"] = TRAFFIC_FRAME_TYPE  # type: ignore[assignment]
    schema_version: int = Field(
        default=SCHEMA_VERSION,
        description=(
            "Defaults to 1 so the legacy emitter (no schema_version field) "
            "validates cleanly. A future bump migrates emitters to set it "
            "explicitly."
        ),
    )
    data: MidiTrafficPayload


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def build_traffic_frame(payload: dict[str, Any]) -> dict:
    """Build a midi:traffic frame from one raw payload dict.

    Defensive: if the payload's `decoded` field is missing/malformed,
    raises ValueError at validation time — better to fail loud than
    silently emit a frame the supervisor can't decode.
    """
    return MidiTrafficFrame(data=MidiTrafficPayload.model_validate(payload)).model_dump()


def validate_traffic_frame(frame: dict) -> MidiTrafficFrame:
    return MidiTrafficFrame.model_validate(frame)


__all__ = [
    "TRAFFIC_FRAME_TYPE",
    "SCHEMA_VERSION",
    "MidiMessageType",
    "TrafficDirection",
    "DecodedMidiMessage",
    "MidiTrafficPayload",
    "MidiTrafficFrame",
    "build_traffic_frame",
    "validate_traffic_frame",
]
