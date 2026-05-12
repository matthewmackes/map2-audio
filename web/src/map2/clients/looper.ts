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
  /** T2512-AUTO — operator armed input-threshold auto-record. */
  auto_armed: boolean
  /** T2512-AUTO — input-threshold in dB, clamped -90..0. */
  auto_threshold_db: number
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

export interface LooperStatus {
  tracks: LooperTrackStatus[]
  active_track_count: number
  sync_master: boolean
  master_level_db: number
  /** T2512-CLOCK (inbound) — current snapshot tempo BPM; null when tempo service unavailable. */
  bpm: number | null
  /** T2512-SYNC — index of the track set to sync_mode "master", or null. */
  sync_master_track: number | null
}

const BASE = `${API_BASE}/v1/looper`

export const looperApi = {
  getStatus: (): Promise<LooperStatus> => fetchJson<LooperStatus>(`${BASE}/status`),

  record:    (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/record`, { method: 'POST' }),
  stop:      (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/stop`,   { method: 'POST' }),
  clear:     (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/clear`,  { method: 'POST' }),
  undo:      (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/undo`,   { method: 'POST' }),
  redo:      (track: number) => fetchJson<LooperStatus>(`${BASE}/track/${track}/redo`,   { method: 'POST' }),

  setLevel:    (track: number, db: number)    => patch(`${BASE}/track/${track}/level`,      { db }),
  setMuted:    (track: number, muted: boolean) => patch(`${BASE}/track/${track}/muted`,      { value: muted }),
  setSoloed:   (track: number, soloed: boolean) => patch(`${BASE}/track/${track}/soloed`,    { value: soloed }),
  setReverse:  (track: number, reverse: boolean) => patch(`${BASE}/track/${track}/reverse`,  { value: reverse }),
  setHalfSpeed: (track: number, half: boolean)   => patch(`${BASE}/track/${track}/half-speed`, { value: half }),
  /** T2512-LOCK — toggle the write-lock for a track. */
  setLocked:   (track: number, locked: boolean) => patch(`${BASE}/track/${track}/locked`,   { value: locked }),
  /** T2512-OS — toggle one-shot / trigger mode for a track. */
  setOneShot:  (track: number, oneShot: boolean) => patch(`${BASE}/track/${track}/one-shot`, { value: oneShot }),
  /** T2512-AUTO — arm / disarm input-threshold auto-record. */
  setAutoArmed:        (track: number, armed: boolean) => patch(`${BASE}/track/${track}/auto-armed`,     { value: armed }),
  /** T2512-AUTO — set the input-threshold dB for auto-record (clamped -90..0). */
  setAutoThresholdDb:  (track: number, db: number)     => patch(`${BASE}/track/${track}/auto-threshold`, { db }),
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
  setMasterLevel: (db: number)                 => patch(`${BASE}/master/level`, { db }),
  /** T2512-RESET — clear every Python-side flag + master level. Captured loop content is unaffected. */
  resetState: () =>
    fetchJson<LooperStatus>(`${BASE}/state/reset`, { method: 'POST' }),
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
}

function patch(url: string, body: unknown): Promise<LooperStatus> {
  return fetchJson<LooperStatus>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
