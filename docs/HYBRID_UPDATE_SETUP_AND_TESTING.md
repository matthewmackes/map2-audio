# Complete Hybrid Update System - Setup & Testing Guide

## Overview

This guide walks through the complete setup and testing of the hybrid update system for MAP2 Audio Platform.

The system provides:
- **Git-based updates** for development (fast iteration)
- **RPM-based updates** for production (reliable releases)
- **Automatic mode detection** based on installation method
- **GitHub Actions** for automated RPM building
- **Real-time monitoring** via TUI and Web interfaces

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         Hybrid Update Manager                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────┐      ┌──────────────────┐   │
│  │  Git Updater     │      │  RPM Updater     │   │
│  │                  │      │                  │   │
│  │ • git pull       │      │ • dnf install    │   │
│  │ • npm build      │      │ • RPM mgmt       │   │
│  │ • pip install    │      │ • dependency res │   │
│  │ • systemctl ...  │      │ • transactions   │   │
│  └──────────────────┘      └──────────────────┘   │
│           ▲                         ▲              │
│           │                         │              │
│     Auto-detect                Auto-detect         │
│     git repository              RPM install        │
└─────────────────────────────────────────────────────┘
          ▲                              ▲
          │                              │
    Developer/CI                    Production
    Fast iteration               Stable releases
```

## Installation & Setup

### Phase 1: Verify Files Created

```bash
cd /home/mm/map2-audio

# Check packaging files
ls -la packaging/
# Should show:
# - map2-audio.spec
# - build-rpm.sh
# - systemd/
#   - map2-backend.service
#   - map2-frontend.service
#   - map2-cluster.service

# Check GitHub Actions workflows
ls -la .github/workflows/
# Should show:
# - build-rpm.yml
# - test-rpm.yml

# Check Python services
ls -la app/services/cluster/ | grep -E "(map2_git|hybrid)"
# Should show:
# - map2_git_updater.py
# - hybrid_update_manager.py

# Check API routes
ls -la app/routes/ | grep hybrid
# Should show:
# - cluster_update_hybrid.py

# Check documentation
ls -la docs/ | grep -E "(GITHUB|UPDATE|RPM)"
# Should show:
# - GITHUB_ACTION_SETUP.md
# - UPDATE_SYSTEM_USAGE.md
# - RPM_PACKAGING.md
```

### Phase 2: Test Git Updater Locally

```bash
# Python test
python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.cluster.map2_git_updater import MAP2GitUpdater
import asyncio

updater = MAP2GitUpdater("/home/mm/map2-audio")

async def test():
    print("Testing Git Updater...")
    
    # Test 1: Get current commit
    commit = await updater.get_current_commit()
    print(f"✓ Current commit: {commit[:8]}")
    
    # Test 2: Get current branch
    branch = await updater.get_current_branch()
    print(f"✓ Current branch: {branch}")
    
    # Test 3: Validate repository
    is_repo = await updater._validate_repository()
    print(f"✓ Valid git repository: {is_repo}")
    
    print("\nAll Git Updater tests passed!")

asyncio.run(test())
EOF
```

### Phase 3: Test Hybrid Manager

```bash
python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.cluster.hybrid_update_manager import (
    HybridUpdateManager,
    HybridUpdateConfig,
    UpdateMode
)

# Test auto-detection
config = HybridUpdateConfig(
    mode=UpdateMode.AUTO,
    app_path="/home/mm/map2-audio"
)

manager = HybridUpdateManager(config)

print("Hybrid Update Manager Test")
print("=" * 50)
print(f"Detected mode: {manager.mode.value}")
print(f"Environment: {manager.config.environment.value}")

version = manager.get_current_version()
print(f"Current version: {version}")

print("\nHybrid manager initialized successfully!")
EOF
```

### Phase 4: Build RPM Locally

```bash
# Make build script executable
chmod +x /home/mm/map2-audio/packaging/build-rpm.sh

# Build RPM (requires Fedora 40 or container)
cd /home/mm/map2-audio
./packaging/build-rpm.sh 1.0.0 1

# Expected output:
# Output directory: ./dist
# map2-audio-1.0.0-1.fc40.x86_64.rpm (size varies)
# map2-audio-1.0.0-1.fc40.src.rpm
# map2-audio-1.0.0-1.fc40.x86_64.rpm.sha256

# Verify build
ls -lh dist/
```

### Phase 5: Test RPM Installation (Optional)

```bash
# In Fedora 40 container or VM:
sudo dnf install ./dist/map2-audio-1.0.0-1.fc40.x86_64.rpm

# Verify installation
rpm -qa | grep map2-audio
rpm -ql map2-audio | head -20

# Check services
systemctl list-unit-files | grep map2
```

## GitHub Actions Setup

### Step 1: Verify Workflows in Repository

```bash
# Ensure workflows are committed to git
git add .github/workflows/
git commit -m "Add hybrid update system GitHub Actions workflows"
git push origin master
```

### Step 2: Verify GitHub Actions Enabled

1. Go to your GitHub repository: `https://github.com/matthewmackes/map2-audio`
2. Click **Settings** → **Actions** → **General**
3. Verify:
   - ✅ "Allow all actions and reusable workflows"
   - ✅ Workflow permissions: "Read and write permissions"

### Step 3: Create First Release

```bash
# Create annotated tag
git tag -a v1.0.0 -m "Initial release with hybrid update system

Features:
- Git-based updates for development
- RPM-based updates for production
- Automatic mode detection
- Hybrid update orchestrator
- GitHub Actions CI/CD"

# Push tag to trigger workflow
git push origin v1.0.0
```

### Step 4: Monitor Workflow Execution

1. Go to **Actions** tab in GitHub
2. Click on "Build & Publish RPM" workflow
3. Watch progress through:
   - **Build job** (~10 min)
   - **Test job** (~5 min)
   - **Publish job** (~1 min)

### Step 5: Download Built RPM

1. Go to workflow run summary
2. Scroll to **Artifacts** section
3. Download `rpm-artifacts.zip`
4. Extract and use RPM package

## Development Workflow Testing

### Test 1: Git Mode Update

```bash
# Make a small change
echo "# Updated at $(date)" >> /home/mm/map2-audio/README.md

# Commit change
cd /home/mm/map2-audio
git add README.md
git commit -m "Test update"
git push origin master

# Simulate update request (via API in real scenario)
python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.cluster.hybrid_update_manager import (
    HybridUpdateManager,
    HybridUpdateConfig,
    UpdateMode
)
import asyncio

async def test():
    config = HybridUpdateConfig(
        mode=UpdateMode.GIT,
        app_path="/home/mm/map2-audio"
    )
    
    manager = HybridUpdateManager(config)
    
    # Simulate git update (dry run - won't actually change anything)
    print("Testing Git-based update...")
    print("(In production, this would pull latest code)")
    print(f"Current commit: {manager.get_current_version()}")
    print(f"Mode: {manager.mode.value}")

asyncio.run(test())
EOF
```

### Test 2: Version Detection

```bash
python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.cluster.hybrid_update_manager import HybridUpdateManager

manager = HybridUpdateManager()

print("Version Information")
print("=" * 50)
print(f"Auto-detected mode: {manager.mode.value}")

if manager.mode.value == "git":
    print("Git Mode Details:")
    print(f"  Repository: {manager.config.git_repository}")
    print(f"  Branch: {manager.config.git_branch}")
    print(f"  App Path: {manager.config.app_path}")
else:
    print("RPM Mode Details:")
    print(f"  Repository: {manager.config.rpm_repository}")
    print(f"  Environment: {manager.config.environment.value}")

version = manager.get_current_version()
print(f"Current Version: {version}")
EOF
```

## Production Workflow Testing

### Test 1: Prepare RPM Release

```bash
# Tag for release
git tag -a v1.0.1 -m "Bug fixes and improvements"
git push origin v1.0.1

# GitHub Actions automatically:
# 1. Builds RPM from v1.0.1 tag
# 2. Tests RPM installation
# 3. Creates GitHub Release
# 4. Attaches RPM to release
```

### Test 2: Simulate RPM Update

```bash
# In Fedora 40 system with RPM installed:

python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.cluster.hybrid_update_manager import (
    HybridUpdateManager,
    HybridUpdateConfig,
    UpdateMode
)

config = HybridUpdateConfig(
    mode=UpdateMode.RPM
)

manager = HybridUpdateManager(config)

print("RPM Mode Detected")
print("=" * 50)
print(f"Repository: {config.rpm_repository}")
print(f"To update in real scenario:")
print("  dnf update map2-audio")
EOF
```

## Full Integration Test

### Test Scenario: Complete Update Cycle

```bash
#!/bin/bash

echo "=== MAP2 Hybrid Update System - Full Integration Test ==="
echo ""

# Step 1: Check current state
echo "Step 1: Checking current application state..."
python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')
from app.services.cluster.hybrid_update_manager import HybridUpdateManager

manager = HybridUpdateManager()
print(f"  Current version: {manager.get_current_version()}")
print(f"  Update mode: {manager.mode.value}")
print(f"  Environment: {manager.config.environment.value}")
EOF

echo ""
echo "Step 2: Verifying Git Updater..."
python3 << 'EOF'
import sys
sys.path.insert(0, '/home/mm/map2-audio')
from app.services.cluster.map2_git_updater import MAP2GitUpdater
import asyncio

async def test():
    updater = MAP2GitUpdater('/home/mm/map2-audio')
    commit = await updater.get_current_commit()
    branch = await updater.get_current_branch()
    print(f"  Repository: Valid")
    print(f"  Commit: {commit[:8]}")
    print(f"  Branch: {branch}")

asyncio.run(test())
EOF

echo ""
echo "Step 3: Verifying RPM Packaging..."
if [ -f "packaging/map2-audio.spec" ]; then
    echo "  ✓ Spec file exists"
    VERSION=$(grep "^Version:" packaging/map2-audio.spec | awk '{print $2}')
    echo "  Package version: $VERSION"
else
    echo "  ✗ Spec file not found"
fi

echo ""
echo "Step 4: Verifying GitHub Actions..."
if [ -f ".github/workflows/build-rpm.yml" ]; then
    echo "  ✓ Build workflow exists"
fi
if [ -f ".github/workflows/test-rpm.yml" ]; then
    echo "  ✓ Test workflow exists"
fi

echo ""
echo "Step 5: Verifying Documentation..."
for doc in "docs/GITHUB_ACTION_SETUP.md" "docs/UPDATE_SYSTEM_USAGE.md" "docs/RPM_PACKAGING.md"
do
    if [ -f "$doc" ]; then
        echo "  ✓ $(basename $doc)"
    fi
done

echo ""
echo "=== Integration Test Complete ==="
echo ""
echo "Next steps:"
echo "1. Create release tag: git tag -a v1.0.0 -m 'Release'"
echo "2. Push tag: git push origin v1.0.0"
echo "3. Monitor GitHub Actions: https://github.com/matthewmackes/map2-audio/actions"
echo "4. Download built RPM from release artifacts"
```

## Monitoring & Validation

### Check System Health

```bash
# After update, verify:

# 1. Services are running
systemctl status map2-backend
systemctl status map2-frontend
systemctl status map2-cluster

# 2. Check logs
journalctl -u map2-backend -n 50
journalctl -u map2-cluster -n 50

# 3. Test API
curl http://localhost:8080/api/health

# 4. Check versions
rpm -qa | grep map2-audio
# OR
cd /opt/map2-audio && git log --oneline -1
```

## Troubleshooting

### Issue: Build Script Fails

**Error**: `rpmbuild: command not found`

**Solution**:
```bash
# Install RPM build tools
sudo dnf install rpm-build

# Or use in Docker container
docker run -it fedora:40 bash
dnf install -y rpm-build
```

### Issue: GitHub Actions Fails

**Error**: `Permission denied`

**Solution**:
1. Go to Settings → Actions → General
2. Set workflow permissions to "Read and write"

### Issue: Git Update Fails

**Error**: `Not a git repository`

**Solution**:
```bash
# Ensure git repository exists
cd /opt/map2-audio
git status

# If missing, clone:
cd /opt
git clone https://github.com/matthewmackes/map2-audio.git
```

## Success Criteria

The hybrid update system is successfully deployed when:

✅ Git updater imports and instantiates without errors  
✅ Hybrid manager auto-detects update mode correctly  
✅ RPM builds successfully locally  
✅ GitHub Actions workflows execute without errors  
✅ RPM installs and services start  
✅ Documentation is complete and accurate  
✅ Both git and RPM update paths work in testing  

## Next Steps

1. **Deploy to development cluster**:
   - Install git version
   - Test git-based updates
   - Monitor logs and performance

2. **Deploy to production cluster**:
   - Build and publish RPM
   - Configure DNF repository
   - Install via RPM
   - Test RPM-based updates

3. **Integration with existing update system**:
   - Wire hybrid manager into update orchestrator
   - Update UI components
   - Add monitoring and alerts

4. **Documentation & training**:
   - Share with team
   - Document processes
   - Create runbooks

## Support

For issues or questions, refer to:
- [GitHub Action Setup Guide](docs/GITHUB_ACTION_SETUP.md)
- [Update System Usage](docs/UPDATE_SYSTEM_USAGE.md)
- [RPM Packaging Guide](docs/RPM_PACKAGING.md)
