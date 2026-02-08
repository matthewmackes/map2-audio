# MAP2 Audio Platform: Drum Machine Plugin & Backing Tracks Player — Unified AI Implementation Script

## 1. Drum Machine Plugin: Practice, Advanced, and Songbook Modes

### A. Modes
- **Practice Mode:** Simple, beat-first UI for guitarists. Curated style picker, variation slider, mini-mixer, tempo tools, and instant-start defaults.
- **Advanced Mode:** Full-featured dock-panel UI with mixer, timeline/piano roll, performance mode, browser, and settings. All pro features (undo/redo, quantize, fills, MIDI learn, multi-track export, etc.).
- **Songbook/Arrangements:** Factory pack of 100 classic rock practice arrangements (sectioned, style-based, not song-exact). Indexed for both Practice and Advanced modes.
- **Rolling Stone Import:** User can import a Rolling Stone (or other) top-100 list via CSV and generate a local songbook pack (never shipped in repo).

### B. API & State
- All state and parameter changes via `/api/engine/drums/*` endpoints.
- Practice mode fields: `ui_mode`, `practice_style_id`, `practice_variation`, `practice_change_quantization`, `practice_count_in_bars`, `practice_auto_fill`, etc.
- Songbook/arrangement packs indexed from `data/drums/factory_packs/*.json` and `data/drums/generated/*.json`.

### C. Content & Library
- Built-in practice styles: `rock_8`, `rock_16`, `shuffle_blues`, `funk_16`, `metal_doublekick`, `pop_4onfloor`, `jazz_swing`, `reggae_1drop`.
- Factory pack: `classic_rock_guitar_practice_1965_1990.json` (100 entries, sectioned, style-based).
- User import: CSV template and import script for Rolling Stone or other lists.

### D. UI & UX
- Practice Mode: One-screen, large transport, style picker, variation, mini-mixer, fill, auto-fill, tempo trainer, loop, subdivision, mix presets, favorites.
- Advanced Mode: Dock-panel layout, vertical drum list, inspector, waveform/piano roll, pattern comparison, quantization, pattern chaining, performance mode, browser, settings.
- Both modes access the same pattern/kit/groove library.

### E. Integration
- Add new router: `app/routes/drums.py` with `/api/engine/drums/*` endpoints.
- Register router in `app/main.py` by adding 'drums' to `route_modules`.
- Index and expose all packs for both Practice and Advanced modes.
- All user content must use MAP2-managed storage and upload pipeline.

---

## 2. Backing Tracks For Guitar Mode (NEW, as a Drum Machine Plugin Mode)

### A. Mode & State
- **This player is not a separate component, but a third mode of the Drum Machine plugin.**
- Add a third mode: `Backing Tracks For Guitar` to the mode toggle, alongside Practice and Advanced.
- Persist `ui_mode` as `"backing_tracks"` in the shared drum machine plugin state.
- State fields for current track, playback position, tempo/pitch shift, favorites, setlist, are part of the plugin state.

### B. Backing Track Library
- **Built-in:** 100 copyright-safe tracks in `data/backing_tracks/factory/` with metadata (title, genre, key, tempo, time signature, description).
- **User Library:** Scan user folder (e.g., `~/Music/BackingTracks/`) for audio files (WAV, MP3, FLAC, AIFF).
- Index both at backend startup and expose via `/api/engine/backing_tracks/library?type=factory|user`.

### C. Backing Track Player
- UI card with track browser (search/filter), play/pause/stop, seek bar, waveform, tempo/pitch shift, section markers (if available), loop, favorites, setlist.
- API endpoints:
  - `/api/engine/backing_tracks/state` (GET/PATCH)
  - `/api/engine/backing_tracks/library` (GET)
  - `/api/engine/backing_tracks/play` (POST)
  - `/api/engine/backing_tracks/stop` (POST)
  - `/api/engine/backing_tracks/seek` (POST)
  - `/api/engine/backing_tracks/tempo` (PATCH)
- Integrate audio playback engine (reuse or add new player as needed).

### D. Integration
- Add new router: `app/routes/backing_tracks.py` with `/api/engine/backing_tracks/*` endpoints.
- Register router in `app/main.py` by adding 'backing_tracks' to `route_modules`.
- Ensure seamless mode switching between Practice, Advanced, and Backing Tracks modes within the Drum Machine plugin UI and state.

---

## 3. Global Transport Controls (Palette)

### A. Controls & UI
- Add persistent Play, Stop, and Tap Tempo controls to the "palette" on the main grid/webpage.
- Controls must affect global plugin playback in all modes (Practice, Advanced, Backing Tracks).
- Palette UI:
  - Three large, accessible buttons: Play (toggle Play/Pause), Stop, Tap Tempo
  - Always visible or easily accessible from any mode
  - Visual feedback: Play glows when active, Tap flashes on tap
  - Keyboard shortcuts: Space (Play/Pause), S (Stop), T (Tap Tempo)

### B. API Integration
- Controls call backend endpoints:
  - `POST /api/engine/drums/play`
  - `POST /api/engine/drums/stop`
  - `POST /api/engine/drums/tap_tempo` (or PATCH `/api/engine/drums/state` with new tempo)
- Tap Tempo updates tempo in all modes and reflects in UI.
- Test in all modes to ensure consistent, global playback control.

---


## 4. Deployment & Implementation Checklist

1. **Audio Engine Capability Check:**
  - Verify that the audio engine supports long-form audio playback (for full-length backing tracks) and real-time tempo/pitch shift.
  - If not, update the engine to integrate a suitable library (e.g., Rubber Band, SoundTouch, or JUCE’s time-stretching) or add a new backend service for this purpose.
  - Ensure the engine can handle both drum pattern playback and backing track playback seamlessly.
2. Implement/extend routers: `app/routes/drums.py`, `app/routes/backing_tracks.py`.
3. Register routers in `app/main.py` by adding to `route_modules`.
4. Curate and add 100 built-in practice arrangements and 100 backing tracks with metadata.
5. Implement/extend backend indexing for packs and tracks.
6. Implement/extend frontend UI for all three modes and the global palette.
7. Ensure all endpoints, state fields, and UI behaviors match this spec.
8. Test all modes, content import, and global controls for seamless operation.

---

*This script is intended for direct execution by an AI agent or as a comprehensive implementation checklist for the MAP2 Audio Platform Drum Machine and Backing Tracks Player.*
