# MAP2 Audio Platform — JUCE Drum Machine Enhanced Integration Guide

## Original 12-Step Integration Framework
*(See MAP2 Audio Platform — Native Effect Integration Guide for base integration pattern)*

---

## MAP2 Platform Integration Requirements (Non‑Negotiable)

These requirements make the drum machine “work best” inside MAP2 by reusing the existing engine + API + UI conventions for **MIDI** and **asset management**.

### A) MIDI: MUST use MAP2 MIDI v2 (no custom MIDI mapping stack)

- **Do not implement** a separate `MidiLearner`, `midi_mapping_service.py`, or a new DB table for CC mappings.
- **Do implement** drum-machine parameters as normal MAP2 parameters that can be targeted by the existing MIDI v2 system:
  - Stable `target_param_index` and stable `target_param_symbol` for every mappable control.
  - Prefer mapping to *parameters* for continuous controls, and to *command triggers* for discrete actions.

**Canonical endpoints (use these from the React UI):**

- List devices: `GET /api/v2/midi/devices`
- Open input device: `POST /api/v2/midi/devices/input` body `{ "device_name": "..." }`
- Create mapping: `POST /api/v2/midi/mappings`
- List mappings: `GET /api/v2/midi/mappings?chain_id=<id>&plugin_uri=<uri>`
- Start learn: `POST /api/v2/midi/learn/start`
- Learn status: `GET /api/v2/midi/learn/status`
- Stop learn: `POST /api/v2/midi/learn/stop`
- Create command trigger (pattern/fill actions): `POST /api/v2/midi/commands`

**Mapping create request (example):**

```json
{
  "channel": 0,
  "cc": 74,
  "chain_id": 1,
  "target_plugin_uri": "map2://juce/instrument/drum_machine",
  "target_param_index": 12,
  "target_param_symbol": "drum_3_level",
  "min_val": 0.0,
  "max_val": 1.0,
  "curve_type": "s_curve",
  "invert": false,
  "feedback_enabled": true,
  "feedback_cc": 74,
  "name": "Snare Level",
  "group_id": null
}
```

**Learn start request (example):**

```json
{
  "chain_id": 1,
  "plugin_uri": "map2://juce/instrument/drum_machine",
  "param_symbol": "master_level",
  "param_index": 0,
  "min_val": 0.0,
  "max_val": 1.0,
  "curve_type": "linear"
}
```

### B) Sample/Kits: MUST use centralized storage + unified upload pipeline

- All user content must live in MAP2-managed storage paths (no arbitrary filesystem assumptions).
- All imports must route through the platform’s unified upload/validation/dedup pipeline.

**Storage conventions (add to `StoragePaths` in MAP2 backend):**

- `~/.local/share/map2/drums/kits` (kit manifests + references)
- `~/.local/share/map2/drums/samples` (audio samples)
- `~/.local/share/map2/drums/grooves` (MIDI fills/grooves)
- `~/.local/share/map2/drums/previews` (cached waveforms/peaks)

**Upload conventions:**

- Always call `POST /api/upload/validate` first (fast client-side UX)
- Then call `POST /api/upload/` (or `/batch`) to persist.
- Extend the upload service to add drum-specific asset types:
  - `drum_sample` (WAV/FLAC/AIFF)
  - `drum_kit_pack` (ZIP: `kit.json` + samples, optionally SFZ)
  - `drum_groove_pack` (MID/ZIP)

**Identity & portability rules:**

- Persist sample references by **content hash** (e.g., SHA‑256) + relative storage path, never absolute paths.
- Any kit/preset export must be relocatable: include hashes + metadata so MAP2 can re-resolve files.

### C) API style: follow existing native-processor route conventions

- Implement a dedicated native-processor API module: `router = APIRouter(prefix="/api/engine/drums", tags=["drums"])`.
- Use `GET` for state, `PATCH` for partial parameter updates, and keep payloads Pydantic-validated like the existing `/api/engine/dynamics` and `/api/engine/delay` routes.

---

## Concrete Contracts (So Another AI Can Implement Without Guessing)

This section is intentionally specific: it defines the drum machine’s **plugin identity**, **parameter manifest**, and the **REST API contract** the React UI should target.

### 1) Plugin Identity

- **Plugin URI (native JUCE processor):** `map2://juce/instrument/drum_machine`
- **Category:** `instrument`
- **MIDI:**
  - Note input: pad/drum triggering + recording
  - CC mappings: handled by MAP2 MIDI v2, targeting the parameters listed below
  - Discrete actions: handled by MAP2 MIDI v2 commands (pattern/fill/transport)

### 2) Parameter Manifest (Stable Symbols + Stable Indices)

MAP2 MIDI v2 expects a stable `target_param_index` and stable `target_param_symbol`.

**Rule:** indices must never change once shipped. Add new parameters only by appending new indices.

#### 2.1 Global Parameters (indices 0–31 reserved)

| Index | Symbol | Range | Default | Notes |
|---:|---|---|---:|---|
| 0 | master_level | 0.0–1.0 | 0.8 | Master output |
| 1 | tempo_bpm | 20–300 | 120 | Used when not host-synced |
| 2 | tempo_sync_enabled | 0/1 | 1 | 1=follow host if available |
| 3 | swing | 0.0–1.0 | 0.0 | Swing amount |
| 4 | humanize | 0.0–1.0 | 0.0 | Timing/velocity randomization |
| 5 | metronome_enabled | 0/1 | 0 | UI + record assist |
| 6 | pattern_select | 0–127 | 0 | Discrete selector; UI can step |
| 7 | kit_select | 0–127 | 0 | Discrete selector |
| 8 | transport_play | 0/1 | 0 | Expose for mapping; action may be mirrored by MIDI command |
| 9 | transport_stop | 0/1 | 0 | Expose for mapping; action may be mirrored by MIDI command |
| 10 | record_enabled | 0/1 | 0 | Arms pattern recording |

#### 2.2 Per-Drum Parameters (block-per-drum, indices 32+)

To scale to 30+ drums and keep indices stable, allocate a fixed block size per drum.

- **Block size:** 16 indices per drum
- **Base index:** `drum_base(drum_id) = 32 + (drum_id * 16)`
- `drum_id` is 0-based (0..N-1)

| Offset | Symbol Suffix | Range | Default | Meaning |
|---:|---|---|---:|---|
| 0 | level | 0.0–1.0 | 0.8 | Track level |
| 1 | mute | 0/1 | 0 | Mute |
| 2 | solo | 0/1 | 0 | Solo |
| 3 | pan | -1.0–1.0 | 0.0 | Pan |
| 4 | tune_semitones | -24–24 | 0 | Coarse tune |
| 5 | tune_cents | -100–100 | 0 | Fine tune |
| 6 | decay | 0.0–2.0 | 1.0 | Decay multiplier |
| 7 | tone | 0.0–1.0 | 0.5 | Bright/dull |
| 8 | drive | 0.0–1.0 | 0.0 | Saturation |
| 9 | velocity_to_level | 0.0–1.0 | 1.0 | Velocity sensitivity |
| 10 | choke_group | 0–15 | 0 | 0=none, else group id |
| 11 | midi_note | 0–127 | (kit) | Note mapping per drum |
| 12 | sample_select | 0–127 | 0 | Selector for current assigned sample layer set |
| 13 | reserved_13 | — | — | Reserved for future |
| 14 | reserved_14 | — | — | Reserved for future |
| 15 | reserved_15 | — | — | Reserved for future |

**Symbol naming:**

- Per-drum parameter symbols must be emitted as: `drum_<drum_id>_<suffix>`
  - Example: `drum_3_level`, `drum_3_mute`, `drum_3_tune_semitones`

### 3) Drum Engine REST API Contract (`/api/engine/drums/*`)

Implement a dedicated route module (FastAPI) mirroring MAP2 native processors:

#### 3.1 State

- `GET /api/engine/drums/state`
  - Returns current global params + selected kit + active pattern + summary counts.

Response (example):

```json
{
  "plugin_uri": "map2://juce/instrument/drum_machine",
  "tempo": { "bpm": 120.0, "sync_enabled": true, "host_bpm": 120.0 },
  "transport": { "playing": false, "recording": false, "position": { "bar": 1, "beat": 1, "tick": 0 } },
  "selection": { "kit_id": "kit:factory:modern_tight", "pattern_id": "pat:0" },
  "counts": { "drums": 16, "patterns": 32, "fills": 96 },
  "globals": {
    "master_level": 0.8,
    "swing": 0.0,
    "humanize": 0.0,
    "metronome_enabled": false
  }
}
```

- `PATCH /api/engine/drums/state`
  - Partial update of **global** parameters.
  - Must be idempotent and validate ranges.

Request (example):

```json
{ "master_level": 0.75, "swing": 0.12 }
```

#### 3.2 Library (kits/samples/grooves)

**Goal:** the UI must never read raw filesystem paths directly. It calls these endpoints.

- `GET /api/engine/drums/library/kits?limit=50&offset=0&category=...`
- `GET /api/engine/drums/library/samples?limit=100&offset=0&format=wav|flac|aiff`
- `GET /api/engine/drums/library/grooves?type=fill|pattern&kit_id=...`

Each item must include:

- Stable `id` (e.g., `kit:factory:909`, `kit:user:<uuid>`)
- `name`, `category`, `tags[]`, `license`, `source`
- For samples: `hash` (sha256), `size`, `sample_rate`, `channels`, `duration_ms`

#### 3.3 Import flow (uses MAP2 unified upload)

**UI import sequence (mandatory):**

1) `POST /api/upload/validate` (optional but recommended for UX)
2) `POST /api/upload/` or `/api/upload/batch`
3) `POST /api/engine/drums/library/import`

- `POST /api/engine/drums/library/import`
  - Links uploaded assets into the drum library and performs any pre-processing (decode, resample, waveform cache).

Request (example):

```json
{
  "asset_type": "drum_kit_pack",
  "file_hash": "<sha256>",
  "file_path": "<server_path_returned_by_upload>",
  "options": { "resample_to_engine_rate": true, "build_waveforms": true }
}
```

Response (example):

```json
{ "success": true, "imported": { "kits": 1, "samples": 24, "grooves": 12 }, "kit_ids": ["kit:user:..." ] }
```

#### 3.4 Kit load + per-drum assignment

- `POST /api/engine/drums/kits/load` body `{ "kit_id": "kit:..." }`
- `PATCH /api/engine/drums/kits/assign`
  - Assign a sample (by hash) to a drum slot.

Request (example):

```json
{ "kit_id": "kit:user:...", "drum_id": 3, "sample_hash": "<sha256>", "layer": 0 }
```

#### 3.5 Patterns + editing

- `GET /api/engine/drums/patterns/{pattern_id}`
- `PATCH /api/engine/drums/patterns/{pattern_id}`
  - Patch-based edits: add/remove notes, set velocity, set length.

Request (example):

```json
{
  "ops": [
    { "op": "add_note", "drum_id": 1, "bar": 2, "step": 7, "velocity": 0.9, "length": 1 },
    { "op": "delete_note", "drum_id": 5, "bar": 1, "step": 15 }
  ]
}
```

#### 3.6 Quantize + record

- `POST /api/engine/drums/patterns/{pattern_id}/quantize` body `{ "grid_division": "1/16", "swing": 0.12, "humanize": 0.02 }`
- `POST /api/engine/drums/record/start` body `{ "pattern_id": "pat:0", "duration_bars": 4, "count_in_bars": 1 }`
- `POST /api/engine/drums/record/stop`

### 4) React UI Wiring Requirements

- Use the existing MAP2 mapping dialog pattern: wrap the drum card with `withMidiDialog` and pass the **parameter defs** for common targets.
- All state reads should use the platform’s usual polling approach (React Query) rather than bespoke websocket protocols unless the platform already provides them.
- For any slider/knob: update local UI immediately, then `PATCH /api/engine/drums/state` (globals) or queue engine parameter updates through the drum processor’s API.

### 5) MIDI v2 Command Triggers (Drum Performance)

MAP2 already supports MIDI v2 command triggers at `POST /api/v2/midi/commands`.

#### 5.1 Existing v2 command schema (what the UI posts)

`CommandCreateRequest` (current server schema):

- `command_type`: `program_change` | `note_on` | `cc_toggle`
- `channel`: `0` omni, `1–16` specific
- `data1`: PC number OR Note number OR CC number
- `data2`: optional velocity/value threshold
- `action_type`: currently validated against server enum `ActionType`
- `target_chain_id` / `target_plugin_uri`
- `action_data`: free-form dict for extra parameters

#### 5.2 Current built-in action types (already supported)

These work today without any new engine changes:

- `activate_chain`, `toggle_chain`
- `toggle_plugin`
- `set_routing`
- `next_preset`, `prev_preset`

#### 5.3 Drum-machine action types (REQUIRED EXTENSION for best UX)

To map hardware buttons to drum performance actions (pattern/fill/transport) **without abusing CC-to-parameter mappings**, extend both:

- Python enum `ActionType` in `app/services/midi_service.py`
- C++ enum `CommandActionType` in `juce-engine/Source/MidiHandler.h`

Add these action type strings (names are part of the contract; do not change once shipped):

- `drums_transport_play_toggle`
- `drums_transport_stop`
- `drums_record_toggle`
- `drums_next_pattern`
- `drums_prev_pattern`
- `drums_launch_pattern`
- `drums_launch_fill`
- `drums_select_kit`

**Targeting rule:** all drum actions MUST set:

- `target_plugin_uri = "map2://juce/instrument/drum_machine"`

**Action data contract (stable keys):**

- `drum_chain_id` (optional int): if you want the action scoped to a chain
- `pattern_id` (string) OR `pattern_index` (int)
- `fill_id` (string) OR `fill_index` (int)
- `kit_id` (string) OR `kit_index` (int)
- `launch_quantization` (string): `"immediate" | "bar" | "beat"` (default `bar`)

#### 5.4 Exact payload examples (`POST /api/v2/midi/commands`)

**A) Footswitch toggles Play/Pause (CC toggle)**

```json
{
  "command_type": "cc_toggle",
  "channel": 1,
  "data1": 64,
  "data2": 64,
  "action_type": "drums_transport_play_toggle",
  "target_plugin_uri": "map2://juce/instrument/drum_machine",
  "name": "Drums Play/Pause",
  "action_data": { "launch_quantization": "bar" }
}
```

**B) Note-on launches Fill #12 (use a separate channel from drum hits)**

```json
{
  "command_type": "note_on",
  "channel": 1,
  "data1": 60,
  "data2": 1,
  "action_type": "drums_launch_fill",
  "target_plugin_uri": "map2://juce/instrument/drum_machine",
  "name": "Fill 12",
  "action_data": { "fill_index": 12, "launch_quantization": "bar" }
}
```

**C) Program Change selects Pattern index (program 0..127)**

```json
{
  "command_type": "program_change",
  "channel": 1,
  "data1": 7,
  "action_type": "drums_launch_pattern",
  "target_plugin_uri": "map2://juce/instrument/drum_machine",
  "name": "Pattern 7",
  "action_data": { "pattern_index": 7, "launch_quantization": "bar" }
}
```

#### 5.5 MVP fallback if you refuse to extend MIDI v2 actions

If you cannot extend ActionType/CommandActionType immediately, the minimum viable approach is:

- Map CCs to existing drum parameters via `POST /api/v2/midi/mappings`:
  - `pattern_select` (global param index 6)
  - `transport_play` / `transport_stop` (global param indices 8/9)
  - `record_enabled` (global param index 10)

This works but is less expressive than real command triggers (it forces discrete behavior through parameter changes).

---

## 10 Additional Essential Features for Professional Drum Machine

### Feature 1: Undo/Redo System
**User Need:** Workflow confidence — users want to experiment without fear of permanent changes.

**Implementation Scope:**
- **C++ Engine (DrumMachine.h/.cpp)**
  - Add `juce::UndoManager undoManager_` member
  - Wrap all pattern edits, parameter changes, and kit modifications in `UndoableAction` subclasses
  - Actions: `SetPatternNoteAction`, `DeleteNoteAction`, `SetDrumParamAction`, `LoadKitAction`, `SetGrooveAction`
  - Maintain action limit (default 100 steps, configurable)
  - Reset undo stack on pattern clear or new song load

- **Python Backend (app/services/drum_engine_service.py)**
  - Add `async def undo()` and `redo()` methods
  - Track state: `can_undo: bool`, `can_redo: bool`, `undo_depth: int`
  - Return full pattern/state diff after each undo/redo operation

- **React Frontend (hooks/useDrumUndo.ts)**
  - Hook returns: `undo()`, `redo()`, `canUndo`, `canRedo`, `undoLabel`, `redoLabel`
  - Global keyboard shortcuts: `Ctrl+Z` / `Cmd+Z` (undo), `Ctrl+Shift+Z` / `Cmd+Shift+Z` (redo)
  - Visual indicator in timeline header showing undo depth

**Estimated Integration:** 3 new C++ classes, 2 Python methods, 1 React hook + UI component

---

### Feature 2: Advanced Quantization & Time Grid Controls
**User Need:** Precision editing with human feel — snap to grid at various resolutions, quantize recordings, swing grid.

**Implementation Scope:**
- **C++ Engine (QuantizationEngine.h/.cpp)**
  - Enum: `GridDivision` (1/4, 1/8, 1/16, 1/32, triplet variants, swing triplets)
  - `struct QuantizationSettings`: gridDivision, swingAmount (0-1), humanizeAmount (0-1), quantizeNoteOnOff (bool)
  - Function: `quantizeMidiMessage(juce::MidiMessage, QuantizationSettings)` → returns quantized time
  - Function: `quantizePattern(MidiMessageSequence, QuantizationSettings)` → returns quantized sequence
  - Grid preview data: `getGridTicks(currentBar, QuantizationSettings)` → vector of PPQ positions for UI display

- **Python Backend (app/services/quantization_service.py)**
  - New service: `async def quantize_pattern(pattern, grid_division, swing_amount, humanize_amount)`
  - Return: quantized pattern + visual grid data
  - State: `current_grid_division`, `swing_amount`, `humanize_amount`

- **React Frontend (components/QuantizationPanel.tsx, hooks/useQuantization.ts)**
  - Grid selector buttons (1/4, 1/8, 1/16, 1/32, triplet)
  - Swing slider (0-100%)
  - Humanize slider (0-100%)
  - Grid overlay in piano roll (vertical lines showing snap positions)
  - Toggle "Snap to Grid" for editing
  - Visual swing indicator in grid lines

**Estimated Integration:** 2 new C++ classes, 1 Python service, 1 React hook + 2 components

---

### Feature 3: Fill Patterns / Variation Fills
**User Need:** Dynamic arrangement — users want pre-made drum fills and break variations (drum fills, cymbal crashes, hi-hat syncopation changes).

**Implementation Scope:**
- **C++ Engine (FillPatternLibrary.h/.cpp)**
  - Struct: `FillInfo` { name, duration (bars), category (cymbal_crash, tom_fill, hat_variation, tempo_double, half_time), difficulty, tempo_min, tempo_max }
  - `FillPatternLibrary` class: loads/manages 80–120 pre-built MIDI fills (1–4 bars)
  - Fills stored as `juce::MidiMessageSequence` (embedded via BinaryData or external folder)
  - Function: `getFillsByCategory()`, `getFillsByDuration()`, `getFillsByTempo()`
  - Fills tagged: "Cymbal Crash Fill 1", "Tom Fill Bright", "Hat Variation Open", "Double Time 4-Bar", "Half-Time Transition"
  - Storage: `fills/` folder with `<kit_name>_<fill_category>_<fill_id>.mid` or single fills.json with embedded MIDI

- **Python Backend (app/services/fill_service.py)**
  - New service: `async def get_available_fills(kit_name, category, duration_bars, tempo)` → returns list of FillInfo
  - Method: `async def insert_fill_at_position(pattern_id, bar_number, fill_id)` → inserts fill into pattern timeline
  - Method: `async def swap_groove_for_fill(pattern_id, bar_number, duration_bars, fill_id)`

- **React Frontend (components/FillBrowser.tsx, hooks/useFillPatterns.ts)**
  - Fill browser panel: category filter, duration, tempo range
  - "Quick Fill" button row in pattern editor (cymbal crash, tom fill, hat variation, double time)
  - Drag-drop fills into timeline
  - Preview fill on hover (plays in context of current groove)
  - Currently-playing fill indicator in timeline

**Estimated Integration:** 2 new C++ classes, 1 Python service, 2 React components + hook

---

### Feature 4: Advanced MIDI Learn & Macro Controller Mapping
**User Need:** Hardware integration — users want to map drum parameters, fills, patterns, and presets to MIDI controllers and keyboard shortcuts for live play.

**Implementation Scope:**

- **C++ Engine (DrumMachineProcessor + MAP2 MidiHandler integration)**
  - Do **not** create a parallel MIDI learn/mapping system.
  - Expose drum-machine controls as stable parameters (`param_index` + `param_symbol`) so the existing MAP2 `MidiHandler` + MIDI v2 services can target them.
  - Route **note input** for pad performance (Note On/Off → drum trigger) in the drum machine processor (this is *not* CC mapping; it’s normal instrument MIDI input).
  - Discrete performance actions (pattern/fill launch, next/prev pattern, start/stop) must be handled as **MIDI v2 command triggers**, not as CC mappings.

- **Python Backend (reuse existing `/api/v2/midi` + add drum endpoints only)**
  - No `midi_mapping_service.py`.
  - The drum machine UI must call:
    - `POST /api/v2/midi/learn/start` to bind a parameter
    - `POST /api/v2/midi/mappings` to persist a mapping
    - `POST /api/v2/midi/commands` to bind a discrete action
  - Drum-specific API belongs under `/api/engine/drums/*` (kits, patterns, imports), not under `/api/v2/midi/*`.

- **React Frontend (MIDI mapping UI should wrap the card with MAP2 dialog)**
  - Wrap the drum card with the existing mapping dialog pattern (MAP2 `withMidiDialog`).
  - Provide a parameter definition list for common targets so mapping is one-click:
    - `master_level`, `swing`, `humanize`
    - per-drum: `drum_<id>_level`, `drum_<id>_mute`, `drum_<id>_pan`, `drum_<id>_tune`, `drum_<id>_decay`
  - Optional: expose “command trigger” assignment UI that writes to `/api/v2/midi/commands` (pattern/fill actions).

**Estimated Integration:** 2 new C++ classes, 1 Python service, 2 React components + hook

---

### Feature 5: Multi-Track Audio Export (Stems)
**User Need:** DAW integration — users want to export individual drum tracks as separate WAV files for mixing in their DAW.

**Implementation Scope:**
- **C++ Engine (AudioExporter.h/.cpp)**
  - Class: `AudioExporter`
    - Function: `exportStemToFile(drumIndex, outputPath, format, sampleRate, bitDepth)` → bounces single drum voice to WAV
    - Function: `exportAllStems(outputFolder, format, sampleRate, bitDepth)` → exports kick, snare, hats, toms, cymbals, master, fx bus
    - Function: `exportMasterMix(outputPath)` → full stereo mix
    - Support: WAV, FLAC (lossless)
    - Options: sample rate (44.1k, 48k, 96k), bit depth (16, 24, 32-bit)
  - Mute all other drums during export for isolation
  - Include metadata in filename: `<song_name>_<drum_name>_<kit_name>_<date>.wav`

- **Python Backend (app/services/export_service.py)**
  - New service: `async def export_stems(song_id, export_format, folder_path)` → returns status + file paths
  - Method: `async def export_master_mix(song_id, folder_path)`
  - Background task: queue exports, progress reporting
  - Return: dict with exported files, durations, sample rates

- **React Frontend (components/ExportPanel.tsx, hooks/useExport.ts)**
  - Export dialog: checkbox list for each drum track + master
  - Options: format dropdown, sample rate, bit depth, folder chooser
  - Progress bar during export
  - Download links after completion
  - Preset save/load (e.g., "Full Stems 48k 24-bit")

**Estimated Integration:** 2 new C++ classes, 1 Python service, 1 React component + hook

---

### Feature 6: Tap Tempo & Host Sync with Click Track
**User Need:** Live tempo control — users want to tap in tempo, sync to DAW, and have a metronome/click track for recording alignment.

**Implementation Scope:**
- **C++ Engine (TempoEngine.h/.cpp)**
  - Struct: `TempoState` { bpm (60-300), tapTempoBpm, syncMode (internal/hostSync), clickEnabled, clickVolume, precount_bars }
  - Class: `TempoEngine`
    - `tapTempo()` — user presses button; system measures time between taps, smooths to average BPM
    - `setBpm(float)` — direct set
    - `getHostBpm()` — read from host (via `juce::AudioPlayHead`)
    - `generateClickTrack(numBars)` → MidiMessageSequence of metronome clicks (kick on 1, hat on beats)
    - Tap tempo history (last 10 taps) for smoothing/validation
    - Hysteresis: only update tap BPM if within ±50% of last tempo (avoid spurious taps)

- **Python Backend (app/services/tempo_service.py)**
  - Methods: `async def tap_tempo()`, `async def set_bpm(bpm)`, `async def set_sync_mode(mode)`, `async def enable_click(enabled)`
  - State: `current_bpm`, `tap_bpm`, `sync_mode`, `host_bpm`, `click_enabled`, `click_volume`

- **React Frontend (components/TempoControl.tsx, hooks/useTempo.ts)**
  - Large tap button (visual feedback on tap)
  - BPM display + spinner/slider for fine control
  - Sync mode toggle (Internal / Host)
  - Click track toggle + volume slider
  - Pre-count spinner (0-4 bars)
  - Visual BPM indicator (LEDs or waveform sync)
  - Tap history display (shows last 10 tap intervals)

**Estimated Integration:** 2 new C++ classes, 1 Python service, 1 React component + hook

---

### Feature 7: Per-Drum Sample Tuning & Character Controls
**User Need:** Sound customization — users want pitch, decay, tone control, and saturation per drum without loading new samples.

**Implementation Scope:**
- **C++ Engine (DrumTuningProcessor.h/.cpp)**
  - Per-drum parameters:
    - `pitch` (semitones: -24 to +24, or cents)
    - `decay` (0-100, multiplier on envelope release time)
    - `brightness` (0-100, EQ shift: more = more highs)
    - `punch` (0-100, add transient/compression)
    - `saturation` (0-100, soft-clip warmth, 0 = none)
    - `resonance` (0-100, accentuate key frequencies: kick = 50Hz, snare = 150Hz, hat = 8kHz, etc.)
  - Apply as post-processing in DrumVoice::renderNextBlock()
  - Simple processors: pitch shifter (time-stretching), 3-band EQ, soft-clip saturation, envelope multiplier

- **Python Backend (app/services/drum_tuning_service.py)**
  - Methods: `async def set_drum_tune_param(drum_index, param_name, value)`
  - State: per-drum tune dict { pitch, decay, brightness, punch, saturation, resonance }
  - Save/load tuning presets

- **React Frontend (components/DrumTuningPanel.tsx, hooks/useDrumTuning.ts)**
  - Mini panel per drum: 6 sliders (pitch, decay, brightness, punch, saturation, resonance)
  - Visual feedback: waveform preview showing pitch/saturation effect
  - Preset buttons: "Tighter", "Warmer", "Punchier", "Duller"
  - Reset to defaults per drum

**Estimated Integration:** 1 new C++ class, 1 Python service, 1 React component + hook

---

### Feature 8: Pattern Chaining & Conditional Sequences
**User Need:** Advanced arrangement — users want to link patterns (A→B→C→fill→A), set repeat counts, and conditionally branch (e.g., every 2nd time through, jump to section).

**Implementation Scope:**
- **C++ Engine (PatternChain.h/.cpp)**
  - Struct: `ChainNode` { patternId, repeatCount, nextNode (null for end), condition (none, every_nth_time, random_probability), conditionValue }
  - Class: `PatternChain`
    - `addPatternToChain(patternId, repeatCount)`
    - `setNextPattern(fromId, toId)`
    - `setCondition(chainNodeId, type, value)` — e.g., "every 2nd loop, jump to fill"
    - `getCurrentPattern()`, `getNextPattern()`
    - `advanceChain()` → moves to next node based on condition/repeat count
    - Persistence: serialize chain as JSON

- **Python Backend (app/services/pattern_chain_service.py)**
  - Methods: `async def create_chain()`, `async def add_to_chain(chain_id, pattern_id, repeat_count)`
  - Method: `async def set_chain_condition(chain_node_id, condition_type, value)`
  - Method: `async def start_playback_chain(chain_id)` → returns playback state machine

- **React Frontend (components/PatternChainEditor.tsx, hooks/usePatternChain.ts)**
  - Visual chain diagram: boxes with pattern names, arrows showing flow
  - Drag-drop patterns into chain
  - Each node: repeat count spinner, condition dropdown (None, Every Nth, Random %)
  - Preview: shows pattern sequence on playback
  - Chain presets: save/load entire chains

**Estimated Integration:** 2 new C++ classes, 1 Python service, 1 React component + hook

---

### Feature 9: Real-Time Pattern Recording with Input Quantization
**User Need:** Live input — users want to play drums into the plugin (via MIDI controller or keyboard) and record a pattern with automatic quantization.

**Implementation Scope:**
- **C++ Engine (PatternRecorder.h/.cpp)**
  - Class: `PatternRecorder`
    - `startRecording(durationBars, quantizationSettings)` — arms recorder, preallocates MidiMessageSequence
    - `stopRecording()` → returns finalized MidiMessageSequence
    - Processes incoming MIDI notes, quantizes on-the-fly, writes to buffer
    - `isRecording()`, `getRecordingProgress()` (time elapsed, % complete)
    - Quantizer applies grid/swing during recording (user sees humanized playback in real-time)
    - Loop recording: punch in/out for overdubs
  - Integrate with QuantizationEngine for live quantize
  - Metronome click plays during recording to guide user

- **Python Backend (app/services/pattern_recorder_service.py)**
  - Methods: `async def start_recording(duration_bars, quantization_settings)`
  - Method: `async def stop_recording()` → returns pattern + MIDI data
  - Method: `async def save_recorded_pattern(name, kit_id)`

- **React Frontend (components/RecordingPanel.tsx, hooks/usePatternRecorder.ts)**
  - Record button (large, red, toggle)
  - Duration selector (1, 2, 4, 8 bars)
  - Countdown + recording progress bar
  - Real-time waveform / MIDI note display during recording
  - Punch in/out buttons for loop recording
  - Post-record options: save, discard, re-record
  - Quantization preview (shows quantized vs. played notes)

**Estimated Integration:** 2 new C++ classes, 1 Python service, 1 React component + hook

---

### Feature 10: Performance Mode / Pad Launcher
**User Need:** Live triggering — users want to launch patterns, fills, and one-shot samples from a visual pad grid (inspired by Ableton, Maschine).

**Implementation Scope:**
- **C++ Engine (PadLauncher.h/.cpp)**
  - Struct: `PadConfig` { name, action (launchPattern, launchFill, playOneShot, muteTrack, soloTrack), targetId, color, enabled }
  - Class: `PadLauncher`
    - 16–64 pads (configurable grid: 4x4, 4x8, 8x8)
    - Each pad maps to action + visual state (armed, playing, stopped)
    - Function: `getPadState(padIndex)` → returns color, label, isPlaying
    - MIDI input: route note numbers (C4–C8) to pad indices
    - One-shot sample playback with optional tail (fade-out duration)
    - Pad recording: user can record fill into a pad via MIDI

- **Python Backend (app/services/pad_service.py)**
  - Methods: `async def get_pad_config(padIndex)`, `async def set_pad_config(padIndex, config)`
  - Method: `async def trigger_pad(padIndex)` → executes action
  - Method: `async def get_all_pads()` → returns grid state
  - Persistence: pad layouts saved per kit/preset

- **React Frontend (components/PadLauncher.tsx, hooks/usePadLauncher.ts)**
  - Responsive grid of pads (4x4, 4x8, 8x8)
  - Each pad: text label, color indicator, press animation
  - Pad editor: click pad → modal to assign action (pattern, fill, sample, track control)
  - Visual feedback: pad glows while playing/active
  - Keyboard shortcuts: map computer keyboard (QWERTY + num pad) to pads
  - MIDI learn for hardware pads (assign MIDI note to pad index)
  - Pad layout presets: save/load configurations per song

**Estimated Integration:** 2 new C++ classes, 1 Python service, 1 React component + hook

---

## Summary: Feature Integration Cost

| Feature | C++ Classes | Python Services | React Components | Complexity |
|---------|-------------|-----------------|-----------------|------------|
| Undo/Redo | 3 | 2 methods | Hook + 1 component | Medium |
| Quantization | 2 | 1 service | Hook + 2 components | Medium |
| Fills | 2 | 1 service | 2 components + hook | Medium |
| MIDI Learn | 2 | 1 service | 2 components + hook | High |
| Export Stems | 2 | 1 service | 1 component + hook | Medium |
| Tap Tempo | 2 | 1 service | 1 component + hook | Medium |
| Drum Tuning | 1 | 1 service | 1 component + hook | Low |
| Pattern Chaining | 2 | 1 service | 1 component + hook | High |
| Real-Time Recording | 2 | 1 service | 1 component + hook | High |
| Pad Launcher | 2 | 1 service | 1 component + hook | Medium |
| **TOTALS** | **20 classes** | **10 services** | **15+ components + hooks** | **Moderate–High** |

---

## Revised Development Order (with Features)

1. **Phase 1:** Core JUCE project + sample loading (original step 1–3)
2. **Phase 2:** Undo/Redo (Feature 1) + Quantization (Feature 2) — essential for editing workflow
3. **Phase 3:** Custom DrumVoice + Synthesiser setup (original step 3)
4. **Phase 4:** Tap Tempo (Feature 6) + Host Sync (original step 5)
5. **Phase 5:** Groove loader + basic pattern player (original step 4)
6. **Phase 6:** Real-Time Recording (Feature 9) with quantization + Pad Launcher (Feature 10)
7. **Phase 7:** Song mode / Timeline + Pattern Chaining (Feature 8)
8. **Phase 8:** Fill Patterns (Feature 3)
9. **Phase 9:** Mixer + Per-Drum FX + Drum Tuning (Feature 7, original step 6)
10. **Phase 10:** MIDI Learn (Feature 4) + Macro controls
11. **Phase 11:** Audio Export Stems (Feature 5)
12. **Phase 12:** Piano roll/step editor + UI polish (original steps 8–9)
13. **Phase 13:** Full preset system + save/load (original step 9)

---

## Key Architectural Additions

### New Service Layer Dependencies
- `PatternRecorder` depends on `QuantizationEngine`
- `PadLauncher` depends on `PatternChain` and `FillPatternLibrary`
- `AudioExporter` reads from all `DrumVoice` instances independently

### Database Schema Additions (Python Backend)
- **Do not add a new MIDI mapping table.** Use existing MAP2 MIDI v2 persistence under `/api/v2/midi/*`.
- `PatternChains` table (chain_id, node_order, pattern_id, repeat_count, condition)
- `PadLayouts` table (layout_name, pad_configs_json, kit_id)
- `ExportPresets` table (preset_name, format, sample_rate, bit_depth)

### React Hook Consolidation
- Consider a single `useDrumMachine` hook that aggregates all sub-hooks for easier state management
- Use `jotai` or Redux for global state (currentPattern, currentKit, playbackState, recordingState)

---

## Next Steps

**With these 10 features integrated into your original 12-step framework, you have a complete roadmap for a professional-grade drum machine.** 

- Prioritize Features 1, 2, 6, 9 first (core editing + recording experience)
- Features 3–5, 7–8, 10 expand the platform incrementally
- Feature 4 (MIDI Learn) is complex but unlocks hardware integration

**Recommended:** Integrate features in Phase order, deliver Phases 1–6 for a robust MVP, then iterate on UI polish and advanced features.

---

---

## Improved Design Specifications (10 Design Improvements Applied)

### 1. Dock Panel System (Replaces Tab Navigation)
The UI now uses **resizable docked panels** instead of tab-switching, allowing simultaneous access to mixer, timeline, and other views. Users can customize layout via **Workspace Presets** (Edit Mode, Mix Mode, Performance Mode).

### 2. Vertical Drum List + Inspector (Replaces Horizontal Mixer Grid)
Mixer redesigned as **left sidebar drum list** (organized by category: Kicks, Snares, Toms, Hats, Cymbals, Percussion) with **right-side inspector panel** for detailed control of selected drum. Scales to 30+ drums. Group faders for quick mixing.

### 3. Live Preview & Scrubbing (New)
- **Hover preview:** Move mouse over note in piano roll → plays note in real-time
- **Click-to-preview:** Click any note → plays it once in isolation
- **Scrub bar:** Drag playhead left/right → scrubs audio, shows waveform tail
- **Fill preview:** Hover fills in browser → plays in context of current groove

### 4. Action History Dropdown (Replaces Simple Undo Depth)
Undo/Redo now shows **clickable action history** with descriptions (e.g., "Delete note on Snare (bar 3)"). Users can jump back to any point in history; prevents surprises.

### 5. Pattern Comparison View (New)
Split piano roll vertically to compare two patterns side-by-side. **Diff highlighting** shows which notes differ. **Merge button** lets users copy specific notes between patterns.

### 6. Smart Auto-Layout for Mixer (Improvement)
Drums organized by **collapsible sections** (Kicks, Snares, Toms, Hats, Cymbals, Percussion). Each section has **group fader** for quick control of all drums in group.

### 7. Waveform Editing & Multi-Layer Visualization (New)
- Waveform underlays below each drum row (shows decay/sustain)
- Velocity visualized as **note block height** (taller = louder)
- **Sample envelope display** (ADSR curve tooltip on hover)

### 8. Context-Aware Transport Bar (Replaces old Tempo Control)
**Top sticky bar** with: play/pause/stop buttons, **large BPM display** (click to edit), tap tempo button (glows on beat), sync mode icon, song position, master level, metronome toggle, workspace preset switcher. **Performance monitor** shows real-time CPU/memory/voices/disk space.

### 9. Drag-Drop with Visual Preview (Enhancement)
Drag fills/patterns onto timeline → shows **transparent preview** at drop location, **dashed border** highlighting drop zone, exact bar/beat indicator. Users can press Escape to cancel.

### 10. Real-Time Performance Monitor (New)
**Top-right corner display** showing: CPU usage (color-coded bars), RAM used, active voice count, disk space, buffer status. Includes optimization suggestions (tooltip).

---

## React GUI Card Design & Professional Component Specifications

### Overview: Main Card Architecture

The **DrumMachineCard** is a professional-grade audio plugin interface built as a single, highly-organized React component with tabbed views and collapsible sections. It follows the MAP2 PluginCardShell pattern and integrates all 10 features + core functionality into a cohesive, intuitive UI.

---

## Practice Mode (Guitar Player Focus)

## Backing Tracks For Guitar Mode (NEW)

### Goal

Add a third mode: **Backing Tracks For Guitar**. This mode provides a curated set of 100 built-in guitar backing tracks (varied genres/keys/tempos) and allows users to play their own audio tracks from the system library.

### Features

- **Mode Toggle:** Add `Backing Tracks` as a third option alongside `Practice` and `Advanced`. Persist `ui_mode` as `"backing_tracks"` in state.
- **Built-in Tracks:** Ship 100 copyright-safe tracks in `data/backing_tracks/factory/` with metadata (title, genre, key, tempo, time signature, description). Index at backend startup and expose via `/api/engine/backing_tracks/library?type=factory`.
- **User Library:** Scan a user-configurable folder (e.g., `~/Music/BackingTracks/`) for audio files (WAV, MP3, FLAC, AIFF). Expose via `/api/engine/backing_tracks/library?type=user`.
- **Player UI:** Minimalist player with track browser (search/filter by genre/key/tempo), play/pause/stop, seek bar, waveform, tempo/pitch shift, section markers (if available), loop section, favorites, and setlist.
- **API Endpoints:**
  - `/api/engine/backing_tracks/state` (GET/PATCH): Current mode, track, position, tempo/pitch, etc.
  - `/api/engine/backing_tracks/library` (GET): List all available tracks (factory + user).
  - `/api/engine/backing_tracks/play` (POST): Start playback of a track.
  - `/api/engine/backing_tracks/stop` (POST): Stop playback.
  - `/api/engine/backing_tracks/seek` (POST): Seek to position.
  - `/api/engine/backing_tracks/tempo` (PATCH): Adjust tempo/pitch.

### Implementation Path

1. Curate/produce 100 copyright-safe tracks and store in `data/backing_tracks/factory/`.
2. Add new router: `app/routes/backing_tracks.py` with `/api/engine/backing_tracks/*` endpoints.
3. Implement library indexing (factory + user) and state model for backing track mode.
4. Integrate audio playback (reuse engine or add new player).
5. Add Backing Track Player UI card and integrate with backend.
6. Ensure seamless mode switching and test with both built-in and user tracks.

---

This drum machine will often be used by guitar players who just want a tight, musical beat to practice to. The current dock-panel design is excellent for production and sequencing, but it is too “busy” for quick practice.

### Goal

Provide a **fast, distraction-free Practice interface** that:

- Starts a usable beat in <10 seconds
- Makes tempo, feel, and complexity obvious
- Is readable from several feet away (amp-top / pedalboard context)
- Works well with a footswitch/MIDI controller

The existing UI becomes **Advanced Mode** (unchanged).

### New Feature: Mode Toggle (Practice ⇄ Advanced)

Add a single feature that changes the interface between:

- **Practice Mode** (simple)
- **Advanced Mode** (the current dock-panel interface)

#### UX placement

- Add a `Mode` switch in the **sticky transport bar**:
  - Toggle labels: `Practice` and `Advanced`
  - Must be one click/tap, no modal

#### Persistence

- Persist `ui_mode` in the drum machine state so it survives reloads.
  - Option A: store inside the drum machine plugin state/preset (recommended)
  - Option B: store in localStorage keyed by chain + plugin URI (acceptable)

#### MIDI control (optional but recommended)

- Support a MIDI v2 command trigger: `drums_toggle_ui_mode` (action type)
  - This allows a footswitch to open Advanced only when needed.

---

## Practice Mode UI Specification (Simple, Beat-First)

---

## Global Transport Controls (Palette)

### Goal

Add persistent Play, Stop, and Tap Tempo controls to the “palette” displayed on the platform’s main grid/webpage. These controls must affect global plugin playback in all modes (Practice, Advanced, Backing Tracks).

### Features

- **Palette UI:** Always-visible or easily accessible toolbar/panel with three large, accessible buttons:
  - **Play:** Starts playback (toggles to Pause if already playing)
  - **Stop:** Stops playback and resets position
  - **Tap Tempo:** Sets global tempo by tapping (averages interval between taps)
- **Integration:**
  - Buttons call backend endpoints:
    - `POST /api/engine/drums/play`
    - `POST /api/engine/drums/stop`
    - `POST /api/engine/drums/tap_tempo` (or PATCH `/api/engine/drums/state` with new tempo)
  - Controls affect all plugin modes and update global state/UI.
  - Tap Tempo updates tempo in all modes and reflects in UI.
- **UX:**
  - Palette is always visible or easily accessible from any mode.
  - Visual feedback: Play glows when active, Tap flashes on tap.
  - Keyboard shortcuts: Space (Play/Pause), S (Stop), T (Tap Tempo).

---

Practice Mode is a **single screen** with only the controls that matter for practicing guitar.

### Practice Mode Layout

Inside the existing `PluginCardShell`, render a simplified body when `ui_mode=practice`:

1) **Top: Transport + Tempo (Large, always visible)**
   - Big `Play/Pause` button
   - `Stop` button
   - Large BPM display (click to type)
   - `Tap` tempo button
   - `Count-in` toggle: `0 / 1 / 2 bars`

2) **Middle: Groove Picker (Style → Pattern)**
   - A short, curated list optimized for practice:
     - `Rock (straight 8ths)`
     - `Rock (straight 16ths)`
     - `Blues shuffle`
     - `Funk (16ths)`
     - `Metal (double-kick)`
     - `Pop`
     - `Jazz swing`
     - `Reggae`
   - One “pattern” per style by default (no browser complexity)
   - A simple `Variation` control:
     - `Simpler` ←→ `Busier` (internally maps to pattern index or density)

3) **Feel Controls (Keep it musical)**
   - `Swing` slider (0–100%)
   - `Humanize` slider (0–100%)
   - `Fill` button (momentary)
   - Optional `Auto-fill` toggle with `every 4/8/16 bars`

4) **Bottom: Mini Mixer (Practice-relevant only)**
   - 3 faders with mute buttons:
     - `Kick`
     - `Snare`
     - `Hat/Cymbals`
   - Master level is still available in the transport bar

### Practice Mode Behaviors (Important)

- **Instant-start defaults**:
  - On first open, load `Rock (straight 8ths)` at 120 BPM
  - The first press of Play must produce a beat immediately

- **Tempo changes must be click-free**:
  - If re-rendering a new pattern, quantize changes to bar boundary by default
  - Provide a small toggle `Quantize changes: Bar / Immediate` (default `Bar`)

- **Guitar-friendly dynamics**:
  - Practice Mode should bias toward consistent levels (avoid overly dynamic ghost notes unless chosen)

### Practice Mode Data Model (minimal additions)

Add these fields to `/api/engine/drums/state` (or equivalent engine state):

- `ui_mode`: `"practice" | "advanced"`
- `practice_style_id`: string (e.g. `"rock_8"`)
- `practice_variation`: 0.0–1.0 (maps to pattern complexity)
- `practice_change_quantization`: `"bar" | "immediate"`
- `practice_count_in_bars`: 0|1|2
- `practice_auto_fill`: `{ "enabled": bool, "interval_bars": 4|8|16 }`

---

## Practice Style Pack Contract (Curated Defaults)

This is the missing piece that makes Practice Mode “instant”: a fixed set of curated styles that always resolve to known kits + patterns + sensible tempo ranges.

### 1) Practice Style Model

Expose a read-only list so the UI can render a compact picker.

- `GET /api/engine/drums/practice/styles`

Response:

```json
{
  "styles": [
    {
      "style_id": "rock_8",
      "name": "Rock (straight 8ths)",
      "default_bpm": 120,
      "bpm_range": [80, 180],
      "time_signature": "4/4",
      "feel": "straight",
      "kit_id": "kit:factory:modern_tight",
      "pattern_map": {
        "simpler": { "pattern_index": 0 },
        "default": { "pattern_index": 1 },
        "busier": { "pattern_index": 2 }
      },
      "mixer_preset": "practice_balanced"
    }
  ],
  "count": 1
}
```

### 2) Required built-in styles (v1)

These are optimized for guitar practice (common genres + tight backbeat). Keep the list short.

- `rock_8` — Rock straight 8ths
- `rock_16` — Rock straight 16ths
- `shuffle_blues` — Blues shuffle
- `funk_16` — Funk 16ths
- `metal_doublekick` — Metal double-kick
- `pop_4onfloor` — Pop / four-on-the-floor
- `jazz_swing` — Jazz swing
- `reggae_1drop` — Reggae one-drop

### 3) Variation mapping rule (Practice slider → pattern selection)

Practice Mode uses a single slider `practice_variation` (0..1). It must map deterministically.

**Rule:** map to one of three variants:

- `0.0–0.33` → `simpler`
- `0.34–0.66` → `default`
- `0.67–1.0` → `busier`

The variants must be implemented as distinct patterns (indices) rather than procedural randomization, so the groove remains consistent during practice.

### 4) Setting a style (single call)

- `PATCH /api/engine/drums/state`

Request example:

```json
{
  "ui_mode": "practice",
  "practice_style_id": "shuffle_blues",
  "tempo_bpm": 110,
  "practice_variation": 0.4
}
```

Engine behavior:

- Load the style’s `kit_id` (if not already loaded)
- Select the mapped pattern variant
- Apply the style’s `mixer_preset` (practice-friendly balancing)

### Factory content: Classic Rock Guitar Practice (1965–1990)

Add a factory pack file at:

- `data/drums/factory_packs/classic_rock_guitar_practice_1965_1990.json`

This pack contains **100 sectioned arrangements** (Intro/Verse/Chorus/Bridge/Solo/Outro) tagged for guitar practice and spanning common classic-rock feels.

**Important:** do not ship “song-exact” transcriptions. Instead, keep entries **style-based** (e.g., straight 8ths, shuffle, funk 16ths, one-drop, double-kick) with section layouts. This keeps the pack legally clean while still being musically useful for practice.

### Indexing requirement (so it’s accessible in all interfaces)

On backend startup, index any JSON packs found under:

- `data/drums/factory_packs/*.json`

Then expose them through the same library endpoints used by **both** Practice Mode and Advanced Mode:

- `GET /api/engine/drums/library/grooves?type=pattern&pack_id=classic_rock_guitar_practice_1965_1990`
- `GET /api/engine/drums/library/grooves?type=pattern&tag=guitar&era=1965-1990`

Practice Mode should use these entries to populate a “Songbook” or “Arrangements” list (name + bpm range + feel + sections). Advanced Mode should show the same entries in the Browser under a “Factory Packs → Classic Rock Guitar Practice (1965–1990)” group.

---

## Rolling Stone Source (User Import)

You requested Rolling Stone as the source for a “Top 100 rock songs (1965–1990)” practice songbook.

**Implementation requirement:** MAP2 must support Rolling Stone as a source via **user import**, but must **not** ship Rolling Stone’s ranked list content in the repository.

Reasons:

- Rolling Stone list pages are frequently paywalled/blocked for automated fetch.
- The ranked selection/order may be protected as a compilation.

### Import workflow (supported + repeatable)

1) User exports a Rolling Stone list to CSV manually.
2) User fills/normalizes the CSV using the template:
   - `data/drums/templates/rollingstone_songbook_template.csv`
3) User runs:

- `python3 scripts/import_rollingstone_songbook.py --input <path/to/rollingstone.csv>`

Output:

- `data/drums/generated/rollingstone_songbook.json` (gitignored)

### Indexing + UI visibility (Practice + Advanced)

The backend must index both:

- Factory packs: `data/drums/factory_packs/*.json`
- Generated packs: `data/drums/generated/*.json`

Expose generated songbooks as a first-class pack in both interfaces:

- Practice Mode: show as “Songbook → Rolling Stone Guitar Practice (1965–1990)”
- Advanced Mode: Browser shows the same under “User Songbooks”

### Songbook content rules (keep it useful + clean)

- The generated songbook entries must be **style-based practice mappings**:
  - Each song entry selects a MAP2 `style_id` (e.g. `rock_8`, `shuffle_blues`)
  - Section layouts are provided (Verse/Chorus/Bridge/Solo)
  - No attempt is made to store song-exact drum transcriptions

### How Practice Mode maps to the Advanced engine

Practice Mode is not a second drum engine. It is a **view + preset selector** over the same underlying patterns/kits.

- Selecting a style loads a known kit + known pattern set
- Variation adjusts a small, bounded set of parameters:
  - pattern density (swap pattern variants)
  - hat openness / velocity range
  - ghost note probability (very low by default)
- Mini mixer controls map to per-drum `level`/`mute` parameters for the drums tagged as kick/snare/hats

---

## Practice Mode: 5 Recommended Enhancements (Practice-First)

These are strongly recommended additions for a “practice drum machine” experience. Each is scoped to fit Practice Mode (no full DAW features).

### 1) Tempo Trainer (Ramp / Step-Up)

**Why:** Guitar practice commonly uses gradual tempo increases.

**UI:** add a compact `Trainer` row below BPM:

- Start BPM, Target BPM
- Duration (minutes) OR Step-up every N loops
- Toggle `Trainer On`

**State fields:**

- `practice_tempo_trainer`: `{ "enabled": bool, "mode": "ramp"|"step", "start_bpm": number, "target_bpm": number, "duration_sec"?: number, "step_bpm"?: number, "step_interval_bars"?: 4|8|16 }`

**Behavior:** tempo changes occur at bar boundaries unless `practice_change_quantization=immediate`.

### 2) Loop Length + Section Repeat

**Why:** Practicing riffs needs predictable repeats (e.g., 4-bar loop) without touching the timeline.

**UI:** add a `Loop` control:

- Loop bars: `2 / 4 / 8 / 16`
- Toggle `Loop On`

**State fields:**

- `practice_loop`: `{ "enabled": bool, "bars": 2|4|8|16 }`

**Behavior:** loops the current pattern segment; fill launches respect loop boundary.

### 3) Subdivision + Accents (Make Time Feel Obvious)

**Why:** Guitar players often need clearer subdivision (8ths/16ths) or a stronger 2&4.

**UI:** add two toggles + one selector:

- `Subdivision`: `8ths / 16ths`
- `Accents`: `None / 2&4 / 1 only`
- `Click`: `Off / Light / Loud`

**State fields:**

- `practice_subdivision`: `{ "division": "8"|"16", "accents": "none"|"2and4"|"1", "click": "off"|"light"|"loud" }`

**Behavior:** does not change the musical groove; it changes hat/click emphasis for clarity.

### 4) Practice Mix Presets (Ear-Fatigue Control)

**Why:** Cymbals can be harsh over long practice sessions; players often want “less cymbals, more backbeat”.

**UI:** single dropdown:

- `Mix`: `Balanced / Less Cymbals / Clicky / Big Room`

**State fields:**

- `practice_mix_preset`: `"practice_balanced"|"practice_less_cymbals"|"practice_clicky"|"practice_big_room"`

**Behavior:** maps to a small set of drum levels + tone adjustments (mainly hats/cymbals) without requiring the full mixer.

### 5) Favorites / Setlist (One-Tap Groove Switching)

**Why:** Practicing often means switching between a few go-to grooves quickly (verse/chorus feels) without browsing.

**UI:** `★` icon to favorite a style; show up to 6 favorites as buttons.

**State fields:**

- `practice_favorites`: `string[]` of `style_id` (max 6)

**Behavior:** pressing a favorite switches style at bar boundary by default.

---

**Key Design Principles:**
- **Dark theme by default** (with light mode toggle) — pro audio standard
- **Modular tabbed interface** — users switch contexts (Mixer, Timeline, Performance, Browser, Settings)
- **Real-time visual feedback** — waveforms, grid overlays, pad states, VU meters
- **Keyboard-first interaction** — all major functions accessible via shortcuts
- **Responsive layout** — adapts to 1024px (minimal) up to 4K displays
- **Accessibility** — ARIA labels, tab order, high-contrast indicators

---

### Main Layout Structure (IMPROVED: Dock Panel System)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DrumMachineCard (PluginCardShell wrapper)                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  [Sticky Transport Bar]                                             [Perf Monitor]   │
│  ├─ Play/Pause/Stop buttons                                        CPU / Memory     │
│  ├─ Large BPM display (click to edit) | Tap Tempo (glows on beat) Voice Count      │
│  ├─ 📊 4/4 Time Sig | 📍 Bar 5.2.3                                Disk Space      │
│  ├─ Sync mode (Internal/Host icon) | 🔊 Master -3.5 dB            Buffer Status   │
│  └─ Metronome toggle | Workspace Presets dropdown                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  [RESIZABLE DOCK PANEL LAYOUT]                                                      │
│  ┌────────────┬──────────────────────────────────┬──────────────┐                  │
│  │   LEFT     │       CENTER (Primary)           │    RIGHT     │                  │
│  │  PANEL     │       Editor Area                │   PANEL      │                  │
│  │ (resizable)│     (resizable)                  │ (resizable)  │                  │
│  ├────────────┼──────────────────────────────────┼──────────────┤                  │
│  │            │                                  │              │                  │
│  │ Kit/Drum   │  WORKSPACE MODE:                 │  Mixer       │                  │
│  │ Selector   │  • Edit Mode: Timeline/PianoRoll │  Inspector   │                  │
│  │  (List)    │  • Mix Mode: Mixer Full Width    │  (Inspector) │                  │
│  │            │  • Performance Mode: Pads + Rec  │              │                  │
│  │ • Kick     │                                  │ Master Bus   │                  │
│  │ • Snare    │  Timeline w/ Live Preview:       │ (pinned)     │                  │
│  │ • Hats     │  ├─ Piano Roll + Waveforms      │              │                  │
│  │ • Toms     │  ├─ Quantization Toolbar         │              │                  │
│  │ • Cymbals  │  ├─ Pattern Chain Visualizer     │              │                  │
│  │ • Perc     │  └─ Drag-Drop Fill Preview       │              │                  │
│  │            │                                  │              │                  │
│  │ [Collapse] │                                  │ [Collapse]   │                  │
│  └────────────┴──────────────────────────────────┴──────────────┘                  │
│                                                                                      │
│  [BOTTOM COLLAPSIBLE PANEL] (Browser / Inspector / Actions)                        │
│  ├─ Kit/Preset Browser | Action History (Undo/Redo) | Export | Settings            │
│  └─ Can be hidden or pinned; resizable height                                      │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Key Improvements (Advanced Mode):**
- **No context-switching tabs** — all views accessible via drag/collapse
- **Workspace presets** — "Edit Mode", "Mix Mode", "Performance Mode" auto-arrange panels
- **Live preview** throughout (piano roll scrubbing, fill hover preview)
- **Sticky transport bar** — play/pause, BPM, position always visible
- **Real-time performance monitor** — top-right corner shows CPU/memory/voices
- **Resizable panels** — users configure layout per workflow
- **Bottom dock** — hides kit browser, undo history, export without cluttering main view

**Mode Switch:**

- Practice Mode renders a simple, beat-first layout.
- Advanced Mode renders the dock-panel layout (the design currently specified in this document).

---

### Tab 1: MIXER VIEW (Improved: Vertical List + Inspector)

**Primary UI:** Left sidebar drum list (organized by category), right-side inspector panel for selected drum, master bus always visible.

#### Architecture:

The mixer is now **two-panel** instead of grid-based, scalable to 30+ drums.

#### Components Used:

1. **DrumListSidebar.tsx** — Left panel (vertical list, 80–120px wide)
   - **Categorized sections** (collapsible groups):
     - **Kicks** (with master group fader)
       - Kick 1, Kick 2, Kick Deep (draggable to reorder)
     - **Snares** (top/bottom separated)
       - Snare Top, Snare Bottom, Snare (tight)
     - **Toms** (grouped)
       - Tom Hi, Tom Mid, Tom Low
     - **Hi-Hats** (closed/open linked)
       - Hat Closed, Hat Pedal, Hat Open
     - **Cymbals** (separated)
       - Crash 1, Crash 2, Ride, Swell
     - **Percussion** (misc.)
       - Cowbell, Clap, Sidestick, etc.
   - Each drum shows:
     - Color-coded icon (red=kick, white=snare, cyan=hat, yellow=tom, gold=cymbal)
     - Drum name (truncated if long)
     - **Mute/Solo buttons** (compact, left-click select drum, right-click toggle solo/mute)
     - Track number badge (1–30)
   - **Group faders** (collapsed, hover to expand):
     - "Kick Group" fader → quick mute/volume all kicks
     - "Tom Group" fader → quick mute/volume all toms
     - "Cymbal Group" fader → quick mute/volume all cymbals
   - **Drag to reorder** drums within groups
   - **Right-click context menu** → Add drum, delete, clone, properties
   - Click any drum → **select and populate inspector panel** on right

2. **MixerInspector.tsx** — Right panel (resizable, shows selected drum in detail)
   - **Drum header** (icon, name, track number, dropdown to switch drums via arrow keys or list)
   - **Large VU Meter** (stereo L/R, shows peak + RMS, peak hold with 3-second decay)
   - **Master Faders** (side-by-side):
     - **Volume fader** (0–100%, numerical display, dB readout)
     - **Pan slider** (left ↔ right, -100 to +100, center at 0)
   - **Tuning Section** (collapsible):
     - **Pitch slider** (semitones: -24 to +24, or fine cents)
     - **Decay multiplier** (0–200%, stretches/compresses sample decay)
     - **Brightness slider** (0–100, EQ bias toward highs)
     - **Punch slider** (0–100, adds transient compression)
     - **Saturation slider** (0–100, soft-clip warmth)
     - **Resonance slider** (0–100, accentuates key frequency)
     - **Preset quick buttons** (Tighter, Warmer, Punchier, Duller, Reset)

   - **EQ Section** (mini 3-band visualizer):
     - **EQ Graph** — small curve display (drag points to adjust)
     - **Low/Mid/High sliders** (±12 dB each)
     - **Frequency labels** (80Hz, 400Hz, 3kHz standard, customizable)
     - **Q/Bandwidth slider** (per band, 0.5–3)

   - **Dynamics Section** (collapsible):
     - **Compressor toggle** (enable/disable)
       - Ratio (2:1 to ∞, buttons for common: 4:1, 8:1, limiting)
       - Threshold (-40 to 0 dB)
       - Attack (0–100ms)
       - Release (50–500ms)
       - Makeup gain (auto-toggle)
     - **Gate toggle** (optional, for noise reduction)
       - Threshold (-40 to 0 dB)
       - Attack (0–50ms)

   - **Effects/Sends Section** (collapsible):
     - **4 send faders** (to: ambience, reverb, delay, custom)
     - Send level + pan per send
     - Pre/Post fader selector per send
     - Quick preset buttons (Tight, Bright, Roomy, Washy)

   - **Master Group Assignment** (dropdown)
     - Assign to: None, Kick Group, Tom Group, Cymbal Group, Custom Group
     - Shows group fader linked

3. **MasterBusStrip.tsx** — Pinned at bottom-right, always visible
   - **Large VU meter** (L/R channels, +6 dB headroom display)
   - **Master volume fader** (0–100%, large, -100 to +6 dB scale)
   - **Master output level** (numerical dB display, clip indicator light)
   - **Compressor section** (glue compressor):
     - Toggle on/off
     - Ratio, threshold, makeup gain
     - Visual gain reduction meter (shows how much compression applied)
   - **Limiter toggle** (catch peaks above -0.3 dB)
   - **Saturation/Tape character slider** (0–100, adds warmth/harmonics)
   - **Dither toggle** (for 16-bit export)

**Keyboard Shortcuts (Mixer):**
- `Arrow Up/Down` — select prev/next drum
- `Space` — toggle solo on selected drum
- `M` — mute selected drum
- `Ctrl+G` — assign to group
- `Ctrl+A` → `1–9` — quick access to common group faders (Kick Group, Tom Group, etc.)
- `Mouse wheel` (on drum list) — scroll drums, (on fader) — adjust value

**Visual Indicators:**
- Selected drum: **bright highlight** (cyan border) in drum list
- Solo/Mute state: **LED-style indicator** (green solo, red mute)
- Overload warning: **bright red peak indicator** on VU meter
- Group faders: **visual link indicator** (chain icon) connecting grouped drums
- Compressor active: **meter shows gain reduction** (visual bar)
- Tuning effect preview: **small waveform preview** showing pitch/saturation effect on hover

**Benefit:** Scales to 30+ drums; professional DAW layout (Pro Tools/Logic standard); fast navigation via keyboard; group faders for quick mixing

---

### Tab 2: TIMELINE VIEW (Improved: Live Preview, Waveforms, Pattern Comparison)

**Primary UI:** Piano roll with waveform visualization, pattern comparison side-by-side, quantization toolbar, fill browser, pattern chain visualizer.

#### Components Used:

1. **PianoRoll.tsx** — Main editing surface (ENHANCED)
   - **Grid canvas** (WebGL or SVG, scales to 32nd notes)
   - **Drum rows** (horizontal lanes, one per drum, **with waveform underlays**)
   - **Waveform visualization** (subtle, semi-transparent, below each drum row):
     - Shows expected decay/sustain envelope of sample
     - Helps user see overlapping note conflicts visually
     - Opacity: 30%, color: dim green (non-editing) → bright on hover
   - **Velocity visualization**:
     - Note block height represents velocity (louder notes = taller blocks)
     - Color intensity increases with velocity (visual at-a-glance dynamics)
   - **Time ruler** (top, shows bars/beats/grid divisions)
   - **Note blocks** (draggable rectangles, enhanced):
     - Block height = velocity (0 dB at bottom, full velocity at top)
     - On hover: show note number + velocity + position as tooltip
     - **Live preview on hover/click** (plays note at current position with actual sample)
   - **Sample envelope display** (on hover over note, small ADSR curve appears):
     - Shows attack/decay/sustain/release visually
     - Helps user understand decay expectations
   - **Snap-to-grid overlay** (subtle vertical lines, color changes with swing)
   - **Playhead** (vertical animated line, glows on beat)
   - **Selection box** (click-drag to select multiple notes)
   - **Scrubbing support** (drag playhead left/right → scrubs audio, shows tail under notes)
   - **Context menu** (right-click) — cut, copy, paste, delete, quantize, humanize, transpose

2. **PatternComparisonView.tsx** (NEW - splits piano roll vertically)
   - **Comparison toggle button** (or drag divider to open)
   - **Left panel:** Current pattern
   - **Right panel:** Comparison pattern (dropdown to select which to compare)
   - **Both play in sync** when playback active
   - **Diff highlighting:**
     - Red = only in left pattern
     - Green = only in right pattern
     - Yellow = both but different (velocity/timing/drum)
   - **Merge button:** Copy specific notes from right to left (drag-drop selection)
   - Benefits: Fast arrangement; visual pattern variations comparison

3. **QuantizationToolbar.tsx** (above piano roll, ENHANCED)
   - **Grid Division Buttons** (1/4, 1/8, 1/16, 1/32, triplet, swing triplet)
   - **Swing Slider** (0–100%, live preview on grid lines)
   - **Humanize Slider** (0–100%, live preview shows "ghost notes" at original positions)
   - **Snap Toggle** (checkbox, "Snap to Grid", visual feedback when enabled)
   - **Quantize Button** (applies quantization to selected notes, shows before/after)
   - **Visual feedback:**
     - Selected grid division: bright highlight
     - Swing amount: grid lines visibly skew
     - Humanize amount: ghost notes appear at original positions (subtle, 50% opacity)
     - Live preview: plays selected notes with quantization applied

4. **PatternChainViewer.tsx** (below piano roll, collapsible, ENHANCED)
   - **Visual chain diagram** — horizontal flow: `[Pattern A] → [Fill] → [Pattern B]`
   - **Node boxes**:
     - Pattern/fill name
     - Duration in bars
     - Repeat count badge (e.g., "×2")
     - Condition label (e.g., "Every 2nd", "Random 50%")
     - Click to select, drag to reorder
   - **Color coding:**
     - Pattern boxes: blue
     - Fill boxes: orange
     - Conditional branches: dotted arrows
   - **Quick add buttons** (+ Insert Pattern, + Insert Fill, + Insert Condition)
   - **Play chain button** (starts playback from chain start, highlights current node)
   - **Condition editor** (click condition node → modal to set repeat logic)

5. **FillBrowser.tsx** (side panel, collapsible, ENHANCED with drag-drop preview)
   - **Category filter buttons** (Cymbal Crash, Tom Fill, Hat Variation, Double Time, Half-Time, Custom)
   - **Duration filter** (1–4 bar selector)
   - **Tempo range slider** (filters by BPM compatibility)
   - **Fill list** — scrollable, shows:
     - Thumbnail waveform (visual representation of fill)
     - Fill name + duration
     - User rating stars
     - **Play button** (preview fill in isolation)
   - **Drag-to-insert** improvements:
     - Drag fill → shows **transparent preview** of fill at drop location on timeline
     - Drop zone highlighted with **dashed border**
     - Shows exact bar/beat where drop will occur
     - User can press Escape to cancel drag
   - **Hover preview** (optional) — plays fill in context (ghosted, 50% volume)
   - **Quick fill buttons** (row at bottom: "Add Crash", "Add Tom Fill", "Add Hat", "Double Time")

6. **PatternEditor.tsx** (top of timeline, info panel)
   - **Pattern name** input (editable, slug-ified for save)
   - **Pattern length** selector (1, 2, 4, 8, 16, 32 bars)
   - **Pattern tempo** (inherit from master or override)
   - **Complexity indicator** (visual: 1–5 stars based on note density)
   - **Key/Scale selector** (optional, for transposition hints)
   - **Export pattern button** (bounces to MIDI file)
   - **Duplicate pattern button** (creates variant)
   - **Clear pattern button** (with confirmation)
   - **Copy/Paste buttons** (copy pattern or paste from clipboard)

**Keyboard Shortcuts (Timeline):**
- `Space` — play/pause playback
- `Ctrl+Z` / `Cmd+Z` — undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` — redo
- `Delete` — delete selected notes
- `Ctrl+A` — select all notes in view
- `Ctrl+C` — copy selection
- `Ctrl+V` — paste at cursor
- `Ctrl+Q` — quantize selection
- `Arrow keys` — move selection left/right/up/down
- `Ctrl+D` — duplicate selected notes
- `Scroll wheel` — zoom horizontally (time)
- `Shift+Scroll` — zoom vertically (drums)
- `H` — toggle hover preview (hear notes on hover)
- `Shift+C` — toggle pattern comparison view
- `Right-click` → context menu (quantize, humanize, transpose, etc.)

**Visual Indicators:**
- Grid lines with swing skew (dynamic based on swing slider)
- Playhead position (bright cyan line, glows)
- Quantized note positions with humanize (ghost notes 50% opacity)
- Fill insertion points (highlighted bar areas, dashed border on drag)
- Undo depth indicator (small text in toolbar: "Undo: 5/100")
- Velocity-based note height (visual dynamics)
- Waveform underlays (subtle green, shows decay/sustain)
- Sample envelope preview (ADSR curve tooltip)
- Diff highlighting in comparison view (red/green/yellow)

---

### Tab 3: PERFORMANCE MODE (Pad Launcher + Recording + Action History - IMPROVED)

**Primary UI:** Pad launcher grid + recording interface + pattern chain playback + action history dropdown.

#### Components Used:

1. **ActionHistoryPanel.tsx** (TOP-LEFT, NEW - Undo/Redo Action History)
   - **"History" button** (or dropdown) → shows last 20 actions
   - **Clickable action list**, color-coded by type:
     - Blue: Note edits (Delete note, Move note, Change velocity)
     - Green: Kit/Preset loads (Load kit, Load preset)
     - Orange: Recording actions (Record pattern, Record into pad)
     - Purple: Pattern/Fill operations (Insert fill, Create chain)
     - Red: Destructive actions (Clear pattern, Reset)
   - **Visual timeline** (dots showing action sequence, user can click any dot to jump)
   - **Redo equivalent** (forward jump through actions)
   - **Action descriptions:**
     - "Delete note on Snare (bar 3.2.1)"
     - "Change kick pitch from 60Hz to 55Hz"
     - "Load kit: Vintage 70s Rock"
     - "Record pattern (4 bars, quantized, 120 BPM)"
     - "Insert cymbal crash fill (bar 8)"
   - **Benefit:** Users see exactly what they're undoing; prevents surprises; improves confidence

2. **PadLauncher.tsx** — Responsive pad grid
   - **Grid layout** (4×4, 4×8, or 8×8, toggle via buttons)
   - **Pad buttons** — each:
     - Larger touch target (minimum 48×48 px)
     - Colored background (user-configurable per pad)
     - Icon + label (pattern name, fill name, or sample name)
     - Active state: bright glow + animation
     - Hover state: brightens slightly
     - Long-press: opens pad editor modal
   - **Grid presets** dropdown (switch between saved pad layouts)
   - **Edit mode toggle** (switches to pad configuration interface)

3. **PadEditorModal.tsx** (modal on long-press or double-click)
   - **Pad index display** (e.g., "Pad 5")
   - **Action type dropdown** (Pattern Launch, Fill Launch, Sample Trigger, Mute Track, Solo Track, Custom)
   - **Target selector** (pattern/fill/sample name dropdown)
   - **Color picker** (visual palette)
   - **MIDI note learn button** (for hardware pad mapping)
   - **Keyboard shortcut input** (shows current key mapping)
   - **Choke group selector** (optional, for pad interactions)

4. **RecordingPanel.tsx** (prominent section, collapsible, ENHANCED)
   - **Record mode indicator** (shows if in record mode)
   - **Record button** (large, red when armed, with confirmation on click)
   - **Duration selector** (1, 2, 4, 8 bars)
   - **Countdown display** (pre-count bars: 0–4)
   - **Recording progress bar** (animates during record, shows time elapsed + remaining)
   - **Real-time MIDI visualization** (scrolling piano roll showing notes being recorded)
     - Shows drums across horizontal axis, time scrolling from right to left
     - Color-codes by drum (same colors as mixer list)
     - Shows velocity as block height
   - **Quantization settings** (grid, swing, humanize — same as timeline)
     - **Live quantization preview** (shows how notes will quantize in real-time)
     - Ghost notes visible at quantized positions if humanize is on
   - **Stop/Save buttons** (appear after recording)
   - **Punch in/out buttons** (for loop recording/overdubs)
   - **Metronome preview** (shows click pattern, clickable to preview before recording)
   - **Post-record options:** save to pattern, save to pad, discard, re-record

5. **PatternChainPlayback.tsx** (upper area, ENHANCED)
   - **Current pattern display** (large, centered, shows name + progress bar)
   - **Next pattern indicator** (shows upcoming pattern or fill in smaller text)
   - **Chain progress** (visual timeline of chain, current node highlighted in cyan)
   - **Skip ahead button** (jump to next pattern in chain)
   - **Loop current button** (keeps looping current pattern, toggles on/off)
   - **Chain status text** ("Playing Chain: Verse → Chorus × 2 → Fill → Verse")
   - **Recent action display** (shows last action taken, e.g., "✓ Recorded: Pattern A (4 bars)", temporary text)

6. **DrumPadVisualizer.tsx** (optional, bottom)
   - **Visual drum kit view** — small graphic of drum kit (kick, snare, hats, toms, cymbals)
   - **Animated strikes** (brief flash when drum is triggered, velocity-based brightness)
   - **Velocity visualization** (circle size/brightness indicates velocity)
   - **Real-time display** of which drum is playing

**Keyboard Shortcuts (Performance):**
- `Space` — play/pause playback
- `R` — toggle recording
- `1–9`, `0` — trigger pads 1–10
- `Shift+1–9` — trigger pads 11–20 (if grid is larger)
- `Ctrl+Z` / `Cmd+Z` — undo (opens action history)
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` — redo
- `Ctrl+R` — redo last recording
- `Ctrl+U` — undo last recording
- `N` — skip to next pattern in chain
- `L` — loop current pattern
- `H` — toggle action history panel

**Visual Indicators:**
- Pad animation on trigger (press + release glow animation, color feedback)
- Recording active indicator (red pulsing border around record button)
- Metronome click visualization (bouncing indicator in rhythm)
- Pattern transition animation (fade or slide between patterns)
- Action history highlights recent actions (yellow/green flash when action completes)
- Quantization preview (ghost notes visible during recording)
- Voice indicator (shows how many voices active during recording)

---

### Tab 4: BROWSER (Kit/Preset/Sample Browser - IMPROVED with Drag-Drop Feedback)

**Primary UI:** Kit/preset library, fill selector, sample loader, save/load functionality.

#### Components Used:

1. **KitBrowser.tsx** — Left panel
   - **Category tabs** (8 base kits: Modern Tight Studio, Vintage 70s, Jazz, Roomy, Hybrid, 909, MPC, Lo-Fi)
   - **Kit list** — scrollable, each kit shows:
     - Thumbnail waveform preview (kick + snare summary)
     - Kit name
     - Drum count badge (e.g., "12 drums")
     - User rating stars
     - Play button (preview kit at current tempo)
   - **Custom kits section** (user-loaded kits)
   - **Drag-to-mixer** support (drag kit onto timeline to load)
   - **Load button** (loads selected kit)
   - **Delete button** (removes custom kit, with confirmation)

2. **PresetBrowser.tsx** — Center panel
   - **Factory presets** (Era/Style quick presets: "Modern Rock", "Vintage Jazz", "Clean 909", etc.)
   - **User presets** (saved snapshots of kit + groove + mixer state)
   - **Search bar** (filter by name, tags)
   - **Tag chips** (filter by: "rock", "jazz", "electronic", "lo-fi", "polished", etc.)
   - **Preset list** — each shows:
     - Preset name
     - Kit name + tempo
     - Author (Factory or username)
     - Date created/modified
     - Play button (previews)
   - **Drag-to-timeline** support (drag preset → loads all state)
   - **Save new preset button** (modal to name + tag)
   - **Overwrite current button** (quick save)
   - **Load button** (loads selected preset)

3. **FillBrowser.tsx** (mini version, right side, ENHANCED with visual preview drag-drop)
   - **Quick fill buttons** (Cymbal Crash, Tom Fill, Hat Variation, Double Time, Half-Time)
   - **Custom fills list** (user-recorded fills)
   - **Drag-to-timeline** with visual feedback:
     - Drag fill → shows **transparent preview** of fill at drop location
     - Drop zone highlighted with **dashed border**
     - Shows exact **bar/beat** where drop will occur
     - User can press Escape to cancel drag
   - **Full browser link** (jumps to timeline/fill panel)

4. **SampleLoader.tsx** (expandable panel, ENHANCED with drag-drop visual feedback)
   - **Drag-drop zone** (upload WAV, SFZ, Decent Sampler .ds files)
     - Zone highlights on drag-over (cyan dashed border, larger)
     - Shows "Drop samples here" text on drag-over
     - Accepts multiple files at once
   - **File browser button** (open file dialog)
   - **Sample list** — shows loaded samples:
     - Filename
     - Duration
     - Sample rate
     - Waveform thumbnail (small, visual preview)
     - Delete button
   - **Assign to drum dropdown** (map sample to kit drum piece)
   - **Velocity layers viewer** (if SFZ — shows layer count, RR count)
   - **Drag sample to mixer** (assign sample to drum by dragging sample → drum in mixer)

**MAP2-specific import rules (must be implemented):**

- All files dropped into SampleLoader must upload through:
  - `POST /api/upload/validate` (show friendly error if type is ambiguous)
  - `POST /api/upload/` or `POST /api/upload/batch`
- Extend the unified upload service to support drum assets:
  - `asset_type=drum_sample` for single audio samples
  - `asset_type=drum_kit_pack` for ZIP packs (kit manifest + samples)
  - `asset_type=drum_groove_pack` for fills/grooves
- After upload, SampleLoader must call `/api/engine/drums/library/*` endpoints to refresh the indexed library (kits/samples/grooves) rather than reading local filesystem paths directly.

5. **ExportDialog.tsx** (modal, triggered from settings or here, IMPROVED)
   - **Export options:**
     - Stems (checkboxes for each drum + master + buses)
     - Format dropdown (WAV, FLAC)
     - Sample rate selector (44.1k, 48k, 96k)
     - Bit depth selector (16, 24, 32-bit)
   - **Filename prefix** input (auto-fills with project name)
   - **Export button** (with progress bar showing real-time encoding progress)
   - **Download links** (appear after completion, organized by drum/track)
   - **Optimization note** (shows estimated file sizes before export)

**Keyboard Shortcuts (Browser):**
- `Ctrl+E` — export
- `Ctrl+Shift+S` — save as preset
- `Ctrl+L` — load kit
- `Ctrl+Alt+P` — load preset
- `/` — focus search bar
- `Enter` — load focused item
- `Delete` — delete selected preset (if user-created)

**Visual Indicators (IMPROVED for Drag-Drop):**
- Active kit highlight (background color, cyan border)
- Playback indicator (small play icon + waveform animation)
- Download/loading spinner (during export, shows % complete)
- Unsaved changes indicator (red dot on tab title)
- **Drag-over state** (cyan highlight on target zone, "Drop here" text)
- **Drag preview** (thumbnail of item being dragged follows cursor)
- **Valid drop indicator** (green border shows where drop will land)
- **Invalid drop** (red border if trying to drop in wrong location)

**Benefit:** Users discover drag-drop functionality; visual feedback prevents mistakes; fast workflow for loading/assigning samples

---

### Tab 5: SETTINGS (Advanced Controls, MIDI Learn, Optimization - IMPROVED)

**Primary UI:** MIDI learn, macro controls, quantization defaults, ambience, performance optimization, general settings.

#### Components Used:

1. **MidiLearningPanel.tsx** (upper section, ENHANCED)
   - **Learn mode toggle** ("Learn Mode" button, pulsing/glowing when active, shows heartbeat animation)
   - **Prompt text** (dynamic, shows "Click a parameter and move a control on your hardware")
   - **MIDI input monitor** (real-time incoming data display, IMPROVED):
     - Shows: "CC 20", "Note C4", "PitchBend +200", Program Change "3"
     - Brief visual flash on each MIDI message (flashes bright)
     - Tooltip shows incoming data rate (e.g., "120 Hz")
   - **Mapping table** — editable rows with visual feedback:
     - Source CC / Note (shows numeric value)
     - Target parameter (dropdown with search)
     - Min/Max value range (spinners)
     - Type (Linear, Exponential, Toggle) — dropdown
     - Delete button (×)
     - Visual indicator: green checkmark if mapped successfully
   - **Template dropdown** (load presets: Ableton Push, Akai MPK, Novation Launchpad, Arturia, Generic 8-CC)
     - Shows template description on hover (expected controllers, number of CCs)
   - **Clear all mappings button** (with confirmation modal)
   - **Export/Import mappings buttons** (save as JSON file)
   - **Test mode** (toggle, allows user to move MIDI controls to see real-time effect on engine parameters)

2. **MacroControlPanel.tsx** (middle section)
   - **8 macro knobs** (responsive grid, 4×2 layout on small screens, 2×4 on larger)
   - Each macro shows:
     - **Interactive knob** (0–100, touch/mouse drag)
     - **Label** (editable text field, e.g., "Verb Mix")
     - **Assigned parameters list** (shows up to 3 assigned params, "More..." if more)
     - **Edit button** (opens macro assignment modal)
     - **Reset button** (resets to 0)
   - **Macro assignment modal** (when clicking Edit):
     - **Parameter search/list** (all engine parameters, searchable)
     - **Checkboxes** to assign (can toggle multiple per macro)
     - **Min/Max range** per parameter (spinners to set range)
     - **Save macro button** (stores assignment)
     - **Preset macro groups** (buttons: "EQ Focus", "Effects Focus", "Dynamics Focus", "Custom")

3. **PerformanceOptimizationPanel.tsx** (NEW - middle section, IMPORTANT)
   - **CPU Usage display** (large, animated bar chart):
     - Green (0–50%), Yellow (50–80%), Red (80–100%)
     - Component breakdown (shows % per: Sampler, Effects, Recording, Display)
     - Hoverable bars show details (e.g., "Reverb: 8% CPU")
   - **Memory usage** (shows "3.2 GB / 8 GB samples loaded")
     - Red warning if approaching system limit
     - Shows when last garbage collection ran
   - **Voice count** (animated display: "18 / 128 voices")
     - Green < 50%, Yellow 50–80%, Red > 80%
     - Shows polyphony limit (adjustable slider)
   - **Buffer underrun indicator** (brief red flash if audio stutters)
     - Shows "Buffer: OK" or "Buffer: UNDERRUNS DETECTED"
   - **Optimization suggestions** (clickable cards):
     - "Disable unused effects sends" → button to apply
     - "Reduce polyphony to 64" → button to reduce
     - "Use shorter buffer size for lower latency" → dropdown
     - "Sample cache: 45% of limit, optimal" (status only)
   - **Performance graph** (mini area chart, shows CPU over time, last 30 seconds)

4. **QuantizationDefaultsPanel.tsx**
   - **Default grid division** selector (buttons: 1/4, 1/8, 1/16, 1/32, triplet, swing triplet)
   - **Default swing amount** slider (0–100%)
   - **Default humanize amount** slider (0–100%)
   - **Snap to grid by default** toggle
   - **Live preview** (small grid visualization showing effect)
   - **Quantization presets** (buttons: "Tight (0% humanize)", "Natural (40% humanize)", "Loose (70% humanize)")

5. **AmbiencePanel.tsx** (collapsible section)
   - **Room type dropdown** (None, Hall, Chamber, Plate, Spring, Custom)
   - **Room size slider** (0–100%)
   - **Decay time slider** (0.5–10 seconds)
   - **Distance slider** (0–100%, simulates dry/wet distance)
   - **Dry/Wet slider** (0–100%)
   - **Per-drum or global toggle** (apply to single drum or all)
   - **Preset buttons** ("Small Room", "Cathedral", "Plate Reverb", "Subtle", "Spacious")

6. **GeneralSettings.tsx** (bottom section)
   - **Theme selector** (Dark, Light, Custom)
   - **UI scaling** slider (80–200% of default, live preview)
   - **Audio device selector** (if standalone, shows current device + sample rate)
   - **Buffer size selector** (256, 512, 1024, 2048 samples, shows latency estimate)
   - **Polyphony limit** (0–128 voices, slider + input)
   - **Auto-save toggle** (save every N minutes, spinner for interval)
   - **Reset all settings button** (with confirmation)
   - **About section** (version number, license, documentation link)

**Keyboard Shortcuts (Settings):**
- `L` — toggle learn mode (when in focus)
- `Ctrl+M` — open macro editor
- `Escape` — close any modal
- `Ctrl+Shift+R` — reset all settings (with confirmation)

**Visual Indicators (IMPROVED):**
- Learn mode pulsing animation (heartbeat effect, cyan glow)
- Incoming MIDI visual flash (brief highlight on CC display, flashes bright)
- Macro assignment indicator (green check when parameter assigned)
- CPU meter color (green < 50%, yellow 50–80%, red > 80%)
- Buffer status: green dot (normal), red flash (underrun)
- Optimization cards: green (applied), yellow (warning), orange (suggestion)

**Benefit:** Users can troubleshoot performance issues; optimization suggestions reduce CPU load; macro controls enable hardware integration

3. **QuantizationDefaultsPanel.tsx**
   - **Default grid division** selector (buttons)
   - **Default swing amount** slider
   - **Default humanize amount** slider
   - **Snap to grid by default** toggle
   - **Live preview** (shows effect on grid visualization)

4. **AmbiencePanel.tsx** (per-drum ambience)
   - **Room type dropdown** (None, Hall, Chamber, Plate, Spring, Custom)
   - **Room size slider** (0–100%)
   - **Decay time slider** (0.5–10 seconds)
   - **Distance slider** (0–100%, simulates dry/wet distance)
   - **Dry/Wet slider** (0–100%)
   - **Per-drum or global toggle** (apply to single drum or all)
   - **Preset buttons** ("Small Room", "Cathedral", "Plate Reverb", "Subtle")

5. **GeneralSettings.tsx** (bottom section)
   - **Theme selector** (Dark, Light, Custom)
   - **UI scaling** slider (80–200% of default)
   - **Audio device selector** (if standalone)
   - **Buffer size selector** (256, 512, 1024, 2048 samples)
   - **CPU meter** (real-time CPU usage indicator, simple graph)
   - **Polyphony limit** (0–128 voices)
   - **Auto-save toggle** (save every N minutes)
   - **Reset all settings** button (with confirmation)

**Keyboard Shortcuts (Settings):**
- `L` — toggle learn mode (when in focus)
- `Ctrl+M` — open macro editor
- `Escape` — close any modal

**Visual Indicators:**
- Learn mode pulsing animation (heartbeat effect)
- Incoming MIDI visual flash (brief highlight on CC display)
- Macro assignment indicator (green check when parameter assigned)
- CPU meter color (green < 50%, yellow 50–80%, red > 80%)

---

## Supporting React Components & Hooks (Shared Across All Tabs)

### Base Component Library (Extend from PluginCardShell ecosystem)

1. **ParameterKnob.tsx**
   - Rotary knob (SVG or canvas-based)
   - Min/max labels
   - Value display (numerical)
   - Tooltip on hover (parameter name + current value)
   - Touch/mouse drag support (vertical drag to change value)
   - Double-click to reset to default
   - Right-click context menu (set min, set max, reset)

2. **Slider.tsx** (vertical or horizontal)
   - Smooth drag interaction
   - Value display (numerical + percentage)
   - Preset markers (notches at common values)
   - Right-click for precise input modal
   - Animated taper (linear, exponential, log)

3. **VUMeter.tsx**
   - Canvas-based animation (60 FPS, smooth peak decay)
   - Scale: -60 dB to +6 dB (or customizable)
   - Peak hold indicator (small line shows peak)
   - Stereo support (L/R channels)
   - Color gradient (green → yellow → red)
   - Optional numeric readout (dB value)

4. **ToggleButton.tsx**
   - LED-style indicator (on/off colors)
   - Text label
   - Keyboard accessible (Space to toggle)
   - Disabled state support

5. **SelectDropdown.tsx**
   - Searchable list
   - Keyboard navigation (arrow keys)
   - Typeahead search (start typing to filter)
   - Optional icons per option
   - Multi-select variant

6. **Tabs.tsx**
   - Tab header with icon + text
   - Active tab highlight
   - Keyboard navigation (Ctrl+Tab, Ctrl+Shift+Tab to switch tabs)
   - Optional tab badges (red dot for unsaved changes)

7. **Modal.tsx**
   - Darkened overlay
   - Centered dialog box
   - Close button (×)
   - Keyboard: Escape to close
   - Focus trap (tab stays within modal)

8. **ContextMenu.tsx**
   - Right-click trigger
   - Items with icons
   - Keyboard navigation
   - Submenu support
   - Auto-position (avoids screen edges)

9. **ProgressBar.tsx**
   - Filled percentage display
   - Optional label (text overlay)
   - Indeterminate state (animated stripes)
   - Custom colors

10. **ColorPicker.tsx**
    - Palette grid (user-defined colors)
    - Hex input field
    - HSL sliders (optional, advanced)
    - Eyedropper tool (pick from screen)

### Custom Hooks (Global State Management)

1. **useDrumMachine.ts** — Root hook aggregating all sub-state
   ```typescript
   const {
     // Playback state
     isPlaying,
     currentBpm,
     currentBar,
     currentBeat,
     
     // Pattern/Kit state
     currentPattern,
     currentKit,
     currentPreset,
     
     // Recording state
     isRecording,
     recordingProgress,
     
     // UI state
     activeTab,
     selectedDrum,
     selectedNotes,
     
     // Methods
     play,
     pause,
     setBpm,
     setPattern,
     setKit,
     setPreset,
     startRecording,
     stopRecording,
     setActiveTab,
   } = useDrumMachine();
   ```

2. **useDrumUndo.ts** — Undo/Redo state
   ```typescript
   const { undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useDrumUndo();
   ```

3. **useTempoSync.ts** — Tempo & host sync
   ```typescript
   const { 
     bpm, setBpm, tapTempo, syncMode, setSyncMode, 
     hostBpm, clickEnabled, setClickEnabled 
   } = useTempoSync();
   ```

4. **useQuantization.ts** — Grid & quantize settings
   ```typescript
   const { 
     gridDivision, swingAmount, humanizeAmount, 
     snapToGrid, setGridDivision, setSwing, setHumanize 
   } = useQuantization();
   ```

5. **usePadLauncher.ts** — Pad state
   ```typescript
   const { 
     pads, triggerPad, setPadConfig, getPadState, 
     gridSize, setGridSize 
   } = usePadLauncher();
   ```

6. **usePatternRecorder.ts** — Recording state
   ```typescript
   const { 
     isRecording, recordingProgress, startRecording, 
     stopRecording, recordedData, clearRecording 
   } = usePatternRecorder();
   ```

7. **useMidiMapping.ts** — MIDI learn state
   ```typescript
   const { 
     learnMode, toggleLearnMode, addMapping, removeMapping, 
     allMappings, incomingMidiDisplay 
   } = useMidiMapping();
   ```

8. **useKitBrowser.ts** — Kit & sample state
   ```typescript
   const { 
     availableKits, currentKit, loadKit, 
     uploadSample, deleteSample, samples 
   } = useKitBrowser();
   ```

---

## Visual Design System

### Color Palette (Dark Theme)
- **Background:** `#0a0e27` (very dark blue)
- **Surface:** `#1a1f3a` (dark blue-grey)
- **Accent primary:** `#00d4ff` (bright cyan)
- **Accent secondary:** `#ff6b35` (warm orange, for alerts)
- **Success:** `#00ff41` (bright green, for playback/active)
- **Warning:** `#ffbb00` (bright yellow)
- **Text primary:** `#ffffff` (white)
- **Text secondary:** `#a0aac5` (light grey-blue)

### Typography
- **Display font:** `Inter` or `Roboto` (sans-serif, modern)
- **Monospace font:** `Monaco` or `JetBrains Mono` (for values, code)
- **Font weight:** Regular (400), Semi-bold (600), Bold (700)

### Spacing Grid
- Base unit: 8px
- Padding: 8px, 16px, 24px
- Margins: 4px, 8px, 16px, 24px
- Gap (flex): 8px (tight), 16px (normal), 24px (loose)

### Animation Timings
- Smooth transitions: 200ms (cubic-bezier(0.4, 0, 0.2, 1))
- UI feedback: 100ms (button press)
- Playhead animation: 60 FPS (smooth)
- Pad launch: 50ms press, 100ms release
- Undo/Redo flash: 300ms highlight

### Responsive Breakpoints
- **Mobile (< 640px):** Single column, collapsed controls
- **Tablet (640px – 1024px):** 2-column layout, tabs may stack
- **Desktop (1024px – 2560px):** Full multi-column, all panels visible
- **4K (> 2560px):** Scaled 1.5–2× with wider spacing

---

## Accessibility & Keyboard Navigation

### Global Keyboard Shortcuts (All Tabs)
- `Ctrl+Z` / `Cmd+Z` — Undo
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` — Redo
- `Space` — Play/Pause
- `Ctrl+S` — Save
- `Ctrl+Shift+S` — Save As
- `Ctrl+L` — Load Kit
- `Ctrl+E` — Export
- `Tab` — Focus next control
- `Shift+Tab` — Focus previous control
- `Escape` — Close modal / Cancel action
- `?` — Show keyboard shortcuts (modal)

### ARIA Compliance
- All buttons have `aria-label` (if icon-only)
- Form inputs have `<label>` or `aria-label`
- Modals have `role="dialog"` + `aria-labelledby`
- Tabs use `role="tablist"` + `role="tab"`
- Live regions for status updates: `aria-live="polite"` (recordings, exports)
- Color contrast: minimum 4.5:1 for text on backgrounds

### Touch Support (Mobile/Tablet)
- Minimum touch target size: 48×48 px
- Double-tap to edit (pads, presets)
- Long-press for context menu (pads)
- Swipe to navigate tabs (optional)
- Pinch-zoom not supported (fixed layout)

---

## Performance Optimization

### React Optimization Strategies
- **Code splitting:** Lazy-load browser & settings tabs on demand
- **Memoization:** Wrap components in `React.memo()` to prevent unnecessary re-renders
- **Virtual scrolling:** Use `react-window` for large lists (preset browser, fill browser)
- **Web Workers:** Offload quantization calculations & pattern analysis to worker thread
- **Canvas rendering:** Use canvas for piano roll + VU meters (not DOM elements)
- **Debouncing:** Debounce slider/knob interactions (100ms) to reduce API calls

### State Management (Recommended: Jotai or Redux Toolkit)
```typescript
// Example: Jotai approach (lightweight, granular atoms)
import { atom } from 'jotai';

export const bpmAtom = atom(120);
export const isPlayingAtom = atom(false);
export const currentPatternAtom = atom(null);
// ...use atoms in hooks + components
```

### Network Optimization
- **Lazy load samples:** Load drum samples on-demand (user selects kit)
- **Stream audio:** Use Web Audio API for playback (not HTTP streaming)
- **Batch API calls:** Combine multiple parameter updates into single request (100ms debounce window)

---

## Integration with Existing MAP2 Infrastructure

The **DrumMachineCard** follows the existing MAP2 PluginCardShell pattern:

```typescript
// web/src/app/components/PluginCards/Custom/JUCE/DrumMachineCard.tsx

import React from 'react';
import { PluginCardShell, withMidiDialog } from '@map2/plugin-base';
import { useMidiMapping } from '../../hooks/useMidiMapping';

// Define URI and parameters (same as other JUCE effects)
const DRUM_MACHINE_URI = 'map2://juce/instruments/drum-machine';

const DRUM_MACHINE_PARAMS: PluginParamDef[] = [
  { name: 'Master Volume', symbol: 'master_vol', min: -100, max: 6, default: 0, type: 'dB' },
  { name: 'Tempo', symbol: 'tempo_bpm', min: 60, max: 300, default: 120, type: 'integer' },
  // ... full parameter list
];

// Main card component
const DrumMachineCardBase: React.FC<DrumMachineCardProps> = (props) => {
  return (
    <PluginCardShell uri={DRUM_MACHINE_URI} {...props}>
      <DrumMachineUI />
    </PluginCardShell>
  );
};

// Export wrapped with MIDI dialog
export const DrumMachineCard = withMidiDialog(
  DrumMachineCardBase, 
  DRUM_MACHINE_URI, 
  DRUM_MACHINE_PARAMS
);

// Register in plugin registry
export default DrumMachineCard;
```

### Registration (components/PluginCards/registry.ts)
```typescript
import { DrumMachineCard } from './Custom/JUCE/DrumMachineCard';

registerPluginCard('map2://juce/instruments/drum-machine', {
  component: DrumMachineCard,
  category: 'instruments',
  displayName: 'Drums and Beats',
});
```

### Metadata (app/deployment/juce_processors.json)
```json
{
  "uri": "map2://juce/instruments/drum-machine",
  "name": "Drums and Beats",
  "category": "sampler/drums",
  "description": "Professional-grade drum sampler with 8 base kits, 350+ grooves, real-time recording, performance mode, and deep mixing controls.",
  "author": "MAP2 Audio",
  "is_native": true,
  "audio_ports": {
    "inputs": [{ "name": "MIDI In", "index": 0 }],
    "outputs": [{ "name": "Stereo Out", "index": 0 }]
  },
  "parameters": [
    { "name": "Master Volume", "symbol": "master_vol", "min": -100, "max": 6, "default": 0, "type": "dB" },
    { "name": "Tempo BPM", "symbol": "tempo_bpm", "min": 60, "max": 300, "default": 120, "type": "integer" },
    // ... full parameter array
  ],
  "presets": [
    { "name": "Modern Tight Studio", "id": "modern_tight_studio" },
    { "name": "Vintage 70s Rock", "id": "vintage_70s_rock" },
    // ... era/style presets
  ]
}
```

---

## Summary: React Component & Hook Checklist

| Component | Location | Purpose |
|-----------|----------|---------|
| **DrumMachineCard** | Custom/JUCE/ | Main plugin card wrapper |
| **MixerTab** | Tabs/ | Mixer view container |
| **MixerGrid** | Mixer/ | Grid layout for drum strips |
| **DrumMixerStrip** | Mixer/ | Per-drum mixer controls |
| **MasterBusStrip** | Mixer/ | Master channel controls |
| **TimelineTab** | Tabs/ | Timeline/piano roll view |
| **PianoRoll** | Timeline/ | MIDI editor canvas |
| **PatternChainViewer** | Timeline/ | Visual chain diagram |
| **FillBrowser** | Timeline/ | Fill selector panel |
| **QuantizationToolbar** | Timeline/ | Grid/swing controls |
| **PerformanceTab** | Tabs/ | Pad launcher + recording |
| **PadLauncher** | Performance/ | Pad grid |
| **RecordingPanel** | Performance/ | Record controls + progress |
| **PatternChainPlayback** | Performance/ | Chain playback display |
| **BrowserTab** | Tabs/ | Kit/preset/sample browser |
| **KitBrowser** | Browser/ | Kit list + loader |
| **PresetBrowser** | Browser/ | Preset library |
| **SampleLoader** | Browser/ | Drag-drop sample upload |
| **SettingsTab** | Tabs/ | MIDI learn + advanced |
| **MidiLearningPanel** | Settings/ | MIDI mapping interface |
| **MacroControlPanel** | Settings/ | Macro knob editor |
| **QuantizationDefaults** | Settings/ | Quantize preferences |
| **ParameterKnob** | Shared/ | Rotary knob component |
| **Slider** | Shared/ | Fader/slider component |
| **VUMeter** | Shared/ | Level metering |
| **ToggleButton** | Shared/ | On/off button |
| **SelectDropdown** | Shared/ | Select menu |
| **Tabs** | Shared/ | Tab navigation |
| **Modal** | Shared/ | Dialog boxes |

| Hook | Purpose |
|------|---------|
| **useDrumMachine** | Root state aggregator |
| **useDrumUndo** | Undo/Redo management |
| **useTempoSync** | Tempo + host sync |
| **useQuantization** | Grid + quantize settings |
| **usePadLauncher** | Pad state + actions |
| **usePatternRecorder** | Recording state |
| **useMidiMapping** | MIDI learn + mappings |
| **useKitBrowser** | Kit + sample loading |
| **useFillPatterns** | Fill library access |
| **usePatternChain** | Pattern chain state |
| **useDrumTuning** | Per-drum character controls |
| **useExport** | Export progress + options |

---

## Delivery Checklist for React Frontend

**Phase 1 (MVP):**
- [ ] DrumMachineCard wrapper + PluginCardShell integration
- [ ] Mixer tab (basic drum strips, master bus, VU meters)
- [ ] Timeline tab (piano roll, basic pattern editor)
- [ ] TempoControl (tap tempo, BPM display, sync mode)
- [ ] Shared components (ParameterKnob, Slider, VUMeter, ToggleButton, SelectDropdown)

**Phase 2 (Core Features):**
- [ ] Undo/Redo (Feature 1) with visual indicator
- [ ] Quantization toolbar (Feature 2) with grid overlay
- [ ] Performance tab with PadLauncher (Feature 10, simplified)
- [ ] RecordingPanel (Feature 9) with quantization preview

**Phase 3 (Advanced):**
- [ ] Browser tab (Kit + Preset browser, sample loader)
- [ ] FillBrowser (Feature 3) with drag-drop to timeline
- [ ] PatternChainViewer (Feature 8) with visual diagram
- [ ] DrumTuningPanel (Feature 7) per-drum controls

**Phase 4 (Integration):**
- [ ] MIDI Learn panel (Feature 4)
- [ ] MacroControlPanel (Feature 4) — 8 macro knobs
- [ ] ExportDialog (Feature 5) with progress
- [ ] SettingsTab for all advanced controls

**Phase 5 (Polish):**
- [ ] Dark/Light theme toggle
- [ ] Responsive layout testing (mobile → 4K)
- [ ] Keyboard shortcut help modal
- [ ] Accessibility audit (ARIA, contrast, tab order)
- [ ] Performance optimization (virtual scrolling, memoization, debouncing)
- [ ] Animation refinement (playhead, pad launches, transitions)

---

## Final Notes

**The React GUI is designed to:**
1. **Adapt to all feature requirements** — all 10 features + originals are represented in tabs/panels
2. **Maintain professional appearance** — dark theme, smooth animations, thoughtful spacing
3. **Prioritize workflow efficiency** — keyboard shortcuts, drag-drop, context menus
4. **Support real-time performance** — pad launching, recording, pattern chaining
5. **Scale responsively** — works from 1024px (laptop) to 4K (control room)
6. **Integrate seamlessly** — extends MAP2's PluginCardShell + registry pattern

**Estimated React component count:** 50+ components + 12 custom hooks = 60+ modules total.
**Estimated build size (gzip):** ~400–600 KB (typical for React plugin UI with canvas rendering).
**Browser compatibility:** Chrome, Firefox, Safari (modern, ES2020+).

