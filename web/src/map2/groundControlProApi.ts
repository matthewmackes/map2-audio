import { API_BASE } from './transport'

const GROUND_CONTROL_PRO_API_BASE = `${API_BASE}/ground-control-pro`

export interface GroundControlValidationReport {
  total_payload_size: number
  exact_size_ok: boolean
  preamble_ok: boolean
  terminator_ok: boolean
  offsets_ok: boolean
  field_ranges_ok: boolean
  unknown_bytes_preserved: boolean
  round_trip_identity: boolean
  unknown_byte_count: number
  errors: string[]
  warnings: string[]
  changed_offsets: number[]
}

export interface GroundControlDeviceConfig {
  name: string
  midi_channel: number
  program_offset_mode: number
  definition_raw: number
  confidence: string
}

export interface GroundControlPedalConfig {
  exists: number
  confidence: string
}

export interface GroundControlGCXConfig {
  num_gcx: number
  vca_exists: number
  switch_types: number[]
  confidence: string
}

export interface GroundControlMidiSettings {
  soft_options_raw: number
  global_program: boolean
  link_mode: number
  respond_to_program_change: boolean
  program_change_receive_channel: number
  confidence: string
}

export interface GroundControlInstantAccessDefinition {
  function: number
  detail: number
  transmit_cc: number
  switch_type: number
  confidence: string
}

export interface GroundControlUtilitySettings {
  directory_speed: number
  program_access_mode: number
  extended_memory_raw: number
  confidence: string
}

export interface GroundControlGlobalConfiguration {
  devices: GroundControlDeviceConfig[]
  pedals: GroundControlPedalConfig[]
  gcx: GroundControlGCXConfig
  midi: GroundControlMidiSettings
  instant_access: GroundControlInstantAccessDefinition[]
  utility: GroundControlUtilitySettings
}

export interface GroundControlPresetDeviceProgramChange {
  enabled: number
  program: number
  confidence: string
}

export interface GroundControlPreset {
  index: number
  name: string
  device_program_changes: GroundControlPresetDeviceProgramChange[]
  device_program_banks_raw: number[]
  pedal_definitions: number[]
  pedal_device_assignments: number[]
  gcx_loop_states: number[]
  gcx_toggles: number[]
  instant_access_state: number[]
  confidence: string
}

export interface GroundControlModel {
  profile_id: string
  global_config: GroundControlGlobalConfiguration
  presets: GroundControlPreset[]
}

export interface GroundControlArtifact {
  artifact_id: string
  kind: string
  path: string
  size_bytes: number
  sha256: string
  created_at: string
  metadata: Record<string, unknown>
  content_preview?: string
}

export interface GroundControlSessionResponse {
  session_id: string
  source_name: string
  profile_id: string
  created_at: string
  updated_at: string
  model: GroundControlModel
  validation: GroundControlValidationReport
  summary: {
    preset_count: number
    unknown_byte_count: number
    source_artifact_id?: string
    compiled_artifact_id?: string | null
    backup_artifact_id?: string | null
  }
  artifacts: GroundControlArtifact[]
}

export interface GroundControlPortsResponse {
  rtmidi_available: boolean
  inputs: Array<{ index: number; name: string; connected: boolean }>
  outputs: Array<{ index: number; name: string; connected: boolean }>
  recommended_input_index?: number | null
  recommended_output_index?: number | null
}

export interface GroundControlFieldMapResponse {
  profile_id: string
  schema_version: string
  source_documents: Array<{ title: string; url: string; notes?: string }>
  templates: Array<Record<string, unknown>>
  unknown_byte_count: number
  expanded_count: number
}

export interface GroundControlJobResponse {
  job_id: string
  job_type: string
  status: string
  progress: number
  created_at: string
  updated_at: string
  result: Record<string, unknown>
  error?: string | null
}

export interface GroundControlDiffResponse {
  left_label: string
  right_label: string
  changed_count: number
  changes: Array<{
    offset: number
    left: number
    right: number
    labels: string[]
  }>
}

function getErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'detail' in payload && typeof payload.detail === 'string') {
    return payload.detail
  }
  return 'Ground Control Pro request failed'
}

async function fetchGroundControlJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${GROUND_CONTROL_PRO_API_BASE}${path}`, options)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(getErrorMessage(payload))
  }
  return payload as T
}

export const groundControlProApi = {
  getPorts(): Promise<GroundControlPortsResponse> {
    return fetchGroundControlJson<GroundControlPortsResponse>('/ports')
  },

  getFieldMap(): Promise<GroundControlFieldMapResponse> {
    return fetchGroundControlJson<GroundControlFieldMapResponse>('/field-map')
  },

  importDump(file: File): Promise<GroundControlSessionResponse> {
    const formData = new FormData()
    formData.append('file', file)
    return fetchGroundControlJson<GroundControlSessionResponse>('/import', {
      method: 'POST',
      body: formData,
    })
  },

  getSession(sessionId: string): Promise<GroundControlSessionResponse> {
    return fetchGroundControlJson<GroundControlSessionResponse>(`/sessions/${encodeURIComponent(sessionId)}`)
  },

  compileSession(sessionId: string, model: GroundControlModel): Promise<{
    session_id: string
    artifact: GroundControlArtifact
    validation: GroundControlValidationReport
    model: GroundControlModel
  }> {
    return fetchGroundControlJson('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, model }),
    })
  },

  exportJson(sessionId: string, model?: GroundControlModel): Promise<{ artifact: GroundControlArtifact; json: GroundControlModel }> {
    return fetchGroundControlJson('/export/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model ? { session_id: sessionId, model } : { session_id: sessionId }),
    })
  },

  exportYaml(sessionId: string, model?: GroundControlModel): Promise<{ artifact: GroundControlArtifact; yaml: string }> {
    return fetchGroundControlJson('/export/yaml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model ? { session_id: sessionId, model } : { session_id: sessionId }),
    })
  },

  backup(options: Record<string, unknown>): Promise<GroundControlJobResponse> {
    return fetchGroundControlJson('/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  },

  push(options: Record<string, unknown>): Promise<GroundControlJobResponse> {
    return fetchGroundControlJson('/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  },

  redumpVerify(options: Record<string, unknown>): Promise<GroundControlJobResponse> {
    return fetchGroundControlJson('/redump-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  },

  diff(options: Record<string, unknown>): Promise<GroundControlDiffResponse> {
    return fetchGroundControlJson('/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  },

  getJob(jobId: string): Promise<GroundControlJobResponse> {
    return fetchGroundControlJson(`/jobs/${encodeURIComponent(jobId)}`)
  },

  getArtifact(artifactId: string): Promise<GroundControlArtifact> {
    return fetchGroundControlJson(`/artifacts/${encodeURIComponent(artifactId)}`)
  },
}

export default groundControlProApi
