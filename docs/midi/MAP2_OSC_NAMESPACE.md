# MAP2 OSC Namespace

Canonical task: `T203-subI`

## Overview

MAP2 exposes a hierarchical OSC namespace rooted at `/map2/*` for external controllers such as TouchOSC, Lemur, and Open Stage Control. The namespace is designed around show-control style noun/verb paths and provides both direct control addresses and implicit output feedback under `/map2/out/*`.

## Core addresses

| Address | Purpose | Direction |
| --- | --- | --- |
| `/map2/plugin/<id>/param/<name>` | Get or set plugin parameter state | Bidirectional |
| `/map2/plugin/<id>/bypass` | Toggle or set plugin bypass | Bidirectional |
| `/map2/chain/<id>/preset/<number>/fire` | Recall a chain preset step | Input |
| `/map2/cue/<list>/<number>/fire` | Fire an event-list cue | Input |
| `/map2/transport/bpm` | Get or set clock BPM | Bidirectional |
| `/map2/transport/start` | Start the transport clock | Input |
| `/map2/transport/stop` | Stop the transport clock | Input |
| `/map2/transport/continue` | Continue the transport clock | Input |
| `/map2/preset/fire` | Recall a preset using numeric payload or id payload | Input |
| `/map2/preset/<id>/fire` | Recall a preset by id | Input |
| `/map2/macro/<id>/fire` | Trigger a macro | Input |
| `/map2/gpio/in/<number>` | Read a virtual GPIO input state | Output |
| `/map2/gpio/out/<number>` | Set a virtual GPIO output state | Bidirectional |
| `/map2/meter/<channel>` | Subscribe/test metering feedback | Bidirectional |
| `/map2/cmd` | Send a free-form MAP2 command string | Input |
| `/map2/ping` | Send a ping and receive `/map2/out/ping` feedback | Input |

## Implicit output addresses

| Address | Purpose |
| --- | --- |
| `/map2/out/active/preset` | Active preset feedback after preset or chain recalls |
| `/map2/out/active/cue/<list>/<number>` | Active cue feedback for event-list fires |
| `/map2/out/transport/bpm` | Current clock BPM feedback |
| `/map2/out/event/cue/<list>/<number>/fire` | Cue-fired notification |
| `/map2/out/event/preset/<id>/recall` | Preset recall notification |
| `/map2/out/meter/<channel>` | Meter feedback stream |
| `/map2/out/ping` | Ping response payload with echo and timestamp |

## Browser and dispatch

- Browser endpoint: `GET /api/midi/hub/network/osc/namespace`
- Direct dispatch endpoint: `POST /api/midi/hub/network/osc/namespace/dispatch`
- Live `/map2/*` UDP OSC packets received by the MIDI Hub OSC bridge are dispatched through the same namespace router.

## Notes

- Meter output is designed to be throttled to control-surface-safe rates.
- `/map2/*` traffic coexists with legacy ad-hoc OSC-to-MIDI mappings; non-namespace addresses continue to use the legacy mapping table.
- Namespace events are retained as a recent feedback log so the browser can show current values and recent implicit output activity.
