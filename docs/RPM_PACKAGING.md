# RPM Packaging Guide

## Overview

This guide explains the MAP2 Audio RPM package structure, how to modify it, and how to build RPMs locally.

## RPM Specification File

**Location**: `packaging/map2-audio.spec`

### Structure Overview

```spec
Name:           map2-audio              # Package name
Version:        1.0.0                  # Version number
Release:        1%{?dist}              # Release number with distro tag
Summary:        ...                     # One-line description
License:        MIT                     # License type
URL:            ...                     # Project URL
Source0:        map2-audio-%.tar.gz    # Source tarball

BuildRequires:  ...                     # Build-time dependencies
Requires:       ...                     # Runtime dependencies

%description
Longer description of package.

%prep                                   # Prepare sources
%autosetup

%build                                  # Build phase
# Build instructions

%install                                # Install phase
# Installation instructions

%files                                  # Files included in package
%post                                   # Post-install script
%preun                                  # Pre-uninstall script
%postun                                 # Post-uninstall script

%changelog                              # Release history
```

## Modifying the Spec File

### Adding New Files to Package

```spec
%install
mkdir -p %{buildroot}/opt/map2

# Add your new files/directories
cp -r new-feature %{buildroot}/opt/map2/

%files
/opt/map2/new-feature/*              # Include new files
```

### Adding New Dependencies

```spec
Requires:       python3 >= 3.12
Requires:       new-dependency >= 1.0  # Add new requirement
```

### Adding Build Steps

```spec
%build
# Existing build steps...

# Add new build step
cd new-component
./configure
make
```

### Post-Install Customization

```spec
%post
# Existing post-install...

# Add custom initialization
/opt/map2/scripts/initialize-new-feature.sh
```

## Version and Release Numbers

### Version

Format: `MAJOR.MINOR.PATCH` (e.g., `1.0.0`)

**When to increment**:
- **MAJOR**: Breaking changes, API modifications
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, patches

### Release

Format: `N` (e.g., `1`)

**When to increment**:
- Same upstream version, different packaging
- Build with different dependencies
- Different release distro (fc40, fc41, etc.)

**Example workflow**:
```
Version 1.0.0, Release 1  → map2-audio-1.0.0-1.fc40.x86_64.rpm
Version 1.0.0, Release 2  → map2-audio-1.0.0-2.fc40.x86_64.rpm (packaging fix)
Version 1.0.1, Release 1  → map2-audio-1.0.1-1.fc40.x86_64.rpm (new version)
```

## Building RPMs Locally

### Prerequisites

```bash
# Install build tools
sudo dnf install -y rpm-build rpmlint python3-devel nodejs npm

# Create build directory structure
mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
```

### Using Build Script

```bash
# Simple one-command build
cd /path/to/map2-audio
./packaging/build-rpm.sh 1.0.0 1

# Output:
# dist/map2-audio-1.0.0-1.fc40.x86_64.rpm
# dist/map2-audio-1.0.0-1.fc40.src.rpm
# dist/map2-audio-1.0.0-1.fc40.x86_64.rpm.sha256
```

### Manual Build Process

```bash
# 1. Create source tarball
VERSION="1.0.0"
RELEASE="1"

git archive \
  --format=tar.gz \
  --prefix="map2-audio-${VERSION}/" \
  -o ~/rpmbuild/SOURCES/map2-audio-${VERSION}.tar.gz \
  HEAD

# 2. Copy and update spec file
cp packaging/map2-audio.spec ~/rpmbuild/SPECS/

sed -i "s/^Version:.*/Version:        ${VERSION}/" ~/rpmbuild/SPECS/map2-audio.spec
sed -i "s/^Release:.*/Release:        ${RELEASE}%{?dist}/" ~/rpmbuild/SPECS/map2-audio.spec

# 3. Build RPM
rpmbuild -ba \
  --define "_topdir ~/rpmbuild" \
  --define "dist .fc40" \
  ~/rpmbuild/SPECS/map2-audio.spec

# 4. Output located in
ls -lh ~/rpmbuild/RPMS/x86_64/
ls -lh ~/rpmbuild/SRPMS/
```

## Testing Built RPMs

### Installation Test

```bash
# Install in clean environment (VM recommended)
sudo dnf install ~/rpmbuild/RPMS/x86_64/map2-audio-*.rpm

# Verify installation
rpm -qi map2-audio
rpm -ql map2-audio | head -20

# Check services
systemctl list-unit-files | grep map2
```

### Functionality Test

```bash
# Start services
sudo systemctl start map2-backend
sudo systemctl start map2-frontend

# Check status
sudo systemctl status map2-backend
sudo systemctl status map2-frontend

# Test API
curl http://localhost:8080/api/health

# Check logs
sudo journalctl -u map2-backend -n 20
```

### Uninstall Test

```bash
# Verify services are stopped
sudo systemctl stop map2-backend
sudo systemctl stop map2-frontend

# Uninstall
sudo dnf remove map2-audio

# Verify complete removal
rpm -qa | grep map2-audio   # Should return nothing
ls /opt/map2 2>/dev/null    # Should not exist
```

## Spec File Best Practices

### 1. Keep %prep Section Minimal

```spec
%prep
%autosetup
# Don't do complex logic here
```

### 2. Use Macros for Paths

```spec
# Good:
install -Dm644 file %{buildroot}%{_bindir}/myapp

# Avoid:
install -Dm644 file %{buildroot}/usr/bin/myapp
```

### 3. Set Correct Permissions

```spec
%install
install -Dm755 binary-file %{buildroot}%{_bindir}/binary   # Executable
install -Dm644 data-file %{buildroot}%{_datadir}/app/data  # Data file
install -Dm644 config-file %{buildroot}%{_sysconfdir}/app/config
```

### 4. Use %files Permissions

```spec
%files
%doc README.md                              # Documentation
%license LICENSE                           # License file
%config %{_sysconfdir}/app/config          # Configuration
%attr(755, root, root) %{_bindir}/binary   # Executable
```

### 5. Post-Install Best Practices

```spec
%post
# Reload systemd units
systemctl daemon-reload

# Enable services
systemctl enable map2-backend.service 2>/dev/null || true

# Create user/group if needed
getent passwd map2 > /dev/null || useradd -r map2 2>/dev/null || true

# Set permissions
chown -R map2:map2 /var/lib/map2 2>/dev/null || true
```

## Distribution-Specific Packaging

### Fedora 40

```bash
# Build for Fedora 40
rpmbuild -ba \
  --define "dist .fc40" \
  map2-audio.spec
```

### Fedora 41 (Future)

```bash
# Build for Fedora 41
rpmbuild -ba \
  --define "dist .fc41" \
  map2-audio.spec
```

### RHEL/CentOS-compatible

```bash
# For RHEL 9
rpmbuild -ba \
  --define "dist .el9" \
  map2-audio.spec
```

## Signing RPMs (Optional but Recommended)

### Generate GPG Key

```bash
gpg --gen-key
# Follow prompts to create key
```

### Sign RPM

```bash
# Single RPM
rpmsign --addsign ~/rpmbuild/RPMS/x86_64/*.rpm

# You'll be prompted for GPG passphrase
```

### Verify Signature

```bash
rpm --checksig -v ~/rpmbuild/RPMS/x86_64/map2-audio-*.rpm
```

## Repository Metadata

### Create Repository

```bash
# Install createrepo
sudo dnf install createrepo_c

# Create repository metadata
createrepo_c /path/to/rpm/repository
```

### Update Repository

```bash
# After adding new RPMs
createrepo_c --update /path/to/rpm/repository
```

### Sign Repository Metadata (Optional)

```bash
gpg --detach-sign --armor repodata/repomd.xml
```

## Troubleshooting

### Build Fails: Missing Dependency

**Error**: `error: Failed build dependencies:`

**Solution**: Add to `BuildRequires:` in spec file

```spec
BuildRequires:  python3-devel    # Add missing build requirement
```

### Build Fails: File Not Found

**Error**: `file not found: /opt/map2/missing_file`

**Solution**: 

1. Verify file is created in %build section
2. Check path in git repository
3. Add to %install section if missing

```spec
%install
cp missing_file %{buildroot}/opt/map2/
```

### RPM Installation Fails: Dependency Not Found

**Error**: `error: package dependency failed`

**Solution**: Install runtime dependencies

```bash
sudo dnf install -y python3-fastapi python3-uvicorn
```

### Services Don't Start After Install

**Error**: Services fail to start

**Solution**:

1. Check systemd unit syntax
   ```bash
   systemd-analyze verify /usr/lib/systemd/system/map2-backend.service
   ```

2. Check permissions
   ```bash
   sudo chown -R map2:map2 /var/lib/map2
   ```

3. Check logs
   ```bash
   sudo journalctl -u map2-backend -n 50
   ```

## Creating Custom Flavors

### Alternative Map2 Package (e.g., map2-lite)

Create `packaging/map2-audio-lite.spec`:

```spec
Name:           map2-audio-lite
Version:        1.0.0
Release:        1%{?dist}
Summary:        MAP2 Audio Platform - Minimal Installation

# ... rest of spec, with:
# - Fewer dependencies
# - Fewer plugins
# - Smaller package size

%description
Lightweight version of MAP2 Audio Platform for resource-constrained environments.
```

## Maintenance Tasks

### Regular Updates

```bash
# Update version and release in spec
sed -i 's/Version: 1.0.0/Version: 1.0.1/' packaging/map2-audio.spec

# Rebuild
./packaging/build-rpm.sh 1.0.1 1
```

### Clean Build Cache

```bash
# Remove build artifacts
rm -rf ~/rpmbuild/BUILD/*
rm -rf ~/rpmbuild/BUILDROOT/*
```

### View Build Log

```bash
# RPM build logs stored in
~/.rpmmacros           # RPM configuration
~/rpmbuild/BUILD/      # Build output and logs
```

## Summary

The RPM packaging system provides:

✅ **Automated builds** via `packaging/build-rpm.sh`  
✅ **GitHub Actions** integration for CI/CD  
✅ **Source/binary** RPM generation  
✅ **Systemd** service integration  
✅ **Security** via post-install validation  
✅ **Distribution** via repositories  

Modifications are minimal - most changes are in `.spec` file metadata.
