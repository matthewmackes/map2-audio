"""
T2459-H5 Slice 16 — UMP / MIDI 2.0 capabilities surface.

`GET /api/v2/midi/ump/capabilities` returns an honest-state envelope
describing what's actually wired today — the host-side classifier,
the slot discriminator, the IPC additive `format` field, the
`MidiHostClient.send_ump()` payload contract — versus what's
hardware-gated (validated UMP I/O against a real MIDI 2.0 device).

When the controller-host daemon is reachable, the route also
surfaces its current backend selection (JACK MIDI / PipeWire /
ALSA seq / ALSA raw) so the operator UI can show "UMP capable: yes
(PipeWire)" or "UMP capable: no (host backend bound to ALSA seq;
upgrade libremidi for production UMP I/O)".

The shape is the same one MeloAudio + Milan capabilities surfaces
use (T2491-5 honest-state pattern): `{available, source, data,
error}`. Operators who hit this on a workstation without a
controller-host daemon still get a coherent answer instead of a
500.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MIDI"])


class _UmpCapabilitiesEnvelope(BaseModel):
    available: bool
    source: str = Field(default="controller_host")
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


def _engine_side_capabilities() -> Dict[str, Any]:
    """Static description of the engine-side UMP plumbing.

    These facts come straight from T2459-H5 Slice 13's deliverable
    notes — they're true regardless of whether the controller-host
    daemon is currently running. Surface them as the floor capability
    so the operator UI always has SOMETHING to render even when the
    daemon is down.
    """
    return {
        "classifier": {
            "implementation": "classifyUmpMessageType",
            "rt_message_types": [0x1, 0x2, 0x4],
            "control_message_types": [0x0, 0x3, 0x5],
            "comment": (
                "Branchless 16-bit RT-mask shift, ~5 ns. MT 0x1 / 0x2 / 0x4 "
                "→ RT ring; MT 0x0 / 0x3 / 0x5 / reserved → control ring."
            ),
        },
        "slot_discriminator": {
            "field": "Slot::controllerIndex",
            "ump_flag_bit": 15,
            "ump_flag_mask": "0x8000",
            "comment": (
                "Bit 15 (kSlotFlagIsUmp) flags UMP packets; bits 0..14 "
                "carry the controller index. High-bit-only allocation "
                "lets MIDI 1.0 + UMP traffic share the same two-ring "
                "layout."
            ),
        },
        "ipc": {
            "send_request_format_field": "format",
            "format_values": ["", "midi1", "ump"],
            "default": "midi1",
            "ump_packet_lengths_bytes": [4, 8, 12, 16],
            "comment": (
                "MidiSendRequest carries an additive `format` field on the "
                "wire; \"\" / \"midi1\" preserves back-compat (omitted on "
                "wire), \"ump\" routes through the UMP path."
            ),
        },
        "client_helper": "MidiHostClient.send_ump(controller_key, packet_bytes)",
        "wire_compatibility_with_midi1": True,
    }


def _resolve_host_backend_status() -> Optional[Dict[str, Any]]:
    """Resolve the live host-backend selection if the daemon is up.

    Returns None when the daemon isn't reachable (typical dev
    environment without a running map2-controller-host service).
    """
    try:
        from app.services.midi_host_client import MidiHostClient
    except Exception:
        return None
    try:
        client = MidiHostClient()
    except Exception as exc:  # noqa: BLE001
        logger.debug("MidiHostClient construction failed: %s", exc)
        return None
    try:
        if not client.is_daemon_available():
            return None
    except Exception as exc:  # noqa: BLE001
        logger.debug("MidiHostClient.is_daemon_available raised: %s", exc)
        return None
    try:
        status, _ports = client.list_ports()
    except Exception as exc:  # noqa: BLE001
        logger.debug("MidiHostClient.list_ports raised: %s", exc)
        return None
    payload: Dict[str, Any] = {
        "daemon_available": True,
    }
    backend = getattr(status, "backend", None)
    if backend is not None:
        payload["backend"] = backend
    degraded = getattr(status, "degraded", None)
    if degraded is not None:
        payload["degraded"] = bool(degraded)
    return payload


@router.get("/api/v2/midi/ump/capabilities", response_model=_UmpCapabilitiesEnvelope)
async def get_ump_capabilities() -> _UmpCapabilitiesEnvelope:
    """T2459-H5 Slice 16 — UMP / MIDI 2.0 capabilities envelope."""
    engine = _engine_side_capabilities()
    host = _resolve_host_backend_status()

    data: Dict[str, Any] = {
        "engine_side": engine,
        "host_side": host or {"daemon_available": False},
        # Honest-state surface: validated UMP I/O against a real
        # device is hardware-gated. Surface this explicitly so the
        # operator UI doesn't pretend bench UMP works just because
        # the engine-side plumbing is in place.
        "validated_io": False,
        "validated_io_blocker": (
            "libremidi v5.1.0 vendored does not expose a validated "
            "UMP input/output API on Linux. T2491-13 closes this "
            "via libremidi version bump + bench validation against "
            "a MIDI-2.0-capable device."
        ),
    }
    available = host is not None and host.get("daemon_available") is True
    error = (
        None
        if available
        else (
            "controller-host daemon not reachable — engine-side plumbing "
            "is shipped but UMP I/O requires a running host"
        )
    )
    return _UmpCapabilitiesEnvelope(
        available=available,
        source="controller_host",
        data=data,
        error=error,
    )
