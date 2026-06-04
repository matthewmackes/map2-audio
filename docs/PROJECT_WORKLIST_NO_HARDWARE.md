# MAP2 — No-Hardware Worklist

Generated: 2026-05-10
Source: [docs/PROJECT_WORKLIST.md](PROJECT_WORKLIST.md)
Scope: Every active task whose remaining work can be completed without hardware-in-the-loop (HIL), without an attached USB controller, and without a bench audio interface. Tasks whose **only** remaining gate is a bench session are excluded.

> Generation rule: include a task if at least one substantive deliverable can be shipped from a workstation with no USB / audio / network-AVB / DFU device attached. Exclude tasks whose remaining gates are all bench-side. Each entry quotes its non-hardware acceptance bullet so it's runnable cold.

---

## Active no-hardware tasks

### `[>]` T2499-A — Map a MIDI controller wizard (UI mount + integration polish)
- Source: [PROJECT_WORKLIST.md §T2499-A](PROJECT_WORKLIST.md)
- Remaining no-hardware work:
  1. **Operator-facing UI swap** — mount the framework shell (`DeviceConfiguratorShell` + `DeviceConfiguratorStatusCard` + `DevicePackPicker` + `MidiLearnModule`) at the canonical configurator route, validate parity against the bespoke MeloAudio UI, then retire the bespoke route. Code-only work; no hardware.
  2. **Pack-picker integration deep-link audit** — the follow-on slice (2026-05-09) hosted the picker at `/midi/devices/configurator`. Audit deep-links, prefetch entries, and the Sequencer Setup card path for parity with the new route.
- Hardware gate excluded: HIL parity bench (Gate 4 in T2459 final bench session) — that's hardware-only.
- Files: `web/src/app/components/DeviceConfigurator/`, `web/src/app/pages/midi-services/MidiServicesConfiguratorPage.tsx`, `web/src/app/pages/sequencerViews/SetupView.tsx`, `web/src/app/App.tsx`.

### `[ ]` T2499-B — Calibrate Maschine MK1 (audit slice + framework integration)
- Source: [PROJECT_WORKLIST.md §T2499-B](PROJECT_WORKLIST.md)
- Remaining no-hardware work:
  1. **Slice 1 — T700 audit** (`docs/maschine/T700_LOCKED_DECISIONS_AUDIT.md`): enumerate the 75 locked decisions, classify which apply to onboarding, recommend wrap-existing-daemon vs. orchestrator vs. state-machine refactor. **This audit is the gating prerequisite for all other slices and is pure documentation.**
  2. After the audit lands, draft the per-unit calibration YAML schema (`~/.map2/devices/maschine-mk1-<USB_SERIAL>-calibrated.yaml`) — schema + validator + tests can ship without an MK1.
  3. Dual-surface state-machine skeleton can be implemented + unit-tested behind a feature flag without an MK1 attached (LCD render path stubbed).
- Hardware gate excluded: bench acceptance with a fresh MK1.

### `[ ]` T2499-C — Discover AVDECC devices (simulator + wizard UI)
- Source: [PROJECT_WORKLIST.md §T2499-C](PROJECT_WORKLIST.md)
- Remaining no-hardware work:
  1. **AVDECC simulator** (`app/services/avb/avdecc_simulator.py`) — emits synthetic ADP/AECP/ACMP traffic against the la_avdecc observer API. Zero hardware required.
  2. **Wizard UI** (`web/src/app/pages/avb/AvdeccBindingWizard.tsx`) — tiered multi-entity UX (1 = one-click, 2-9 = DataTable, 10+ = bulk-import + filter). Drives off the simulator until T004 lab opens.
  3. **Brain-input binding writer** — takes an AVDECC stream descriptor + Brain input slot index, writes the binding through the existing routing matrix.
  4. **Substrate-state diagnostic panel** — PTP / interface / entity-count states embedded in the wizard.
  5. **Sequencer Setup card** — `Coming soon` → `Available (simulator)`.
- Hardware gate excluded: real-hardware acceptance is gated by T004 (lab availability, not a workstation gate).
- Per the locked decision (Q4): "ship now with simulator-backed wizard; T004 stays the production-readiness gate."

### ~~T2503 — DAW Service~~ — CANCELLED 2026-05-11
- Source: [PROJECT_WORKLIST.md §T2503](PROJECT_WORKLIST.md)
- Status: **Cancelled** 2026-05-11; superseded by T2504 Multi-Track Recorder + Playback. Code-side artefacts retired under T2505 (this section is preserved only as an audit trail; no remaining no-hardware work). New no-hardware work for the reframed epic appears under T2505-T2509 in `PROJECT_WORKLIST.md`.

### `[✓]` T2459-H6 (Gotcha cleanup) — MEMORY.md / CLAUDE.md update after legacy ALSA retirement
- **Closed 2026-06-04 (Claude, /ship).** Audited all AI-instruction + doc surfaces for the stale "MIDI Device Selection Requires ALSA Subscriptions" note. Findings: `docs/CLAUDE.md` already retired (HISTORICAL entry, line ~753); `docs/MEMORY.md` clean (no such note); `.gemini/instructions.md` does not exist. Retired the still-stale surfaces: `.github/copilot-instructions.md` Gotcha #15 rewritten to "⛔ RETIRED 2026-05-08 (T2459-H6)" + its changelog entry annotated superseded; `docs/MIDI_DEVICE_SELECTION_COMPLETE.md` gained a SUPERSEDED banner. All cited replacement paths verified to exist (libremidi `LibremidiAdapter`, `IpcMidiBridgeController`, `MAP2MIDICONTROLLER_RETIREMENT.md`). `HIL_OPERATOR_RUNBOOK.md:229` left as-is (a checklist reference to this cleanup, not a current-behavior claim).
- Source: [PROJECT_WORKLIST.md §T2459-H6 "Required outputs"](PROJECT_WORKLIST.md)
- Status: T2459-H6 **closed** 2026-05-08; legacy `Map2MidiController` deleted. The Required-Outputs bullet says: "update `docs/MEMORY.md` and `CLAUDE.md` Gotchas to retire the 'MIDI Device Selection Requires ALSA Subscriptions' note (no longer relevant — libremidi handles this)."
- Remaining no-hardware work:
  1. Audit [docs/CLAUDE.md "MIDI Device Selection Requires ALSA Subscriptions"](CLAUDE.md) Gotcha entry — retire or rewrite to reflect libremidi.
  2. Audit `/home/mm/.claude/projects/-home-mm-map2-audio/memory/MEMORY.md` — same retirement.
  3. Audit `.gemini/instructions.md` Gotchas section — same retirement.
- Estimate: 30-60 min, pure docs.

---

## Standing autonomous lanes (pre-cleared, no hardware needed)

### Snapshot Editor monolith decomposition (T2473 carry-over)
- Source: [PROJECT_WORKLIST.md "Plugin Browser modal"](PROJECT_WORKLIST.md)
- The monolith [SnapshotEditorPageContent.tsx](../web/src/app/pages/SnapshotEditorPageContent.tsx) is at ~8894 LOC after T2472 closed. The biggest remaining slice is the Plugin Browser modal (~305 inline LOC).
- No-hardware work:
  1. Extract Plugin Browser modal into a sibling module.
  2. Continue JSX partition (T2473).
  3. Each slice ships with paired jest tests; no UI/audio engine touched.

### Carbon lint-rule ratchet maintenance (T2481 follow-ons)
- Source: [PROJECT_WORKLIST.md §T2481-E1-sweep](PROJECT_WORKLIST.md)
- T2481 closed 2026-05-07 with all 8 MAP2 lint rules at `error`, 0/0 lint state. Standing rule: any new raw `<input>` / `<select>` / `<table>` / `<dialog>` will trip the rules. No-hardware maintenance lane: clear violations as they appear in CI.

### MIDI dispatcher / engine_command handler expansion
- Source: [PROJECT_WORKLIST.md §T2459-H3-CFG "Outer Loop 2"](PROJECT_WORKLIST.md)
- Dispatcher + 4 canonical handlers shipped 2026-05-07. Expansion lane: add new audio-surface targets to `engine_command_handlers.py` via the `HandlerHooks` DI seam. Each new handler ships with paired pytest cases against the existing dispatcher harness — no hardware needed.

---

## Excluded (hardware-only, retained here as an audit trail)

These are **explicitly excluded** from the no-hardware list. Each carries an HIL gate as its sole or dominant remaining acceptance.

- **T2459-H** — Final bench session orchestrator ([T2459_FINAL_BENCH_SESSION.md](midi/T2459_FINAL_BENCH_SESSION.md)). All gates are HIL.
- **T2459-H3** — Gate 1 of T2459 final bench session. Hardware-only.
- **T2459-H3-CFG** — Phase 7 = T2459 final bench session Gate 1. Hardware-only.
- **T2459-H4** — HIL parity = T2459 final bench session Gate 3. Hardware-only.
- **T2459-H7-PW-UMP** — Code-side closed 2026-05-08 (Path 4 selected; Python probe + C++ env-var consumer + 20 unit tests on master). Remaining gates are operator HIL: bench-attached Commander to verify the `BROKEN_UMP_BRIDGE` log line + `midi backend = alsa_seq (forced)` + 30-min soak. See [T2459_H7_PW_UMP_DECISION.md §6](midi/T2459_H7_PW_UMP_DECISION.md) "Implementation slices 3-4."
- **T004** — AVB hardware qualification/release gating (lab-blocked).
- **T065** — Tesira parity release closure (hardware evidence blocked).

---

## How to use this list

- **Default execution order**: T2459-H6 docs cleanup → T2499-B Slice 1 (T700 audit, pure docs) → T2505/T2506 recorder cleanup + schema (T2504 phases 1-2) → T2499-C simulator + wizard → T2499-A UI swap.
- **Parallelization**: T2499-B audit + T2499-C simulator + T2505/T2506 are all independent; ship in parallel cycles.
- **Re-derive**: regenerate this file with `grep -nE "^Status: \[(>| )\]" docs/PROJECT_WORKLIST.md` and walk each entry, asking: *does the remaining acceptance text quote any hardware?*

---

Last updated: 2026-05-10 EDT — Claude (T2459-H7-PW-UMP corrected: code-side already closed 2026-05-08, remaining work is HIL-only — moved to Excluded section).
