/**
 * T2512 — Multi-track looper client.
 *
 * HTTP wrapper around /api/v1/looper/*. Mirrors the FastAPI route
 * shapes from app/routes/looper.py.
 */

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export type LooperTrackState = 0 | 1 | 2 | 3 | 4
export type LooperTrackStateLabel =
  | 'empty'
  | 'recording'
  | 'playing'
  | 'overdubbing'
  | 'stopped'

export interface LooperTrackSlice {
  start_frame: number
  end_frame: number
  label: string
}

export type LooperStopMode = 'hard' | 'fade'
export type LooperSyncMode = 'free' | 'master' | 'slave'
export type LooperQuantizeDivision =
  | 'off'
  | 'whole' | '1/1'
  | 'half' | '1/2'
  | 'quarter' | '1/4'
  | 'eighth' | '1/8'
  | 'sixteenth' | '1/16'
  | 'thirty-second' | 'thirty_second' | '1/32'

export interface LooperTrackStatus {
  track: number
  state: LooperTrackState
  state_label: LooperTrackStateLabel
  loop_length_frames: number
  playhead_frames: number
  layer_count: number
  level_db: number
  muted: boolean
  soloed: boolean
  reverse: boolean
  half_speed: boolean
  /** T2512-LOCK — write-lock state. Locked tracks reject record/clear/undo/redo. */
  locked: boolean
  /** T2512-OS — one-shot / trigger mode. Auto-stop after one playhead pass. */
  one_shot: boolean
  /** T2512-OS-COUNT — consecutive loop passes before auto-stop (1..32, default 1). */
  one_shot_passes?: number
  /** T2512-AUTO — operator armed input-threshold auto-record. */
  auto_armed: boolean
  /** T2512-AUTO — input-threshold in dB, clamped -90..0. */
  auto_threshold_db: number
  /** T2512-AUTO-PEAK — most recent input-level dB. -150 sentinel = no sample. */
  auto_last_level_db?: number
  /** T2512-AUTO-PEAK — highest input-level dB observed since last arm/reset. */
  auto_peak_db?: number
  /** T2512-FADE — stop kind. "hard" (default, cutoff) or "fade" (gain ramp). */
  stop_mode: LooperStopMode
  /** T2512-FADE — fade-out duration in ms, clamped 0..5000. */
  fade_ms: number
  /** T2512-SYNC — per-track sync mode. */
  sync_mode: LooperSyncMode
  /** T2512-SLICE — non-destructive slice metadata. */
  slices: LooperTrackSlice[]
  /** T2512-QUANT-WIRE — auto-close grid. "off" disables quantization. */
  quantize_division: LooperQuantizeDivision
}

export interface LooperActivityEvent {
  timestamp_iso: string
  verb: string
  track: number | null
  summary: string
}

export interface LooperStatus {
  tracks: LooperTrackStatus[]
  active_track_count: number
  sync_master: boolean
  master_level_db: number
  /** T2512-MASTER-MUTE — global panic-mute flag. When true the master
   *  bus is clamped to the -60 dB floor; pre-mute level restores on
   *  release. */
  master_muted?: boolean
  /** T2512-CLOCK (inbound) — current snapshot tempo BPM; null when tempo service unavailable. */
  bpm: number | null
  /** T2512-SYNC — index of the track set to sync_mode "master", or null. */
  sync_master_track: number | null
  /** T2512-ACTIVITY-WS — newest-first tail of the activity log (cap 20). */
  recent_activity: LooperActivityEvent[]
  /** T2512-PRESET — names of currently-saved in-memory presets, save order. */
  preset_names?: string[]
  /** T2512-METRICS-WS — cumulative verb-invocation counters embedded in
   *  every status frame. Mirrors GET /metrics. */
  metrics?: Record<string, number>
}

/** T2512-PRESET — list-presets envelope returned by GET /presets. */
export interface LooperPresetNames {
  names: string[]
  cap: number
}

/**
 * T2512-SNAP — exported / import-able operator policy state.
 * The `recent_activity`-style transient fields are deliberately
 * absent here: the snapshot service round-trips only the
 * recall-relevant knobs.
 */
export interface LooperStatePayload {
  schema_version: number
  tracks: Array<{
    locked: boolean
    one_shot: boolean
    auto_armed: boolean
    auto_threshold_db: number
    stop_mode: LooperStopMode
    fade_ms: number
    sync_mode: LooperSyncMode
    slices: LooperTrackSlice[]
    quantize_division: LooperQuantizeDivision
  }>
  master_level_db: number
}

const BASE = `${API_BASE}/v1/looper`

export const looperApi = {
  getStatus: (): Promise<LooperStatus> => fetchJson<LooperStatus>(`${BASE}/status`),

  record:    (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/record`, { method: 'POST' }),
  stop:      (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/stop`,   { method: 'POST' }),
  clear:     (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/clear`,  { method: 'POST' }),
  undo:      (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/undo`,   { method: 'POST' }),
  redo:      (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/redo`,   { method: 'POST' }),

  // T2523 — Maschine MK1 (and any future transport surface) drives
  // these verbs over the same surface as record/stop. Backend has
  // matching routes since the T2523-A backend slice.
  play:           (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/play`,             { method: 'POST' }),
  restart:        (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/restart`,          { method: 'POST' }),
  toggleQuantize: (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/toggle-quantize`, { method: 'POST' }),

  setLevel:    (track: number, db: number)    => patch(`${BASE}/track/${track}/level`,      { db }),
  setMuted:    (track: number, muted: boolean) => patch(`${BASE}/track/${track}/muted`,      { value: muted }),
  setSoloed:   (track: number, soloed: boolean) => patch(`${BASE}/track/${track}/soloed`,    { value: soloed }),
  setReverse:  (track: number, reverse: boolean) => patch(`${BASE}/track/${track}/reverse`,  { value: reverse }),
  setHalfSpeed: (track: number, half: boolean)   => patch(`${BASE}/track/${track}/half-speed`, { value: half }),
  /** T2512-LOCK — toggle the write-lock for a track. */
  setLocked:   (track: number, locked: boolean) => patch(`${BASE}/track/${track}/locked`,   { value: locked }),
  /** T2512-OS — toggle one-shot / trigger mode for a track. */
  setOneShot:  (track: number, oneShot: boolean) => patch(`${BASE}/track/${track}/one-shot`, { value: oneShot }),
  /** T2512-OS-COUNT — set consecutive-pass count for one-shot mode (clamped 1..32). */
  setOneShotPasses: (track: number, passes: number) =>
    patch(`${BASE}/track/${track}/one-shot-passes`, { passes }),
  /** T2512-AUTO — arm / disarm input-threshold auto-record. */
  setAutoArmed:        (track: number, armed: boolean) => patch(`${BASE}/track/${track}/auto-armed`,     { value: armed }),
  /** T2512-AUTO — set the input-threshold dB for auto-record (clamped -90..0). */
  setAutoThresholdDb:  (track: number, db: number)     => patch(`${BASE}/track/${track}/auto-threshold`, { db }),
  /** T2512-AUTO-PEAK — reset the per-track peak indicator without touching arm/threshold. */
  resetAutoPeak: (track: number) =>
    fetchJson<LooperStatus>(
      `${BASE}/track/${track}/auto-record/reset-peak`,
      { method: 'POST' },
    ),
  /** T2512-FADE — set stop mode for a track. */
  setStopMode: (track: number, mode: LooperStopMode) =>
    patch(`${BASE}/track/${track}/stop-mode`, { mode }),
  /** T2512-FADE — set fade-out duration in ms (clamped 0..5000). */
  setFadeMs: (track: number, fade_ms: number) =>
    patch(`${BASE}/track/${track}/fade-ms`, { fade_ms }),
  /** T2512-SYNC — set per-track sync mode (service enforces at-most-one master). */
  setSyncMode: (track: number, mode: LooperSyncMode) =>
    patch(`${BASE}/track/${track}/sync-mode`, { mode }),
  /** T2512-QUANT-WIRE — set the auto-close grid for a track. */
  setQuantizeDivision: (track: number, division: LooperQuantizeDivision) =>
    patch(`${BASE}/track/${track}/quantize-division`, { division }),
  /** T2512-SLICE — append a non-destructive slice to a track. */
  addSlice: (track: number, start_frame: number, end_frame: number, label = '') =>
    fetchJson<LooperStatus>(`${BASE}/track/${track}/slices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_frame, end_frame, label }),
    }),
  /** T2512-SLICE-AT-PLAYHEAD — add a slice from the previous boundary to the playhead. */
  addSliceAtPlayhead: (track: number, label = '') =>
    fetchJson<LooperStatus>(`${BASE}/track/${track}/slices/at-playhead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    }),
  /** T2512-SLICE — drop every slice on a track. */
  clearSlices: (track: number) =>
    fetchJson<LooperStatus>(`${BASE}/track/${track}/slices`, { method: 'DELETE' }),
  /** T2512-SLICE-DEL — drop a single slice by start_frame. Returns 404 when no match. */
  deleteSlice: (track: number, start_frame: number) =>
    fetchJson<LooperStatus>(
      `${BASE}/track/${track}/slices/${start_frame}`,
      { method: 'DELETE' },
    ),
  /** T2512-SLICE-RENAME — replace an existing slice's label by start_frame. */
  renameSlice: (track: number, start_frame: number, label: string) =>
    fetchJson<LooperStatus>(
      `${BASE}/track/${track}/slices/${start_frame}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      },
    ),
  setMasterLevel: (db: number)                 => patch(`${BASE}/master/level`, { db }),
  /** T2512-MASTER-MUTE — toggle the global panic-mute flag. */
  setMasterMuted: (muted: boolean) => patch(`${BASE}/master/muted`, { value: muted }),
  /** T2512-RESET — clear every Python-side flag + master level. Captured loop content is unaffected. */
  resetState: () =>
    fetchJson<LooperStatus>(`${BASE}/state/reset`, { method: 'POST' }),
  /**
   * T2512-SNAP — serialize operator policy state for snapshot save
   * or offline backup. The returned payload is the same shape
   * ``applyState`` accepts.
   */
  getState: () => fetchJson<LooperStatePayload>(`${BASE}/state`),
  /** T2512-SNAP — apply a previously-exported state payload. */
  applyState: (payload: LooperStatePayload) =>
    fetchJson<LooperStatus>(`${BASE}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  /**
   * T2512-AUTO-PUSH — feed an input-level RMS sample to the auto-record
   * trigger. Returns {fired, status}. Useful for test harnesses or
   * external level monitors driving auto-record without the engine
   * binding.
   */
  autoRecordPush: (track: number, level_db: number) =>
    fetchJson<{ fired: boolean; status: LooperStatus }>(
      `${BASE}/track/${track}/auto-record/push`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_db }),
      },
    ),
  /** T2512-ACTIVITY — fetch the operator-actions audit log (capped 200 events). */
  getActivity: () =>
    fetchJson<{
      events: Array<{
        timestamp_iso: string
        verb: string
        track: number | null
        summary: string
      }>
      cap: number
    }>(`${BASE}/activity`),
  /** T2512-ACTIVITY — drop every recorded activity event. */
  clearActivity: () =>
    fetchJson<{
      events: []
      cap: number
    }>(`${BASE}/activity`, { method: 'DELETE' }),
  /** T2512-METRICS — verb invocation counter snapshot. */
  getMetrics: () =>
    fetchJson<{ counters: Record<string, number> }>(`${BASE}/metrics`),
  /** T2512-METRICS — zero the verb counters. Activity log unaffected. */
  resetMetrics: () =>
    fetchJson<{ counters: Record<string, number> }>(`${BASE}/metrics`, {
      method: 'DELETE',
    }),
  /** T2512-PRESET — list named in-memory state presets (insertion order). */
  listPresets: () => fetchJson<LooperPresetNames>(`${BASE}/presets`),
  /** T2512-PRESET — snapshot the current state under a named slot. */
  savePreset: (name: string) =>
    fetchJson<LooperStatus>(
      `${BASE}/presets/${encodeURIComponent(name)}`,
      { method: 'POST' },
    ),
  /** T2512-PRESET — restore a named preset into active state. */
  applyPreset: (name: string) =>
    fetchJson<LooperStatus>(
      `${BASE}/presets/${encodeURIComponent(name)}/apply`,
      { method: 'POST' },
    ),
  /** T2512-PRESET — drop a single named preset (no impact on active state). */
  deletePreset: (name: string) =>
    fetchJson<LooperStatus>(
      `${BASE}/presets/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  /** T2512-PRESET — drop every named preset (no impact on active state). */
  clearPresets: () =>
    fetchJson<LooperStatus>(`${BASE}/presets`, { method: 'DELETE' }),
  /**
   * T2512-PRESET-RENAME — relabel a saved preset in place.
   *
   * Preserves the preset's insertion-order position so an operator's
   * list ordering doesn't reshuffle on every rename. 404 on missing
   * source; 409 on destination-name collision.
   */
  renamePreset: (oldName: string, newName: string) =>
    fetchJson<LooperStatus>(
      `${BASE}/presets/${encodeURIComponent(oldName)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
      },
    ),
  /**
   * T2512-PRESET-DRAG-REORDER — set the explicit preset sequence.
   *
   * ``names`` must be a permutation of the current preset roster.
   * 400 from the backend if it isn't (another tab raced a save/delete).
   */
  reorderPresets: (names: ReadonlyArray<string>) =>
    fetchJson<LooperStatus>(`${BASE}/presets/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [...names] }),
    }),
}

function patch(url: string, body: unknown): Promise<LooperStatus> {
  return fetchJson<LooperStatus>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
