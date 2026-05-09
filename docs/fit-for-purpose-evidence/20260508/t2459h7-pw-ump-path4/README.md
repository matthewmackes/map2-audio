# T2459-H7-PW-UMP Path 4 — fit-for-purpose evidence

**Task:** `T2459-H7-PW-UMP` (parent `T2459-H7`).
**Decision:** Path 4 selected 2026-05-08. Decision doc: [`../../../midi/T2459_H7_PW_UMP_DECISION.md`](../../../midi/T2459_H7_PW_UMP_DECISION.md).
**Backend doc:** [`../../../midi/MIDI_BACKEND.md`](../../../midi/MIDI_BACKEND.md) §10 "PipeWire 1.4.10 UMP-MIDI2 substrate gap".

This directory is a **stub** at filing time. The bench operator fills in the actual evidence captures listed below; this README enumerates the gates that close out Path 4 acceptance.

---

## Acceptance gates

A piece of evidence is required for each gate. Drop the artifact in this directory and append a row to `EVIDENCE.md` with the timestamp, capture command, and a one-sentence reading.

### G1 — Gap signature reproduces (substrate is broken)

**Goal:** Confirm the bench substrate matches the heuristic's `BROKEN_UMP_BRIDGE` classification.

**Capture (operator runs at the bench):**

```bash
# Pipewire daemon version
pw-cli info 0 | grep -E 'core\.version|name'  > pw_cli_info_0.txt

# Full ALSA-seq client list
cat /proc/asound/seq/clients > proc_asound_seq_clients.txt

# Direct ALSA-seq dump from the orphan kernel client (Commander on
# client 32:0 in the original bench session). Run for ~5 seconds with
# the operator pressing pedals, then Ctrl-C.
timeout 5 aseqdump -p 32:0 > aseqdump_kernel_client.txt

# Python probe output, JSON-serialized for readability
python3 -c '
import json
from app.services.controller_host_pipewire_substrate import detect_substrate_state
result = detect_substrate_state()
print(json.dumps({
    "state": result.state.value,
    "reason": result.reason,
    "pipewire_version": result.pipewire_version,
    "ump_clients_seen": list(result.ump_clients_seen),
    "orphan_kernel_clients": list(result.orphan_kernel_clients),
    "env_overrides": result.env_overrides,
}, indent=2))
' > probe_result.json
```

**Expected reading:** `probe_result.json` carries `"state": "broken_ump_bridge"`, lists the kernel device(s) under `orphan_kernel_clients`, and sets `env_overrides` to `{"MAP2_MIDI_BACKEND_FORCE": "alsa_seq"}`.

### G2 — Detection-logic regression test passes

**Goal:** Unit cases in `tests/test_t2459h7_pw_ump_fallback.py` are green; HIL case fires on the bench.

**Capture:**

```bash
# Hermetic unit cases — must pass on every host (CI + bench)
python3 -m pytest tests/test_t2459h7_pw_ump_fallback.py -v --no-header > pytest_unit.log 2>&1

# Live HIL case — bench only, with the Commander connected
MAP2_HIL_PIPEWIRE_UMP=1 python3 -m pytest tests/test_t2459h7_pw_ump_fallback.py::TestHilLiveSubstrateProbe -v > pytest_hil.log 2>&1
```

**Expected reading:** Both logs end with all-green test summaries; `pytest_unit.log` shows 12 passed + 1 skipped (the HIL case skipped because the env gate is unset in the unit-only run).

### G3 — Controller-host binds to `alsa_seq` after the env override is wired

**Goal:** With the `ControllerHostService` env-override merging slice landed, the controller-host main loop logs `midi backend = alsa_seq` on a broken host. **Open dependency:** the C++ `main.cpp` consumer of `MAP2_MIDI_BACKEND_FORCE` must land first (see decision-doc §6 implementation slice 2).

**Capture (after slice 2 lands):**

```bash
# Restart the backend (which spawns the controller-host with the
# probe-derived env overrides) and grep the journal.
sudo systemctl restart map2-backend
sleep 2
journalctl -u map2-backend -n 200 --no-pager | grep -E 'T2459-H7|midi backend|midi_backend_degraded' > journalctl_startup.txt
```

**Expected reading:** `journalctl_startup.txt` contains the `BROKEN_UMP_BRIDGE` Python log line, the C++ line `midi backend = alsa_seq`, and the `midi_backend_degraded` Warning diagnostic.

### G4 — Live mapping load: 30-min soak with no event drops

**Goal:** With the Commander on the bus and a real mapping descriptor active, the controller-host receives every press and emits the corresponding `engine_command` IPC frame for the full 30-minute window. Drop count from the shm event ring stays zero; no `script_error` events.

**Capture (operator):**

```bash
# Start the soak harness (pedal-press automation or live operator presses).
# Capture both backend journal and controller-host journal for 30 min.
( journalctl -fu map2-backend                     > soak_journal_backend.txt   ) &
( journalctl -fu map2-controller-host             > soak_journal_host.txt      ) &

# After 30 min of presses, Ctrl-C the journal followers and then run:
python3 -c '
from app.services.controller_host_service import get_controller_host_service
svc = get_controller_host_service()
print(svc.status_payload())
' > soak_status.json
```

**Expected reading:** `soak_status.json` shows `"status": "running"`, `"crashes_in_window": 0`. `soak_journal_*` files contain a steady stream of `engine_command` lines matching the operator's press cadence; no `script_error` lines; no `dropped` counters increasing on the shm-ring diagnostics.

### G5 — Backwards-compatibility: probe returns `HEALTHY` on a fixed substrate

**Goal:** Confirm the removal path. When PipeWire upstream lands a fix (or when an operator runs an older PipeWire), the probe returns `HEALTHY` and the C++ probe order resumes.

**Capture (run on a host without the gap, or on the same host after `aconnect 142:0 32:0` to manually subscribe):**

```bash
# Manually subscribe the UMP bridge to the orphan client to simulate
# the post-fix steady state.
aconnect 142:0 32:0   # pseudo — adjust client IDs to the host
cat /proc/asound/seq/clients > proc_asound_seq_clients_after_subscribe.txt

# Re-run the probe; expect HEALTHY.
python3 -c '
import json
from app.services.controller_host_pipewire_substrate import detect_substrate_state
print(json.dumps({"state": detect_substrate_state().state.value}))
' > probe_after_subscribe.json
```

**Expected reading:** `probe_after_subscribe.json` carries `"state": "healthy"` and the controller-host (after restart) logs `midi backend = jack_midi`.

---

## Files in this directory (filled in at the bench)

- `EVIDENCE.md` — running log of captures with timestamps + readings.
- `pw_cli_info_0.txt`
- `proc_asound_seq_clients.txt`
- `aseqdump_kernel_client.txt`
- `probe_result.json`
- `pytest_unit.log`
- `pytest_hil.log`
- `journalctl_startup.txt`
- `soak_journal_backend.txt`
- `soak_journal_host.txt`
- `soak_status.json`
- `proc_asound_seq_clients_after_subscribe.txt`
- `probe_after_subscribe.json`

---

## Definition-of-Done sign-off

When G1–G5 each carry a real artifact and a one-sentence reading in `EVIDENCE.md`, the worklist task `T2459-H7-PW-UMP` graduates from `[>] In Progress` to `[✓] Done` per `.claude/CLAUDE.md` §0.8. Until G3 lands (which depends on the C++ `main.cpp` env-var consumer), the task remains `[>]`.
