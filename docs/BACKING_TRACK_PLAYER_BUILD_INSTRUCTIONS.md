# Backing Track Player Plugin — Complete Build Instructions

This document provides a step-by-step guide for an AI or developer to implement the Backing Track Player plugin as planned, with Advanced mode as default and all required features.

---

## 1. Deployment Mode Integration
- Add a new mode: `BACKING_TRACKS` to the `DeploymentMode` enum in `app/deployment/deployment.py`.
- Update `SERVICE_POLICIES` to include:
  - `backing_tracks_server`: ENABLED
  - `web_ui`, `api_server`, `tui`, `database`, `mdns_discovery`: ENABLED
  - `juce_engine`, `audio_io`, `plugin_loader`, `lcd_manager`: DISABLED
- Update all mode switchers (API, TUI, config) to support the new mode.

## 2. Backing Tracks Service/Plugin
- Create `app/services/backing_tracks_server.py`:
  - Serve 100 bundled tracks from `resources/backing_tracks/`.
  - Allow browsing/playing tracks from user/system directories (configurable path).
  - Provide methods:
    - `list_builtin_tracks()`
    - `list_system_tracks(directory)`
    - `play_track(track_id or path)`
    - `get_track_metadata(track_id or path)`
- Ensure playback supports MP3/WAV and can stream to web/TUI clients.

## 3. API Endpoints
- In `app/routes/backing_tracks.py`, implement:
  - `GET /api/backing_tracks/builtin` — List built-in tracks
  - `GET /api/backing_tracks/system?dir=...` — List system tracks
  - `POST /api/backing_tracks/play` — Play a track
  - `GET /api/backing_tracks/metadata?id=...` — Get metadata
- Integrate with FastAPI and ensure endpoints are documented.

## 4. Web UI (React)
- Add a new page/tab: “Backing Tracks”
  - Tabs for “Built-in” and “System Library”
  - Unified searchable/filterable list
  - Waveform display for selected track
  - Section markers (add, name, jump)
  - A/B looping with draggable handles
  - Tempo/pitch controls (time-stretch, pitch-shift)
  - Metronome and count-in controls
  - Chord/scale overlays (user-supplied or pre-tagged)
  - Jam mode (random key/tempo suggestion)
  - Drag-and-drop for importing user tracks
  - Keyboard shortcuts for all major actions
  - Dark/light mode toggle
  - Responsive/mobile-friendly layout
  - Modals/drawers for quick actions (e.g., add to setlist)
  - Floating action button for “Start Practice” or “Record Yourself”
  - Snackbar/toast notifications for feedback
  - Virtualized lists for large libraries
  - Animations for transitions and feedback (Lottie, Framer Motion)

## 5. TUI Integration
- Add a TUI screen for browsing, searching, and playing tracks (both built-in and system).
- Provide playback controls, section markers, and looping.

## 6. Practice Analytics
- Track and display practice time per song.
- Visualize improvement with charts (e.g., time spent, tempos used).

## 7. Plugin Extensibility
- Designate a `plugins/` directory for user extensions.
- Expose a plugin API for custom effects, MIDI footswitch integration, etc.

## 8. Data & Configuration
- Place 100 bundled tracks in `resources/backing_tracks/`.
- Allow user to configure system-wide library paths via settings or UI.

## 9. Installation & Build
- **Frontend:**
  - Install dependencies:
    ```sh
    cd web
    npm install @mui/material @emotion/react @emotion/styled react-dropzone framer-motion react-virtualized recharts
    # or
    yarn add @mui/material @emotion/react @emotion/styled react-dropzone framer-motion react-virtualized recharts
    ```
  - Build and start:
    ```sh
    npm run build && npm start
    # or
    yarn build && yarn start
    ```
- **Backend:**
  - Install dependencies:
    ```sh
    pip install fastapi uvicorn pydub soundfile
    ```
  - Start server:
    ```sh
    uvicorn app.main:app --reload
    ```

## 10. Documentation
- Update all relevant docs:
  - Add new mode to mode tables and explanations
  - Document all new API endpoints and UI features
  - Provide user guide for practice tools and analytics

---

**For reference, see:**
- [BACKING_TRACK_PLAYER_FEATURES.md](BACKING_TRACK_PLAYER_FEATURES.md)
- [DEPLOYMENT_MODE_COMPARISON.md](DEPLOYMENT_MODE_COMPARISON.md)
- [DEPLOYMENT_MODES_EXPLAINED.md](DEPLOYMENT_MODES_EXPLAINED.md)

**Last Updated:** February 7, 2026
