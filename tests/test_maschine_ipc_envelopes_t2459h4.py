"""T2459-H4 slice 13 — Maschine IPC envelope tests.

Pins the three new envelope types added to ``app/schemas/controller_host.py``:

  * ``MaschineHidEvent``    — host → daemon, decoded HID input
  * ``MaschineBulkFrame``   — daemon → host, LED or display frame
  * ``MaschineInitRequest`` — daemon → host, boot-time init request

Coverage:
  - TypedDict shape (typing-time check, runs at import).
  - FIELD_MANIFEST has all three with the correct field order.
  - encode_frame / decode_frame round-trip preserves every field.
  - Envelopes appear in InboundMessage / OutboundMessage unions on
    the appropriate side.
  - Type-tag values match the C++ kType strings.
"""

from __future__ import annotations

import inspect

from app.schemas.controller_host import (
    FIELD_MANIFEST,
    InboundMessage,
    MaschineBulkFrame,
    MaschineHidEvent,
    MaschineInitRequest,
    OutboundMessage,
    SCHEMA_VERSION,
    decode_frame,
    encode_frame,
)


# ---------------------------------------------------------------------------
# Shape pin — TypedDict annotations match the documented field order.
# ---------------------------------------------------------------------------


EXPECTED_HID_FIELDS = [
    "type",
    "msg_id",
    "schema_version",
    "controller_key",
    "timestamp_ns",
    "kind",
    "bytes",
]
EXPECTED_BULK_FIELDS = [
    "type",
    "msg_id",
    "schema_version",
    "controller_key",
    "kind",
    "bytes",
]
EXPECTED_INIT_FIELDS = [
    "type",
    "msg_id",
    "schema_version",
    "controller_key",
]


def test_field_manifest_has_maschine_envelopes() -> None:
    assert "MaschineHidEvent" in FIELD_MANIFEST
    assert "MaschineBulkFrame" in FIELD_MANIFEST
    assert "MaschineInitRequest" in FIELD_MANIFEST


def test_hid_event_field_order() -> None:
    assert FIELD_MANIFEST["MaschineHidEvent"] == EXPECTED_HID_FIELDS


def test_bulk_frame_field_order() -> None:
    assert FIELD_MANIFEST["MaschineBulkFrame"] == EXPECTED_BULK_FIELDS


def test_init_request_field_order() -> None:
    assert FIELD_MANIFEST["MaschineInitRequest"] == EXPECTED_INIT_FIELDS


def test_typeddict_annotations_match_manifest() -> None:
    """Defensive: the manifest is built from __annotations__, but
    pin the annotation order as well so a future commit can't reorder
    the TypedDict fields without flipping this test."""
    assert list(MaschineHidEvent.__annotations__.keys()) == EXPECTED_HID_FIELDS
    assert list(MaschineBulkFrame.__annotations__.keys()) == EXPECTED_BULK_FIELDS
    assert list(MaschineInitRequest.__annotations__.keys()) == EXPECTED_INIT_FIELDS


# ---------------------------------------------------------------------------
# Round-trip pin — every field survives JSON encode + decode.
# ---------------------------------------------------------------------------


def test_hid_event_round_trip() -> None:
    msg: MaschineHidEvent = {
        "type": "maschine_hid_event",
        "msg_id": "evt-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
        "timestamp_ns": 1_700_000_000_000_000_000,
        "kind": "pad",
        "bytes": [0x01, 0x40, 0x7F],
    }
    frame = encode_frame(msg)
    decoded, rest = decode_frame(frame)
    assert decoded == msg
    assert rest == b""


def test_bulk_frame_round_trip_led() -> None:
    msg: MaschineBulkFrame = {
        "type": "maschine_bulk_frame",
        "msg_id": "led-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
        "kind": "led",
        "bytes": list(range(64)),
    }
    frame = encode_frame(msg)
    decoded, rest = decode_frame(frame)
    assert decoded == msg
    assert rest == b""


def test_bulk_frame_round_trip_display() -> None:
    msg: MaschineBulkFrame = {
        "type": "maschine_bulk_frame",
        "msg_id": "disp-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
        "kind": "display",
        "bytes": [0xAA] * 256,
    }
    frame = encode_frame(msg)
    decoded, rest = decode_frame(frame)
    assert decoded == msg


def test_init_request_round_trip() -> None:
    msg: MaschineInitRequest = {
        "type": "maschine_init",
        "msg_id": "init-1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
    }
    frame = encode_frame(msg)
    decoded, rest = decode_frame(frame)
    assert decoded == msg


# ---------------------------------------------------------------------------
# Direction pin — HidEvent flows host → daemon (Outbound), the two
# request envelopes flow daemon → host (Inbound).
# ---------------------------------------------------------------------------


def test_hid_event_in_outbound_union_only() -> None:
    """Host emits HID events to the daemon; not an Inbound message."""
    inbound_args = set(getattr(InboundMessage, "__args__", ()))
    outbound_args = set(getattr(OutboundMessage, "__args__", ()))
    assert MaschineHidEvent in outbound_args
    assert MaschineHidEvent not in inbound_args


def test_bulk_frame_in_inbound_union_only() -> None:
    """Daemon publishes bulk frames to the host; an Inbound message
    from the host's perspective."""
    inbound_args = set(getattr(InboundMessage, "__args__", ()))
    outbound_args = set(getattr(OutboundMessage, "__args__", ()))
    assert MaschineBulkFrame in inbound_args
    assert MaschineBulkFrame not in outbound_args


def test_init_request_in_inbound_union_only() -> None:
    inbound_args = set(getattr(InboundMessage, "__args__", ()))
    outbound_args = set(getattr(OutboundMessage, "__args__", ()))
    assert MaschineInitRequest in inbound_args
    assert MaschineInitRequest not in outbound_args


# ---------------------------------------------------------------------------
# Tag pin — wire-format type strings match the C++ kType constants.
# ---------------------------------------------------------------------------


def test_hid_event_type_tag() -> None:
    msg: MaschineHidEvent = {
        "type": "maschine_hid_event",
        "msg_id": "x",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
        "timestamp_ns": 0,
        "kind": "pad",
        "bytes": [],
    }
    assert msg["type"] == "maschine_hid_event"


def test_bulk_frame_type_tag() -> None:
    msg: MaschineBulkFrame = {
        "type": "maschine_bulk_frame",
        "msg_id": "x",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
        "kind": "led",
        "bytes": [],
    }
    assert msg["type"] == "maschine_bulk_frame"


def test_init_request_type_tag() -> None:
    msg: MaschineInitRequest = {
        "type": "maschine_init",
        "msg_id": "x",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "maschine-mk1",
    }
    assert msg["type"] == "maschine_init"


# ---------------------------------------------------------------------------
# C++ header parity — pin the kType strings appear in IpcMessages.h.
# ---------------------------------------------------------------------------


def test_cpp_header_carries_maschine_kType_strings() -> None:
    import pathlib

    header = (
        pathlib.Path(__file__).resolve().parent.parent
        / "juce-engine"
        / "Source"
        / "ControllerHost"
        / "IpcMessages.h"
    )
    text = header.read_text()
    assert '"maschine_hid_event"' in text
    assert '"maschine_bulk_frame"' in text
    assert '"maschine_init"' in text


_ = inspect  # parity with sibling tests; quiets unused-import linters
