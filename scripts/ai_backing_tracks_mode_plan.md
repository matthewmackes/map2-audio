# MAP2 Drum Machine: Backing Tracks Mode & Global Transport Controls — AI Implementation Script

## 1. Add Backing Tracks For Guitar Mode

- Add a third mode: `Backing Tracks For Guitar` to the mode toggle (alongside Practice and Advanced).
- Persist `ui_mode` as `"backing_tracks"` in state.
  - Acquire 100 copyright-safe backing tracks from reputable web sources (varied genres/keys/tempos).
- Store tracks in `data/backing_tracks/factory/` with metadata (title, genre, key, tempo, time signature, description).
- On backend startup, index built-in tracks and expose via `/api/engine/backing_tracks/library?type=factory`.
- Scan a user-configurable folder (e.g., `~/Music/BackingTracks/`) for user tracks (WAV, MP3, FLAC, AIFF) and expose via `/api/engine/backing_tracks/library?type=user`.
- Implement a Backing Track Player UI card:
  - Track browser (search/filter by genre/key/tempo)
  - Play/Pause/Stop, seek bar, waveform, tempo/pitch shift, section markers (if available), loop section, favorites, setlist
- Add API endpoints:
  - `/api/engine/backing_tracks/state` (GET/PATCH)
  - `/api/engine/backing_tracks/library` (GET)
  - `/api/engine/backing_tracks/play` (POST)
  - `/api/engine/backing_tracks/stop` (POST)
  - `/api/engine/backing_tracks/seek` (POST)
  - `/api/engine/backing_tracks/tempo` (PATCH)
- Ensure seamless mode switching and playback in all modes.

## 2. Add Global Transport Controls (Palette)

- Add persistent Play, Stop, and Tap Tempo controls to the "palette" on the main grid/webpage.
- Controls must affect global plugin playback in all modes (Practice, Advanced, Backing Tracks).
- Palette UI:
  - Three large, accessible buttons: Play (toggle Play/Pause), Stop, Tap Tempo
  - Always visible or easily accessible from any mode
  - Visual feedback: Play glows when active, Tap flashes on tap
  - Keyboard shortcuts: Space (Play/Pause), S (Stop), T (Tap Tempo)
- Controls call backend endpoints:
  - `POST /api/engine/drums/play`
  - `POST /api/engine/drums/stop`
  - `POST /api/engine/drums/tap_tempo` (or PATCH `/api/engine/drums/state` with new tempo)
- Tap Tempo updates tempo in all modes and reflects in UI.
- Test in all modes to ensure consistent, global playback control.

---

*This script is intended for direct execution by an AI agent or as a step-by-step implementation checklist for the MAP2 Audio Platform.*
