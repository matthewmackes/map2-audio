Name:           map2
Version:        0.1.0
Release:        1%{?dist}
Summary:        Mackes Audio Platform - Professional real-time audio processing

License:        AGPL-3.0-only
URL:            https://github.com/matthewmackes/map2-audio
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  python3-devel
BuildRequires:  python3-setuptools
BuildRequires:  cmake
BuildRequires:  gcc-c++
BuildRequires:  make
BuildRequires:  pkgconf-pkg-config
BuildRequires:  alsa-lib-devel

Requires:       python3
Requires:       python3-fastapi >= 0.104.0
Requires:       python3-uvicorn >= 0.24.0
Requires:       python3-sqlalchemy >= 2.0.0
Requires:       python3-pydantic >= 2.5.0
Requires:       python3-numpy >= 1.24.0
Requires:       python3-textual >= 0.46.0
Requires:       python3-jsonschema
Requires:       python3-pyyaml
Requires:       alsa-lib

%description
Mackes Audio Platform - Professional real-time audio processing with
LV2 plugin hosting, MIDI routing, and dual LCD monitoring.

%prep
%setup -q

%build
cmake -S juce-engine -B juce-engine/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_NATIVE_OPTIMIZATIONS=ON \
  -DENABLE_FAST_MATH=ON \
  -DBUILD_CONTROLLER_HOST=ON
cmake --build juce-engine/build --target map2_audio_engine map2-controller-host --parallel %{?_smp_build_ncpus}

%install
mkdir -p %{buildroot}/opt/map2
mkdir -p %{buildroot}/etc/map2/prometheus/targets
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/datasources
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/dashboards
mkdir -p %{buildroot}/etc/map2/grafana/dashboards
cp -r app %{buildroot}/opt/map2/
cp -r tui %{buildroot}/opt/map2/
cp -r lcd %{buildroot}/opt/map2/
cp -r scripts %{buildroot}/opt/map2/
cp -r device-packs %{buildroot}/opt/map2/
cp requirements-backend-runtime.txt %{buildroot}/opt/map2/
cp requirements-installer.txt %{buildroot}/opt/map2/
cp LICENSE README.md %{buildroot}/opt/map2/
mkdir -p %{buildroot}/opt/map2/juce-engine/build
install -m 755 juce-engine/build/map2-controller-host %{buildroot}/opt/map2/juce-engine/build/map2-controller-host
install -m 755 juce-engine/build/map2_audio_engine*.so %{buildroot}/opt/map2/juce-engine/build/

install -m 644 config/prometheus.yml %{buildroot}/etc/map2/prometheus/prometheus.yml
install -m 644 config/prometheus-targets/audio-nodes.json %{buildroot}/etc/map2/prometheus/targets/audio-nodes.json
install -m 644 config/grafana/grafana.ini %{buildroot}/etc/map2/grafana/grafana.ini
install -m 644 config/grafana/provisioning/datasources/prometheus.yml %{buildroot}/etc/map2/grafana/provisioning/datasources/prometheus.yml
install -m 644 config/grafana/provisioning/dashboards/map2.yml %{buildroot}/etc/map2/grafana/provisioning/dashboards/map2.yml
install -m 644 config/grafana-dashboards/*.json %{buildroot}/etc/map2/grafana/dashboards/

mkdir -p %{buildroot}/usr/lib/systemd/system
install -m 644 packaging/systemd/map2-backend.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-tui.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-prometheus.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-grafana.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-avb.target %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-ptp4l.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-phc2sys.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-srpd.service %{buildroot}/usr/lib/systemd/system/
# T2521-8 — SonoBus / AOO remote-audio transport unit, env example,
# and firewalld zone fragment. ExecStart binary lands with T2521-4
# (until then the unit fails-to-start by design and an operator can
# disable it via `systemctl disable map2-sonobus-transport.service`).
install -m 644 packaging/systemd/map2-sonobus-transport.service %{buildroot}/usr/lib/systemd/system/
install -m 644 etc/map2/sonobus.env.example %{buildroot}/etc/map2/sonobus.env.example
mkdir -p %{buildroot}/usr/lib/firewalld/services
install -m 644 systemd/firewalld/map2-sonobus.xml %{buildroot}/usr/lib/firewalld/services/map2-sonobus.xml

mkdir -p %{buildroot}/usr/bin
ln -s /opt/map2/scripts/cli.py %{buildroot}/usr/bin/map2-cli
ln -s /opt/map2/scripts/self_test.py %{buildroot}/usr/bin/map2-self-test

%post
useradd -r -s /bin/false map2 2>/dev/null || true
# T2521-8 — reload firewalld so the SonoBus zone fragment becomes
# available. Best-effort; firewalld may not be installed on minimal
# images. The MAP2 service starts independent of firewalld.
firewall-cmd --reload >/dev/null 2>&1 || true

%preun
# T2521-8 — stop + disable the SonoBus transport on uninstall so
# the daemon doesn't keep its UDP ports + RT priority during the
# package removal. Run only on full uninstall (arg=0); skip on upgrade.
if [ $1 -eq 0 ]; then
    systemctl stop map2-sonobus-transport.service >/dev/null 2>&1 || true
    systemctl disable map2-sonobus-transport.service >/dev/null 2>&1 || true
fi

%postun
# T2521-8 — drop the firewalld service fragment if the operator
# enabled it. Best-effort; missing firewalld is not an error.
if [ $1 -eq 0 ]; then
    firewall-cmd --remove-service=map2-sonobus --permanent >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

%files
%license /opt/map2/LICENSE
%doc /opt/map2/README.md
/opt/map2/
/etc/map2/
/usr/lib/systemd/system/map2-backend.service
/usr/lib/systemd/system/map2-tui.service
/usr/lib/systemd/system/map2-prometheus.service
/usr/lib/systemd/system/map2-grafana.service
/usr/lib/systemd/system/map2-ptp4l.service
/usr/lib/systemd/system/map2-phc2sys.service
/usr/lib/systemd/system/map2-srpd.service
/usr/lib/systemd/system/map2-avb.target
/usr/lib/systemd/system/map2-sonobus-transport.service
/usr/lib/firewalld/services/map2-sonobus.xml
/usr/bin/map2-cli
/usr/bin/map2-self-test

%changelog
* Thu May 15 2026 Audio Team <audio@example.com>
- T2521-8: add SonoBus / AOO transport scaffolding (systemd unit,
  firewalld zone fragment, env example). Daemon binary lands with
  T2521-4. %preun stops + disables the unit on uninstall; %postun
  drops the firewalld fragment.
* Thu Jan 16 2026 Audio Team <audio@example.com>
- Initial release
