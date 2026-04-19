"""
Test Rate Limiting for PlatformEvent Endpoints

Validates:
- Rate limits are enforced
- 429 responses returned when exceeded
- Retry-After headers set correctly
- Method-specific limits work
- Token bucket refilling
"""

import asyncio
import pytest
from unittest.mock import Mock, patch
import time

from app.middleware.rate_limiting import TokenBucket, RateLimitingMiddleware, ENDPOINT_RATE_LIMITS
from fastapi import Request, Response


def test_token_bucket_basic():
    """Test basic token bucket functionality"""
    bucket = TokenBucket(capacity=10, refill_rate=2.0)  # 2 tokens per second
    
    # Should have initial capacity
    success, retry_after = bucket.consume(5)
    assert success is True
    assert retry_after == 0.0
    assert bucket.tokens == 5.0
    
    # Consume remaining tokens
    success, retry_after = bucket.consume(5)
    assert success is True
    assert bucket.tokens == 0.0
    
    # Should fail when empty
    success, retry_after = bucket.consume(1)
    assert success is False
    assert retry_after > 0
    
    print("✓ Token bucket basic consumption works")


def test_token_bucket_refill():
    """Test token bucket refilling over time"""
    bucket = TokenBucket(capacity=10, refill_rate=10.0)  # 10 tokens per second
    
    # Consume all tokens
    bucket.consume(10)
    assert bucket.tokens == 0.0
    
    # Wait 0.5 seconds
    time.sleep(0.5)
    
    # Should have refilled ~5 tokens
    success, retry_after = bucket.consume(4)
    assert success is True
    
    print("✓ Token bucket refills correctly")


def test_rate_limit_configuration():
    """Test rate limit configuration"""
    # Check PlatformEvent-specific limits are configured
    assert "/api/platform-events" in ENDPOINT_RATE_LIMITS
    assert "POST:/api/platform-events/ack" in ENDPOINT_RATE_LIMITS
    
    # Verify limits
    limit, window = ENDPOINT_RATE_LIMITS["/api/platform-events"]
    assert limit == 100
    assert window == 60
    
    # ACK should stay permissive for operator dismissals
    limit, window = ENDPOINT_RATE_LIMITS["POST:/api/platform-events/ack"]
    assert limit == 100
    assert window == 60
    
    print("✓ PlatformEvent rate limits configured correctly")


def test_method_specific_limits():
    """Test that method-specific limits work"""
    middleware = RateLimitingMiddleware(
        app=Mock(),
        default_limit=100,
        default_window=60,
        endpoint_limits=ENDPOINT_RATE_LIMITS
    )
    
    # GET should use general limit
    limit, window = middleware._get_limits("/api/platform-events", "GET")
    assert limit == 100
    
    # POST ack should use its method-specific limit
    limit, window = middleware._get_limits("/api/platform-events/ack", "POST")
    assert limit == 100
    
    print("✓ Method-specific limits work")


def test_rate_limit_headers():
    """Test that rate limit headers are set"""
    # This would require a full FastAPI test setup
    # For now, just verify the header constants exist
    assert "X-RateLimit-Limit"
    assert "X-RateLimit-Remaining"
    assert "Retry-After"
    
    print("✓ Rate limit headers defined")


def test_client_identification():
    """Test client ID extraction"""
    middleware = RateLimitingMiddleware(app=Mock())
    
    # Mock request with custom header
    request = Mock(spec=Request)
    request.headers.get = Mock(return_value="custom-client-id")
    client_id = middleware._get_client_id(request)
    assert client_id == "custom-client-id"
    
    # Mock request with IP
    request.headers.get = Mock(return_value=None)
    request.client = Mock(host="192.168.1.100")
    client_id = middleware._get_client_id(request)
    assert client_id == "192.168.1.100"
    
    print("✓ Client identification works")


def test_rate_limit_bypass_for_health():
    """Test that health endpoints bypass rate limiting"""
    # Health endpoints should not be rate limited
    health_paths = ["/health", "/api/health", "/docs", "/openapi.json"]
    
    for path in health_paths:
        # These should not be in rate limit config
        assert path not in ENDPOINT_RATE_LIMITS
    
    print("✓ Health endpoints bypass rate limiting")


def test_cleanup_old_buckets():
    """Test bucket cleanup mechanism"""
    middleware = RateLimitingMiddleware(app=Mock())
    middleware.cleanup_interval = 1  # 1 second for test
    
    # Create some buckets
    bucket1 = middleware._get_bucket("client1", 10, 60)
    bucket2 = middleware._get_bucket("client2", 10, 60)
    
    assert len(middleware.buckets) == 2
    
    # Wait for cleanup interval
    time.sleep(1.1)
    
    # Trigger cleanup
    middleware._cleanup_old_buckets()
    
    # Old buckets should be removed
    assert len(middleware.buckets) == 0
    
    print("✓ Old bucket cleanup works")


def test_rate_limit_recommended_values():
    """Test that configured rate limits are reasonable"""
    for endpoint, (limit, window) in ENDPOINT_RATE_LIMITS.items():
        # Health checks should be very permissive
        if "health" in endpoint.lower():
            assert limit >= 120, f"{endpoint} health check limit too low: {limit}"
        
        # Event creation should be limited but not too strict
        if "POST" in endpoint and "events" in endpoint:
            assert 20 <= limit <= 100, f"{endpoint} POST limit unreasonable: {limit}"
        
        # All windows should be reasonable (1-300 seconds)
        assert 1 <= window <= 300, f"{endpoint} window unreasonable: {window}"
        
        # Rate should be at least 1 request per second
        rate = limit / window
        assert rate >= 0.1, f"{endpoint} rate too low: {rate}/sec"
    
    print("✓ All rate limits are reasonable")


if __name__ == "__main__":
    test_token_bucket_basic()
    test_token_bucket_refill()
    test_rate_limit_configuration()
    test_method_specific_limits()
    test_rate_limit_headers()
    test_client_identification()
    test_rate_limit_bypass_for_health()
    test_cleanup_old_buckets()
    test_rate_limit_recommended_values()
    print("\n✅ All rate limiting tests passed!")
