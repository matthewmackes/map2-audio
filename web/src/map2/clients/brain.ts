import type * as Api from '../api'
import { appendPluginRuntimeQuery, fetchJson, type PluginRuntimeScopeOptions } from '../http'
import { API_BASE } from '../transport'

function scopedPath(path: string, options?: PluginRuntimeScopeOptions) {
  return appendPluginRuntimeQuery(`${API_BASE}/engine/brain${path}`, options)
}

export const brainApi = {
  getState: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainState>(scopedPath('/state', options)),

  updateState: (patch: Api.BrainStateUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainState>(scopedPath('/state', options), {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getTransport: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainTransportState>(scopedPath('/transport', options)),

  setTransport: (patch: Api.BrainTransportUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainTransportState>(scopedPath('/transport', options), {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getSlots: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSlot[]>(scopedPath('/slots', options)),

  updateSlot: (slotId: number, patch: Api.BrainSlotUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSlot>(scopedPath(`/slots/${slotId}`, options), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  getLayers: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<{ active_layer_id: string; layers: Api.BrainLayer[] }>(scopedPath('/layers', options)),

  setLayers: (layers: Api.BrainLayer[], options?: PluginRuntimeScopeOptions) =>
    fetchJson<{ active_layer_id: string; layers: Api.BrainLayer[] }>(scopedPath('/layers', options), {
      method: 'POST',
      body: JSON.stringify({ layers }),
    }),

  getSequence: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSequence>(scopedPath('/sequence', options)),

  setSequence: (sequence: Api.BrainSequence, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSequence>(scopedPath('/sequence', options), {
      method: 'POST',
      body: JSON.stringify({ sequence }),
    }),

  getSong: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSongState>(scopedPath('/song', options)),

  setSong: (song: Api.BrainSongState, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSongState>(scopedPath('/song', options), {
      method: 'POST',
      body: JSON.stringify({ song }),
    }),

  getMixer: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainMixerState>(scopedPath('/mixer', options)),

  setMixer: (mixer: Api.BrainMixerState, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainMixerState>(scopedPath('/mixer', options), {
      method: 'POST',
      body: JSON.stringify({ mixer }),
    }),

  getInputs: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainInputsState>(scopedPath('/inputs', options)),

  setInputs: (inputs: Api.BrainInputsState, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainInputsState>(scopedPath('/inputs', options), {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    }),

  getLibrary: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainLibraryState>(scopedPath('/library', options)),

  getSampleEditor: (slotId?: number, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSampleEditorState>(
      scopedPath(slotId == null ? '/sample-editor' : `/sample-editor?slot_id=${slotId}`, options),
    ),

  updateSampleEditor: (patch: Api.BrainSampleEditorUpdate, options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainSampleEditorState>(scopedPath('/sample-editor', options), {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getDiagnostics: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainDiagnostics>(scopedPath('/diagnostics', options)),

  importFromDrums: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainState>(scopedPath('/import/drums', options), {
      method: 'POST',
    }),

  importFromSynthForge: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<Api.BrainState>(scopedPath('/import/synthforge', options), {
      method: 'POST',
    }),
}
