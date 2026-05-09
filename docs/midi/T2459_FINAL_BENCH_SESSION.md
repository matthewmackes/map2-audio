# T2459 — Final Bench Session Runbook

**Purpose:** Close every remaining hardware-in-the-loop (HIL) gate for the T2459 epic in **one bench session**. After this runbook is executed end to end, T2459-H3, T2459-H3-CFG, T2459-H4, and T2459-H7-PW-UMP all flip to `[✓] Done` and the T2459 controller / mapping / device-pack epic is fully closed (modulo the hardware-blocked sibling `T2459-H5-UMP-HIL`, which waits on libremidi UMP I/O + MIDI-2.0-capable hardware).

**Scope of this doc:** orchestration only. Every per-gate detail (commands, evidence layout, pass criteria, rollback) lives in the existing canonical runbook [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md). This doc tells you the order to run them in, the dependencies between them, and what to do at the end.

**Estimated wall-clock:** 6–10 hours for an experienced operator with all hardware on the bench. Faster if MPX-1 / IntelFX are skipped (they're optional — JS-runtime parity is already covered in CI).

---

## Hardware checklist

Bring the following to the bench before starting:

- [ ] **Edirol UA-1000** USB audio interface (always required — RT soak gate)
- [ ] **MeloAudio MIDI Commander** (closes T2459-H3 + T2459-H3-CFG)
- [ ] **NI Maschine MK1** (closes T2459-H4 — MK1 is the always-required device)
- [ ] **Lexicon MPX-1** *(optional — JS-runtime parity in CI; bench parity nice-to-have)*
- [ ] **Rocktron IntelFX** *(optional — same rationale as MPX-1)*
- [ ] **MAP2-canonical-config CSV file** *(optional — only needed for Path A2 custom-firmware flash on the Commander)*

The PipeWire UMP-MIDI2 substrate gap that gates T2459-H7-PW-UMP is already present on this bench rig, so no extra hardware is needed for that gate.

---

## Pre-flight (do this once at session start)

Follow [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md) **§Universal pre-flight**. Verify:

1. `map2-backend.service` is healthy and journalctl is clean.
2. `/run/map2/` exists and is writable (controller-host needs it for the UDS).
3. Frontend is serving on `:3000` (HTTP 200).
4. ALSA + PipeWire daemons are alive.
5. Engine + controller-host artifacts are present in `juce-engine/build/`.

If any of those fail, do not proceed — fix the substrate first.

Additionally for this session:

```bash
# Confirm the JACK-direct env var is in effect on the running unit.
systemctl show map2-backend.service -p Environment | tr ' ' '\n' | grep -E 'MAP2_AUDIO_PREFER_JACK|PIPEWIRE_LATENCY'
# Expect: MAP2_AUDIO_PREFER_JACK=1 and PIPEWIRE_LATENCY=64/48000
```

If `MAP2_AUDIO_PREFER_JACK=1` is missing, restart the backend after T2498 has landed (the env var is now baked into `systemd/map2-backend.service`).

---

## Gate order

Run the gates in this order. The ordering minimizes context-switches between hardware and exploits dependencies (e.g., the Commander sits on the same USB hub as the substrate-gap test).

### Gate 1 — MeloAudio Commander HIL

**Closes:** T2459-H3 + T2459-H3-CFG (Phase 7)
**Runbook:** [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md) §A
**Choose:** Path A1 (stock-firmware discovery, recommended) **or** Path A2 (custom-firmware flash, gold-standard). Either path satisfies the H3 acceptance text. A1 is faster and reversible; A2 is bit-identical across operators.
**Evidence:** `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-cfg-meloaudio-commander/`
**Estimated time:** 1–2 hours.

### Gate 2 — PipeWire UMP-MIDI2 substrate Path 4 evidence

**Closes:** T2459-H7-PW-UMP
**Why this gate runs second (right after Commander):** the Commander is the canonical device that exposes the substrate gap (it shows up as ALSA seq client `32:0 (TSMIDI2.0)` and is invisible to libremidi-via-PipeWire JACK MIDI). Keeping it plugged in from Gate 1 makes this gate a 30-min add-on rather than a separate setup.
**Runbook for Path 4 capture:** `docs/fit-for-purpose-evidence/20260508/t2459h7-pw-ump-path4/README.md` gates G1–G5
**What to capture:**
- **G1:** detection probe correctly classifies the bench as needing the override
- **G2:** spawn env carries `MAP2_MIDI_BACKEND_FORCE=alsa_seq`
- **G3:** `main.cpp` `forceSelect()` accepts the override
- **G4:** end-to-end MIDI flow under the override (Commander → libremidi-via-ALSA-seq → controller-host → engine action)
- **G5:** 30-min soak with no callback regressions and no xrun introductions
**Evidence:** `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h7-pw-ump-path4/`
**Estimated time:** 1–2 hours (30 min soak runs in the background while you set up Gate 3).

### Gate 3 — Multi-device device-pack parity

**Closes:** T2459-H4
**Runbook:** [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md) §B (B1 / B2 / B3)
**Required:** B1 — Maschine MK1 (set `MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1`; verify pads, encoders, transport buttons drive `audio.*` actions; LED choreography unchanged).
**Optional:** B2 — Lexicon MPX-1 (set `MAP2_SYSEX_PARSER_USE_JS_RUNTIME=1`; SysEx import + front-panel CCs + librarian unchanged); B3 — Rocktron IntelFX (same pattern as MPX-1).
**Partial-closure rule:** if MPX-1 / IntelFX are not available, document the partial gate in the completion note and close H4 anyway — the JS-runtime parity tests in CI cover the parser path. Do **not** leave H4 open just for B2/B3 if B1 passes.
**Evidence:** `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h4-multi-device/`
**Estimated time:** 2–4 hours depending on device count.

---

## Post-session worklist closeout

After all three gates pass (or are documented as partial per the rule above), do the following in one commit:

1. **Flip statuses in `docs/PROJECT_WORKLIST.md`:**
   - `T2459-H3` → `[✓] Done` with completion note linking the Gate 1 evidence dir
   - `T2459-H3-CFG` → `[✓] Done` with completion note linking the Gate 1 evidence dir
   - `T2459-H4` → `[✓] Done` with completion note linking the Gate 3 evidence dir (note any partial coverage)
   - `T2459-H7-PW-UMP` → `[✓] Done` with completion note linking the Gate 2 evidence dir
   - `T2459-H` parent → `[✓] Done` (every sub-task closed)
   - Move all five rows from "In Progress" to the archive per the worklist's migration rule.

2. **Update `docs/midi/T2459H_CLOSEOUT.md`:**
   - Replace the "Remaining HIL Acceptance Gates" table with a "T2459-H Closed (YYYY-MM-DD)" banner.
   - Keep the sibling `T2459-H5-UMP-HIL` row in a "Carried Forward" section so the UMP gate stays visible.

3. **Update `MEMORY.md` `project_t2459_controller_layer.md`:**
   - Mark the epic complete, retain the standing autonomous full-execution authorization note for downstream device packs.

4. **Dual-push** per CLAUDE.md §0.2: `git push origin master && git push gitlab master`.

---

## Carried-forward gate (NOT part of this session)

**T2459-H5-UMP-HIL** — end-to-end UMP traffic against a MIDI-2.0-capable device.
**Status:** Blocked, sibling task split out of T2459-H5 closure.
**Unblocks when:** (a) libremidi exposes a validated UMP I/O API on PipeWire/JACK/ALSA backends, **and** (b) a MIDI-2.0-capable device is on the bench.
**Closure path when unblocked:** [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md) §D.

This gate is intentionally not in the final bench session because the operator can't influence either blocker. The engine-side UMP plumbing is fully shipped and self-tests via `/api/v2/midi/ump/capabilities`; the gate is purely an integration test waiting for substrate readiness.

---

## Cross-references

- Per-gate operator runbook: [`HIL_OPERATOR_RUNBOOK.md`](HIL_OPERATOR_RUNBOOK.md)
- T2459-H closeout summary: [`T2459H_CLOSEOUT.md`](T2459H_CLOSEOUT.md)
- MeloAudio Configurator architecture: [`MELOAUDIO_COMMANDER_CONFIGURATOR.md`](MELOAUDIO_COMMANDER_CONFIGURATOR.md)
- Map2MidiController retirement (already closed, included for context): [`MAP2MIDICONTROLLER_RETIREMENT.md`](MAP2MIDICONTROLLER_RETIREMENT.md)
- T2459-H7-PW-UMP decision doc: [`T2459_H7_PW_UMP_DECISION.md`](T2459_H7_PW_UMP_DECISION.md)
- Path 4 evidence template: `docs/fit-for-purpose-evidence/20260508/t2459h7-pw-ump-path4/README.md`
- Worklist: [`docs/PROJECT_WORKLIST.md`](../PROJECT_WORKLIST.md)
