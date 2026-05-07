# T2459-H3-CFG Three-Loop Campaign — Session Summary

**Date:** 2026-05-07
**Operator directive:** "Continue this any outstanding tasks up to 10. Once the first set of 10 is complete, ship, then begin the next set of tasks. Continue that 3rd logic ten times." — 3 outer loops × 10 tasks = 30-cycle campaign.
**Branch:** master
**Final commits:** `813b6331` (Outer Loop 1) + `5d24a35a` (Outer Loop 2) + L3 closure (this campaign's L3.10 commit).
**Test surface delta:** +73 tests across the run (53 L2 + 20 frontend; backend route tests + L1 phase suites already shipped in prior session).

---

## What landed (by outer loop)

### Outer Loop 1 — Configurator stack (commit `813b6331`)

Files added (22 total, 5365 insertions):

- `app/routes/devices_meloaudio_commander.py` — FastAPI router at `/api/devices/meloaudio/commander` (GET /status, GET /override, DELETE /override, GET /firmware/bundled).
- `app/services/devices/meloaudio/commander_discovery_subscriber.py` — direct ALSA-seq subscription via mido+rtmidi (sidesteps the PipeWire UMP-MIDI2 bridge gap, filed as T2459-H7-PW-UMP).
- `app/services/devices/meloaudio/dfu_flash.py` — DFU flash orchestrator with subprocess_runner test seam.
- `app/services/devices/meloaudio/sysex_packer.py` — port of harvie256's `cmdBinaryPacker.py` + `settingsBinaryPacker.py` (full attribution preserved).
- `device-packs/meloaudio/firmware/README.md` — firmware bundle directory scaffold + restore-to-stock runbook + upgrade-the-bundle runbook.
- `web/src/map2/clients/meloaudioCommander.ts` — typed API client.
- `web/src/app/pages/midi-services/MeloAudioCommanderConfigurator.{tsx,css,test.tsx}` — Carbon page scaffold + status card.
- `web/src/app/pages/midi-services/MeloAudioCommanderDiscoveryPanel.{tsx,test.tsx}` — discovery override panel (read + reset).
- `web/src/app/pages/midi-services/MeloAudioCommanderFirmwarePanel.{tsx,test.tsx}` — bundled firmware list + CLI install runbook.
- 6 backend test suites covering routes / sysex packer (3 suites) / DFU flash / subscriber (existing) / detection (existing) / discovery (existing).
- Wire-up: `app/main.py` (route module registration) + `web/src/app/App.tsx` (lazy-loaded route mount at `/midi/devices/meloaudio-midi-commander/configurator`).

### Outer Loop 2 — Engine-command dispatcher (commit `5d24a35a`)

Files added (10 total, 2171 insertions):

- `app/services/devices/meloaudio/commander_resolver.py` — composes device-pack defaults with per-installation override; reverse-lookup `find_binding(status, data1, channel) → ResolvedBinding`.
- `app/services/engine_command_dispatcher.py` — generic routing primitive (exact + glob pattern, error isolation, observability counters).
- `app/services/engine_command_handlers.py` — four canonical handlers behind `HandlerHooks` DI (chain bypass / snapshot.recall / master.volume / tap_tempo).
- `docs/midi/ENGINE_COMMAND_DISPATCHER.md` — full architecture doc.
- `docs/PROJECT_WORKLIST.md` — filed T2459-H7-PW-UMP, updated T2459-H3-CFG progress note.
- 4 backend test suites: resolver (13) + dispatcher (16) + handlers (18) + integration (6) = 53 tests.

### Outer Loop 3 — Closure + sweep (this commit)

- `docs/PROJECT_WORKLIST.md` — top-tasks line refresh + T2459-H3-CFG closure notes.
- `.claude/CLAUDE.md` — design-directive section gains "Engine-command dispatcher" + "Per-installation device override pattern" entries.
- `/home/mm/.claude/projects/-home-mm-map2-audio/memory/MEMORY.md` — references list updated.
- New memory files: `project_engine_command_dispatcher.md`, `project_meloaudio_commander_configurator.md`, `reference_pipewire_ump_bridge_gap.md`.
- `docs/fit-for-purpose-evidence/20260507-t2459h3cfg-three-loop-campaign/SESSION_SUMMARY.md` (this file).

---

## Test sweep evidence

### Final L3.8 run (cumulative across all three loops)

```
$ npm --prefix web run typecheck                                    # → clean
$ npm --prefix web run lint                                          # → clean (0/0)
$ npm --prefix web run build                                         # → ✓ built in 19.85s
$ python3 -m pytest tests/ -q -k "meloaudio or t2459 or engine_command"
479 passed, 4 skipped, 3722 deselected, 2 warnings in 69.10s
$ npm --prefix web test -- --testPathPatterns MeloAudioCommander
Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
```

The 4 skipped pytest cases are HIL-gated (`MAP2_HIL_*` env-var-protected); the 2 warnings are unrelated `branding.py` Pydantic v2 deprecations.

### Per-suite contributions

| Suite                                                                           | Tests | Loop |
|---------------------------------------------------------------------------------|-------|------|
| `test_meloaudio_commander_detection_t2459h3cfg.py` (prior session)              | 17    | -    |
| `test_meloaudio_commander_discovery_t2459h3cfg.py` (prior session)              | 26    | -    |
| `test_meloaudio_commander_discovery_subscriber_t2459h3cfg.py`                   | 35    | L1   |
| `test_meloaudio_sysex_packer_t2459h3cfg.py`                                     | 30    | L1   |
| `test_meloaudio_sysex_packer_buttons_t2459h3cfg.py`                             | 34    | L1   |
| `test_meloaudio_sysex_chunking_t2459h3cfg.py`                                   | 22    | L1   |
| `test_meloaudio_dfu_flash_t2459h3cfg.py`                                        | 29    | L1   |
| `test_devices_meloaudio_commander_routes_t2459h3cfg.py`                         | 12    | L1   |
| `test_meloaudio_commander_resolver_t2459h3cfg.py`                               | 13    | L2   |
| `test_engine_command_dispatcher_t2459h.py`                                      | 16    | L2   |
| `test_engine_command_handlers_t2459h.py`                                        | 18    | L2   |
| `test_meloaudio_engine_command_integration_t2459h.py`                           | 6     | L2   |
| `MeloAudioCommanderConfigurator.test.tsx` (frontend)                            | 6     | L1   |
| `MeloAudioCommanderDiscoveryPanel.test.tsx` (frontend)                          | 6     | L1   |
| `MeloAudioCommanderFirmwarePanel.test.tsx` (frontend)                           | 8     | L1   |
| **Backend total**                                                               | 258   |      |
| **Frontend total**                                                              | 20    |      |

(The pytest selector `meloaudio or t2459 or engine_command` captured 479 — wider than the table because it also includes pre-existing T2459-H1..H6 suites and unrelated tests where "t2459" matches.)

---

## Architecture invariants now in force

1. **Per-installation override pattern** is the canonical answer for any device whose stock firmware varies CC numbers per mode. Future devices in this category mirror `commander_resolver.py`.
2. **All audio-surface side effects from vendor mapping JS go through the engine-command dispatcher.** No direct `engine_command` consumption; new targets register via `HandlerHooks` in `engine_command_handlers.py`.
3. **The PipeWire UMP-MIDI2 bridge gap is a substrate issue, not a per-device bug.** Any new MIDI 1.0 device needs an ALSA-seq direct subscription as a sidestep until T2459-H7-PW-UMP closes.
4. **Restore-to-stock pattern**: when a vendor doesn't publish stock firmware, MAP2 links to vendor support — never ships unredistributable binaries. MeloAudio is the reference.

---

## What remains (not in this campaign)

- **HIL evidence (Phase 7)** — operator-driven; bench session walks through stock-discovery → custom-flash → MAP2-canonical-config-push → revert-to-stock; needed to close T2459-H3-CFG.
- **Production wire-up of HandlerHooks** — `app/main.py` startup needs to instantiate the dispatcher with real `chain_service` / `snapshot_runtime_service` callables. The infrastructure is ready; only the wiring is missing.
- **T2459-H7-PW-UMP resolution** — substrate decision (PipeWire patch / config / adapter). Ownership pending; not on this campaign's path.
- **Phase 6 docs deep-dive** — `docs/midi/MELOAUDIO_COMMANDER_CONFIGURATOR.md` architecture (a sibling to the firmware doc that already shipped). Could land as a follow-up slice.

---

## Operator-visible deliverables

- **`/midi/devices/meloaudio-midi-commander/configurator`** — Carbon page with status card, Discovery override panel, Custom Firmware install panel.
- **`~/.map2/devices/meloaudio-commander-discovered.yaml`** — file path the Discovery Wizard writes to (resolver merges over device-pack defaults).
- **`device-packs/meloaudio/firmware/`** — drop a harvie256 `.dfu` here and the firmware panel surfaces it; CLI runbook explains the install.
