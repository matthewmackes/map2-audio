"""
Expression pedal assignment service (T097).

Provides:
- SQLite-backed assignment CRUD (with legacy JSON import fallback)
- Live CC -> mapped parameter state
- Auto-detect listener for "move your pedal" UX
- Retime stats (CC receive -> parameter apply)
- Performance-mode action events for Stage Mode footswitch control
"""
from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass, field
import json
import logging
import os
import queue
import threading
import time
import uuid
from typing import Any, Deque, Dict, List, Optional, Tuple

from app.database import ExpressionAssignment as ExpressionAssignmentRow
from app.database import get_db_session, get_session
from app.services.juce_engine_service import get_audio_engine

logger = logging.getLogger(__name__)

_LEGACY_JSON_PATH = os.path.expanduser("~/.map2/expression_assignments.json")
_CC_DETECT_WINDOW_NS = 500_000_000
_CC_DETECT_MIN_DELTA = 10


@dataclass
class AssignmentRecord:
    id: str
    cc: int
    channel: int
    cc_min: int
    cc_max: int
    param_id: str
    param_label: str
    out_min: float
    out_max: float
    curve: str
    custom_curve: List[Dict[str, float]] = field(default_factory=list)
    active: bool = True
    source: str = "user"  # user | performance_mode


@dataclass
class LiveState:
    cc: int
    channel: int
    raw_value: int
    normalized: float
    curved: float
    mapped_value: float
    param_id: str
    param_label: str
    updated_at_ns: int


@dataclass
class ListenRequest:
    listener_id: str
    created_at_ns: int
    event: threading.Event = field(default_factory=threading.Event)
    result: Optional[Dict[str, Any]] = None
    cancelled: bool = False
    series: Dict[Tuple[int, int], Deque[Tuple[int, int]]] = field(default_factory=dict)


@dataclass
class ApplyWorkItem:
    seq: int
    assignment_id: str
    cc: int
    channel: int
    raw_value: int
    mapped_value: float
    param_id: str
    param_label: str


_DEFAULT_PERF_MAPPINGS: List[Tuple[str, int, int, int, int, str, str]] = [
    ("page_next", 80, 16, 64, 127, "perform.page_next", "Next Page"),
    ("page_prev", 81, 16, 64, 127, "perform.page_prev", "Prev Page"),
    ("tap_tempo", 64, 16, 64, 127, "perform.tap_tempo", "Tap Tempo"),
    ("tuner_mute", 82, 16, 64, 127, "perform.tuner_mute", "Tuner Mute"),
    ("bypass_01", 83, 16, 64, 127, "perform.bypass.1", "Bypass Block 1"),
    ("bypass_02", 84, 16, 64, 127, "perform.bypass.2", "Bypass Block 2"),
    ("bypass_03", 85, 16, 64, 127, "perform.bypass.3", "Bypass Block 3"),
    ("bypass_04", 86, 16, 64, 127, "perform.bypass.4", "Bypass Block 4"),
    ("bypass_05", 87, 16, 64, 127, "perform.bypass.5", "Bypass Block 5"),
    ("bypass_06", 88, 16, 64, 127, "perform.bypass.6", "Bypass Block 6"),
    ("bypass_07", 89, 16, 64, 127, "perform.bypass.7", "Bypass Block 7"),
    ("bypass_08", 90, 16, 64, 127, "perform.bypass.8", "Bypass Block 8"),
]


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _percentile(sorted_values: List[float], percentile: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    rank = (len(sorted_values) - 1) * max(0.0, min(100.0, percentile)) / 100.0
    lo = int(rank)
    hi = min(lo + 1, len(sorted_values) - 1)
    if lo == hi:
        return float(sorted_values[lo])
    frac = rank - lo
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * frac)


def _sample_custom_curve(normalized: float, points: List[Dict[str, float]]) -> float:
    t = _clamp01(normalized)
    if len(points) < 2:
        return t

    p1 = points[0] if isinstance(points[0], dict) else {}
    p2 = points[1] if isinstance(points[1], dict) else {}
    p1y = _clamp01(float(p1.get("y", 0.3)))
    p2y = _clamp01(float(p2.get("y", 0.7)))
    u = 1.0 - t
    # Cubic Bezier from (0,0) to (1,1), using control-point Y values.
    return _clamp01((3.0 * (u ** 2) * t * p1y) + (3.0 * u * (t ** 2) * p2y) + (t ** 3))


def _curve(normalized: float, curve_name: str, custom_curve: Optional[List[Dict[str, float]]] = None) -> float:
    t = _clamp01(normalized)
    if curve_name == "custom":
        return _sample_custom_curve(t, list(custom_curve or []))
    if curve_name == "log":
        return t * t
    if curve_name == "exp":
        return t ** 0.5
    if curve_name == "scurve":
        return t * t * (3.0 - 2.0 * t)
    return t


class ExpressionService:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._assignments: Dict[str, AssignmentRecord] = {}
        self._live: Dict[str, LiveState] = {}
        self._listeners: Dict[str, ListenRequest] = {}
        self._perf_gate: Dict[str, bool] = {}

        self._seq_counter = 0
        self._perf_seq = 0
        self._recv_events: Deque[Dict[str, Any]] = deque(maxlen=2048)
        self._apply_events: Deque[Dict[str, Any]] = deque(maxlen=2048)
        self._performance_events: Deque[Dict[str, Any]] = deque(maxlen=2048)

        self._apply_queue: "queue.Queue[ApplyWorkItem]" = queue.Queue(maxsize=8192)
        self._apply_stop = threading.Event()
        self._apply_thread = threading.Thread(
            target=self._apply_worker,
            name="expression_apply_worker",
            daemon=True,
        )

        self._midi_hub = None
        self._midi_subscriber_id = "expression_service"

        self._load_assignments_from_db()
        self._import_legacy_json_if_needed()
        self._ensure_default_performance_mappings()
        self._apply_thread.start()
        self._subscribe_to_midi_hub()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load_assignments_from_db(self) -> None:
        session = get_db_session()
        try:
            rows = session.query(ExpressionAssignmentRow).all()
            for row in rows:
                record = AssignmentRecord(
                    id=row.id,
                    cc=int(row.cc),
                    channel=int(row.channel),
                    cc_min=int(row.cc_min),
                    cc_max=int(row.cc_max),
                    param_id=str(row.param_id),
                    param_label=str(row.param_label or row.param_id),
                    out_min=float(row.out_min),
                    out_max=float(row.out_max),
                    curve=str(row.curve or "linear"),
                    custom_curve=list(row.custom_curve or []),
                    active=bool(row.active),
                    source=str(row.source or "user"),
                )
                self._assignments[record.id] = record
        finally:
            session.close()

    def _save_assignment_to_db(self, record: AssignmentRecord) -> None:
        session = get_db_session()
        try:
            row = session.query(ExpressionAssignmentRow).filter_by(id=record.id).first()
            if row is None:
                row = ExpressionAssignmentRow(id=record.id)
                session.add(row)
            row.cc = int(record.cc)
            row.channel = int(record.channel)
            row.cc_min = int(record.cc_min)
            row.cc_max = int(record.cc_max)
            row.param_id = str(record.param_id)
            row.param_label = str(record.param_label)
            row.out_min = float(record.out_min)
            row.out_max = float(record.out_max)
            row.curve = str(record.curve)
            row.custom_curve = list(record.custom_curve or [])
            row.active = bool(record.active)
            row.source = str(record.source)
            session.commit()
        finally:
            session.close()

    def _delete_assignment_from_db(self, assignment_id: str) -> None:
        session = get_db_session()
        try:
            row = session.query(ExpressionAssignmentRow).filter_by(id=assignment_id).first()
            if row is not None:
                session.delete(row)
                session.commit()
        finally:
            session.close()

    def _import_legacy_json_if_needed(self) -> None:
        if self._assignments:
            return
        if not os.path.exists(_LEGACY_JSON_PATH):
            return
        try:
            with open(_LEGACY_JSON_PATH, encoding="utf-8") as fh:
                legacy = json.load(fh)
            if not isinstance(legacy, list):
                return
            for item in legacy:
                if not isinstance(item, dict):
                    continue
                record = AssignmentRecord(
                    id=str(item.get("id") or uuid.uuid4()),
                    cc=int(item.get("cc", 0)),
                    channel=int(item.get("channel", 0)),
                    cc_min=int(item.get("cc_min", 0)),
                    cc_max=int(item.get("cc_max", 127)),
                    param_id=str(item.get("param_id", "engine.reverb_mix")),
                    param_label=str(item.get("param_label") or item.get("param_id") or ""),
                    out_min=float(item.get("out_min", 0.0)),
                    out_max=float(item.get("out_max", 1.0)),
                    curve=str(item.get("curve", "linear")),
                    custom_curve=list(item.get("custom_curve") or []),
                    active=bool(item.get("active", True)),
                    source=str(item.get("source", "user")),
                )
                self._assignments[record.id] = record
                self._save_assignment_to_db(record)
            logger.info("Imported %d legacy expression assignments from JSON.", len(self._assignments))
        except Exception:
            logger.exception("Failed importing legacy expression assignments from %s", _LEGACY_JSON_PATH)

    def _ensure_default_performance_mappings(self) -> None:
        perf_existing = any(a.source == "performance_mode" for a in self._assignments.values())
        if perf_existing:
            return
        for suffix, cc, ch, cc_min, cc_max, param_id, label in _DEFAULT_PERF_MAPPINGS:
            record = AssignmentRecord(
                id=f"perf_{suffix}",
                cc=cc,
                channel=ch,
                cc_min=cc_min,
                cc_max=cc_max,
                param_id=param_id,
                param_label=label,
                out_min=0.0,
                out_max=1.0,
                curve="linear",
                custom_curve=[],
                active=True,
                source="performance_mode",
            )
            self._assignments[record.id] = record
            self._save_assignment_to_db(record)
        logger.info("Seeded %d default Performance Mode mappings.", len(_DEFAULT_PERF_MAPPINGS))

    # ------------------------------------------------------------------
    # MIDI hub integration
    # ------------------------------------------------------------------

    def _subscribe_to_midi_hub(self) -> None:
        try:
            from app.services.midi_hub.hub import get_midi_hub

            self._midi_hub = get_midi_hub()
            self._midi_hub.subscribe(self._midi_subscriber_id, self._on_midi_hub_message)
        except Exception:
            logger.debug("Expression service started without MIDI Hub subscription.", exc_info=True)

    def _on_midi_hub_message(self, message: Any) -> None:
        data = bytes(getattr(message, "data", b"") or b"")
        if not data:
            return
        # MidiHub timestamps use wall-clock time; retime correlation in this
        # service is monotonic, so capture a local monotonic receive timestamp.
        timestamp_ns = time.monotonic_ns()
        source_port = str(getattr(message, "source_port", ""))
        self.process_midi_message(data, timestamp_ns=timestamp_ns, source_port=source_port)

    def process_midi_message(self, data: bytes, *, timestamp_ns: Optional[int] = None, source_port: str = "") -> None:
        if not data:
            return
        status = int(data[0]) & 0xFF
        if (status & 0xF0) == 0xB0 and len(data) >= 3:
            channel = (status & 0x0F) + 1
            cc = int(data[1]) & 0x7F
            value = int(data[2]) & 0x7F
            self.process_midi_cc(cc=cc, value=value, channel=channel, timestamp_ns=timestamp_ns, source_port=source_port)
            return
        if (status & 0xF0) == 0xC0 and len(data) >= 2:
            channel = (status & 0x0F) + 1
            program = int(data[1]) & 0x7F
            self.process_midi_program_change(program=program, channel=channel, timestamp_ns=timestamp_ns, source_port=source_port)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_assignments(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = [asdict(a) for a in self._assignments.values()]
        rows.sort(key=lambda row: (0 if row["source"] == "user" else 1, row["id"]))
        return rows

    def create_assignment(self, data: Dict[str, Any]) -> Dict[str, Any]:
        assignment_id = str(data.get("id") or uuid.uuid4())
        record = AssignmentRecord(
            id=assignment_id,
            cc=max(0, min(127, int(data.get("cc", 0)))),
            channel=max(0, min(16, int(data.get("channel", 0)))),
            cc_min=max(0, min(127, int(data.get("cc_min", 0)))),
            cc_max=max(0, min(127, int(data.get("cc_max", 127)))),
            param_id=str(data.get("param_id", "")),
            param_label=str(data.get("param_label") or data.get("param_id") or ""),
            out_min=float(data.get("out_min", 0.0)),
            out_max=float(data.get("out_max", 1.0)),
            curve=str(data.get("curve", "linear")),
            custom_curve=list(data.get("custom_curve") or []),
            active=bool(data.get("active", True)),
            source=str(data.get("source", "user")),
        )
        with self._lock:
            self._assignments[record.id] = record
        self._save_assignment_to_db(record)
        return asdict(record)

    def delete_assignment(self, assignment_id: str) -> bool:
        with self._lock:
            if assignment_id not in self._assignments:
                return False
            del self._assignments[assignment_id]
            self._live.pop(assignment_id, None)
            self._perf_gate.pop(assignment_id, None)
        self._delete_assignment_from_db(assignment_id)
        return True

    def replace_snapshot_assignments(self, entries: List[Dict[str, Any]]) -> Dict[str, int]:
        snapshot_assignment_ids = [
            assignment_id
            for assignment_id, assignment in self._assignments.items()
            if assignment.source == "snapshot"
        ]
        for assignment_id in snapshot_assignment_ids:
            self.delete_assignment(assignment_id)

        applied_count = 0
        for index, entry in enumerate(entries or []):
            if not isinstance(entry, dict):
                continue
            payload = dict(entry)
            payload["id"] = str(payload.get("id") or f"snapshot_expr_{index}")
            payload["source"] = "snapshot"
            self.create_assignment(payload)
            applied_count += 1

        with self._lock:
            active_snapshot_count = sum(
                1 for assignment in self._assignments.values() if assignment.source == "snapshot"
            )
        return {
            "cleared_count": len(snapshot_assignment_ids),
            "applied_count": applied_count,
            "active_snapshot_count": active_snapshot_count,
        }

    def listen_for_cc(self, timeout_seconds: float = 10.0, listener_id: Optional[str] = None) -> Dict[str, Any]:
        req = ListenRequest(
            listener_id=str(listener_id or uuid.uuid4()),
            created_at_ns=time.monotonic_ns(),
        )
        with self._lock:
            self._listeners[req.listener_id] = req

        req.event.wait(timeout=max(0.1, float(timeout_seconds)))

        with self._lock:
            self._listeners.pop(req.listener_id, None)

        if req.cancelled:
            return {
                "listener_id": req.listener_id,
                "cc": None,
                "channel": None,
                "min_observed": 0,
                "max_observed": 127,
                "status": "cancelled",
            }
        if req.result is None:
            return {
                "listener_id": req.listener_id,
                "cc": None,
                "channel": None,
                "min_observed": 0,
                "max_observed": 127,
                "status": "timeout",
            }
        return {"listener_id": req.listener_id, **req.result}

    def cancel_listen(self, listener_id: Optional[str] = None) -> int:
        cancelled = 0
        with self._lock:
            targets = []
            if listener_id:
                req = self._listeners.get(listener_id)
                if req is not None:
                    targets.append(req)
            else:
                targets.extend(self._listeners.values())
            for req in targets:
                req.cancelled = True
                req.event.set()
                cancelled += 1
        return cancelled

    def process_midi_cc(
        self,
        *,
        cc: int,
        value: int,
        channel: int,
        timestamp_ns: Optional[int] = None,
        source_port: str = "",
    ) -> None:
        now_ns = int(timestamp_ns or time.monotonic_ns())
        cc = max(0, min(127, int(cc)))
        value = max(0, min(127, int(value)))
        channel = max(1, min(16, int(channel)))

        seq = self._next_seq()
        with self._lock:
            self._recv_events.append(
                {
                    "seq": seq,
                    "ts_recv_ns": now_ns,
                    "cc": cc,
                    "value": value,
                    "channel": channel,
                    "source_port": source_port,
                }
            )
            self._update_cc_listeners(cc=cc, value=value, channel=channel, ts_ns=now_ns)
            assignments = list(self._assignments.values())

        for assignment in assignments:
            if not assignment.active:
                continue
            if assignment.cc != cc:
                continue
            if assignment.channel != 0 and assignment.channel != channel:
                continue

            normalized = self._normalize_cc(value, assignment.cc_min, assignment.cc_max)
            curved = _curve(normalized, assignment.curve, assignment.custom_curve)
            mapped = assignment.out_min + curved * (assignment.out_max - assignment.out_min)

            live_state = LiveState(
                cc=cc,
                channel=channel,
                raw_value=value,
                normalized=normalized,
                curved=curved,
                mapped_value=mapped,
                param_id=assignment.param_id,
                param_label=assignment.param_label,
                updated_at_ns=now_ns,
            )
            with self._lock:
                self._live[assignment.id] = live_state

            if assignment.source == "performance_mode":
                self._emit_performance_from_assignment(
                    assignment=assignment,
                    value=value,
                    channel=channel,
                    seq=seq,
                    timestamp_ns=now_ns,
                )
                continue

            item = ApplyWorkItem(
                seq=seq,
                assignment_id=assignment.id,
                cc=cc,
                channel=channel,
                raw_value=value,
                mapped_value=mapped,
                param_id=assignment.param_id,
                param_label=assignment.param_label,
            )
            try:
                self._apply_queue.put_nowait(item)
            except queue.Full:
                logger.warning("Expression apply queue full; dropping event for %s", assignment.param_id)

    def process_midi_program_change(
        self,
        *,
        program: int,
        channel: int,
        timestamp_ns: Optional[int] = None,
        source_port: str = "",
    ) -> None:
        if channel != 16:
            return
        slot: Optional[int] = None
        raw_program = int(program)
        if 1 <= raw_program <= 8:
            slot = raw_program
        elif raw_program == 0:
            # Compatibility for devices that expose "Program 1" as raw 0.
            slot = 1
        if slot is None:
            return
        self._emit_performance_event(
            action="perform.load_slot",
            payload={"slot": slot, "program": slot, "program_raw": raw_program},
            channel=channel,
            timestamp_ns=int(timestamp_ns or time.monotonic_ns()),
            source_port=source_port,
        )

    def get_live_state(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            result = {
                assignment_id: {
                    "cc": state.cc,
                    "channel": state.channel,
                    "raw_value": state.raw_value,
                    "normalized": round(state.normalized, 6),
                    "curved": round(state.curved, 6),
                    "mapped_value": round(state.mapped_value, 6),
                    "param_id": state.param_id,
                    "param_label": state.param_label,
                    "updated_at_ns": state.updated_at_ns,
                }
                for assignment_id, state in self._live.items()
            }
        return result

    def get_performance_events(self, after_seq: int = 0, limit: int = 128) -> Dict[str, Any]:
        after_seq = max(0, int(after_seq))
        limit = max(1, min(2048, int(limit)))
        with self._lock:
            events = [event for event in self._performance_events if int(event["seq"]) > after_seq]
            if len(events) > limit:
                events = events[-limit:]
            last_seq = int(self._performance_events[-1]["seq"]) if self._performance_events else after_seq
        return {"events": events, "last_seq": last_seq}

    def clear_retime_stats(self) -> None:
        with self._lock:
            self._recv_events.clear()
            self._apply_events.clear()

    def get_retime_stats(self) -> Dict[str, Any]:
        with self._lock:
            recv_events = list(self._recv_events)
            apply_events = list(self._apply_events)

        if len(recv_events) < 3 or len(apply_events) < 3:
            return {
                "mean_ms": 0.0,
                "p95_ms": 0.0,
                "max_ms": 0.0,
                "sample_count": 0,
                "status": "insufficient_data",
            }

        recv_by_seq = {int(event["seq"]): int(event["ts_recv_ns"]) for event in recv_events}
        latencies_ms: List[float] = []
        for apply_event in apply_events:
            seq = int(apply_event["seq"])
            ts_apply = int(apply_event["ts_apply_ns"])
            ts_recv = recv_by_seq.get(seq)
            if ts_recv is None or ts_apply <= ts_recv:
                continue
            latency_ms = (ts_apply - ts_recv) / 1_000_000.0
            if 0.0 <= latency_ms <= 200.0:
                latencies_ms.append(latency_ms)

        if not latencies_ms:
            return {
                "mean_ms": 0.0,
                "p95_ms": 0.0,
                "max_ms": 0.0,
                "sample_count": 0,
                "status": "no_correlations",
            }

        latencies_ms.sort()
        sample_count = len(latencies_ms)
        return {
            "mean_ms": round(sum(latencies_ms) / sample_count, 3),
            "p95_ms": round(_percentile(latencies_ms, 95.0), 3),
            "max_ms": round(latencies_ms[-1], 3),
            "sample_count": sample_count,
            "status": "ok",
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _normalize_cc(self, value: int, cc_min: int, cc_max: int) -> float:
        lo = int(min(cc_min, cc_max))
        hi = int(max(cc_min, cc_max))
        if hi == lo:
            return 0.0
        return _clamp01((float(value) - float(lo)) / float(hi - lo))

    def _next_seq(self) -> int:
        with self._lock:
            self._seq_counter += 1
            return self._seq_counter

    def _next_perf_seq(self) -> int:
        with self._lock:
            self._perf_seq += 1
            return self._perf_seq

    def _update_cc_listeners(self, *, cc: int, value: int, channel: int, ts_ns: int) -> None:
        if not self._listeners:
            return
        key = (cc, channel)
        for req in list(self._listeners.values()):
            if req.cancelled or req.result is not None:
                continue
            series = req.series.setdefault(key, deque(maxlen=64))
            series.append((ts_ns, value))
            while series and (ts_ns - int(series[0][0])) > _CC_DETECT_WINDOW_NS:
                series.popleft()
            values = [int(v) for _, v in series]
            if not values:
                continue
            min_observed = min(values)
            max_observed = max(values)
            if (max_observed - min_observed) > _CC_DETECT_MIN_DELTA:
                req.result = {
                    "cc": cc,
                    "channel": channel,
                    "min_observed": min_observed,
                    "max_observed": max_observed,
                    "status": "detected",
                }
                req.event.set()

    def _emit_performance_from_assignment(
        self,
        *,
        assignment: AssignmentRecord,
        value: int,
        channel: int,
        seq: int,
        timestamp_ns: int,
    ) -> None:
        threshold = max(1, int(min(assignment.cc_min, assignment.cc_max)))
        gate_high = int(value) >= threshold
        was_high = self._perf_gate.get(assignment.id, False)
        self._perf_gate[assignment.id] = gate_high
        if not gate_high or was_high:
            return

        action = assignment.param_id
        payload: Dict[str, Any] = {"assignment_id": assignment.id, "value": int(value), "seq": seq}
        if action.startswith("perform.bypass."):
            try:
                payload["block_index"] = int(action.split(".")[-1])
            except Exception:
                payload["block_index"] = 1
        self._emit_performance_event(
            action=action,
            payload=payload,
            channel=channel,
            timestamp_ns=timestamp_ns,
            source_port="expression_assignment",
        )

    def _emit_performance_event(
        self,
        *,
        action: str,
        payload: Dict[str, Any],
        channel: int,
        timestamp_ns: int,
        source_port: str,
    ) -> None:
        event = {
            "seq": self._next_perf_seq(),
            "action": str(action),
            "payload": dict(payload),
            "channel": int(channel),
            "timestamp_ns": int(timestamp_ns),
            "source_port": str(source_port),
        }
        with self._lock:
            self._performance_events.append(event)

    def _apply_worker(self) -> None:
        while not self._apply_stop.is_set():
            try:
                item = self._apply_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                applied = self._apply_parameter(item)
                if applied:
                    with self._lock:
                        self._apply_events.append(
                            {
                                "seq": int(item.seq),
                                "ts_apply_ns": time.monotonic_ns(),
                                "cc": int(item.cc),
                                "value": int(item.raw_value),
                                "channel": int(item.channel),
                                "param_id": str(item.param_id),
                            }
                        )
            except Exception:
                logger.exception("Expression apply worker failed for param %s", item.param_id)
            finally:
                self._apply_queue.task_done()

    def shutdown(self) -> None:
        self._apply_stop.set()
        if self._midi_hub is not None:
            try:
                self._midi_hub.unsubscribe(self._midi_subscriber_id)
            except Exception:
                logger.debug("Failed to unsubscribe expression service from MIDI hub", exc_info=True)
        if self._apply_thread.is_alive():
            self._apply_thread.join(timeout=0.5)

    def _apply_parameter(self, item: ApplyWorkItem) -> bool:
        service = get_audio_engine()
        engine = getattr(service, "_engine", None)
        if engine is None and str(item.param_id) not in {"snapshot.morph_position", "snapshot.routing.morph_position"}:
            return False

        value = float(item.mapped_value)
        param_id = str(item.param_id)

        if param_id in {"snapshot.morph_position", "snapshot.routing.morph_position"}:
            return self._apply_snapshot_morph_position(_clamp01(value))

        if param_id == "engine.reverb_mix":
            return self._call_engine(engine, ["set_reverb_mix"], _clamp01(value))
        if param_id == "engine.delay_mix":
            return self._call_engine(engine, ["set_delay_mix", "set_passionfx_delay_mix"], _clamp01(value))
        if param_id == "engine.chorus_mix":
            return self._call_engine(engine, ["set_chorus_mix", "set_passionfx_chorus_mix"], _clamp01(value))
        if param_id == "engine.wah_freq":
            wah_position = _clamp01((value - 200.0) / 3800.0)
            enabled = self._call_engine(engine, ["set_passionfx_wah_enabled"], True)
            positioned = self._call_engine(engine, ["set_passionfx_wah_position"], wah_position)
            return enabled or positioned
        if param_id == "engine.gate_thresh":
            return self._call_engine(engine, ["set_gate_threshold", "set_passionfx_gate_threshold"], value)
        if param_id == "engine.comp_thresh":
            return self._call_engine(engine, ["set_compressor_threshold", "set_passionfx_comp_threshold"], value)
        if param_id == "engine.pitch_shift":
            left = self._call_engine(engine, ["set_pitch_shifter_pitch_l"], value * 100.0)
            right = self._call_engine(engine, ["set_pitch_shifter_pitch_r"], value * 100.0)
            return left or right
        if param_id == "engine.nam_level":
            return self._call_engine(engine, ["set_nam_output_gain"], value)
        if param_id == "engine.cab_mix":
            return self._call_engine(engine, ["set_cabinet_mix"], _clamp01(value))
        if param_id == "engine.volume":
            return self._call_engine(engine, ["set_master_volume", "set_output_gain", "set_master_gain_db"], value)

        # Fallback: map "plugin.param" to "set_param" if available.
        fallback_setter = f"set_{param_id.split('.')[-1]}"
        return self._call_engine(engine, [fallback_setter], value)

    def _apply_snapshot_morph_position(self, value: float) -> bool:
        async def _apply() -> bool:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
            from app.services.snapshot_service import SnapshotService

            async with get_session() as session:
                runtime_state_service = SnapshotRuntimeStateService(session)
                live_snapshot_payload = await runtime_state_service.get_live_snapshot_payload()
                if not isinstance(live_snapshot_payload, dict):
                    return False
                snapshot_id = int(live_snapshot_payload.get("id") or 0)
                if snapshot_id <= 0:
                    return False
                service = SnapshotService(session)
                updated = await service.set_morph_position(snapshot_id, _clamp01(value))
                if not isinstance(updated, dict):
                    return False
                morph_apply = updated.get("morph_apply")
                if isinstance(morph_apply, dict):
                    return bool(morph_apply.get("applied"))
                return True

        try:
            return bool(asyncio.run(_apply()))
        except Exception:
            logger.debug("Snapshot morph-position apply failed", exc_info=True)
            return False

    def _call_engine(self, engine: Any, method_names: List[str], *args: Any) -> bool:
        for name in method_names:
            fn = getattr(engine, name, None)
            if not callable(fn):
                continue
            try:
                fn(*args)
                return True
            except Exception:
                logger.debug("Engine call %s failed", name, exc_info=True)
                continue
        return False


_instance: Optional[ExpressionService] = None


def get_expression_service() -> ExpressionService:
    global _instance
    if _instance is None:
        _instance = ExpressionService()
    return _instance


def reset_expression_service_for_tests() -> None:
    global _instance
    if _instance is not None:
        _instance.shutdown()
    _instance = None
