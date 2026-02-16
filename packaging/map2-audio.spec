Name:           map2-audio
Version:        1.0.0
Release:        1%{?dist}
Summary:        MAP2 Audio Platform - Distributed Audio Processing Cluster

License:        MIT
URL:            https://github.com/matthewmackes/map2-audio
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  python3-devel >= 3.12
BuildRequires:  python3-pip
BuildRequires:  nodejs >= 18
BuildRequires:  npm
BuildRequires:  git

Requires:       python3 >= 3.12
Requires:       python3-fastapi
Requires:       python3-httpx
Requires:       python3-pydantic
Requires:       python3-aiofiles
Requires:       pipewire
Requires:       jack-audio-connection-kit
Requires:       alsa-lib
Requires:       systemd

%description
MAP2 Audio Platform provides a distributed audio processing cluster
with comprehensive management, monitoring, and orchestration capabilities.
Includes cluster management, real-time audio mixing, effects processing,
and automated system updates.

%prep
%autosetup

%build
# Build Python backend
cd %{_builddir}/%{name}-%{version}
python3 -m pip install --no-deps --target ./build/lib .

# Build React frontend
cd web
npm ci
npm run build

%install
# Create application directories
mkdir -p %{buildroot}/opt/map2/{app,web,tui,lib,scripts}
mkdir -p %{buildroot}/etc/map2
mkdir -p %{buildroot}/var/lib/map2/{backups,config-repo,logs}
mkdir -p %{buildroot}/var/log/map2
mkdir -p %{buildroot}/usr/lib/systemd/system
mkdir -p %{buildroot}/usr/local/bin

# Install Python backend
cp -r app %{buildroot}/opt/map2/
cp -r build/lib/* %{buildroot}/opt/map2/lib/
cp -r tui %{buildroot}/opt/map2/

# Install React frontend
cp -r web/dist %{buildroot}/opt/map2/web/

# Install main application files
cp requirements.txt %{buildroot}/opt/map2/
cp setup.py %{buildroot}/opt/map2/
cp main.py %{buildroot}/opt/map2/
cp -r scripts %{buildroot}/opt/map2/

# Install systemd units
install -m 644 packaging/systemd/map2-backend.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-frontend.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-cluster.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-avb.target %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-ptp4l.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-phc2sys.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-srpd.service %{buildroot}/usr/lib/systemd/system/

# Install wrapper scripts
cat > %{buildroot}/usr/local/bin/map2 << 'EOF'
#!/bin/bash
cd /opt/map2
exec python3 main.py "$@"
EOF
chmod +x %{buildroot}/usr/local/bin/map2

%files
/opt/map2
/etc/map2
/var/lib/map2
/var/log/map2
/usr/lib/systemd/system/map2-*.service
/usr/lib/systemd/system/map2-avb.target
/usr/local/bin/map2

%post
# Enable services
systemctl daemon-reload
systemctl enable map2-backend.service
systemctl enable map2-frontend.service
systemctl enable map2-cluster.service

# Set permissions
chown -R map2:map2 /opt/map2 /var/lib/map2 /var/log/map2 2>/dev/null || true

# Create map2 user if it doesn't exist
getent passwd map2 > /dev/null || useradd -r -s /sbin/nologin -d /var/lib/map2 -m map2 2>/dev/null || true

echo "MAP2 Audio Platform installed successfully"
echo "Services installed: map2-backend, map2-frontend, map2-cluster"
echo "Start services with: systemctl start map2-backend"

%preun
# Stop services before uninstall
systemctl stop map2-backend.service 2>/dev/null || true
systemctl stop map2-frontend.service 2>/dev/null || true
systemctl stop map2-cluster.service 2>/dev/null || true
systemctl disable map2-backend.service 2>/dev/null || true
systemctl disable map2-frontend.service 2>/dev/null || true
systemctl disable map2-cluster.service 2>/dev/null || true

%postun
systemctl daemon-reload

%changelog
* Fri Feb 07 2026 Matthew Mackes <matthew@map2-audio.dev> - 1.0.0-1
- Initial release of MAP2 Audio Platform
- Distributed cluster management
- Real-time audio processing
- Automated update orchestration
- Web and terminal interfaces
