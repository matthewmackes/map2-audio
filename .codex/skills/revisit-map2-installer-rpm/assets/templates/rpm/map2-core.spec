Name:           map2-core
Version:        0.1.0
Release:        1%{?dist}
Summary:        MAP2 Audio Platform core runtime

License:        AGPL-3.0-only
URL:            https://github.com/matthewmackes/map2-audio
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  cmake
BuildRequires:  gcc-c++
BuildRequires:  make
BuildRequires:  systemd-rpm-macros
BuildRequires:  pkgconfig(alsa)
BuildRequires:  pkgconfig(pipewire-0.3)
BuildRequires:  python3-devel

Requires:       map2-config = %{version}-%{release}
Requires:       map2-services = %{version}-%{release}
Requires:       python3
Requires:       alsa-lib
Requires:       pipewire

%description
MAP2 core runtime binaries and shared runtime assets.

%prep
%autosetup -n map2-audio-%{version}

%build
# TODO: align with the real MAP2 build graph.
%cmake -S juce-engine -B build -DCMAKE_BUILD_TYPE=Release
%cmake_build -C build

%install
rm -rf %{buildroot}
install -d %{buildroot}%{_libexecdir}/map2
install -d %{buildroot}%{_datadir}/map2

# TODO: install core binaries/libraries into %{buildroot}
# install -m 0755 build/bin/map2-engine %{buildroot}%{_libexecdir}/map2/

%check
# TODO: add smoke tests if available
:

%files
%license LICENSE
%doc README.md
%dir %{_libexecdir}/map2
%dir %{_datadir}/map2

%changelog
* Mon Feb 23 2026 MAP2 Packaging Team <packaging@map2.local> - 0.1.0-1
- Initial map2-core SPEC skeleton
