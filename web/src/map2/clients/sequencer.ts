import type * as Api from '../api'
import { appendPluginRuntimeQuery, fetchJson, type PluginRuntimeScopeOptions } from '../http'
import { API_BASE } from '../transport'

function scopedPath(path: string, options?: PluginRuntimeScopeOptions) {
  return appendPluginRuntimeQuery(`${API_BASE}/engine/sequencer${path}`, options)
}

export const sequencerApi = {
  getState: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerState>(scopedPath('/state', options)),

  updateState: (patch: Api.SequencerStateUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerState>(scopedPath('/state', options), {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getTransport: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerTransportState>(scopedPath('/transport', options)),

  setTransport: (patch: Api.SequencerTransportUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerTransportState>(scopedPath('/transport', options), {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getSlots: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSlot[]>(scopedPath('/slots', options)),

  updateSlot: (slotId: number, patch: Api.SequencerSlotUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSlot>(scopedPath(`/slots/${slotId}`, options), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  getLayers: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<{ active_layer_id: string; layers: Api.SequencerLayer[] }>(scopedPath('/layers', options)),

  setLayers: (layers: Api.SequencerLayer[], options?: PluginRuntimeScopeOptions) =>
    fetchJson<{ active_layer_id: string; layers: Api.SequencerLayer[] }>(scopedPath('/layers', options), {
      method: 'POST',
      body: JSON.stringify({ layers }),
    }),

  getSequence: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSequence>(scopedPath('/sequence', options)),

  setSequence: (sequence: Api.SequencerSequence, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSequence>(scopedPath('/sequence', options), {
      method: 'POST',
      body: JSON.stringify({ sequence }),
    }),

  getSong: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSongState>(scopedPath('/song', options)),

  setSong: (song: Api.SequencerSongState, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSongState>(scopedPath('/song', options), {
      method: 'POST',
      body: JSON.stringify({ song }),
    }),

  getMixer: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerMixerState>(scopedPath('/mixer', options)),

  setMixer: (mixer: Api.SequencerMixerState, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerMixerState>(scopedPath('/mixer', options), {
      method: 'POST',
      body: JSON.stringify({ mixer }),
    }),

  getInputs: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerInputsState>(scopedPath('/inputs', options)),

  setInputs: (inputs: Api.SequencerInputsState, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerInputsState>(scopedPath('/inputs', options), {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),

  getLibrary: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerLibraryState>(scopedPath('/library', options)),

  getSampleEditor: (slotId?: number, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSampleEditorState>(
      scopedPath(slotId == null ? '/sample-editor' : `/sample-editor?slot_id=${slotId}`, options),
    ),

  updateSampleEditor: (patch: Api.SequencerSampleEditorUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerSampleEditorState>(scopedPath('/sample-editor', options), {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getDiagnostics: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerDiagnostics>(scopedPath('/diagnostics', options)),

  importFromDrums: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerState>(scopedPath('/import/drums', options), {
      method: 'POST',
    }),

  importFromSynthForge: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.SequencerState>(scopedPath('/import/synthforge', options), {
      method: 'POST',
    }),

  // T2461-A4 — Brain action catalogue exposed for the MIDI Assignments
  // wizard's target-source picker. Read-only; mutation flows through
  // the existing transport / state endpoints.
  listActions: () =>
    fetchJson<{ actions: SequencerActionDescriptor[]; count: number }>(
      `${API_BASE}/engine/sequencer/actions`,
    ),

  // T2461-A6 — Brain capture buffer for the wizard's Calibrate step.
  startCapture: (slotId: number, durationS = 5.0) =>
    fetchJson<{ session_id: string; duration_s: number; slot_id: number }>(
      `${API_BASE}/engine/sequencer/capture/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId, duration_s: durationS }),
      },
    ),

  stopCapture: () =>
    fetchJson<{ finalised: boolean; session_id?: string; frame_count?: number }>(
      `${API_BASE}/engine/sequencer/capture/stop`,
      { method: 'POST' },
    ),

  getCapture: (sessionId: string) =>
    fetchJson<SequencerCaptureSession>(
      `${API_BASE}/engine/sequencer/capture/${encodeURIComponent(sessionId)}`,
    ),

  // T2461-A9 — write the bench-snapshot profile_keys onto a library
  // asset, and read the reverse cross-reference (which library assets
  // were authored with a given device).
  setAssetAuthoredWith: (assetId: string, profileKeys: string[]) =>
    fetchJson<SequencerAssetAuthoredWithResponse>(
      `${API_BASE}/engine/sequencer/library/assets/${encodeURIComponent(assetId)}/authored-with`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_keys: profileKeys }),
      },
    ),

  getAssetsForDevice: (profileKey: string) =>
    fetchJson<SequencerAssetsForDeviceResponse>(
      `${API_BASE}/engine/sequencer/library/by-device/${encodeURIComponent(profileKey)}`,
    ),
}

// T2461-A6 — Brain capture buffer payload.
export interface SequencerCaptureFrame {
  slot_id: number
  peak_db: number
  rms_db: number
  clipping: boolean
  ts: number
}

export interface SequencerCaptureSession {
  found: boolean
  session_id?: string
  slot_id?: number
  started_at?: number
  duration_s?: number
  finalised_at?: number | null
  frame_count?: number
  frames?: SequencerCaptureFrame[]
}

// T2461-A9 — bench snapshot persistence on a library asset.
export interface SequencerAssetAuthoredWithResponse {
  asset_id: string
  authored_with_devices: string[]
  saved_at: number
}

// T2461-A9 — reverse cross-reference for the Hardware Store DeviceCard.
export interface SequencerAssetsForDeviceResponse {
  profile_key: string
  asset_count: number
  asset_ids: string[]
}

// T2461-A4 — Brain action descriptor surfaced in the wizard target tree.
export interface SequencerActionDescriptor {
  id: string
  label: string
  kind: 'transport' | 'section' | 'slot' | 'layer'
  value_type: 'trigger' | 'toggle' | 'continuous'
  description: string
}
