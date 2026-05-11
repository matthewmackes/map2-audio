/**
 * T2509-5 — Multi-Track Recorder client + types.
 *
 * Wraps the FastAPI surface from T2508-4 (/api/v1/recorder/sessions)
 * and T2508-5 (/api/recordings). The WebSocket topic
 * `recorder:session` is consumed by `useRecorderSession`; this
 * module is for typed HTTP calls only.
 */

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecorderSessionState = 'armed' | 'rolling' | 'stopped'

export interface RecorderTapConfig {
  pre_fx: boolean
  post_fx: boolean
}

export interface RecorderSessionStatus {
  session_id: string
  snapshot_id: number
  state: RecorderSessionState
  armed: boolean
  rolling: boolean
  started_at: string | null
  rolling_at: string | null
  stopped_at: string | null
  tap_matrix: Record<string, RecorderTapConfig>
  participating_nodes: string[]
}

export interface RecorderSessionListResponse {
  sessions: RecorderSessionStatus[]
  count: number
}

export interface ArmSessionRequest {
  snapshot_id: number
  tap_matrix: Record<string, RecorderTapConfig>
}

/** Envelope shape pushed onto the `recorder:session` WS topic. */
export interface RecorderSessionFrame {
  type: 'recorder_session'
  payload: RecorderSessionStatus
}

export interface RecordingSummary {
  asset_hash: string
  file_name: string
  size_bytes: number
  source_path: string
  created_at: string
  updated_at: string
}

export interface RecordingListResponse {
  recordings: RecordingSummary[]
  count: number
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

const SESSIONS_BASE = `${API_BASE}/v1/recorder/sessions`
const RECORDINGS_BASE = `${API_BASE}/recordings`

export const recorderApi = {
  /**
   * Arm a new recorder session. Returns the initial ARMED status.
   * Backend allocates the session_id.
   */
  armSession: (body: ArmSessionRequest): Promise<RecorderSessionStatus> =>
    fetchJson<RecorderSessionStatus>(SESSIONS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  /** Transition an armed session into ROLLING. */
  startRolling: (sessionId: string): Promise<RecorderSessionStatus> =>
    fetchJson<RecorderSessionStatus>(`${SESSIONS_BASE}/${sessionId}/roll`, {
      method: 'POST',
    }),

  /** Stop a rolling or armed session. Idempotent. */
  stopSession: (sessionId: string): Promise<RecorderSessionStatus> =>
    fetchJson<RecorderSessionStatus>(`${SESSIONS_BASE}/${sessionId}/stop`, {
      method: 'POST',
    }),

  /** Drop the session entirely (engine releases tap nodes). */
  disarmSession: (sessionId: string): Promise<void> =>
    fetchJson<void>(`${SESSIONS_BASE}/${sessionId}`, {
      method: 'DELETE',
    }),

  /** Snapshot of the current status without emitting verbs. */
  getSessionStatus: (sessionId: string): Promise<RecorderSessionStatus> =>
    fetchJson<RecorderSessionStatus>(`${SESSIONS_BASE}/${sessionId}`),

  /** List every in-flight session on this node. */
  listSessions: (): Promise<RecorderSessionListResponse> =>
    fetchJson<RecorderSessionListResponse>(SESSIONS_BASE),

  // -----------------------------------------------------------------
  // Artifact registry (T2508-5)
  // -----------------------------------------------------------------

  /** List every captured recording in the artifact registry. */
  listRecordings: (): Promise<RecordingListResponse> =>
    fetchJson<RecordingListResponse>(RECORDINGS_BASE),

  /** Sidecar JSON for a recording. */
  getRecordingMetadata: (assetHash: string): Promise<Record<string, unknown>> =>
    fetchJson<Record<string, unknown>>(
      `${RECORDINGS_BASE}/${encodeURIComponent(assetHash)}/metadata`,
    ),

  /** URL for the WAV stream. Consumers (e.g. `<audio src>`) use it directly. */
  recordingWavUrl: (assetHash: string): string =>
    `${RECORDINGS_BASE}/${encodeURIComponent(assetHash)}/wav`,

  /** Delete a recording (registry row + on-disk files). */
  deleteRecording: (assetHash: string): Promise<void> =>
    fetchJson<void>(`${RECORDINGS_BASE}/${encodeURIComponent(assetHash)}`, {
      method: 'DELETE',
    }),
}
