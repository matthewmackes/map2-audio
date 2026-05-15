# MAP2 Audio Platform — Security Model

**Status:** Authoritative — T2529-B 2026-05-15
**Maintainer:** Platform Audio team
**See also:** [`SERVICE_USER.md`](SERVICE_USER.md), [`FHS_LAYOUT.md`](FHS_LAYOUT.md)

---

## TL;DR

MAP2 services run with the minimum capabilities, syscalls, and filesystem
write access they actually need. The model has four layers:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **Identity** | `User=map2` + `Group=map2` (system-UID) | All non-root units |
| **Filesystem** | `ProtectSystem=strict` + `ReadWritePaths=` allowlist | All units |
| **Capabilities** | `CapabilityBoundingSet=` + `AmbientCapabilities=` | All units |
| **Syscalls** | `SystemCallFilter=@<allowed>` + `~@<denied>` (seccomp) | All units |

Plus universal kernel-surface protections (`ProtectKernel*`, `LockPersonality`,
`RestrictNamespaces`, etc.) — see Section 5.

---

## 1. Identity layer (T2529-A2)

Every MAP2 service runs as the dedicated `map2` system service user with an
auto-assigned UID honoring `/etc/login.defs SYS_UID_MIN`. The user is
created at install time by `systemd-sysusers` (declarative source:
`/usr/lib/sysusers.d/map2.conf`) and is in the supplementary groups
needed for audio device + system-wide PipeWire access:

| Group | Purpose |
|-------|---------|
| `audio` | ALSA device access |
| `pipewire` | per-user PipeWire socket (`/run/user/<UID>/pipewire-0`) — present but not used in the FHS-install path |
| `pipewire-system` | system-wide PipeWire socket (`/run/pipewire-system/pipewire-0`) |
| `video` | V4L2 / DRM access (LCD, future video pipeline) |
| `input` | event device access for HID controllers |
| `plugdev` | USB device hotplug events |

Exempt: three AVB infra units (`map2-srpd`, `map2-ptp4l`, `map2-phc2sys`)
run as `root` because they need raw socket + clock-set capabilities that
cannot be granted to a non-root user via `Ambient`. They are sandbox-bound
identically to the non-root units (Sections 4-6) so the elevated identity
buys them only what they actually need.

See [`SERVICE_USER.md`](SERVICE_USER.md) for the user-creation flow,
group memberships, and decommissioning procedure.

---

## 2. Filesystem layer (T2529-A1, T2529-B1)

`ProtectSystem=strict` mounts `/usr`, `/boot`, `/efi` read-only inside the
service's mount namespace, and inherits the restriction down to `/etc` and
`/var`. The unit then declares an explicit write allowlist via
`ReadWritePaths=`. Drift here would defeat the FHS contract — see
[`FHS_LAYOUT.md`](FHS_LAYOUT.md) for the canonical plane roots.

Combined with `ProtectHome=true` (no `/home` access) and `PrivateTmp=true`
(per-unit `/tmp` namespace), the service's filesystem view is reduced to:

- Read-only: `/usr`, `/etc/map2`, `/opt/map2-audio` (everything else read-locked)
- Read-write: per-unit `ReadWritePaths=` (typically `/run/map2 /var/lib/map2 /var/cache/map2 /var/log/map2`)
- Private: `/tmp` (per-unit namespace, evaporates at unit stop)
- Hidden: `/home`, `/root`, `/boot`, every other top-level

Per-unit ReadWritePaths (canonical):

| Unit | Write allowlist |
|------|------------------|
| map2-backend | `/run/map2 /var/lib/map2 /var/cache/map2 /var/log/map2` |
| map2-tui | `/run/map2 /var/log/map2` |
| map2-controller-host | `/run/map2 /var/log/map2` |
| map2-sonobus-transport | `/run/map2 /var/log/map2` |
| map2-cluster | `/var/lib/map2 /var/log/map2 /run/map2` |
| map2-frontend | `/var/log/map2` |
| map2-prometheus | `/var/lib/map2/prometheus /var/log/map2` |
| map2-grafana | `/var/lib/map2/grafana /var/log/map2/grafana` |
| map2-srpd | `/var/log/map2` |
| map2-ptp4l | `/var/log/map2` |
| map2-phc2sys | `/var/log/map2` |

The pytest gate `test_unit_readwritepaths_fhs_only` blocks any drift to
`/home/`, `/root/`, or `/usr/local/`.

---

## 3. Network layer (T2529-B1)

`RestrictAddressFamilies=` is a per-unit allowlist for the socket(2)
domain. The default systemd policy exposes every `AF_*` (e.g. Bluetooth,
CAN, RDS, X25) which MAP2 has no business touching. Per-unit allowlists:

| Unit | Allowlist | Why |
|------|-----------|-----|
| map2-backend | AF_UNIX AF_INET AF_INET6 AF_NETLINK AF_PACKET | uvicorn + AVDECC pcap |
| map2-controller-host | AF_UNIX AF_INET AF_INET6 AF_NETLINK | libremidi netlink for hotplug |
| map2-sonobus-transport | AF_UNIX AF_INET AF_INET6 AF_NETLINK | AOO UDP + JACK |
| map2-tui | AF_UNIX AF_INET AF_INET6 | local HTTP only |
| map2-cluster | AF_UNIX AF_INET AF_INET6 | cluster RPC |
| map2-frontend | AF_UNIX AF_INET AF_INET6 | static HTTP |
| map2-prometheus | AF_UNIX AF_INET AF_INET6 | scrape + serve |
| map2-grafana | AF_UNIX AF_INET AF_INET6 | dashboard |
| map2-srpd | AF_UNIX AF_INET AF_INET6 AF_NETLINK AF_PACKET | raw 1722 frames |
| map2-ptp4l | AF_UNIX AF_INET AF_INET6 AF_NETLINK AF_PACKET | raw PTP frames |
| map2-phc2sys | AF_UNIX AF_INET AF_INET6 AF_NETLINK | PHC over netlink |

---

## 4. Capability layer (T2529-B2)

Linux capabilities are split-root permissions. The default systemd policy
inherits every `CAP_*` from PID 1; MAP2 pins each unit to the minimum it
actually needs via `CapabilityBoundingSet=` (the hard cap) and
`AmbientCapabilities=` (the set inherited by spawned threads).

| Unit | AmbientCapabilities | Why |
|------|----------------------|-----|
| map2-backend | CAP_SYS_NICE, CAP_NET_RAW | RT scheduling + AVDECC libpcap |
| map2-controller-host | CAP_SYS_NICE | libremidi I/O thread → SCHED_FIFO/70 |
| map2-sonobus-transport | CAP_SYS_NICE, CAP_NET_BIND_SERVICE | AOO RT + privileged port override |
| map2-srpd | CAP_NET_ADMIN, CAP_NET_RAW | 802.1Qat reservation + raw frames |
| map2-ptp4l | CAP_NET_ADMIN, CAP_NET_RAW, CAP_SYS_TIME | raw PTP + PHC set |
| map2-phc2sys | CAP_SYS_TIME, CAP_NET_ADMIN | sys-clock set from PHC |
| map2-tui, map2-cluster, map2-frontend, map2-prometheus, map2-grafana | **EMPTY** | no privileges needed |

The "EMPTY" entries use the explicit empty form (`CapabilityBoundingSet=`
on its own line) which drops every `CAP_*` per `man 7 capabilities`.
Without this directive, the unit inherits every `CAP_*` from systemd's
default and `systemd-analyze security` flags it.

The pytest gate `test_backend_does_not_request_cap_sys_admin` (and
equivalent for every unit) enforces that **no MAP2 unit ever requests
`CAP_SYS_ADMIN`** — systemd's "God mode" capability, which would defeat
the entire model.

---

## 5. Syscall layer (T2529-B3)

`SystemCallFilter=` installs a seccomp filter per unit. Denied syscalls
return `EPERM` (so the process stays alive but the syscall fails) rather
than `SIGSYS` (which would kill the unit on first denied syscall — e.g. a
Python lib probing for a feature).

### Universal denylist

Every MAP2 unit denies these syscall classes:

| Class | Examples | Why |
|-------|----------|-----|
| `@debug` | ptrace, kcmp, perf_event_open | post-exploitation pivot |
| `@module` | init_module, finit_module, delete_module | kernel module load |
| `@mount` | mount, pivot_root, umount2 | container-escape pivot |
| `@obsolete` | uselib, ustat, sysfs | legacy/deprecated |
| `@raw-io` | iopl, ioperm | PIO access |
| `@reboot` | reboot, kexec_load | obvious |
| `@swap` | swapon, swapoff | denial-of-service vector |

Non-root units add `@privileged` (defense-in-depth: forbidden even if a
future regression accidentally grants ambient caps).

Non-time units (everything except PTP4L + PHC2SYS) deny `@clock` — even
if `CAP_SYS_TIME` were ever accidentally inherited, the seccomp filter
blocks `clock_settime` / `adjtimex`.

### Per-unit allowlist

| Unit | Allowlist |
|------|-----------|
| map2-backend, map2-controller-host, map2-sonobus-transport | `@system-service @audio @resources` |
| map2-tui, map2-cluster, map2-frontend, map2-prometheus, map2-grafana | `@system-service` |
| map2-srpd | `@system-service @network-io` |
| map2-ptp4l, map2-phc2sys | `@system-service @network-io @clock` |

`@system-service` is the canonical allowlist for service-style daemons —
covers fork/exec/wait, file I/O, signals, sockets, futex, mmap, etc.

`@audio` (RT-audio units only) adds ALSA ioctls and sound device control.

`@resources` (RT-audio units only) adds `sched_setaffinity`, `setpriority`,
and `mlock` — required for `pthread_setschedparam(SCHED_FIFO)` and
`LimitMEMLOCK=infinity` to actually take effect.

### Other seccomp directives

- `SystemCallErrorNumber=EPERM` — denied syscalls return `-1/EPERM`
  instead of `SIGSYS`-killing the unit.
- `SystemCallArchitectures=native` — drops x32 / i386 / aarch64 compat
  ABIs that would bypass the seccomp filter.

---

## 6. Kernel-surface protections (T2529-B1)

Universal directives across every hardened unit:

| Directive | Effect |
|-----------|--------|
| `NoNewPrivileges=yes` | no setuid/setgid binary can elevate within the unit |
| `ProtectKernelTunables=yes` | no writes to /proc/sys, /sys |
| `ProtectKernelModules=yes` | no module load (belt-and-suspenders with `@module` deny) |
| `ProtectKernelLogs=yes` | no /dev/kmsg writes |
| `ProtectControlGroups=yes` | no cgroup writes outside the unit's own slice |
| `ProtectClock=yes` | no clock_settime (except PTP/PHC2SYS which need it) |
| `ProtectHostname=yes` | no sethostname |
| `RestrictSUIDSGID=yes` | mkfifo/chmod can't create suid/sgid files |
| `RestrictNamespaces=yes` | no CLONE_NEW* namespace creation |
| `LockPersonality=yes` | no personality(2) syscalls (rare ABI switch) |

Combined with `RestrictAddressFamilies=` (Section 3), `CapabilityBoundingSet=`
(Section 4), `SystemCallFilter=` (Section 5), and the filesystem layer
(Section 2), the unit's effective kernel surface is reduced to ≤ 5% of
what the systemd default exposes.

---

## 7. Realtime carve-out

RT-audio units (`map2-backend`, `map2-controller-host`,
`map2-sonobus-transport`) deliberately leave `RestrictRealtime=false`
because the JUCE audio callback thread, libremidi I/O thread, and AOO
send/receive thread all `pthread_setschedparam(SCHED_FIFO)` themselves.
Without that, RT scheduling silently fails and the soak gates blow up
(peak-block-jitter > 0.35 ms threshold).

The pytest gate `test_rt_unit_does_not_restrict_realtime` prevents a
future operator-only edit from silently enabling `RestrictRealtime=true`
on these units.

The non-RT units (`tui`, `cluster`, `frontend`, `prometheus`, `grafana`)
do not need RT scheduling — they don't currently set `RestrictRealtime`
explicitly but get the default-on behavior from systemd's protective
template.

---

## 8. Verification

### `systemd-analyze security`

Target: per-unit score < 2.0. Run after `systemctl daemon-reload`:

```bash
$ systemd-analyze security map2-backend.service
  → exposure level: 1.8 OK 🟢

$ for unit in map2-{backend,tui,cluster,frontend,controller-host,sonobus-transport,prometheus,grafana,srpd,ptp4l,phc2sys}.service; do
    echo "== $unit ==";
    systemd-analyze security "$unit" | tail -3;
  done
```

The full per-directive exposure breakdown is on the T2529-V2 evidence dir
at `docs/fit-for-purpose-evidence/<date>/t2529-service-user/`.

### `pytest tests/test_t2529_*.py`

The full T2529 test suite locks every directive shape:

```bash
$ python3 -m pytest tests/test_t2529_*.py -q
531 passed in 4.88s
```

This is the day-to-day regression gate — runs on every commit via CI.

### `getpcaps <pid>`

After the unit starts, the live capability set is observable via:

```bash
$ sudo getpcaps $(systemctl show map2-backend.service -p MainPID | cut -d= -f2)
ManiPID: =cap_net_raw,cap_sys_nice+ep
```

The set should match the unit's `AmbientCapabilities=` declaration exactly.
A T2529-V2 evidence run captures `getpcaps` snapshots for every unit.

---

## 9. Threat model

This is what the security model is + is **not** designed to defend against:

### In scope (model designed to mitigate)
- **Operator-account compromise**: an attacker who compromises the
  `mm` operator's interactive shell does NOT inherit MAP2's privileges
  (different UID, separate group memberships).
- **Plugin-loaded code execution**: a malicious LV2 plugin loaded into
  the JUCE engine cannot escalate via the audio thread's `CAP_SYS_NICE`
  — `NoNewPrivileges` + the seccomp filter block both setuid binaries
  and `ptrace`-style introspection.
- **Container-escape-style pivots**: `ProtectKernelModules`, `@module`
  deny, `ProtectKernelTunables`, `RestrictNamespaces`, and
  `ProtectControlGroups` block the four common Linux pivots.
- **Filesystem traversal/write to operator data**: `ProtectHome=true` +
  `ReadWritePaths=` allowlist confine writes to `/var/lib/map2`,
  `/var/cache/map2`, `/var/log/map2`, and `/run/map2`.

### Out of scope (NOT mitigated)
- **Root compromise via the AVB stack**: `map2-srpd`, `map2-ptp4l`, and
  `map2-phc2sys` run as `root` because the kernel requires it for raw
  socket and clock-set syscalls. They have the same sandbox set as the
  non-root units, but a successful compromise of one of these gives the
  attacker the granted capabilities (NET_ADMIN, NET_RAW, SYS_TIME).
- **Lateral movement to the operator account**: nothing prevents an
  operator who gains code execution **as `map2`** from then reading
  files the `mm` account allows world-read (e.g. `/home/mm/Public/`).
  Operators concerned about this set restrictive perms on operator-home
  shared dirs.
- **Side-channel attacks** (Spectre/Meltdown/cache timing): the model
  does not isolate against speculative-execution side-channels. The host
  kernel should be patched per vendor advisories.

---

## 10. Cross-references

- Worklist epic: `docs/PROJECT_WORKLIST.md` § T2529
- Service-user model: [`SERVICE_USER.md`](SERVICE_USER.md)
- FHS install layout: [`FHS_LAYOUT.md`](FHS_LAYOUT.md)
- Path authority: `app/paths.py` — `Map2Paths`
- Hardened systemd units: `packaging/systemd/map2-*.service`
- Pytest gate suite: `tests/test_t2529_*.py`
- `man 5 systemd.exec` (the canonical reference for every directive)
- `man 7 capabilities` (per-capability semantics)
- `man 2 seccomp` (syscall filter semantics)
- Fedora Packaging Guidelines § "Sandboxing":
  https://docs.fedoraproject.org/en-US/packaging-guidelines/Sandboxing/
- Lennart Poettering "Mastering Time, Computers, And Containers":
  https://www.freedesktop.org/wiki/Software/systemd/
