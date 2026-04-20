# MAP2 + Maschine MK1 Headless Operation Guide

> **Revision:** 2026-04-20 (T700 Phase 5 epic deliverable)  
> **Epic:** T700 MK1 Headless Primary Interface  
> **Hardware:** Native Instruments Maschine MK1 (VID `0x17CC` / PID `0x0808`)  
> **75 locked design decisions:** Q1–Q75 (stored in `.claude/projects/-home-mm-map2-audio/memory/project_t700_mk1_headless.md`)

---

## Overview

The Native Instruments Maschine MK1 is the primary headless control surface for the MAP2 Audio Platform. In MAP2 it is not treated as a local authority. The daemon renders controller state by observing backend-owned services, and all snapshot, transport, automation, Brain, and admin decisions remain rooted in platform services.

This guide describes the shipped MK1 contract as of `2026-04-20`:

- retained-mode dual LCD rendering at `255x64` per panel
- all `T1` through `T25` LCD profiles, including hidden `T18 Admin Console`
- LED brightness tiers, animation rules, profile signatures, inspection overlays, and choreography
- first-run onboarding, boot/shutdown ceremony, screensaver, incident logging, and long-operation feedback
- controller-native admin actions with bounded sudo-backed system control
- the merged `/maschine` web surface with embedded hardware layout and MIDI-map editing

## Operating Model

- The MK1 is an observer and command surface. It does not compute snapshot state, morph state, Brain state, or automation truth locally.
- The backend is authoritative for profile render data, transport state, service status, update status, and admin action outcomes.
- The daemon owns only hardware I/O, profile selection state, temporary overlays, and gesture dispatch.
- If backend and controller disagree, trust backend APIs and retained incident-log breadcrumbs first.

## Hardware Surface

### Displays

- Left LCD: list, roster, or overview panel.
- Right LCD: focused detail, status, or confirmation panel.
- Both LCDs always reserve a top bar and bottom bar.
- The renderer emits both XBM preview payloads and MK1-ready framebuffers.

### Pads

- `16` pads mirror block selection, overlay signatures, choreography, onboarding progress, or screensaver state depending on the active surface owner.
- Normal profile behavior:
  - tap pad: select the mapped block
  - hold/alternate workflow: used for bypass or pressure-aware interactions where the active profile exposes them
- Pressure is sent as poly-aftertouch to MIDI and also fanned out to observer paths in automation and Brain telemetry.

### Encoders

- `NAV` encoder:
  - move through menu items when the menu is open
  - change focused metric in `T16 Monitor`
  - select blocks in the active chain when no special surface owns the encoder
  - select admin actions inside `T18 Admin Console`
- `Encoders 1-8`: primary parameter-control path for the selected block
- `Master encoders`: fixed utility controls for volume, tempo, and swing according to the shipped encoder map

### Buttons

- `CONTROL`: jump to `T1 CTRL`
- `STEP`: jump to `T9 Effect Chain Editor`
- `AUTO WRITE`: jump to `T16 Monitor`
- `NAVIGATE`: open the current category menu
- `NOTE REPEAT`: confirm menu selection or open the menu when it is closed
- `ERASE`: context cancel/clear where supported
- `SHIFT+NOTE REPEAT`: cycle profile category
- `SHIFT+NAVIGATE`: cycle LED inspection overlay
- `SHIFT+CONTROL`: open hidden `T18 Admin Console`
- `SHIFT+ERASE`: cancel the active cancellable long operation when one is visible

## Boot, Shutdown, And Idle Behavior

### Boot Ceremony

Boot starts automatically when the daemon starts.

Sequence:

1. MAP2 wordmark reveal
2. system-status pass
3. LED chase
4. LCD test
5. profile handoff

Rules:

- Any first pad, button, or encoder interaction skips the remainder of the ceremony.
- Boot lifecycle entries are retained in the Maschine incident log.

### Shutdown Ceremony

Shutdown runs when the daemon exits cleanly.

Sequence:

1. saving state
2. per-item receipts
3. session summary
4. farewell wave
5. goodbye frame

Rules:

- The farewell path takes direct hardware ownership after the worker threads stop.
- Shutdown lifecycle entries are retained in the incident log.

### Screensaver

The screensaver activates after `10` minutes of controller inactivity.

While active:

- LCDs switch to ambient status and wake guidance
- the LED layer swaps to a dim ambient posture
- the first wake gesture is swallowed so it does not also trigger a live action

Wake sources:

- first pad pressure above the wake threshold (`96` raw by default)
- first button press
- first encoder move

## First-Connection Onboarding

The onboarding tour starts automatically after boot completes and the backend is connected, unless the tour has already been completed or skipped.

Progression:

- `NOTE REPEAT`: next step
- `NAVIGATE`: previous step
- `ERASE`: skip the rest of the tour

Tour content:

1. welcome / MAP2 + MK1
2. `CONTROL` profile
3. `STEP` profile
4. `AUTO WRITE` profile
5. menu navigation
6. profile selection and category cycling
7. inspection overlay
8. pad block selection
9. screensaver wake model
10. ready state

Persistence:

- current step index is retained in runtime config
- completion writes the initial Maschine transport-policy config
- skip/completion prevents automatic replay on subsequent boots unless state is manually cleared

## SHIFT State Machine (Q53)

Three SHIFT tiers:

| State | Activation | SHIFT LED | LCD header suffix |
|---|---|---|---|
| `OFF` | Default | Off | `SHIFT: OFF` |
| `STICKY` (one-shot) | Single tap SHIFT | Solid | `SHIFT: STICKY` |
| `META` (caps-lock) | Double-tap SHIFT | Pulse | `SHIFT: META` |

- **STICKY:** SHIFT applies to the next single action, then releases automatically.
- **META:** SHIFT is locked until a second explicit exit (tap SHIFT again).
- If META is stuck, double-tap SHIFT to clear it.

## Universal Encoder Rules (Q54)

| Action | Result |
|---|---|
| Turn | Coarse adjust (medium resolution per Q10/4=D) |
| SHIFT + Turn | Fine adjust (1-step resolution) |
| Push | Commit / select current value |
| Push-hold 500ms | Secondary action (context-dependent) |
| Push while turning | **Not supported** — release push before turning |

- LED flashes on push confirmation.
- LCD shows ring-fill progress bar during push-hold.

## Profile Navigation

### Category Order

The category cycler uses this order:

`Control -> Chain -> Brain -> Sampler -> Monitor -> Admin -> Help`

### Menu Rules

- `NAVIGATE`: open the top-level menu for the current category
- `NAV` encoder: move within the category roster
- `NOTE REPEAT`: activate the highlighted profile
- `CONTROL`: back out of the open menu
- `SHIFT+NOTE REPEAT`: move to the next category and focus its first visible profile

### Inspection Overlay

`SHIFT+NAVIGATE` cycles:

`assigned -> muted -> automated -> off`

Meanings:

- `assigned`: blocks with active encoder assignments
- `muted`: blocks currently bypassed
- `automated`: blocks with automation lanes

## LCD Profile Catalog

### Control

#### T1 CTRL

- Purpose: primary live operating view
- Left LCD: live snapshot name and block roster
- Right LCD: selected block, focused parameter, and progress band
- Use it when you want the default performance surface

#### T2 Step

- Purpose: drum sequencer summary
- Left LCD: pattern, variation, swing, and first track activity
- Right LCD: focused pattern/variation/swing values

#### T5 Snap

- Purpose: active live snapshot identity
- Left LCD: live snapshot name plus recent snapshot roster
- Right LCD: snapshot id, tempo, and tempo source

#### T6 Auto

- Purpose: automation posture
- Left LCD: automation state, loop posture, and lane count
- Right LCD: focused state, count, and current automation time

#### T19 MIDI Learn

- Purpose: observer view over engine, hub, and drum MIDI learn state
- Left LCD: active/idle rows by surface
- Right LCD: target parameter and scope summary

#### T20 Macro Recorder

- Purpose: macro and recorder status
- Left LCD: macro count, session count, record posture, and focus item
- Right LCD: focused status and compact detail summary

### Chain

#### T9 Effect Chain Editor

- Purpose: focused chain-detail view
- Left LCD: selected effect list
- Right LCD: focused block detail and parameter lanes

### Sampler

#### T3 BRWS

- Purpose: Brain library collection browser
- Left LCD: collection roster and asset counts
- Right LCD: focused collection, featured asset, and source label

#### T4 SMPL

- Purpose: sample-editor summary
- Left LCD: slot, waveform, and trim-range facts
- Right LCD: slot, duration, asset path, and waveform summary

#### T14 Kit Browser

- Purpose: drum-kit inventory browser
- Left LCD: current kit roster with source labels
- Right LCD: active kit, category, and first instrument focus

### Brain

#### T7 B-L

- Purpose: Brain left-bank slot roster
- Left LCD: left-bank slot list with active emphasis
- Right LCD: focused slot name, mode, and bank label

#### T8 B-R

- Purpose: Brain right-bank slot roster
- Left LCD: right-bank slot list with active emphasis
- Right LCD: focused slot name, mode, and bank label

#### T10 Brain Seq

- Purpose: Brain sequencer summary
- Left LCD: pattern roster with lane and length counts
- Right LCD: current pattern, fill mode, and song-entry count

#### T15 Quad Morph

- Purpose: observer-backed morph summary
- Left LCD: position, source, target, and engine rows
- Right LCD: focused position, engine label, source, and target

### Monitor

#### T11 Tuner

- Purpose: explicit unsupported-state tuner profile
- Left LCD: unsupported-state guidance
- Right LCD: focused fallback status

Note:

- This profile intentionally reports that a dedicated tuner runtime is not present yet. It is a truthful unsupported-state surface, not a broken screen.

#### T12 Metronome

- Purpose: tempo and MIDI-clock monitor
- Left LCD: BPM, tempo source, clock mode, and transport owner
- Right LCD: focused BPM, clock mode, and owner label

#### T16 Monitor

- Purpose: live health and metric follow view
- Left LCD: metric roster
- Right LCD: focused metric value and emphasis band
- `NAV` encoder changes the focused metric while this profile is active

#### T17 System Health

- Purpose: backend health summary
- Left LCD: status, CPU, memory, audio, and issue-count rows
- Right LCD: overall health emphasis and issue summary

#### T21 Diagnostics

- Purpose: quick backend/device/audio/MIDI chain check
- Left LCD: daemon, USB, audio, MIDI-route, block-count, and health checks
- Right LCD: daemon/device/transport labels

### Admin

#### T13 Incident Log

- Purpose: newest retained incident entries
- Left LCD: latest log rows
- Right LCD: focused severity, timestamp, message, and detail

#### T18 Admin Console

- Purpose: hidden controller-native admin surface
- Entry: `SHIFT+CONTROL`
- Unlock: first `NOTE REPEAT`
- Selection: turn `NAV`
- Confirm: press `NOTE REPEAT` three times on the selected action
- Cancel or relock: `ERASE`

Available actions:

- `RESTART BACKEND`
- `RESTART WEB`
- `RESTART MASCHINE`
- `START ALL`
- `STOP ALL`
- `RUN FULL UPDATE`
- `REBOOT HOST`

Execution model:

- service restarts and reboot use bounded `sudo -n systemctl ...`
- orchestrator actions call backend orchestrator services
- full update uses the backend hybrid update manager
- action receipts are retained and rendered back on the LCD surface

#### T22 Log Viewer

- Purpose: retained incident-log viewer with source and path emphasis
- Left LCD: recent retained log rows
- Right LCD: source, time, message, and JSONL path hint

#### T23 Preferences

- Purpose: Maschine transport-policy view
- Left LCD:
  - transport preference
  - kernel-detach posture
  - virtual port
  - observer reminder
- Right LCD:
  - active link mode
  - detach state
  - port label
  - when changes apply

Transport settings:

- `transport_preference`: `auto`, `hidapi`, or `pyusb-bulk`
- `allow_kernel_detach`: whether the daemon may detach the kernel driver on connect

### Help

#### T24 Help Manual

- Purpose: compact first-use help on the controller itself
- Left LCD: essential gesture reminders
- Right LCD: modifier-first guidance and help focus text

#### T25 Reference Card

- Purpose: condensed live cheat sheet
- Left LCD: high-frequency gesture reminders
- Right LCD: rapid recall summary for performance use

## LED System

### Brightness Tiers

- `off`
- `dim`
- `mid`
- `bright`
- `full`

### Layer Precedence

From highest to lowest priority:

1. boot/shutdown ceremony
2. onboarding
3. long-operation overlay
4. screensaver
5. profile-signature overlay
6. inspection overlay
7. choreography / reactive layer
8. profile baseline and category LEDs

### Core LED Roles

- direct profile selectors:
  - `CONTROL`: active `T1`
  - `STEP`: active `T9`
  - `AUTO WRITE`: active `T16`
- `NAVIGATE`: backend heartbeat and menu-state guidance
- `NOTE REPEAT`: menu/confirm guidance
- `GROUP A-H`: category ownership, and Brain lane flash during Brain profiles

### Choreography

Outside menus and higher-priority overlays:

- `GRID`: transport beat flash
- `SAMPLING`: clip or energy indicator
- non-Brain profiles: spectrum-reactive pad overlay
- Brain profiles: slot/lane-aware choreography driven by Brain state and transport clock
- `SCENE`: Brain fill/posture indicator where applicable

### Long-Operation LED Ownership

When a long operation is active:

- `TRANSPORT LEFT`, `PLAY`, `REC`, `RESTART`, and `TRANSPORT RIGHT` become a five-step progress bar
- `ERASE` lights only when cancellation is available

## Long Operations And Receipts

Current long-operation sources:

- startup progress from `/api/services/startup-order`
- cluster update progress from `/api/cluster/update/status`
- plugin scan progress from `/api/plugins/scan-status`
- admin actions through `T18`

While active:

- LCDs show operation title, detail, percent, and status
- the underlying profile is temporarily hidden

Receipt states:

- completed
- failed
- cancelled

After the short receipt dwell, the controller returns to the underlying profile automatically.

## Incident Log

The retained incident log lives at:

`~/.map2/maschine_incident_log.jsonl`

Sources already logged include:

- daemon connect/disconnect
- backend websocket connect/disconnect
- device connect/disconnect
- onboarding events
- long-operation cancel and receipt events
- admin unlock/action events
- boot/shutdown lifecycle breadcrumbs

Use `T13` or `T22` to inspect retained entries from the controller.

## Admin Console Runtime Contract

The admin console is backend-owned. The daemon never invents service or update state locally.

Bounded sudo contract:

- restart backend
- restart production web service
- restart Maschine daemon
- reboot host

Installer/runtime artifact:

- `config/sudoers/map2-maschine-admin`
- installed by `scripts/install-node.sh` into `/etc/sudoers.d/map2-maschine-admin`

Security posture:

- only `mm` and `map2` receive the bounded command alias
- there is no blanket `NOPASSWD:ALL` requirement for this surface

## Web Surface

The web UI remains the secondary visual companion surface.

- canonical route: `/maschine`
- legacy redirect: `/maschine/midi-map -> /maschine#hardware-layout`
- embedded tools: hardware-faithful layout view and MIDI-map editor

Use the web surface when you need a larger visual editor or want to inspect the merged controller configuration alongside the live hardware contract.

## Render And Font Runtime

Renderer:

- retained-mode scene graph
- double-buffered LCD ownership
- damage tracking for changed regions
- multiple dither strategies in the render core

Font roster:

- `Spleen`
- `Cozette`
- `Tamsyn`
- `Terminus`
- `Unscii`
- `Nerd Font Mono`
- `MAP2 Display 32`

`MAP2 Display 32` extras:

- MAP2 logo tokens: `MAP2_LOGO`, `MAP2_MONOGRAM`
- compact aliases: `¤`, `§`
- musical symbols: `♪`, `♫`, `♩`, `♬`, `♭`, `♯`

## Recovery And Troubleshooting

### Controller Looks Frozen

1. Check whether a boot, onboarding, long-operation, or admin overlay owns the surface.
2. Press `CONTROL` to return to the main profile if the controller is otherwise idle.
3. Inspect `T13 Incident Log` or `T22 Log Viewer`.
4. Confirm backend health at `/api/health`.

### First Input Did Nothing

Common causes:

- the screensaver was active and the first wake gesture was swallowed
- boot ceremony skip consumed the first interaction
- onboarding owned the surface and swallowed normal live actions

Try the gesture again after the wake/skip transition.

### Admin Action Did Not Run

Check:

- the admin session is unlocked
- all three confirmation presses were sent
- the bounded sudoers drop-in is installed on the host
- retained admin receipts in `T18`, `T13`, or `T22`

### Device Not Found

Check:

- USB device `17cc:0808`
- pyusb access
- udev rule presence
- `map2-maschine.service`
- backend health

### Tuner Does Not Tune

That is expected. `T11` is an explicit unsupported-state profile until a dedicated tuner runtime exists.

## Verification Commands

Catalog and render verification:

- `python3 scripts/maschine_render_bench.py`
- `python3 scripts/maschine_phase1_verify.py`
- `python3 scripts/maschine_phase1_verify.py --include-hidden`

Hardware verification:

- `python3 scripts/maschine_phase1_verify.py --include-hidden --hardware --dwell-ms 250`
- `./scripts/maschine_e2e_verify.sh`
- `./scripts/maschine_e2e_verify.sh --blink`
- `./scripts/maschine_e2e_verify.sh --hardware-catalog --dwell-ms 250 --blink`

## Snapshot Workflow on Hardware (Q73)

MK1 performs **recall, quick-save, and delete only.** All authoring (rename, edit, version, template) stays in the web UI.

### Recall

1. Navigate to `T5 SNAP` profile.
2. Turn NAV encoder to browse the snapshot roster.
3. Push NAV to activate the highlighted snapshot.
4. LCD shows activation phases: **VALIDATING → STAGING → APPLYING → VERIFYING → LIVE**
5. Transport LED bar fills as each phase completes.
6. If rollback triggers: transport LED bar reverses, LCD shows `ROLLBACK`.

### Quick-Save (Q73)

Hold `SHIFT + REC` for 2 seconds → snapshot quick-saved with timestamp name. LCD confirms: `SAVED — <timestamp>`.

### Delete (Q41 tier-3)

In `T5 SNAP`, highlight the snapshot to delete → double-tap **ERASE** → LCD confirmation dialog → push NAV to confirm.

## Config Two-Layer (Q74)

```
~/.map2/maschine_midi_map.json              ← global defaults
snapshot JSONB: document.controllers.maschine_mk1.overrides  ← per-snapshot overrides
```

| Setting | Scope |
|---|---|
| Button bindings | Global |
| Encoder assignments | Global |
| Screensaver config | Global |
| Admin unlock timeout | Global |
| Pad layout | Per-snapshot |
| LCD profile | Per-snapshot |
| LED animations | Per-snapshot |

## Boot Ceremony Durations (Q60)

| Stage | Duration | Left LCD | Right LCD |
|---|---|---|---|
| `wordmark` | 0.55 s | `MAP2` | `PIXEL WIPE` |
| `status` | 0.80 s | `SYSTEM STATUS` | `BACKEND AND USB` |
| `led_chase` | 0.75 s | `LED CHASE` | `SURFACE TEST` |
| `lcd_test` | 0.45 s | `LCD TEST` | `DUAL PANEL` |
| `profile_load` | 0.55 s | `PROFILE LOAD` | `CTRL READY` |

Total: ~3.1 seconds. Any interaction during boot skips the remainder.

## Shutdown Ceremony Durations (Q61)

| Stage | Duration | Left LCD | Right LCD |
|---|---|---|---|
| `saving` | 0.60 s | `SAVING STATE` | `SNAPSHOT AND LOG` |
| `receipts` | 0.60 s | `RECEIPTS` | `ENGINE / AUDIO` |
| `summary` | 0.60 s | `SESSION SUMMARY` | `READY TO STOP` |
| `farewell` | 0.60 s | `FAREWELL` | `LED WAVE` |
| `goodbye` | 0.60 s | `GOODBYE` | `POWER SAFE` |

Session summary includes: session duration, snapshot count, incident count, xrun count.

## State Authority Sign-Off

The Maschine path remains aligned with the MAP2 State Authority contract:

- snapshot state is rendered from backend-owned services
- morph state is observed from engine/Brain endpoints
- automation state is observed from backend runtime services
- the daemon does not compute or persist alternate snapshot/morph authority
- admin actions call backend services or bounded host commands rather than local shadow state machines

This means the MK1 remains an observer-plus-command surface, not a competing source of truth.

Final verification on April 18, 2026:

- `sudo -n systemctl restart map2-maschine.service` completed cleanly and the service returned `active`
- `./scripts/maschine_e2e_verify.sh --hardware-catalog --dwell-ms 250 --blink` passed with zero warnings on the connected MK1
- the daemon-aware E2E pass validated route health, all-profile catalog traversal, hardware blink, admin action surface, and the observer-only audit in one run

**T700 Phase 5 epic closure (2026-04-20):**

- All 75 locked design decisions (Q1–Q75) are implemented and referenced in this guide.
- Phases 1–4 delivered via T666 subtasks (T2407–T2410 in the canonical worklist).
- This document is the final Phase 5 deliverable per Q75=A.
- 120 backend tests pass across the full MK1 service suite.
- Source of truth for hardware constants: `app/services/maschine/mk1_protocol.py`
- Source of truth for profile definitions: `app/services/maschine/profiles/`

## Quick Reference

Primary gestures:

- `CONTROL`: home
- `STEP`: chain detail
- `AUTO WRITE`: monitor
- `NAVIGATE`: open menu
- `NOTE REPEAT`: confirm / enter
- `SHIFT+NOTE REPEAT`: next category
- `SHIFT+NAVIGATE`: inspection overlay
- `SHIFT+CONTROL`: admin console
- `SHIFT+ERASE`: cancel active long op

Wake rules:

- first wake gesture only wakes
- second gesture performs the intended action

Onboarding:

- `NOTE REPEAT` next
- `NAVIGATE` back
- `ERASE` skip

Admin:

- enter with `SHIFT+CONTROL`
- unlock with `NOTE REPEAT`
- turn `NAV` to choose action
- press `NOTE REPEAT` three times to fire
- `ERASE` clears confirm or re-locks
