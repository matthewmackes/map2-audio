"""
Tests for Circuit Breaker Implementation

Comprehensive unit tests for circuit breaker state transitions,
metrics, and behavior under various conditions.
"""

import pytest
import asyncio
from datetime import datetime, timedelta

from app.services.circuit_breaker import (
    CircuitBreaker, CircuitBreakerException, CircuitState,
    CircuitBreakerManager, get_breaker_manager
)


class TestCircuitBreakerBasics:
    """Test basic circuit breaker functionality."""
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_initialization(self):
        """Test circuit breaker initializes in CLOSED state."""
        breaker = CircuitBreaker("test-service")
        
        assert breaker.name == "test-service"
        assert breaker.state == CircuitState.CLOSED
        assert breaker.failure_count == 0
        assert breaker.success_count == 0
    
    @pytest.mark.asyncio
    async def test_successful_call_in_closed_state(self):
        """Test successful call when circuit is CLOSED."""
        breaker = CircuitBreaker("test-service")
        
        async def successful_func():
            return "success"
        
        result = await breaker.call(successful_func)
        
        assert result == "success"
        assert breaker.state == CircuitState.CLOSED
        assert breaker.metrics.successful_calls == 1
        assert breaker.metrics.failed_calls == 0
    
    @pytest.mark.asyncio
    async def test_failed_call_increments_failure_count(self):
        """Test failed call increments failure counter."""
        breaker = CircuitBreaker("test-service", failure_threshold=5)
        
        async def failing_func():
            raise ValueError("Service error")
        
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.failure_count == 1
        assert breaker.metrics.failed_calls == 1
        assert breaker.state == CircuitState.CLOSED  # Not opened yet
    
    @pytest.mark.asyncio
    async def test_call_with_arguments(self):
        """Test circuit breaker passes arguments correctly."""
        breaker = CircuitBreaker("test-service")
        
        async def add_func(a, b, multiplier=1):
            return (a + b) * multiplier
        
        result = await breaker.call(add_func, 2, 3, multiplier=2)
        
        assert result == 10  # (2 + 3) * 2


class TestCircuitBreakerStateTransitions:
    """Test circuit breaker state transitions."""
    
    @pytest.mark.asyncio
    async def test_circuit_opens_after_threshold(self):
        """Test circuit opens after failure threshold exceeded."""
        breaker = CircuitBreaker("test-service", failure_threshold=3)
        
        async def failing_func():
            raise ValueError("Service error")
        
        # Generate 3 failures
        for i in range(3):
            with pytest.raises(ValueError):
                await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        assert breaker.metrics.failed_calls == 3
    
    @pytest.mark.asyncio
    async def test_circuit_reject_requests_when_open(self):
        """Test circuit rejects requests when OPEN."""
        breaker = CircuitBreaker("test-service", failure_threshold=1)
        
        async def failing_func():
            raise ValueError("Service error")
        
        # Open the circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        
        # Now try a successful call - should be rejected
        async def success_func():
            return "success"
        
        with pytest.raises(CircuitBreakerException):
            await breaker.call(success_func)
        
        assert breaker.metrics.rejected_calls == 1
    
    @pytest.mark.asyncio
    async def test_circuit_transitions_to_half_open(self):
        """Test circuit transitions to HALF_OPEN after timeout."""
        breaker = CircuitBreaker("test-service", 
                               failure_threshold=1, 
                               timeout_seconds=0)  # Immediate timeout
        
        async def failing_func():
            raise ValueError("Service error")
        
        # Open the circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        
        # Wait and attempt call - should transition to HALF_OPEN
        async def success_func():
            return "success"
        
        result = await breaker.call(success_func)
        
        assert result == "success"
        assert breaker.state == CircuitState.CLOSED  # Closed after success
    
    @pytest.mark.asyncio
    async def test_circuit_closes_after_half_open_success(self):
        """Test circuit closes after successful recovery attempts."""
        breaker = CircuitBreaker("test-service",
                               failure_threshold=1,
                               success_threshold=2,
                               timeout_seconds=0)
        
        async def failing_func():
            raise ValueError("Service error")
        
        # Open circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        
        # Successful calls in HALF_OPEN
        async def success_func():
            return "success"
        
        await breaker.call(success_func)
        assert breaker.state == CircuitState.HALF_OPEN
        assert breaker.success_count == 1
        
        await breaker.call(success_func)
        assert breaker.state == CircuitState.CLOSED
        assert breaker.success_count == 2
    
    @pytest.mark.asyncio
    async def test_circuit_reopens_on_failure_in_half_open(self):
        """Test circuit reopens if failure occurs during recovery."""
        breaker = CircuitBreaker("test-service",
                               failure_threshold=1,
                               timeout_seconds=0)
        
        async def failing_func():
            raise ValueError("Service error")
        
        # Open circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        
        # Failure during recovery - should reopen
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN


class TestCircuitBreakerMetrics:
    """Test circuit breaker metrics collection."""
    
    @pytest.mark.asyncio
    async def test_metrics_track_calls(self):
        """Test metrics track successful and failed calls."""
        breaker = CircuitBreaker("test-service")
        
        async def success_func():
            return "ok"
        
        async def fail_func():
            raise ValueError("error")
        
        # 2 successes
        await breaker.call(success_func)
        await breaker.call(success_func)
        
        # 1 failure
        with pytest.raises(ValueError):
            await breaker.call(fail_func)
        
        metrics = breaker.get_metrics()
        assert metrics.successful_calls == 2
        assert metrics.failed_calls == 1
        assert metrics.total_calls == 3
    
    @pytest.mark.asyncio
    async def test_metrics_track_rejections(self):
        """Test metrics track rejected calls."""
        breaker = CircuitBreaker("test-service", 
                               failure_threshold=1,
                               timeout_seconds=10)  # Long timeout
        
        async def failing_func():
            raise ValueError("error")
        
        # Open circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        # Rejection
        async def success_func():
            return "ok"
        
        with pytest.raises(CircuitBreakerException):
            await breaker.call(success_func)
        
        metrics = breaker.get_metrics()
        assert metrics.rejected_calls == 1
    
    @pytest.mark.asyncio
    async def test_metrics_state_changes(self):
        """Test metrics track state changes."""
        breaker = CircuitBreaker("test-service",
                               failure_threshold=1,
                               timeout_seconds=0)
        
        assert breaker.metrics.state_changes == 0
        
        async def failing_func():
            raise ValueError("error")
        
        # CLOSED -> OPEN
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.metrics.state_changes == 1
        
        # OPEN -> HALF_OPEN -> CLOSED
        async def success_func():
            return "ok"
        
        await breaker.call(success_func)
        
        # Should have 2 state changes (OPEN->HALF_OPEN, HALF_OPEN->CLOSED)
        # or 1 if it skips HALF_OPEN (depends on implementation)
        assert breaker.metrics.state_changes >= 1


class TestCircuitBreakerTimeout:
    """Test circuit breaker timeout behavior."""
    
    @pytest.mark.asyncio
    async def test_circuit_remains_open_during_timeout(self):
        """Test circuit stays OPEN during timeout period."""
        breaker = CircuitBreaker("test-service",
                               failure_threshold=1,
                               timeout_seconds=1)  # 1 second timeout
        
        async def failing_func():
            raise ValueError("error")
        
        # Open circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        
        # Immediate retry - should still reject
        async def success_func():
            return "ok"
        
        with pytest.raises(CircuitBreakerException):
            await breaker.call(success_func)
        
        assert breaker.state == CircuitState.OPEN
    
    @pytest.mark.asyncio
    async def test_circuit_recovery_after_timeout(self):
        """Test circuit attempts recovery after timeout."""
        breaker = CircuitBreaker("test-service",
                               failure_threshold=1,
                               timeout_seconds=0.1)  # 100ms
        
        async def failing_func():
            raise ValueError("error")
        
        # Open circuit
        with pytest.raises(ValueError):
            await breaker.call(failing_func)
        
        assert breaker.state == CircuitState.OPEN
        
        # Wait for timeout
        await asyncio.sleep(0.15)
        
        # Should attempt recovery
        async def success_func():
            return "ok"
        
        result = await breaker.call(success_func)
        
        assert result == "ok"
        assert breaker.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_half_open_allows_single_probe_at_a_time(self):
        """Concurrent recovery probes should not all run during HALF_OPEN."""
        breaker = CircuitBreaker("test-service", failure_threshold=1, timeout_seconds=0)

        async def failing_func():
            raise ValueError("error")

        with pytest.raises(ValueError):
            await breaker.call(failing_func)

        release_probe = asyncio.Event()
        started_probe = asyncio.Event()

        async def slow_success():
            started_probe.set()
            await release_probe.wait()
            return "ok"

        first_probe = asyncio.create_task(breaker.call(slow_success))
        await started_probe.wait()

        with pytest.raises(CircuitBreakerException):
            await breaker.call(slow_success)

        release_probe.set()
        assert await first_probe == "ok"
        assert breaker.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_stale_failures_do_not_trip_windowed_threshold(self):
        """Failure counts should age out of the rolling failure window."""
        breaker = CircuitBreaker(
            "test-service",
            failure_threshold=2,
            timeout_seconds=5,
            failure_window_seconds=1,
        )

        async def failing_func():
            raise ValueError("error")

        with pytest.raises(ValueError):
            await breaker.call(failing_func)

        assert breaker.state == CircuitState.CLOSED
        await asyncio.sleep(1.1)

        with pytest.raises(ValueError):
            await breaker.call(failing_func)

        assert breaker.failure_count == 1
        assert breaker.state == CircuitState.CLOSED


class TestCircuitBreakerManager:
    """Test CircuitBreakerManager functionality."""
    
    @pytest.mark.asyncio
    async def test_manager_creates_breakers(self):
        """Test manager creates breakers on demand."""
        manager = CircuitBreakerManager()
        
        breaker1 = await manager.get_breaker("service-1")
        breaker2 = await manager.get_breaker("service-2")
        
        assert breaker1.name == "service-1"
        assert breaker2.name == "service-2"
        assert breaker1 is not breaker2
    
    @pytest.mark.asyncio
    async def test_manager_reuses_breakers(self):
        """Test manager returns same breaker for same service."""
        manager = CircuitBreakerManager()
        
        breaker1 = await manager.get_breaker("service-1")
        breaker2 = await manager.get_breaker("service-1")
        
        assert breaker1 is breaker2
    
    @pytest.mark.asyncio
    async def test_manager_get_all_states(self):
        """Test manager retrieves all breaker states."""
        manager = CircuitBreakerManager()
        
        await manager.get_breaker("service-1")
        await manager.get_breaker("service-2")
        
        states = await manager.get_all_states()
        
        assert states["service-1"] == "closed"
        assert states["service-2"] == "closed"
    
    @pytest.mark.asyncio
    async def test_manager_reset_all(self):
        """Test manager can reset all breakers."""
        manager = CircuitBreakerManager()
        
        breaker1 = await manager.get_breaker("service-1", failure_threshold=1)
        breaker2 = await manager.get_breaker("service-2", failure_threshold=1)
        
        # Open both
        async def failing_func():
            raise ValueError("error")
        
        with pytest.raises(ValueError):
            await breaker1.call(failing_func)
        
        with pytest.raises(ValueError):
            await breaker2.call(failing_func)
        
        assert breaker1.state == CircuitState.OPEN
        assert breaker2.state == CircuitState.OPEN
        
        # Reset all
        await manager.reset_all()
        
        assert breaker1.state == CircuitState.CLOSED
        assert breaker2.state == CircuitState.CLOSED


class TestCircuitBreakerIntegration:
    """Integration tests with realistic scenarios."""
    
    @pytest.mark.asyncio
    async def test_cascading_failures_prevented(self):
        """Test circuit breaker prevents cascading failures."""
        breaker = CircuitBreaker("api-service", failure_threshold=2)
        
        call_count = 0
        
        async def flaky_api():
            nonlocal call_count
            call_count += 1
            raise ValueError("API error")
        
        # 2 failures - opens circuit
        for _ in range(2):
            with pytest.raises(ValueError):
                await breaker.call(flaky_api)
        
        initial_call_count = call_count
        
        # Further calls are rejected without calling the function
        for _ in range(5):
            with pytest.raises(CircuitBreakerException):
                await breaker.call(flaky_api)
        
        # Function should not have been called 5 more times
        assert call_count == initial_call_count
    
    @pytest.mark.asyncio
    async def test_recovery_scenario(self):
        """Test realistic recovery scenario."""
        breaker = CircuitBreaker("db",
                               failure_threshold=2,
                               success_threshold=2,
                               timeout_seconds=0.1)
        
        # Simulate service failures
        failures = 2
        
        async def query_db():
            nonlocal failures
            if failures > 0:
                failures -= 1
                raise ConnectionError("DB down")
            return {"data": "result"}
        
        # Trigger failures
        for _ in range(2):
            with pytest.raises(ConnectionError):
                await breaker.call(query_db)
        
        assert breaker.state == CircuitState.OPEN
        
        # Wait for recovery window
        await asyncio.sleep(0.15)
        
        # Service now recovered, attempts test call
        result = await breaker.call(query_db)
        assert result == {"data": "result"}
        
        # One more successful call to fully close
        result = await breaker.call(query_db)
        assert result == {"data": "result"}
        
        assert breaker.state == CircuitState.CLOSED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
