# GitHub Actions Setup Guide

## Overview

This guide explains how to set up and configure GitHub Actions workflows for building and publishing MAP2 Audio RPM packages automatically.

## Prerequisites

- GitHub repository with Actions enabled (default on public repos)
- Fedora 40 container image access (publicly available)
- Release tags following semantic versioning (v1.0.0)

## GitHub Actions Workflows

### 1. Build & Publish RPM Workflow

**File**: `.github/workflows/build-rpm.yml`

**Triggers**:
- Release published: `on: release: types: [published]`
- Manual trigger: `workflow_dispatch` with version input
- (Optional) Push to main: Modify `on:` section

### 2. Test RPM Workflow

**File**: `.github/workflows/test-rpm.yml`

**Triggers**:
- Pull requests affecting packaging files
- Manual trigger: `workflow_dispatch`

## Setup Instructions

### Step 1: Verify Workflows Exist

```bash
# Check that workflow files are in your repo
ls -la .github/workflows/

# Should show:
# - build-rpm.yml
# - test-rpm.yml
```

### Step 2: Verify Repository Settings

1. Go to **Settings** → **Actions** → **General**
2. Verify **Actions permissions** is set to "Allow all actions and reusable workflows"
3. Verify **Workflow permissions** allows read/write on GITHUB_TOKEN

### Step 3: Create First Release

```bash
# Tag a release (use semantic versioning)
git tag -a v1.0.0 -m "Initial release"
git push origin v1.0.0
```

This automatically triggers the build-rpm workflow.

### Step 4: Monitor Workflow Execution

1. Go to **Actions** tab in your repository
2. Click on the latest workflow run
3. Watch progress in real-time

### Step 5: Download Built Artifacts

After workflow completes:

1. Go to the workflow run summary
2. Scroll to **Artifacts** section
3. Download `rpm-artifacts.zip` containing:
   - `map2-audio-*.fc40.x86_64.rpm`
   - `map2-audio-*.fc40.src.rpm`
   - `checksums.txt`

## Manual Build Trigger

To build without creating a release:

1. Go to **Actions** tab
2. Click **Build & Publish RPM** workflow
3. Click **Run workflow**
4. Enter version (e.g., `1.0.0`) and optional release number
5. Click **Run workflow**

## Release Process

### Creating a Proper Release

```bash
# 1. Create annotated tag
git tag -a v1.0.1 -m "Bug fixes and improvements

- Fixed update orchestrator timeout
- Improved error reporting
- Updated documentation"

# 2. Push tag to trigger workflow
git push origin v1.0.1

# 3. Go to GitHub releases page
# 4. Click "Draft a new release"
# 5. Select tag v1.0.1
# 6. Add release notes
# 7. Publish release
```

The workflow will:
- Build RPM package
- Run installation tests
- Create checksums
- Attach RPM to GitHub release

### Using Release Artifacts

The built RPM is automatically attached to the GitHub Release:

```bash
# Download and install from release
curl -L -O https://github.com/matthewmackes/map2-audio/releases/download/v1.0.0/map2-audio-1.0.0-1.fc40.x86_64.rpm

sudo dnf install ./map2-audio-1.0.0-1.fc40.x86_64.rpm
```

## Docker Container Used

The workflow builds in a Fedora 40 container:
- **Image**: `fedora:40`
- **Architecture**: x86_64
- **Available from**: Docker Hub (registry.fedoraproject.org)

## Workflow Jobs Explained

### Job 1: Build

Builds the RPM package:
1. Checks out code
2. Installs build dependencies
3. Creates source tarball from git
4. Updates spec file with version/release
5. Runs `rpmbuild`
6. Generates SHA256 checksums
7. Uploads artifacts

**Time**: ~5-10 minutes

### Job 2: Test

Tests RPM installation:
1. Downloads built RPM
2. Installs test dependencies
3. Installs the RPM
4. Verifies installation
5. Checks package contents

**Time**: ~3-5 minutes

### Job 3: Publish (Release only)

Publishes to GitHub Releases:
1. Attaches RPM files to release
2. Adds checksums
3. Posts release notes

**Time**: ~1 minute

### Job 4: Publish Repo (Optional)

Updates RPM repository (requires separate setup):
1. Checks out rpm-repo branch
2. Copies new RPM to repository
3. Updates metadata with createrepo_c
4. Commits and pushes

**Requires**: Separate `rpm-repo` branch

## Troubleshooting

### Workflow Fails: Permission Denied

**Problem**: "Error: Permission to push to repository denied"

**Solution**:
1. Go to **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select "Read and write permissions"

### Workflow Fails: Build Dependencies

**Problem**: "dnf: command not found"

**Solution**: Container image not properly loaded. Usually auto-recovers on retry.

Click "Re-run all jobs" in workflow summary.

### Workflow Fails: Node.js Build

**Problem**: "npm: command not found"

**Solution**: Ensure `nodejs` and `npm` are in build dependencies in spec file.

Check `packaging/map2-audio.spec` line with `BuildRequires:`.

### Release Artifacts Not Attached

**Problem**: RPM not appearing in GitHub release

**Solution**:
1. Check workflow completed successfully (green checkmark)
2. Go to release and click "Edit"
3. Scroll to "Attach binaries" section
4. Manually upload if needed

## Advanced Configuration

### Enable Auto-Build on Push

To build RPM on every push (requires caution):

Edit `.github/workflows/build-rpm.yml`:

```yaml
on:
  push:
    branches: [main, master]
    tags: ['v*']
```

### Build for Multiple Fedora Versions

Add matrix strategy:

```yaml
jobs:
  build:
    strategy:
      matrix:
        fedora: [39, 40, 41]
    container:
      image: fedora:${{ matrix.fedora }}
```

### Send Notifications

Add notification step to workflow:

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "RPM Build: ${{ job.status }}"
      }
```

## GPG Signing RPMs (Optional)

To sign RPMs with GPG:

1. Create GPG key or use existing
2. Export private key in armored format
3. Add as repository secret `GPG_PRIVATE_KEY`
4. Add signing step to workflow:

```yaml
- name: Sign RPM
  run: |
    echo "${{ secrets.GPG_PRIVATE_KEY }}" | gpg --import
    rpmsign --addsign ~/rpmbuild/RPMS/x86_64/*.rpm
```

## Repository Hosting Options

### Option 1: GitHub Pages (Free)

1. Create `rpm-repo` branch
2. Workflow automatically updates it
3. Enable GitHub Pages on this branch
4. Repository URL: `https://githubusername.github.io/map2-audio/rpm/fedora/40`

**Add to systems**:
```bash
sudo dnf config-manager --add-repo https://githubusername.github.io/map2-audio/rpm/fedora/40
```

### Option 2: Self-Hosted Server

1. Host repository on your own server
2. Modify workflow to push via SFTP/SSH
3. Add SSH key as repository secret
4. Update workflow with deploy step

### Option 3: Third-Party Repository Services

- **Copr** (Fedora Community)
- **OBS** (Open Build Service)
- **packagecloud.io**
- **Artifactory**

## CI/CD Integration with Cluster Updates

The hybrid update system automatically discovers RPMs:

```bash
# On cluster node, update manager detects RPM installation
dnf install map2-audio-1.0.0-1.fc40.x86_64.rpm

# Update system automatically uses RPM mode
curl -X POST http://localhost:8080/api/cluster/update/application \
  -H "Content-Type: application/json" \
  -d '{"mode": "rpm", "version": "1.0.1"}'
```

## Monitoring and Logs

### View Workflow Logs

1. Go to **Actions** tab
2. Click workflow name
3. Click workflow run
4. Expand each job to see logs

### Common Log Messages

- `Installing build dependencies...` - Normal
- `Building RPM...` - Normal, takes several minutes
- `rpmlint: WARNINGS` - Informational only
- `Test installation...` - Normal testing phase

### Export Logs

Click "..." menu → "Download logs" to save workflow logs locally.

## Best Practices

1. **Always test locally first**:
   ```bash
   cd /home/mm/map2-audio
   ./packaging/build-rpm.sh 1.0.0 1
   ```

2. **Use semantic versioning**: v1.0.0, v1.0.1, v1.1.0, v2.0.0

3. **Write meaningful release notes**: Describe changes, fixes, new features

4. **Monitor first few builds**: Watch for any unexpected errors

5. **Keep spec file updated**: Update when adding/removing files

6. **Test major releases**: Before publishing, test install on real Fedora 40 system

7. **Maintain CHANGELOG**: Document all changes between releases

## Summary

The GitHub Actions setup provides:

✅ **Automated RPM building** on releases  
✅ **Automated testing** of packages  
✅ **Automated distribution** via GitHub Releases  
✅ **Optional repository hosting** via GitHub Pages  
✅ **Integration with cluster update system**  

The workflow is fully operational and ready to use. Simply create a release tag to trigger the build process.
