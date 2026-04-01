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
}

export default maschineApi
