import type * as Api from '../api'
import type {
  AudioLevels,
  AudioSourceTruthPayload,
  AudioStatus,
  PluginLevels,
} from '../types'
import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'

export const audioApi = {
  getStatus: (nodeId?: string | null) => fetchJson<AudioStatus>(appendNodeQuery(`${API_BASE}/audio/status`, nodeId)),

  start: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/start`, nodeId), { method: 'POST' }),

  stop: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/stop`, nodeId), { method: 'POST' }),

  getLatency: (nodeId?: string | null) => fetchJson<{ latency_ms: number }>(appendNodeQuery(`${API_BASE}/audio/latency`, nodeId)),

  getLevels: () => fetchJson<AudioLevels>(`${API_BASE}/audio/levels`),

  getPluginLevels: () => fetchJson<{ plugins: PluginLevels[] }>(`${API_BASE}/audio/levels/plugins`),

  getPipedalMetrics: () => fetchJson<Record<string, unknown>>(`${API_BASE}/audio/pipedal`),

  getSourceOfTruth: (nodeId?: string | null) =>
    fetchJson<AudioSourceTruthPayload>(appendNodeQuery(`${API_BASE}/audio/source-of-truth`, nodeId)),

  configure: (config: { sampleRate?: number; bufferSize?: number }, nodeId?: string | null) => {
    const params = new URLSearchParams()
    if (config.sampleRate) params.append('sample_rate', config.sampleRate.toString())
    if (config.bufferSize) params.append('buffer_size', config.bufferSize.toString())
    return fetchJson<{
      success: boolean
      message: string
      updated_settings: Record<string, number>
      current_config: { sample_rate: number; buffer_size: number; cpu_load: number }
    }>(appendNodeQuery(`${API_BASE}/audio/config?${params.toString()}`, nodeId), { method: 'POST' })
  },

  restart: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/restart`, nodeId), { method: 'POST' }),

  getHealth: (nodeId?: string | null) => fetchJson<Api.AudioHealth>(appendNodeQuery(`${API_BASE}/audio/health`, nodeId)),

  getXruns: (nodeId?: string | null) => fetchJson<Api.XrunStats>(appendNodeQuery(`${API_BASE}/audio/health/xruns`, nodeId)),

  getSignalStatus: () => fetchJson<Api.SignalStatus>(`${API_BASE}/audio/health/signal`),

  getBufferPresets: (nodeId?: string | null) => fetchJson<Api.BufferPreset[]>(appendNodeQuery(`${API_BASE}/audio/buffer-presets`, nodeId)),

  getJuceMetrics: (nodeId?: string | null) => fetchJson<Api.JuceMetrics>(appendNodeQuery(`${API_BASE}/audio/juce`, nodeId)),

  unmute: (nodeId?: string | null) =>
    fetchJson<{ success: boolean }>(appendNodeQuery(`${API_BASE}/audio/health/unmute`, nodeId), { method: 'POST' }),

  getPorts: () => fetchJson<Api.AudioPortsResponse>(`${API_BASE}/audio/ports`),

  getRouting: () => fetchJson<Api.AudioRoutingResponse>(`${API_BASE}/audio/routing`),

  setRouting: (config: {
    inputPorts?: number[]
    outputPorts?: number[]
    inputAvbEndpoints?: string[]
    outputAvbEndpoints?: string[]
  }) => {
    const params = new URLSearchParams()
    if (config.inputPorts) {
      config.inputPorts.forEach((port) => params.append('input_ports', port.toString()))
    }
    if (config.outputPorts) {
      config.outputPorts.forEach((port) => params.append('output_ports', port.toString()))
    }
    if (config.inputAvbEndpoints) {
      config.inputAvbEndpoints.forEach((endpointId) => params.append('input_avb_endpoints', endpointId))
    }
    if (config.outputAvbEndpoints) {
      config.outputAvbEndpoints.forEach((endpointId) => params.append('output_avb_endpoints', endpointId))
    }
    return fetchJson<Api.AudioRoutingUpdateResponse>(`${API_BASE}/audio/routing?${params.toString()}`, {
      method: 'POST',
    })
  },

  getPortPresets: () => fetchJson<Api.AudioPortPresetsResponse>(`${API_BASE}/audio/ports/presets`),

  getChainRouting: (chainId: number) =>
    fetchJson<Api.ChainRoutingResponse>(`${API_BASE}/audio/routing/chain/${chainId}`),

  setChainRouting: (chainId: number, config: {
    inputPorts?: number[]
    outputPorts?: number[]
    inputAvbEndpoints?: string[]
    outputAvbEndpoints?: string[]
  }) => {
    const params = new URLSearchParams()
    if (config.inputPorts) {
      config.inputPorts.forEach((port) => params.append('input_ports', port.toString()))
    }
    if (config.outputPorts) {
      config.outputPorts.forEach((port) => params.append('output_ports', port.toString()))
    }
    if (config.inputAvbEndpoints) {
      config.inputAvbEndpoints.forEach((endpointId) => params.append('input_avb_endpoints', endpointId))
    }
    if (config.outputAvbEndpoints) {
      config.outputAvbEndpoints.forEach((endpointId) => params.append('output_avb_endpoints', endpointId))
    }
    return fetchJson<Api.ChainRoutingUpdateResponse>(`${API_BASE}/audio/routing/chain/${chainId}?${params.toString()}`, {
      method: 'POST',
    })
  },

  clearChainRouting: (chainId: number) =>
    fetchJson<{
      success: boolean
      message: string
      chain_id: number
      input_ports: number[]
      output_ports: number[]
      input_avb_endpoints: string[]
      output_avb_endpoints: string[]
      input_bindings: Api.AudioRoutingSelectionBinding[]
      output_bindings: Api.AudioRoutingSelectionBinding[]
      is_override: boolean
    }>(`${API_BASE}/audio/routing/chain/${chainId}`, { method: 'DELETE' }),
}

export const diagnosticsApi = {
  runLoopbackTest: (nodeId?: string | null) =>
    fetchJson<Api.DiagnosticResult>(appendNodeQuery(`${API_BASE}/audio/test`, nodeId), { method: 'POST' }),

  getAlsaInfo: (nodeId?: string | null) => fetchJson<Api.AlsaDeviceInfo>(appendNodeQuery(`${API_BASE}/audio/alsa/info`, nodeId)),

  resetAlsaState: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/alsa/reset`, nodeId), { method: 'POST' }),

  getUsbDevices: (nodeId?: string | null) => fetchJson<Api.UsbDevice[]>(appendNodeQuery(`${API_BASE}/usb/devices/list`, nodeId)),

  resetUsbDevice: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/usb/reset/${deviceId}`, nodeId), { method: 'POST' }),

  runFullDiagnostic: (nodeId?: string | null) =>
    fetchJson<Api.FullDiagnosticResult>(appendNodeQuery(`${API_BASE}/audio/diagnostics/full`, nodeId), { method: 'POST' }),

  clearXruns: (nodeId?: string | null) =>
    fetchJson<{ success: boolean }>(appendNodeQuery(`${API_BASE}/audio/health/xruns/clear`, nodeId), { method: 'POST' }),

  testSampleRate: (rate: number, nodeId?: string | null) =>
    fetchJson<Api.DiagnosticResult>(appendNodeQuery(`${API_BASE}/audio/test/sample-rate?rate=${rate}`, nodeId), { method: 'POST' }),

  testBufferStability: (bufferSize: number, duration: number, nodeId?: string | null) =>
    fetchJson<Api.BufferStabilityResult>(
      appendNodeQuery(`${API_BASE}/audio/test/buffer-stability?buffer_size=${bufferSize}&duration=${duration}`, nodeId),
      { method: 'POST' },
    ),
}

export const usbApi = {
  getPrimaryHotoneDevice: () =>
    fetchJson<{
      name: string
      model?: string
      alsa_card?: string
      alsa_device?: string
      channels_in?: number
      channels_out?: number
    }>(`${API_BASE}/usb/hotone/primary`),

  getDevices: () =>
    fetchJson<{
      hotone_detected: boolean
      device_count: number
      primary_device?: {
        name: string
        vendor_id?: string
        product_id?: string
        model?: string
        bus?: string
        device?: string
        usb_speed?: string
        power_control?: string
        autosuspend_delay_ms?: number
        alsa_card?: string
        alsa_device?: string
        is_autosuspend_disabled?: boolean
      } | null
      all_devices: Array<{
        name: string
        model?: string
        bus?: string
        device?: string
        alsa_device?: string
        power_control?: string
      }>
      recommendations: string[]
    }>(`${API_BASE}/usb/devices`),
}
