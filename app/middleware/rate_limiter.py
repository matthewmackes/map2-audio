"""
MAP2 Audio Cluster - REST API Rate Limiting Middleware

Prevents API abuse with sliding window rate limiting algorithm.
Supports per-user, per-IP, and per-role limits with configurable thresholds.
"""

from typing import Dict, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import deque
import time
import hashlib
from enum import Enum
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)


class RateLimitScope(Enum):
    """Rate limit scope."""
    GLOBAL = "global"           # All requests
    PER_IP = "per_ip"          # Per IP address
    PER_USER = "per_user"       # Per authenticated user
    PER_ENDPOINT = "per_endpoint"  # Per API endpoint


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""
    requests_per_window: int
    window_seconds: int
    scope: RateLimitScope = RateLimitScope.PER_IP
    
    def __str__(self) -> str:
        return f"{self.requests_per_window} requests per {self.window_seconds}s ({self.scope.value})"


@dataclass
class RequestRecord:
    """Record of a single request."""
    timestamp: float
    ip_address: str
    user_id: Optional[str] = None
    endpoint: Optional[str] = None


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter.
    
    Uses a deque to track requests within the time window.
    More accurate than fixed window and more memory efficient than token bucket.
    """
    
    def __init__(self, config: RateLimitConfig):
        """Initialize rate limiter."""
        self.config = config
        self.request_log: Dict[str, deque] = {}
        self.last_cleanup = time.time()
        self.cleanup_interval = 300  # Cleanup every 5 minutes
    
    def _get_key(self, request: Request, user_id: Optional[str] = None) -> str:
        """Generate key for rate limiting based on scope."""
        if self.config.scope == RateLimitScope.GLOBAL:
            return "global"
        elif self.config.scope == RateLimitScope.PER_IP:
            return self._get_client_ip(request)
        elif self.config.scope == RateLimitScope.PER_USER:
            return user_id or self._get_client_ip(request)
        elif self.config.scope == RateLimitScope.PER_ENDPOINT:
            return f"{self._get_client_ip(request)}:{request.url.path}"
        else:
            return self._get_client_ip(request)
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request."""
        # Check for X-Forwarded-For header (proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        # Check for X-Real-IP header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fall back to client host
        return request.client.host if request.client else "unknown"
    
    def check_rate_limit(
        self, 
        request: Request, 
        user_id: Optional[str] = None
    ) -> Tuple[bool, Dict]:
        """
        Check if request should be rate limited.
        
        Args:
            request: FastAPI request object
            user_id: Optional user ID for per-user limiting
        
        Returns:
            Tuple of (allowed: bool, info: dict)
        """
        key = self._get_key(request, user_id)
        current_time = time.time()
        window_start = current_time - self.config.window_seconds
        
        # Initialize log for this key if needed
        if key not in self.request_log:
            self.request_log[key] = deque()
        
        # Remove requests outside the window
        while self.request_log[key] and self.request_log[key][0] < window_start:
            self.request_log[key].popleft()
        
        # Count requests in current window
        requests_in_window = len(self.request_log[key])
        
        # Check if limit exceeded
        allowed = requests_in_window < self.config.requests_per_window
        
        if allowed:
            # Add current request to log
            self.request_log[key].append(current_time)
        
        # Calculate time until next available request
        if not allowed and self.request_log[key]:
            oldest_request = self.request_log[key][0]
            retry_after = int(oldest_request + self.config.window_seconds - current_time)
        else:
            retry_after = 0
        
        # Periodic cleanup of old keys
        if current_time - self.last_cleanup > self.cleanup_interval:
            self._cleanup_old_keys(current_time)
        
        return allowed, {
            "limit": self.config.requests_per_window,
            "window_seconds": self.config.window_seconds,
            "requests_in_window": requests_in_window,
            "remaining": max(0, self.config.requests_per_window - requests_in_window),
            "retry_after": retry_after,
            "scope": self.config.scope.value,
            "key": key
        }
    
    def _cleanup_old_keys(self, current_time: float) -> None:
        """Remove keys with no recent requests."""
        window_start = current_time - self.config.window_seconds
        keys_to_remove = []
        
        for key, requests in self.request_log.items():
            # Remove old requests from this key's log
            while requests and requests[0] < window_start:
                requests.popleft()
            
            # If no recent requests, mark key for removal
            if not requests:
                keys_to_remove.append(key)
        
        # Remove empty keys
        for key in keys_to_remove:
            del self.request_log[key]
        
        self.last_cleanup = current_time
        
        if keys_to_remove:
            logger.debug(f"Cleaned up {len(keys_to_remove)} inactive rate limit keys")


class RateLimitManager:
    """
    Manages multiple rate limiters with different configurations.
    
    Supports role-based limits and endpoint-specific overrides.
    """
    
    def __init__(self):
        """Initialize rate limit manager."""
        self.limiters: Dict[str, SlidingWindowRateLimiter] = {}
        
        # Default limits
        self._setup_default_limits()
    
    def _setup_default_limits(self) -> None:
        """Set up default rate limit configurations."""
        # Global limit: 1000 requests per minute
        self.add_limiter(
            "global",
            RateLimitConfig(
                requests_per_window=1000,
                window_seconds=60,
                scope=RateLimitScope.GLOBAL
            )
        )
        
        # Per-IP limit: 100 requests per minute
        self.add_limiter(
            "per_ip",
            RateLimitConfig(
                requests_per_window=100,
                window_seconds=60,
                scope=RateLimitScope.PER_IP
            )
        )
        
        # Authenticated users: 200 requests per minute
        self.add_limiter(
            "authenticated",
            RateLimitConfig(
                requests_per_window=200,
                window_seconds=60,
                scope=RateLimitScope.PER_USER
            )
        )
        
        # Admin users: 500 requests per minute
        self.add_limiter(
            "admin",
            RateLimitConfig(
                requests_per_window=500,
                window_seconds=60,
                scope=RateLimitScope.PER_USER
            )
        )
        
        # Heavy endpoints (updates, backups): 10 per hour
        self.add_limiter(
            "heavy_operations",
            RateLimitConfig(
                requests_per_window=10,
                window_seconds=3600,
                scope=RateLimitScope.PER_USER
            )
        )
    
    def add_limiter(self, name: str, config: RateLimitConfig) -> None:
        """Add a new rate limiter."""
        self.limiters[name] = SlidingWindowRateLimiter(config)
        logger.info(f"Added rate limiter '{name}': {config}")
    
    def check_limits(
        self, 
        request: Request,
        user_id: Optional[str] = None,
        user_role: Optional[str] = None,
        endpoint_category: Optional[str] = None
    ) -> Tuple[bool, Dict]:
        """
        Check all applicable rate limits.
        
        Args:
            request: FastAPI request
            user_id: User identifier
            user_role: User role (e.g., 'admin', 'user')
            endpoint_category: Endpoint category (e.g., 'heavy_operations')
        
        Returns:
            Tuple of (allowed, info dict)
        """
        # Check global limit first
        allowed, global_info = self.limiters["global"].check_rate_limit(request)
        if not allowed:
            return False, {
                "limiter": "global",
                **global_info
            }
        
        # Check endpoint-specific limit
        if endpoint_category and endpoint_category in self.limiters:
            allowed, endpoint_info = self.limiters[endpoint_category].check_rate_limit(
                request, user_id
            )
            if not allowed:
                return False, {
                    "limiter": endpoint_category,
                    **endpoint_info
                }
        
        # Check role-based limit
        if user_role and user_role in self.limiters:
            allowed, role_info = self.limiters[user_role].check_rate_limit(
                request, user_id
            )
            if not allowed:
                return False, {
                    "limiter": user_role,
                    **role_info
                }
        elif user_id:
            # Authenticated but no specific role
            allowed, auth_info = self.limiters["authenticated"].check_rate_limit(
                request, user_id
            )
            if not allowed:
                return False, {
                    "limiter": "authenticated",
                    **auth_info
                }
        else:
            # Anonymous - use per-IP limit
            allowed, ip_info = self.limiters["per_ip"].check_rate_limit(request)
            if not allowed:
                return False, {
                    "limiter": "per_ip",
                    **ip_info
                }
        
        # All limits passed
        return True, {
            "limiter": "passed",
            "global": global_info
        }


# Global rate limit manager instance
rate_limit_manager = RateLimitManager()


def get_rate_limit_info(info: Dict) -> Dict:
    """Format rate limit info for response headers."""
    return {
        "X-RateLimit-Limit": str(info.get("limit", "")),
        "X-RateLimit-Remaining": str(info.get("remaining", "")),
        "X-RateLimit-Reset": str(info.get("retry_after", "")),
        "X-RateLimit-Scope": info.get("scope", "")
    }


async def rate_limit_middleware(request: Request, call_next):
    """
    FastAPI middleware for rate limiting.
    
    Usage:
        app.middleware("http")(rate_limit_middleware)
    """
    # Extract user info (would integrate with auth system)
    user_id = request.headers.get("X-User-ID")
    user_role = request.headers.get("X-User-Role")
    
    # Determine endpoint category
    endpoint_category = None
    path = request.url.path
    if "/update" in path or "/backup" in path:
        endpoint_category = "heavy_operations"
    
    # Check rate limits
    allowed, info = rate_limit_manager.check_limits(
        request,
        user_id=user_id,
        user_role=user_role,
        endpoint_category=endpoint_category
    )
    
    # Add rate limit headers
    headers = get_rate_limit_info(info)
    
    if not allowed:
        logger.warning(
            f"Rate limit exceeded for {info.get('key', 'unknown')} "
            f"on {path} (limiter: {info.get('limiter')})"
        )
        
        return JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded",
                "message": f"Too many requests. Try again in {info.get('retry_after', 0)} seconds.",
                "limit": info.get("limit"),
                "window_seconds": info.get("window_seconds"),
                "retry_after": info.get("retry_after")
            },
            headers=headers
        )
    
    # Process request
    response = await call_next(request)
    
    # Add rate limit headers to response
    for key, value in headers.items():
        response.headers[key] = value
    
    return response


# =========================================================================
# FastAPI Dependency for Endpoint-Level Rate Limiting
# =========================================================================

class RateLimitDependency:
    """
    FastAPI dependency for endpoint-specific rate limiting.
    
    Usage:
        @app.get("/endpoint", dependencies=[Depends(RateLimitDependency(10, 60))])
    """
    
    def __init__(
        self, 
        requests: int, 
        window_seconds: int,
        scope: RateLimitScope = RateLimitScope.PER_IP
    ):
        """
        Initialize rate limit dependency.
        
        Args:
            requests: Maximum requests allowed
            window_seconds: Time window in seconds
            scope: Rate limit scope
        """
        self.config = RateLimitConfig(
            requests_per_window=requests,
            window_seconds=window_seconds,
            scope=scope
        )
        self.limiter = SlidingWindowRateLimiter(self.config)
    
    async def __call__(self, request: Request):
        """Check rate limit."""
        user_id = request.headers.get("X-User-ID")
        
        allowed, info = self.limiter.check_rate_limit(request, user_id)
        
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Rate limit exceeded",
                    "retry_after": info.get("retry_after")
                },
                headers=get_rate_limit_info(info)
            )


# =========================================================================
# Configuration
# =========================================================================

def configure_rate_limits(config: Dict) -> None:
    """
    Configure rate limits from config file.
    
    Example config:
        {
            "rate_limits": {
                "global": {"requests": 1000, "window": 60},
                "per_ip": {"requests": 100, "window": 60},
                "admin": {"requests": 500, "window": 60}
            }
        }
    """
    if "rate_limits" not in config:
        return
    
    for name, limits in config["rate_limits"].items():
        scope = RateLimitScope[limits.get("scope", "PER_IP").upper()]
        
        rate_limit_manager.add_limiter(
            name,
            RateLimitConfig(
                requests_per_window=limits["requests"],
                window_seconds=limits["window"],
                scope=scope
            )
        )
    
    logger.info("Rate limits configured from config file")


# =========================================================================
# CLI/Monitoring
# =========================================================================

def get_rate_limit_stats() -> Dict:
    """Get current rate limit statistics."""
    stats = {}
    
    for name, limiter in rate_limit_manager.limiters.items():
        stats[name] = {
            "config": str(limiter.config),
            "active_keys": len(limiter.request_log),
            "total_requests_tracked": sum(
                len(log) for log in limiter.request_log.values()
            )
        }
    
    return stats


if __name__ == "__main__":
    # Test rate limiter
    import asyncio
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    
    app = FastAPI()
    app.middleware("http")(rate_limit_middleware)
    
    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}
    
    client = TestClient(app)
    
    print("Testing rate limiter...")
    print(f"Limit: 100 requests per 60 seconds (per IP)")
    
    # Make 105 requests
    for i in range(105):
        response = client.get("/test")
        if response.status_code == 429:
            print(f"\nRequest {i+1}: Rate limited!")
            print(f"Response: {response.json()}")
            break
        elif i % 20 == 0:
            print(f"Request {i+1}: OK (remaining: {response.headers.get('X-RateLimit-Remaining')})")
    
    print("\nRate limit stats:")
    for name, stats in get_rate_limit_stats().items():
        print(f"  {name}: {stats}")
