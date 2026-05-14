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

// T2522-C cycle 6 — pressure-curve calibration. Mirror of
// app/services/maschine/calibration_store.default_pressure_curves().
export interface MaschinePadPressureCurve {
  /** 1..4 polynomial coefficients in ascending order (constant first).
   * The default is [0.0, 1.0] = linear identity y = x. */
  polynomial: number[]
}

export interface MaschinePressureCurves {
  /** Master compensation in [-1, 1] applied on top of per-pad curves. */
  global_compensation: number
  /** Exactly 16 entries — one per pad. */
  per_pad: MaschinePadPressureCurve[]
}

export interface MaschinePressureCurvesResponse {
  status: string
  usb_serial: string
  pressure_curves: MaschinePressureCurves
}

// T2522-C cycle 7 — performance patterns + scene bindings.
export interface MaschinePerformancePattern {
  /** Client-generated short id; the schema validator requires uniqueness. */
  id: string
  name: string
  /** 1..16 columns. */
  length: number
  /** 16 × length matrix. Each cell is 0 (empty), 1 (on), or 2 (accent). */
  steps: number[][]
  /** 0..7 mapping to group-button scene slots A-H (or null for unbound). */
  scene_slot: number | null
}

export interface MaschinePerformancePatternsBank {
  active_pattern_id: string | null
  patterns: MaschinePerformancePattern[]
}

export interface MaschinePerformancePatternsResponse {
  status: string
  usb_serial: string
  performance_patterns: MaschinePerformancePatternsBank
}

// T2522-D cycle 10 — LED choreography (per-pad idle + press colors).
export type MaschineLedColorName =
  | 'empty'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'magenta'
  | 'white'

export interface MaschineLedChoreographyEntry {
  idle_color: MaschineLedColorName
  press_color: MaschineLedColorName
}

export interface MaschineLedChoreography {
  /** Exactly 16 entries — one per pad. */
  per_pad: MaschineLedChoreographyEntry[]
}

export interface MaschineLedChoreographyResponse {
  status: string
  usb_serial: string
  led_choreography: MaschineLedChoreography
}

export const maschineApi = {
  getStatus: () =>
    fetchJson<MaschineStatusResponse>(`${MASCHINE_API_BASE}/status`, { cache: 'no-store' }),

  getEncoderMap: () =>
    fetchJson<MaschineEncoderMapResponse>(`${MASCHINE_API_BASE}/encoder-map`, { cache: 'no-store' }),

  // T2522-D cycle 9 — Mapping Studio writes encoder bindings here.
  // The route is POST (not PUT) because the existing daemon endpoint
  // is registered as POST /encoder-map.
  updateEncoderMap: (encoder_map: Record<string, unknown>) =>
    fetchJson<MaschineEncoderMapResponse>(`${MASCHINE_API_BASE}/encoder-map`, {
      method: 'POST',
      body: JSON.stringify({ encoder_map }),
    }),

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

  // T2522-C cycle 6 — pressure-curve calibration.
  getPressureCurves: () =>
    fetchJson<MaschinePressureCurvesResponse>(`${MASCHINE_API_BASE}/calibration/pressure-curves`, { cache: 'no-store' }),

  updatePressureCurves: (pressure_curves: MaschinePressureCurves) =>
    fetchJson<MaschinePressureCurvesResponse>(`${MASCHINE_API_BASE}/calibration/pressure-curves`, {
      method: 'PUT',
      body: JSON.stringify({ pressure_curves }),
    }),

  // T2522-C cycle 7 — performance patterns + scene bindings.
  getPerformancePatterns: () =>
    fetchJson<MaschinePerformancePatternsResponse>(`${MASCHINE_API_BASE}/performance/patterns`, { cache: 'no-store' }),

  updatePerformancePatterns: (bank: MaschinePerformancePatternsBank) =>
    fetchJson<MaschinePerformancePatternsResponse>(`${MASCHINE_API_BASE}/performance/patterns`, {
      method: 'PUT',
      body: JSON.stringify({ performance_patterns: bank }),
    }),

  // T2522-D cycle 10 — LED choreography (per-pad idle + press colors).
  getLedChoreography: () =>
    fetchJson<MaschineLedChoreographyResponse>(`${MASCHINE_API_BASE}/led-choreography`, { cache: 'no-store' }),

  updateLedChoreography: (choreography: MaschineLedChoreography) =>
    fetchJson<MaschineLedChoreographyResponse>(`${MASCHINE_API_BASE}/led-choreography`, {
      method: 'PUT',
      body: JSON.stringify({ led_choreography: choreography }),
    }),
}

export default maschineApi
