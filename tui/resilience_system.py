"""
Resilience System
================
Error recovery, circuit breaker, and automatic retry logic.
"""

import logging
import time
import asyncio
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"         # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


class RetryStrategy(Enum):
    """Retry strategies."""
    EXPONENTIAL = "exponential"  # 1s, 2s, 4s, 8s...
    LINEAR = "linear"            # 1s, 2s, 3s, 4s...
    FIXED = "fixed"              # Always same interval
    IMMEDIATE = "immediate"      # No delay


@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration."""
    failure_threshold: int = 5        # Failures before opening
    success_threshold: int = 2        # Successes to close from half-open
    timeout_seconds: float = 60.0     # How long to stay open
    monitor_window: int = 10          # Track last N operations


@dataclass
class RetryConfig:
    """Retry configuration."""
    max_attempts: int = 3
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    base_delay: float = 1.0           # Base delay in seconds
    max_delay: float = 60.0           # Max delay between retries
    backoff_multiplier: float = 2.0


@dataclass
class CircuitBreakerMetrics:
    """Metrics for circuit breaker."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    state_changes: List[tuple] = field(default_factory=list)
    last_failure_time: Optional[float] = None
    last_error_message: str = ""


class CircuitBreaker:
    """Circuit breaker for fault tolerance."""
    
    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        """
        Initialize circuit breaker.
        
        Args:
            name: Name for this breaker
            config: Configuration or defaults
        """
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._metrics = CircuitBreakerMetrics()
        self._operation_history: List[bool] = []
        self._opened_at: Optional[float] = None
    
    def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function through circuit breaker.
        
        Args:
            func: Function to call
            args: Positional arguments
            kwargs: Keyword arguments
            
        Returns:
            Function result or raises exception
        """
        self._metrics.total_calls += 1
        
        if self._state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._state = CircuitState.HALF_OPEN
                logger.info(f"Circuit {self.name} -> HALF_OPEN")
            else:
                self._metrics.rejected_calls += 1
                raise Exception(f"Circuit breaker {self.name} is OPEN")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(str(e))
            raise
    
    def _on_success(self) -> None:
        """Handle successful call."""
        self._metrics.successful_calls += 1
        self._operation_history.append(True)
        self._operation_history = self._operation_history[-self.config.monitor_window:]
        
        if self._state == CircuitState.HALF_OPEN:
            successes = sum(self._operation_history[-self.config.success_threshold:])
            if successes >= self.config.success_threshold:
                self._state = CircuitState.CLOSED
                logger.info(f"Circuit {self.name} -> CLOSED (recovered)")
                self._record_state_change()
    
    def _on_failure(self, error: str) -> None:
        """Handle failed call."""
        self._metrics.failed_calls += 1
        self._metrics.last_failure_time = time.time()
        self._metrics.last_error_message = error
        self._operation_history.append(False)
        self._operation_history = self._operation_history[-self.config.monitor_window:]
        
        # Check if we should open
        failures = self.config.monitor_window - sum(self._operation_history)
        if failures >= self.config.failure_threshold and self._state != CircuitState.OPEN:
            self._state = CircuitState.OPEN
            self._opened_at = time.time()
            logger.warning(f"Circuit {self.name} -> OPEN (threshold exceeded)")
            self._record_state_change()
    
    def _should_attempt_reset(self) -> bool:
        """Check if timeout has passed to attempt reset."""
        if not self._opened_at:
            return True
        
        elapsed = time.time() - self._opened_at
        return elapsed >= self.config.timeout_seconds
    
    def _record_state_change(self) -> None:
        """Record state change for metrics."""
        self._metrics.state_changes.append((datetime.now().isoformat(), self._state.value))
    
    def get_state(self) -> CircuitState:
        """Get current state."""
        return self._state
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get metrics."""
        success_rate = (self._metrics.successful_calls / max(1, self._metrics.total_calls)) * 100
        return {
            "name": self.name,
            "state": self._state.value,
            "total_calls": self._metrics.total_calls,
            "successful": self._metrics.successful_calls,
            "failed": self._metrics.failed_calls,
            "rejected": self._metrics.rejected_calls,
            "success_rate": f"{success_rate:.1f}%",
            "last_error": self._metrics.last_error_message
        }
    
    def reset(self) -> None:
        """Manually reset the breaker."""
        self._state = CircuitState.CLOSED
        self._operation_history.clear()
        self._opened_at = None
        logger.info(f"Circuit {self.name} manually reset")


class RetryExecutor:
    """Handles retry logic with various strategies."""
    
    def __init__(self, name: str, config: Optional[RetryConfig] = None):
        """
        Initialize retry executor.
        
        Args:
            name: Name for this executor
            config: Configuration or defaults
        """
        self.name = name
        self.config = config or RetryConfig()
        self._attempt_count = 0
        self._last_error: Optional[Exception] = None
    
    def execute(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute function with retries.
        
        Args:
            func: Function to call
            args: Positional arguments
            kwargs: Keyword arguments
            
        Returns:
            Function result
        """
        self._attempt_count = 0
        
        for attempt in range(self.config.max_attempts):
            self._attempt_count = attempt + 1
            
            try:
                logger.debug(f"{self.name}: Attempt {self._attempt_count}/{self.config.max_attempts}")
                return func(*args, **kwargs)
            except Exception as e:
                self._last_error = e
                
                if attempt < self.config.max_attempts - 1:
                    delay = self._calculate_delay(attempt)
                    logger.warning(f"{self.name}: Failed, retrying in {delay}s - {str(e)[:50]}")
                    time.sleep(delay)
                else:
                    logger.error(f"{self.name}: All retries exhausted - {e}")
        
        raise self._last_error or Exception("Retry executor failed")
    
    def _calculate_delay(self, attempt: int) -> float:
        """Calculate delay for attempt."""
        if self.config.strategy == RetryStrategy.IMMEDIATE:
            return 0
        elif self.config.strategy == RetryStrategy.FIXED:
            return self.config.base_delay
        elif self.config.strategy == RetryStrategy.LINEAR:
            return self.config.base_delay * (attempt + 1)
        elif self.config.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.config.base_delay * (self.config.backoff_multiplier ** attempt)
            return min(delay, self.config.max_delay)
        
        return self.config.base_delay
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get metrics."""
        return {
            "name": self.name,
            "last_attempt_count": self._attempt_count,
            "last_error": str(self._last_error) if self._last_error else None
        }


class FallbackHandler:
    """Handles fallback responses when primary fails."""
    
    def __init__(self):
        """Initialize fallback handler."""
        self._fallbacks: Dict[str, Callable] = {}
        self._cached_responses: Dict[str, Any] = {}
    
    def register_fallback(self, key: str, fallback_fn: Callable) -> None:
        """Register fallback function."""
        self._fallbacks[key] = fallback_fn
        logger.debug(f"Registered fallback for {key}")
    
    def cache_response(self, key: str, response: Any) -> None:
        """Cache a successful response."""
        self._cached_responses[key] = {
            "response": response,
            "timestamp": datetime.now()
        }
    
    def get_fallback(self, key: str) -> Optional[Any]:
        """Get fallback response (cached or from function)."""
        # Try cached response first
        if key in self._cached_responses:
            cached = self._cached_responses[key]
            age = datetime.now() - cached["timestamp"]
            
            if age < timedelta(minutes=5):
                logger.info(f"Using cached response for {key}")
                return cached["response"]
        
        # Try fallback function
        if key in self._fallbacks:
            try:
                response = self._fallbacks[key]()
                logger.info(f"Using fallback for {key}")
                return response
            except Exception as e:
                logger.error(f"Fallback failed for {key}: {e}")
        
        return None


class ResilienceSystem:
    """Complete resilience management system."""
    
    def __init__(self):
        """Initialize resilience system."""
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        self._retry_executors: Dict[str, RetryExecutor] = {}
        self._fallback_handler = FallbackHandler()
    
    def create_circuit_breaker(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None
    ) -> CircuitBreaker:
        """Create circuit breaker."""
        breaker = CircuitBreaker(name, config)
        self._circuit_breakers[name] = breaker
        return breaker
    
    def create_retry_executor(
        self,
        name: str,
        config: Optional[RetryConfig] = None
    ) -> RetryExecutor:
        """Create retry executor."""
        executor = RetryExecutor(name, config)
        self._retry_executors[name] = executor
        return executor
    
    def get_fallback_handler(self) -> FallbackHandler:
        """Get fallback handler."""
        return self._fallback_handler
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get all metrics."""
        metrics = {
            "circuit_breakers": {
                name: breaker.get_metrics()
                for name, breaker in self._circuit_breakers.items()
            },
            "retry_executors": {
                name: executor.get_metrics()
                for name, executor in self._retry_executors.items()
            }
        }
        return metrics
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get overall health status."""
        all_metrics = self.get_all_metrics()
        
        open_breakers = [
            name for name, breaker in self._circuit_breakers.items()
            if breaker.get_state() == CircuitState.OPEN
        ]
        
        return {
            "healthy": len(open_breakers) == 0,
            "open_circuits": open_breakers,
            "circuit_count": len(self._circuit_breakers),
            "retry_count": len(self._retry_executors),
            "details": all_metrics
        }


# Global instance
resilience_system = ResilienceSystem()
