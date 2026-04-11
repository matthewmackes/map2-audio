"""
Resilience Event Logging

Structured logging for resilience events (circuit breaker, health alerts, etc.)
Helps with debugging and monitoring system behavior.
"""

import logging
from typing import Optional, Any, Dict
from enum import Enum

from app.utils.time import utc_now


class EventSeverity(Enum):
    """Severity levels for resilience events."""
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class ResilienceLogger:
    """Structured logging for resilience events."""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.name = name
    
    def _log_event(self, event_type: str, severity: EventSeverity, 
                   message: str, **context: Any) -> None:
        """
        Log a resilience event with context.
        
        Args:
            event_type: Type of event (e.g., "CIRCUIT_OPENED")
            severity: Severity level
            message: Human-readable message
            **context: Additional context data
        """
        log_data = {
            'event_type': event_type,
            'message': message,
            'timestamp': utc_now().isoformat(),
            'logger': self.name,
            **context
        }
        
        log_method = getattr(self.logger, severity.name.lower())
        log_method(f"[{event_type}] {message} | {log_data}")
    
    # Circuit Breaker Events
    def circuit_opened(self, service_name: str, reason: str) -> None:
        """Log when circuit breaker opens (failures detected)."""
        self._log_event(
            "CIRCUIT_OPENED",
            EventSeverity.WARNING,
            f"Circuit opened for {service_name}",
            service=service_name,
            reason=reason
        )
    
    def circuit_closed(self, service_name: str) -> None:
        """Log when circuit breaker closes (normal operation resumed)."""
        self._log_event(
            "CIRCUIT_CLOSED",
            EventSeverity.INFO,
            f"Circuit closed for {service_name}",
            service=service_name
        )
    
    def circuit_half_open(self, service_name: str) -> None:
        """Log when circuit enters half-open state (testing recovery)."""
        self._log_event(
            "CIRCUIT_HALF_OPEN",
            EventSeverity.INFO,
            f"Circuit attempting recovery for {service_name}",
            service=service_name
        )
    
    def circuit_test_succeeded(self, service_name: str) -> None:
        """Log successful recovery test."""
        self._log_event(
            "CIRCUIT_TEST_SUCCEEDED",
            EventSeverity.INFO,
            f"Recovery test succeeded for {service_name}",
            service=service_name
        )
    
    def circuit_test_failed(self, service_name: str, error: str) -> None:
        """Log failed recovery test."""
        self._log_event(
            "CIRCUIT_TEST_FAILED",
            EventSeverity.WARNING,
            f"Recovery test failed for {service_name}: {error}",
            service=service_name,
            error=error
        )
    
    # Health Events
    def service_unhealthy(self, service_name: str, reason: str) -> None:
        """Log when service becomes unhealthy."""
        self._log_event(
            "SERVICE_UNHEALTHY",
            EventSeverity.WARNING,
            f"Service {service_name} marked unhealthy: {reason}",
            service=service_name,
            reason=reason
        )
    
    def service_healthy(self, service_name: str) -> None:
        """Log when service recovers to healthy."""
        self._log_event(
            "SERVICE_HEALTHY",
            EventSeverity.INFO,
            f"Service {service_name} recovered to healthy",
            service=service_name
        )
    
    def service_degraded(self, service_name: str, issue: str) -> None:
        """Log when service is degraded but operational."""
        self._log_event(
            "SERVICE_DEGRADED",
            EventSeverity.WARNING,
            f"Service {service_name} degraded: {issue}",
            service=service_name,
            issue=issue
        )
    
    # Request Queue Events
    def request_queued(self, endpoint: str, priority: str, 
                      retry_count: int = 0) -> None:
        """Log when request is queued."""
        self._log_event(
            "REQUEST_QUEUED",
            EventSeverity.INFO,
            f"Request queued for {endpoint}",
            endpoint=endpoint,
            priority=priority,
            retry_count=retry_count
        )
    
    def request_retried(self, endpoint: str, retry_count: int, 
                       backoff_seconds: float) -> None:
        """Log request retry."""
        self._log_event(
            "REQUEST_RETRIED",
            EventSeverity.INFO,
            f"Retrying {endpoint} (attempt {retry_count})",
            endpoint=endpoint,
            retry_count=retry_count,
            backoff_seconds=backoff_seconds
        )
    
    def request_succeeded(self, endpoint: str, retry_count: int) -> None:
        """Log queued request success."""
        self._log_event(
            "REQUEST_SUCCEEDED",
            EventSeverity.INFO,
            f"Queued request succeeded: {endpoint}",
            endpoint=endpoint,
            retry_count=retry_count
        )
    
    def request_failed(self, endpoint: str, retry_count: int, 
                      max_retries: int, error: str) -> None:
        """Log queued request failure after max retries."""
        self._log_event(
            "REQUEST_FAILED",
            EventSeverity.ERROR,
            f"Request exhausted retries: {endpoint}",
            endpoint=endpoint,
            retry_count=retry_count,
            max_retries=max_retries,
            error=error
        )
    
    # Feature Availability Events
    def fallback_activated(self, feature_name: str, reason: str) -> None:
        """Log when feature fallback is activated."""
        self._log_event(
            "FALLBACK_ACTIVATED",
            EventSeverity.WARNING,
            f"Fallback activated for {feature_name}: {reason}",
            feature=feature_name,
            reason=reason
        )
    
    def fallback_deactivated(self, feature_name: str) -> None:
        """Log when feature returns from fallback."""
        self._log_event(
            "FALLBACK_DEACTIVATED",
            EventSeverity.INFO,
            f"Fallback deactivated for {feature_name}",
            feature=feature_name
        )
    
    def feature_unavailable(self, feature_name: str, reason: str) -> None:
        """Log when feature becomes unavailable."""
        self._log_event(
            "FEATURE_UNAVAILABLE",
            EventSeverity.WARNING,
            f"Feature {feature_name} unavailable: {reason}",
            feature=feature_name,
            reason=reason
        )
    
    # Connection Pool Events
    def connection_created(self, service_name: str) -> None:
        """Log new connection created."""
        self._log_event(
            "CONNECTION_CREATED",
            EventSeverity.INFO,
            f"New connection created for {service_name}",
            service=service_name
        )
    
    def connection_reused(self, service_name: str) -> None:
        """Log connection reused."""
        self._log_event(
            "CONNECTION_REUSED",
            EventSeverity.INFO,
            f"Connection reused for {service_name}",
            service=service_name
        )
    
    def connection_health_check_failed(self, service_name: str, error: str) -> None:
        """Log health check failure."""
        self._log_event(
            "HEALTH_CHECK_FAILED",
            EventSeverity.WARNING,
            f"Health check failed for {service_name}: {error}",
            service=service_name,
            error=error
        )
    
    def connection_closed(self, service_name: str, reason: str) -> None:
        """Log connection closed."""
        self._log_event(
            "CONNECTION_CLOSED",
            EventSeverity.INFO,
            f"Connection closed for {service_name}: {reason}",
            service=service_name,
            reason=reason
        )
    
    # Metrics and Statistics
    def metrics_snapshot(self, service_name: str, metrics: Dict[str, Any]) -> None:
        """Log metrics snapshot."""
        self._log_event(
            "METRICS_SNAPSHOT",
            EventSeverity.INFO,
            f"Metrics for {service_name}",
            service=service_name,
            metrics=metrics
        )
    
    def alert(self, alert_type: str, message: str, severity: EventSeverity = EventSeverity.WARNING,
              **context: Any) -> None:
        """Log a generic alert."""
        self._log_event(
            alert_type,
            severity,
            message,
            **context
        )


# Module-level logger instances for common use
def get_resilience_logger(name: str = "resilience") -> ResilienceLogger:
    """Get a resilience logger instance."""
    return ResilienceLogger(name)
