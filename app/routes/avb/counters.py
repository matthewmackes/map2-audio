"""
T2491-6 — IEEE 1722.1-2021 §7.4.46 statistics counters surface.

Per-stream STREAM_INPUT_COUNTERS / STREAM_OUTPUT_COUNTERS and
per-interface AVB_INTERFACE_COUNTERS, projected from MAP2's
already-tracked AvbStream stats and gPTP/SRP state. The Python
counters mirror the IEEE 1722.1-2021 §7.4.46 field naming so the
operator surface (T2490-9 `/avb/network`) and AVnu CTS can consume
them directly.

Field projection:
- STREAM_INPUT_COUNTERS:
    frames_rx                 ← stats.frames_received
    frame_rx_count            ← stats.frames_received  (alias)
    seq_num_mismatch          ← stats.sequence_errors
    timestamp_uncertain       ← stats.timestamp_skew_events
    timestamp_valid           ← stats.frames_received - stats.timestamp_errors
    timestamp_not_valid       ← stats.timestamp_errors
    unsupported_format        ← stats.decode_errors
    late_timestamp            ← stats.late_frame_drops      (T2491-7)
    media_locked              ← 1 if state==active else 0
    media_unlocked            ← 0 (not yet tracked; cumulative would need history)
    stream_interrupted        ← stats.sequence_gap_events
    media_reset               ← 0 (not yet tracked; tied to ACMP rebind events)

- STREAM_OUTPUT_COUNTERS:
    frames_tx                 ← stats.frames_sent
    stream_start              ← 1 if state==active else 0
    stream_stop               ← 0 (not yet tracked)
    media_reset               ← 0 (not yet tracked)
    timestamp_uncertain       ← stats.timestamp_skew_events

- AVB_INTERFACE_COUNTERS (per ifname): pulled from /sys/class/net
  link counters + AvbInterfaceMonitor link-up/down history.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()


def _stream_state_to_locked(state: Any) -> int:
    """Map AvbStream state → IEEE 1722.1 media_locked counter (0/1)."""
    if state is None:
        return 0
    if hasattr(state, "value"):
        state = state.value
    text = str(state).strip().lower()
    if text in {"active", "running", "streaming", "1", "true"}:
        return 1
    return 0


def _project_input_counters(stream: Dict[str, Any]) -> Dict[str, int]:
    stats = stream.get("stats") or {}
    if hasattr(stats, "__dataclass_fields__"):
        from dataclasses import asdict
        stats = asdict(stats)
    if not isinstance(stats, dict):
        stats = {}

    frames_rx = int(stats.get("frames_received", 0) or 0)
    timestamp_errors = int(stats.get("timestamp_errors", 0) or 0)
    timestamp_valid = max(0, frames_rx - timestamp_errors)
    return {
        "frames_rx": frames_rx,
        "frame_rx_count": frames_rx,
        "seq_num_mismatch": int(stats.get("sequence_errors", 0) or 0),
        "timestamp_uncertain": int(stats.get("timestamp_skew_events", 0) or 0),
        "timestamp_valid": timestamp_valid,
        "timestamp_not_valid": timestamp_errors,
        "unsupported_format": int(stats.get("decode_errors", 0) or 0),
        "late_timestamp": int(stats.get("late_frame_drops", 0) or 0),
        "stream_interrupted": int(stats.get("sequence_gap_events", 0) or 0),
        "media_locked": _stream_state_to_locked(stream.get("state")),
        "media_unlocked": 0,
        "media_reset": 0,
    }


def _project_output_counters(stream: Dict[str, Any]) -> Dict[str, int]:
    stats = stream.get("stats") or {}
    if hasattr(stats, "__dataclass_fields__"):
        from dataclasses import asdict
        stats = asdict(stats)
    if not isinstance(stats, dict):
        stats = {}

    return {
        "frames_tx": int(stats.get("frames_sent", 0) or 0),
        "stream_start": _stream_state_to_locked(stream.get("state")),
        "stream_stop": 0,
        "media_reset": 0,
        "timestamp_uncertain": int(stats.get("timestamp_skew_events", 0) or 0),
    }


def _direction_string(stream: Dict[str, Any]) -> str:
    direction = stream.get("direction")
    if hasattr(direction, "value"):
        direction = direction.value
    return str(direction or "").strip().lower()


@router.get("/streams/{stream_id}/counters")
async def get_stream_counters(stream_id: str) -> Dict[str, Any]:
    """
    Return IEEE 1722.1-2021 §7.4.46 counters for a single AVB stream.

    The shape is `{stream_id, direction, counters}` where `counters`
    is the STREAM_INPUT_COUNTERS or STREAM_OUTPUT_COUNTERS dict
    matching the stream's direction. Listeners that have observed
    presentation-time-late frames (T2491-7) surface those in the
    `late_timestamp` counter.
    """
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()
        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)
        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")
        if not isinstance(stream, dict):
            raise HTTPException(status_code=500, detail="Invalid stream payload")

        direction = _direction_string(stream)
        if direction in {"listener", "input", "rx"}:
            counters = _project_input_counters(stream)
            kind = "STREAM_INPUT_COUNTERS"
        else:
            counters = _project_output_counters(stream)
            kind = "STREAM_OUTPUT_COUNTERS"

        return {
            "stream_id": stream_id,
            "direction": direction or "unknown",
            "kind": kind,
            "counters": counters,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting stream counters: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _read_sys_counter(ifname: str, key: str) -> Optional[int]:
    """Read /sys/class/net/<ifname>/statistics/<key> as int (or None)."""
    path = Path(f"/sys/class/net/{ifname}/statistics/{key}")
    try:
        text = path.read_text(encoding="utf-8").strip()
        return int(text)
    except (OSError, ValueError):
        return None


def _read_sys_operstate(ifname: str) -> str:
    path = Path(f"/sys/class/net/{ifname}/operstate")
    try:
        return path.read_text(encoding="utf-8").strip().lower()
    except OSError:
        return "unknown"


@router.get("/interfaces/{ifname}/counters")
async def get_interface_counters(ifname: str) -> Dict[str, Any]:
    """
    Return IEEE 1722.1-2021 §7.4.46 AVB_INTERFACE_COUNTERS for the
    named NIC. Numbers are projected from `/sys/class/net/<ifname>/
    statistics/*` (kernel interface counters) — they are accurate
    even when the AVDECC controller has not yet enumerated this
    interface.
    """
    if not ifname or not ifname.replace("-", "").replace("_", "").replace(".", "").isalnum():
        raise HTTPException(status_code=400, detail=f"Invalid interface name: {ifname!r}")

    iface_dir = Path(f"/sys/class/net/{ifname}")
    if not iface_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Interface not found: {ifname}")

    operstate = _read_sys_operstate(ifname)
    is_up = 1 if operstate == "up" else 0
    counters = {
        "link_up": is_up,
        "link_down": 0 if is_up else 1,
        "frames_tx": _read_sys_counter(ifname, "tx_packets") or 0,
        "frames_rx": _read_sys_counter(ifname, "rx_packets") or 0,
        "rx_crc_error": _read_sys_counter(ifname, "rx_crc_errors") or 0,
        "gptp_gm_changed": 0,  # Wired through ptp_monitor in T2491-2.
    }

    # Best-effort: enrich with gptp_gm_changed from the PTP monitor's
    # change history when available (the field is incremented every
    # time the BMCA picks a new grandmaster).
    try:
        from app.services.avb.ptp_monitor import get_ptp_monitor

        monitor = get_ptp_monitor()
        if monitor is not None:
            gm_changes = getattr(monitor, "grandmaster_change_count", None)
            if isinstance(gm_changes, int):
                counters["gptp_gm_changed"] = gm_changes
    except Exception:  # noqa: BLE001
        pass

    return {
        "interface": ifname,
        "operstate": operstate,
        "kind": "AVB_INTERFACE_COUNTERS",
        "counters": counters,
    }
