"""
Health checker with circuit breaker pattern.
Prevents cascading failures when external services are unavailable.
"""

import asyncio
import logging
import time
from enum import Enum
from typing import Dict, Any, Optional, Callable, Coroutine

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"          # Normal operation
    OPEN = "open"              # Failing, reject requests
    HALF_OPEN = "half-open"    # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker pattern implementation for external service health checks.
    Prevents cascading failures through exponential backoff and state tracking.
    """
    
    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        max_timeout: float = 300.0
    ):
        """
        Initialize circuit breaker.
        
        Args:
            service_name: Name of service being monitored
            failure_threshold: Failures before opening circuit (default: 5)
            recovery_timeout: Initial seconds before trying half-open (default: 60)
            max_timeout: Maximum backoff timeout (default: 300)
        """
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.max_timeout = max_timeout
        
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.consecutive_successes = 0
    
    async def call(
        self,
        coroutine: Callable[[], Coroutine],
        *args,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute coroutine with circuit breaker protection.
        
        Returns:
            {
                'success': bool,
                'data': response data or error,
                'state': current circuit state,
                'cached': whether response was cached
            }
        """
        if self.state == CircuitState.OPEN:
            # Check if should transition to HALF_OPEN
            if self._should_attempt_recovery():
                self.state = CircuitState.HALF_OPEN
                logger.info(f"{self.service_name}: Attempting recovery (HALF_OPEN)")
            else:
                return {
                    'success': False,
                    'data': f'Circuit OPEN for {self.service_name}',
                    'state': self.state.value,
                    'cached': True
                }
        
        try:
            # Call the service with timeout
            result = await asyncio.wait_for(
                coroutine(*args, **kwargs),
                timeout=5.0  # 5 second timeout per call
            )
            
            # Success - reset failure count
            self._on_success()
            
            return {
                'success': True,
                'data': result,
                'state': self.state.value,
                'cached': False
            }
        
        except asyncio.TimeoutError:
            return await self._on_failure(
                f"Timeout calling {self.service_name}"
            )
        
        except Exception as e:
            return await self._on_failure(str(e))
    
    def _should_attempt_recovery(self) -> bool:
        """Check if enough time has passed to try recovery"""
        elapsed = time.time() - self.last_failure_time
        timeout = min(
            self.recovery_timeout * (2 ** (self.failure_count - 1)),
            self.max_timeout
        )
        return elapsed >= timeout
    
    async def _on_success(self) -> None:
        """Handle successful call"""
        if self.state == CircuitState.HALF_OPEN:
            self.consecutive_successes += 1
            
            # Close circuit after 2 consecutive successes
            if self.consecutive_successes >= 2:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.consecutive_successes = 0
                logger.info(f"{self.service_name}: Circuit CLOSED (recovered)")
        
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0
            self.consecutive_successes = 0
    
    async def _on_failure(self, error: str) -> Dict[str, Any]:
        """Handle failed call"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        self.consecutive_successes = 0
        
        logger.warning(
            f"{self.service_name}: Failure #{self.failure_count} - {error}"
        )
        
        # Open circuit after threshold
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error(f"{self.service_name}: Circuit OPEN (threshold reached)")
        
        return {
            'success': False,
            'data': error,
            'state': self.state.value,
            'cached': False
        }
    
    def reset(self) -> None:
        """Manually reset circuit breaker"""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.consecutive_successes = 0
        logger.info(f"{self.service_name}: Circuit RESET")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current circuit status"""
        return {
            'service': self.service_name,
            'state': self.state.value,
            'failures': self.failure_count,
            'threshold': self.failure_threshold,
            'recovery_timeout': self.recovery_timeout,
        }


class HealthChecker:
    """
    Health checker for backend services using circuit breaker pattern.
    """
    
    def __init__(self):
        self.breakers: Dict[str, CircuitBreaker] = {}
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.cache_ttl = 30.0  # Cache health checks for 30 seconds
    
    def register_service(
        self,
        service_name: str,
        **breaker_kwargs
    ) -> CircuitBreaker:
        """Register a service with circuit breaker"""
        if service_name not in self.breakers:
            self.breakers[service_name] = CircuitBreaker(service_name, **breaker_kwargs)
        return self.breakers[service_name]
    
    async def check_health(
        self,
        service_name: str,
        check_fn: Callable[[], Coroutine],
        *args,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Check service health with circuit breaker.
        
        Args:
            service_name: Name of service to check
            check_fn: Async function to call for health check
            *args, **kwargs: Arguments to pass to check_fn
        """
        # Ensure breaker exists
        if service_name not in self.breakers:
            self.register_service(service_name)
        
        breaker = self.breakers[service_name]
        
        # Call with circuit breaker
        result = await breaker.call(check_fn, *args, **kwargs)
        
        # Cache result
        self.cache[service_name] = {
            **result,
            'cached_at': time.time()
        }
        
        return result
    
    async def get_cached_health(self, service_name: str) -> Optional[Dict[str, Any]]:
        """Get cached health status (max 30 seconds old)"""
        if service_name in self.cache:
            cached = self.cache[service_name]
            age = time.time() - cached.get('cached_at', 0)
            
            if age < self.cache_ttl:
                return cached
        
        return None
    
    def get_all_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all circuit breakers"""
        return {
            name: breaker.get_status()
            for name, breaker in self.breakers.items()
        }
    
    async def reset_service(self, service_name: str) -> None:
        """Manually reset a service's circuit breaker"""
        if service_name in self.breakers:
            self.breakers[service_name].reset()


# Global instance
_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """Get global health checker instance"""
    global _health_checker
    
    if _health_checker is None:
        _health_checker = HealthChecker()
    
    return _health_checker
