"""
Resilience Configuration for MAP2 Audio Platform

Centralized configuration for all resilience features:
- Circuit breaker parameters
- Connection pooling settings
- Request queuing configuration
- Health monitoring thresholds
- Feature availability rules

All tunable parameters in one place for easy adjustment.
"""

from dataclasses import dataclass
from typing import Optional
import os


@dataclass
class CircuitBreakerConfig:
    """Circuit breaker tuning parameters."""
    
    failure_threshold: int = 5          # Failures before opening circuit
    success_threshold: int = 2          # Successes before closing from half-open
    timeout_seconds: int = 30           # Time before attempting recovery
    name: str = "default"


@dataclass
class RetryConfig:
    """Retry strategy configuration."""
    
    max_retries: int = 3
    initial_backoff_seconds: float = 1.0
    max_backoff_seconds: float = 300.0  # 5 minutes
    exponential_base: float = 2.0
    jitter: bool = True                 # Add randomness to prevent thundering herd


@dataclass
class ConnectionPoolConfig:
    """Connection pool tuning parameters."""
    
    max_connections: int = 20
    health_check_interval_seconds: int = 30
    connection_timeout_seconds: float = 10.0
    keep_alive_timeout_seconds: float = 60.0
    max_keep_alive_connections: int = 5


@dataclass
class RequestQueueConfig:
    """Request queue tuning parameters."""
    
    max_queue_size: int = 1000
    persistence_path: str = "/data/request_queue.json"
    process_interval_seconds: int = 5
    enable_persistence: bool = True


@dataclass
class HealthMonitorConfig:
    """Health monitoring tuning parameters."""
    
    check_interval_seconds: int = 30
    history_retention_hours: int = 24
    history_max_points_per_service: int = 1440  # ~1 day at 1-min intervals
    alert_threshold_error_rate: float = 0.1     # 10%
    alert_threshold_response_time_ms: float = 1000.0
    alert_threshold_memory_mb: float = 500.0
    alert_threshold_cpu_percent: float = 80.0


class ResilienceConfig:
    """Master configuration for all resilience features."""
    
    # Subsystem configurations
    circuit_breaker = CircuitBreakerConfig()
    retry = RetryConfig()
    connection_pool = ConnectionPoolConfig()
    request_queue = RequestQueueConfig()
    health_monitor = HealthMonitorConfig()
    
    # Feature flags for gradual rollout
    enable_circuit_breaker: bool = os.getenv("ENABLE_CIRCUIT_BREAKER", "true").lower() == "true"
    enable_health_monitoring: bool = os.getenv("ENABLE_HEALTH_MONITORING", "true").lower() == "true"
    enable_connection_pooling: bool = os.getenv("ENABLE_CONNECTION_POOLING", "true").lower() == "true"
    enable_request_queuing: bool = os.getenv("ENABLE_REQUEST_QUEUING", "true").lower() == "true"
    enable_graceful_degradation: bool = os.getenv("ENABLE_GRACEFUL_DEGRADATION", "true").lower() == "true"
    
    # Logging configuration
    log_circuit_breaker_events: bool = True
    log_health_alerts: bool = True
    log_request_queue_events: bool = True
    log_resilience_metrics: bool = True
    
    # Debug mode (verbose logging)
    debug_resilience: bool = os.getenv("DEBUG_RESILIENCE", "false").lower() == "true"
    
    @classmethod
    def get_config(cls) -> 'ResilienceConfig':
        """Get singleton configuration instance."""
        return cls()
    
    @classmethod
    def print_config(cls) -> str:
        """Print current configuration for debugging."""
        config = cls()
        lines = [
            "=== Resilience Configuration ===",
            f"Circuit Breaker: {'ENABLED' if config.enable_circuit_breaker else 'DISABLED'}",
            f"  - Failure threshold: {config.circuit_breaker.failure_threshold}",
            f"  - Success threshold: {config.circuit_breaker.success_threshold}",
            f"  - Timeout: {config.circuit_breaker.timeout_seconds}s",
            "",
            f"Health Monitoring: {'ENABLED' if config.enable_health_monitoring else 'DISABLED'}",
            f"  - Check interval: {config.health_monitor.check_interval_seconds}s",
            f"  - Error rate alert: >{config.health_monitor.alert_threshold_error_rate*100}%",
            "",
            f"Connection Pooling: {'ENABLED' if config.enable_connection_pooling else 'DISABLED'}",
            f"  - Max connections: {config.connection_pool.max_connections}",
            f"  - Health check interval: {config.connection_pool.health_check_interval_seconds}s",
            "",
            f"Request Queuing: {'ENABLED' if config.enable_request_queuing else 'DISABLED'}",
            f"  - Max queue size: {config.request_queue.max_queue_size}",
            f"  - Process interval: {config.request_queue.process_interval_seconds}s",
            "",
            f"Graceful Degradation: {'ENABLED' if config.enable_graceful_degradation else 'DISABLED'}",
        ]
        return "\n".join(lines)
