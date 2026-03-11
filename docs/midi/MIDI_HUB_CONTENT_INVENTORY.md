# MIDI Hub Content Inventory (T101-subA)

Date: 2026-03-10
Owner: Codex
Scope: `web/src/app/pages/MidiHubPage.tsx` and `web/src/app/components/MidiHub/*`

## 1. Terminology Normalization Map

| Legacy wording | Normalized wording | Usage rule |
|---|---|---|
| Matrix/Patchbay toggle | Routing Workspace view mode | Always frame as one workspace with two views |
| Quick recall | Preset Recall | Use explicit preset naming in operator copy |
| Script run/trigger | Script execution action | Distinguish immediate run vs trigger payload |
| Heatmap | Traffic intensity overlay | Clarify it is visualization-only, not route state |
| Innovation Controls | Advanced & Experimental controls | Always show advanced label in headers/help |
| Slots | Program-change slots | Include PC terminology where shown |

## 2. Panel Inventory and Guidance Requirements

| Panel ID | Capability Family | Primary controls | Typical operator goal | Required guidance additions |
|---|---|---|---|---|
| `routing` | Setup & Connectivity | Matrix cells, patchbay links, route editor | Create first working route | Legend, step order, baseline example, filter/transform caution |
| `presets` | Setup & Connectivity | Save, recall, compare, default, program slots | Recall known-good state quickly | Naming convention, rollback guidance, startup-default safety note |
| `network` | Setup & Connectivity | Session create/delete, OSC controls | Add one remote MIDI peer | Host/port prerequisites, single-peer-first workflow, failure checks |
| `scripts` | Control & Automation | Save script, run, trigger, stop, console | Implement custom event logic | Payload examples, safe test procedure, stop-on-error guidance |
| `macros` | Control & Automation | Macro CRUD and trigger | Bundle cross-device actions | Action ordering guidance, trigger naming, rollback warning |
| `scheduler` | Control & Automation | Delayed send, cancel, clear-finished | Deterministic timed actions | Message format examples, stale-entry cleanup notes |
| `clock` | Control & Automation | BPM config, start/stop/tap | Synchronize tempo-dependent devices | One-clock-master rule, source mode explanation |
| `recorder` | Capture & Analysis | Start/stop capture, playback, export | Capture reproducible MIDI behavior | Session naming pattern, export reminders |
| `traffic` | Capture & Analysis | Pause, filter, sort, export, inspect row | Diagnose no-signal or unexpected messages | Triage order and filter strategy examples |
| `midi2` | Advanced & Experimental | Discovery, profile/property, translation | Protocol validation | Advanced label, fallback guidance, scope limits |
| `innovation` | Advanced & Experimental | Learn suggestions, mesh, shadow state | Prototype higher-order workflows | Advanced label, isolation warning, rollback-first guidance |

## 3. First-Run vs Advanced Education Prioritization

### First-run must-learn surfaces
- Routing Workspace (`routing`)
- Preset Manager (`presets`)
- Traffic Monitor (`traffic`)
- Clock Engine (`clock`) when tempo sync is required

### Intermediate operational surfaces
- Network MIDI + OSC (`network`)
- Scheduler (`scheduler`)
- Recorder (`recorder`)

### Advanced/experimental surfaces
- MIDI 2.0 (`midi2`)
- Innovation Controls (`innovation`)

## 4. Core User Goals Mapped to Panels

| Goal | Required panels | Validation signal |
|---|---|---|
| Connect new device and confirm signal | `routing`, `traffic` | Ports > 0, active route exists, traffic activity > 0 |
| Save and recall stable show setup | `presets`, `routing` | Preset count > 0, recall succeeds |
| Start tempo sync flow | `clock`, `traffic` | Clock running = true, timing traffic visible |
| Add remote MIDI peer | `network`, `routing` | Network session count > 0, route references endpoint |
| Troubleshoot no-signal | `routing`, `traffic`, `presets` | Port visibility + route state + ingress visibility + rollback path |

## 5. Content Debt Closed in T101 Implementation

- Added capability-family grouping at page level.
- Added reusable panel metadata model for shared guidance.
- Added inline hints + deep help drawer for all major panels.
- Added first-run onboarding with replay support.
- Added guided task flows with validation checks and pause/resume/cancel controls.
- Added routing legends and progressive disclosure in matrix/patchbay surfaces.

