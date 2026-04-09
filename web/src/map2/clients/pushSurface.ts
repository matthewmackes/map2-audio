import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'

const PUSH_SURFACE_API_BASE = `${API_BASE}/push-surface`

export interface PushSurfaceAssignment {
  id: string
  control_id: string
  control_label?: string
  interaction: string
  assignment_type: string
  label: string
  device_scope?: string
  cluster_scope?: string | null
  enabled?: boolean
  safe_mode_confirm?: boolean
  payload?: Record<string, unknown>
  is_example?: boolean
}

export interface PushSurfaceWelcomeLight {
  color?: string
  pulse?: boolean
  blink?: boolean
}

export interface PushSurfaceDisplayFrame {
  title?: string
  lines?: string[]
}

export interface PushSurfaceWelcomeStep {
  id: string
  duration_ms: number
  pad_lights?: Record<string, PushSurfaceWelcomeLight>
  button_lights?: Record<string, PushSurfaceWelcomeLight>
  display?: PushSurfaceDisplayFrame
}

export interface PushSurfaceWelcomeRoutine {
  id: string
  name: string
  description?: string
  category?: string
  is_example?: boolean
  run_on_connect?: boolean
  duration_ms?: number
  handoff_page?: string
  steps: PushSurfaceWelcomeStep[]
}

export interface PushSurfaceWelcomeRuntimeFrame {
  pad_lights?: Record<string, PushSurfaceWelcomeLight>
  button_lights?: Record<string, PushSurfaceWelcomeLight>
  display?: PushSurfaceDisplayFrame | null
}

export interface PushSurfaceWelcomeRuntime {
  active: boolean
  routine_id: string
  routine_name?: string
  handoff_page?: string
  step_index: number
  step_id: string
  total_steps: number
  started_at?: number
  frame?: PushSurfaceWelcomeRuntimeFrame | null
}

export interface PushSurfaceLabsEditorState {
  schema_version: number
  assignments: PushSurfaceAssignment[]
  welcome_routines: PushSurfaceWelcomeRoutine[]
  selected_welcome_routine_id: string
}

export interface PushSurfaceProfileSummary {
  profile_id?: string
  display_name?: string
  capabilities?: Record<string, unknown>
}

export interface PushSurfaceActiveDevice {
  device_id?: string
  input_port_name?: string
  output_port_name?: string
  profile?: PushSurfaceProfileSummary
}

export interface PushSurfacePresetSummary {
  id: string
  name: string
  is_active?: boolean
  selected?: boolean
}

export interface PushSurfacePendingConfirmation {
  action_id: string
  action_type: string
  reason: string
  device_fingerprint: string
  device_identity: string
  target_instance_id: string
  target_display_name: string
  target_node_id: string
  target_node_label: string
  created_at: number
  expires_at: number
  timeout_ms: number
  accept_command: string
  reject_command: string
}

export interface PushSurfacePendingConfirmationResponse {
  status: string
  pending_confirmation: PushSurfacePendingConfirmation | null
  pending_count: number
}

export interface PushSurfaceRuntimeSnapshot {
  running: boolean
  active_page: string
  welcome_runtime?: PushSurfaceWelcomeRuntime | null
  state: {
    active_page?: string
    presets?: PushSurfacePresetSummary[]
    selected_preset_id?: string | null
    selected_chain_id?: string | null
    selected_node_id?: string | null
    diagnostics?: Record<string, unknown>
  }
}

export interface PushSurfaceLabsEditorStateResponse {
  status: string
  editor_state: PushSurfaceLabsEditorState
  quick_assignments: PushSurfaceAssignment[]
  selected_welcome_routine: PushSurfaceWelcomeRoutine | null
  active_device: PushSurfaceActiveDevice | null
  manager_running: boolean
}

export const pushSurfaceApi = {
  getLabsEditorState: (nodeId?: string | null) =>
    fetchJson<PushSurfaceLabsEditorStateResponse>(
      appendNodeQuery(`${PUSH_SURFACE_API_BASE}/labs/editor-state`, nodeId),
      { cache: 'no-store' },
    ),

  saveLabsEditorState: (editorState: PushSurfaceLabsEditorState, nodeId?: string | null) =>
    fetchJson<PushSurfaceLabsEditorStateResponse>(
      appendNodeQuery(`${PUSH_SURFACE_API_BASE}/labs/editor-state`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ editor_state: editorState }),
      },
    ),

  getState: (nodeId?: string | null) =>
    fetchJson<{ status: string; snapshot: PushSurfaceRuntimeSnapshot }>(
      appendNodeQuery(`${PUSH_SURFACE_API_BASE}/state`, nodeId),
      { cache: 'no-store' },
    ),

  getPendingConfirmation: (nodeId?: string | null) =>
    fetchJson<PushSurfacePendingConfirmationResponse>(
      appendNodeQuery(`${PUSH_SURFACE_API_BASE}/pending-confirmation`, nodeId),
      { cache: 'no-store' },
    ),
}

export default pushSurfaceApi
