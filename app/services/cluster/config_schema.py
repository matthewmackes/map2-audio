"""
MAP2 Audio Cluster - Configuration Schema Definition

Comprehensive schema and validation for cluster configuration.
Supports INI files, environment variables, and programmatic access.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union
import json
from pathlib import Path

from app.paths import Map2Paths


# ============================================================================
# Enumerations
# ============================================================================

class NodeRole(str, Enum):
    """Node deployment roles."""
    MANAGEMENT_NODE = "MANAGEMENT-NODE"
    AUDIO_NODE = "AUDIO-NODE"
    STANDBY_NODE = "STANDBY-NODE"


class LogLevel(str, Enum):
    """Logging levels."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class UpdateStrategy(str, Enum):
    """Update strategies for cluster."""
    STAGED = "staged"           # Test → Audio → Management
    ROLLING = "rolling"         # Sequential per zone
    CANARY = "canary"          # Canary deployment
    IMMEDIATE = "immediate"     # All at once


# ============================================================================
# Configuration Sections
# ============================================================================

@dataclass
class ClusterConfig:
    """Cluster identity and metadata."""
    name: str = "map2-cluster"
    node_id: str = ""
    node_role: NodeRole = NodeRole.MANAGEMENT_NODE
    version: str = "1.0.0"
    environment: str = "production"  # production, staging, development


@dataclass
class PathsConfig:
    """Directory and file paths."""
    data_dir: str = field(default_factory=lambda: str(Map2Paths.service_state_dir()))
    config_dir: str = field(default_factory=lambda: str(Map2Paths.host_config_dir()))
    log_dir: str = "/var/log/map2"
    backup_dir: str = field(default_factory=lambda: str(Map2Paths.backups_dir()))
    database_path: str = field(default_factory=lambda: str(Map2Paths.cluster_config_database_path()))
    ssl_dir: str = field(default_factory=lambda: str(Map2Paths.ssl_dir()))
    scripts_dir: str = "/opt/map2/scripts"


@dataclass
class ServerConfig:
    """API server configuration."""
    host: str = "0.0.0.0"
    port: int = 8080
    workers: int = 4
    timeout: int = 30
    keep_alive: int = 5
    enable_cors: bool = False
    cors_origins: List[str] = field(default_factory=list)


@dataclass
class DatabaseConfig:
    """Database configuration."""
    backend: str = "sqlite"  # sqlite, postgresql
    path: str = field(default_factory=lambda: str(Map2Paths.cluster_config_database_path()))
    connection_string: Optional[str] = None
    pool_size: int = 5
    max_overflow: int = 10
    echo: bool = False
    use_wal: bool = True  # WAL mode for SQLite
    backup_enabled: bool = True
    backup_interval: int = 3600  # Seconds


@dataclass
class SSLConfig:
    """TLS/SSL configuration."""
    enabled: bool = True
    ca_cert_path: str = field(default_factory=lambda: str(Map2Paths.ca_cert_path()))
    cert_path: str = field(default_factory=lambda: str(Map2Paths.node_cert_path()))
    key_path: str = field(default_factory=lambda: str(Map2Paths.node_key_path()))
    verify_mode: str = "CERT_REQUIRED"  # CERT_NONE, CERT_OPTIONAL, CERT_REQUIRED
    cert_renewal_threshold: int = 80  # Renew at 80% of lifetime
    min_tls_version: str = "TLSv1.2"
    ciphers: str = "HIGH:!aNULL:!MD5"


@dataclass
class ClusterManagementConfig:
    """Cluster management behavior."""
    # Health monitoring
    health_check_interval: int = 30
    health_check_timeout: int = 5
    health_score_threshold: int = 50  # Below this = unhealthy
    
    # Metrics
    metrics_aggregation_interval: int = 60
    metrics_retention_days: int = 7
    
    # Failover
    failover_timeout: int = 30
    failover_max_retries: int = 3
    
    # State replication
    state_replication_interval: int = 300  # 5 minutes
    replication_retry_interval: int = 30
    replication_max_retries: int = 5
    
    # Discovery
    discovery_interval: int = 60
    discovery_ttl: int = 3600
    
    # Registry
    max_nodes: int = 50
    node_timeout: int = 300  # 5 minutes without heartbeat


@dataclass
class UpdateConfig:
    """Package update configuration."""
    strategy: UpdateStrategy = UpdateStrategy.STAGED
    enabled: bool = True
    schedule_enabled: bool = True
    schedule_cron: str = "0 3 * * 0"  # Sunday 3 AM
    
    # Stagger settings
    stagger_rate: int = 2  # Nodes per hour
    stagger_interval: int = 1800  # 30 minutes between groups
    
    # Update behavior
    pre_update_validation: bool = True
    post_update_validation: bool = True
    rollback_on_failure: bool = True
    dry_run_enabled: bool = True
    
    # Safety
    skip_critical_updates: bool = False
    require_approval: bool = False
    update_timeout: int = 3600  # 1 hour


@dataclass
class BackupConfig:
    """Backup and disaster recovery configuration."""
    enabled: bool = True
    schedule_cron: str = "0 2 * * *"  # Daily at 2 AM
    retention_days: int = 30
    
    # Backup types
    include_database: bool = True
    include_presets: bool = True
    include_config: bool = True
    
    # Storage
    backup_compression: str = "gzip"  # gzip, bzip2, none
    backup_location: str = field(default_factory=lambda: str(Map2Paths.backups_dir()))
    backup_retention_count: int = 10
    
    # Verification
    verify_after_backup: bool = True
    test_restore_enabled: bool = False
    test_restore_schedule: str = "0 4 * * 0"  # Weekly Sunday 4 AM
    
    # Alerts
    alert_on_failure: bool = True
    alert_email: Optional[str] = None


@dataclass
class NetworkConfig:
    """Network topology and communication configuration."""
    # Topology monitoring
    topology_update_interval: int = 60
    topology_mesh_enabled: bool = True
    
    # Latency
    latency_threshold_ms: int = 100  # Alert if exceeded
    latency_jitter_threshold_ms: int = 50
    
    # Packet loss
    packet_loss_threshold_percent: float = 1.0
    
    # Network paths
    preferred_interface: Optional[str] = None
    multicast_enabled: bool = True
    multicast_group: str = "239.255.76.50"
    multicast_port: int = 5353


@dataclass
class LoggingConfig:
    """Logging configuration."""
    level: LogLevel = LogLevel.INFO
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format: str = "%Y-%m-%d %H:%M:%S"
    
    # File logging
    file_enabled: bool = True
    file_path: str = "/var/log/map2/cluster.log"
    file_max_bytes: int = 104857600  # 100 MB
    file_backup_count: int = 10
    
    # Console logging
    console_enabled: bool = True
    console_level: LogLevel = LogLevel.INFO
    
    # Syslog
    syslog_enabled: bool = True
    syslog_facility: str = "LOCAL0"
    
    # Request logging
    log_requests: bool = True
    log_request_body: bool = False


@dataclass
class SecurityConfig:
    """Security and authentication configuration."""
    # API authentication
    require_api_key: bool = True
    api_key_rotation_days: int = 90
    
    # RBAC
    rbac_enabled: bool = True
    default_role: str = "viewer"
    
    # Audit
    audit_logging_enabled: bool = True
    audit_retention_days: int = 90
    
    # Rate limiting
    rate_limiting_enabled: bool = True
    rate_limit_requests: int = 1000
    rate_limit_window: int = 60  # Seconds
    
    # Security headers
    enable_cors: bool = False
    enable_hsts: bool = True
    hsts_max_age: int = 31536000  # 1 year


@dataclass
class EventConfig:
    """Event system configuration."""
    # Event log
    event_logging_enabled: bool = True
    event_retention_days: int = 7
    event_max_size: int = 1000000  # 1 MB
    
    # Event types
    log_node_events: bool = True
    log_update_events: bool = True
    log_config_events: bool = True
    log_health_events: bool = True
    log_failover_events: bool = True
    
    # Event publishing
    publish_events: bool = True
    event_topics: List[str] = field(default_factory=lambda: [
        "node.joined", "node.left", "node.health",
        "update.started", "update.completed", "update.failed",
        "config.changed", "failover.triggered"
    ])


@dataclass
class AlertConfig:
    """Alerting configuration."""
    enabled: bool = True
    
    # Alert methods
    email_enabled: bool = False
    email_recipients: List[str] = field(default_factory=list)
    email_smtp_host: Optional[str] = None
    email_smtp_port: int = 587
    
    webhook_enabled: bool = False
    webhook_url: Optional[str] = None
    
    syslog_enabled: bool = True
    
    # Alert conditions
    alert_on_node_down: bool = True
    alert_on_low_health: bool = True
    alert_on_update_failure: bool = True
    alert_on_backup_failure: bool = True
    alert_on_high_latency: bool = True
    
    # Thresholds
    low_health_threshold: int = 30
    high_latency_threshold_ms: int = 200


@dataclass
class PerformanceConfig:
    """Performance tuning configuration."""
    # Database
    db_cache_size: int = 10000
    db_query_timeout: int = 30
    
    # Memory
    max_memory_usage_mb: int = 512
    memory_cleanup_interval: int = 300
    
    # CPU
    max_cpu_percent: int = 80
    
    # Network
    network_buffer_size: int = 65536
    max_concurrent_connections: int = 100
    
    # Caching
    cache_enabled: bool = True
    cache_ttl: int = 300


@dataclass
class AudioConfig:
    """Audio-specific configuration."""
    # Audio devices
    device_detection_enabled: bool = True
    device_detection_interval: int = 300
    
    # Audio metrics
    collect_audio_metrics: bool = True
    audio_metrics_interval: int = 60
    
    # DSP
    monitor_dsp_load: bool = True
    dsp_load_threshold_percent: int = 80
    
    # Xruns
    monitor_xruns: bool = True
    xrun_alert_threshold: int = 100
    
    # Jack
    jack_enabled: bool = True
    jack_default_server: str = "default"


@dataclass
class ClusterConfigSchema:
    """Complete cluster configuration schema."""
    cluster: ClusterConfig = field(default_factory=ClusterConfig)
    paths: PathsConfig = field(default_factory=PathsConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    ssl: SSLConfig = field(default_factory=SSLConfig)
    cluster_management: ClusterManagementConfig = field(default_factory=ClusterManagementConfig)
    updates: UpdateConfig = field(default_factory=UpdateConfig)
    backup: BackupConfig = field(default_factory=BackupConfig)
    network: NetworkConfig = field(default_factory=NetworkConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    events: EventConfig = field(default_factory=EventConfig)
    alerts: AlertConfig = field(default_factory=AlertConfig)
    performance: PerformanceConfig = field(default_factory=PerformanceConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "cluster": self.cluster.__dict__,
            "paths": self.paths.__dict__,
            "server": self.server.__dict__,
            "database": self.database.__dict__,
            "ssl": self.ssl.__dict__,
            "cluster_management": self.cluster_management.__dict__,
            "updates": {**self.updates.__dict__, "strategy": self.updates.strategy.value},
            "backup": self.backup.__dict__,
            "network": self.network.__dict__,
            "logging": {**self.logging.__dict__, 
                       "level": self.logging.level.value,
                       "console_level": self.logging.console_level.value},
            "security": self.security.__dict__,
            "events": self.events.__dict__,
            "alerts": self.alerts.__dict__,
            "performance": self.performance.__dict__,
            "audio": self.audio.__dict__,
        }

    def to_json(self) -> str:
        """Convert configuration to JSON."""
        return json.dumps(self.to_dict(), indent=2, default=str)


# ============================================================================
# JSON Schema Definition
# ============================================================================

def get_json_schema() -> Dict[str, Any]:
    """Return JSON Schema for cluster configuration validation."""
    return {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "MAP2 Audio Cluster Configuration",
        "type": "object",
        "required": ["cluster"],
        "properties": {
            "cluster": {
                "type": "object",
                "required": ["name"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "node_id": {"type": "string"},
                    "node_role": {"enum": ["MANAGEMENT-NODE", "AUDIO-NODE", "STANDBY-NODE"]},
                    "version": {"type": "string"},
                    "environment": {"enum": ["production", "staging", "development"]},
                }
            },
            "paths": {
                "type": "object",
                "properties": {
                    "data_dir": {"type": "string"},
                    "config_dir": {"type": "string"},
                    "log_dir": {"type": "string"},
                    "backup_dir": {"type": "string"},
                    "database_path": {"type": "string"},
                    "ssl_dir": {"type": "string"},
                }
            },
            "server": {
                "type": "object",
                "properties": {
                    "host": {"type": "string"},
                    "port": {"type": "integer", "minimum": 1, "maximum": 65535},
                    "workers": {"type": "integer", "minimum": 1, "maximum": 100},
                    "timeout": {"type": "integer", "minimum": 1},
                }
            },
            "database": {
                "type": "object",
                "properties": {
                    "backend": {"enum": ["sqlite", "postgresql"]},
                    "pool_size": {"type": "integer", "minimum": 1},
                    "use_wal": {"type": "boolean"},
                }
            },
            "ssl": {
                "type": "object",
                "properties": {
                    "enabled": {"type": "boolean"},
                    "cert_path": {"type": "string"},
                    "key_path": {"type": "string"},
                    "ca_cert_path": {"type": "string"},
                }
            },
            "cluster_management": {
                "type": "object",
                "properties": {
                    "health_check_interval": {"type": "integer", "minimum": 5},
                    "health_score_threshold": {"type": "integer", "minimum": 0, "maximum": 100},
                    "failover_timeout": {"type": "integer", "minimum": 1},
                    "max_nodes": {"type": "integer", "minimum": 1, "maximum": 1000},
                }
            },
            "updates": {
                "type": "object",
                "properties": {
                    "strategy": {"enum": ["staged", "rolling", "canary", "immediate"]},
                    "enabled": {"type": "boolean"},
                    "stagger_rate": {"type": "integer", "minimum": 1},
                }
            },
            "backup": {
                "type": "object",
                "properties": {
                    "enabled": {"type": "boolean"},
                    "retention_days": {"type": "integer", "minimum": 1},
                }
            },
            "logging": {
                "type": "object",
                "properties": {
                    "level": {"enum": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]},
                    "file_enabled": {"type": "boolean"},
                }
            },
            "security": {
                "type": "object",
                "properties": {
                    "rbac_enabled": {"type": "boolean"},
                    "audit_logging_enabled": {"type": "boolean"},
                }
            },
        }
    }
