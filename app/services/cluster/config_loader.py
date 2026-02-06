"""
MAP2 Audio Cluster - Configuration Validation and Loading

Loads and validates cluster configuration from INI files, environment variables,
and programmatic sources. Supports versioning, migration, and override chains.
"""

import os
import json
from pathlib import Path
from typing import Any, Dict, Optional
from configparser import ConfigParser, ExtendedInterpolation
import logging

try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False

from app.services.cluster.config_schema import (
    ClusterConfigSchema,
    ClusterConfig,
    PathsConfig,
    ServerConfig,
    DatabaseConfig,
    SSLConfig,
    ClusterManagementConfig,
    UpdateConfig,
    BackupConfig,
    NetworkConfig,
    LoggingConfig,
    SecurityConfig,
    EventConfig,
    AlertConfig,
    PerformanceConfig,
    AudioConfig,
    NodeRole,
    LogLevel,
    UpdateStrategy,
    get_json_schema,
)

logger = logging.getLogger(__name__)


class ConfigValidator:
    """Validates configuration against schema."""
    
    @staticmethod
    def validate(config_dict: Dict[str, Any]) -> bool:
        """
        Validate configuration dictionary against JSON schema.
        
        Args:
            config_dict: Configuration dictionary to validate
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If validation fails
        """
        if not HAS_JSONSCHEMA:
            logger.warning("jsonschema not available, skipping schema validation")
            return True
        
        try:
            schema = get_json_schema()
            jsonschema.validate(config_dict, schema)
            return True
        except jsonschema.ValidationError as e:
            raise ValueError(f"Configuration validation failed: {e.message}") from e


class ConfigLoader:
    """Loads and parses configuration from various sources."""
    
    @staticmethod
    def load_ini(path: Path) -> Dict[str, Any]:
        """
        Load configuration from INI file.
        
        Args:
            path: Path to INI configuration file
            
        Returns:
            Dictionary with parsed configuration
        """
        if not path.exists():
            raise FileNotFoundError(f"Configuration file not found: {path}")
        
        parser = ConfigParser(interpolation=ExtendedInterpolation())
        parser.read(path)
        
        config_dict = {}
        for section in parser.sections():
            config_dict[section] = dict(parser.items(section))
        
        logger.info(f"Loaded configuration from {path}")
        return config_dict
    
    @staticmethod
    def load_json(path: Path) -> Dict[str, Any]:
        """
        Load configuration from JSON file.
        
        Args:
            path: Path to JSON configuration file
            
        Returns:
            Dictionary with parsed configuration
        """
        if not path.exists():
            raise FileNotFoundError(f"Configuration file not found: {path}")
        
        with open(path, 'r') as f:
            config_dict = json.load(f)
        
        logger.info(f"Loaded configuration from {path}")
        return config_dict
    
    @staticmethod
    def load_env() -> Dict[str, Any]:
        """
        Load configuration from environment variables.
        
        Looks for variables with prefix 'MAP2_' followed by section and key.
        Example: MAP2_CLUSTER_NAME=my-cluster
        
        Returns:
            Dictionary with parsed configuration
        """
        config_dict = {}
        prefix = "MAP2_"
        
        for key, value in os.environ.items():
            if key.startswith(prefix):
                # Remove prefix and convert to lowercase
                config_key = key[len(prefix):].lower()
                
                # Split on first underscore to get section
                if '_' in config_key:
                    section, subkey = config_key.split('_', 1)
                    
                    if section not in config_dict:
                        config_dict[section] = {}
                    
                    config_dict[section][subkey] = value
        
        if config_dict:
            logger.info(f"Loaded {len(config_dict)} configuration sections from environment")
        
        return config_dict


class ConfigParser:
    """Parses configuration into strongly-typed schema objects."""
    
    @staticmethod
    def parse_bool(value: Any) -> bool:
        """Parse boolean value from string."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', 'yes', '1', 'on')
        return bool(value)
    
    @staticmethod
    def parse_int(value: Any, default: int = 0) -> int:
        """Parse integer value from string."""
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def parse_enum(value: Any, enum_class, default=None):
        """Parse enum value from string."""
        if isinstance(value, enum_class):
            return value
        
        try:
            return enum_class(value)
        except (ValueError, KeyError):
            if default is not None:
                return default
            raise ValueError(f"Invalid {enum_class.__name__} value: {value}")
    
    @staticmethod
    def parse_list(value: Any) -> list:
        """Parse list value from string."""
        if isinstance(value, list):
            return value
        
        if isinstance(value, str):
            # Split by comma
            return [item.strip() for item in value.split(',')]
        
        return [value]
    
    @classmethod
    def parse_config(cls, config_dict: Dict[str, Any]) -> ClusterConfigSchema:
        """
        Parse configuration dictionary into schema objects.
        
        Args:
            config_dict: Raw configuration dictionary
            
        Returns:
            ClusterConfigSchema instance
        """
        # Validate first
        ConfigValidator.validate(config_dict)
        
        # Parse each section
        cluster_data = config_dict.get('cluster', {})
        cluster = ClusterConfig(
            name=cluster_data.get('name', 'map2-cluster'),
            node_id=cluster_data.get('node_id', ''),
            node_role=cls.parse_enum(
                cluster_data.get('node_role', 'MANAGEMENT-NODE'),
                NodeRole
            ),
            version=cluster_data.get('version', '1.0.0'),
            environment=cluster_data.get('environment', 'production'),
        )
        
        paths_data = config_dict.get('paths', {})
        paths = PathsConfig(
            data_dir=paths_data.get('data_dir', '/var/lib/map2'),
            config_dir=paths_data.get('config_dir', '/etc/map2'),
            log_dir=paths_data.get('log_dir', '/var/log/map2'),
            backup_dir=paths_data.get('backup_dir', '/var/lib/map2/backups'),
            database_path=paths_data.get('database_path', '/var/lib/map2/database/cluster.db'),
            ssl_dir=paths_data.get('ssl_dir', '/etc/map2/ssl'),
            scripts_dir=paths_data.get('scripts_dir', '/opt/map2/scripts'),
        )
        
        server_data = config_dict.get('server', {})
        server = ServerConfig(
            host=server_data.get('host', '0.0.0.0'),
            port=cls.parse_int(server_data.get('port'), 8080),
            workers=cls.parse_int(server_data.get('workers'), 4),
            timeout=cls.parse_int(server_data.get('timeout'), 30),
            keep_alive=cls.parse_int(server_data.get('keep_alive'), 5),
            enable_cors=cls.parse_bool(server_data.get('enable_cors', False)),
            cors_origins=cls.parse_list(server_data.get('cors_origins', [])),
        )
        
        database_data = config_dict.get('database', {})
        database = DatabaseConfig(
            backend=database_data.get('backend', 'sqlite'),
            path=database_data.get('path', '/var/lib/map2/database/cluster.db'),
            pool_size=cls.parse_int(database_data.get('pool_size'), 5),
            max_overflow=cls.parse_int(database_data.get('max_overflow'), 10),
            echo=cls.parse_bool(database_data.get('echo', False)),
            use_wal=cls.parse_bool(database_data.get('use_wal', True)),
            backup_enabled=cls.parse_bool(database_data.get('backup_enabled', True)),
            backup_interval=cls.parse_int(database_data.get('backup_interval'), 3600),
        )
        
        ssl_data = config_dict.get('ssl', {})
        ssl = SSLConfig(
            enabled=cls.parse_bool(ssl_data.get('enabled', True)),
            ca_cert_path=ssl_data.get('ca_cert_path', '/etc/map2/ssl/ca-cert.pem'),
            cert_path=ssl_data.get('cert_path', '/etc/map2/ssl/node-cert.pem'),
            key_path=ssl_data.get('key_path', '/etc/map2/ssl/node-key.pem'),
            verify_mode=ssl_data.get('verify_mode', 'CERT_REQUIRED'),
            cert_renewal_threshold=cls.parse_int(ssl_data.get('cert_renewal_threshold'), 80),
            min_tls_version=ssl_data.get('min_tls_version', 'TLSv1.2'),
        )
        
        cm_data = config_dict.get('cluster_management', {})
        cluster_management = ClusterManagementConfig(
            health_check_interval=cls.parse_int(cm_data.get('health_check_interval'), 30),
            health_check_timeout=cls.parse_int(cm_data.get('health_check_timeout'), 5),
            health_score_threshold=cls.parse_int(cm_data.get('health_score_threshold'), 50),
            metrics_aggregation_interval=cls.parse_int(cm_data.get('metrics_aggregation_interval'), 60),
            metrics_retention_days=cls.parse_int(cm_data.get('metrics_retention_days'), 7),
            failover_timeout=cls.parse_int(cm_data.get('failover_timeout'), 30),
            failover_max_retries=cls.parse_int(cm_data.get('failover_max_retries'), 3),
            state_replication_interval=cls.parse_int(cm_data.get('state_replication_interval'), 300),
            replication_retry_interval=cls.parse_int(cm_data.get('replication_retry_interval'), 30),
            replication_max_retries=cls.parse_int(cm_data.get('replication_max_retries'), 5),
            discovery_interval=cls.parse_int(cm_data.get('discovery_interval'), 60),
            discovery_ttl=cls.parse_int(cm_data.get('discovery_ttl'), 3600),
            max_nodes=cls.parse_int(cm_data.get('max_nodes'), 50),
            node_timeout=cls.parse_int(cm_data.get('node_timeout'), 300),
        )
        
        updates_data = config_dict.get('updates', {})
        updates = UpdateConfig(
            strategy=cls.parse_enum(updates_data.get('strategy', 'staged'), UpdateStrategy),
            enabled=cls.parse_bool(updates_data.get('enabled', True)),
            schedule_enabled=cls.parse_bool(updates_data.get('schedule_enabled', True)),
            schedule_cron=updates_data.get('schedule_cron', '0 3 * * 0'),
            stagger_rate=cls.parse_int(updates_data.get('stagger_rate'), 2),
            stagger_interval=cls.parse_int(updates_data.get('stagger_interval'), 1800),
            pre_update_validation=cls.parse_bool(updates_data.get('pre_update_validation', True)),
            post_update_validation=cls.parse_bool(updates_data.get('post_update_validation', True)),
            rollback_on_failure=cls.parse_bool(updates_data.get('rollback_on_failure', True)),
            dry_run_enabled=cls.parse_bool(updates_data.get('dry_run_enabled', True)),
        )
        
        backup_data = config_dict.get('backup', {})
        backup = BackupConfig(
            enabled=cls.parse_bool(backup_data.get('enabled', True)),
            schedule_cron=backup_data.get('schedule_cron', '0 2 * * *'),
            retention_days=cls.parse_int(backup_data.get('retention_days'), 30),
            include_database=cls.parse_bool(backup_data.get('include_database', True)),
            include_presets=cls.parse_bool(backup_data.get('include_presets', True)),
            include_config=cls.parse_bool(backup_data.get('include_config', True)),
            backup_compression=backup_data.get('backup_compression', 'gzip'),
            backup_location=backup_data.get('backup_location', '/var/lib/map2/backups'),
            backup_retention_count=cls.parse_int(backup_data.get('backup_retention_count'), 10),
            verify_after_backup=cls.parse_bool(backup_data.get('verify_after_backup', True)),
        )
        
        network_data = config_dict.get('network', {})
        network = NetworkConfig(
            topology_update_interval=cls.parse_int(network_data.get('topology_update_interval'), 60),
            topology_mesh_enabled=cls.parse_bool(network_data.get('topology_mesh_enabled', True)),
            latency_threshold_ms=cls.parse_int(network_data.get('latency_threshold_ms'), 100),
            latency_jitter_threshold_ms=cls.parse_int(network_data.get('latency_jitter_threshold_ms'), 50),
            packet_loss_threshold_percent=float(network_data.get('packet_loss_threshold_percent', 1.0)),
        )
        
        logging_data = config_dict.get('logging', {})
        logging_config = LoggingConfig(
            level=cls.parse_enum(logging_data.get('level', 'INFO'), LogLevel),
            format=logging_data.get('format', '%(asctime)s - %(name)s - %(levelname)s - %(message)s'),
            file_enabled=cls.parse_bool(logging_data.get('file_enabled', True)),
            file_path=logging_data.get('file_path', '/var/log/map2/cluster.log'),
            file_max_bytes=cls.parse_int(logging_data.get('file_max_bytes'), 104857600),
            file_backup_count=cls.parse_int(logging_data.get('file_backup_count'), 10),
            console_enabled=cls.parse_bool(logging_data.get('console_enabled', True)),
            syslog_enabled=cls.parse_bool(logging_data.get('syslog_enabled', True)),
        )
        
        security_data = config_dict.get('security', {})
        security = SecurityConfig(
            require_api_key=cls.parse_bool(security_data.get('require_api_key', True)),
            api_key_rotation_days=cls.parse_int(security_data.get('api_key_rotation_days'), 90),
            rbac_enabled=cls.parse_bool(security_data.get('rbac_enabled', True)),
            audit_logging_enabled=cls.parse_bool(security_data.get('audit_logging_enabled', True)),
            rate_limiting_enabled=cls.parse_bool(security_data.get('rate_limiting_enabled', True)),
            rate_limit_requests=cls.parse_int(security_data.get('rate_limit_requests'), 1000),
            rate_limit_window=cls.parse_int(security_data.get('rate_limit_window'), 60),
        )
        
        events_data = config_dict.get('events', {})
        events = EventConfig(
            event_logging_enabled=cls.parse_bool(events_data.get('event_logging_enabled', True)),
            event_retention_days=cls.parse_int(events_data.get('event_retention_days'), 7),
            log_node_events=cls.parse_bool(events_data.get('log_node_events', True)),
            log_update_events=cls.parse_bool(events_data.get('log_update_events', True)),
            log_config_events=cls.parse_bool(events_data.get('log_config_events', True)),
            log_health_events=cls.parse_bool(events_data.get('log_health_events', True)),
        )
        
        alerts_data = config_dict.get('alerts', {})
        alerts = AlertConfig(
            enabled=cls.parse_bool(alerts_data.get('enabled', True)),
            email_enabled=cls.parse_bool(alerts_data.get('email_enabled', False)),
            alert_on_node_down=cls.parse_bool(alerts_data.get('alert_on_node_down', True)),
            alert_on_low_health=cls.parse_bool(alerts_data.get('alert_on_low_health', True)),
            alert_on_update_failure=cls.parse_bool(alerts_data.get('alert_on_update_failure', True)),
        )
        
        performance_data = config_dict.get('performance', {})
        performance = PerformanceConfig(
            db_cache_size=cls.parse_int(performance_data.get('db_cache_size'), 10000),
            db_query_timeout=cls.parse_int(performance_data.get('db_query_timeout'), 30),
            max_memory_usage_mb=cls.parse_int(performance_data.get('max_memory_usage_mb'), 512),
            cache_enabled=cls.parse_bool(performance_data.get('cache_enabled', True)),
            cache_ttl=cls.parse_int(performance_data.get('cache_ttl'), 300),
        )
        
        audio_data = config_dict.get('audio', {})
        audio = AudioConfig(
            device_detection_enabled=cls.parse_bool(audio_data.get('device_detection_enabled', True)),
            collect_audio_metrics=cls.parse_bool(audio_data.get('collect_audio_metrics', True)),
            monitor_dsp_load=cls.parse_bool(audio_data.get('monitor_dsp_load', True)),
            monitor_xruns=cls.parse_bool(audio_data.get('monitor_xruns', True)),
            jack_enabled=cls.parse_bool(audio_data.get('jack_enabled', True)),
        )
        
        return ClusterConfigSchema(
            cluster=cluster,
            paths=paths,
            server=server,
            database=database,
            ssl=ssl,
            cluster_management=cluster_management,
            updates=updates,
            backup=backup,
            network=network,
            logging=logging_config,
            security=security,
            events=events,
            alerts=alerts,
            performance=performance,
            audio=audio,
        )


class ConfigManager:
    """Manages configuration loading, validation, and access."""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize configuration manager.
        
        Args:
            config_path: Path to INI or JSON config file
        """
        self.config_path = Path(config_path) if config_path else None
        self.schema: Optional[ClusterConfigSchema] = None
        
    def load(self) -> ClusterConfigSchema:
        """
        Load configuration from file and environment overrides.
        
        Returns:
            ClusterConfigSchema instance
        """
        # Load from file if provided
        config_dict = {}
        if self.config_path:
            if self.config_path.suffix == '.json':
                config_dict = ConfigLoader.load_json(self.config_path)
            else:  # Assume INI
                config_dict = ConfigLoader.load_ini(self.config_path)
        
        # Override with environment variables
        env_config = ConfigLoader.load_env()
        self._merge_config(config_dict, env_config)
        
        # Parse into schema
        self.schema = ConfigParser.parse_config(config_dict)
        logger.info("Configuration loaded successfully")
        
        return self.schema
    
    @staticmethod
    def _merge_config(base: Dict, override: Dict) -> None:
        """Merge override configuration into base."""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict):
                base[key].update(value)
            else:
                base[key] = value
    
    def get(self) -> ClusterConfigSchema:
        """Get loaded configuration."""
        if self.schema is None:
            return self.load()
        return self.schema
