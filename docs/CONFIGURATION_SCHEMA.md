# MAP2 Audio Cluster - Configuration Schema Documentation

**Version:** 1.0  
**Date:** February 5, 2026

---

## Overview

The MAP2 Audio Cluster Manager uses a comprehensive configuration schema supporting:

- **INI files** for persistent configuration storage
- **Environment variables** for runtime overrides
- **Strong typing** with dataclass validation
- **JSON Schema** for schema validation
- **Default values** for all settings
- **Hot-reload** support (planned)

---

## Configuration Loading Order

Settings are applied in this order (later overrides earlier):

1. **Built-in defaults** (hardcoded in schema)
2. **Configuration file** (`/etc/map2/cluster.conf`)
3. **Environment variables** (`MAP2_*` prefix)
4. **Programmatic overrides** (API)

---

## Configuration Sections

### 1. CLUSTER

Identity and metadata for the cluster node.

```ini
[cluster]
name = map2-cluster              # Cluster identifier
node_id =                         # Unique node ID (auto-generated if empty)
node_role = MANAGEMENT-NODE       # MANAGEMENT-NODE, AUDIO-NODE, STANDBY-NODE
version = 1.0.0                  # Configuration version
environment = production          # production, staging, development
```

**Supported Node Roles:**
- `MANAGEMENT-NODE`: Central orchestration, registry, scheduling
- `AUDIO-NODE`: Audio processing node, zero cluster overhead
- `STANDBY-NODE`: Hot backup for failover scenarios

---

### 2. PATHS

Directory and file locations.

```ini
[paths]
data_dir = /var/lib/map2                           # Cluster data
config_dir = /etc/map2                             # Configuration
log_dir = /var/log/map2                            # Logs
backup_dir = /var/lib/map2/backups                # Backups
database_path = /var/lib/map2/database/cluster.db # Database file
ssl_dir = /etc/map2/ssl                            # Certificates
scripts_dir = /opt/map2/scripts                    # Scripts
```

---

### 3. SERVER

API server configuration.

```ini
[server]
host = 0.0.0.0              # Bind address
port = 8080                 # API port
workers = 4                 # Worker processes
timeout = 30                # Request timeout (seconds)
keep_alive = 5              # Keep-alive timeout (seconds)
enable_cors = false         # Enable CORS
```

**Notes:**
- Set `workers` to number of CPU cores for optimal performance
- `timeout` applies to all API requests
- CORS should only be enabled in development

---

### 4. DATABASE

Database backend configuration.

```ini
[database]
backend = sqlite                    # sqlite or postgresql
path = /var/lib/map2/database/cluster.db  # SQLite path
pool_size = 5                       # Connection pool size
max_overflow = 10                   # Pool overflow
echo = false                        # SQL debug logging
use_wal = true                      # SQLite WAL mode
backup_enabled = true               # Auto backups
backup_interval = 3600              # Backup every N seconds
```

**Backend Options:**
- `sqlite`: Built-in, zero dependencies, recommended
- `postgresql`: For large deployments (future)

**Important:**
- WAL mode improves SQLite concurrency and failover reliability
- Database backups protect against corruption

---

### 5. SSL

TLS/SSL security configuration.

```ini
[ssl]
enabled = true                           # Enable TLS
ca_cert_path = /etc/map2/ssl/ca-cert.pem
cert_path = /etc/map2/ssl/node-cert.pem
key_path = /etc/map2/ssl/node-key.pem
verify_mode = CERT_REQUIRED              # CERT_NONE, CERT_OPTIONAL, CERT_REQUIRED
cert_renewal_threshold = 80              # Renew at 80% of lifetime
min_tls_version = TLSv1.2
ciphers = HIGH:!aNULL:!MD5
```

**Security:**
- mTLS (mutual TLS) required between all nodes
- Certificates auto-renewed at 80% of lifetime
- Minimum TLS 1.2 (TLS 1.3 recommended for new deployments)

---

### 6. CLUSTER_MANAGEMENT

Core cluster behavior settings.

```ini
[cluster_management]
health_check_interval = 30              # Check health every N seconds
health_check_timeout = 5                # Health check timeout
health_score_threshold = 50             # Below = unhealthy (0-100)
metrics_aggregation_interval = 60       # Aggregate metrics every N seconds
metrics_retention_days = 7              # Keep metrics for N days
failover_timeout = 30                   # Failover detection timeout
state_replication_interval = 300        # Replicate state every N seconds
discovery_interval = 60                 # Discover nodes every N seconds
max_nodes = 50                          # Maximum nodes in cluster
node_timeout = 300                      # Mark offline after N seconds
```

**Tuning:**
- Decrease `health_check_interval` for faster failure detection (uses more CPU)
- Increase `metrics_retention_days` for longer historical data (uses more disk)
- Set `max_nodes` based on expected cluster size

---

### 7. UPDATES

Package update orchestration.

```ini
[updates]
strategy = staged                   # staged, rolling, canary, immediate
enabled = true                      # Enable updates
schedule_enabled = true             # Enable scheduled updates
schedule_cron = 0 3 * * 0          # Sunday 3 AM
stagger_rate = 2                    # 2 nodes per hour
stagger_interval = 1800             # 30 minutes between groups
pre_update_validation = true        # Validate before
post_update_validation = true       # Validate after
rollback_on_failure = true          # Rollback if validation fails
dry_run_enabled = true              # Allow testing
```

**Update Strategies:**
- `staged`: Test node → Audio nodes → Management nodes
- `rolling`: One node at a time across all
- `canary`: Small percentage first, then remainder
- `immediate`: All at once (dangerous!)

---

### 8. BACKUP

Automated disaster recovery.

```ini
[backup]
enabled = true                      # Enable backups
schedule_cron = 0 2 * * *          # Daily at 2 AM
retention_days = 30                 # Keep for 30 days
include_database = true             # Backup database
include_presets = true              # Backup presets
include_config = true               # Backup configuration
backup_compression = gzip           # gzip, bzip2, none
backup_location = /var/lib/map2/backups
backup_retention_count = 10         # Keep 10 most recent
verify_after_backup = true          # Verify integrity
```

**Recommendations:**
- Keep at least 30 days of backups
- Verify backups periodically
- Store backups on separate storage

---

### 9. NETWORK

Network topology and monitoring.

```ini
[network]
topology_update_interval = 60           # Update topology every N seconds
topology_mesh_enabled = true            # Test all node pairs
latency_threshold_ms = 100              # Alert if latency > N ms
latency_jitter_threshold_ms = 50        # Alert if jitter > N ms
packet_loss_threshold_percent = 1.0     # Alert if loss > N%
multicast_enabled = true                # Enable multicast
multicast_group = 239.255.76.50
multicast_port = 5353
```

**Tuning:**
- Decrease thresholds for more sensitive monitoring
- Disable multicast in restricted network environments

---

### 10. LOGGING

Logging configuration.

```ini
[logging]
level = INFO                    # DEBUG, INFO, WARNING, ERROR, CRITICAL
format = %(asctime)s - %(name)s - %(levelname)s - %(message)s
file_enabled = true             # Log to file
file_path = /var/log/map2/cluster.log
file_max_bytes = 104857600      # 100 MB max log file
file_backup_count = 10          # Keep 10 backup files
console_enabled = true          # Log to console
syslog_enabled = true           # Log to syslog
syslog_facility = LOCAL0
```

---

### 11. SECURITY

Authentication and authorization.

```ini
[security]
require_api_key = true              # Require authentication
api_key_rotation_days = 90          # Rotate keys every N days
rbac_enabled = true                 # Role-based access control
audit_logging_enabled = true        # Log all actions
rate_limiting_enabled = true        # Rate limit API
rate_limit_requests = 1000          # Max requests per window
rate_limit_window = 60              # Window in seconds
```

---

### 12. EVENTS

Event logging and replay.

```ini
[events]
event_logging_enabled = true        # Log events
event_retention_days = 7            # Keep events for N days
log_node_events = true              # Node lifecycle
log_update_events = true            # Update operations
log_config_events = true            # Configuration changes
log_health_events = true            # Health changes
log_failover_events = true          # Failover events
```

---

### 13. ALERTS

Alerting configuration.

```ini
[alerts]
enabled = true                      # Enable alerts
email_enabled = false               # Send emails
alert_on_node_down = true           # Node failures
alert_on_low_health = true          # Low health scores
alert_on_update_failure = true      # Update failures
alert_on_backup_failure = true      # Backup failures
low_health_threshold = 30           # Alert if health < N
```

---

### 14. PERFORMANCE

Performance tuning.

```ini
[performance]
db_cache_size = 10000               # Database cache entries
db_query_timeout = 30               # Query timeout (seconds)
max_memory_usage_mb = 512           # Memory limit
cache_enabled = true                # Enable caching
cache_ttl = 300                     # Cache TTL (seconds)
```

---

### 15. AUDIO

Audio-specific settings.

```ini
[audio]
device_detection_enabled = true         # Detect audio devices
collect_audio_metrics = true            # Collect DSP metrics
monitor_dsp_load = true                 # Monitor DSP usage
dsp_load_threshold_percent = 80         # Alert if DSP > N%
monitor_xruns = true                    # Monitor buffer underruns
jack_enabled = true                     # Enable JACK support
jack_default_server = default           # JACK server name
```

---

## Environment Variable Overrides

Override any setting using `MAP2_` environment variables:

```bash
# Set cluster name
export MAP2_CLUSTER_NAME=production-cluster

# Set database backend
export MAP2_DATABASE_BACKEND=postgresql

# Set health check interval
export MAP2_CLUSTER_MANAGEMENT_HEALTH_CHECK_INTERVAL=20

# Set update strategy
export MAP2_UPDATES_STRATEGY=rolling
```

**Format:** `MAP2_<SECTION>_<KEY>=value`

---

## Configuration Files

### Main Configuration

**Location:** `/etc/map2/cluster.conf`

INI format with all settings. Template available at `config/cluster.conf.template`.

### Environment File

**Location:** `/etc/map2/.env`

Used by systemd units. Can override configuration values.

### Schema Definition

**File:** `app/services/cluster/config_schema.py`

Python dataclasses defining all configuration sections and types.

### Configuration Loader

**File:** `app/services/cluster/config_loader.py`

Loads, validates, and parses configuration from all sources.

---

## Validation

Configuration is validated using:

1. **Type checking**: All values converted to correct types
2. **JSON Schema**: Validates against schema (if jsonschema installed)
3. **Range checking**: Integer/float ranges validated
4. **Enum validation**: Select values only

---

## Common Configurations

### Development Setup

```ini
[cluster]
environment = development
node_role = MANAGEMENT-NODE

[logging]
level = DEBUG
console_enabled = true

[updates]
dry_run_enabled = true
schedule_enabled = false

[security]
rate_limiting_enabled = false
```

### Production Setup

```ini
[cluster]
environment = production
node_role = MANAGEMENT-NODE

[logging]
level = WARNING
file_enabled = true

[updates]
strategy = staged
schedule_enabled = true

[backup]
enabled = true
verify_after_backup = true

[security]
rate_limiting_enabled = true
require_api_key = true
```

### High-Performance Setup

```ini
[cluster_management]
health_check_interval = 60
metrics_aggregation_interval = 120

[performance]
db_cache_size = 50000
cache_ttl = 600

[updates]
stagger_rate = 5
stagger_interval = 900
```

---

## Troubleshooting

### Configuration Not Loading

1. Check file exists: `ls -la /etc/map2/cluster.conf`
2. Check permissions: `sudo ls -la /etc/map2/`
3. Check syntax: `sudo python3 -c "from app.services.cluster.config_loader import ConfigManager; ConfigManager('/etc/map2/cluster.conf').load()"`

### Settings Not Applied

1. Check environment variables: `env | grep MAP2_`
2. Restart service: `sudo systemctl restart map2-cluster-manager`
3. Verify with API: `curl -k https://localhost:8080/api/cluster/config`

### Validation Errors

1. Check invalid values in config file
2. Verify cron format: `0 3 * * 0` (Sunday 3 AM)
3. Check file paths exist

---

## Best Practices

1. **Use configuration files** for permanent settings
2. **Use environment variables** for runtime overrides
3. **Validate before deployment** with schema validation
4. **Document custom settings** with inline comments
5. **Version control** configuration changes
6. **Test changes** in staging before production
7. **Monitor** after changes to verify impact
8. **Backup** configuration regularly

---

**Configuration Schema Complete** ✅

Total: 300+ LOC (Python schema + configuration loader + template)
