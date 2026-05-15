# MAP2 Audio Platform — FHS Install Layout

**Status:** Authoritative — T2529 Q3 lock 2026-05-15
**Maintainer:** Platform Audio team
**See also:** [`SERVICE_USER.md`](SERVICE_USER.md), [`SECURITY_MODEL.md`](SECURITY_MODEL.md)

---

## TL;DR

MAP2 installs into a strict [FHS §3](https://refspecs.linuxfoundation.org/fhs.shtml)
split across seven canonical roots. The Python path authority
(`app/paths.py` — `Map2Paths`) resolves every path through env-var-overridable
plane roots; the defaults match this document exactly.

| Plane | Default root | FHS § | Owner:Group | Mode | What lives here |
|-------|--------------|-------|-------------|------|------------------|
| Application | `/opt/map2-audio/` | 3.13 | `root:root` | `0755` | Immutable app tree — Python, JUCE binaries, device-packs, scripts, LICENSE, README |
| System config | `/etc/map2/` | 3.7 | `root:root` | `0755` | Host configuration, Prometheus + Grafana provisioning, sub-service overrides |
| Service state | `/var/lib/map2/` | 5.8 | `map2:map2` | `0755` | Durable state — sessions, recordings, snapshots, devices, cluster DB |
| Cache | `/var/cache/map2/` | 5.5 | `map2:map2` | `0755` | Regen-safe — LV2 index, IR thumbnails, NAM download caches |
| Logs | `/var/log/map2/` | 5.10 | `map2:map2` | `0750` | Service logs, soak evidence (mode 0750 so non-map2 can't read) |
| Runtime | `/run/map2/` | 3.15 | `map2:map2` | `0755` | UDS sockets, PID files. Tmpfs — re-created at every boot. |
| systemd | `/usr/lib/systemd/system/` | 3.16 | `root:root` | `0755` | Unit files |

## Why this exists

Through 2026-Q1, MAP2 installed everything into `/home/mm/map2-audio` —
the operator's home directory. That worked for the developer but
silently broke fresh installs on every host where the first interactive
user was not `mm` or not UID 1000. T2529 filed 2026-05-15 to lock the
strict FHS §3 split documented here.

## Plane-by-plane detail

### `/opt/map2-audio/` — application install root (FHS §3.13)

Owned by `root:root`. The service user (`map2`) only **reads** from
here — never writes. Tree:

```
/opt/map2-audio/
├── app/                          # Python FastAPI backend
├── tui/                          # Textual TUI console
├── lcd/                          # LCD assets + scripts
├── scripts/                      # Operator-facing entrypoints
│   ├── cli.py
│   └── self_test.py
├── device-packs/                 # Controller / audio / midi profiles
├── juce-engine/build/            # Built C++ binaries
│   ├── map2-controller-host
│   ├── map2-sonobus-transport
│   └── map2_audio_engine*.so
├── requirements-backend-runtime.txt
├── requirements-installer.txt
├── LICENSE
└── README.md
```

`Map2Paths.app_install_dir()` resolves to this root. Override at the
dev-host via `MAP2_APP_INSTALL_DIR=/home/mm/map2-audio` so cmake-build
artefacts + device-packs + scripts still resolve to the working tree
without an RPM install.

### `/etc/map2/` — system config (FHS §3.7)

Owned by `root:root`. Read-only from the service POV, write-only from
operator (with sudo). Tree:

```
/etc/map2/
├── environment                   # root-owned env file (sourced by every unit)
├── environment.d/                # mode 0775, group=map2 — operator drop-ins
│   └── *.env
├── prometheus/
│   ├── prometheus.yml
│   └── targets/audio-nodes.json
├── grafana/
│   ├── grafana.ini
│   ├── provisioning/
│   └── dashboards/
├── sonobus.env.example
├── pipewire-targets/             # optional pipewire profile overrides
└── ...
```

The `environment.d/` directory is the operator's drop-in slot — group
`map2` with mode `0775` so anyone in the `map2` group can edit env
overrides without becoming root over the entire `/etc/map2/` tree.

### `/var/lib/map2/` — durable service state (FHS §5.8)

Owned by `map2:map2`, mode `0755`. Provisioned by `systemd-tmpfiles`
(see `packaging/tmpfiles.d/map2.conf`). Tree:

```
/var/lib/map2/
├── snapshots/                    # T2504 snapshot bundles
├── devices/                      # per-installation device overrides
├── sessions/                     # T2504 multi-track sessions
├── recordings/                   # T2508 recorded WAV takes
├── prometheus/                   # TSDB
├── grafana/                      # Grafana state + plugins
├── lifecycle/                    # cluster lifecycle markers
├── platform-events.db            # event sink
├── cluster.db                    # cluster service DB
└── ...
```

Subdirectories `snapshots/`, `devices/`, `sessions/`, `recordings/` are
pre-created at install time by `tmpfiles.d` so a fresh install + immediate
engine launch doesn't race against directory creation.

### `/var/cache/map2/` — caches (FHS §5.5)

Owned by `map2:map2`, mode `0755`. Safe to `rm -rf` at any time — the
service regenerates everything on next access. Holds:

- `lv2-index.json` — LV2 plugin scan result (regen on full scan)
- `ir-thumbnails/` — waveform thumbnail PNGs for the IR library
- NAM model download cache
- Soundfont download cache

### `/var/log/map2/` — logs (FHS §5.10)

Owned by `map2:map2`, mode `0750`. The restrictive mode prevents
non-`map2` / non-root users from reading log files, since journald-via-
syslog mirrors can leak process state otherwise. An operator who needs
log access joins the `map2` group.

```
/var/log/map2/
├── backend.log
├── controller-host.log
├── sonobus-transport.log
└── soak/                         # fit-for-purpose evidence dirs
    └── <YYYYMMDD>/
```

### `/run/map2/` — runtime sockets + PID files (FHS §3.15)

Owned by `map2:map2`, mode `0755`. Tmpfs — re-created after every reboot
by `systemd-tmpfiles-setup.service`. Holds:

- `controller-host.sock` — libremidi + QuickJS daemon UDS
- `sonobus-transport.sock` — AOO/SonoBus daemon UDS
- PID files for ad-hoc supervisor work

This is also the value of `XDG_RUNTIME_DIR` for every MAP2 service unit
(replaces the per-operator `/run/user/<UID>/` that broke non-1000-UID
hosts).

### `/usr/lib/systemd/system/` — unit files (FHS §3.16)

Owned by `root:root`. Standard systemd location. MAP2 ships:

- `map2-backend.service`
- `map2-tui.service`
- `map2-cluster.service`
- `map2-frontend.service`
- `map2-controller-host.service`
- `map2-sonobus-transport.service`
- `map2-prometheus.service`
- `map2-grafana.service`
- `map2-ptp4l.service` / `map2-phc2sys.service` / `map2-srpd.service` (AVB)
- `map2-avb.target` (group target)
- `pipewire-system.service.d/10-map2-audio.conf` (drop-in for the
  system-wide PipeWire instance)

## Verification

```bash
# All seven plane roots exist with the right owner + mode:
$ stat -c '%n %U:%G %a' \
    /opt/map2-audio /etc/map2 /var/lib/map2 \
    /var/cache/map2 /var/log/map2 /run/map2
/opt/map2-audio root:root 755
/etc/map2 root:root 755
/var/lib/map2 map2:map2 755
/var/cache/map2 map2:map2 755
/var/log/map2 map2:map2 750
/run/map2 map2:map2 755

# RPM ownership matches:
$ rpm -qV map2
(no output = all packaged files match)

# Python path authority resolves to the FHS defaults:
$ python3 -c 'from app.paths import Map2Paths; \
    print(Map2Paths.app_install_dir(), Map2Paths.runtime_dir(), \
          Map2Paths.cache_dir(), Map2Paths.log_dir())'
/opt/map2-audio /run/map2 /var/cache/map2 /var/log/map2
```

## Env-var overrides

Every plane root is overridable via env var. The override flips the
whole plane atomically — every derived path (e.g. `controller_host_socket_path()`)
follows. Use overrides for:

- Dev-host workflow: `MAP2_APP_INSTALL_DIR=/home/mm/map2-audio` to
  resolve binaries + scripts against the working tree.
- CI sandboxing: per-job tmp dirs for every plane.
- Site customization: alternate storage path for one plane (e.g.
  `MAP2_SERVICE_STATE_DIR=/srv/map2` on a deployment with an SSD pool).

| Plane | Env var |
|-------|---------|
| `app_install` | `MAP2_APP_INSTALL_DIR` |
| `host` | `MAP2_HOST_CONFIG_DIR` |
| `service` | `MAP2_SERVICE_STATE_DIR` |
| `cache` | `MAP2_CACHE_DIR` |
| `log` | `MAP2_LOG_DIR` |
| `runtime` | `MAP2_RUNTIME_DIR` |
| `user` | `MAP2_USER_DIR` (per-user data, defaults to `~/.map2`) |

`Map2Paths.is_fhs_install()` returns `True` iff `MAP2_APP_INSTALL_DIR`
is unset or matches the default — useful for code paths that need to
behave differently between FHS-install and dev-host.

## Why these paths, not others?

The FHS §3 layout has rationale per-directory. Drift here defeats the
entire T2529 migration. Common temptations:

- **"Why not `/opt/map2`?"** — that's where pre-T2529 builds installed.
  We added `-audio` so a future second product from the same vendor (e.g.
  a video pipeline) can land at `/opt/map2-video` without conflict, and
  so RPM upgrade-paths from the old `/opt/map2` install don't silently
  overwrite the new tree.
- **"Why `/var/lib/map2` for state, not `/opt/map2-audio/data`?"** —
  FHS §3.13 says `/opt/<package>` is **read-only application data**. A
  service that writes into `/opt/` defeats the FHS contract and breaks
  read-only filesystems (e.g. immutable Fedora variants like Silverblue).
- **"Why `/run/map2` for UDS sockets, not `/var/run/map2`?"** — `/var/run`
  has been a symlink to `/run` since systemd's introduction; FHS §3.15
  is canonical. `/run` is tmpfs and `systemd-tmpfiles` re-creates the
  dir after every reboot.

## Cross-references

- Path authority: `app/paths.py` — `Map2Paths`
- Declarative provisioning: `packaging/sysusers.d/map2.conf` + `packaging/tmpfiles.d/map2.conf`
- RPM spec: `packaging/rpm/map2.spec`
- T2529 epic and locked decisions: `docs/PROJECT_WORKLIST.md` § T2529
- FHS standard: https://refspecs.linuxfoundation.org/fhs.shtml
- Fedora Packaging Guidelines: https://docs.fedoraproject.org/en-US/packaging-guidelines/
- Debian Policy Manual: https://www.debian.org/doc/debian-policy/
