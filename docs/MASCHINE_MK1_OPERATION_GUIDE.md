# Maschine MK1 Operation Guide

## Status

This guide now covers the shipped Phase 1 foundation plus the full Phase 2 profile catalog:

- Retained-mode dual-LCD renderer with damage tracking and double-buffered frame ownership
- Font roster: Spleen, Cozette, Tamsyn, Terminus, Unscii, Nerd Font Mono, plus the initial MAP2 Display 32 face
- All Phase 1 and Phase 2 LCD profiles (`T1` through `T25`, with `T18` intentionally hidden from normal cycling)
- `/maschine` as the canonical web surface with the embedded hardware-layout and MIDI-map editor

Phase 3 remains pending. Phase 2 now ships the category-aware cycler, profile-switch OSD, and catalog-wide verification path.

The first Phase 3 bundle is also now in place:

- 5-tier LED brightness semantics: `off`, `dim`, `mid`, `bright`, `full`
- 25-entry LED animation catalog and per-profile signature mapping
- Profile-entry pad overlays plus initial backend/device heartbeat LEDs in the daemon

## Phase 1 Profiles

### T1 CTRL

- Purpose: main control view for snapshot identity, block selection, and primary parameter feedback.
- Left LCD: live snapshot name and the current chain/block roster.
- Right LCD: selected block, selected parameter, and the current progress/meter band.

### T9 Effect Chain Editor

- Purpose: focused chain editing surface backed by the Python-tier profile runtime.
- Left LCD: selected effect list with current focus.
- Right LCD: selected block detail and parameter lanes intended for encoder work.

### T16 Monitor

- Purpose: operational health and metric follow view.
- Left LCD: metric roster.
- Right LCD: focused metric value and monitor emphasis band.

## Phase 2 Bundle A Profiles

### T13 Incident Log

- Purpose: show the newest retained Maschine incident entries from `~/.map2/maschine_incident_log.jsonl`.
- Left LCD: most recent log rows, newest first.
- Right LCD: focused severity, timestamp, message, and compact detail text.

### T17 System Health

- Purpose: summarize backend health without leaving the controller.
- Left LCD: status, CPU, memory, audio, and issue-count rows derived from `/api/health`.
- Right LCD: overall status emphasis bar plus the current issue summary.

### T21 Diagnostics

- Purpose: verify the full daemon -> backend -> audio -> MIDI chain quickly.
- Left LCD: daemon, USB, audio, MIDI-route, block-count, and health checks.
- Right LCD: current daemon/device/transport state labels.

### T22 Log Viewer

- Purpose: inspect the retained incident file with source/tail emphasis.
- Left LCD: recent retained log rows.
- Right LCD: source, time, message, and current JSONL path hint.

### T23 Preferences

- Purpose: expose the current MK1 runtime transport preferences.
- Left LCD: transport link mode, kernel-detach posture, virtual port, and observer-only reminder.
- Right LCD: active link mode, detach state, port label, and when changes take effect.

### T24 Help Manual

- Purpose: quick-start operator help directly on the device.
- Left LCD: essential first-use gestures.
- Right LCD: modifier-first reminder and the current help focus text.

### T25 Reference Card

- Purpose: fast live-performance cheat sheet.
- Left LCD: most-used gesture reminders.
- Right LCD: condensed live-gesture summary for rapid recall between songs.

## Phase 2 Bundle B Profiles

### T2 Step

- Purpose: observer summary for the live drum-sequencer pattern state.
- Left LCD: pattern, variation, swing, and the first track activity summaries.
- Right LCD: focused pattern/variation/swing labels for quick confirmation.

### T5 Snap

- Purpose: current live snapshot identity plus a short recent-snapshot roster.
- Left LCD: active live snapshot name and the recent snapshot list.
- Right LCD: active snapshot id, active tempo, and tempo-source label.

### T6 Auto

- Purpose: automation playback/record posture and lane-count confirmation.
- Left LCD: automation state, playback, lane count, and loop posture.
- Right LCD: focused automation state, lane count, and current automation time.

### T12 Metronome

- Purpose: snapshot tempo and MIDI-clock ownership monitor.
- Left LCD: BPM, tempo source, clock mode, and transport owner summary.
- Right LCD: focused BPM, clock mode, and transport owner label.

## Phase 2 Bundle C Profiles

### T3 BRWS

- Purpose: observer-backed browser over the live Brain library collections.
- Left LCD: library collection roster with asset counts.
- Right LCD: focused collection, featured asset, and source label.

### T4 SMPL

- Purpose: observer-backed sample-editor summary for the current Brain slot.
- Left LCD: slot, waveform, and trim-range facts.
- Right LCD: focused slot, duration, asset path, and waveform/sample-count summary.

### T14 Kit Browser

- Purpose: observer-backed browser over the current drum-kit inventory and active kit.
- Left LCD: current kit roster with source labels.
- Right LCD: active kit name, category, and first-instrument focus detail.

## Phase 2 Bundle D Profiles

### T7 B-L

- Purpose: observer-backed Brain left-bank slot roster.
- Left LCD: left-bank slot roster with active-slot emphasis.
- Right LCD: focused slot name, mode, and bank label.

### T8 B-R

- Purpose: observer-backed Brain right-bank slot roster.
- Left LCD: right-bank slot roster with active-slot emphasis.
- Right LCD: focused slot name, mode, and bank label.

### T10 Brain Seq

- Purpose: observer-backed Brain sequencer summary.
- Left LCD: current pattern roster with lane and length counts.
- Right LCD: current pattern label, fill mode, and song-entry count.

### T15 Quad Morph

- Purpose: observer-backed quad-morph view over live snapshot routing and JUCE morph state.
- Left LCD: position, source, target, and engine rows.
- Right LCD: focused position, engine label, source, and target labels.

## Phase 2 Bundle E Profiles

### T11 Tuner

- Purpose: explicit unsupported-state tuner profile until a dedicated backend tuner runtime exists.
- Left LCD: unsupported-state and fallback guidance.
- Right LCD: focused status plus the current selected-block context.

### T18 Admin Console

- Purpose: locked admin posture surface that stays hidden from cycle navigation until the later unlock flow ships.
- Left LCD: lock, mode, health, and daemon posture.
- Right LCD: lock state, deployment mode, and unlock guidance.

### T19 MIDI Learn

- Purpose: observer-backed MIDI learn status across engine, hub, and drum learn surfaces.
- Left LCD: per-surface active/idle rows and target parameter summary.
- Right LCD: focused state, target, and scope labels.

### T20 Macro Recorder

- Purpose: observer-backed macro and MIDI recorder session status.
- Left LCD: macro count, session count, record posture, and focus item.
- Right LCD: focused status, active macro/session, and compact detail summary.

## Profile Navigation

- `CONTROL`: jump directly to `T1 CTRL`.
- `STEP`: jump directly to `T9 Effect Chain Editor`.
- `AUTO WRITE`: jump directly to `T16 Monitor`.
- `NAVIGATE`: open the profile menu for the current category.
- `NAV` encoder while menu is open: move within the active category roster.
- `NOTE REPEAT`: open the menu when it is closed, or activate the highlighted profile when the menu is open.
- `SHIFT+NOTE REPEAT`: cycle to the next profile category (`Control -> Chain -> Brain -> Sampler -> Monitor -> Admin -> Help`) and switch to that category's first visible profile.
- Profile switch OSD: every direct selector, menu activation, or category jump shows a 1.5-second confirmation overlay with the target profile name, description, and category.
- `T18 Admin Console`: intentionally hidden from normal category cycling until the later unlock flow ships.

## Phase 3 Bundle A LED Foundation

- Pad states now carry explicit brightness-tier and animation metadata so the daemon no longer relies on the earlier hard-coded `off/dim/bright/pulsing` translation.
- Profile changes trigger a profile-signature overlay on the pad LEDs while the LCD profile-switch OSD is active.
- `NAVIGATE` now doubles as backend heartbeat feedback, and the direct profile selectors (`CONTROL`, `STEP`, `AUTO WRITE`) gain active-profile emphasis in the LED layer.
- The full Brain-aware choreography, inspection overlay, and pressure fanout work are still tracked under later Phase 3 bundles.

## Render Runtime

- Resolution: `255x64` per LCD, serialized to both XBM simulator payloads and MK1 5-bit hardware framebuffers.
- Bars: each panel reserves a 12px top bar and 12px bottom bar at all times.
- Damage tracking: retained front/back buffers emit changed 8x8 regions so higher layers can confirm partial updates.
- Dithering: Bayer, blue-noise, Atkinson, and Floyd-Steinberg algorithms ship in the Phase 1 render core.

## Web Surface

- Canonical route: `/maschine`
- Legacy redirect: `/maschine/midi-map` -> `/maschine#hardware-layout`
- Embedded section: the hardware-faithful MIDI-map editor now lives inside the main Maschine page.

## Verification Hooks

- Render benchmark: `python3 scripts/maschine_render_bench.py`
- Backend/API verification: `python3 scripts/maschine_phase1_verify.py`
- Full catalog including hidden profiles: `python3 scripts/maschine_phase1_verify.py --include-hidden`
- Hardware write verification: `python3 scripts/maschine_phase1_verify.py --hardware`

## Current Limits

- `T18` remains intentionally locked/hidden until the later unlock flow ships.
- Phase 3 LED animations, pressure routing, and Brain-aware choreography are still pending.
- The MAP2 Display 32 face is the initial glyph pass; Phase 5 expands it into the final full-face manual-grade roster.
- Hardware proof still requires a real connected Maschine MK1 for `--hardware` verification.
