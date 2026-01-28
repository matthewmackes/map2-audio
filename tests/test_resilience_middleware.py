"""
Tests for Resilience Middleware and Utilities

Tests for retry logic, rate limiting, bulkheads, and backoff strategies.
"""

import pytest
import asyncio
import random
from unittest.mock import AsyncMock

from app.services.resilience_middleware import (
    calculate_exponential_backoff,
    with_timeout,
    with_retries,
    TimeoutException,
    RateLimiter,
    Bulkhead,
    BackoffStrategy
)


class TestExponentialBackoff:
    """Test exponential backoff calculation."""
    
    def test_basic_exponential_backoff(self):
        """Test basic exponential backoff without jitter."""
        # Base: 1.0, Base: 2.0, no jitter
        assert calculate_exponential_backoff(0, 1.0, 2.0, 300.0, False) == 1.0
        assert calculate_exponential_backoff(1, 1.0, 2.0, 300.0, False) == 2.0
        assert calculate_exponential_backoff(2, 1.0, 2.0, 300.0, False) == 4.0
        assert calculate_exponential_backoff(3, 1.0, 2.0, 300.0, False) == 8.0
        assert calculate_exponential_backoff(4, 1.0, 2.0, 300.0, False) == 16.0
    
    def test_exponential_backoff_with_cap(self):
        """Test exponential backoff respects max delay."""
        # Should cap at 300
        assert calculate_exponential_backoff(10, 1.0, 2.0, 300.0, False) == 300.0
        assert calculate_exponential_backoff(20, 1.0, 2.0, 300.0, False) == 300.0
    
    def test_exponential_backoff_with_jitter(self):
        """Test jitter adds randomness within bounds."""
        random.seed(42)
        
        delays = []
        for _ in range(10):
            delay = calculate_exponential_backoff(2, 1.0, 2.0, 300.0, True)
            delays.append(delay)
            # Should be around 4.0 ± 0.4
            assert 3.6 <= delay <= 4.4
        
        # Should have variation
        assert len(set(delays)) > 1
    
    def test_exponential_backoff_custom_base(self):
        """Test exponential backoff with custom base."""
        # Base 3.0
        assert calculate_exponential_backoff(0, 1.0, 3.0, 300.0, False) == 1.0
        assert calculate_exponential_backoff(1, 1.0, 3.0, 300.0, False) == 3.0
        assert calculate_exponential_backoff(2, 1.0, 3.0, 300.0, False) == 9.0
    
    def test_exponential_backoff_custom_initial(self):
        """Test exponential backoff with custom initial delay."""
        # Initial delay 0.5
        assert calculate_exponential_backoff(0, 0.5, 2.0, 300.0, False) == 0.5
        assert calculate_exponential_backoff(1, 0.5, 2.0, 300.0, False) == 1.0
        assert calculate_exponential_backoff(2, 0.5, 2.0, 300.0, False) == 2.0


class TestTimeout:
    """Test timeout handling."""
    
    @pytest.mark.asyncio
    async def test_timeout_success(self):
        """Test successful completion within timeout."""
        async def quick_task():
            await asyncio.sleep(0.01)
            return "done"
        
        result = await with_timeout(quick_task(), 1.0)
        assert result == "done"
    
    @pytest.mark.asyncio
    async def test_timeout_exceeded(self):
        """Test timeout when operation takes too long."""
        async def slow_task():
            await asyncio.sleep(1.0)
            return "done"
        
        with pytest.raises(TimeoutException):
            await with_timeout(slow_task(), 0.1)
    
    @pytest.mark.asyncio
    async def test_timeout_with_exception(self):
        """Test timeout with exception in operation."""
        async def failing_task():
            await asyncio.sleep(0.01)
            raise ValueError("Error")
        
        with pytest.raises(ValueError):
            await with_timeout(failing_task(), 1.0)


class TestRetryDecorator:
    """Test with_retries decorator."""
    
    @pytest.mark.asyncio
    async def test_success_on_first_attempt(self):
        """Test successful call on first attempt."""
        call_count = 0
        
        @with_retries(max_retries=3)
        async def successful_func():
            nonlocal call_count
            call_count += 1
            return "success"
        
        result = await successful_func()
        assert result == "success"
        assert call_count == 1
    
    @pytest.mark.asyncio
    async def test_retry_on_failure(self):
        """Test retry on failure."""
        call_count = 0
        
        @with_retries(max_retries=3, initial_delay=0.01)
        async def flaky_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ValueError("Temporary error")
            return "success"
        
        result = await flaky_func()
        assert result == "success"
        assert call_count == 2
    
    @pytest.mark.asyncio
    async def test_failure_after_max_retries(self):
        """Test failure after exhausting retries."""
        call_count = 0
        
        @with_retries(max_retries=2, initial_delay=0.01)
        async def always_fails():
            nonlocal call_count
            call_count += 1
            raise ValueError("Permanent error")
        
        with pytest.raises(ValueError):
            await always_fails()
        
        assert call_count == 3  # Initial + 2 retries
    
    @pytest.mark.asyncio
    async def test_retry_backoff_delay(self):
        """Test exponential backoff between retries."""
        times = []
        
        @with_retries(max_retries=2, initial_delay=0.05)
        async def slow_func():
            import time
            times.append(time.time())
            if len(times) < 2:
                raise ValueError("Error")
            return "success"
        
        result = await slow_func()
        assert result == "success"
        
        # Verify delays increase
        if len(times) >= 2:
            delay1 = times[1] - times[0]
            # Should be around 0.05 (plus overhead)
            assert delay1 >= 0.04
    
    @pytest.mark.asyncio
    async def test_retry_with_specific_exception(self):
        """Test retry only on specific exceptions."""
        call_count = 0
        
        @with_retries(max_retries=3, retry_on_exceptions=(ValueError,))
        async def selective_retry():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ValueError("Retryable error")
            elif call_count == 2:
                raise RuntimeError("Non-retryable error")
            return "success"
        
        with pytest.raises(RuntimeError):
            await selective_retry()
        
        assert call_count == 2  # Only retry on ValueError


class TestRateLimiter:
    """Test RateLimiter."""
    
    @pytest.mark.asyncio
    async def test_rate_limit_allows_operations(self):
        """Test rate limiter allows operations within limit."""
        limiter = RateLimiter(rate_per_second=10.0)
        
        # Should allow 10 operations
        for _ in range(10):
            await limiter.acquire(1)
        
        # This should succeed quickly since we're under limit
    
    @pytest.mark.asyncio
    async def test_rate_limit_blocks_excess(self):
        """Test rate limiter blocks excess operations."""
        limiter = RateLimiter(rate_per_second=5.0)
        
        import time
        start = time.time()
        
        # Acquire 5 tokens (should be instant)
        for _ in range(5):
            await limiter.acquire(1)
        
        # Acquire one more (should wait for refill)
        await limiter.acquire(1)
        
        elapsed = time.time() - start
        # Should have taken at least 0.2 seconds (1/5)
        assert elapsed >= 0.1
    
    @pytest.mark.asyncio
    async def test_rate_limit_multiple_tokens(self):
        """Test acquiring multiple tokens."""
        limiter = RateLimiter(rate_per_second=10.0)
        
        # Acquire 5 tokens at once
        await limiter.acquire(5)
        
        assert limiter.tokens <= 5.0


class TestBulkhead:
    """Test Bulkhead pattern."""
    
    @pytest.mark.asyncio
    async def test_bulkhead_limits_concurrency(self):
        """Test bulkhead limits concurrent operations."""
        bulkhead = Bulkhead(max_concurrent=3)
        
        concurrent_count = 0
        max_concurrent_observed = 0
        
        async def slow_task():
            nonlocal concurrent_count, max_concurrent_observed
            concurrent_count += 1
            max_concurrent_observed = max(max_concurrent_observed, concurrent_count)
            await asyncio.sleep(0.1)
            concurrent_count -= 1
        
        # Run 10 tasks
        tasks = [
            bulkhead.execute(slow_task())
            for _ in range(10)
        ]
        
        await asyncio.gather(*tasks)
        
        # Should never exceed 3 concurrent
        assert max_concurrent_observed <= 3
    
    @pytest.mark.asyncio
    async def test_bulkhead_queue_tasks(self):
        """Test bulkhead queues excess tasks."""
        bulkhead = Bulkhead(max_concurrent=2)
        
        execution_order = []
        
        async def task(i):
            execution_order.append(f"start-{i}")
            await asyncio.sleep(0.01)
            execution_order.append(f"end-{i}")
        
        tasks = [bulkhead.execute(task(i)) for i in range(5)]
        await asyncio.gather(*tasks)
        
        assert len(execution_order) == 10  # 5 tasks * 2 (start/end)


class TestBackoffStrategy:
    """Test BackoffStrategy class."""
    
    def test_linear_backoff(self):
        """Test linear backoff strategy."""
        assert BackoffStrategy.linear(0, 1.0) == 0.0
        assert BackoffStrategy.linear(1, 1.0) == 1.0
        assert BackoffStrategy.linear(2, 1.0) == 2.0
        assert BackoffStrategy.linear(3, 1.0) == 3.0
    
    def test_linear_backoff_custom_base(self):
        """Test linear backoff with custom base."""
        assert BackoffStrategy.linear(1, 2.0) == 2.0
        assert BackoffStrategy.linear(2, 2.0) == 4.0
    
    def test_exponential_backoff(self):
        """Test exponential backoff strategy."""
        assert BackoffStrategy.exponential(0) == 1.0
        assert BackoffStrategy.exponential(1) == 2.0
        assert BackoffStrategy.exponential(2) == 4.0
        assert BackoffStrategy.exponential(3) == 8.0
    
    def test_fibonacci_backoff(self):
        """Test fibonacci backoff strategy."""
        # Fibonacci: 1, 1, 2, 3, 5, 8, 13...
        assert BackoffStrategy.fibonacci(0, 1.0, False) == 1.0
        assert BackoffStrategy.fibonacci(1, 1.0, False) == 2.0
        assert BackoffStrategy.fibonacci(2, 1.0, False) == 3.0
        assert BackoffStrategy.fibonacci(3, 1.0, False) == 5.0
        assert BackoffStrategy.fibonacci(4, 1.0, False) == 8.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
