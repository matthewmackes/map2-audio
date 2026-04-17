import { fetchJson } from '../http'
import { API_BASE } from '../transport'
import type {
  MaschineAudioGridProjection,
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
  MaschineLcdBitmap,
} from '../types'

const MASCHINE_API_BASE = `${API_BASE}/maschine`

export interface MaschineStatusResponse {
  status: string
  state: MaschineDaemonStatus
}

export interface MaschineEncoderMapResponse {
  status: string
  encoder_map: MaschineEncoderMap
}

export interface MaschineLcdRenderResponse {
  status: string
  render: {
    context: 'audio_grid' | 'stats'
    left: MaschineLcdBitmap
    right: MaschineLcdBitmap
    meta?: Record<string, unknown>
  }
  lcd: {
    left: MaschineLcdBitmap
    right: MaschineLcdBitmap
  }
}

export interface MaschineAudioGridResponse {
  status: string
  audio_grid: MaschineAudioGridProjection
}

export interface MaschineWebSocketWelcome {
  state: MaschineDaemonStatus
  encoder_map: MaschineEncoderMap
  audio_grid: MaschineAudioGridProjection
  hid_history: MaschineHidEvent[]
}

export interface MaschineTransportConfig {
  transport_preference: 'auto' | 'hidapi' | 'pyusb-bulk' | 'usb-bulk'
  allow_kernel_detach: boolean
  applies_on: string
}

export interface MaschineHwTestRequest {
  test: 'led_walk' | 'led_all_on' | 'led_all_off' | 'lcd_checkerboard' | 'lcd_gradient' | 'lcd_clear' | 'pad_readback'
  params?: Record<string, unknown>
}

export interface MaschineHwTestResponse {
  status: string
  test: string
  result: Record<string, unknown>
}

export interface PadMidiMapping {
  note: number
  message_type: 'note' | 'cc' | 'program_change'
  velocity_curve: 'linear' | 'log' | 'exp'
  label: string
}

export interface ButtonMidiMapping {
  number: number
  message_type: 'note' | 'cc' | 'program_change'
  label: string
}

export interface EncoderMidiMapping {
  cc: number
  mode: 'relative' | 'absolute'
  label: string
}

export interface MaschineMidiMap {
  channel: number
  pads: PadMidiMapping[]
  buttons: Record<string, ButtonMidiMapping>
  encoders: EncoderMidiMapping[]
  button_labels: Record<string, string>
  button_zones: Record<string, string>
  button_led_slots: Record<string, number>
  encoder_labels: string[]
  pad_labels: string[]
}

export interface MaschineMidiMapResponse {
  status: string
  midi_map: MaschineMidiMap
}

export interface MaschineTransportConfigResponse {
  status: string
  config: MaschineTransportConfig
  state?: MaschineDaemonStatus
  note?: string
}

export const maschineApi = {
  getStatus: () =>
    fetchJson<MaschineStatusResponse>(`${MASCHINE_API_BASE}/status`, { cache: 'no-store' }),

  getEncoderMap: () =>
    fetchJson<MaschineEncoderMapResponse>(`${MASCHINE_API_BASE}/encoder-map`, { cache: 'no-store' }),

  renderLcd: (context: 'audio_grid' | 'stats' = 'audio_grid', focusMetric?: string | null) => {
    const query = new URLSearchParams({ context })
    if (focusMetric) {
      query.set('focus_metric', focusMetric)
    }
    return fetchJson<MaschineLcdRenderResponse>(`${MASCHINE_API_BASE}/lcd/render?${query.toString()}`, {
      cache: 'no-store',
    })
  },

  getAudioGrid: () =>
    fetchJson<MaschineAudioGridResponse>(`${MASCHINE_API_BASE}/audio-grid`, { cache: 'no-store' }),

  getTransportConfig: () =>
    fetchJson<MaschineTransportConfigResponse>(`${MASCHINE_API_BASE}/transport-config`, { cache: 'no-store' }),

  updateTransportConfig: (payload: Partial<Pick<MaschineTransportConfig, 'transport_preference' | 'allow_kernel_detach'>>) =>
    fetchJson<MaschineTransportConfigResponse>(`${MASCHINE_API_BASE}/transport-config`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  runHwTest: (request: MaschineHwTestRequest) =>
    fetchJson<MaschineHwTestResponse>(`${MASCHINE_API_BASE}/hw-test`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  getMidiMap: () =>
    fetchJson<MaschineMidiMapResponse>(`${MASCHINE_API_BASE}/midi-map`, { cache: 'no-store' }),

  updateMidiMap: (payload: {
    channel: number
    pads: PadMidiMapping[]
    buttons: Record<string, ButtonMidiMapping>
    encoders: EncoderMidiMapping[]
  }) =>
    fetchJson<MaschineMidiMapResponse>(`${MASCHINE_API_BASE}/midi-map`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  resetMidiMap: () =>
    fetchJson<MaschineMidiMapResponse>(`${MASCHINE_API_BASE}/midi-map/reset`, {
      method: 'POST',
    }),

  testMidiElement: (payload: { element_type: 'pad' | 'button' | 'encoder'; index: number; brightness?: number }) =>
    fetchJson<MaschineHwTestResponse>(`${MASCHINE_API_BASE}/midi-map/test`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  setLed: (slot: number, brightness: number) =>
    fetchJson<MaschineHwTestResponse>(`${MASCHINE_API_BASE}/led/set`, {
      method: 'POST',
      body: JSON.stringify({ slot, brightness }),
    }),
}

export default maschineApi
