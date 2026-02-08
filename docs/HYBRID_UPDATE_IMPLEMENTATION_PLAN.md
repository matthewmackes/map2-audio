# Hybrid Update System Implementation Plan

## Overview

Implement a hybrid update system that combines:
- **Git-based updates** for development/testing
- **RPM-based updates** for production releases
- **GitHub Actions** for automated RPM building and publishing

Repository: `matthewmackes/map2-audio` (current location)

---

## Phase 1: Git-Based Application Updater (Development Mode)

### 1.1 Core Git Updater Service
**File**: `app/services/cluster/map2_git_updater.py`

**Features**:
- Pull latest code from GitHub repository
- Stash local changes before update
- Install Python dependencies
- Rebuild frontend assets
- Restart services
- Validate application health
- Rollback on failure

**Methods**:
```python
- update_application(branch, node_id) -> UpdateResult
- get_current_version(node_id) -> str (git commit hash)
- validate_repository_state(node_id) -> bool
- rollback_to_commit(node_id, commit_hash) -> bool
```

### 1.2 Integration with Update Orchestrator
**File**: `app/services/cluster/update_orchestrator.py` (extend)

**Add**:
- Detection of update mode (git vs rpm)
- Conditional execution based on environment
- Progress tracking for git operations
- Validation stages for application updates

---

## Phase 2: RPM Package Specification

### 2.1 RPM Spec File
**File**: `packaging/map2-audio.spec`

**Includes**:
- Package metadata (name, version, dependencies)
- Build instructions for Python backend
- Build instructions for React frontend
- Installation paths (/opt/map2)
- Systemd service units
- Post-install scripts

### 2.2 Systemd Service Units
**Files**: 
- `packaging/systemd/map2-backend.service`
- `packaging/systemd/map2-frontend.service`
- `packaging/systemd/map2-cluster.service`

### 2.3 RPM Build Scripts
**File**: `packaging/build-rpm.sh`

**Steps**:
- Prepare build environment
- Generate tarball from git
- Build RPM using rpmbuild
- Sign RPM (optional)
- Output to dist/ directory

---

## Phase 3: GitHub Actions Workflow

### 3.1 RPM Build Workflow
**File**: `.github/workflows/build-rpm.yml`

**Triggers**:
- Release creation (tags matching v*.*.*)
- Manual workflow dispatch
- Push to main branch (for testing)

**Jobs**:
1. Build RPM package
2. Test RPM installation
3. Create GitHub Release
4. Attach RPM to release
5. Publish to RPM repository (optional)

**Artifacts**:
- `map2-audio-{version}.fc40.x86_64.rpm`
- `map2-audio-{version}.fc40.src.rpm`
- SHA256 checksums

### 3.2 Repository Publishing Workflow
**File**: `.github/workflows/publish-repo.yml`

**Purpose**: Maintain YUM/DNF repository for RPM packages

**Steps**:
1. Checkout repository metadata
2. Add new RPM to repository
3. Update repository metadata (createrepo_c)
4. Sign repository metadata
5. Publish to GitHub Pages or S3

---

## Phase 4: Hybrid Update Orchestrator

### 4.1 Unified Update Manager
**File**: `app/services/cluster/hybrid_update_manager.py`

**Responsibilities**:
- Detect environment (development vs production)
- Route to appropriate updater (git or rpm)
- Coordinate system + application updates
- Track versions across both update types
- Unified rollback mechanism

**Configuration** (via environment or config file):
```yaml
update_mode: auto  # auto, git, rpm
git_repository: https://github.com/matthewmackes/map2-audio.git
git_branch: main
rpm_repository: https://map2-audio.example.com/rpm
environment: development  # development, staging, production
```

### 4.2 Extended Version Manifest
**File**: `app/services/cluster/version_manifest.py` (extend)

**Track both**:
- System RPM packages (existing)
- MAP2 application version (new)
  - Git commit hash (development)
  - RPM version (production)

---

## Phase 5: API Endpoints

### 5.1 Application Update Endpoints
**File**: `app/routes/cluster_update.py` (extend)

**New endpoints**:
```
POST /api/cluster/update/application
  - Trigger MAP2 application update
  - Payload: { "branch": "main", "mode": "git|rpm" }

GET /api/cluster/update/application/status
  - Get application update progress

GET /api/cluster/update/application/version
  - Get current application version on each node

POST /api/cluster/update/full
  - Update both system packages AND application
  - Payload: { "update_system": true, "update_app": true }
```

---

## Phase 6: UI Updates

### 6.1 TUI Updates Tab Enhancement
**File**: `tui/screens/system_update_screen.py` (extend)

**Add buttons**:
- [Update MAP2 App]
- [Full Update (System + App)]
- Version display (git commit or RPM version)

### 6.2 Web Updates Tab Enhancement
**File**: `web/src/app/components/ClusterDashboard/UpdatesTab.tsx` (extend)

**Add sections**:
- Application version display per node
- Application update controls
- Mode selector (git/rpm)
- Branch selector (for git mode)

### 6.3 Update Progress Viewer Enhancement
**Files**: 
- `tui/screens/update_progress_screen.py`
- `web/src/app/components/UpdateProgressViewer.tsx`

**Add stages for application updates**:
1. Repository fetch/Download
2. Dependency installation
3. Frontend build
4. Service restart
5. Health validation

---

## Phase 7: RPM Repository Setup

### 7.1 GitHub Pages Repository
**Files**:
- `.github/workflows/update-repo.yml`
- `repo/` directory structure

**Or**

### 7.2 Self-Hosted Repository
**Setup**:
- Nginx configuration for RPM repository
- Automatic repository metadata updates
- GPG signing for security

---

## Phase 8: Documentation

### 8.1 GitHub Action Setup Guide
**File**: `docs/GITHUB_ACTION_SETUP.md`

**Contents**:
- Prerequisites and permissions
- Secrets configuration
- Workflow customization
- Release process
- Troubleshooting

### 8.2 Update System Usage Guide
**File**: `docs/UPDATE_SYSTEM_USAGE.md`

**Contents**:
- Development mode (git updates)
- Production mode (rpm updates)
- Hybrid mode configuration
- Version manifest usage
- Rollback procedures

### 8.3 RPM Packaging Guide
**File**: `docs/RPM_PACKAGING.md`

**Contents**:
- Spec file explanation
- Local RPM building
- Testing RPM packages
- Repository management
- Signing packages

---

## Implementation Order

### Sprint 1: Foundation (Days 1-3)
1. ✅ Create RPM spec file (`packaging/map2-audio.spec`)
2. ✅ Create systemd service units
3. ✅ Create local RPM build script
4. ✅ Test local RPM build and installation

### Sprint 2: Git Updater (Days 4-6)
5. ✅ Implement `map2_git_updater.py`
6. ✅ Add git update endpoints to API
7. ✅ Add git update UI controls
8. ✅ Test git-based updates in development

### Sprint 3: GitHub Actions (Days 7-10)
9. ✅ Create GitHub Action workflow for RPM building
10. ✅ Test workflow with manual trigger
11. ✅ Configure release automation
12. ✅ Set up artifact publishing

### Sprint 4: RPM Repository (Days 11-13)
13. ✅ Choose repository hosting (GitHub Pages or self-hosted)
14. ✅ Create repository update workflow
15. ✅ Configure DNF repository on nodes
16. ✅ Test RPM installation from repository

### Sprint 5: Hybrid Manager (Days 14-17)
17. ✅ Implement `hybrid_update_manager.py`
18. ✅ Extend version manifest for application tracking
19. ✅ Add mode detection and routing
20. ✅ Implement unified rollback

### Sprint 6: Integration (Days 18-21)
21. ✅ Integrate hybrid manager into update orchestrator
22. ✅ Update UI components
23. ✅ Add full update endpoint
24. ✅ End-to-end testing

### Sprint 7: Documentation (Days 22-24)
25. ✅ Write GitHub Action setup guide
26. ✅ Write update system usage guide
27. ✅ Write RPM packaging guide
28. ✅ Update CLUSTER_UPDATES_SYSTEM.md

### Sprint 8: Production Hardening (Days 25-28)
29. ✅ Add GPG signing for RPMs
30. ✅ Implement repository signing
31. ✅ Add update verification
32. ✅ Security audit and testing

---

## File Structure

```
map2-audio/
├── .github/
│   └── workflows/
│       ├── build-rpm.yml          # NEW: RPM build workflow
│       ├── publish-repo.yml       # NEW: Repository publishing
│       └── test-rpm.yml           # NEW: RPM testing workflow
│
├── packaging/                      # NEW: RPM packaging files
│   ├── map2-audio.spec            # RPM spec file
│   ├── build-rpm.sh               # Local build script
│   ├── systemd/                   # Systemd units
│   │   ├── map2-backend.service
│   │   ├── map2-frontend.service
│   │   └── map2-cluster.service
│   └── repo/                      # Repository metadata (if self-hosted)
│
├── app/
│   └── services/
│       └── cluster/
│           ├── map2_git_updater.py        # NEW: Git-based updater
│           ├── hybrid_update_manager.py   # NEW: Hybrid orchestrator
│           ├── update_orchestrator.py     # EXTEND: Add app updates
│           └── version_manifest.py        # EXTEND: Track app version
│
├── app/routes/
│   └── cluster_update.py          # EXTEND: Add app update endpoints
│
├── tui/screens/
│   ├── system_update_screen.py    # EXTEND: Add app update controls
│   └── update_progress_screen.py  # EXTEND: Add app update stages
│
├── web/src/app/components/
│   ├── ClusterDashboard/
│   │   └── UpdatesTab.tsx         # EXTEND: Add app update UI
│   └── UpdateProgressViewer.tsx   # EXTEND: Add app update tracking
│
└── docs/                           # NEW: Detailed documentation
    ├── GITHUB_ACTION_SETUP.md     # GitHub Action configuration guide
    ├── UPDATE_SYSTEM_USAGE.md     # How to use hybrid updates
    └── RPM_PACKAGING.md           # RPM packaging guide
```

---

## Configuration Examples

### Environment Detection

```yaml
# /etc/map2/config.yml
cluster:
  update_mode: auto              # auto, git, rpm
  environment: development       # development, staging, production
  
git_config:
  repository: https://github.com/matthewmackes/map2-audio.git
  branch: main
  auto_pull: true
  
rpm_config:
  repository: https://map2-audio.github.io/rpm/fedora/40
  gpg_check: true
  auto_update: false
```

### Mode Detection Logic

```python
def detect_update_mode() -> str:
    """Auto-detect update mode based on environment."""
    
    # Check explicit configuration
    if config.get("update_mode") != "auto":
        return config.get("update_mode")
    
    # Check if installed via RPM
    if rpm_query("map2-audio"):
        return "rpm"
    
    # Check if git repository exists
    if os.path.exists("/opt/map2-audio/.git"):
        return "git"
    
    # Default to git for development
    return "git"
```

---

## Success Criteria

### Phase Completion Gates

**Phase 1**: Git updater can update application code on a single node  
**Phase 2**: RPM can be built locally and installs successfully  
**Phase 3**: GitHub Action successfully builds and publishes RPM  
**Phase 4**: RPM repository serves packages via DNF  
**Phase 5**: Hybrid manager routes to correct updater  
**Phase 6**: UI shows both update modes  
**Phase 7**: Full cluster update works end-to-end  
**Phase 8**: Documentation complete and validated  

### Overall Success

- ✅ Development mode: Update via git works across cluster
- ✅ Production mode: Update via RPM works across cluster  
- ✅ GitHub Action: Automatically builds RPM on release
- ✅ Repository: RPM accessible via DNF
- ✅ UI: Both TUI and Web support both modes
- ✅ Rollback: Works for both git and RPM updates
- ✅ Documentation: Complete setup and usage guides

---

## Risk Mitigation

### Risk 1: RPM Build Failures
**Mitigation**: Test locally first, comprehensive CI testing

### Risk 2: Repository Publishing Issues
**Mitigation**: Support both GitHub Pages and self-hosted options

### Risk 3: Git Update Conflicts
**Mitigation**: Always stash changes, provide manual conflict resolution

### Risk 4: Service Restart Failures
**Mitigation**: Graceful restart with timeout, automatic rollback

### Risk 5: Version Tracking Complexity
**Mitigation**: Clear separation of system vs application versions

---

## Next Steps

1. **Review and approve this plan**
2. **Begin Sprint 1** (RPM spec file creation)
3. **Set up GitHub repository secrets** for Actions
4. **Configure initial testing environment**
5. **Start implementation** following sprint order

**Estimated Total Time**: 28 days (4 weeks)  
**Team Size**: 1-2 developers  
**Dependencies**: GitHub repository access, Fedora build environment
