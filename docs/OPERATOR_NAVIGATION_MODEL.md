# Operator Navigation Model

## Purpose

`T090` resets the shell information architecture so maturity state determines route placement.
Default navigation is for operator-safe workflows only. Beta, experimental, and hardware-blocked surfaces are intentionally deprioritized.

## Default shell layout

### Primary operator tabs

These are the only workflows promoted into the default left navigation:

- `/` — `Overview` — `qualified-with-waiver`
- `/engine` — `Audio Engine` — `qualified-with-waiver`
- `/avb-routing` — `AVB Routing` — `qualified-with-waiver`
- `/host-machine` — `Host Machine` — `qualified-with-waiver`

### Secondary information tabs

These stay visible, but they are informational rather than operator workflow entry points:

- `/welcome` — `Guide` — `production`
- `/about` — `About` — `production`

### Advanced menu

The advanced menu is reserved for surfaces that must not read as routine/default workflows:

- `beta`
- `experimental`
- `hardware-blocked`

Current advanced groupings:

- `Beta workflows`: Presets, LV2 Plugins, MIDI, MIDI Hub, MPX1 Rack, Tesira AVB, Cluster Dashboard, Multi-System
- `Experimental`: Grid, 3D Grid, IR & NAM Library
- `Hardware-blocked`: LCD Console, Audio Interfaces

## UI rules

- The shell active-title area must show the exact maturity label for the current route.
- Advanced-menu cards must show the exact maturity label for each route.
- `hardware-blocked` items must not appear as normal navigable workflow buttons in the shell.
- Default promotion/pinning must not elevate `beta`, `experimental`, or `hardware-blocked` routes into the primary tab bar.

## Source of truth

The navigation model lives in [advancedMenuItems.ts](/home/mm/map2-audio/web/src/app/data/advancedMenuItems.ts).
The maturity evidence source remains [subsystem-maturity-matrix.json](/home/mm/map2-audio/docs/subsystem-maturity-matrix.json).

## Maintenance acceptance criteria

- Every new shell-visible route must declare one exact maturity state from the canonical matrix.
- Only `production` and `qualified-with-waiver` routes may enter default navigation.
- `beta`, `experimental`, and `hardware-blocked` routes belong in the advanced menu unless a new evidence-backed policy exception is documented in the same change.
- If a route maturity changes, update both the nav model and the linked evidence/worklist item in one commit.
