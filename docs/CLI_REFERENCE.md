# MAP2 Cluster CLI - Command Reference

**Version:** 1.0  
**Tool:** map2-cluster-cli  
**Location:** `/usr/local/bin/map2-cluster-cli`

---

## Installation

### Install from Source

```bash
# Copy CLI script
sudo cp scripts/map2-cluster-cli.py /usr/local/bin/map2-cluster-cli
sudo chmod +x /usr/local/bin/map2-cluster-cli

# Install bash completion
sudo cp config/bash-completion/map2-cluster-cli /etc/bash_completion.d/
```

### Via Package Manager

```bash
# Fedora/RHEL
sudo dnf install map2-cluster-cli

# Ubuntu/Debian
sudo apt install map2-cluster-cli
```

---

## Configuration

### Environment Variables

```bash
# API endpoint (default: http://localhost:8080)
export MAP2_API_URL=https://mgmt-01.local:8443

# API authentication key
export MAP2_API_KEY=your-api-key-here

# Cluster name (optional)
export MAP2_CLUSTER_NAME=production
```

### Config File

Create `~/.map2/config.yaml`:

```yaml
api:
  url: https://mgmt-01.local:8443
  key: your-api-key-here
  timeout: 30

output:
  format: table  # table, json, yaml
  color: true
  verbose: false

cluster:
  name: production
```

---

## Global Options

```bash
-h, --help              Show help message
-v, --verbose           Verbose output
--format {table,json}   Output format (default: table)
--config FILE           Config file path
```

---

## Commands

### 1. Status Commands

#### Show Cluster Status

```bash
map2-cluster-cli status

# Output:
Cluster Name:      production-cluster
Version:           1.0.0
Health Score:      92%
Total Nodes:       5
Online Nodes:      4
Offline Nodes:     1
Uptime:            240 hours
Last Update:       2 hours ago
```

---

### 2. Node Management

#### List All Nodes

```bash
map2-cluster-cli nodes list

# Output:
ID           Hostname     Role               Status     Health  Uptime
audio-01     audio-01     AUDIO-NODE         online     95%     45 days
audio-02     audio-02     AUDIO-NODE         online     88%     30 days
audio-03     audio-03     AUDIO-NODE         online     92%     45 days
mgmt-01      mgmt-01      MANAGEMENT-NODE    online     98%     60 days
mgmt-02      mgmt-02      STANDBY            offline    0%      0 days
```

#### Get Node Details

```bash
map2-cluster-cli nodes info audio-01

# Output:
ID:                audio-01
Hostname:          audio-01.local
Role:              AUDIO-NODE
Status:            ONLINE

System Specs:
  CPU Cores:       8
  Memory:          32 GB
  Kernel:          6.6.8-200.fc39.x86_64

Current Usage:
  CPU Usage:       42.5%
  Memory Used:     16.5/32 GB (51.6%)
  Audio Devices:   3
  DSP Load:        72.3%
  Xruns:           2

Uptime:
  Days:            45
```

#### Reboot Node

```bash
# Interactive (with confirmation)
map2-cluster-cli nodes reboot audio-02
Reboot audio-02? (yes/no): yes
✓ Reboot initiated for audio-02

# Force reboot (skip confirmation)
map2-cluster-cli nodes reboot audio-02 --force
✓ Reboot initiated for audio-02
```

---

### 3. Update Management

#### Show Update Status

```bash
map2-cluster-cli update status

# Output:
Pending Updates:   2
In Progress:       0
Success Rate:      96.5%
Last Update:       2024-02-01T14:30:00Z
Next Scheduled:    2024-02-04T03:00:00Z

Nodes Pending Updates:
  - audio-02
  - mgmt-02
```

#### Schedule Updates

```bash
# Schedule for Sunday at 3 AM
map2-cluster-cli update schedule --day sunday --time 03:00
✓ Update scheduled successfully

# Options:
# --day (default: sunday)
#   - monday, tuesday, wednesday, thursday, friday, saturday, sunday
# --time (default: 03:00)
#   - HH:MM format
```

#### Execute Updates Immediately

```bash
# Interactive (with confirmation)
map2-cluster-cli update execute
Execute pending updates now? (yes/no): yes
ℹ Starting update process...
ℹ This may take several minutes
✓ Updates completed successfully

# Force without confirmation
map2-cluster-cli update execute --force
✓ Updates completed successfully
```

---

### 4. Backup Management

#### Show Backup Status

```bash
map2-cluster-cli backup status

# Output:
Latest Backup Size: 2.5 GB
Age:                6 hours
Last Backup:        2024-02-05T04:00:00Z
Successful:         180
Failed:             0
Retention:          30 days
```

#### Create Backup

```bash
map2-cluster-cli backup create
ℹ Creating backup...
✓ Backup created successfully (2.5 GB)
```

#### Restore Backup

```bash
# Interactive (with confirmation)
map2-cluster-cli backup restore
Restore from backup? (yes/no): yes
⚠ Restoring will overwrite current configuration
ℹ Restoring backup...
✓ Backup restored successfully

# Force restore without confirmation
map2-cluster-cli backup restore --force
✓ Backup restored successfully
```

---

### 5. Configuration Management

#### View Current Configuration

```bash
map2-cluster-cli config view

# Output (JSON format):
{
  "cluster": {
    "name": "production-cluster",
    "mode": "audio"
  },
  "server": {
    "port": 8080,
    "ssl_enabled": true
  },
  "updates": {
    "auto_update": true,
    "schedule_day": "sunday",
    "schedule_time": "03:00"
  }
}
```

#### Set Configuration Value

```bash
map2-cluster-cli config set cluster.name "my-cluster"
ℹ Setting cluster.name=my-cluster
✓ Configuration updated: cluster.name=my-cluster

# Common settings:
# cluster.name
# cluster.mode
# updates.auto_update
# updates.schedule_day
# updates.schedule_time
# server.port
# server.ssl_enabled
```

---

### 6. Event Viewing

#### View Recent Events

```bash
map2-cluster-cli events view

# Output:
Time                 Type                 Node         Message
2024-02-05 14:30:00  update.completed     audio-01     Update completed
2024-02-05 13:45:00  node.health          audio-02     Health score increased to 88%
2024-02-05 12:00:00  backup.completed     mgmt-01      Daily backup completed
2024-02-04 03:00:00  update.started       cluster      Fleet update started
```

#### View With Filters

```bash
# Show only 10 events
map2-cluster-cli events view --limit 10

# Filter by event type
map2-cluster-cli events view --type update.completed

# Available event types:
# - node.joined
# - node.left
# - node.health
# - node.reboot
# - update.started
# - update.completed
# - update.failed
# - backup.completed
# - backup.failed
# - failover.triggered
```

---

## Output Formats

### Table Format (Default)

```bash
map2-cluster-cli nodes list

ID           Hostname     Role
audio-01     audio-01     AUDIO-NODE
audio-02     audio-02     AUDIO-NODE
```

### JSON Format

```bash
map2-cluster-cli nodes list --format json

[
  {"id": "audio-01", "hostname": "audio-01", "role": "AUDIO-NODE"},
  {"id": "audio-02", "hostname": "audio-02", "role": "AUDIO-NODE"}
]
```

### YAML Format

```bash
map2-cluster-cli nodes list --format yaml

- id: audio-01
  hostname: audio-01
  role: AUDIO-NODE
- id: audio-02
  hostname: audio-02
  role: AUDIO-NODE
```

---

## Common Workflows

### Daily Health Check

```bash
# Quick status overview
map2-cluster-cli status

# Check all nodes
map2-cluster-cli nodes list

# Review recent events
map2-cluster-cli events view --limit 20

# Check backup status
map2-cluster-cli backup status
```

### Perform Updates

```bash
# Check pending updates
map2-cluster-cli update status

# Execute updates
map2-cluster-cli update execute

# Verify completion
map2-cluster-cli status

# Review update events
map2-cluster-cli events view --type update.completed --limit 5
```

### Troubleshoot Node Issue

```bash
# Get node details
map2-cluster-cli nodes info audio-02

# View recent events
map2-cluster-cli events view

# Reboot if necessary
map2-cluster-cli nodes reboot audio-02

# Verify recovery
map2-cluster-cli nodes list
```

### Disaster Recovery

```bash
# Create backup
map2-cluster-cli backup create

# List recent backups
map2-cluster-cli backup status

# Restore backup
map2-cluster-cli backup restore --force

# Verify restoration
map2-cluster-cli status
```

---

## SSH Remote Access

Use over SSH to manage remote cluster:

```bash
# SSH to management node
ssh user@mgmt-01.local

# Run commands directly
ssh user@mgmt-01.local map2-cluster-cli status
ssh user@mgmt-01.local map2-cluster-cli nodes list
ssh user@mgmt-01.local map2-cluster-cli update status

# Use in scripts
#!/bin/bash
MGMT_NODE="mgmt-01.local"
ssh $MGMT_NODE map2-cluster-cli status
ssh $MGMT_NODE map2-cluster-cli nodes list
ssh $MGMT_NODE map2-cluster-cli backup create
```

---

## Bash Completion

After installation, enable completion:

```bash
# Enable for current session
source /etc/bash_completion.d/map2-cluster-cli

# Enable permanently (add to ~/.bashrc)
echo "source /etc/bash_completion.d/map2-cluster-cli" >> ~/.bashrc

# Usage:
map2-cluster-cli [TAB][TAB]           # Show main commands
map2-cluster-cli nodes [TAB][TAB]     # Show node sub-commands
map2-cluster-cli nodes info [TAB][TAB] # Show available nodes
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | API connection error |
| 4 | Authentication failed |
| 5 | Operation timeout |

---

## Troubleshooting

### Connection Refused

```bash
# Check API URL
echo $MAP2_API_URL

# Test connectivity
curl -s http://localhost:8080/api/cluster/status

# Verify API is running
ssh mgmt-01.local "systemctl status map2-cluster-manager"
```

### Authentication Failed

```bash
# Check API key
echo $MAP2_API_KEY

# Generate new API key
ssh mgmt-01.local "map2-cluster-cli config set api.key <new-key>"
```

### Command Not Found

```bash
# Verify installation
which map2-cluster-cli

# Check Python path
python3 /usr/local/bin/map2-cluster-cli status

# Reinstall if needed
sudo cp scripts/map2-cluster-cli.py /usr/local/bin/map2-cluster-cli
sudo chmod +x /usr/local/bin/map2-cluster-cli
```

---

## Best Practices

1. **Always use confirmation prompts** for destructive operations (reboot, restore)
2. **Check status before updates** to ensure cluster health
3. **Create backups regularly** before major changes
4. **Monitor events** for early warning signs
5. **Use SSH completion** for faster command entry
6. **Backup configurations** before changes
7. **Log important operations** in a notebook

---

**CLI Implementation Complete** ✅

**Features:** 20+ commands across 6 categories  
**Format Support:** Table, JSON, YAML  
**Completion:** Full bash completion  
**SSH:** Remote access support
