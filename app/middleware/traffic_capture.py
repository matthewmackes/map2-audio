"""HTTP traffic capture middleware for API Observatory."""

from __future__ import annotations

import contextlib
import json
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.services.api_observatory import get_api_observatory_service
from app.services.websocket_manager import ws_manager

_BODY_SNIPPET_BYTES = 400  # enough for ~100 visible chars of JSON
_REQUEST_BODY_CAPTURE_LIMIT_BYTES = 4096
_DEPENDENCY_SNAPSHOT_TTL_SECONDS = 0.25
_DEPENDENCY_SNAPSHOT_RUN_TTL_SECONDS = 5.0
_RUN_ID_HEADERS = ("x-map2-run-id", "x-load-run-id", "x-request-run-id")
# These caches are only touched from async request handling on the ASGI event
# loop, so keep them lock-free instead of introducing blocking thread locks in
# the middleware hot path.
_dependency_snapshot_cache: dict[str, object] | None = None
_dependency_snapshot_cache_at = 0.0
_dependency_snapshot_run_cache: dict[str, float] = {}


def _extract_run_id(request: Request) -> str:
    for header in _RUN_ID_HEADERS:
        value = request.headers.get(header)
        if value:
            return value.strip()
    query_value = request.query_params.get("run_id")
    return query_value.strip() if query_value else ""


def _dependency_snapshot() -> dict[str, object]:
    global _dependency_snapshot_cache, _dependency_snapshot_cache_at

    now = time.monotonic()
    if (
        _dependency_snapshot_cache is not None
        and (now - _dependency_snapshot_cache_at) <= _DEPENDENCY_SNAPSHOT_TTL_SECONDS
    ):
        return dict(_dependency_snapshot_cache)

    try:
        from app.services.service_orchestrator import get_orchestrator

        status = get_orchestrator().get_all_status() or {}
        orchestrator = status.get("orchestrator", {}) if isinstance(status, dict) else {}
        services = status.get("services", {}) if isinstance(status, dict) else {}
        startup_progress = status.get("startup_progress", {}) if isinstance(status, dict) else {}
        traffic_gates = status.get("traffic_gate_services", []) if isinstance(status, dict) else []
        snapshot = {
            "orchestrator_running": bool(orchestrator.get("running")),
            "startup_progress": startup_progress,
            "traffic_gate_services": list(traffic_gates) if isinstance(traffic_gates, list) else [],
            "service_states": {
                name: {
                    "state": service.get("state", "missing"),
                    "healthy": (
                        service.get("health", {}).get("healthy")
                        if isinstance(service.get("health"), dict)
                        else None
                    ),
                }
                for name, service in services.items()
                if isinstance(service, dict)
            },
        }
        _dependency_snapshot_cache = snapshot
        _dependency_snapshot_cache_at = now
        return dict(snapshot)
    except Exception:
        return {"orchestrator_running": False, "capture_error": True}


def _should_capture_dependency_snapshot(
    *,
    observatory_recording: bool,
    run_id: str,
    status_code: int,
) -> bool:
    if observatory_recording or status_code >= 500:
        return True
    if not run_id:
        return False

    now = time.monotonic()
    cutoff = now - (_DEPENDENCY_SNAPSHOT_RUN_TTL_SECONDS * 2.0)
    stale_run_ids = [
        cached_run_id
        for cached_run_id, captured_at in _dependency_snapshot_run_cache.items()
        if captured_at < cutoff
    ]
    for stale_run_id in stale_run_ids:
        _dependency_snapshot_run_cache.pop(stale_run_id, None)

    last_captured_at = _dependency_snapshot_run_cache.get(run_id)
    if last_captured_at is not None and (now - last_captured_at) <= _DEPENDENCY_SNAPSHOT_RUN_TTL_SECONDS:
        return False

    _dependency_snapshot_run_cache[run_id] = now
    return True


def _utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _snippet(raw: bytes) -> str | None:
    """Return a compact JSON snippet (first 100 visible chars) or None."""
    if not raw:
        return None
    try:
        text = raw.decode("utf-8", errors="replace").strip()
        if not text:
            return None
        # Try to re-minify if it looks like JSON
        try:
            obj = json.loads(text)
            minified = json.dumps(obj, separators=(",", ":"))
        except Exception:
            minified = text
        return minified[:100]
    except Exception:
        return None


class TrafficCaptureMiddleware(BaseHTTPMiddleware):
    """Captures request/response telemetry into a bounded ring buffer."""

    def __init__(self, app: ASGIApp, *, enabled: bool = True) -> None:
        super().__init__(app)
        self.enabled = enabled

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not self.enabled or request.scope.get("type") != "http":
            return await call_next(request)

        path = request.url.path
        # Only record /api/* paths; skip WS upgrades, static assets, observatory itself.
        if not path.startswith("/api/") or path.startswith("/api/observatory"):
            return await call_next(request)

        started = time.perf_counter()
        request_size = int(request.headers.get("content-length") or 0)
        request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        run_id = _extract_run_id(request)
        observatory = get_api_observatory_service()
        observatory_recording = observatory.is_recording()
        request.state.request_id = request_id
        if run_id:
            request.state.run_id = run_id

        # Capture request body for mutations
        req_body_snippet: str | None = None
        if (
            request.method in ("POST", "PUT", "PATCH", "DELETE")
            and request_size > 0
            and (observatory_recording or request_size <= _REQUEST_BODY_CAPTURE_LIMIT_BYTES)
        ):
            with contextlib.suppress(Exception):
                raw_body = await request.body()
                req_body_snippet = _snippet(raw_body)

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000.0
            dependency_snapshot = (
                _dependency_snapshot()
                if _should_capture_dependency_snapshot(
                    observatory_recording=observatory_recording,
                    run_id=run_id,
                    status_code=500,
                )
                else None
            )
            event = observatory.record_traffic_event(
                {
                    "timestamp": _utc_now_iso(),
                    "method": request.method,
                    "path": path,
                    "status": 500,
                    "duration_ms": duration_ms,
                    "request_size": request_size,
                    "response_size": 0,
                    "client_ip": request.client.host if request.client else "unknown",
                    "request_id": request_id,
                    "run_id": run_id,
                    "meta": {
                        "error": "unhandled_exception",
                        "req_body": req_body_snippet,
                        "res_body": None,
                        "dependency_snapshot": dependency_snapshot,
                    },
                }
            )
            if ws_manager.get_subscribers("traffic_event"):
                await ws_manager.broadcast_json(
                    {
                        "type": "traffic_event",
                        "topic": "traffic_event",
                        "data": event,
                    },
                    topic="traffic_event",
                )
            raise

        duration_ms = (time.perf_counter() - started) * 1000.0
        response_size = int(response.headers.get("content-length") or 0)

        # Mirroring every successful body back through middleware is expensive under load.
        # Keep the hot path cheap unless an operator explicitly enabled recording or the
        # response is already an error we need to inspect.
        res_body_snippet: str | None = None
        capture_response_body = observatory_recording or response.status_code >= 400
        if capture_response_body:
            with contextlib.suppress(Exception):
                body_chunks: list[bytes] = []
                async for chunk in response.body_iterator:  # type: ignore[attr-defined]
                    body_chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
                raw_response_body = b"".join(body_chunks)
                if not response_size:
                    response_size = len(raw_response_body)
                res_body_snippet = _snippet(raw_response_body[:_BODY_SNIPPET_BYTES])
                # Reconstruct a new response with the consumed body
                from starlette.responses import Response as StarletteResponse
                response = StarletteResponse(
                    content=raw_response_body,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.media_type,
                )

        dependency_snapshot = (
            _dependency_snapshot()
            if _should_capture_dependency_snapshot(
                observatory_recording=observatory_recording,
                run_id=run_id,
                status_code=response.status_code,
            )
            else None
        )

        event = observatory.record_traffic_event(
            {
                "timestamp": _utc_now_iso(),
                "method": request.method,
                "path": path,
                "status": response.status_code,
                "duration_ms": duration_ms,
                "request_size": request_size,
                "response_size": response_size,
                "client_ip": request.client.host if request.client else "unknown",
                "request_id": request_id,
                "run_id": run_id,
                "meta": {
                    "query": dict(request.query_params),
                    "req_body": req_body_snippet,
                    "res_body": res_body_snippet,
                    "dependency_snapshot": dependency_snapshot,
                },
            }
        )

        if ws_manager.get_subscribers("traffic_event"):
            await ws_manager.broadcast_json(
                {
                    "type": "traffic_event",
                    "topic": "traffic_event",
                    "data": event,
                },
                topic="traffic_event",
            )

        response.headers["X-Request-ID"] = request_id
        return response
