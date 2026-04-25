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
    profile_id?: string
    profile_name?: string
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

export interface MaschineAdminConsoleAction {
  action_id: string
  label: string
  detail: string
  tier?: string
  kind?: string
  is_selected: boolean
  is_active: boolean
}

export interface MaschineAdminConsoleSnapshot {
  session_unlocked: boolean
  selected_action_id: string | null
  selected_action_index: number
  selected_action_label: string
  selected_action_detail: string
  confirmation_progress: number
  confirmation_required: number
  busy: boolean
  active_action_id: string | null
  active_action_started_at: string | null
  last_result: Record<string, unknown>
  actions: MaschineAdminConsoleAction[]
  updated_at: string
}

export interface MaschineAdminConsoleResponse {
  status: string
  admin_console: MaschineAdminConsoleSnapshot
}

export interface MaschineIncidentLogEntry {
  timestamp: string
  severity: 'info' | 'warn' | 'error' | 'critical'
  source: string
  message: string
  detail?: string
  event?: string
  context?: Record<string, unknown>
}

export interface MaschineIncidentLogResponse {
  status: string
  entries: MaschineIncidentLogEntry[]
  limit: number
}

export interface MaschinePlatformEventOverlay {
  active: boolean
  event_id?: string | null
  severity?: string
  mode?: string
  title?: string
  message?: string
  pads?: unknown[]
  lcd?: { left: MaschineLcdBitmap; right: MaschineLcdBitmap }
  updated_at?: string | null
  expires_at?: string | null
}

export interface MaschinePlatformEventOverlayResponse {
  status: string
  overlay: MaschinePlatformEventOverlay
}

export const maschineApi = {
  getStatus: () =>
    fetchJson<MaschineStatusResponse>(`${MASCHINE_API_BASE}/status`, { cache: 'no-store' }),

  getEncoderMap: () =>
    fetchJson<MaschineEncoderMapResponse>(`${MASCHINE_API_BASE}/encoder-map`, { cache: 'no-store' }),

  renderLcd: (
    context: 'audio_grid' | 'stats' = 'audio_grid',
    focusMetric?: string | null,
    profileId?: string | null,
  ) => {
    const query = new URLSearchParams({ context })
    if (focusMetric) {
      query.set('focus_metric', focusMetric)
    }
    if (profileId) {
      query.set('profile_id', profileId)
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

  getAdminConsole: () =>
    fetchJson<MaschineAdminConsoleResponse>(`${MASCHINE_API_BASE}/admin-console`, { cache: 'no-store' }),

  unlockAdminConsole: () =>
    fetchJson<MaschineAdminConsoleResponse>(`${MASCHINE_API_BASE}/admin-console/unlock`, { method: 'POST' }),

  lockAdminConsole: () =>
    fetchJson<MaschineAdminConsoleResponse>(`${MASCHINE_API_BASE}/admin-console/lock`, { method: 'POST' }),

  selectAdminConsoleAction: (delta: number) =>
    fetchJson<MaschineAdminConsoleResponse>(`${MASCHINE_API_BASE}/admin-console/select`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }),

  confirmAdminConsoleAction: () =>
    fetchJson<MaschineAdminConsoleResponse>(`${MASCHINE_API_BASE}/admin-console/confirm`, { method: 'POST' }),

  cancelAdminConsoleAction: () =>
    fetchJson<MaschineAdminConsoleResponse>(`${MASCHINE_API_BASE}/admin-console/cancel`, { method: 'POST' }),

  getIncidentLog: (limit = 50) =>
    fetchJson<MaschineIncidentLogResponse>(`${MASCHINE_API_BASE}/incident-log?limit=${limit}`, { cache: 'no-store' }),

  getPlatformEventOverlay: () =>
    fetchJson<MaschinePlatformEventOverlayResponse>(`${MASCHINE_API_BASE}/platform-event-overlay`, { cache: 'no-store' }),

  clearPlatformEventOverlay: () =>
    fetchJson<MaschinePlatformEventOverlayResponse>(`${MASCHINE_API_BASE}/platform-event-overlay/clear`, { method: 'POST' }),

  selectAudioGridBlock: (blockId: string) =>
    fetchJson<MaschineAudioGridResponse>(`${MASCHINE_API_BASE}/audio-grid/select`, {
      method: 'POST',
      body: JSON.stringify({ block_id: blockId }),
    }),

  toggleAudioGridBlockBypass: (blockId: string) =>
    fetchJson<MaschineAudioGridResponse>(`${MASCHINE_API_BASE}/audio-grid/bypass`, {
      method: 'POST',
      body: JSON.stringify({ block_id: blockId }),
    }),
}

export default maschineApi
