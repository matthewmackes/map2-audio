# MIDI Route Surfaces

This document is the canonical route-surface decision for MAP2 MIDI APIs.

## Current split

- `/api/midi`
  - Legacy compatibility layer.
  - Keeps older controller and engine clients working.
  - Scope is intentionally limited and should not receive new feature work.

- `/api/v2/midi`
  - Authoritative modern MIDI API.
  - Owns mappings, learn, device profiles, feedback, commands, and chain activation flows.

- `/api/midi/hub`
  - Distinct MIDI Hub workstation surface.
  - Owns traffic monitoring, routing matrix, presets, event lists, scripting, clock, network/OSC, MIDI 2.0, Tesira, GPIO, recorder, scheduler, and mesh features.

## Consolidation decision

- Do not merge `midi_hub.py` into `midi_v2.py`.
  - The domains overlap in the word "MIDI" but not in product boundary.
  - `midi_hub.py` is a workstation/automation system, not just a v2 transport wrapper.

- Treat `midi.py` as deprecated compatibility, not a peer API.
  - New work belongs in `midi_v2.py` or `midi_hub.py`.
  - Retirement of `/api/midi` should happen only after explicit caller migration verification.

## Practical rule

- New controller, mapping, and profile work: `app/routes/midi_v2.py`
- New MIDI Hub studio/automation work: `app/routes/midi_hub.py`
- Bug fixes only for backward compatibility: `app/routes/midi.py`
