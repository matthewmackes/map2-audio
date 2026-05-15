# MAP2 Audio Platform — Dedicated Service User

**Status:** Authoritative — T2529 lock 2026-05-15
**Maintainer:** Platform Audio team
**See also:** [`FHS_LAYOUT.md`](FHS_LAYOUT.md) (canonical install paths), [`SECURITY_MODEL.md`](SECURITY_MODEL.md) (sandboxing model)

---

## TL;DR

MAP2 runs as the dedicated `map2` system service user with an auto-assigned
UID honoring `/etc/login.defs SYS_UID_MIN`. It is **not** tied to the
operator's account, UID 1000, or `/home/mm/`. The user is created at
package install time by `systemd-sysusers` and **deliberately preserved
across package uninstall** so operator state in `/var/lib/map2/` is never
orphaned.

## Why this exists

Through 2026-Q1 the platform was tied to the `mm` operator account in
multiple layers — 12 systemd unit files hardcoded `User=mm`,
`WorkingDirectory=/home/mm/map2-audio`, `XDG_RUNTIME_DIR=/run/user/1000`,
and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus`. 30+ paths
referenced `/home/mm/` directly. App config read from `~/.map2/` and
`~/.config/pipewire/`. The PipeWire integration assumed a per-user
session daemon at `/run/user/<UID>/pipewire-0`.

Fresh install on a host where the first interactive user was **not**
UID 1000 (or not named `mm`) silently failed at the audio path. T2529
filed 2026-05-15 to untie the platform from the operator account.

## Q1-Q5 decision locks (frozen 2026-05-15)

| # | Decision |
|---|----------|
| Q1 | **Service user**: `useradd --system` honoring `/etc/login.defs UID_MIN`. Groups: `audio`, `pipewire`, `pipewire-system`, `video`, `input`, `plugdev`. Shell: `/sbin/nologin`. Home: `/var/lib/map2`. |
| Q2 | **PipeWire**: system-wide instance (`pipewire-system.service`), socket at `/run/pipewire-system/pipewire-0`. `XDG_RUNTIME_DIR=/run/map2` bypasses per-user runtime dir. |
| Q3 | **Install layout**: strict FHS §3 split — see [`FHS_LAYOUT.md`](FHS_LAYOUT.md). |
| Q4 | **Migration**: fresh install only, no migration shim. Existing `mm`-account installs keep their current layout. |
| Q5 | **Verification**: full test matrix — Fedora 41 VM + Ubuntu 24.04 VM + non-mm operator on dev host + RT audio gates. |

## How the user is created

### Declarative source — `packaging/sysusers.d/map2.conf`

```
u  map2  -  "MAP2 Audio Platform service"  /var/lib/map2  /sbin/nologin
```

The `-` in the ID column tells `systemd-sysusers` to auto-assign a UID
in the system range (typically 100-999; honored from
`/etc/login.defs SYS_UID_MIN..SYS_UID_MAX`).

### RPM scriptlet — `packaging/rpm/map2.spec %pre`

```spec
%pre
%sysusers_create_package map2 %{_sysusersdir}/map2.conf
```

`%sysusers_create_package` is the Fedora-blessed RPM macro that invokes
`systemd-sysusers --replace` against the bundled conf file. It is
idempotent: re-running on an existing install is a no-op.

### Group memberships — `packaging/rpm/map2.spec %post`

```bash
for grp in audio pipewire pipewire-system video input plugdev; do
    if getent group "$grp" >/dev/null 2>&1; then
        usermod -aG "$grp" map2 >/dev/null 2>&1 || true
    fi
done
```

Each group is checked with `getent` first so a minimal Fedora image
without (e.g.) the `pipewire-system` group doesn't fail the install
(Q1 portability requirement). The `-aG` flag **appends** to existing
groups — never replaces.

### Canonical directories — `packaging/tmpfiles.d/map2.conf`

```
d  /var/lib/map2    0755  map2  map2  -  -
d  /var/cache/map2  0755  map2  map2  -  -
d  /var/log/map2    0750  map2  map2  -  -
d  /run/map2        0755  map2  map2  -  -
```

`systemd-tmpfiles` runs at boot (`systemd-tmpfiles-setup.service`) and
re-creates `/run/map2` after every reboot since `/run` is tmpfs.

`/var/log/map2` is mode `0750` so non-`map2` / non-root users can't read
log files — avoids leaking process state through journald-via-syslog
mirrors. An operator who needs log access joins the `map2` group.

## Verification

Confirm the user exists and is in the right groups:

```bash
$ getent passwd map2
map2:x:991:991:MAP2 Audio Platform service:/var/lib/map2:/sbin/nologin

$ getent group map2
map2:x:991:

$ id map2
uid=991(map2) gid=991(map2) groups=991(map2),63(audio),971(pipewire),970(pipewire-system),39(video),104(input),977(plugdev)
```

The exact UID/GID varies per machine. The `groups` set should always include
at least `map2`, `audio`, and either `pipewire` or `pipewire-system` (or both).

Confirm the canonical dirs exist with the right ownership:

```bash
$ stat -c '%n %U:%G %a' /var/lib/map2 /var/cache/map2 /var/log/map2 /run/map2
/var/lib/map2 map2:map2 755
/var/cache/map2 map2:map2 755
/var/log/map2 map2:map2 750
/run/map2 map2:map2 755
```

## Decommissioning

Package uninstall **deliberately does not remove** the `map2` user. Per
FHS §5.5 + Fedora Packaging Guidelines + Debian Policy Manual §10.7,
operator data in `/var/lib/map2/` must be preserved across package
removal. To fully decommission:

```bash
sudo systemctl stop map2-backend.service map2-controller-host.service
sudo systemctl disable map2-backend.service map2-controller-host.service
sudo dnf remove map2                  # or: dpkg -r map2
sudo rm -rf /var/lib/map2 /var/cache/map2 /var/log/map2
sudo userdel map2
sudo groupdel map2                    # only if no leftover files reference the GID
```

## Operator overrides

The operator can override per-service environment by dropping `*.env`
files into `/etc/map2/environment.d/`. That directory is mode `0775`
with owner `root` and group `map2`, so any operator who runs `sudo -g map2`
can drop in overrides without becoming root over the entire `/etc/map2/`
tree (see [`FHS_LAYOUT.md`](FHS_LAYOUT.md) for the wider permissions model).

Example — override PipeWire latency for a specific deployment:

```bash
$ sudo -g map2 tee /etc/map2/environment.d/site-latency.env <<'EOF'
PIPEWIRE_LATENCY=128/48000
EOF
$ sudo systemctl restart map2-backend.service
```

## Cross-references

- T2529 epic and locked decisions: `docs/PROJECT_WORKLIST.md` § T2529
- Declarative source files: `packaging/sysusers.d/map2.conf` + `packaging/tmpfiles.d/map2.conf`
- RPM spec: `packaging/rpm/map2.spec`
- systemd units (installed copies): `/usr/lib/systemd/system/map2-*.service`
- Path authority: `app/paths.py` — `Map2Paths`
- Fedora Packaging Guidelines: https://docs.fedoraproject.org/en-US/packaging-guidelines/UsersAndGroups/
- `man 5 sysusers.d` / `man 5 tmpfiles.d`
- `man 8 systemd-sysusers` / `man 8 systemd-tmpfiles`
