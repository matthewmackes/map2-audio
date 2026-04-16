import { fetchJson } from '../http'
import { API_BASE } from '../transport'

const LAUNCH_CONTROL_API_BASE = `${API_BASE}/launch-control`

export interface LaunchControlStatusResponse {
  status: string
  state: {
    connected: boolean
    matched_ports: Array<{ port_id: string; name: string; direction: string; variant?: string }>
    matched_port_count: number
    template_state_by_port: Record<string, Record<string, unknown>>
    active_snapshot_mapping: Record<string, unknown> | null
    last_activation_push: Record<string, unknown> | null
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
      last_destination_ports: string[]
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

export interface LaunchControlProjectionControl {
  control_id: string
  control_type: string
  label: string
  channel?: number
  note?: number | null
  controller?: number | null
  effect_type?: string | null
  led_override?: string | Record<string, unknown> | null
  assignment?: Record<string, unknown>
  assignment_summary: string
}

export interface LaunchControlProjectionResponse {
  status: string
  projection: {
    snapshot: { id: number; name: string } | null
    controls: LaunchControlProjectionControl[]
    template_state_by_port: Record<string, Record<string, unknown>>
    active_snapshot_mapping: Record<string, unknown> | null
    last_activation_push: Record<string, unknown> | null
    detected_ports: Array<{ port_id: string; name: string; direction: string; variant?: string }>
  }
}

export type LaunchControlPatchMappingResponse = LaunchControlProjectionResponse

export const launchControlApi = {
  getStatus: () => fetchJson<LaunchControlStatusResponse>(`${LAUNCH_CONTROL_API_BASE}/status`, { cache: 'no-store' }),
  getProjection: () => fetchJson<LaunchControlProjectionResponse>(`${LAUNCH_CONTROL_API_BASE}/projection`, { cache: 'no-store' }),
  patchMapping: (controlId: string, patch: Record<string, unknown>) =>
    fetchJson<LaunchControlPatchMappingResponse>(`${LAUNCH_CONTROL_API_BASE}/mapping`, {
      method: 'POST',
      body: JSON.stringify({
        control_id: controlId,
        patch,
      }),
    }),
}

export default launchControlApi
