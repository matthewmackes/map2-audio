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
}

export interface LooperStatus {
  tracks: LooperTrackStatus[]
  active_track_count: number
  sync_master: boolean
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

  setLevel:    (track: number, db: number)    => patch(`${BASE}/track/${track}/level`,      { db }),
  setMuted:    (track: number, muted: boolean) => patch(`${BASE}/track/${track}/muted`,      { value: muted }),
  setSoloed:   (track: number, soloed: boolean) => patch(`${BASE}/track/${track}/soloed`,    { value: soloed }),
  setReverse:  (track: number, reverse: boolean) => patch(`${BASE}/track/${track}/reverse`,  { value: reverse }),
  setHalfSpeed: (track: number, half: boolean)   => patch(`${BASE}/track/${track}/half-speed`, { value: half }),
  /** T2512-LOCK — toggle the write-lock for a track. */
  setLocked:   (track: number, locked: boolean) => patch(`${BASE}/track/${track}/locked`,   { value: locked }),
  setMasterLevel: (db: number)                 => patch(`${BASE}/master/level`, { db }),
}

function patch(url: string, body: unknown): Promise<LooperStatus> {
  return fetchJson<LooperStatus>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
