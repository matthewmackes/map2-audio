import type * as Api from '../api'
import type {
  AutomationLane,
  AutomationPoint,
  AutomationStatus,
  CurveType,
  LFOConfig,
} from '../types'
import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'

export const synthforgeApi = {
  getParts: () =>
    fetchJson<Api.SynthForgePartConfig[]>(`${API_BASE}/synthforge/parts`),

  setPartConfig: (partIndex: number, config: Api.SynthForgePartConfig) =>
    fetchJson<{ status: string; part_index: number }>(
      `${API_BASE}/synthforge/parts/${partIndex}/config`,
      { method: 'POST', body: JSON.stringify(config) },
    ),

  getPatches: (category?: string) =>
    fetchJson<Api.SynthForgePatchInfo[]>(
      `${API_BASE}/synthforge/patches${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    ),

  loadPatch: (partIndex: number, bank: number, program: number) =>
    fetchJson<{ status: string; part_index: number; bank: number; program: number }>(
      `${API_BASE}/synthforge/patches/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, bank, program }) },
    ),

  savePatch: (partIndex: number, bank: number, program: number, name: string) =>
    fetchJson<{ status: string; part_index: number; bank: number; program: number; name: string }>(
      `${API_BASE}/synthforge/patches/save`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, bank, program, name }) },
    ),

  getVoices: () =>
    fetchJson<Api.SynthForgeVoiceMetrics>(`${API_BASE}/synthforge/voices`),

  getPartParameters: (partIndex: number) =>
    fetchJson<Record<string, number>>(`${API_BASE}/synthforge/parameters/${partIndex}`),

  setPartParameter: (partIndex: number, param: string, value: number) =>
    fetchJson<{ status: string; part_index: number; param: string; value: number }>(
      `${API_BASE}/synthforge/parameters/${partIndex}`,
      { method: 'POST', body: JSON.stringify({ param, value }) },
    ),

  getPerformance: (partIndex: number) =>
    fetchJson<Api.SynthForgePerformanceConfig>(`${API_BASE}/synthforge/parts/${partIndex}/performance`),

  setPerformance: (partIndex: number, config: Api.SynthForgePerformanceConfig) =>
    fetchJson<{ status: string; part_index: number; performance: Api.SynthForgePerformanceConfig }>(
      `${API_BASE}/synthforge/parts/${partIndex}/performance`,
      { method: 'POST', body: JSON.stringify(config) },
    ),

  loadSfz: (partIndex: number, sfzPath: string) =>
    fetchJson<{ status: string; part_index: number; sample_status: Api.SynthForgeSampleStatus }>(
      `${API_BASE}/synthforge/sfz/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, sfz_path: sfzPath }) },
    ),

  loadSoundFont: (partIndex: number, soundfontPath: string, bank = 0, program = 0, presetName = '') =>
    fetchJson<{ status: string; part_index: number; sample_status: Api.SynthForgeSampleStatus }>(
      `${API_BASE}/synthforge/soundfont/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, soundfont_path: soundfontPath, bank, program, preset_name: presetName }) },
    ),

  getSfzStatus: (partIndex: number) =>
    fetchJson<Api.SynthForgeSampleStatus>(`${API_BASE}/synthforge/sfz/status/${partIndex}`),

  reloadSfzIfChanged: (partIndex: number) =>
    fetchJson<{ status: string; part_index: number; reloaded: boolean; sample_status: Api.SynthForgeSampleStatus; hot_reload: Api.SynthForgeHotReloadStatus }>(
      `${API_BASE}/synthforge/sfz/reload-if-changed/${partIndex}`,
      { method: 'POST' },
    ),

  setSamplerBackend: (partIndex: number, backend: 'native' | 'sfizz') =>
    fetchJson<{ status: string; part_index: number; backend: string }>(
      `${API_BASE}/synthforge/parts/${partIndex}/sampler-backend`,
      { method: 'POST', body: JSON.stringify({ backend }) },
    ),

  getSamplerBackend: (partIndex: number) =>
    fetchJson<{ part_index: number; backend: string }>(`${API_BASE}/synthforge/parts/${partIndex}/sampler-backend`),

  setStreamingConfig: (partIndex: number, config: Api.SynthForgeStreamingConfig) =>
    fetchJson<{ status: string; part_index: number; config: Api.SynthForgeStreamingConfig }>(
      `${API_BASE}/synthforge/parts/${partIndex}/streaming`,
      { method: 'POST', body: JSON.stringify(config) },
    ),

  getStreamingConfig: (partIndex: number) =>
    fetchJson<Api.SynthForgeStreamingConfig>(`${API_BASE}/synthforge/parts/${partIndex}/streaming`),

  setHotReload: (partIndex: number, enabled: boolean, intervalMs = 1000) =>
    fetchJson<{ status: string; part_index: number; hot_reload: Api.SynthForgeHotReloadStatus }>(
      `${API_BASE}/synthforge/parts/${partIndex}/hot-reload`,
      { method: 'POST', body: JSON.stringify({ enabled, interval_ms: intervalMs }) },
    ),

  getHotReload: (partIndex: number) =>
    fetchJson<Api.SynthForgeHotReloadStatus>(`${API_BASE}/synthforge/parts/${partIndex}/hot-reload`),

  loadScalaTuning: (partIndex: number, scalaPath: string, rootKey = 60, referenceHz = 440) =>
    fetchJson<{ status: string; part_index: number; tuning: Api.SynthForgeScalaTuning }>(
      `${API_BASE}/synthforge/parts/${partIndex}/scala`,
      { method: 'POST', body: JSON.stringify({ scala_path: scalaPath, root_key: rootKey, reference_hz: referenceHz }) },
    ),

  getScalaTuning: (partIndex: number) =>
    fetchJson<Api.SynthForgeScalaTuning>(`${API_BASE}/synthforge/parts/${partIndex}/scala`),

  setMpeConfig: (partIndex: number, config: Api.SynthForgeMpeConfig) =>
    fetchJson<{ status: string; part_index: number; mpe: Api.SynthForgeMpeConfig }>(
      `${API_BASE}/synthforge/parts/${partIndex}/mpe`,
      { method: 'POST', body: JSON.stringify(config) },
    ),

  getMpeConfig: (partIndex: number) =>
    fetchJson<Api.SynthForgeMpeConfig>(`${API_BASE}/synthforge/parts/${partIndex}/mpe`),

  setModMatrixRoutes: (partIndex: number, routes: Api.SynthForgeModMatrixRoute[]) =>
    fetchJson<{ status: string; part_index: number; routes: Api.SynthForgeModMatrixRoute[] }>(
      `${API_BASE}/synthforge/parts/${partIndex}/mod-matrix`,
      { method: 'POST', body: JSON.stringify({ routes }) },
    ),

  getModMatrixRoutes: (partIndex: number) =>
    fetchJson<Api.SynthForgeModMatrixRoute[]>(`${API_BASE}/synthforge/parts/${partIndex}/mod-matrix`),

  setFreeze: (partIndex: number, enabled: boolean) =>
    fetchJson<{ status: string; part_index: number; freeze: Api.SynthForgeFreezeStatus }>(
      `${API_BASE}/synthforge/parts/${partIndex}/freeze`,
      { method: 'POST', body: JSON.stringify({ enabled }) },
    ),

  getFreezeStatus: (partIndex: number) =>
    fetchJson<Api.SynthForgeFreezeStatus>(`${API_BASE}/synthforge/parts/${partIndex}/freeze`),

  renderPartToFile: (partIndex: number, outputPath: string, durationMs = 2000) =>
    fetchJson<{ status: string; part_index: number; freeze: Api.SynthForgeFreezeStatus }>(
      `${API_BASE}/synthforge/parts/${partIndex}/render`,
      { method: 'POST', body: JSON.stringify({ output_path: outputPath, duration_ms: durationMs }) },
    ),

  getPartAnalyzerFrame: (partIndex: number) =>
    fetchJson<Api.SynthForgeAnalyzerFrame>(`${API_BASE}/synthforge/parts/${partIndex}/analyzer`),

  getAnalyzerFrames: () =>
    fetchJson<Api.SynthForgeAnalyzerFrame[]>(`${API_BASE}/synthforge/analyzer`),

  getPartBackendStatus: (partIndex: number) =>
    fetchJson<Api.SynthForgeBackendStatus>(`${API_BASE}/synthforge/backend-status/${partIndex}`),

  getBackendStatus: () =>
    fetchJson<Api.SynthForgeBackendStatus[]>(`${API_BASE}/synthforge/backend-status`),

  noteOn: (channel: number, note: number, velocity = 100) =>
    fetchJson<{ status: string; channel: number; note: number; velocity: number }>(
      `${API_BASE}/synthforge/midi/note-on`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity }) },
    ),

  noteOff: (channel: number, note: number, velocity = 0) =>
    fetchJson<{ status: string; channel: number; note: number; velocity: number }>(
      `${API_BASE}/synthforge/midi/note-off`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity }) },
    ),
}

export const automationApi = {
  getStatus: () => fetchJson<AutomationStatus>(`${API_BASE}/automation/status`),

  listLanes: () => fetchJson<{ parameters: string[]; count: number }>(`${API_BASE}/automation/lanes`),

  getLane: (parameterId: string) =>
    fetchJson<AutomationLane>(`${API_BASE}/automation/lanes/${encodeURIComponent(parameterId)}`),

  createLane: (lane: {
    parameter_id: string
    points?: AutomationPoint[]
    enabled?: boolean
    modulation_source?: string
    loop_start?: number
    loop_end?: number
  }) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/lanes`, {
      method: 'POST',
      body: JSON.stringify(lane),
    }),

  deleteLane: (parameterId: string) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/automation/lanes/${encodeURIComponent(parameterId)}`,
      { method: 'DELETE' },
    ),

  addPoint: (parameterId: string, time: number, value: number, curve: CurveType = 'linear') =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/points`, {
      method: 'POST',
      body: JSON.stringify({ parameter_id: parameterId, time, value, curve }),
    }),

  removePoint: (parameterId: string, time: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/points`, {
      method: 'DELETE',
      body: JSON.stringify({ parameter_id: parameterId, time }),
    }),

  configureLFO: (config: LFOConfig) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/lfo`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getValue: (parameterId: string, time?: number) => {
    const query = time !== undefined ? `?time=${time}` : ''
    return fetchJson<{ parameter_id: string; value: number; time: number }>(
      `${API_BASE}/automation/value/${encodeURIComponent(parameterId)}${query}`,
    )
  },

  controlPlayback: (action: 'start' | 'stop' | 'seek', time?: number) =>
    fetchJson<{ status: string; action: string; is_playing: boolean; current_time: number }>(
      `${API_BASE}/automation/playback`,
      {
        method: 'POST',
        body: JSON.stringify({ action, time }),
      },
    ),

  importAutomation: (data: Record<string, unknown>) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  clearAll: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/clear`, { method: 'POST' }),
}

export const latencyV2Api = {
  getJitterStats: (nodeId?: string | null) =>
    fetchJson<Api.LatencyJitterStats>(appendNodeQuery(`${API_BASE}/v2/latency/jitter-stats`, nodeId)),
  resetXruns: (nodeId?: string | null) =>
    fetchJson<{ status: string; message: string }>(
      appendNodeQuery(`${API_BASE}/v2/latency/xruns/reset`, nodeId),
      { method: 'POST' },
    ),
}

export const pipewireApi = {
  getStatus: (nodeId?: string | null) =>
    fetchJson<import('../types').PipeWireMetrics>(appendNodeQuery(`${API_BASE}/pipewire/status`, nodeId)),

  getDaemon: (nodeId?: string | null) =>
    fetchJson<import('../types').PipeWireDaemonInfo>(appendNodeQuery(`${API_BASE}/pipewire/daemon`, nodeId)),

  getDevices: (nodeId?: string | null) =>
    fetchJson<{ devices: import('../types').PipeWireDeviceInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/devices`, nodeId)),

  getNodes: (nodeId?: string | null) =>
    fetchJson<{ nodes: import('../types').PipeWireNodeInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/nodes`, nodeId)),

  getStreams: (nodeId?: string | null) =>
    fetchJson<{ streams: import('../types').PipeWireStreamInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/streams`, nodeId)),

  getLinks: (nodeId?: string | null) =>
    fetchJson<{ links: import('../types').PipeWireLinkInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/links`, nodeId)),

  getClients: (nodeId?: string | null) =>
    fetchJson<{ clients: { id: number; name: string; info: string }[] }>(appendNodeQuery(`${API_BASE}/pipewire/clients`, nodeId)),

  getSettings: (nodeId?: string | null) =>
    fetchJson<import('../types').PipeWireSettings>(appendNodeQuery(`${API_BASE}/pipewire/settings`, nodeId)),

  getLatency: (nodeId?: string | null) =>
    fetchJson<{ graph_latency_ms: number; driver_latency_ms: number; total_latency_ms: number; settings: import('../types').PipeWireSettings }>(
      appendNodeQuery(`${API_BASE}/pipewire/latency`, nodeId),
    ),

  setQuantum: (quantum: number, nodeId?: string | null) =>
    fetchJson<{ success: boolean; quantum: number; settings: import('../types').PipeWireSettings }>(
      appendNodeQuery(`${API_BASE}/pipewire/quantum`, nodeId),
      { method: 'POST', body: JSON.stringify({ quantum }) },
    ),

  setRate: (rate: number, nodeId?: string | null) =>
    fetchJson<{ success: boolean; rate: number; settings: import('../types').PipeWireSettings }>(
      appendNodeQuery(`${API_BASE}/pipewire/rate`, nodeId),
      { method: 'POST', body: JSON.stringify({ rate }) },
    ),

  getVolume: (pipewireNodeId: number, nodeId?: string | null) =>
    fetchJson<{ node_id: number; volume: number; muted: boolean }>(
      appendNodeQuery(`${API_BASE}/pipewire/volume/${pipewireNodeId}`, nodeId),
    ),

  setVolume: (pipewireNodeId: number, volume: number, nodeId?: string | null) =>
    fetchJson<{ success: boolean; node_id: number; volume: number }>(
      appendNodeQuery(`${API_BASE}/pipewire/volume`, nodeId),
      { method: 'POST', body: JSON.stringify({ node_id: pipewireNodeId, volume }) },
    ),

  setMute: (pipewireNodeId: number, mute: boolean, nodeId?: string | null) =>
    fetchJson<{ success: boolean; node_id: number; mute: boolean }>(
      appendNodeQuery(`${API_BASE}/pipewire/mute`, nodeId),
      { method: 'POST', body: JSON.stringify({ node_id: pipewireNodeId, mute }) },
    ),
}

export const engineApi = {
  getStatus: () =>
    fetchJson<import('../types').EngineStatus>(`${API_BASE}/engine/status`),

  getVersion: () =>
    fetchJson<import('../types').EngineVersion>(`${API_BASE}/engine/version`),

  initialize: (config: { sample_rate?: number; buffer_size?: number; audio_device?: string; enable_midi?: boolean }) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/engine/initialize`, {
      method: 'POST', body: JSON.stringify(config),
    }),

  shutdown: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/shutdown`, { method: 'POST' }),

  startAudio: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/audio/start`, { method: 'POST' }),

  stopAudio: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/audio/stop`, { method: 'POST' }),

  getPlugins: () =>
    fetchJson<{ plugins: unknown[] }>(`${API_BASE}/engine/plugins`),

  loadPlugin: (uri: string) =>
    fetchJson<{ success: boolean; instance_id: number }>(`${API_BASE}/engine/plugins`, {
      method: 'POST', body: JSON.stringify({ uri }),
    }),

  removePlugin: (instanceId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/plugins/${instanceId}`, { method: 'DELETE' }),

  setParameter: (instanceId: number, paramName: string, value: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/parameter`, {
      method: 'POST', body: JSON.stringify({ instance_id: instanceId, param_name: paramName, value }),
    }),

  setBypass: (instanceId: number, bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/bypass`, {
      method: 'POST', body: JSON.stringify({ instance_id: instanceId, bypass }),
    }),

  getVU: () =>
    fetchJson<{ input: number[]; output: number[] }>(`${API_BASE}/engine/vu`),
}
