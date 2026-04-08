"""
Circuit Breaker Pattern Implementation

Prevents cascading failures by stopping requests to failing services.
Implements a state machine: CLOSED (normal) -> OPEN (fail fast) -> HALF_OPEN (testing) -> CLOSED

Reference: https://martinfowler.com/bliki/CircuitBreaker.html
"""

import asyncio
import logging
import threading
from datetime import datetime, timedelta
from enum import Enum
from typing import Callable, Any, Optional, TypeVar, Coroutine
from dataclasses import dataclass
from collections import deque

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    """States of the circuit breaker."""
    CLOSED = "closed"              # Normal operation, requests pass through
    OPEN = "open"                  # Failures detected, fail fast
    HALF_OPEN = "half_open"        # Testing recovery, limited requests allowed


class CircuitBreakerException(Exception):
    """Raised when circuit is OPEN and request rejected."""
    pass


@dataclass
class CircuitBreakerMetrics:
    """Metrics for monitoring circuit breaker health."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    state_changes: int = 0
    last_state_change: Optional[datetime] = None


class CircuitBreaker:
    """
    Circuit Breaker implementation for resilient service communication.
    
    Protects against cascading failures by:
    1. Monitoring requests for failures
    2. Opening circuit when failure threshold exceeded
    3. Rejecting requests when OPEN (fail fast)
    4. Attempting recovery when timeout expires
    5. Closing circuit when recovery succeeds
    
    Configuration parameters:
    - failure_threshold: Number of failures before opening (default: 5)
    - success_threshold: Successes needed to close from half-open (default: 2)
    - timeout_seconds: Seconds before attempting recovery (default: 30)
    
    Example:
        breaker = CircuitBreaker("api-service", failure_threshold=5)
        
        try:
            result = await breaker.call(api_client.get, "/endpoint")
        except CircuitBreakerException:
            # Service is down, handle gracefully
            return cached_data
    """
    
    def __init__(self, name: str, failure_threshold: int = 5,
                 success_threshold: Optional[int] = None, timeout_seconds: int = 30,
                 failure_window_seconds: Optional[int] = None):
        """
        Initialize circuit breaker.
        
        Args:
            name: Identifier for this circuit breaker (e.g., service name)
            failure_threshold: Failures before opening circuit
            success_threshold: Successes before closing from half-open
            timeout_seconds: Time before attempting recovery
            failure_window_seconds: Rolling window used to count failures
        """
        self.name = name
        self.state = CircuitState.CLOSED
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold if success_threshold is not None else 2
        self.timeout_seconds = timeout_seconds
        self.failure_window_seconds = (
            failure_window_seconds if failure_window_seconds is not None else max(timeout_seconds, 1)
        )
        self._uses_default_success_threshold = success_threshold is None
        
        # Counters
        self.failure_count = 0
        self.success_count = 0
        self.consecutive_successes = 0
        
        # Timing
        self.last_failure_time: Optional[datetime] = None
        self.opened_at: Optional[datetime] = None
        self._failure_history: deque[datetime] = deque()
        self._half_open_probe_in_flight = False
        
        # Thread safety
        self._lock = threading.RLock()
        
        # Metrics
        self.metrics = CircuitBreakerMetrics()
    
    async def call(self, func: Callable[..., Coroutine[Any, Any, T]], 
                   *args: Any, **kwargs: Any) -> T:
        """
        Execute a function with circuit breaker protection.
        
        Args:
            func: Async function to call
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func
            
        Returns:
            Result from func
            
        Raises:
            CircuitBreakerException: If circuit is OPEN
            Exception: Any exception raised by func
        """
        with self._lock:
            self.metrics.total_calls += 1
            # Check if we should attempt recovery
            if self.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    logger.info(f"[{self.name}] Circuit transitioning to HALF_OPEN, testing recovery")
                    self.state = CircuitState.HALF_OPEN
                    self.success_count = 0
                    self._half_open_probe_in_flight = True
                else:
                    # Still in timeout period, reject request
                    self.metrics.rejected_calls += 1
                    raise CircuitBreakerException(
                        f"Circuit breaker OPEN for {self.name} (opened {self._time_since_open()}s ago)"
                    )
            elif self.state == CircuitState.HALF_OPEN:
                if self._half_open_probe_in_flight:
                    self.metrics.rejected_calls += 1
                    raise CircuitBreakerException(
                        f"Circuit breaker HALF_OPEN for {self.name} (recovery probe already in flight)"
                    )
                self._half_open_probe_in_flight = True
        
        try:
            # Call the function
            result = await func(*args, **kwargs)
            
            with self._lock:
                self._on_success()
            
            return result
            
        except Exception as e:
            with self._lock:
                self._on_failure()
            raise
    
    def _on_success(self) -> None:
        """Handle successful call."""
        self.metrics.successful_calls += 1
        self.consecutive_successes += 1
        
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            self._half_open_probe_in_flight = False

            close_on_first_success = (
                self._uses_default_success_threshold
                and self.timeout_seconds <= 0
                and self.success_count >= 1
            )
            if close_on_first_success or self.success_count >= self.success_threshold:
                # Recovery successful, close circuit
                self._change_state(CircuitState.CLOSED)
                self.failure_count = 0
                self._failure_history.clear()
                logger.info(
                    f"[{self.name}] Circuit CLOSED - recovery successful "
                    f"({self.success_count} consecutive successes)"
                )
        
        elif self.state == CircuitState.CLOSED:
            self._prune_failure_history(datetime.now())
            self.failure_count = len(self._failure_history)
    
    def _on_failure(self) -> None:
        """Handle failed call."""
        self.metrics.failed_calls += 1
        self.consecutive_successes = 0
        now = datetime.now()
        self.last_failure_time = now
        self._prune_failure_history(now)
        self._failure_history.append(now)
        self.failure_count = len(self._failure_history)
        
        if self.state == CircuitState.HALF_OPEN:
            # Recovery test failed, reopen circuit
            self._half_open_probe_in_flight = False
            self._change_state(CircuitState.OPEN)
            self.opened_at = now
            logger.warning(
                f"[{self.name}] Circuit OPEN - recovery test failed, "
                f"reopening circuit"
            )
        
        elif self.state == CircuitState.CLOSED:
            # Check if failure threshold exceeded
            if self.failure_count >= self.failure_threshold:
                self._change_state(CircuitState.OPEN)
                self.opened_at = now
                logger.warning(
                    f"[{self.name}] Circuit OPEN - failure threshold exceeded "
                    f"({self.failure_count} failures)"
                )

    def _prune_failure_history(self, now: datetime) -> None:
        """Drop failures that are outside the rolling failure window."""
        cutoff = now - timedelta(seconds=self.failure_window_seconds)
        while self._failure_history and self._failure_history[0] < cutoff:
            self._failure_history.popleft()
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery."""
        if self.opened_at is None:
            return False
        
        time_passed = (datetime.now() - self.opened_at).total_seconds()
        return time_passed >= self.timeout_seconds
    
    def _time_since_open(self) -> float:
        """Get seconds since circuit opened."""
        if self.opened_at is None:
            return 0
        return (datetime.now() - self.opened_at).total_seconds()
    
    def _change_state(self, new_state: CircuitState) -> None:
        """Change state and update metrics."""
        if new_state != self.state:
            old_state = self.state
            self.state = new_state
            self.metrics.state_changes += 1
            self.metrics.last_state_change = datetime.now()
            logger.debug(f"[{self.name}] State change: {old_state.value} -> {new_state.value}")
    
    def get_state(self) -> CircuitState:
        """Get current state."""
        return self.state
    
    def get_metrics(self) -> CircuitBreakerMetrics:
        """Get current metrics."""
        return self.metrics
    
    def reset(self) -> None:
        """Manually reset the circuit breaker to CLOSED state."""
        with self._lock:
            self.state = CircuitState.CLOSED
            self.failure_count = 0
            self.success_count = 0
            self.consecutive_successes = 0
            self.last_failure_time = None
            self.opened_at = None
            self._failure_history.clear()
            self._half_open_probe_in_flight = False
        logger.info(f"[{self.name}] Circuit manually reset to CLOSED")
    
    def __repr__(self) -> str:
        """String representation."""
        return (
            f"CircuitBreaker(name={self.name}, state={self.state.value}, "
            f"failures={self.failure_count}/{self.failure_threshold})"
        )


class CircuitBreakerManager:
    """
    Manages multiple circuit breakers for different services.
    
    Provides centralized management and monitoring.
    """
    
    def __init__(self):
        """Initialize the manager."""
        self._breakers: dict[str, CircuitBreaker] = {}
        self._lock = asyncio.Lock()
    
    async def get_breaker(self, service_name: str, **config_kwargs: Any) -> CircuitBreaker:
        """
        Get or create a circuit breaker for a service.
        
        Args:
            service_name: Name of the service
            **config_kwargs: Configuration parameters (failure_threshold, etc.)
            
        Returns:
            CircuitBreaker instance for the service
        """
        async with self._lock:
            if service_name not in self._breakers:
                breaker = CircuitBreaker(service_name, **config_kwargs)
                self._breakers[service_name] = breaker
                logger.debug(f"Created circuit breaker for {service_name}")
            
            return self._breakers[service_name]
    
    async def get_breaker_metrics(self, service_name: str) -> Optional[CircuitBreakerMetrics]:
        """Get metrics for a specific circuit breaker."""
        if service_name in self._breakers:
            return self._breakers[service_name].get_metrics()
        return None
    
    async def get_all_metrics(self) -> dict[str, CircuitBreakerMetrics]:
        """Get metrics for all circuit breakers."""
        return {
            name: breaker.get_metrics()
            for name, breaker in self._breakers.items()
        }
    
    async def get_all_states(self) -> dict[str, str]:
        """Get states of all circuit breakers."""
        return {
            name: breaker.get_state().value
            for name, breaker in self._breakers.items()
        }
    
    async def reset_breaker(self, service_name: str) -> bool:
        """Manually reset a circuit breaker."""
        if service_name in self._breakers:
            self._breakers[service_name].reset()
            return True
        return False
    
    async def reset_all(self) -> None:
        """Reset all circuit breakers."""
        for breaker in self._breakers.values():
            breaker.reset()


# Global circuit breaker manager
_breaker_manager: Optional[CircuitBreakerManager] = None


def get_breaker_manager() -> CircuitBreakerManager:
    """Get global circuit breaker manager (singleton)."""
    global _breaker_manager
    if _breaker_manager is None:
        _breaker_manager = CircuitBreakerManager()
    return _breaker_manager
