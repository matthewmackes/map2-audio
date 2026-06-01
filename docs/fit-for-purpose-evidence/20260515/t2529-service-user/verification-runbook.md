# T2529 Verification Runbook

**Status:** Authoritative — T2529 Q5 lock 2026-05-15
**Use case:** Manual verification procedure for the deliverables in
[`MANIFEST.md`](MANIFEST.md) that can't be produced by CI alone.

---

## 0. Prerequisites

- The current MAP2 repo HEAD with all T2529 cycles 2-18 merged
- A Fedora 41 or Ubuntu 24.04 host (a VM is fine for sections 1-3)
- For section 4: bench access to the production-equivalent host with the
  Edirol UA-1000 + AVB switch attached

---

## 1. Pytest gate suite (every cycle)

Run the full T2529 pytest gate suite and confirm 704 tests green:

```bash
cd /home/mm/map2-audio
python3 -m pytest tests/test_t2529_*.py -q --tb=line | tee \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/pytest-gate-suite/t2529-tests.txt
```

Expected end of output:

```
704 passed in <N>.<N>s
```

If any test fails, do NOT proceed with the rest of the verification — the
contract is broken and the install will not behave as documented.

---

## 2. CI install-matrix (Fedora 41 + Ubuntu 24.04)

This runs automatically on every push to master via
`.github/workflows/t2529-install-matrix.yml`. Manual trigger:

```bash
gh workflow run t2529-install-matrix.yml --ref master
gh run watch
```

When complete, download the artefacts:

```bash
RUN_ID=$(gh run list --workflow=t2529-install-matrix.yml --limit=1 --json databaseId --jq '.[0].databaseId')
mkdir -p docs/fit-for-purpose-evidence/20260515/t2529-service-user/ci-install-matrix
gh run download "$RUN_ID" \
    --dir docs/fit-for-purpose-evidence/20260515/t2529-service-user/ci-install-matrix
```

Acceptance criteria:

- `fedora-41` job: green
- `ubuntu-2404` job: green
- rpmlint output: `0 errors + 0 warnings`
- lintian output: `0 errors + 0 warnings`
- `map2-self-test --full` exit 0

---

## 3. Non-mm operator dev-host install (V1 manual deliverable)

This is the test that validates T2529's whole reason for existing: a
fresh install on a host where the first interactive user is **not** `mm`
or UID 1000.

### 3.1 Create a non-mm operator account

On the dev host (or a fresh VM):

```bash
# Pick any non-mm name. We use `audio-ops` here.
sudo useradd -m -s /bin/bash -G wheel audio-ops
sudo passwd audio-ops
sudo getent passwd audio-ops > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/operator-account.txt
```

Verify the UID is NOT 1000 (mm's UID on this dev host).

### 3.2 Build + install the RPM as audio-ops

Switch to the audio-ops account:

```bash
su - audio-ops
```

Then build + install:

```bash
cd /tmp
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Build the RPM
mkdir -p ~/rpmbuild/{SOURCES,SPECS,RPMS,SRPMS,BUILD,BUILDROOT}
VERSION="$(grep -m1 '^Version:' packaging/rpm/map2.spec | awk '{print $2}')"
git archive --format=tar.gz --prefix="map2-${VERSION}/" \
    -o ~/rpmbuild/SOURCES/map2-${VERSION}.tar.gz HEAD
cp packaging/rpm/map2.spec ~/rpmbuild/SPECS/
rpmbuild --define "_topdir ${HOME}/rpmbuild" -bb ~/rpmbuild/SPECS/map2.spec \
    | tee /tmp/install-log.txt

# Install (needs sudo)
sudo dnf install -y ~/rpmbuild/RPMS/x86_64/map2-*.rpm \
    | tee -a /tmp/install-log.txt

cp /tmp/install-log.txt \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/
```

### 3.3 Capture the post-install state

```bash
# User + group state
getent passwd map2 > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/getent-passwd-map2.txt
getent group map2 > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/getent-group-map2.txt
id map2 > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/id-map2.txt

# FHS dir state
for d in /opt/map2-audio /etc/map2 /var/lib/map2 /var/cache/map2 /var/log/map2 /run/map2; do
    stat -c '%n %U:%G %a' "$d"
done > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/stat-fhs-dirs.txt

# Start a service + verify
sudo systemctl daemon-reload
sudo systemctl start map2-backend
sleep 5
sudo systemctl status map2-backend --no-pager > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/systemctl-status.txt
sudo systemctl stop map2-backend

# Run --full self-test
/usr/bin/map2-self-test --full > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/non-mm-operator-dev-host/self-test-full.log \
    2>&1
```

### 3.4 Verify the four invariants

Manually inspect the captured artefacts and confirm:

1. **The `map2` user was created with auto-assigned UID, NOT 1000**:
   `getent passwd map2` shows a UID in the system range (100-999).
2. **The `map2` user is in `audio` + `pipewire-system` groups**:
   `id map2` lists them.
3. **All four FHS state dirs exist with map2:map2 ownership**:
   `stat-fhs-dirs.txt` shows each at the expected mode (`0755` for
   `/var/lib`, `/var/cache`, `/run`; `0750` for `/var/log`).
4. **`map2-backend.service` started successfully**:
   `systemctl-status.txt` shows `active (running)`.

If all four are green, the T2529 migration is verified on this host.

---

## 4. RT audio gates (V2, bench-gated)

This requires the production-equivalent host with `kernel-rt` installed,
`isolcpus=4,5 nohz_full=4,5 rcu_nocbs=4,5` in the GRUB cmdline, the
Edirol UA-1000 attached, and AVB switch connected.

### 4.1 PipeWire substrate

```bash
# Verify rate + quantum lock-in via pw-metadata
pw-metadata 0 | grep -E '(clock.force-rate|clock.force-quantum)' > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/pw-metadata.txt
# Expected: clock.force-rate = 48000, clock.force-quantum = 64
```

### 4.2 JACK direct verify

```bash
# Confirm MAP2_AUDIO_PREFER_JACK is in effect + JUCE opens via JACK
journalctl -u map2-backend --since "10 minutes ago" \
    | grep -E '(JACK|MAP2_AUDIO_PREFER_JACK|AudioDeviceManager)' > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/jack-direct-verify.txt
```

### 4.3 RT thread enumeration

```bash
# All SCHED_FIFO threads in the audio path
ps -eLo pid,tid,comm,cls,rtprio,policy \
    | awk '$4 == "FF"' \
    | sort -k5,5n > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/ps-rt-threads.txt
# Expected: JUCE audio thread at SCHED_FIFO/80, libremidi at 70,
# data-loop.0 at 55 (PipeWire), AOO at 40 (when T2521-4 lands).
```

### 4.4 Live capability per process

```bash
for unit in map2-backend map2-controller-host map2-sonobus-transport; do
    pid=$(systemctl show "${unit}.service" -p MainPID | cut -d= -f2)
    if [[ -n "$pid" && "$pid" -ne 0 ]]; then
        echo "== ${unit} (PID ${pid}) =="
        sudo getpcaps "${pid}"
    else
        echo "== ${unit}: NOT RUNNING =="
    fi
done > \
    docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/getpcaps-per-unit.txt
# Expected: map2-backend lists cap_net_raw + cap_sys_nice
#           map2-controller-host lists cap_sys_nice
#           map2-sonobus-transport lists cap_sys_nice + cap_net_bind_service
```

### 4.5 30-minute soak

```bash
# Same soak runner used elsewhere in the project
python3 .codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py \
    --duration-seconds 1800 \
    --flow-rotation-seconds 20 \
    --sample-interval-seconds 1.0 \
    --reset-stats-after-warmup \
    --threshold-max-xruns 0 \
    --threshold-max-peak-jitter-ms 0.35 \
    --evidence-dir \
      docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/

# Acceptance: 0 xruns, peak block jitter < 0.35 ms across the 30-min run.
# T2529 must not regress the RT contract — capability + seccomp filters
# should be transparent to the audio path.
```

---

## 5. Final acceptance

When sections 1-4 are all green:

1. Update `MANIFEST.md` — flip each row from ⏳ / 🔬 / 🚧 to ✅
2. Update the worklist (`docs/PROJECT_WORKLIST.md`) to close T2529 cycles
   2-20 as `[✓] Done`
3. Update the memory record at
   `/home/mm/.claude/projects/-home-mm-map2-audio/memory/project_t2529_service_user.md`
   with the final acceptance summary
4. Tag the release: `git tag t2529-complete-$(date +%Y%m%d) && git push --tags`

---

## Troubleshooting

### "%sysusers_create_package: command not found" during rpmbuild
Install `systemd-rpm-macros`:
```bash
sudo dnf install systemd-rpm-macros
```

### Self-test reports "map2 user MISSING"
The `%sysusers_create_package` macro in `%pre` didn't run. Check:
```bash
rpm -V map2 | head -20
journalctl --since "5 minutes ago" | grep -i sysusers
sudo systemd-sysusers --replace=/usr/lib/sysusers.d/map2.conf
```

### Self-test reports "/var/lib/map2 mode = 0o755, expected 0o755" (or similar)
Re-run the tmpfiles provisioner:
```bash
sudo systemd-tmpfiles --create /usr/lib/tmpfiles.d/map2.conf
```

### Peak jitter > 0.35 ms after T2529
Likely cause: seccomp filter denying a syscall the audio thread needs.
Capture `audit.log` while reproducing:
```bash
sudo ausearch -ts recent -m seccomp \
    | tee docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/seccomp-deny.txt
```

If `@audio` or `@resources` is denying something legitimate, file a
T2529-followup to extend the per-unit allowlist.
