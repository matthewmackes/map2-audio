"""
Rate Limiting Middleware

Protects API endpoints from abuse and resource exhaustion:
- Per-client rate limiting with configurable windows
- Token bucket algorithm for smooth rate limiting
- Configurable limits per endpoint
- Automatic 429 responses with Retry-After header
"""

import time
from typing import Dict, Tuple, Optional
from collections import defaultdict
from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import threading

from app.utils.logging_utils import get_logger
from app.exceptions import RateLimitException

logger = get_logger(__name__)

# Global rate limiting enabled state (default: True)
_rate_limiting_enabled = True
_rate_limiting_lock = threading.Lock()


def set_rate_limiting_enabled(enabled: bool) -> None:
    """Set whether rate limiting is enabled globally."""
    global _rate_limiting_enabled
    with _rate_limiting_lock:
        _rate_limiting_enabled = enabled
        state = "enabled" if enabled else "disabled"
        logger.info(f"Rate limiting {state}")


def get_rate_limiting_enabled() -> bool:
    """Get whether rate limiting is currently enabled."""
    with _rate_limiting_lock:
        return _rate_limiting_enabled


class TokenBucket:
    """Token bucket for rate limiting."""
    
    def __init__(self, capacity: int, refill_rate: float):
        """
        Initialize token bucket.
        
        Args:
            capacity: Maximum number of tokens
            refill_rate: Tokens per second refill rate
        """
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = float(capacity)
        self.last_refill = time.time()
        self.lock = threading.Lock()
    
    def consume(self, tokens: int = 1) -> Tuple[bool, float]:
        """
        Try to consume tokens.
        
        Returns:
            (success, retry_after_seconds)
        """
        with self.lock:
            now = time.time()
            
            # Refill tokens
            elapsed = now - self.last_refill
            refill_amount = elapsed * self.refill_rate
            self.tokens = min(self.capacity, self.tokens + refill_amount)
            self.last_refill = now
            
            # Check if we have enough tokens
            if self.tokens >= tokens:
                self.tokens -= tokens
                # Avoid tiny floating-point residue after exact consumption.
                if abs(self.tokens) < 1e-4:
                    self.tokens = 0.0
                return True, 0.0
            else:
                # Calculate retry after
                needed_tokens = tokens - self.tokens
                retry_after = needed_tokens / self.refill_rate
                return False, retry_after


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce rate limits per client."""
    
    def __init__(
        self,
        app: ASGIApp,
        default_limit: int = 100,  # requests
        default_window: int = 60,  # seconds
        endpoint_limits: Optional[Dict[str, Tuple[int, int]]] = None,
    ):
        super().__init__(app)
        self.default_limit = default_limit
        self.default_window = default_window
        self.endpoint_limits = endpoint_limits or {}
        
        # Storage for token buckets per client
        self.buckets: Dict[str, TokenBucket] = {}
        self.bucket_lock = threading.Lock()
        
        # Cleanup old buckets periodically
        self.cleanup_interval = 300  # 5 minutes
        self.last_cleanup = time.time()
    
    def _get_client_id(self, request: Request) -> str:
        """Get client identifier from request."""
        # Try to get from custom header first
        client_id = request.headers.get("X-Client-ID")
        if client_id:
            return client_id
        
        # Fall back to IP address
        if request.client:
            return request.client.host
        
        return "unknown"
    
    def _get_limits(self, path: str, method: str = "GET") -> Tuple[int, int]:
        """Get rate limits for endpoint with method awareness."""
        # Check method-specific match (e.g., "POST:/api/lcd/events")
        method_specific_key = f"{method}:{path}"
        if method_specific_key in self.endpoint_limits:
            return self.endpoint_limits[method_specific_key]
        
        # Check exact match
        if path in self.endpoint_limits:
            return self.endpoint_limits[path]
        
        # Check prefix match
        for pattern, limits in self.endpoint_limits.items():
            # Skip method-specific patterns in prefix matching
            if ":" in pattern:
                continue
            if path.startswith(pattern):
                return limits
        
        # Default limits
        return self.default_limit, self.default_window
    
    def _get_bucket(self, client_id: str, limit: int, window: int) -> TokenBucket:
        """Get or create token bucket for client."""
        with self.bucket_lock:
            key = f"{client_id}:{limit}:{window}"
            
            if key not in self.buckets:
                refill_rate = limit / window
                self.buckets[key] = TokenBucket(limit, refill_rate)
            
            return self.buckets[key]
    
    def _cleanup_old_buckets(self):
        """Remove unused token buckets."""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return
        
        with self.bucket_lock:
            # Remove buckets that haven't been used recently
            keys_to_remove = []
            for key, bucket in self.buckets.items():
                if now - bucket.last_refill > self.cleanup_interval:
                    keys_to_remove.append(key)
            
            for key in keys_to_remove:
                del self.buckets[key]
            
            if keys_to_remove:
                logger.debug(f"Cleaned up {len(keys_to_remove)} old rate limit buckets")
            
            self.last_cleanup = now
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/api/health", "/docs", "/openapi.json"]:
            return await call_next(request)

        # Check if rate limiting is enabled globally
        if not get_rate_limiting_enabled():
            return await call_next(request)

        # Get client ID and limits
        client_id = self._get_client_id(request)
        limit, window = self._get_limits(request.url.path, request.method)

        # Get token bucket
        bucket = self._get_bucket(client_id, limit, window)

        # Try to consume token
        allowed, retry_after = bucket.consume()

        if not allowed:
            # Rate limit exceeded
            logger.warning(
                f"⚠️  Rate limit exceeded for {client_id} on {request.url.path}",
                extra={
                    "client_id": client_id,
                    "path": request.url.path,
                    "limit": limit,
                    "window": window,
                    "retry_after": retry_after,
                }
            )
            
            # Track violation in health metrics
            try:
                from app.utils.health_metrics import get_health_metrics
                metrics = get_health_metrics()
                metrics.record_rate_limit_violation(request.url.path)
            except Exception:
                pass  # Don't fail if metrics unavailable

            # Return 429 Too Many Requests
            return Response(
                content=f'{{"error":"Rate limit exceeded","limit":{limit},"window":"{window}s","retry_after":{retry_after:.1f}}}',
                status_code=429,
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Window": f"{window}s",
                    "Retry-After": str(int(retry_after) + 1),
                },
                media_type="application/json",
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Window"] = f"{window}s"
        response.headers["X-RateLimit-Remaining"] = str(int(bucket.tokens))

        # Periodic cleanup
        self._cleanup_old_buckets()

        return response


# Predefined rate limits for different endpoint patterns
ENDPOINT_RATE_LIMITS = {
    "/api/plugins/load": (10, 60),      # 10 loads per minute
    "/api/plugins/scan": (6, 60),       # 6 scans per minute
    "/api/chains/create": (20, 60),     # 20 chains per minute
    "/api/audio/start": (6, 60),        # 6 audio starts per minute
    "/api/system/": (30, 60),           # 30 system calls per minute
    "/api/backup/create": (1, 10),      # conservative but within global policy floor
    
    # LCD Event System rate limits
    "/api/lcd/events": (100, 60),       # 100 event queries per minute
    "/api/lcd/history": (30, 60),       # 30 history queries per minute
    "/api/lcd/stats": (60, 60),         # 60 stats queries per minute
    "/api/lcd/status": (120, 60),       # 120 status queries per minute (monitoring)
    "/api/lcd/health": (300, 60),       # 300 health checks per minute (load balancers)
    "/api/lcd/metrics": (120, 60),      # 120 Prometheus scrapes per minute
    
    # LCD Event Creation (stricter to prevent storms)
    "POST:/api/lcd/events": (50, 60),   # 50 event creations per minute per client
}
