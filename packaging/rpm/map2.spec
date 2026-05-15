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
BuildRequires:  systemd-rpm-macros

# T2529-A2 — systemd-sysusers + systemd-tmpfiles provide the FHS-compliant
# service-user + canonical-dir provisioning. systemd-rpm-macros provides
# %sysusers_create_package + %tmpfiles_create_package helpers below.
Requires(pre):  shadow-utils
Requires(pre):  systemd
Requires:       systemd

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
# T2529-A5 — system-wide PipeWire instance is the canonical audio substrate
# for the map2 service user (no per-user /run/user/<UID>/pipewire-* dependency).
Recommends:     pipewire
Recommends:     pipewire-system

%description
Mackes Audio Platform - Professional real-time audio processing with
LV2 plugin hosting, MIDI routing, and dual LCD monitoring.

Runs as the dedicated `map2` system service user (UID auto-assigned per
/etc/login.defs) with FHS-compliant install layout (/opt/map2-audio,
/etc/map2, /var/lib/map2, /var/cache/map2, /var/log/map2, /run/map2).

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
# T2529-A2: FHS §3 install layout — application tree under /opt/map2-audio,
# system config under /etc/map2, runtime/state/cache/log dirs created at
# install time by systemd-tmpfiles (see %post).

# /opt/map2-audio — immutable application tree
mkdir -p %{buildroot}/opt/map2-audio
cp -r app %{buildroot}/opt/map2-audio/
cp -r tui %{buildroot}/opt/map2-audio/
cp -r lcd %{buildroot}/opt/map2-audio/
cp -r scripts %{buildroot}/opt/map2-audio/
cp -r device-packs %{buildroot}/opt/map2-audio/
cp requirements-backend-runtime.txt %{buildroot}/opt/map2-audio/
cp requirements-installer.txt %{buildroot}/opt/map2-audio/
cp LICENSE README.md %{buildroot}/opt/map2-audio/
mkdir -p %{buildroot}/opt/map2-audio/juce-engine/build
install -m 755 juce-engine/build/map2-controller-host %{buildroot}/opt/map2-audio/juce-engine/build/map2-controller-host
install -m 755 juce-engine/build/map2_audio_engine*.so %{buildroot}/opt/map2-audio/juce-engine/build/

# /etc/map2 — system config tree (Prometheus, Grafana, sub-service overrides)
mkdir -p %{buildroot}/etc/map2/prometheus/targets
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/datasources
mkdir -p %{buildroot}/etc/map2/grafana/provisioning/dashboards
mkdir -p %{buildroot}/etc/map2/grafana/dashboards
install -m 644 config/prometheus.yml %{buildroot}/etc/map2/prometheus/prometheus.yml
install -m 644 config/prometheus-targets/audio-nodes.json %{buildroot}/etc/map2/prometheus/targets/audio-nodes.json
install -m 644 config/grafana/grafana.ini %{buildroot}/etc/map2/grafana/grafana.ini
install -m 644 config/grafana/provisioning/datasources/prometheus.yml %{buildroot}/etc/map2/grafana/provisioning/datasources/prometheus.yml
install -m 644 config/grafana/provisioning/dashboards/map2.yml %{buildroot}/etc/map2/grafana/provisioning/dashboards/map2.yml
install -m 644 config/grafana-dashboards/*.json %{buildroot}/etc/map2/grafana/dashboards/

# T2529-A2: sysusers.d + tmpfiles.d declarative provisioning.
# systemd-sysusers creates the `map2` user honoring /etc/login.defs UID_MIN.
# systemd-tmpfiles creates /var/lib/map2, /var/cache/map2, /var/log/map2,
# /run/map2 with map2:map2 ownership and the correct modes.
mkdir -p %{buildroot}/usr/lib/sysusers.d
install -m 644 packaging/sysusers.d/map2.conf %{buildroot}/usr/lib/sysusers.d/map2.conf
mkdir -p %{buildroot}/usr/lib/tmpfiles.d
install -m 644 packaging/tmpfiles.d/map2.conf %{buildroot}/usr/lib/tmpfiles.d/map2.conf

# systemd unit files (FHS path /usr/lib/systemd/system/)
mkdir -p %{buildroot}/usr/lib/systemd/system
install -m 644 packaging/systemd/map2-backend.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-tui.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-prometheus.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-grafana.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-avb.target %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-ptp4l.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-phc2sys.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-srpd.service %{buildroot}/usr/lib/systemd/system/
# T2529-A3 — controller-host daemon unit (libremidi + QuickJS dispatcher).
install -m 644 packaging/systemd/map2-controller-host.service %{buildroot}/usr/lib/systemd/system/
# T2529-A3 — cluster + frontend units land alongside the rest.
install -m 644 packaging/systemd/map2-cluster.service %{buildroot}/usr/lib/systemd/system/
install -m 644 packaging/systemd/map2-frontend.service %{buildroot}/usr/lib/systemd/system/
# T2521-8 — SonoBus / AOO remote-audio transport unit, env example,
# and firewalld zone fragment. ExecStart binary lands with T2521-4.
install -m 644 packaging/systemd/map2-sonobus-transport.service %{buildroot}/usr/lib/systemd/system/
install -m 644 etc/map2/sonobus.env.example %{buildroot}/etc/map2/sonobus.env.example
mkdir -p %{buildroot}/usr/lib/firewalld/services
install -m 644 systemd/firewalld/map2-sonobus.xml %{buildroot}/usr/lib/firewalld/services/map2-sonobus.xml

# Operator-facing CLI entrypoints (FHS path /usr/bin/, symlinks into /opt/map2-audio/scripts)
mkdir -p %{buildroot}/usr/bin
ln -s /opt/map2-audio/scripts/cli.py %{buildroot}/usr/bin/map2-cli
ln -s /opt/map2-audio/scripts/self_test.py %{buildroot}/usr/bin/map2-self-test

%pre
# T2529-A2 — create the map2 system user BEFORE files are installed so the
# tmpfiles.d invocation in %post can chown to it. Uses systemd-sysusers per
# Fedora Packaging Guidelines (https://docs.fedoraproject.org/en-US/packaging-guidelines/UsersAndGroups/).
%sysusers_create_package map2 %{_sysusersdir}/map2.conf

%post
# T2529-A2 — provision the canonical FHS dirs (/var/lib/map2, /var/cache/map2,
# /var/log/map2, /run/map2) with map2:map2 ownership.
%tmpfiles_create_package map2 %{_tmpfilesdir}/map2.conf

# T2529-A2 — add the map2 user to audio + PipeWire groups so the engine can
# open audio devices and the system-wide PipeWire instance. Best-effort: each
# group existence is checked first so a minimal Fedora image without the
# pipewire-system group doesn't fail the install.
for grp in audio pipewire pipewire-system video input plugdev; do
    if getent group "$grp" >/dev/null 2>&1; then
        usermod -aG "$grp" map2 >/dev/null 2>&1 || true
    fi
done

# T2521-8 — reload firewalld so the SonoBus zone fragment becomes available.
firewall-cmd --reload >/dev/null 2>&1 || true

# T2529-A2 — systemd unit refresh + tmpfiles re-creation (covers package
# upgrade case where unit content changed).
%systemd_post map2-backend.service map2-sonobus-transport.service map2-controller-host.service

%preun
# T2529-A2 — stop services on full uninstall (arg=0); skip on upgrade.
%systemd_preun map2-backend.service map2-sonobus-transport.service map2-controller-host.service

if [ $1 -eq 0 ]; then
    # T2521-8 — SonoBus disable
    systemctl stop map2-sonobus-transport.service >/dev/null 2>&1 || true
    systemctl disable map2-sonobus-transport.service >/dev/null 2>&1 || true
fi

%postun
# T2529-A2 — daemon-reload after unit files change.
%systemd_postun_with_restart map2-backend.service

if [ $1 -eq 0 ]; then
    # T2521-8 — firewalld cleanup on full uninstall
    firewall-cmd --remove-service=map2-sonobus --permanent >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true

    # T2529-A2 — DELIBERATELY do NOT remove the map2 user on package
    # uninstall. Per FHS §5.5 + Fedora/Debian packaging guidelines, package
    # removal must preserve user-generated data in /var/lib/map2. The
    # operator removes the user manually with:
    #   userdel map2 && groupdel map2 && rm -rf /var/lib/map2
    # if they want to fully decommission the platform.
    :
fi

%files
%license /opt/map2-audio/LICENSE
%doc /opt/map2-audio/README.md
/opt/map2-audio/
/etc/map2/
/usr/lib/systemd/system/map2-backend.service
/usr/lib/systemd/system/map2-tui.service
/usr/lib/systemd/system/map2-prometheus.service
/usr/lib/systemd/system/map2-grafana.service
/usr/lib/systemd/system/map2-ptp4l.service
/usr/lib/systemd/system/map2-phc2sys.service
/usr/lib/systemd/system/map2-srpd.service
/usr/lib/systemd/system/map2-avb.target
/usr/lib/systemd/system/map2-controller-host.service
/usr/lib/systemd/system/map2-cluster.service
/usr/lib/systemd/system/map2-frontend.service
/usr/lib/systemd/system/map2-sonobus-transport.service
/usr/lib/firewalld/services/map2-sonobus.xml
/usr/lib/sysusers.d/map2.conf
/usr/lib/tmpfiles.d/map2.conf
/usr/bin/map2-cli
/usr/bin/map2-self-test

%changelog
* Thu May 15 2026 Audio Team <audio@example.com>
- T2529-A2: switch to dedicated `map2` system service user via
  systemd-sysusers, canonical FHS dirs via systemd-tmpfiles.
  Application tree relocates /opt/map2 → /opt/map2-audio.
  RPM Requires(pre) adds shadow-utils + systemd. %pre creates user
  before files are installed; %post provisions /var/lib/map2,
  /var/cache/map2, /var/log/map2, /run/map2 with map2:map2 + adds
  the map2 user to audio/pipewire/pipewire-system/video/input/plugdev
  groups (best-effort, tolerates missing groups). %preun + %postun
  use the systemd RPM macros to handle unit start/stop cleanly across
  install/upgrade/uninstall. Package uninstall DELIBERATELY preserves
  the map2 user + /var/lib/map2 data per FHS §5.5; operator runs
  userdel + rm -rf manually to fully decommission.
* Thu May 15 2026 Audio Team <audio@example.com>
- T2521-8: add SonoBus / AOO transport scaffolding (systemd unit,
  firewalld zone fragment, env example). Daemon binary lands with
  T2521-4. %preun stops + disables the unit on uninstall; %postun
  drops the firewalld fragment.
* Thu Jan 16 2026 Audio Team <audio@example.com>
- Initial release
