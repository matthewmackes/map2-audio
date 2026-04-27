Name:           map2-audio
Version:        1.0.0
Release:        1%{?dist}
Summary:        Mackes Audio Platform - Professional real-time audio processing

License:        AGPL-3.0-only
URL:            https://github.com/matthewmackes/map2-audio
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  python3-devel >= 3.12
BuildRequires:  python3-pip
BuildRequires:  nodejs >= 18
BuildRequires:  npm
BuildRequires:  git
BuildRequires:  cmake
BuildRequires:  gcc-c++
BuildRequires:  make
BuildRequires:  pkgconf-pkg-config
BuildRequires:  alsa-lib-devel
BuildRequires:  pipewire-jack-audio-connection-kit-devel
BuildRequires:  freetype-devel
BuildRequires:  fontconfig-devel
BuildRequires:  libcurl-devel
BuildRequires:  libX11-devel
BuildRequires:  libXext-devel
BuildRequires:  libXinerama-devel
BuildRequires:  libXrandr-devel
BuildRequires:  libXcursor-devel
BuildRequires:  mesa-libGL-devel

Requires:       python3 >= 3.12
Requires:       python3-fastapi
Requires:       python3-httpx
Requires:       python3-pydantic
Requires:       python3-aiofiles
Requires:       python3-jsonschema
Requires:       python3-pyyaml
Requires:       pipewire
Requires:       jack-audio-connection-kit
Requires:       alsa-lib
Requires:       systemd
Requires:       nodejs

%description
MAP2 Audio Platform provides a distributed audio processing cluster
with comprehensive management, monitoring, and orchestration capabilities.
Includes cluster management, real-time audio mixing, effects processing,
and automated system updates.

%prep
%autosetup

%build
# Build React frontend.
cd %{_builddir}/%{name}-%{version}/web
npm ci
npm run build

# Build native audio engine and the QuickJS controller-host supervisor child.
cd %{_builddir}/%{name}-%{version}
cmake -S juce-engine -B juce-engine/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_NATIVE_OPTIMIZATIONS=ON \
  -DENABLE_FAST_MATH=ON \
  -DBUILD_CONTROLLER_HOST=ON
cmake --build juce-engine/build --target map2_audio_engine map2-controller-host --parallel %{?_smp_build_ncpus}

%install
# Create application directories
mkdir -p %{buildroot}/opt/map2/{app,web,tui,lib,scripts}
mkdir -p %{buildroot}/etc/map2/prometheus/targets
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/datasources
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/dashboards
mkdir -p %{buildroot}/etc/map2/grafana/dashboards
mkdir -p %{buildroot}/var/lib/map2/{backups,config-repo,logs}
mkdir -p %{buildroot}/var/log/map2
mkdir -p %{buildroot}/usr/lib/systemd/system
mkdir -p %{buildroot}/usr/local/bin

# Install Python backend
cp -r app %{buildroot}/opt/map2/
cp -r tui %{buildroot}/opt/map2/
cp -r lcd %{buildroot}/opt/map2/

# Install React frontend
cp -r web/dist %{buildroot}/opt/map2/web/

# Install main application files
cp requirements-backend-runtime.txt %{buildroot}/opt/map2/
cp requirements-installer.txt %{buildroot}/opt/map2/
cp LICENSE %{buildroot}/opt/map2/
cp README.md %{buildroot}/opt/map2/
cp -r scripts %{buildroot}/opt/map2/
cp -r device-packs %{buildroot}/opt/map2/

# Install native build outputs at the paths used by runtime probes/supervisors.
mkdir -p %{buildroot}/opt/map2/juce-engine/build
install -m 755 juce-engine/build/map2-controller-host %{buildroot}/opt/map2/juce-engine/build/map2-controller-host
install -m 755 juce-engine/build/map2_audio_engine*.so %{buildroot}/opt/map2/juce-engine/build/

# Install observability configs
install -m 644 config/prometheus.yml %{buildroot}/etc/map2/prometheus/prometheus.yml
install -m 644 config/prometheus-targets/audio-nodes.json %{buildroot}/etc/map2/prometheus/targets/audio-nodes.json
install -m 644 config/grafana/grafana.ini %{buildroot}/etc/map2/grafana/grafana.ini
install -m 644 config/grafana/provisioning/datasources/prometheus.yml %{buildroot}/etc/map2/grafana/provisioning/datasources/prometheus.yml
install -m 644 config/grafana/provisioning/dashboards/map2.yml %{buildroot}/etc/map2/grafana/provisioning/dashboards/map2.yml
install -m 644 config/grafana-dashboards/*.json %{buildroot}/etc/map2/grafana/dashboards/

# Install systemd units
install -m 644 packaging/systemd/map2-backend.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-frontend.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-cluster.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-prometheus.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-grafana.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-avb.target %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-ptp4l.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-phc2sys.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-srpd.service %{buildroot}/usr/lib/systemd/system/

# Install wrapper scripts
cat > %{buildroot}/usr/local/bin/map2 << 'EOF'
#!/bin/bash
cd /opt/map2
exec python3 -m uvicorn app.main:app "$@"
EOF
chmod +x %{buildroot}/usr/local/bin/map2

install -m 755 systemd/map2-irq-affinity.sh %{buildroot}/usr/local/bin/map2-irq-affinity.sh

%files
%license /opt/map2/LICENSE
%doc /opt/map2/README.md
/opt/map2
/etc/map2
/var/lib/map2
/var/log/map2
/usr/lib/systemd/system/map2-*.service
/usr/lib/systemd/system/map2-avb.target
/usr/local/bin/map2
/usr/local/bin/map2-irq-affinity.sh

%post
# Create map2 user before assigning ownership.
getent passwd map2 > /dev/null || useradd -r -s /sbin/nologin -d /var/lib/map2 -m map2 2>/dev/null || true

# Enable services
systemctl daemon-reload
systemctl enable map2-backend.service
systemctl enable map2-frontend.service
systemctl enable map2-cluster.service

# Set permissions
chown -R map2:map2 /opt/map2 /var/lib/map2 /var/log/map2 2>/dev/null || true

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
