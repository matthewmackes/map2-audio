Name:           map2
Version:        0.1.0
Release:        1%{?dist}
Summary:        Mackes Audio Platform V2 - Professional audio processing

License:        MIT
URL:            https://example.com/map2
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
BuildRequires:  python3-devel
BuildRequires:  python3-setuptools

Requires:       python3
Requires:       python3-fastapi >= 0.104.0
Requires:       python3-uvicorn >= 0.24.0
Requires:       python3-sqlalchemy >= 2.0.0
Requires:       python3-pydantic >= 2.5.0
Requires:       python3-numpy >= 1.24.0
Requires:       python3-textual >= 0.46.0

%description
MAP2 Audio Platform V2 - Professional real-time audio processing with
LV2 plugin hosting, MIDI routing, and dual LCD monitoring.

%prep
%setup -q

%build
python3 -m pip install -e .

%install
mkdir -p %{buildroot}/usr/lib/map2
mkdir -p %{buildroot}/etc/map2/prometheus/targets
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/datasources
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/dashboards
mkdir -p %{buildroot}/etc/map2/grafana/dashboards
cp -r app %{buildroot}/usr/lib/map2/
cp -r tui %{buildroot}/usr/lib/map2/
cp -r lcd %{buildroot}/usr/lib/map2/
cp -r scripts %{buildroot}/usr/lib/map2/
cp pyproject.toml %{buildroot}/usr/lib/map2/

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

mkdir -p %{buildroot}/usr/bin
ln -s /usr/lib/map2/scripts/cli.py %{buildroot}/usr/bin/map2-cli
ln -s /usr/lib/map2/scripts/self_test.py %{buildroot}/usr/bin/map2-self-test

%post
useradd -r -s /bin/false map2 2>/dev/null || true

%files
/usr/lib/map2/
/etc/map2/
/usr/lib/systemd/system/map2-backend.service
/usr/lib/systemd/system/map2-tui.service
/usr/lib/systemd/system/map2-prometheus.service
/usr/lib/systemd/system/map2-grafana.service
/usr/lib/systemd/system/map2-ptp4l.service
/usr/lib/systemd/system/map2-phc2sys.service
/usr/lib/systemd/system/map2-srpd.service
/usr/lib/systemd/system/map2-avb.target
/usr/bin/map2-cli
/usr/bin/map2-self-test

%changelog
* Thu Jan 16 2026 Audio Team <audio@example.com>
- Initial release
