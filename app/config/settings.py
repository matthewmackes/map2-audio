# MAP2 Audio LCD Event System Configuration
# Complete configuration for all 10 improvements

import os
from pathlib import Path
from typing import Dict, Any
import json

class Configuration:
    """System-wide configuration management"""
    
    def __init__(self):
        self.base_path = Path(__file__).parent.parent
        self.db_path = self.base_path / 'app.db'
        self.log_path = self.base_path / 'logs'
        self.config_path = self.base_path / 'config'
        
        # Ensure directories exist
        self.log_path.mkdir(exist_ok=True)
        self.config_path.mkdir(exist_ok=True)
        
        self.config = self._load_defaults()
    
    def _load_defaults(self) -> Dict[str, Any]:
        """Load default configuration"""
        return {
            # ================================================================
            # IMPROVEMENT 1: INTELLIGENT ALERT PRIORITIZATION
            # ================================================================
            'prioritizer': {
                'enabled': True,
                'severity_weights': {
                    'INFO': 0.2,
                    'WARNING': 0.6,
                    'ERROR': 0.8,
                    'CRITICAL': 1.0
                },
                'max_escalation': 2.0,
                'escalation_increment': 0.1,
                'min_escalation_count': 3,
                'escalation_window': 60,
                'enable_suppression': True,
                'duplicate_window': 30,
                'min_suppression': 0.3,
                'context_weights': {
                    'normal': 1.0,
                    'high_load': 0.8,
                    'recording': 1.5,
                    'idle': 0.5
                }
            },
            
            # ================================================================
            # IMPROVEMENT 2: CONTEXTUAL ROUTING BY NODE ROLE
            # ================================================================
            'router': {
                'enabled': True,
                'default_subscriptions': {
                    'AUDIO-NODE': {
                        'AUDIO': {'priority': 1.0, 'show_all': True},
                        'SYSTEM': {'priority': 0.8, 'show_all': False},
                        'NETWORK': {'priority': 0.6, 'show_all': False},
                    },
                    'CONTROL-NODE': {
                        'AUDIO': {'priority': 0.7, 'show_all': False},
                        'SYSTEM': {'priority': 1.0, 'show_all': True},
                        'NETWORK': {'priority': 0.9, 'show_all': True},
                    }
                }
            },
            
            # ================================================================
            # IMPROVEMENT 3: SMART ALERT GROUPING
            # ================================================================
            'grouper': {
                'enabled': True,
                'window_seconds': 60,
                'min_events': 2,
                'group_by_type': True,
                'group_by_severity': True,
                'group_by_node': True,
                'max_group_age': 300
            },
            
            # ================================================================
            # IMPROVEMENT 4: INTERACTIVE ACKNOWLEDGMENT & REMEDIATION
            # ================================================================
            'acknowledgment': {
                'enabled': True,
                'temporary_duration': 300,
                'suppression_duration': 1800,
                'auto_reactivate': True,
                'reactivate_threshold': 5,
                'reactivate_window': 60,
                'allow_user_notes': True,
                'remediation_suggestions': True
            },
            
            # ================================================================
            # IMPROVEMENT 5: CORRELATION & ROOT CAUSE ANALYSIS
            # ================================================================
            'correlation': {
                'enabled': True,
                'temporal_window': 5,
                'causal_window': 10,
                'min_confidence': 0.6,
                'enable_pattern_matching': True,
                'enable_chain_detection': True,
                'max_chain_length': 10
            },
            
            # ================================================================
            # IMPROVEMENT 6: CUSTOMIZABLE RULES ENGINE
            # ================================================================
            'rules': {
                'enabled': True,
                'rule_priority_levels': 100,
                'max_conditions_per_rule': 10,
                'max_actions_per_rule': 5,
                'rule_execution_timeout': 5,
                'enable_rule_logging': True,
                'enable_audit_trail': True
            },
            
            # ================================================================
            # IMPROVEMENT 7: HISTORICAL ANALYTICS & TRENDING
            # ================================================================
            'analytics': {
                'enabled': True,
                'retention_days': 90,
                'bucket_size': 'hour',
                'calculate_stability_scores': True,
                'detect_trends': True,
                'trend_window_days': 7,
                'confidence_threshold': 0.6,
                'insight_generation': True
            },
            
            # ================================================================
            # IMPROVEMENT 8: SMART DISMISSAL WITH AUTO-REACTIVATION
            # ================================================================
            'dismissal': {
                'enabled': True,
                'auto_reactivate': True,
                'temp_duration': 300,
                'suppress_duration': 1800,
                'repetition_threshold': 5,
                'escalation_reactivate': True,
                'max_dismissals_tracked': 10000
            },
            
            # ================================================================
            # IMPROVEMENT 9: CONTEXTUAL DISPLAY WITH HEALTH STATS
            # ================================================================
            'context': {
                'enabled': True,
                'track_cpu': True,
                'track_memory': True,
                'track_disk': True,
                'track_temperature': True,
                'track_network_latency': True,
                'track_service_status': True,
                'track_recording_state': True,
                'context_update_interval': 5,
                'context_retention_seconds': 3600
            },
            
            # ================================================================
            # IMPROVEMENT 10: PATTERN DETECTION & RECOMMENDATIONS
            # ================================================================
            'patterns': {
                'enabled': True,
                'min_occurrences': 3,
                'pattern_strength_threshold': 0.5,
                'detect_hourly_patterns': True,
                'detect_daily_patterns': True,
                'detect_weekly_patterns': True,
                'enable_recommendations': True,
                'max_patterns_tracked': 1000
            },
            
            # ================================================================
            # DATABASE CONFIGURATION
            # ================================================================
            'database': {
                'path': str(self.db_path),
                'timeout': 30,
                'journal_mode': 'WAL',
                'synchronous': 'NORMAL',
                'cache_size': 2000,
                'enable_foreign_keys': True,
                'enable_triggers': True
            },
            
            # ================================================================
            # LOGGING CONFIGURATION
            # ================================================================
            'logging': {
                'level': 'INFO',
                'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                'file_path': str(self.log_path / 'lcd_system.log'),
                'max_bytes': 10485760,  # 10MB
                'backup_count': 5,
                'console_output': True
            },
            
            # ================================================================
            # API CONFIGURATION
            # ================================================================
            'api': {
                'enabled': True,
                'host': '0.0.0.0',
                'port': 5000,
                'debug': False,
                'enable_cors': True,
                'max_request_size': 1048576,  # 1MB
                'request_timeout': 30
            },
            
            # ================================================================
            # TUI CONFIGURATION
            # ================================================================
            'tui': {
                'enabled': True,
                'theme': 'dark',
                'refresh_rate': 1,
                'lcd_width': 16,
                'lcd_height': 2,
                'enable_animations': True,
                'keyboard_shortcuts': True
            },
            
            # ================================================================
            # SYSTEM CONFIGURATION
            # ================================================================
            'system': {
                'max_event_history': 10000,
                'max_correlation_history': 1000,
                'enable_audit_logging': True,
                'cleanup_interval': 3600,
                'gc_collection_interval': 300
            },

            # ================================================================
            # PLATFORM EVENT CONTROL-PLANE
            # ================================================================
            'platform_event': {
                'enabled': False,
                'direct_wave1': False,
                'direct_wave2': False,
                'direct_wave3': False,
                'db_path': '/var/lib/map2/platform-events.db',
                'legacy_db_path': '/var/lib/map2/cluster-events.db',
                'retention_days': 7,
                'session_replay_limit': 1000,
                'websocket_topic_history_limit': 200,
            }
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
        
        return value if value is not None else default
    
    def set(self, key: str, value: Any):
        """Set configuration value"""
        keys = key.split('.')
        config = self.config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def save_to_file(self, filename: str = 'config.json'):
        """Save configuration to file"""
        filepath = self.config_path / filename
        with open(filepath, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def load_from_file(self, filename: str = 'config.json'):
        """Load configuration from file"""
        filepath = self.config_path / filename
        if filepath.exists():
            with open(filepath, 'r') as f:
                self.config = json.load(f)
    
    def get_section(self, section: str) -> Dict[str, Any]:
        """Get entire configuration section"""
        return self.config.get(section, {})


# Global configuration instance
config = Configuration()


def _flag(name: str, *, env_var: str) -> bool:
    raw = os.getenv(env_var)
    if raw is not None:
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    return bool(config.get(name, False))


PLATFORM_EVENT_BUS_ENABLED = _flag("platform_event.enabled", env_var="PLATFORM_EVENT_BUS_ENABLED")
PLATFORM_EVENT_DIRECT_WAVE1 = _flag("platform_event.direct_wave1", env_var="PLATFORM_EVENT_DIRECT_WAVE1")
PLATFORM_EVENT_DIRECT_WAVE2 = _flag("platform_event.direct_wave2", env_var="PLATFORM_EVENT_DIRECT_WAVE2")
PLATFORM_EVENT_DIRECT_WAVE3 = _flag("platform_event.direct_wave3", env_var="PLATFORM_EVENT_DIRECT_WAVE3")
