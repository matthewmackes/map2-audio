/**
 * T2482 loop 11 / iter 102 — canonical MIDI Bindings authority client.
 *
 * Wraps the 8 endpoints exposed by `app/services/midi/routes.py`:
 *   GET    /api/midi/bindings/count
 *   GET    /api/midi/bindings  (filter-required: 400 if no filter)
 *   GET    /api/midi/bindings/{id}
 *   POST   /api/midi/bindings
 *   PATCH  /api/midi/bindings/{id}
 *   DELETE /api/midi/bindings/{id}
 *   POST   /api/midi/bindings/{id}/enable
 *   POST   /api/midi/bindings/{id}/disable
 *
 * Types mirror `app/services/midi/schemas.py`. Updates to that file
 * MUST be reflected here in the same commit (Pydantic schema is the
 * authoritative shape; this is a mechanical port).
 */

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

// ---------- Constrained vocabularies (mirror app/services/midi/schemas.py) ----------

export type BindingConsumerType =
  | 'snapshot'
  | 'brain_slot'
  | 'plugin_param'
  | 'global_param'
  | 'performance_preset'
  | 'device_pack'
  | 'transport'
  | 'tesira_ttp'
  | 'gpio'
  | 'macro'

export type BindingSourceType =
  | 'midi_cc'
  | 'midi_note'
  | 'midi_pc'
  | 'midi_nrpn'
  | 'midi_sysex'
  | 'midi_clock'
  | 'midi_aftertouch'
  | 'midi_pitchbend'
  | 'midi_channel_pressure'
  | 'ttp_subscription'
  | 'gpio_input'
  | 'string_command'

export type BindingTargetType =
  | 'engine_param'
  | 'engine_command'
  | 'snapshot_action'
  | 'brain_slot'
  | 'device_command'
  | 'macro'
  | 'gpio_output'

export type BindingScope = 'global' | 'snapshot' | 'node' | 'cluster'

// ---------- Wire shapes ----------

export interface MidiBindingRead {
  binding_id: string
  consumer_type: BindingConsumerType
  consumer_id: string
  consumer_label: string
  source_type: BindingSourceType
  source_descriptor: Record<string, unknown>
  target_type: BindingTargetType
  target_descriptor: Record<string, unknown>
  device_id: string | null
  scope: BindingScope
  scope_id: string | null
  enabled: boolean
  source: string
  metadata: Record<string, unknown>
  created_at: string
  created_by: string
  modified_at: string
  modified_by: string
}

export interface MidiBindingCreate {
  consumer_type: BindingConsumerType
  consumer_id: string
  consumer_label?: string
  source_type: BindingSourceType
  source_descriptor?: Record<string, unknown>
  target_type: BindingTargetType
  target_descriptor?: Record<string, unknown>
  device_id?: string | null
  scope?: BindingScope
  scope_id?: string | null
  enabled?: boolean
  source?: string
  metadata?: Record<string, unknown>
  created_by?: string
}

export interface MidiBindingUpdate {
  consumer_label?: string
  source_descriptor?: Record<string, unknown>
  target_descriptor?: Record<string, unknown>
  device_id?: string | null
  scope?: BindingScope
  scope_id?: string | null
  enabled?: boolean
  source?: string
  metadata?: Record<string, unknown>
  modified_by?: string
}

// ---------- Filter shape (mirrors the GET /bindings query) ----------

export interface BindingListFilter {
  consumer_type?: BindingConsumerType
  consumer_id?: string  // wildcards: pass "*" to mean "any"
  device_id?: string
  scope?: BindingScope
  scope_id?: string
  enabled_only?: boolean
}

// ---------- Matrix shape (T2483-8 iter 162) ----------

export interface MatrixCell {
  count: number
  enabled_count: number
}

export interface BindingsMatrixResponse {
  matrix: Record<string, Record<string, MatrixCell>>
  total_bindings: number
}

// ---------- Live MIDI-learn shape (T2483-5 iter 174) ----------

export interface LastCcResponse {
  cc: number
  channel: number | null
  value: number
  observed_at: number
}

// ---------- Cluster matrix shape (T2484-1 iter 184) ----------

export interface ClusterPeerMatrix {
  node_id: string
  hostname: string
  matrix: Record<string, Record<string, MatrixCell>>
  total_bindings: number
  // T2484-4 iter 197 — peer health from NodeHealthService.
  // 'ok' | 'warn' | 'critical' | 'offline'.
  health: string
}

export interface ClusterBindingsMatrixResponse {
  local: BindingsMatrixResponse
  peers: ClusterPeerMatrix[]
  errors: Record<string, string>
}

// ---------- Client ----------

function buildListUrl(filter: BindingListFilter): string {
  const params = new URLSearchParams()
  if (filter.consumer_type !== undefined) params.set('consumer_type', filter.consumer_type)
  if (filter.consumer_id !== undefined) params.set('consumer_id', filter.consumer_id)
  if (filter.device_id !== undefined) params.set('device_id', filter.device_id)
  if (filter.scope !== undefined) params.set('scope', filter.scope)
  if (filter.scope_id !== undefined) params.set('scope_id', filter.scope_id)
  if (filter.enabled_only) params.set('enabled_only', 'true')
  return `${API_BASE}/midi/bindings?${params.toString()}`
}

export const midiBindingsApi = {
  count: () =>
    fetchJson<number>(`${API_BASE}/midi/bindings/count`, { cache: 'no-store' }),

  matrix: () =>
    fetchJson<BindingsMatrixResponse>(`${API_BASE}/midi/bindings/matrix`, { cache: 'no-store' }),

  // T2483-5 iter 174 — most-recently-observed CC for the
  // SourceDescriptorEditor Learn button.
  lastCc: () =>
    fetchJson<LastCcResponse | null>(
      `${API_BASE}/midi/bindings/learn/last-cc`,
      { cache: 'no-store' },
    ),

  // T2484-1 iter 184 — cluster-wide source × consumer matrix
  // aggregation; peers + per-peer error map.
  clusterMatrix: () =>
    fetchJson<ClusterBindingsMatrixResponse>(
      `${API_BASE}/midi/cluster/bindings/matrix`,
      { cache: 'no-store' },
    ),

  list: (filter: BindingListFilter) =>
    fetchJson<MidiBindingRead[]>(buildListUrl(filter), { cache: 'no-store' }),

  get: (bindingId: string) =>
    fetchJson<MidiBindingRead>(
      `${API_BASE}/midi/bindings/${encodeURIComponent(bindingId)}`,
      { cache: 'no-store' },
    ),

  create: (payload: MidiBindingCreate) =>
    fetchJson<MidiBindingRead>(`${API_BASE}/midi/bindings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (bindingId: string, patch: MidiBindingUpdate) =>
    fetchJson<MidiBindingRead>(
      `${API_BASE}/midi/bindings/${encodeURIComponent(bindingId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    ),

  delete: (bindingId: string) =>
    fetchJson<void>(
      `${API_BASE}/midi/bindings/${encodeURIComponent(bindingId)}`,
      { method: 'DELETE' },
    ),

  enable: (bindingId: string) =>
    fetchJson<MidiBindingRead>(
      `${API_BASE}/midi/bindings/${encodeURIComponent(bindingId)}/enable`,
      { method: 'POST' },
    ),

  disable: (bindingId: string) =>
    fetchJson<MidiBindingRead>(
      `${API_BASE}/midi/bindings/${encodeURIComponent(bindingId)}/disable`,
      { method: 'POST' },
    ),
}

// ---------- Vocab arrays (for UI dropdowns) ----------

export const BINDING_CONSUMER_TYPES: BindingConsumerType[] = [
  'snapshot',
  'brain_slot',
  'plugin_param',
  'global_param',
  'performance_preset',
  'device_pack',
  'transport',
  'tesira_ttp',
  'gpio',
  'macro',
]

export const BINDING_SOURCE_TYPES: BindingSourceType[] = [
  'midi_cc',
  'midi_note',
  'midi_pc',
  'midi_nrpn',
  'midi_sysex',
  'midi_clock',
  'midi_aftertouch',
  'midi_pitchbend',
  'midi_channel_pressure',
  'ttp_subscription',
  'gpio_input',
  'string_command',
]

export const BINDING_TARGET_TYPES: BindingTargetType[] = [
  'engine_param',
  'engine_command',
  'snapshot_action',
  'brain_slot',
  'device_command',
  'macro',
  'gpio_output',
]

export const BINDING_SCOPES: BindingScope[] = [
  'global',
  'snapshot',
  'node',
  'cluster',
]

export default midiBindingsApi
