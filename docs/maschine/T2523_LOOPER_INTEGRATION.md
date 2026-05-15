# T2523 — Maschine MK1 ↔ Looper Integration

**Status:** Shipped (cycles 17-21 of extended Continue run, 2026-05-14)
**Epic:** Bridges the T2512 multi-track Looper service to the MK1's
transport zone + dual LCDs.

This doc captures the end-to-end picture of what the operator gets,
the code surface, and what's intentionally deferred.

---

## What the operator sees

### On the MK1 hardware

The five transport buttons (Play, Stop, Rec, Restart, Erase) drive
the looper's state machine on Track 0:

| Button     | Looper verb         | Mixxx-style semantics                                |
|------------|---------------------|-------------------------------------------------------|
| Rec        | `record(track)`     | EMPTY → RECORDING → PLAYING → OVERDUBBING            |
| Play       | `play_track(track)` | Resume / re-trigger playback                          |
| Stop       | `stop_track(track)` | STOPPED, preserves content                            |
| Restart    | `restart_track(t)`  | Jump playhead back to loop start                      |
| Erase      | `clear(track)`      | Drop all content (long-press confirm in GUI)          |

A write-locked track silently rejects mutating verbs — the daemon
swallows `LooperServiceError("track_locked")` to a debug log so the
operator hears no audio change rather than a daemon crash.

### On the MK1 dual LCDs

`MaschineLCDRenderService.render(context="looper")` composes both
panels via `_Canvas` primitives (no JSON profile needed):

- **Left LCD** — four-track loop-status grid:
  - One row per track 0-3 (padded if service returns fewer)
  - State glyph: `REC` / `OVR` / `PLAY` / `STOP` / `----` (empty)
  - Layer counter (L0..LN)
  - Playhead position bar — hollow rect for the loop, fill portion
    proportional to `playhead_frames / loop_length_frames`

- **Right LCD** — master controls:
  - Active track count (N/4)
  - Master gain (signed dB)
  - Mute label
  - Tempo (BPM from `SnapshotTempoService`, or `----`)
  - Sync-master track (`T<n>` or `---`)

Returned payload includes the full LooperService `to_payload()` dict
in a top-level `looper` field so GUI consumers can do their own
typography while sharing the exact same state the physical MK1
renders. **Single source of truth** for both surfaces (locked
decision Q6).

### In the React Performance tab

`web/src/app/components/Maschine/MaschineLooperSection.tsx` mounts
between the Step Sequencer and Quad Morph zone (locked decision Q4):

- Header strip: Live/Stale/Connecting tag, active-track count,
  master dB + mute, BPM, sync-master track.
- 4-track grid mirrors the LCD render context with Carbon tones
  (red=recording, magenta=overdubbing, green=playing, cyan=stopped,
  warm-gray=empty), layer count, optional LOCK tag, playhead
  progress bar.
- Transport buttons (Rec/Play/Stop/Restart/Erase) dispatch into
  `looperApi.{record,play,stop,restart,clear}` against Track 0.
- Transient flash (200 ms) on the matching button when a physical
  `transport_press` HID event lands; motion-reduce safe.

State source is the new `useLooperLiveStatus` hook (T2523-D) which
subscribes to the existing T2512-WS `looper:status` topic and keeps
a 2 s safety-net HTTP refresh for pure playhead motion.

---

## Code surface

### Backend

- `app/services/looper_service.py` — added three transport verbs:
  - `play_track(track)`
  - `restart_track(track)`
  - `toggle_quantize(track)` (delegates to `set_quantize_division`)
- `app/routes/looper.py` — three new HTTP routes:
  - `POST /api/v1/looper/track/{t}/play`
  - `POST /api/v1/looper/track/{t}/restart`
  - `POST /api/v1/looper/track/{t}/toggle-quantize`
- `app/services/maschine/maschine_mk1_daemon.py`:
  - Imports `LooperService` + `get_looper_service`
  - New `_LOOPER_ACTIVE_TRACK = 0` constant (v1 pin)
  - New `_dispatch_looper_transport(action)` method routes a
    `transport_press` into the local looper service; called from
    `_dispatch_transport_action` after the existing
    `/api/transport/{action}` HTTP POST
- `app/services/maschine_lcd_service.py`:
  - New `_collect_looper_state()` reads LooperService payload
  - New `_render_looper_left()` + `_render_looper_right()` compose
    both panels via `_Canvas` primitives
  - New `_render_looper()` returns the looper render context, called
    from `render()` when `context == "looper"`

### Frontend

- `web/src/map2/clients/looper.ts` — added `play`, `restart`,
  `toggleQuantize` methods
- `web/src/app/components/Maschine/MaschineLooperSection.tsx`
  (new) — Performance-tab looper section
- `web/src/app/hooks/useLooperLiveStatus.ts` (new) — reusable WS
  subscription hook
- `web/src/app/components/Maschine/MaschinePerformanceTab.tsx` —
  mounts `MaschineLooperSection` between StepSequencer and QuadMorph
- `web/src/app/pages/MaschinePage.css` — section styles + flash
  keyframes + motion-reduce override

### Device packs

- `device-packs/_schema/...` and existing
  `_generic/midi-learn-looper/scripts/looper.js` already provided
  the canonical mapping shape. Drive-by fix in cycle 17:
  three profiles (`boss/fs-7-looper`,
  `meloaudio/midi-commander-looper`, and
  `meloaudio/midi-commander-looper-4track`) had
  `scripts: ['../../_generic/.../looper.js']` paths that resolved
  one level above the repo root. Corrected to `../_generic/...` so
  the `test_midi_profile_script_references_resolve` gate passes.

---

## Test surface

| Suite                                                 | Cases |
|--------------------------------------------------------|------:|
| `tests/test_looper_service.py` (T2523 additions)       |    +9 |
| `tests/test_looper_routes.py` (T2523 additions)        |    +6 |
| `tests/test_maschine_mk1_looper_transport_t2523.py`    |    11 |
| `tests/test_maschine_lcd_service.py` (T2523 additions) |    +3 |
| `web/.../MaschineLooperSection.test.tsx`               |    10 |
| `web/.../useLooperLiveStatus.test.tsx`                 |     8 |

All green at cycle-21 close.

---

## Deferred / out-of-scope

T2523 intentionally ships the bridge layer only. The following items
are filed as follow-on slices and **not** required for the epic's
"Done" gate:

- **NoteRepeat → quantize toggle.** The locked decision lists NoteRepeat
  as one of the 7 in-scope buttons, but the MK1 NoteRepeat button is
  busy with menu-activate semantics (`maschine_mk1_daemon.py` line
  ~1317). A SHIFT+NoteRepeat combo would free the primary path; filed
  as `T2523-NR` follow-on.

- **Tap Tempo.** The MK1 has no dedicated tap-tempo button — Tempo
  lives on an encoder in the encoder zone, not the transport zone.
  An encoder-zone slice would route Tempo encoder press into the
  snapshot-tempo-service tap path; filed as `T2523-TT` follow-on.

- **Multi-track active-track selection.** V1 pins active track to 0
  (`_LOOPER_ACTIVE_TRACK = 0`). SHIFT+Group A/B/C/D would cycle the
  active track; filed as `T2523-MT` follow-on.

- **Long-press confirm for Erase.** Per locked decision Q2 the erase
  press should have a long-press confirm. V1 commits the clear
  immediately on press — the operator's long-press confirm flow lives
  in the GUI today (the Erase button is visually flagged danger and
  produces an immediate clear). A daemon-side long-press detection
  slice can land later; filed as `T2523-EC` follow-on.

- **C++ RT engine bindings** (`looper_play`, `looper_restart`).
  These are part of the existing T2511 RT engine slice that's deferred
  pending operator RT-safety review. Until they land, the service-
  layer verbs record activity + broadcast WS frames so the controller
  UX is testable end-to-end against the deferred engine slice. No
  audio is missed once T2511 lands — the bindings hook in without
  any change at the service / route / daemon layer.

- **Tab-style switching for the Maschine LCD.** Right now
  `context="looper"` is set explicitly by the daemon / API caller.
  An operator button-cycle to flip the LCD between `audio_grid` and
  `looper` is a UX slice independent of the transport wiring; the
  current pattern matches every other Maschine LCD context.
