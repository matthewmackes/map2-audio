# T2459 HIL Operator Runbook

**Worklist anchor:** parent epic `T2459-H` (MIDI Backend Unification).
**Purpose:** single page that an operator on the bench follows to close any of the four hardware-bound acceptance gates that remain on T2459.
**State (2026-05-07):** every code-side slice across H1–H7 is shipped on `master`. What remains is HIL evidence. This doc is the entire operator surface for that.

---

## Index — pick the gate you're closing today

| Gate | Closes | What you need on the bench |
|---|---|---|
| [§A — MeloAudio Commander HIL](#a--meloaudio-commander-hil-closes-t2459-h3--t2459-h3-cfg-phase-7) | T2459-H3 + T2459-H3-CFG-Phase-7 | MeloAudio MIDI Commander, USB cable |
| [§B — Maschine + MPX-1 + IntelFX HIL](#b--multi-device-hil-closes-t2459-h4) | T2459-H4 | Whichever of {Maschine MK1, Lexicon MPX-1, Rocktron IntelFX} you have |
| [§C — Map2MidiController retirement soak](#c--map2midicontroller-retirement-soak-closes-t2459-h6) | T2459-H6 | UA-1000, 30 minutes uninterrupted, no specific MIDI device required |
| [§D — UMP / MIDI 2.0 round-trip](#d--ump--midi-20-round-trip-closes-t2459-h5-ump-gate) | T2459-H5 (UMP gate only) | A MIDI-2.0-capable device + libremidi build with validated UMP I/O |
| [§E — PipeWire UMP-MIDI2 substrate decision](#e--pipewire-ump-midi2-substrate-decision-closes-t2459-h7-pw-ump) | T2459-H7-PW-UMP | Operator decision (no bench step until path is locked) |

After every gate you close: dual-push, flip the worklist task to `[✓] Done`, and update the closeout doc cross-references.

---

## Universal pre-flight (every gate)

Run these once at session start to make sure the platform is in a known-good state before you touch hardware.

```bash
# 1. Backend service is up and writable.
systemctl status map2-backend.service
journalctl -u map2-backend.service --since "10 min ago" | tail -50

# 2. Controller-host UDS path is bindable (the supervisor needs /run/map2/).
ls -la /run/map2/
# expect: drwxrwxr-x  ... map2:map2

# 3. Frontend serving on :3000.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
# expect: 200

# 4. ALSA + PipeWire are healthy.
aplay -l
pw-cli info 0 | grep -E '(core.version|core.daemon)'

# 5. Engine + controller-host built fresh.
ls -la juce-engine/build/map2_audio_engine* juce-engine/build/map2-controller-host
```

If any of these fail, fix them before continuing. None of the HIL gates can close on a degraded substrate.

---

## A — MeloAudio Commander HIL (closes T2459-H3 + T2459-H3-CFG-Phase-7)

**Goal:** prove the physical Commander drives a `chain.bypass.toggle` (and a tuner-on action) end-to-end through the new pipeline:
device → libremidi → controller-host → mapping engine → engine_command → dispatcher → audio engine.

You can close this gate via **either** path; pick one. Both satisfy the parent T2459-H3 acceptance text.

### Path A1 — Stock-firmware discovery (recommended, no flash)

1. Connect the Commander on USB. Confirm it enumerates as USB ID `2eee:0301`.
2. Open the Configurator at `http://localhost:3000/midi/devices/meloaudio-midi-commander/configurator`.
3. Status card should report `STOCK`. If it reports `NOT_PRESENT` or `UNKNOWN`, fix detection before continuing — see [`MELOAUDIO_COMMANDER_CONFIGURATOR.md`](MELOAUDIO_COMMANDER_CONFIGURATOR.md) §4.1.
4. Open the Discovery tab → "Run Wizard". Press each control on the prompt.
5. Wizard saves an override at `~/.map2/devices/meloaudio-commander-discovered.yaml`. Check it exists and matches what you pressed.
6. With the override loaded, press the footswitch you mapped to chain bypass. Verify in the audio path UI that the chain toggles. Repeat for tuner-on.
7. Capture evidence:

   ```bash
   D=$(date +%Y%m%d)
   E="docs/fit-for-purpose-evidence/${D}/t2459h3-cfg-meloaudio-commander"
   mkdir -p "${E}"
   cp ~/.map2/devices/meloaudio-commander-discovered.yaml "${E}/"
   journalctl -u map2-backend.service --since "10 min ago" > "${E}/backend.log"
   journalctl --user -u map2-controller-host --since "10 min ago" > "${E}/controller-host.log" 2>&1 || \
     journalctl -u map2-controller-host --since "10 min ago" > "${E}/controller-host.log"
   amidi -p hw:N,0,0 --dump --timeout 5 > "${E}/alsa_midi_dump.txt"  # adjust hw:N to your card
   echo "Path: A1 (stock + discovery override)" > "${E}/SUMMARY.md"
   ```

### Path A2 — Custom-firmware (one-time flash, gold-standard)

1. Connect the Commander; confirm `STOCK`.
2. Open Configurator → Firmware tab.
3. Click "Install Custom Firmware". Acknowledge the warranty modal.
4. Follow the prompt to put the device in DFU mode. Status changes to `DFU_BOOTLOADER`.
5. Pre-check section confirms `dfu-util` + bundled `.dfu` + udev rules. Click "Flash".
6. Wait for the Carbon `<ProgressIndicator>` to traverse `PRE_CHECK → ERASING → WRITING → VERIFYING → RESETTING → COMPLETE`.
7. Device resets; status changes to `CUSTOM`.
8. Click "Push MAP2 Canonical Config".
9. With the canonical mapping live, press the footswitch mapped to chain bypass. Verify the chain toggles. Repeat for tuner-on.
10. Capture evidence:

    ```bash
    D=$(date +%Y%m%d)
    E="docs/fit-for-purpose-evidence/${D}/t2459h3-cfg-meloaudio-commander"
    mkdir -p "${E}"
    journalctl -u map2-backend.service --since "30 min ago" > "${E}/backend.log"
    journalctl -u map2-controller-host --since "30 min ago" > "${E}/controller-host.log"
    amidi -p hw:N,0,0 --dump --timeout 5 > "${E}/alsa_midi_dump.txt"
    echo "Path: A2 (custom firmware + canonical config push)" > "${E}/SUMMARY.md"
    ```

### Closing the gate

- Add screenshots (or screen recording) of the chain bypass + tuner-on response in the audio engine UI. PNG / MP4 under the same `${E}/` directory.
- Worklist: edit `T2459-H3` and `T2459-H3-CFG` notes — flip both to `[✓] Done`, reference the evidence dir.
- `git add` the evidence dir + worklist edit; commit + dual-push.

---

## B — Multi-device HIL (closes T2459-H4)

**Goal:** prove every device that drove a MIDI flow before the device-pack migration still drives it after, through libremidi + the mapping engine. The acceptance text in T2459-H4 says "every device that drove a MIDI flow before this subtask still drives it after."

You can run this gate with whichever subset of {Maschine MK1, Lexicon MPX-1, Rocktron IntelFX} you have on the bench. Close per-device gates as you can; the parent task closes when at least the Maschine MK1 path is verified (the largest migration).

### B1 — Maschine MK1

1. Power on the Maschine MK1 over USB.
2. Open the Maschine surface at `http://localhost:3000/devices/maschine-mk1/`.
3. With `MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1` set in the controller-host environment, confirm `journalctl -u map2-controller-host` shows the daemon enumerating MK1 controls and the host-client transport handshake completing.
4. Press each pad. Verify the audio engine receives the pad-trigger event (`audio.pad.<N>.trigger`).
5. Turn each rotary encoder. Verify the corresponding `audio.macro.*` / `audio.master.volume` / `audio.transport.tempo` action fires.
6. Press transport buttons. Verify `audio.transport.*`.
7. Press group + LCD-side buttons. Verify `audio.group.*` / `audio.lcd.*`.
8. Capture evidence:

   ```bash
   D=$(date +%Y%m%d)
   E="docs/fit-for-purpose-evidence/${D}/t2459h4-maschine-mk1"
   mkdir -p "${E}"
   journalctl -u map2-controller-host --since "20 min ago" > "${E}/controller-host.log"
   journalctl -u map2-backend.service --since "20 min ago" > "${E}/backend.log"
   ```

### B2 — Lexicon MPX-1

1. Power on the MPX-1; confirm it appears as `Lexicon MPX-1` ALSA seq client.
2. Open the MPX-1 surface at `http://localhost:3000/devices/mpx-1/`.
3. Press front-panel CC controls (Adjust, Bypass, Tap). Verify they map to the device-pack profile.
4. Send a program change via PC; verify the program change registers.
5. Send a `.syx` import via the librarian; confirm the JS-runtime tag-extraction path fires (look for `MAP2_SYSEX_PARSER_USE_JS_RUNTIME` heritage in the log if the env var is set, or unset to use Python-side).
6. Capture evidence under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h4-mpx1/`.

### B3 — Rocktron IntelFX

1. Power on the IntelFX; confirm ALSA seq enumeration.
2. Open the IntelFX surface at `http://localhost:3000/devices/intelfx/`.
3. Same control + PC + SysEx coverage as MPX-1.
4. Capture evidence under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h4-intelfx/`.

### Closing the gate

- Worklist: edit `T2459-H4` notes — flip to `[✓] Done` once Maschine is verified. Note which of {MPX-1, IntelFX} were also verified in this session vs deferred.
- Commit + dual-push.

---

## C — Map2MidiController retirement soak (closes T2459-H6)

**Goal:** 30-min soak with the controller-host driving synthetic MIDI through the shm event ring on an OFF-build engine, with `--threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35`. After pass, atomic deletion PR per [`MAP2MIDICONTROLLER_RETIREMENT.md`](MAP2MIDICONTROLLER_RETIREMENT.md) §4.

### C1 — Pre-flight

```bash
# Build the OFF configuration.
cmake -B juce-engine/build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF
cmake --build juce-engine/build --target map2_audio_engine

# Confirm the symbol is gone.
nm -D juce-engine/build/*map2_audio_engine* | grep -i Map2MidiController || echo "OK: no symbols"

# Restart the backend so it loads the OFF build.
sudo systemctl restart map2-backend.service
```

### C2 — Run the soak

One command:

```bash
./scripts/run_t2459h6_retirement_soak.sh
```

This runs the full 30-min H6 gate. The script pre-flights the controller-host service + OFF-build artifact, then invokes the soak with every threshold the worklist task pins. Outputs land under `docs/fit-for-purpose-evidence/<YYYYMMDD>/`.

For a 5-min smoke (NOT a gate run, but useful for checking the daemon is plumbed before committing 30 minutes):

```bash
./scripts/run_t2459h6_retirement_soak.sh --quick
```

To preview the python invocation without running it:

```bash
MAP2_DRY_RUN=1 ./scripts/run_t2459h6_retirement_soak.sh
```

### C3 — Pass criteria

The soak emits a JSON artifact under `docs/fit-for-purpose-evidence/<YYYYMMDD>/`. Open it and confirm:

```json
{
  "overall_pass": true,
  "metadata": {
    "midi_driver": {
      "events_pushed": <number ≥ 30 * 1800 * 0.95 = 51300>,
      ...
    },
    ...
  },
  ...
}
```

### C4 — After pass: atomic deletion PR

Follow [`MAP2MIDICONTROLLER_RETIREMENT.md`](MAP2MIDICONTROLLER_RETIREMENT.md) §4 verbatim. The deletion is **one atomic commit**:

1. `rm juce-engine/Source/Controllers/Midi/Map2MidiController.cpp`
2. `rm juce-engine/Source/Controllers/Midi/Map2MidiController.h`
3. Edit `juce-engine/CMakeLists.txt` per §4 step 3.
4. Edit `juce-engine/Source/Controllers/Map2ControllerFactory.cpp` per §4 step 4.
5. Edit `juce-engine/tests/Map2ControllerTests.cpp` per §4 step 4.
6. Update `tests/test_map2midicontroller_caller_audit_t2459h6.py` per §4 step 5.
7. Move the timing-graph artifact under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h6-shm-ring/`.
8. Edit `docs/CLAUDE.md` Gotchas to retire the *"MIDI Device Selection Requires ALSA Subscriptions"* note (the `Map2MidiController.cpp` reference is now stale).
9. Edit `docs/PROJECT_WORKLIST.md`: flip `T2459-H6` to `[✓] Done`.
10. `git add` everything, commit (HEREDOC body), dual-push.

### C5 — Rollback (if soak regresses or post-deletion symptoms appear)

Per `MAP2MIDICONTROLLER_RETIREMENT.md` §`Rollback procedure`:

```bash
git revert <deletion-commit>
cmake -B juce-engine/build -DMAP2_USE_LEGACY_MIDI_CONTROLLER=ON
cmake --build juce-engine/build --target map2_audio_engine
sudo systemctl restart map2-backend.service
```

File the regression on the worklist and re-open `T2459-H6`.

---

## D — UMP / MIDI 2.0 round-trip (closes T2459-H5 UMP gate)

**Goal:** drive a MIDI 2.0 / UMP-shaped event end-to-end and verify the platform handles it through the host's libremidi UMP I/O, the slot-flag-tagged shm ring, the IPC additive `format="ump"` field, and the recorder.

**Status as of 2026-05-07:** double-blocked. (1) The vendored libremidi v5.1.0 does not yet expose a hardware-validated UMP input/output API on this platform; (2) bench MIDI-2.0-capable hardware is not available. The engine-side plumbing (classifier, slot discriminator, IPC additive, host-client `send_ump`) is shipped and tested; the gate is hardware + libremidi.

### D1 — When to attempt this gate

Open `T2459-H5` UMP gate work only when **both** of:

- libremidi vNEXT (≥ next minor that exposes a validated UMP I/O API for the JACK / PipeWire backends — track upstream)
- A MIDI-2.0-capable device on the bench (e.g., a UMP-capable controller or a MAP2 host running both the recorder and a synthetic UMP injector against itself)

are true.

### D2 — Steps (forward-looking)

1. Bump vendored libremidi to a UMP-validated version. Update `juce-engine/external/libremidi/` per its own update doc.
2. Connect the MIDI-2.0 device. Confirm `journalctl -u map2-controller-host` shows the device enumerated as UMP-capable.
3. Drive a UMP packet (any of MT 0x1 / 0x2 / 0x4 → RT path or MT 0x0 / 0x3 / 0x5 → control path).
4. Verify the recorder captures it with `format=ump` in the artifact.
5. Verify `GET /api/v2/midi/ump/capabilities` reports `data.host_side.validated_io: true`.
6. Capture evidence under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h5-ump-roundtrip/`.

### D3 — Closing the gate

- Worklist: flip `T2459-H5` to `[✓] Done`, note the libremidi version that unblocked the gate.
- Commit + dual-push.

---

## E — PipeWire UMP-MIDI2 substrate decision (closes T2459-H7-PW-UMP)

**Not a bench gate.** This is an operator decision step. Pick one of the four resolution paths in [`T2459_H7_PW_UMP_DECISION.md`](T2459_H7_PW_UMP_DECISION.md):

| Path | Effort | Recommended? |
|---|---|---|
| 1. PipeWire upstream patch | XS source / months calendar | parallel — long-term right answer |
| 2. MAP2 substrate adapter daemon | L | hold in reserve |
| 3. Backend-priority bypass | S — 3-5 days | ✅ **recommended immediate ship** |
| 4. Direct ALSA-raw fallback | already shipped | n/a |

Once a path is locked, work opens against `T2459-H7-PW-UMP` per the implementation plan in §5 of the decision doc. Bench evidence then closes it the same way as §A–§D above.

---

## Universal closeout pattern

When you close any gate (§A / §B / §C / §D / §E):

1. **Evidence captured** under `docs/fit-for-purpose-evidence/<YYYYMMDD>/<task>/` (logs, screenshots, artifacts).
2. **Worklist updated** in `docs/PROJECT_WORKLIST.md` — flip status, add a completion note with the evidence dir, the date, and a one-line summary.
3. **Closeout doc cross-referenced** in `docs/midi/T2459H_CLOSEOUT.md` if the gate closes a major sub-task.
4. **Single commit** per CLAUDE.md §0.4, descriptive commit message focused on **why** the gate closed (not what changed in the doc).
5. **Dual-push** per CLAUDE.md §0.2: `git push origin master && git push gitlab master`.
6. **Verify** both remotes received it (`git log origin/master..master` empty; `git log gitlab/master..master` empty).

If you close all of §A + §B + §C + §D in one bench session, batch them into separate commits so the worklist history reads cleanly per gate.

---

## Cross-references

- [`T2459H_CLOSEOUT.md`](T2459H_CLOSEOUT.md) — parent epic state across H1–H7.
- [`MELOAUDIO_COMMANDER_CONFIGURATOR.md`](MELOAUDIO_COMMANDER_CONFIGURATOR.md) — Phase 1–6 architecture.
- [`MELOAUDIO_COMMANDER_FIRMWARE.md`](MELOAUDIO_COMMANDER_FIRMWARE.md) — stock-mode reference + install runbook.
- [`MAP2MIDICONTROLLER_RETIREMENT.md`](MAP2MIDICONTROLLER_RETIREMENT.md) — H6 deletion runbook.
- [`MASCHINE_MK1_HID_MIGRATION.md`](MASCHINE_MK1_HID_MIGRATION.md) — Maschine HID/USB migration arc (H4 prereq).
- [`T2459_H7_PW_UMP_DECISION.md`](T2459_H7_PW_UMP_DECISION.md) — substrate decision doc.
- [`MIDI_BACKEND.md`](MIDI_BACKEND.md) — overall backend architecture.
- Worklist: [`PROJECT_WORKLIST.md`](../PROJECT_WORKLIST.md) — search for `T2459-H*` anchors.
