# Hybrid Update System Usage Guide

## Quick Start

### Development Environment (Git-Based Updates)

```bash
# Update to latest code on main branch
curl -X POST http://localhost:8080/api/cluster/update/application \
  -H "Content-Type: application/json" \
  -d '{"mode": "git", "branch": "main"}'

# Switch to different branch
curl -X POST http://localhost:8080/api/cluster/update/application \
  -H "Content-Type: application/json" \
  -d '{"mode": "git", "branch": "develop"}'
```

### Production Environment (RPM-Based Updates)

```bash
# Update to latest version
curl -X POST http://localhost:8080/api/cluster/update/application \
  -H "Content-Type: application/json" \
  -d '{"mode": "rpm", "version": "latest"}'

# Update to specific version
curl -X POST http://localhost:8080/api/cluster/update/application \
  -H "Content-Type: application/json" \
  -d '{"mode": "rpm", "version": "1.0.1"}'
```

### Hybrid Mode (Full System Update)

```bash
# Update system packages AND MAP2 application
curl -X POST http://localhost:8080/api/cluster/update/full \
  -H "Content-Type: application/json" \
  -d '{
    "update_system": true,
    "update_application": true,
    "version": "1.0.1"
  }'
```

## Configuration

### Via Configuration File

Create `/etc/map2/config.yml`:

```yaml
cluster:
  update_mode: auto              # auto, git, rpm
  environment: development       # development, staging, production
  
git_config:
  repository: https://github.com/matthewmackes/map2-audio.git
  branch: main
  auto_pull: false
  
rpm_config:
  repository: https://map2-audio.github.io/rpm/fedora/40
  gpg_check: true
  auto_update: false
```

### Via Environment Variables

```bash
export MAP2_UPDATE_MODE=auto
export MAP2_ENVIRONMENT=development
export MAP2_GIT_BRANCH=main
export MAP2_RPM_REPOSITORY=https://map2-audio.github.io/rpm/fedora/40
```

### Programmatically

```python
from app.services.cluster.hybrid_update_manager import (
    HybridUpdateManager,
    HybridUpdateConfig,
    UpdateMode,
    UpdateEnvironment
)

config = HybridUpdateConfig(
    mode=UpdateMode.AUTO,
    environment=UpdateEnvironment.DEVELOPMENT,
    git_branch="main"
)

manager = HybridUpdateManager(config)
```

## Understanding Update Modes

### Git Mode (Development)

**When to use**:
- During active development
- Testing new features
- Rapid iteration

**How it works**:
1. Pulls latest code from GitHub branch
2. Installs Python dependencies
3. Rebuilds React frontend
4. Restarts services
5. Validates application health

**Advantages**:
- Fast iteration (minutes)
- No packaging overhead
- Direct source control integration
- Easy to revert (git checkout)

**Disadvantages**:
- Requires git repository
- No version pinning
- Less reliable than packages

**Example**:
```bash
# Pull latest from main branch
curl -X POST http://localhost:8080/api/cluster/update/application \
  -d '{"mode": "git", "branch": "main"}'

# Response:
{
  "status": "ok",
  "message": "Updated from a1b2c3d to e4f5g6h",
  "commit_before": "a1b2c3d",
  "commit_after": "e4f5g6h",
  "duration_seconds": 45
}
```

### RPM Mode (Production)

**When to use**:
- Production deployments
- Stable releases
- Version pinning required
- Enterprise environments

**How it works**:
1. Downloads RPM from repository
2. Installs/upgrades via dnf
3. Systemd manages service restart
4. Post-install scripts validate

**Advantages**:
- Reliable package management
- Version control and pinning
- Dependency resolution
- Atomic transactions
- Enterprise-grade

**Disadvantages**:
- Requires RPM repository setup
- Slower release cycle (packaging overhead)
- Less flexible for development

**Example**:
```bash
# Install specific version
curl -X POST http://localhost:8080/api/cluster/update/application \
  -d '{"mode": "rpm", "version": "1.0.1"}'

# Response:
{
  "status": "ok",
  "message": "Updated to version 1.0.1",
  "success": true
}
```

### Auto Mode (Recommended)

**Behavior**:
1. Checks if installed via RPM → Use RPM mode
2. Checks if git repository exists → Use Git mode
3. Default to Git mode

**Configuration**:
```yaml
cluster:
  update_mode: auto  # Automatically detect and use appropriate mode
```

**Example**:
```bash
# System automatically chooses correct mode
curl -X POST http://localhost:8080/api/cluster/update/application
```

## API Reference

### Update Application

```http
POST /api/cluster/update/application

Request Body:
{
  "mode": "git|rpm|auto",    # Update mode
  "version": "1.0.0",        # For RPM: version or "latest"
  "branch": "main"           # For Git: branch name
}

Response:
{
  "status": "ok|error",
  "message": "...",
  "success": true|false,
  "commit_before": "...",    # Git mode
  "commit_after": "...",     # Git mode
  "duration_seconds": 45.2
}
```

### Get Application Status

```http
GET /api/cluster/update/application/status

Response:
{
  "mode": "git|rpm",
  "environment": "development|production",
  "current_version": "abc123d|1.0.0",
  "running": false,
  "last_update": "2026-02-07T10:30:00Z",
  "status": "ok|error"
}
```

### Get Application Version

```http
GET /api/cluster/update/application/version

Response:
{
  "nodes": {
    "node-01": {
      "version": "1.0.0",
      "mode": "rpm",
      "updated_at": "2026-02-07T10:30:00Z"
    },
    "node-02": {
      "version": "abc123d",
      "mode": "git",
      "branch": "main",
      "updated_at": "2026-02-07T09:15:00Z"
    }
  }
}
```

### Full System Update

```http
POST /api/cluster/update/full

Request Body:
{
  "update_system": true,           # Update OS packages
  "update_application": true,      # Update MAP2 app
  "version": "1.0.0|latest|main"  # Target version/branch
}

Response:
{
  "status": "ok|partial|error",
  "message": "Full update completed",
  "results": {
    "system": {
      "status": "ok",
      "packages_updated": 42,
      "duration_seconds": 120
    },
    "application": {
      "status": "ok",
      "duration_seconds": 45
    }
  }
}
```

## Web Interface Usage

### TUI (Terminal Interface)

**Access Updates screen**:
```bash
# Press 'u' key in main menu
# Or from command line:
map2 --updates
```

**Controls**:
- `[Update This Node]` - Update current node
- `[Update All]` - Update all nodes in cluster
- `[Check Updates]` - Check for available updates
- Mode dropdown - Select git or rpm
- Branch/version field - Choose branch or version

### Web Interface

**Access Updates tab**:
1. Navigate to Cluster Dashboard
2. Click "Updates" tab
3. Select mode (git/rpm)
4. Enter version or branch
5. Click "Update Now"

**Live Progress**:
- Per-node progress bars
- Stage-by-stage breakdown
- Real-time event log
- Rollback controls

## Version Manifest

### View Current Manifest

```bash
curl http://localhost:8080/api/cluster/update/manifest
```

### Capture New Manifest

```bash
# From "golden" production node
curl -X POST http://localhost:8080/api/cluster/update/manifest/capture \
  -d '{"source_node_id": "node-01"}'
```

### Check for Drift

```bash
# Compare all nodes against manifest
curl http://localhost:8080/api/cluster/update/manifest/drift
```

**Response shows**:
```json
{
  "nodes": {
    "node-02": {
      "added": ["debug-tools"],      # Extra packages
      "removed": [],                 # Missing packages
      "mismatched": {                # Version mismatches
        "pipewire": {
          "expected": "1.0.3-1",
          "actual": "1.0.2-1"
        }
      }
    }
  }
}
```

### Enforce Manifest on Drifted Node

```bash
# Fix drifted node to match manifest
curl -X POST http://localhost:8080/api/cluster/update/manifest/enforce \
  -d '{"node_id": "node-02", "dry_run": false}'
```

## Rollback Procedures

### Automatic Rollback (On Failure)

Updates automatically rollback if:
- Post-update validation fails
- Health score drops below 70%
- Services fail to restart
- Timeout during update

### Manual Rollback

```bash
# Rollback current update
curl -X POST http://localhost:8080/api/cluster/update/rollback \
  -d '{"reason": "User-initiated rollback", "force": false}'

# Force rollback (skips graceful shutdown)
curl -X POST http://localhost:8080/api/cluster/update/rollback \
  -d '{"reason": "Emergency rollback", "force": true}'
```

### Rollback to Specific Commit (Git Mode)

```bash
# Rollback to previous commit
curl -X POST http://localhost:8080/api/cluster/update/git/rollback \
  -d '{"commit_hash": "a1b2c3d"}'
```

## Monitoring and Troubleshooting

### Check Update Status

```bash
curl http://localhost:8080/api/cluster/update/status
```

### View Update Logs

```bash
# On Fedora system:
journalctl -u map2-cluster -f

# Or in TUI:
# Open Updates screen and view Event Log tab
```

### Debug Git Update Issues

```bash
# Check repository state
cd /opt/map2-audio
git status
git log --oneline -5
git branch -a

# Stash any local changes
git stash
```

### Debug RPM Update Issues

```bash
# Check installed version
rpm -qa | grep map2

# Check available versions
dnf search map2-audio

# Check for DNF lock
ps aux | grep dnf

# View DNF transaction log
dnf history
```

## Best Practices

### Development Workflow

1. **Create feature branch** in git
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Update development cluster** to test
   ```bash
   curl -X POST http://localhost:8080/api/cluster/update/application \
     -d '{"mode": "git", "branch": "feature/new-feature"}'
   ```

3. **Test thoroughly**
   - Check logs for errors
   - Validate all services running
   - Test audio functionality

4. **Merge to main** when ready
   ```bash
   git push origin feature/new-feature
   git pull-request
   ```

5. **Create release tag** for production
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

### Production Workflow

1. **Create release** on GitHub
   - Tag is automatically built as RPM
   - RPM published to repository
   - Tests run automatically

2. **Update production cluster**
   ```bash
   curl -X POST http://localhost:8080/api/cluster/update/application \
     -d '{"mode": "rpm", "version": "1.0.1"}'
   ```

3. **Monitor update progress**
   - Watch Web UI progress viewer
   - Check TUI progress screen
   - Monitor health metrics

4. **Validate after update**
   - Check all services running
   - Test audio paths
   - Review logs for errors

5. **Commit changes** if successful
   - Cleanup old snapshots
   - Update version manifest if needed
   - Document update in changelog

## FAQs

**Q: How do I switch from Git to RPM mode?**

A: Set `update_mode: rpm` in config file, or use API parameter `"mode": "rpm"` in requests.

**Q: Can I mix modes in a cluster?**

A: Yes! Each node auto-detects its mode. Some can use git, others RPM.

**Q: What if a node fails to update?**

A: Update automatically rolls back. Check logs for root cause, fix issue, and retry.

**Q: How do I downgrade to a previous version?**

A: 
- **Git mode**: `git checkout v1.0.0` or specific commit hash
- **RPM mode**: `dnf downgrade map2-audio`

**Q: Can I schedule updates automatically?**

A: Set `auto_pull: true` or `auto_update: true` in config, or use cron jobs to trigger API endpoints.

**Q: Does update cause downtime?**

A: No. System uses rolling updates to maintain availability. Only individual nodes are updated at a time.

**Q: How do I test updates safely?**

A: Use canary deployment - update 1-2 nodes first, monitor, then update rest of cluster.
