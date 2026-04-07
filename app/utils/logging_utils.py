"""
Structured Logging Utilities

Provides consistent, structured logging across the application.
Eliminates duplicate logger initialization and formatting.

Usage:
    from app.utils.logging_utils import get_logger

    logger = get_logger(__name__)
    
    logger.service_started("AudioEngine", sample_rate=48000)
    logger.service_stopped("AudioEngine")
    logger.error("Processing failed", exc=exception, chain_id=123)
"""

from __future__ import annotations

import inspect
from functools import wraps
import logging
from typing import Any, Optional


class StructuredLogger:
    """
    Enhanced logger with structured logging and consistent formatting.
    
    Provides common logging patterns and support for structured log data.
    """
    
    def __init__(self, name: str):
        """
        Initialize structured logger.
        
        Args:
            name: Logger name (typically __name__ of calling module)
        """
        self.logger = logging.getLogger(name)
        self.name = name

    @staticmethod
    def _build_log_kwargs(kwargs: dict[str, Any], *, default_exc_info: Any = None) -> dict[str, Any]:
        """Normalize StructuredLogger kwargs into stdlib logging kwargs safely."""
        log_kwargs: dict[str, Any] = {}

        exc_info = kwargs.pop("exc_info", default_exc_info)
        if exc_info is not None:
            log_kwargs["exc_info"] = exc_info

        stack_info = kwargs.pop("stack_info", None)
        if stack_info is not None:
            log_kwargs["stack_info"] = stack_info

        stacklevel = kwargs.pop("stacklevel", None)
        if stacklevel is not None:
            log_kwargs["stacklevel"] = stacklevel

        explicit_extra = kwargs.pop("extra", None)
        merged_extra: dict[str, Any] = {}
        if isinstance(explicit_extra, dict):
            merged_extra.update(explicit_extra)
        merged_extra.update(kwargs)

        if merged_extra:
            log_kwargs["extra"] = merged_extra

        return log_kwargs
    
    def service_started(self, service_name: str, **kwargs):
        """Log service startup."""
        extra = {"service": service_name, **kwargs}
        details = ", ".join(f"{k}={v}" for k, v in kwargs.items())
        msg = f"{service_name} started"
        if details:
            msg += f" ({details})"
        self.logger.info(msg, extra=extra)
    
    def service_stopped(self, service_name: str, **kwargs):
        """Log service shutdown."""
        extra = {"service": service_name, **kwargs}
        self.logger.info(f"{service_name} stopped", extra=extra)
    
    def service_failed(self, service_name: str, reason: str, **kwargs):
        """Log service failure."""
        extra = {"service": service_name, "reason": reason, **kwargs}
        self.logger.error(f"{service_name} failed: {reason}", extra=extra)
    
    def error(self, msg: str, exc: Optional[Exception] = None, **kwargs):
        """
        Log error with optional exception.
        
        Args:
            msg: Error message
            exc: Optional exception object
            **kwargs: Additional structured data
        """
        self.logger.error(
            msg,
            **self._build_log_kwargs(kwargs, default_exc_info=exc),
        )
    
    def warning(self, msg: str, **kwargs) -> None:
        """Log warning."""
        self.logger.warning(msg, **self._build_log_kwargs(kwargs))
    
    def info(self, msg: str, **kwargs):
        """Log info message."""
        self.logger.info(msg, **self._build_log_kwargs(kwargs))
    
    def debug(self, msg: str, **kwargs):
        """Log debug message."""
        self.logger.debug(msg, **self._build_log_kwargs(kwargs))
    
    def success(self, msg: str, **kwargs) -> None:
        """Log success message."""
        self.logger.info(msg, **self._build_log_kwargs(kwargs))
    
    def critical(self, msg: str, exc: Optional[Exception] = None, **kwargs):
        """Log critical error."""
        self.logger.critical(
            msg,
            **self._build_log_kwargs(kwargs, default_exc_info=exc),
        )
    
    def plugin_loaded(self, plugin_name: str, plugin_uri: str, **kwargs):
        """Log plugin loading."""
        extra = {"plugin": plugin_name, "uri": plugin_uri, **kwargs}
        self.logger.info(f"Loaded plugin: {plugin_name}", extra=extra)
    
    def plugin_failed(self, plugin_name: str, reason: str, **kwargs):
        """Log plugin failure."""
        extra = {"plugin": plugin_name, "reason": reason, **kwargs}
        self.logger.error(f"Plugin '{plugin_name}' failed: {reason}", extra=extra)
    
    def audio_xrun(self, xrun_type: str, **kwargs):
        """Log audio XRun (buffer underrun/overrun)."""
        extra = {"xrun_type": xrun_type, **kwargs}
        self.logger.warning(f"Audio {xrun_type}", extra=extra)
    
    def performance_warning(self, operation: str, duration_ms: float, threshold_ms: float, **kwargs):
        """Log performance warning."""
        extra = {"operation": operation, "duration_ms": duration_ms, "threshold_ms": threshold_ms, **kwargs}
        self.logger.warning(
            f"Performance: {operation} took {duration_ms:.1f}ms (threshold: {threshold_ms:.1f}ms)",
            extra=extra,
        )


# Cache for logger instances
_logger_cache: dict[str, StructuredLogger] = {}


def get_logger(name: str) -> StructuredLogger:
    """
    Get or create a structured logger for the given name.
    
    Args:
        name: Logger name (typically __name__)
        
    Returns:
        StructuredLogger instance
    """
    if name not in _logger_cache:
        _logger_cache[name] = StructuredLogger(name)
    return _logger_cache[name]


def log_execution_time(threshold_ms: float = 100.0):
    """
    Decorator to log function execution time if it exceeds threshold.
    
    Args:
        threshold_ms: Threshold in milliseconds
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            import time
            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start) * 1000
                if duration_ms > threshold_ms:
                    logger = get_logger(func.__module__)
                    logger.performance_warning(
                        func.__name__,
                        duration_ms,
                        threshold_ms
                    )
                return result
            except Exception as e:
                logger = get_logger(func.__module__)
                logger.error(f"{func.__name__} failed", exc=e)
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            import time
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start) * 1000
                if duration_ms > threshold_ms:
                    logger = get_logger(func.__module__)
                    logger.performance_warning(
                        func.__name__,
                        duration_ms,
                        threshold_ms
                    )
                return result
            except Exception as e:
                logger = get_logger(func.__module__)
                logger.error(f"{func.__name__} failed", exc=e)
                raise
        
        # Return appropriate wrapper based on function type
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator
