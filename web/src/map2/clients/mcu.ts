import { fetchJson } from '../http'
import { API_BASE } from '../transport'

const MCU_API_BASE = `${API_BASE}/mcu`

export interface McuStatusPort {
  port_id: string
  name: string
  direction: string
}

export interface McuDaemonNotification {
  severity: string
  title: string
  subtitle: string
  emitted_at: string
}

export interface McuDaemonStatus {
  enabled: boolean
  state: string
  available: boolean
  poll_interval_s: number
  last_checked_at: string | null
  last_seen_at: string | null
  last_repush_at: string | null
  last_error: string | null
  reconnect_count: number
  matched_port_count: number
  last_destination_ports: string[]
  last_transport_owner: string | null
  notification: McuDaemonNotification | null
}

export interface McuStatusState {
  connected: boolean
  matched_ports: McuStatusPort[]
  matched_port_count: number
  identity: Record<string, unknown> | null
  recent_event_count: number
  last_event: Record<string, unknown> | null
  daemon_status: McuDaemonStatus | null
}

export interface McuStatusResponse {
  status: string
  state: McuStatusState
}

export interface McuChannelStrip {
  slot_index: number
  assigned: boolean
  focused?: boolean
  scribble_label: string
  parameter_index?: number
  name?: string
  symbol?: string
  value?: number
  normalized_value?: number
  min?: number
  max?: number
}

export interface McuProjectionBank {
  bank_index: number
  page_index: number
  page_count: number
  group_id: string
  group_label: string
  title: string
  parameters: Array<Record<string, unknown>>
}

export interface McuProjectionResponse {
  status: string
  projection: {
    selected_plugin: {
      block_id: string
      plugin_name: string
      plugin_uri: string
      plugin_position?: number | null
      snapshot_chain_id?: number | null
      bank_group?: string | null
    } | null
    bank_index: number
    bank_count: number
    focused_strip_index?: number
    banks: McuProjectionBank[]
    active_bank: McuProjectionBank | null
    scribble_labels: string[]
    channel_strips: McuChannelStrip[]
    audio_grid?: {
      selected_block_id?: string | null
      blocks?: Array<Record<string, unknown>>
      snapshot_id?: number | null
    }
  }
  transport: {
    active_owner: string | null
    owners: Array<Record<string, unknown>>
  }
}

export interface McuEventResponse {
  status: string
  result: Record<string, unknown>
}

export const mcuApi = {
  getStatus: () => fetchJson<McuStatusResponse>(`${MCU_API_BASE}/status`, { cache: 'no-store' }),
  getProjection: () => fetchJson<McuProjectionResponse>(`${MCU_API_BASE}/projection`, { cache: 'no-store' }),
  dispatchEvent: (event: Record<string, unknown>, destinationPort?: string | null) =>
    fetchJson<McuEventResponse>(`${MCU_API_BASE}/event`, {
      method: 'POST',
      body: JSON.stringify({
        event,
        ...(destinationPort ? { destination_port: destinationPort } : {}),
      }),
    }),
}

export default mcuApi
