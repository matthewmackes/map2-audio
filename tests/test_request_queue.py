"""
Tests for Request Queue Management System

Tests for request queuing, backoff strategy, and zero-loss guarantees.
"""

import pytest
import asyncio
from datetime import datetime, timedelta

from app.services.request_queue import (
    RequestQueue, QueuedRequest, ExponentialBackoffStrategy,
    RequestStatus, RequestPriority, QueueMetrics
)


class TestRequestStatus:
    """Test request status enum."""
    
    def test_status_values(self):
        """Test all status values exist."""
        assert RequestStatus.PENDING.value == "pending"
        assert RequestStatus.IN_PROGRESS.value == "in_progress"
        assert RequestStatus.SUCCESS.value == "success"
        assert RequestStatus.FAILED.value == "failed"
        assert RequestStatus.DEAD_LETTER.value == "dead_letter"


class TestRequestPriority:
    """Test request priority enum."""
    
    def test_priority_ordering(self):
        """Test priority levels."""
        assert RequestPriority.LOW.value == 1
        assert RequestPriority.MEDIUM.value == 2
        assert RequestPriority.HIGH.value == 3
        assert RequestPriority.CRITICAL.value == 4


class TestQueuedRequest:
    """Test queued request dataclass."""
    
    def test_initialization(self):
        """Test request initializes correctly."""
        request = QueuedRequest(
            service_name="test_service",
            method="POST",
            endpoint="/test"
        )
        
        assert request.service_name == "test_service"
        assert request.method == "POST"
        assert request.endpoint == "/test"
        assert request.status == RequestStatus.PENDING
        assert request.attempt_count == 0
    
    def test_to_dict_serialization(self):
        """Test converting request to dict."""
        request = QueuedRequest(
            service_name="test_service",
            payload={"key": "value"}
        )
        
        data = request.to_dict()
        
        assert data["service_name"] == "test_service"
        assert data["payload"] == {"key": "value"}
        assert isinstance(data["created_at"], str)
        assert data["status"] == "pending"
    
    def test_from_dict_deserialization(self):
        """Test creating request from dict."""
        data = {
            "request_id": "test-id",
            "service_name": "test_service",
            "method": "POST",
            "endpoint": "/test",
            "payload": {"key": "value"},
            "headers": {},
            "priority": "HIGH",
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "first_attempt_at": None,
            "last_attempt_at": None,
            "next_retry_at": None,
            "attempt_count": 0,
            "max_attempts": 5,
            "last_error": None,
            "response_data": None
        }
        
        request = QueuedRequest.from_dict(data)
        
        assert request.request_id == "test-id"
        assert request.service_name == "test_service"
        assert request.priority == RequestPriority.HIGH


class TestExponentialBackoffStrategy:
    """Test exponential backoff strategy."""
    
    def test_initialization(self):
        """Test strategy initializes correctly."""
        strategy = ExponentialBackoffStrategy(
            initial_delay_seconds=1.0,
            max_delay_seconds=3600.0,
            multiplier=2.0
        )
        
        assert strategy.initial_delay_seconds == 1.0
        assert strategy.max_delay_seconds == 3600.0
        assert strategy.multiplier == 2.0
    
    def test_delay_calculation(self):
        """Test delay calculation with exponential backoff."""
        strategy = ExponentialBackoffStrategy(
            initial_delay_seconds=1.0,
            multiplier=2.0,
            jitter_factor=0.0  # No jitter for predictable testing
        )
        
        delay0 = strategy.calculate_delay(0)
        delay1 = strategy.calculate_delay(1)
        delay2 = strategy.calculate_delay(2)
        
        # Should be exponential: 1, 2, 4
        assert delay0 == pytest.approx(1.0, abs=0.1)
        assert delay1 == pytest.approx(2.0, abs=0.1)
        assert delay2 == pytest.approx(4.0, abs=0.1)
    
    def test_max_delay_cap(self):
        """Test that delay is capped at max."""
        strategy = ExponentialBackoffStrategy(
            initial_delay_seconds=1.0,
            max_delay_seconds=10.0,
            multiplier=3.0,
            jitter_factor=0.0
        )
        
        # With exponential growth, should eventually hit max
        delay = strategy.calculate_delay(10)
        
        assert delay <= 10.0
    
    def test_next_retry_time(self):
        """Test next retry time calculation."""
        strategy = ExponentialBackoffStrategy(
            initial_delay_seconds=1.0,
            jitter_factor=0.0
        )
        
        now = datetime.now()
        retry_time = strategy.calculate_next_retry_time(0)
        
        # Should be approximately 1 second from now
        diff = (retry_time - now).total_seconds()
        assert 0.9 < diff < 1.1


class TestQueueMetrics:
    """Test queue metrics."""
    
    def test_success_rate_calculation(self):
        """Test success rate calculation."""
        metrics = QueueMetrics(
            total_queued=100,
            successful=80,
            failed=15,
            dead_letter=5
        )
        
        assert metrics.success_rate == 80.0
    
    def test_failure_rate_calculation(self):
        """Test failure rate calculation."""
        metrics = QueueMetrics(
            total_queued=100,
            successful=80,
            failed=15,
            dead_letter=5
        )
        
        assert metrics.failure_rate == 20.0
    
    def test_metrics_with_no_requests(self):
        """Test metrics with no requests."""
        metrics = QueueMetrics()
        
        assert metrics.success_rate == 0.0
        assert metrics.failure_rate == 0.0


class TestRequestQueue:
    """Test request queue functionality."""
    
    @pytest.mark.asyncio
    async def test_queue_initialization(self):
        """Test queue initializes correctly."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        assert queue.max_queue_size == 10000
        assert len(queue.completed) == 0
        assert len(queue.dead_letter) == 0
    
    @pytest.mark.asyncio
    async def test_enqueue_request(self):
        """Test enqueueing a request."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            method="POST",
            endpoint="/test"
        )
        
        request_id = await queue.enqueue(request)
        
        assert request_id == request.request_id
        assert queue.pending_queue.qsize() == 1
    
    @pytest.mark.asyncio
    async def test_dequeue_request(self):
        """Test dequeueing a request."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            method="POST",
            endpoint="/test"
        )
        
        await queue.enqueue(request)
        dequeued = await queue.dequeue()
        
        assert dequeued is not None
        assert dequeued.request_id == request.request_id
        assert dequeued.status == RequestStatus.IN_PROGRESS
    
    @pytest.mark.asyncio
    async def test_mark_success(self):
        """Test marking request as successful."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            method="POST",
            endpoint="/test"
        )
        
        await queue.enqueue(request)
        dequeued = await queue.dequeue()
        
        await queue.mark_success(dequeued.request_id, {"result": "ok"})
        
        completed = queue.completed[dequeued.request_id]
        assert completed.status == RequestStatus.SUCCESS
        assert completed.response_data == {"result": "ok"}
    
    @pytest.mark.asyncio
    async def test_mark_failure_retry(self):
        """Test marking request as failed triggers retry."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            max_attempts=3
        )
        
        await queue.enqueue(request)
        dequeued = await queue.dequeue()
        
        await queue.mark_failure(dequeued.request_id, "Connection timeout")
        
        # Should be requeued
        assert queue.pending_queue.qsize() > 0
    
    @pytest.mark.asyncio
    async def test_mark_failure_dead_letter(self):
        """Test request goes to dead letter after max attempts."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            max_attempts=2
        )
        
        request_id = await queue.enqueue(request)
        
        # First failure
        dequeued = await queue.dequeue()
        await queue.mark_failure(dequeued.request_id, "Error 1")
        assert queue.pending_queue.qsize() > 0
        
        # Second failure - should go to dead letter
        dequeued = await queue.dequeue()
        await queue.mark_failure(dequeued.request_id, "Error 2")
        
        # Check it's in dead letter
        assert len(queue.dead_letter) == 1
        assert queue.dead_letter[0].status == RequestStatus.DEAD_LETTER
    
    @pytest.mark.asyncio
    async def test_get_request_status(self):
        """Test getting request status."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            method="POST",
            endpoint="/test"
        )
        
        request_id = await queue.enqueue(request)
        
        status = queue.get_request_status(request_id)
        
        assert status is not None
        assert status.request_id == request_id
        assert status.status == RequestStatus.PENDING
    
    @pytest.mark.asyncio
    async def test_get_metrics(self):
        """Test getting queue metrics."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        # Enqueue several requests
        for i in range(5):
            request = QueuedRequest(service_name="test")
            await queue.enqueue(request)
        
        metrics = queue.get_metrics()
        
        assert metrics.pending == 5
        assert metrics.total_queued == 5
    
    @pytest.mark.asyncio
    async def test_priority_ordering(self):
        """Test requests are processed by priority."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        # Enqueue with different priorities
        low = QueuedRequest(service_name="test", priority=RequestPriority.LOW)
        high = QueuedRequest(service_name="test", priority=RequestPriority.HIGH)
        critical = QueuedRequest(service_name="test", priority=RequestPriority.CRITICAL)
        
        await queue.enqueue(low)
        await queue.enqueue(high)
        await queue.enqueue(critical)
        
        # Dequeue in order - should get critical first
        first = await queue.dequeue()
        assert first.priority == RequestPriority.CRITICAL
        
        second = await queue.dequeue()
        assert second.priority == RequestPriority.HIGH
        
        third = await queue.dequeue()
        assert third.priority == RequestPriority.LOW
    
    @pytest.mark.asyncio
    async def test_shutdown(self):
        """Test queue shutdown."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(service_name="test")
        await queue.enqueue(request)
        
        # Should not raise
        await queue.shutdown()


class TestQueueIntegration:
    """Integration tests for request queue."""
    
    @pytest.mark.asyncio
    async def test_full_request_lifecycle(self):
        """Test complete request lifecycle from enqueue to completion."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        # Create and enqueue
        request = QueuedRequest(
            service_name="test_service",
            method="POST",
            endpoint="/users",
            payload={"name": "John"}
        )
        
        request_id = await queue.enqueue(request)
        
        # Dequeue
        dequeued = await queue.dequeue()
        assert dequeued.request_id == request_id
        
        # Mark success
        await queue.mark_success(request_id, {"user_id": "123"})
        
        # Check status
        completed = queue.get_request_status(request_id)
        assert completed.status == RequestStatus.SUCCESS
        assert completed.response_data == {"user_id": "123"}
    
    @pytest.mark.asyncio
    async def test_retry_lifecycle(self):
        """Test request retry lifecycle."""
        queue = RequestQueue(queue_dir="./test_queue")
        
        request = QueuedRequest(
            service_name="test",
            max_attempts=3
        )
        
        original_id = await queue.enqueue(request)
        
        # Attempt 1: Fail
        req1 = await queue.dequeue()
        await queue.mark_failure(req1.request_id, "Network error")
        
        # Should be queued again
        assert queue.pending_queue.qsize() > 0
        
        # Attempt 2: Fail
        req2 = await queue.dequeue()
        assert req2.attempt_count == 2
        await queue.mark_failure(req2.request_id, "Still failing")
        
        # Still queued
        assert queue.pending_queue.qsize() > 0
        
        # Attempt 3: Fail - goes to dead letter
        req3 = await queue.dequeue()
        assert req3.attempt_count == 3
        await queue.mark_failure(req3.request_id, "Permanent failure")
        
        # Should be in dead letter
        assert len(queue.dead_letter) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
