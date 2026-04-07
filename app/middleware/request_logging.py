"""
Request/Response Logging Middleware

Provides comprehensive logging for all API requests:
- Request ID, method, path, query params
- Response status, duration, size
- Error details with stack traces
- Performance metrics per endpoint
"""

import time
import uuid
import os
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.utils.logging_utils import get_logger
from app.services.request_latency_metrics import get_request_latency_collector

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all HTTP requests and responses."""
    
    def __init__(
        self,
        app: ASGIApp,
        log_body: bool = False,
        max_body_length: int = 1000,
        enabled: bool = False,
    ):
        super().__init__(app)
        self.log_body = log_body
        self.max_body_length = max_body_length
        self.enabled = enabled
        env_override = os.getenv("MAP2_REQUEST_LOGGING", "").strip().lower()
        if env_override in {"1", "true", "yes", "on"}:
            self.enabled = True
        elif env_override in {"0", "false", "no", "off"}:
            self.enabled = False
        self.latency_collector = get_request_latency_collector()
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Reuse the canonical request id when an outer layer already assigned
        # one so auth, logging, traffic capture, and proxy forwarding stay
        # aligned on a single correlation id.
        request_id = (
            getattr(request.state, "request_id", None)
            or request.headers.get("x-request-id")
            or str(uuid.uuid4())
        )
        request.state.request_id = request_id
        
        # Start timer
        start_time = time.perf_counter()
        
        # Log request (optional; disabled by default for load safety).
        if self.enabled:
            logger.info(
                f"REQUEST [{request_id[:8]}] {request.method} {request.url.path}",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                query_params=dict(request.query_params),
                client=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000
            
            if self.enabled:
                logger.info(
                    f"RESPONSE [{request_id[:8]}] "
                    f"{response.status_code} {request.method} {request.url.path} "
                    f"({duration_ms:.2f}ms)",
                    request_id=request_id,
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )

            self.latency_collector.record(request.url.path, duration_ms)
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
            
            return response
            
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self.latency_collector.record(request.url.path, duration_ms)
            
            # Log error
            logger.error(
                f"ERROR [{request_id[:8]}] {request.method} {request.url.path} "
                f"({duration_ms:.2f}ms): {str(e)}",
                exc=e,
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
                error=str(e),
                error_type=type(e).__name__,
            )
            
            raise
