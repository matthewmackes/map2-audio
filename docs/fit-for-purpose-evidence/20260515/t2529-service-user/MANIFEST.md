# T2529 Evidence — Manifest

**Date filed:** 2026-05-15
**Cycles covered:** T2529-A1 through T2529-V2 (20 cycles, 648 pytest cases)

Each row is a deliverable. Status is one of:

- ✅ **Filed**: artefact is in this directory and reviewed.
- ⏳ **CI-pending**: will be produced by the next CI run on master.
- 🔬 **Manual**: requires a one-time manual run (see `verification-runbook.md`).
- 🚧 **Bench-gated**: requires hardware access (UA-1000 + AVB switch).

## Phase A — FHS foundation

| ID | Deliverable | Status |
|----|-------------|--------|
| A1 | `packaging/sysusers.d/map2.conf` (declarative user) | ✅ Filed |
| A1 | `packaging/tmpfiles.d/map2.conf` (declarative dirs) | ✅ Filed |
| A2 | `packaging/rpm/map2.spec` rewritten with `%sysusers_create_package` + `%tmpfiles_create_package` | ✅ Filed |
| A2 | RPM `%post` group-add loop with `getent`-guarded `usermod -aG` | ✅ Filed |
| A2 | RPM `%postun` user-preservation per FHS §5.5 + Q4 lock | ✅ Filed |
| A3 | 12 systemd units migrated to `User=map2` + FHS paths | ✅ Filed |
| A3 | New `packaging/systemd/map2-controller-host.service` | ✅ Filed |
| A4 | `app/paths.py` extended with 4 new FHS plane roots | ✅ Filed |
| A4 | `Map2Paths.is_fhs_install()` detection helper | ✅ Filed |
| A5 | `packaging/pipewire/99-map2-audio.conf` (system-wide) | ✅ Filed |
| A5 | `packaging/pipewire/pipewire-system.service.d/10-map2-audio.conf` | ✅ Filed |
| A6 | `docs/install/SERVICE_USER.md` | ✅ Filed |
| A6 | `docs/install/FHS_LAYOUT.md` | ✅ Filed |

## Phase B — Capability sandboxing

| ID | Deliverable | Status |
|----|-------------|--------|
| B1 | `NoNewPrivileges=yes` + full `Protect*` set on 9 hardened units | ✅ Filed |
| B1 | `RestrictAddressFamilies=` per-unit allowlist | ✅ Filed |
| B1 | `LockPersonality`, `RestrictSUIDSGID`, `RestrictNamespaces` everywhere | ✅ Filed |
| B2 | Per-unit `CapabilityBoundingSet` + `AmbientCapabilities` | ✅ Filed |
| B2 | Empty cap set on 5 non-privileged units | ✅ Filed |
| B2 | `CAP_SYS_ADMIN` forbidden everywhere (pytest gate) | ✅ Filed |
| B3 | Per-unit `SystemCallFilter` allowlist + denylist | ✅ Filed |
| B3 | `SystemCallErrorNumber=EPERM` + `SystemCallArchitectures=native` | ✅ Filed |
| B4 | `docs/install/SECURITY_MODEL.md` (4-layer model + threat model) | ✅ Filed |

## Phase E — Cross-distro CI

| ID | Deliverable | Status |
|----|-------------|--------|
| E1 | `packaging/rpm/lint/.rpmlintrc` + project filters | ✅ Filed |
| E1 | `scripts/lint_rpm_spec.sh` runner | ✅ Filed |
| E2 | `packaging/deb/lint/lintian-overrides` + project filters | ✅ Filed |
| E2 | `scripts/lint_deb_via_alien.sh` runner | ✅ Filed |
| E3 | Fedora 41 CI job (rpmlint + rpmbuild + install + verify) | ✅ Filed |
| E3 | `ci-install-matrix/fedora-41-rpmlint.txt` | ⏳ CI-pending |
| E3 | `ci-install-matrix/fedora-41-install.log` | ⏳ CI-pending |
| E3 | `ci-install-matrix/fedora-41-systemd-analyze.txt` | ⏳ CI-pending |
| E4 | Ubuntu 24.04 CI job (alien + lintian) | ✅ Filed |
| E4 | `ci-install-matrix/ubuntu-2404-lintian.txt` | ⏳ CI-pending |
| E5 | `map2-self-test --full` mode | ✅ Filed |
| E5 | `ci-install-matrix/fedora-41-self-test-full.log` | ⏳ CI-pending |

## Phase V — Verification

| ID | Deliverable | Status |
|----|-------------|--------|
| V1 | This evidence dir + `README.md` + `MANIFEST.md` | ✅ Filed |
| V1 | `verification-runbook.md` (manual verification procedure) | ✅ Filed |
| V1 | Non-mm operator dev-host install + verification | 🔬 Manual |
| V1 | `pytest-gate-suite/t2529-tests.txt` (648 cases) | ✅ Filed |
| V2 | `rt-audio-gates/jack-direct-verify.txt` (JACK direct path) | 🚧 Bench-gated |
| V2 | `rt-audio-gates/pw-metadata.txt` (PipeWire quantum + rate) | 🚧 Bench-gated |
| V2 | `rt-audio-gates/ps-rt-threads.txt` (SCHED_FIFO threads) | 🚧 Bench-gated |
| V2 | `rt-audio-gates/getpcaps-*.txt` (live capability per process) | 🚧 Bench-gated |
| V2 | `rt-audio-gates/soak-30min-output.txt` (peak jitter < 0.35 ms) | 🚧 Bench-gated |

## Bench-gated work

T2529-V2 requires hardware access (Edirol UA-1000 audio interface + AVB
switch + the kernel-rt host with `isolcpus=4,5` + `nohz_full=4,5`). These
artefacts cannot be produced without bench access; they are listed here
so the bench operator knows what to capture during the next bench
session. The non-bench T2529 work (cycles A1-E5 + V1 docs) is complete
and pytest-gated.

## How to refresh CI-pending artefacts

```bash
# 1. Push to master to trigger the workflow
git push origin master

# 2. Wait for completion (~12-15 min)
gh run watch

# 3. Download artefacts
gh run download <run-id> --dir ci-install-matrix/
```

## How to refresh manual deliverables

See `verification-runbook.md` for the per-deliverable procedure.
