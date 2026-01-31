"""
Basic Test Suite for MAP2 Audio Platform

Tests for core functionality, new utilities, and middleware.
Run with: pytest tests/test_improvements.py -v
"""

import pytest
import asyncio
from datetime import datetime

# Test exception hierarchy
from app.exceptions import (
    MAP2Exception,
    PluginNotFoundException,
    AudioEngineNotInitialized,
    RateLimitException,
    DatabaseConnectionException,
)


class TestExceptions:
    """Test custom exception hierarchy."""
    
    def test_base_exception(self):
        exc = MAP2Exception("Test error", {"key": "value"})
        assert exc.message == "Test error"
        assert exc.details == {"key": "value"}
        
        dict_repr = exc.to_dict()
        assert dict_repr["error"] == "MAP2Exception"
        assert dict_repr["message"] == "Test error"
        assert dict_repr["details"]["key"] == "value"
    
    def test_plugin_not_found(self):
        exc = PluginNotFoundException("http://example.com/plugin")
        assert "http://example.com/plugin" in exc.message
        assert exc.details["uri"] == "http://example.com/plugin"
    
    def test_audio_engine_not_initialized(self):
        exc = AudioEngineNotInitialized()
        assert "not initialized" in exc.message.lower()
    
    def test_rate_limit_exception(self):
        exc = RateLimitException(100, "60s", 30.0)
        assert exc.details["limit"] == 100
        assert exc.details["retry_after"] == 30.0


# Test response models
from app.models.responses import (
    PluginLoadResponse,
    AudioStatusResponse,
    SystemHealthResponse,
    APIResponse,
    StatusEnum,
)


class TestResponseModels:
    """Test Pydantic response models."""
    
    def test_plugin_load_response(self):
        response = PluginLoadResponse(
            success=True,
            instance_id="plugin_001",
            plugin_uri="http://example.com/plugin",
            message="Loaded successfully",
            position=0
        )
        assert response.success is True
        assert response.instance_id == "plugin_001"
        
        # Test serialization
        data = response.model_dump()
        assert data["success"] is True
    
    def test_audio_status_response(self):
        status = AudioStatusResponse(
            running=True,
            initialized=True,
            sample_rate=48000,
            buffer_size=256,
            channels=2,
            cpu_load=25.5,
        )
        assert status.sample_rate == 48000
        assert status.cpu_load == 25.5
    
    def test_api_response_wrapper(self):
        response = APIResponse(
            status=StatusEnum.SUCCESS,
            message="Operation completed",
            data={"result": 42}
        )
        assert response.status == StatusEnum.SUCCESS
        assert response.data["result"] == 42
        assert isinstance(response.timestamp, datetime)


# Test rate limiting
from app.middleware.rate_limiting import TokenBucket


class TestRateLimiting:
    """Test rate limiting middleware."""
    
    def test_token_bucket_basic(self):
        bucket = TokenBucket(capacity=10, refill_rate=1.0)
        
        # Should allow first request
        allowed, retry_after = bucket.consume(1)
        assert allowed is True
        assert retry_after == 0.0
    
    def test_token_bucket_exhaustion(self):
        bucket = TokenBucket(capacity=3, refill_rate=1.0)
        
        # Consume all tokens
        for _ in range(3):
            allowed, _ = bucket.consume(1)
            assert allowed is True
        
        # Should be exhausted
        allowed, retry_after = bucket.consume(1)
        assert allowed is False
        assert retry_after > 0.0
    
    def test_token_bucket_refill(self):
        import time
        bucket = TokenBucket(capacity=1, refill_rate=10.0)  # Fast refill
        
        # Consume token
        allowed, _ = bucket.consume(1)
        assert allowed is True
        
        # Wait for refill
        time.sleep(0.2)
        
        # Should have refilled
        allowed, _ = bucket.consume(1)
        assert allowed is True


# Test plugin resource management
from app.services.plugin_resource_manager import (
    PluginResourceManager,
    ResourceLimits,
    get_resource_manager,
)


class TestPluginResourceManager:
    """Test plugin resource management."""
    
    def test_singleton(self):
        manager1 = get_resource_manager()
        manager2 = get_resource_manager()
        assert manager1 is manager2
    
    def test_set_get_limits(self):
        manager = get_resource_manager()
        limits = ResourceLimits(max_cpu_time_ms=30.0, max_memory_mb=50.0)
        
        manager.set_limits("test_plugin", limits)
        retrieved = manager.get_limits("test_plugin")
        
        assert retrieved.max_cpu_time_ms == 30.0
        assert retrieved.max_memory_mb == 50.0
    
    def test_bypass_mechanism(self):
        manager = get_resource_manager()
        plugin_uri = "test_plugin_bypass"
        
        assert not manager.is_bypassed(plugin_uri)
        
        manager.bypass_plugin(plugin_uri, "Test reason")
        assert manager.is_bypassed(plugin_uri)
        
        manager.unbypass_plugin(plugin_uri)
        assert not manager.is_bypassed(plugin_uri)


# Test configuration validation
from app.services.config_validator import ConfigValidator, ValidationResult


class TestConfigValidator:
    """Test configuration validation."""
    
    def test_valid_config(self):
        validator = ConfigValidator()
        config = {
            "backend": {"host": "0.0.0.0", "port": 8080},
            "audio": {"sample_rate": 48000, "buffer_size": 256},
        }
        
        result = validator.validate(config)
        assert result.valid is True
        assert len(result.errors) == 0
    
    def test_invalid_sample_rate(self):
        validator = ConfigValidator()
        config = {
            "audio": {"sample_rate": 32000, "buffer_size": 256}
        }
        
        result = validator.validate(config)
        # Should have error about invalid sample rate
        assert not result.valid or len(result.warnings) > 0
    
    def test_invalid_port(self):
        validator = ConfigValidator()
        config = {
            "backend": {"host": "0.0.0.0", "port": 100}  # Too low
        }
        
        result = validator.validate(config)
        assert not result.valid or len(result.errors) > 0


# Test database pool manager (unit tests only, no actual DB)
from app.services.db_pool_manager import ConnectionPoolConfig


class TestDatabasePoolManager:
    """Test database pool configuration."""
    
    def test_pool_config_defaults(self):
        config = ConnectionPoolConfig()
        assert config.pool_size == 10
        assert config.max_overflow == 20
        assert config.pool_pre_ping is True
    
    def test_pool_config_custom(self):
        config = ConnectionPoolConfig(
            pool_size=20,
            max_overflow=40,
            max_retries=5,
        )
        assert config.pool_size == 20
        assert config.max_overflow == 40
        assert config.max_retries == 5


# Integration test (if FastAPI is available)
@pytest.mark.asyncio
async def test_exception_handler_integration():
    """Test that exception handler works in FastAPI app."""
    try:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.exceptions import MAP2Exception, PluginNotFoundException
        
        app = FastAPI()
        
        @app.get("/test-exception")
        async def test_endpoint():
            raise PluginNotFoundException("test_uri")
        
        @app.exception_handler(MAP2Exception)
        async def handler(request, exc):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=400, content=exc.to_dict())
        
        client = TestClient(app)
        response = client.get("/test-exception")
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "PluginNotFoundException"
        assert "test_uri" in data["message"]
        
    except ImportError:
        pytest.skip("FastAPI not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
