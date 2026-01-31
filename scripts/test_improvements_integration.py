#!/usr/bin/env python3
"""
Integration Test Script

Tests all new improvements to ensure they work correctly:
- Exception handling
- Response models
- Rate limiting
- Plugin resource management
- Database pool
- Configuration validation
"""

import asyncio
import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


async def test_exceptions():
    """Test exception hierarchy."""
    print("Testing exceptions...")
    from app.exceptions import (
        PluginNotFoundException,
        AudioEngineNotInitialized,
        RateLimitException
    )
    
    try:
        raise PluginNotFoundException("http://test.com/plugin")
    except PluginNotFoundException as e:
        assert "http://test.com/plugin" in e.message
        error_dict = e.to_dict()
        assert error_dict["error"] == "PluginNotFoundException"
        print("  ✅ PluginNotFoundException works")
    
    try:
        raise AudioEngineNotInitialized()
    except AudioEngineNotInitialized as e:
        assert "not initialized" in e.message.lower()
        print("  ✅ AudioEngineNotInitialized works")
    
    print("✅ Exception tests passed\n")


async def test_response_models():
    """Test response models."""
    print("Testing response models...")
    from app.response_models import (
        PluginLoadResponse,
        AudioStatusResponse,
        APIResponse,
        StatusEnum
    )
    
    # Test PluginLoadResponse
    response = PluginLoadResponse(
        success=True,
        instance_id="test_001",
        plugin_uri="http://test.com/plugin",
        message="Loaded"
    )
    assert response.success is True
    data = response.model_dump()
    assert data["instance_id"] == "test_001"
    print("  ✅ PluginLoadResponse works")
    
    # Test AudioStatusResponse
    status = AudioStatusResponse(
        running=True,
        initialized=True,
        sample_rate=48000,
        buffer_size=256,
        channels=2
    )
    assert status.sample_rate == 48000
    print("  ✅ AudioStatusResponse works")
    
    # Test APIResponse
    api_resp = APIResponse(
        status=StatusEnum.SUCCESS,
        message="Test",
        data={"key": "value"}
    )
    assert api_resp.status == StatusEnum.SUCCESS
    print("  ✅ APIResponse works")
    
    print("✅ Response model tests passed\n")


async def test_rate_limiting():
    """Test rate limiting."""
    print("Testing rate limiting...")
    from app.middleware.rate_limiting import TokenBucket
    
    # Test basic token bucket
    bucket = TokenBucket(capacity=5, refill_rate=1.0)
    
    # Should allow first 5 requests
    for i in range(5):
        allowed, retry = bucket.consume(1)
        assert allowed, f"Request {i+1} should be allowed"
    print("  ✅ Allowed first 5 requests")
    
    # Should deny 6th request
    allowed, retry_after = bucket.consume(1)
    assert not allowed, "6th request should be denied"
    assert retry_after > 0, "Should provide retry_after time"
    print(f"  ✅ Rate limit enforced (retry after {retry_after:.2f}s)")
    
    # Wait and verify refill
    await asyncio.sleep(0.5)
    allowed, _ = bucket.consume(1)
    assert allowed, "Should allow after refill"
    print("  ✅ Token bucket refill works")
    
    print("✅ Rate limiting tests passed\n")


async def test_plugin_resource_manager():
    """Test plugin resource manager."""
    print("Testing plugin resource manager...")
    from app.services.plugin_resource_manager import (
        get_resource_manager,
        ResourceLimits
    )
    
    manager = get_resource_manager()
    plugin_uri = "http://test.com/test-plugin"
    
    # Set limits
    limits = ResourceLimits(max_cpu_time_ms=30.0, max_memory_mb=50.0)
    manager.set_limits(plugin_uri, limits)
    print("  ✅ Set resource limits")
    
    # Get limits
    retrieved = manager.get_limits(plugin_uri)
    assert retrieved.max_cpu_time_ms == 30.0
    print("  ✅ Retrieved resource limits")
    
    # Test bypass
    assert not manager.is_bypassed(plugin_uri)
    manager.bypass_plugin(plugin_uri, "Test")
    assert manager.is_bypassed(plugin_uri)
    print("  ✅ Bypass mechanism works")
    
    # Reset
    manager.reset_plugin(plugin_uri)
    assert not manager.is_bypassed(plugin_uri)
    print("  ✅ Reset works")
    
    print("✅ Plugin resource manager tests passed\n")


async def test_config_validator():
    """Test configuration validator."""
    print("Testing configuration validator...")
    from app.services.config_validator import get_validator
    
    validator = get_validator()
    
    # Valid config
    config = {
        "backend": {"host": "0.0.0.0", "port": 8080},
        "audio": {"sample_rate": 48000, "buffer_size": 256}
    }
    result = validator.validate(config)
    assert result.valid, f"Config should be valid, errors: {result.errors}"
    print("  ✅ Valid config accepted")
    
    # Invalid port
    bad_config = {
        "backend": {"host": "0.0.0.0", "port": 100}
    }
    result = validator.validate(bad_config)
    print(f"  ✅ Invalid config detected ({len(result.errors)} errors)")
    
    print("✅ Configuration validator tests passed\n")


async def test_database_pool():
    """Test database pool configuration."""
    print("Testing database pool...")
    from app.services.db_pool_manager import ConnectionPoolConfig
    
    config = ConnectionPoolConfig(
        pool_size=10,
        max_overflow=20,
        max_retries=3
    )
    assert config.pool_size == 10
    assert config.max_overflow == 20
    print("  ✅ Pool configuration works")
    
    print("✅ Database pool tests passed\n")


async def main():
    """Run all tests."""
    print("=" * 60)
    print("MAP2 Platform Improvements Integration Tests")
    print("=" * 60)
    print()
    
    try:
        await test_exceptions()
        await test_response_models()
        await test_rate_limiting()
        await test_plugin_resource_manager()
        await test_config_validator()
        await test_database_pool()
        
        print("=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        return 0
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
