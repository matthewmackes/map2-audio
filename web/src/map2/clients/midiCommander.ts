import { fetchJson } from '../http'
import { API_BASE } from '../transport'

const MIDI_COMMANDER_API_BASE = `${API_BASE}/midi-commander`

export interface MidiCommanderProjectionControl {
  control_id: string
  control_type: string
  label: string
  message_type: string
  channel?: number
  controller?: number | null
  program?: number | null
  assignment?: Record<string, unknown>
  assignment_summary: string
}

export interface MidiCommanderStatusResponse {
  status: string
  state: {
    connected: boolean
    matched_ports: Array<{ port_id: string; name: string; direction: string; variant?: string }>
    matched_port_count: number
    active_snapshot_mapping: Record<string, unknown> | null
    last_activation_push: Record<string, unknown> | null
    active_profile: Record<string, unknown> | null
    current_bank: number
    expression_calibrations: Record<string, Record<string, unknown>>
    daemon_status: {
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
      notification: {
        severity: string
        title: string
        subtitle: string
        emitted_at: string
      } | null
    } | null
    recent_event_count: number
    last_event: Record<string, unknown> | null
  }
}

export interface MidiCommanderProjectionResponse {
  status: string
  projection: {
    snapshot: { id: number; name: string } | null
    controls: MidiCommanderProjectionControl[]
    active_snapshot_mapping: {
      snapshot_id: number
      snapshot_name: string
      mapping_count: number
      manual_setup?: {
        supported: boolean
        transport: string
        lines: string[]
      }
    } | null
    last_activation_push: Record<string, unknown> | null
    detected_ports: Array<{ port_id: string; name: string; direction: string; variant?: string }>
    active_profile: Record<string, unknown> | null
    current_bank: number
    expression_calibrations: Record<string, Record<string, unknown>>
  }
}

export interface MidiCommanderPatchMappingResponse extends MidiCommanderProjectionResponse {}

const midiCommanderApi = {
  getStatus: () => fetchJson<MidiCommanderStatusResponse>(`${MIDI_COMMANDER_API_BASE}/status`, { cache: 'no-store' }),
  getProjection: () => fetchJson<MidiCommanderProjectionResponse>(`${MIDI_COMMANDER_API_BASE}/projection`, { cache: 'no-store' }),
  patchMapping: (controlId: string, patch: Record<string, unknown>) =>
    fetchJson<MidiCommanderPatchMappingResponse>(`${MIDI_COMMANDER_API_BASE}/mapping`, {
      method: 'POST',
      body: JSON.stringify({
        control_id: controlId,
        patch,
      }),
    }),
}

export default midiCommanderApi
