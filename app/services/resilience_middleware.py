"""
Resilience Middleware and Utilities

Shared utilities for resilience features:
- Retry decorators
- Timeout handling
- Exception handling
- Common patterns
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import Callable, Any, Optional, Coroutine, TypeVar
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar('T')


class ResilienceException(Exception):
    """Base exception for resilience features."""
    pass


class TimeoutException(ResilienceException):
    """Raised when operation times out."""
    pass


def calculate_exponential_backoff(retry_count: int, 
                                 initial_delay: float = 1.0,
                                 exponential_base: float = 2.0,
                                 max_delay: float = 300.0,
                                 jitter: bool = True) -> float:
    """
    Calculate exponential backoff with optional jitter.
    
    Formula: min(initial_delay * (base ^ retry_count), max_delay)
    
    Args:
        retry_count: Current retry attempt (0-based)
        initial_delay: Initial delay in seconds
        exponential_base: Base for exponential calculation
        max_delay: Maximum delay cap in seconds
        jitter: Add random jitter to prevent thundering herd
        
    Returns:
        Delay in seconds before next retry
        
    Example:
        Retry 0: 1.0s
        Retry 1: 2.0s
        Retry 2: 4.0s
        Retry 3: 8.0s
        ...with jitter added if enabled
    """
    # Calculate base delay
    base_delay = initial_delay * (exponential_base ** retry_count)
    delay = min(base_delay, max_delay)
    
    # Add jitter (±10% randomness)
    if jitter:
        jitter_amount = random.uniform(0, delay * 0.1)
        delay += jitter_amount
    
    return delay


async def with_timeout(coro: Coroutine[Any, Any, T], 
                      timeout_seconds: float) -> T:
    """
    Execute a coroutine with timeout.
    
    Args:
        coro: Coroutine to execute
        timeout_seconds: Timeout in seconds
        
    Returns:
        Result from coroutine
        
    Raises:
        TimeoutException: If timeout exceeded
    """
    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        raise TimeoutException(f"Operation timed out after {timeout_seconds}s")


def with_retries(max_retries: int = 3,
                initial_delay: float = 1.0,
                exponential_base: float = 2.0,
                max_delay: float = 300.0,
                jitter: bool = True,
                retry_on_exceptions: Optional[tuple] = None):
    """
    Decorator for async functions with automatic retry logic.
    
    Args:
        max_retries: Maximum retry attempts
        initial_delay: Initial backoff delay
        exponential_base: Base for exponential backoff
        max_delay: Maximum backoff delay
        jitter: Add randomness to backoff
        retry_on_exceptions: Tuple of exceptions to retry on
                            (default: all exceptions)
    
    Example:
        @with_retries(max_retries=3, initial_delay=1.0)
        async def call_api():
            response = await httpx.get("/endpoint")
            return response.json()
    """
    if retry_on_exceptions is None:
        retry_on_exceptions = (Exception,)
    
    def decorator(func: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except retry_on_exceptions as e:
                    last_exception = e
                    
                    if attempt < max_retries:
                        # Calculate backoff
                        delay = calculate_exponential_backoff(
                            attempt,
                            initial_delay=initial_delay,
                            exponential_base=exponential_base,
                            max_delay=max_delay,
                            jitter=jitter
                        )
                        
                        logger.warning(
                            f"Function {func.__name__} failed (attempt {attempt + 1}/{max_retries + 1}), "
                            f"retrying in {delay:.1f}s: {str(e)}"
                        )
                        
                        await asyncio.sleep(delay)
                    else:
                        logger.error(
                            f"Function {func.__name__} failed after {max_retries + 1} attempts: {str(e)}"
                        )
            
            raise last_exception or ResilienceException(f"Failed after {max_retries + 1} attempts")
        
        return wrapper
    
    return decorator


class RateLimiter:
    """
    Simple async rate limiter using token bucket algorithm.
    
    Allows operations at a specified rate.
    """
    
    def __init__(self, rate_per_second: float = 100.0):
        """
        Initialize rate limiter.
        
        Args:
            rate_per_second: Operations allowed per second
        """
        self.rate_per_second = rate_per_second
        self.tokens = rate_per_second
        self.last_update = datetime.now()
        self._lock = asyncio.Lock()
    
    async def acquire(self, tokens: int = 1) -> None:
        """
        Acquire tokens, waiting if necessary.
        
        Args:
            tokens: Number of tokens to acquire
        """
        async with self._lock:
            while self.tokens < tokens:
                # Wait for tokens to refill
                now = datetime.now()
                time_passed = (now - self.last_update).total_seconds()
                
                # Refill tokens
                self.tokens = min(
                    self.rate_per_second,
                    self.tokens + (time_passed * self.rate_per_second)
                )
                self.last_update = now
                
                if self.tokens < tokens:
                    # Not enough tokens, wait a bit
                    await asyncio.sleep(0.01)
            
            self.tokens -= tokens


class Bulkhead:
    """
    Bulkhead pattern - limits concurrent operations.
    
    Prevents one operation type from exhausting all resources.
    """
    
    def __init__(self, max_concurrent: int = 10):
        """
        Initialize bulkhead.
        
        Args:
            max_concurrent: Maximum concurrent operations
        """
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self.current_operations = 0
    
    async def execute(self, coro: Coroutine[Any, Any, T]) -> T:
        """
        Execute operation within bulkhead constraints.
        
        Args:
            coro: Coroutine to execute
            
        Returns:
            Result from coroutine
        """
        async with self._semaphore:
            self.current_operations += 1
            try:
                return await coro
            finally:
                self.current_operations -= 1


class BackoffStrategy:
    """
    Encapsulates backoff strategy calculation.
    """
    
    @staticmethod
    def linear(attempt: int, base_delay: float = 1.0, 
              jitter: bool = False) -> float:
        """Linear backoff: delay * attempt."""
        delay = base_delay * attempt
        if jitter:
            delay += random.uniform(0, delay * 0.1)
        return delay
    
    @staticmethod
    def exponential(attempt: int, base_delay: float = 1.0,
                   exponential_base: float = 2.0, max_delay: float = 300.0,
                   jitter: bool = False) -> float:
        """Exponential backoff."""
        return calculate_exponential_backoff(
            attempt, base_delay, exponential_base, max_delay, jitter
        )
    
    @staticmethod
    def fibonacci(attempt: int, base_delay: float = 1.0,
                 jitter: bool = False) -> float:
        """Fibonacci backoff."""
        # Sequence starts at 1, 2, 3, 5... for retry attempts 0, 1, 2, 3...
        a, b = 1, 2
        for _ in range(attempt):
            a, b = b, a + b
        
        delay = base_delay * a
        if jitter:
            delay += random.uniform(0, delay * 0.1)
        return delay
