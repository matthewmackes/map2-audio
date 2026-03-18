"""API Observatory shared state and helpers.

Provides:
- bounded live traffic ring buffer
- request statistics and endpoint aggregations
- recording sessions with export/import helpers
"""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
from statistics import mean
from typing import Any, Deque, Dict, Iterable, List, Optional
from uuid import uuid4


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    rank = (percentile / 100.0) * (len(ordered) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    weight = rank - lower
    return round(ordered[lower] * (1.0 - weight) + ordered[upper] * weight, 2)


@dataclass
class TrafficSession:
    session_id: str
    name: str
    started_at: str
    stopped_at: Optional[str]
    events: list[dict[str, Any]]


class ApiObservatoryService:
    def __init__(self, max_events: int = 1000) -> None:
        self._events: Deque[dict[str, Any]] = deque(maxlen=max(1, max_events))
        self._sessions: dict[str, TrafficSession] = {}
        self._recording_session_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Event capture
    # ------------------------------------------------------------------

    def record_traffic_event(self, event: dict[str, Any]) -> dict[str, Any]:
        normalized = {
            "id": event.get("id") or str(uuid4()),
            "timestamp": event.get("timestamp") or _utc_now_iso(),
            "event_type": str(event.get("event_type", "http")),
            "method": str(event.get("method", "GET")).upper(),
            "path": str(event.get("path", "/")),
            "status": int(event.get("status", 0)),
            "duration_ms": float(event.get("duration_ms", 0.0)),
            "request_size": int(event.get("request_size", 0)),
            "response_size": int(event.get("response_size", 0)),
            "client_ip": str(event.get("client_ip", "unknown")),
            "request_id": str(event.get("request_id", "")),
            "run_id": str(event.get("run_id", "")),
            "node_id": str(event.get("node_id", "local")),
            "meta": event.get("meta") if isinstance(event.get("meta"), dict) else {},
        }
        self._events.append(normalized)

        if self._recording_session_id:
            session = self._sessions.get(self._recording_session_id)
            if session is not None:
                session.events.append(dict(normalized))

        return normalized

    def list_traffic_events(
        self,
        *,
        limit: int = 200,
        event_type: Optional[str] = None,
        method: Optional[str] = None,
        run_id: Optional[str] = None,
        status_min: Optional[int] = None,
        status_max: Optional[int] = None,
        path_pattern: Optional[str] = None,
        min_duration_ms: Optional[float] = None,
        min_size_bytes: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        items = list(self._events)

        if event_type:
            normalized_event_type = event_type.lower()
            items = [
                item
                for item in items
                if str(item.get("event_type", "http")).lower() == normalized_event_type
            ]

        if method:
            normalized = method.upper()
            items = [item for item in items if item.get("method") == normalized]

        if run_id:
            items = [item for item in items if str(item.get("run_id", "")) == run_id]

        if status_min is not None:
            items = [item for item in items if int(item.get("status", 0)) >= status_min]
        if status_max is not None:
            items = [item for item in items if int(item.get("status", 0)) <= status_max]

        if path_pattern:
            try:
                regex = re.compile(path_pattern)
                items = [item for item in items if regex.search(str(item.get("path", "")))]
            except re.error:
                items = [
                    item for item in items if path_pattern in str(item.get("path", ""))
                ]

        if min_duration_ms is not None:
            items = [
                item
                for item in items
                if float(item.get("duration_ms", 0.0)) >= float(min_duration_ms)
            ]

        if min_size_bytes is not None:
            items = [
                item
                for item in items
                if int(item.get("response_size", 0)) >= int(min_size_bytes)
            ]

        bounded_limit = max(1, min(int(limit), 5000))
        return items[-bounded_limit:]

    # ------------------------------------------------------------------
    # Statistics
    # ------------------------------------------------------------------

    def build_traffic_stats(
        self, events: Optional[Iterable[dict[str, Any]]] = None
    ) -> dict[str, Any]:
        rows = list(events if events is not None else self._events)
        if not rows:
            return {
                "total_requests": 0,
                "avg_response_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "error_rate_percent": 0.0,
                "requests_per_second": 0.0,
                "top_slowest_endpoints": [],
                "top_called_endpoints": [],
                "response_size_by_endpoint": [],
                "websocket_events": 0,
                "websocket_disconnects": 0,
                "websocket_errors": 0,
            }

        websocket_rows = [
            row for row in rows if str(row.get("event_type", "http")).lower() == "websocket"
        ]
        http_rows = [
            row for row in rows if str(row.get("event_type", "http")).lower() != "websocket"
        ]

        if not http_rows:
            return {
                "total_requests": 0,
                "avg_response_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "error_rate_percent": 0.0,
                "requests_per_second": 0.0,
                "top_slowest_endpoints": [],
                "top_called_endpoints": [],
                "response_size_by_endpoint": [],
                "websocket_events": len(websocket_rows),
                "websocket_disconnects": sum(
                    1
                    for row in websocket_rows
                    if str(row.get("meta", {}).get("action", "")).startswith("disconnect")
                ),
                "websocket_errors": sum(
                    1
                    for row in websocket_rows
                    if str(row.get("meta", {}).get("action", "")).endswith("error")
                ),
            }

        durations = [float(row.get("duration_ms", 0.0)) for row in http_rows]
        statuses = [int(row.get("status", 0)) for row in http_rows]
        endpoint_counter = Counter(str(row.get("path", "")) for row in http_rows)

        # Parse timestamps to estimate request rate.
        timestamps: list[datetime] = []
        for row in http_rows:
            raw = row.get("timestamp")
            if isinstance(raw, str):
                try:
                    timestamps.append(datetime.fromisoformat(raw.replace("Z", "+00:00")))
                except ValueError:
                    continue
        timestamps.sort()

        if len(timestamps) >= 2:
            span_seconds = max(
                (timestamps[-1] - timestamps[0]).total_seconds(),
                1e-3,
            )
            rps = round(len(http_rows) / span_seconds, 2)
        else:
            rps = float(len(http_rows))

        errors = [status for status in statuses if status >= 400]

        slowest = sorted(http_rows, key=lambda row: float(row.get("duration_ms", 0.0)), reverse=True)[:10]
        endpoint_sizes: dict[str, int] = {}
        for row in http_rows:
            path = str(row.get("path", ""))
            endpoint_sizes[path] = endpoint_sizes.get(path, 0) + int(row.get("response_size", 0))

        return {
            "total_requests": len(http_rows),
            "avg_response_ms": round(mean(durations), 2),
            "p95_ms": _percentile(durations, 95),
            "p99_ms": _percentile(durations, 99),
            "error_rate_percent": round((len(errors) / len(http_rows)) * 100.0, 2),
            "requests_per_second": rps,
            "top_slowest_endpoints": [
                {
                    "path": str(row.get("path", "")),
                    "method": str(row.get("method", "GET")),
                    "duration_ms": float(row.get("duration_ms", 0.0)),
                    "status": int(row.get("status", 0)),
                }
                for row in slowest
            ],
            "top_called_endpoints": [
                {"path": path, "count": count}
                for path, count in endpoint_counter.most_common(10)
            ],
            "response_size_by_endpoint": [
                {"path": path, "size_bytes": size}
                for path, size in sorted(endpoint_sizes.items(), key=lambda item: item[1], reverse=True)[:20]
            ],
            "websocket_events": len(websocket_rows),
            "websocket_disconnects": sum(
                1
                for row in websocket_rows
                if str(row.get("meta", {}).get("action", "")).startswith("disconnect")
            ),
            "websocket_errors": sum(
                1
                for row in websocket_rows
                if str(row.get("meta", {}).get("action", "")).endswith("error")
            ),
        }

    # ------------------------------------------------------------------
    # Session recording
    # ------------------------------------------------------------------

    def start_recording(self, name: Optional[str] = None) -> TrafficSession:
        if self._recording_session_id:
            active = self._sessions.get(self._recording_session_id)
            if active is not None:
                return active

        session_id = str(uuid4())
        session = TrafficSession(
            session_id=session_id,
            name=name or f"Session {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            started_at=_utc_now_iso(),
            stopped_at=None,
            events=[],
        )
        self._sessions[session_id] = session
        self._recording_session_id = session_id
        return session

    def stop_recording(self) -> Optional[TrafficSession]:
        if not self._recording_session_id:
            return None
        session = self._sessions.get(self._recording_session_id)
        self._recording_session_id = None
        if session is not None and session.stopped_at is None:
            session.stopped_at = _utc_now_iso()
        return session

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = sorted(
            self._sessions.values(),
            key=lambda item: item.started_at,
            reverse=True,
        )
        return [
            {
                "session_id": session.session_id,
                "name": session.name,
                "started_at": session.started_at,
                "stopped_at": session.stopped_at,
                "event_count": len(session.events),
            }
            for session in sessions
        ]

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        return {
            "session_id": session.session_id,
            "name": session.name,
            "started_at": session.started_at,
            "stopped_at": session.stopped_at,
            "events": list(session.events),
            "stats": self.build_traffic_stats(session.events),
        }

    def import_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_session_id = str(payload.get("session_id") or uuid4())
        session_id = base_session_id
        if session_id in self._sessions:
            session_id = f"{base_session_id}-{uuid4()}"

        events = payload.get("events")
        if not isinstance(events, list):
            events = []

        normalized_events = []
        for event in events:
            if not isinstance(event, dict):
                normalized_events.append(
                    {
                        "id": str(uuid4()),
                        "timestamp": _utc_now_iso(),
                        "method": "GET",
                        "event_type": "http",
                        "path": "/",
                        "status": 0,
                        "duration_ms": 0.0,
                        "request_size": 0,
                        "response_size": 0,
                        "client_ip": "unknown",
                        "request_id": "",
                        "run_id": "",
                        "node_id": "local",
                        "meta": {},
                    }
                )
                continue

            normalized_events.append(
                {
                    "id": str(event.get("id") or uuid4()),
                    "timestamp": str(event.get("timestamp") or _utc_now_iso()),
                    "event_type": str(event.get("event_type", "http")),
                    "method": str(event.get("method", "GET")).upper(),
                    "path": str(event.get("path", "/")),
                    "status": int(event.get("status", 0)),
                    "duration_ms": float(event.get("duration_ms", 0.0)),
                    "request_size": int(event.get("request_size", 0)),
                    "response_size": int(event.get("response_size", 0)),
                    "client_ip": str(event.get("client_ip", "unknown")),
                    "request_id": str(event.get("request_id", "")),
                    "run_id": str(event.get("run_id", "")),
                    "node_id": str(event.get("node_id", "local")),
                    "meta": event.get("meta") if isinstance(event.get("meta"), dict) else {},
                }
            )

        session = TrafficSession(
            session_id=session_id,
            name=str(payload.get("name") or f"Imported {session_id}"),
            started_at=str(payload.get("started_at") or _utc_now_iso()),
            stopped_at=str(payload.get("stopped_at")) if payload.get("stopped_at") else _utc_now_iso(),
            events=normalized_events,
        )
        self._sessions[session_id] = session
        return self.get_session(session_id) or {
            "session_id": session_id,
            "events": normalized_events,
        }

    def export_session_har(self, session_id: str) -> Optional[dict[str, Any]]:
        session = self._sessions.get(session_id)
        if session is None:
            return None

        entries = []
        for event in session.events:
            entries.append(
                {
                    "startedDateTime": event.get("timestamp"),
                    "time": float(event.get("duration_ms", 0.0)),
                    "request": {
                        "method": event.get("method"),
                        "url": event.get("path"),
                        "headers": [],
                        "queryString": [],
                        "headersSize": int(event.get("request_size", 0)),
                        "bodySize": int(event.get("request_size", 0)),
                    },
                    "response": {
                        "status": int(event.get("status", 0)),
                        "statusText": "",
                        "headers": [],
                        "content": {
                            "size": int(event.get("response_size", 0)),
                            "mimeType": "application/json",
                            "text": json.dumps(event.get("meta", {}), default=str),
                        },
                        "redirectURL": "",
                        "headersSize": int(event.get("response_size", 0)),
                        "bodySize": int(event.get("response_size", 0)),
                    },
                    "timings": {
                        "blocked": 0,
                        "dns": -1,
                        "connect": -1,
                        "ssl": -1,
                        "send": 0,
                        "wait": float(event.get("duration_ms", 0.0)),
                        "receive": 0,
                    },
                }
            )

        return {
            "log": {
                "version": "1.2",
                "creator": {"name": "MAP2 API Observatory", "version": "1.0"},
                "pages": [],
                "entries": entries,
            }
        }

    @property
    def recording_session_id(self) -> Optional[str]:
        return self._recording_session_id


_api_observatory_service: Optional[ApiObservatoryService] = None


def get_api_observatory_service() -> ApiObservatoryService:
    global _api_observatory_service
    if _api_observatory_service is None:
        _api_observatory_service = ApiObservatoryService()
    return _api_observatory_service
