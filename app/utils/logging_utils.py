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

import logging
from typing import Any, Optional, Dict
from functools import wraps


class StructuredLogger:
    """
    Enhanced logger with structured logging and consistent formatting.
    
    Provides common logging patterns with emoji indicators and
    support for structured log data.
    """
    
    def __init__(self, name: str):
        """
        Initialize structured logger.
        
        Args:
            name: Logger name (typically __name__ of calling module)
        """
        self.logger = logging.getLogger(name)
        self.name = name
    
    def service_started(self, service_name: str, **kwargs):
        """Log service startup with success indicator."""
        extra = {"service": service_name, **kwargs}
        details = ", ".join(f"{k}={v}" for k, v in kwargs.items())
        msg = f"✅ {service_name} started"
        if details:
            msg += f" ({details})"
        self.logger.info(msg, extra=extra)
    
    def service_stopped(self, service_name: str, **kwargs):
        """Log service shutdown."""
        extra = {"service": service_name, **kwargs}
        self.logger.info(f"🛑 {service_name} stopped", extra=extra)
    
    def service_failed(self, service_name: str, reason: str, **kwargs):
        """Log service failure."""
        extra = {"service": service_name, "reason": reason, **kwargs}
        self.logger.error(f"❌ {service_name} failed: {reason}", extra=extra)
    
    def error(self, msg: str, exc: Optional[Exception] = None, **kwargs):
        """
        Log error with optional exception.
        
        Args:
            msg: Error message
            exc: Optional exception object
            **kwargs: Additional structured data
        """
        self.logger.error(f"❌ {msg}", exc_info=exc, extra=kwargs)
    
    def warning(self, msg: str, **kwargs):
        """Log warning with indicator."""
        self.logger.warning(f"⚠️  {msg}", extra=kwargs)
    
    def info(self, msg: str, **kwargs):
        """Log info message."""
        self.logger.info(msg, extra=kwargs)
    
    def debug(self, msg: str, **kwargs):
        """Log debug message."""
        self.logger.debug(msg, extra=kwargs)
    
    def success(self, msg: str, **kwargs):
        """Log success message with indicator."""
        self.logger.info(f"✅ {msg}", extra=kwargs)
    
    def critical(self, msg: str, exc: Optional[Exception] = None, **kwargs):
        """Log critical error."""
        self.logger.critical(f"🚨 {msg}", exc_info=exc, extra=kwargs)
    
    def plugin_loaded(self, plugin_name: str, plugin_uri: str, **kwargs):
        """Log plugin loading."""
        extra = {"plugin": plugin_name, "uri": plugin_uri, **kwargs}
        self.logger.info(f"🔌 Loaded plugin: {plugin_name}", extra=extra)
    
    def plugin_failed(self, plugin_name: str, reason: str, **kwargs):
        """Log plugin failure."""
        extra = {"plugin": plugin_name, "reason": reason, **kwargs}
        self.logger.error(f"❌ Plugin '{plugin_name}' failed: {reason}", extra=extra)
    
    def audio_xrun(self, xrun_type: str, **kwargs):
        """Log audio XRun (buffer underrun/overrun)."""
        extra = {"xrun_type": xrun_type, **kwargs}
        self.logger.warning(f"⚠️  Audio {xrun_type}", extra=extra)
    
    def performance_warning(self, operation: str, duration_ms: float, threshold_ms: float, **kwargs):
        """Log performance warning."""
        extra = {"operation": operation, "duration_ms": duration_ms, "threshold_ms": threshold_ms, **kwargs}
        self.logger.warning(
            f"⚠️  Performance: {operation} took {duration_ms:.1f}ms (threshold: {threshold_ms:.1f}ms)",
            extra=extra
        )


# Cache for logger instances
_logger_cache: Dict[str, StructuredLogger] = {}


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
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator
