# T2529-V1 + T2529-V2 — Service-user migration evidence

**Date:** 2026-05-15
**Epic:** T2529 — Untie MAP2 from the operator account
**Owner:** Platform Audio team

---

## What this directory holds

This is the canonical evidence trail for the T2529 service-user migration.
Per the Q5 lock (2026-05-15), every cycle that lands a behavior change
must produce verifiable artefacts in this directory.

```
20260515/t2529-service-user/
├── README.md                              ← this file
├── MANIFEST.md                            ← canonical artefact list
├── verification-runbook.md                ← manual verification procedure
├── ci-install-matrix/                     ← T2529-E3 + T2529-E4 outputs
│   ├── fedora-41-rpmlint.txt              ← rpmlint output against the spec
│   ├── fedora-41-install.log              ← dnf install + verification log
│   ├── fedora-41-systemd-analyze.txt      ← per-unit security score
│   ├── fedora-41-self-test-full.log       ← map2-self-test --full output
│   ├── ubuntu-2404-alien.log              ← rpm → deb conversion log
│   ├── ubuntu-2404-lintian.txt            ← lintian output against the .deb
│   └── ubuntu-2404-summary.md             ← cross-distro qualifier summary
├── non-mm-operator-dev-host/              ← V1 task: a non-mm user installs + runs
│   ├── install-log.txt                    ← dnf install + scriptlet output
│   ├── getent-passwd-map2.txt             ← post-install user state
│   ├── getent-group-map2.txt              ← post-install group state
│   ├── id-map2.txt                        ← supplementary groups
│   ├── stat-fhs-dirs.txt                  ← mode + ownership of FHS dirs
│   ├── systemctl-status.txt               ← unit status post-start
│   ├── self-test-full.log                 ← `map2-self-test --full` output
│   └── operator-account.txt               ← which non-mm operator was used + their UID
├── pytest-gate-suite/                     ← The 11-suite pytest gate output
│   └── t2529-tests.txt                    ← 704 tests green
└── rt-audio-gates/                        ← T2529-V2 outputs
    ├── jack-direct-verify.txt             ← MAP2_AUDIO_PREFER_JACK=1 verification
    ├── pw-metadata.txt                    ← rate=48000 + quantum=64 lock-in
    ├── ps-rt-threads.txt                  ← SCHED_FIFO threads enumerated
    ├── getpcaps-map2-backend.txt          ← live capability set per process
    ├── getpcaps-map2-controller-host.txt
    ├── getpcaps-map2-sonobus-transport.txt
    ├── soak-30min-output.txt              ← juce-random-effects-soak summary
    └── peak-jitter-report.csv             ← per-block jitter measurements
```

## What's in each subtree

### `ci-install-matrix/`

The output of the GitHub Actions workflow at
`.github/workflows/t2529-install-matrix.yml`. Populated by the workflow
itself — every workflow run uploads its log artefacts here on a release tag.

The two jobs the workflow runs:

- **fedora-41**: builds the RPM, runs rpmlint with `0 errors + 0 warnings`,
  installs the package, verifies user/groups/dirs/units, runs
  `map2-self-test --full`, captures `systemd-analyze security` per unit,
  then uninstalls and verifies the Q4 user-preservation contract.

- **ubuntu-2404**: rebuilds the RPM under Ubuntu, alien-converts to
  `.deb`, runs lintian with `--fail-on warning` against the `.deb`,
  expects `0 errors + 0 warnings` with the project overrides applied.

### `non-mm-operator-dev-host/`

A manual verification run on the development host using an operator
account **other than** the existing `mm` (UID 1000) user. This catches
the silent-failure mode T2529 was filed to fix: a fresh install on a
host where the first interactive user is not UID 1000.

Procedure: see `verification-runbook.md` § 3.

### `pytest-gate-suite/`

The output of `python3 -m pytest tests/test_t2529_*.py -q`. 704 tests
across 14 test files (cycles 2-18). Captured at HEAD on 2026-05-15.

### `rt-audio-gates/`

The T2529-V2 deliverables — proof that capability sandboxing + seccomp
filters didn't blow up RT audio. Targets:

- JUCE audio callback thread: `SCHED_FIFO/80` (verified via `ps -eLo`)
- libremidi I/O thread: `SCHED_FIFO/70`
- AOO send/receive thread: `SCHED_FIFO/40` (when daemon ships in T2521-4)
- `getpcaps` per process: matches the unit's `AmbientCapabilities=`
- 30-min soak: peak block jitter < 0.35 ms, zero xruns

## How to populate this directory

Most artefacts are produced automatically:

- CI install-matrix: every workflow run uploads
  `.github/workflows/t2529-install-matrix.yml` job logs as GitHub Actions
  artefacts. On a release tag, the publish-repo job copies them here.
- Pytest gate suite: `python3 -m pytest tests/test_t2529_*.py -q > pytest-gate-suite/t2529-tests.txt`

For the manual deliverables:

- Non-mm operator dev-host: see `verification-runbook.md` § 3.
- RT audio gates: see `verification-runbook.md` § 4.

## Cross-references

- T2529 epic + locked decisions: `docs/PROJECT_WORKLIST.md` § T2529
- Service-user model: [`docs/install/SERVICE_USER.md`](../../../install/SERVICE_USER.md)
- FHS install layout: [`docs/install/FHS_LAYOUT.md`](../../../install/FHS_LAYOUT.md)
- Security model: [`docs/install/SECURITY_MODEL.md`](../../../install/SECURITY_MODEL.md)
- Pytest gate suite: `tests/test_t2529_*.py`
- CI install-matrix workflow: `.github/workflows/t2529-install-matrix.yml`
- Memory record: `/home/mm/.claude/projects/-home-mm-map2-audio/memory/project_t2529_service_user.md`
