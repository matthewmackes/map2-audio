"""
Tests for Graceful Degradation System

Tests for feature availability management and fallback strategies.
"""

import pytest
import asyncio
from datetime import datetime

from app.services.graceful_degradation import (
    Feature, FeatureLevel, FeatureStatus, FeatureAvailabilityManager,
    DegradationStrategy, FeatureMetrics
)


class TestFeatureLevel:
    """Test feature priority levels."""
    
    def test_feature_levels(self):
        """Test all feature levels exist."""
        assert FeatureLevel.CORE.value == 4
        assert FeatureLevel.ESSENTIAL.value == 3
        assert FeatureLevel.STANDARD.value == 2
        assert FeatureLevel.OPTIONAL.value == 1


class TestFeatureStatus:
    """Test feature status enum."""
    
    def test_feature_statuses(self):
        """Test all feature statuses."""
        assert FeatureStatus.AVAILABLE.value == "available"
        assert FeatureStatus.DEGRADED.value == "degraded"
        assert FeatureStatus.LIMITED.value == "limited"
        assert FeatureStatus.UNAVAILABLE.value == "unavailable"


class TestFeature:
    """Test Feature dataclass."""
    
    def test_feature_initialization(self):
        """Test feature initializes correctly."""
        feature = Feature(
            name="user_service",
            level=FeatureLevel.CORE
        )
        
        assert feature.name == "user_service"
        assert feature.level == FeatureLevel.CORE
        assert feature.status == FeatureStatus.AVAILABLE
        assert feature.is_core is True
        assert feature.is_operational is True
    
    def test_feature_with_dependencies(self):
        """Test feature with dependencies."""
        feature = Feature(
            name="payment",
            level=FeatureLevel.ESSENTIAL,
            dependencies=["auth", "database"]
        )
        
        assert "auth" in feature.dependencies
        assert "database" in feature.dependencies
        assert len(feature.dependencies) == 2
    
    def test_feature_operational_status(self):
        """Test operational status checks."""
        feature = Feature(name="test", level=FeatureLevel.STANDARD)
        
        # Available is operational
        feature.status = FeatureStatus.AVAILABLE
        assert feature.is_operational is True
        
        # Degraded is operational
        feature.status = FeatureStatus.DEGRADED
        assert feature.is_operational is True
        
        # Unavailable is not operational
        feature.status = FeatureStatus.UNAVAILABLE
        assert feature.is_operational is False


class TestDegradationStrategy:
    """Test degradation strategy."""
    
    def test_strategy_initialization(self):
        """Test strategy initializes correctly."""
        strategy = DegradationStrategy(
            failure_threshold=5,
            recovery_timeout_seconds=120
        )
        
        assert strategy.failure_threshold == 5
        assert strategy.recovery_timeout_seconds == 120
    
    def test_should_degrade_threshold(self):
        """Test degradation threshold."""
        strategy = DegradationStrategy(failure_threshold=3)
        
        assert strategy.should_degrade(2) is False
        assert strategy.should_degrade(3) is True
        assert strategy.should_degrade(5) is True
    
    def test_should_attempt_recovery(self):
        """Test recovery timeout."""
        strategy = DegradationStrategy(recovery_timeout_seconds=60)
        
        # No previous failure
        assert strategy.should_attempt_recovery(None) is True
        
        # Recent failure
        recent = datetime.now()
        assert strategy.should_attempt_recovery(recent) is False
        
        # Old failure (mocked)
        old = datetime.now()
        # In real test, would need to mock time


class TestFeatureMetrics:
    """Test feature metrics."""
    
    def test_metrics_initialization(self):
        """Test metrics initialize correctly."""
        metrics = FeatureMetrics(
            name="test",
            level=FeatureLevel.STANDARD,
            status=FeatureStatus.AVAILABLE
        )
        
        assert metrics.name == "test"
        assert metrics.total_requests == 0
        assert metrics.success_rate == 0.0
    
    def test_success_rate_calculation(self):
        """Test success rate calculation."""
        metrics = FeatureMetrics(
            name="test",
            level=FeatureLevel.STANDARD,
            status=FeatureStatus.AVAILABLE,
            total_requests=100,
            successful_requests=85
        )
        
        assert metrics.success_rate == 85.0
    
    def test_availability_percentage(self):
        """Test availability percentage."""
        metrics = FeatureMetrics(
            name="test",
            level=FeatureLevel.CORE,
            status=FeatureStatus.AVAILABLE,
            availability_percentage=99.5
        )
        
        assert metrics.availability_percentage == 99.5


class TestFeatureAvailabilityManager:
    """Test feature manager."""
    
    def test_manager_initialization(self):
        """Test manager initializes correctly."""
        manager = FeatureAvailabilityManager()
        
        assert len(manager.features) == 0
    
    def test_register_feature(self):
        """Test registering a feature."""
        manager = FeatureAvailabilityManager()
        
        feature = Feature(name="auth", level=FeatureLevel.CORE)
        manager.register_feature(feature)
        
        assert "auth" in manager.features
        assert manager.features["auth"].name == "auth"
    
    @pytest.mark.asyncio
    async def test_execute_feature_full(self):
        """Test executing feature with full handler."""
        manager = FeatureAvailabilityManager()
        
        async def full_handler():
            return {"result": "success"}
        
        feature = Feature(
            name="test",
            level=FeatureLevel.STANDARD,
            full_handler=full_handler
        )
        manager.register_feature(feature)
        
        result = await manager.execute_feature("test")
        
        assert result["status"] == "success"
        assert "data" in result
    
    @pytest.mark.asyncio
    async def test_execute_feature_with_fallback(self):
        """Test feature execution with fallback."""
        manager = FeatureAvailabilityManager()
        
        async def failed_handler():
            raise Exception("Handler failed")
        
        async def degraded_handler():
            return {"result": "degraded"}
        
        feature = Feature(
            name="test",
            level=FeatureLevel.STANDARD,
            full_handler=failed_handler,
            degraded_handler=degraded_handler
        )
        manager.register_feature(feature)
        
        result = await manager.execute_feature("test")
        
        # Should use degraded handler
        assert result["status"] == "degraded"
    
    @pytest.mark.asyncio
    async def test_mark_success(self):
        """Test marking feature as successful."""
        manager = FeatureAvailabilityManager()
        
        feature = Feature(name="test", level=FeatureLevel.STANDARD)
        manager.register_feature(feature)
        
        feature.consecutive_failures = 3
        await manager._mark_success("test")
        
        assert feature.consecutive_failures == 0
        assert manager._success_counts["test"] == 1
    
    @pytest.mark.asyncio
    async def test_mark_failure(self):
        """Test marking feature as failed."""
        manager = FeatureAvailabilityManager()
        
        feature = Feature(name="test", level=FeatureLevel.STANDARD)
        manager.register_feature(feature)
        
        await manager._mark_failure("test", "Connection error")
        
        assert feature.consecutive_failures == 1
        assert feature.last_error == "Connection error"
        assert manager._failure_counts["test"] == 1
    
    @pytest.mark.asyncio
    async def test_degradation_on_failures(self):
        """Test feature degradation after threshold failures."""
        strategy = DegradationStrategy(failure_threshold=3)
        manager = FeatureAvailabilityManager(strategy)
        
        feature = Feature(name="test", level=FeatureLevel.STANDARD)
        manager.register_feature(feature)
        
        # Mark failures
        for i in range(3):
            await manager._mark_failure("test", f"Error {i}")
        
        # Should be degraded after 3 failures
        assert feature.status == FeatureStatus.DEGRADED
    
    def test_get_system_health(self):
        """Test getting system health."""
        manager = FeatureAvailabilityManager()
        
        # Add core feature
        core = Feature(name="auth", level=FeatureLevel.CORE)
        manager.register_feature(core)
        
        # Add optional feature
        optional = Feature(name="notifications", level=FeatureLevel.OPTIONAL)
        manager.register_feature(optional)
        
        health = manager.get_system_health()
        
        assert health["total_features"] == 2
        assert health["core_features"] == 1
        assert health["system_healthy"] is True
    
    def test_get_system_health_degraded(self):
        """Test system health when core feature fails."""
        manager = FeatureAvailabilityManager()
        
        # Add core feature that's unavailable
        core = Feature(
            name="auth",
            level=FeatureLevel.CORE,
            status=FeatureStatus.UNAVAILABLE
        )
        manager.register_feature(core)
        
        health = manager.get_system_health()
        
        assert health["system_healthy"] is False
        assert health["core_available"] == 0
    
    def test_get_metrics(self):
        """Test getting feature metrics."""
        manager = FeatureAvailabilityManager()
        
        feature = Feature(name="test", level=FeatureLevel.STANDARD)
        manager.register_feature(feature)
        
        # Simulate some requests
        manager._request_counts["test"] = 100
        manager._success_counts["test"] = 95
        
        metrics = manager.get_metrics()
        
        assert "test" in metrics
        assert metrics["test"].total_requests == 100
        assert metrics["test"].successful_requests == 95


class TestFeatureIntegration:
    """Integration tests for feature management."""
    
    @pytest.mark.asyncio
    async def test_feature_dependency_check(self):
        """Test feature dependency checking."""
        manager = FeatureAvailabilityManager()
        
        # Create dependent feature
        dependent = Feature(
            name="payment",
            level=FeatureLevel.ESSENTIAL,
            dependencies=["auth"],
            full_handler=async lambda: {"result": "ok"}
        )
        
        # Create dependency
        dependency = Feature(name="auth", level=FeatureLevel.CORE)
        
        manager.register_feature(dependent)
        manager.register_feature(dependency)
        
        # Dependency is operational - should work
        can_execute = await manager._check_dependencies(dependent)
        assert can_execute is True
        
        # Dependency fails - should not work
        dependency.status = FeatureStatus.UNAVAILABLE
        can_execute = await manager._check_dependencies(dependent)
        assert can_execute is False
    
    @pytest.mark.asyncio
    async def test_full_degradation_flow(self):
        """Test complete degradation flow."""
        strategy = DegradationStrategy(failure_threshold=2)
        manager = FeatureAvailabilityManager(strategy)
        
        failure_count = 0
        
        async def failing_handler():
            nonlocal failure_count
            failure_count += 1
            if failure_count < 3:
                raise Exception("Temporary failure")
            return {"result": "ok"}
        
        async def degraded_handler():
            return {"result": "degraded_ok"}
        
        feature = Feature(
            name="service",
            level=FeatureLevel.STANDARD,
            full_handler=failing_handler,
            degraded_handler=degraded_handler
        )
        manager.register_feature(feature)
        
        # First call - fails, degrades
        result1 = await manager.execute_feature("service")
        assert feature.status == FeatureStatus.DEGRADED
        
        # Second call - uses degraded handler
        result2 = await manager.execute_feature("service")
        assert result2["status"] == "degraded"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
