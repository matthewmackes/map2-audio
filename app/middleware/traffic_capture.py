"""HTTP traffic capture middleware for API Observatory."""

from __future__ import annotations

import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.services.api_observatory import get_api_observatory_service
from app.services.websocket_manager import ws_manager


def _utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


class TrafficCaptureMiddleware(BaseHTTPMiddleware):
    """Captures request/response telemetry into a bounded ring buffer."""

    def __init__(self, app: ASGIApp, *, enabled: bool = True) -> None:
        super().__init__(app)
        self.enabled = enabled

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not self.enabled or request.scope.get("type") != "http":
            return await call_next(request)

        path = request.url.path
        # Avoid recording static assets and websocket upgrades.
        if path.startswith(("/assets", "/css", "/img", "/ws", "/api/observatory")):
            return await call_next(request)

        started = time.perf_counter()
        request_size = int(request.headers.get("content-length") or 0)
        request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000.0
            event = get_api_observatory_service().record_traffic_event(
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
                    "meta": {"error": "unhandled_exception"},
                }
            )
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

        event = get_api_observatory_service().record_traffic_event(
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
                "meta": {
                    "query": dict(request.query_params),
                },
            }
        )

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
