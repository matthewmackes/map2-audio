/**
 * T2503 — DAW service client.
 *
 * Wraps /api/daw/mode (Set 3) and /api/v1/daw/* (Set 4 — 17 verbs +
 * /events WebSocket).
 *
 * The React reference UI consumes this client; tier-1 surfaces (MK1,
 * MCU, generic MIDI learn) bypass the FastAPI surface entirely and
 * fire engine_command frames directly.
 */
import { fetchJson } from '../http'
import { API_BASE, getWsBaseUrl } from '../transport'

// ---- Types ----

export type EngineMode = 'live' | 'daw'

export type TransitionState =
  | 'idle'
  | 'stopping'
  | 'releasing'
  | 'initializing'
  | 'running'

export interface DawModeStatus {
  mode: EngineMode
  state: TransitionState
  daw_mode_available: boolean
  last_error: string | null
}

export interface DawActionAccepted {
  accepted: boolean
  verb: string
}

export type TrackType = 'audio' | 'midi'

export interface TrackCreatePayload {
  type: TrackType
  name?: string
}

export interface ClipAddPayload {
  track_id: number
  start_samples: number
  length_samples: number
  source: string
}

export interface DawEvent {
  kind: string
  payload: Record<string, unknown>
  timestamp: number | null
}

// ---- HTTP client ----

export const dawApi = {
  // Mode-switch surface (Set 3)
  getMode: () => fetchJson<DawModeStatus>(`${API_BASE}/daw/mode`),

  setMode: (mode: EngineMode) =>
    fetchJson<DawModeStatus>(`${API_BASE}/daw/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }),

  // Transport
  play: () =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/transport/play`, {
      method: 'POST',
    }),

  stop: () =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/transport/stop`, {
      method: 'POST',
    }),

  setRecord: (arm: boolean) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/transport/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arm }),
    }),

  setPosition: (samples: number) =>
    fetchJson<DawActionAccepted>(
      `${API_BASE}/v1/daw/transport/set_position`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples }),
      },
    ),

  // Project lifecycle
  newProject: (name: string) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  loadProject: (path: string) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/projects/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }),

  saveProject: () =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/projects/save`, {
      method: 'POST',
    }),

  // Tracks
  createTrack: (payload: TrackCreatePayload) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  deleteTrack: (trackId: number) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/tracks/${trackId}`, {
      method: 'DELETE',
    }),

  setTrackArm: (trackId: number, armed: boolean) =>
    fetchJson<DawActionAccepted>(
      `${API_BASE}/v1/daw/tracks/${trackId}/arm`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ armed }),
      },
    ),

  // Clips
  addClip: (payload: ClipAddPayload) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  removeClip: (clipId: number) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/clips/${clipId}`, {
      method: 'DELETE',
    }),

  moveClip: (clipId: number, newStartSamples: number) =>
    fetchJson<DawActionAccepted>(
      `${API_BASE}/v1/daw/clips/${clipId}/move`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start_samples: newStartSamples }),
      },
    ),

  // Automation
  setAutomationPoint: (laneId: number, position: number, value: number) =>
    fetchJson<DawActionAccepted>(`${API_BASE}/v1/daw/automation/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lane_id: laneId, position, value }),
    }),

  // Plugins
  addPluginToTrack: (trackId: number, pluginUri: string) =>
    fetchJson<DawActionAccepted>(
      `${API_BASE}/v1/daw/tracks/${trackId}/plugins`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugin_uri: pluginUri }),
      },
    ),

  removePluginFromTrack: (trackId: number, slotIndex: number) =>
    fetchJson<DawActionAccepted>(
      `${API_BASE}/v1/daw/tracks/${trackId}/plugins/${slotIndex}`,
      { method: 'DELETE' },
    ),

  setPluginParam: (
    trackId: number,
    slotIndex: number,
    paramId: string,
    value: number,
  ) =>
    fetchJson<DawActionAccepted>(
      `${API_BASE}/v1/daw/tracks/${trackId}/plugins/${slotIndex}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param_id: paramId, value }),
      },
    ),
}

// ---- WebSocket events ----

export interface DawEventStream {
  close(): void
}

/**
 * Open a WebSocket subscription to /api/v1/daw/events. The first event is
 * always a snapshot; subsequent events are state-change deltas.
 *
 * Returns a handle with a close() method. The caller is responsible for
 * cleanup (e.g., from a useEffect cleanup callback).
 */
export function openDawEventStream(
  onEvent: (event: DawEvent) => void,
  onError?: (event: Event) => void,
): DawEventStream {
  const url = `${getWsBaseUrl()}/api/v1/daw/events`
  const ws = new WebSocket(url)

  ws.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as DawEvent
      onEvent(parsed)
    } catch (err) {
      // Malformed payload — drop. The bus only ever emits valid envelopes;
      // a parse error means a network proxy mangled the frame.
      console.warn('[daw] failed to parse WS event', err)
    }
  }

  if (onError) {
    ws.onerror = onError
  }

  return {
    close() {
      ws.close()
    },
  }
}
