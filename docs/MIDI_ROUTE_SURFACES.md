# MIDI Route Surfaces

This document is the canonical route-surface decision for MAP2 MIDI APIs.

## Current split

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

- The legacy `/api/midi` compatibility layer has been retired.
  - Its prior lifecycle, refresh, monitor, clock, and routing gaps are covered by `/api/v2/midi`.
  - Its in-memory global filters and bundled route/filter/clock presets had no active callers and were explicitly retired.

## Practical rule

- New controller, mapping, and profile work: `app/routes/midi_v2.py`
- New MIDI Hub studio/automation work: `app/routes/midi_hub.py`
- Do not reintroduce `app/routes/midi.py`; add migration aliases to `midi_v2.py` only when a real active client requires them.
