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

export interface PushSurfaceDrumSessionState {
  device_fingerprint: string
  selected_instance_id?: string | null
  bank_index: number
  pad_bank_index: number
  pad_velocity_mode_enabled: boolean
  pad_velocity_source_pad?: number | null
  repeat_enabled: boolean
  repeat_rate?: string | null
  quantize_enabled: boolean
  quantize_grid?: string | null
  quantize_strength: number
  fixed_length_enabled: boolean
  fixed_length_preset?: string | null
  step_grid_page: number
  selected_step_index?: number | null
  selected_step_instrument?: number | null
  loop_selector_enabled: boolean
  loop_selector_page: number
  loop_start_step?: number | null
  loop_end_step?: number | null
  last_command?: string | null
  pending_confirmation?: Record<string, unknown> | null
  last_confirmation_resolution?: Record<string, unknown> | null
}

export interface PushSurfacePadGridCell {
  physical_pad: number
  logical_pad: number
  velocity?: number | null
  velocity_mode_active?: boolean
  velocity_mode_source_pad?: number | null
  is_velocity_mode_source?: boolean
}

export interface PushSurfaceDrumSurfaceModes {
  pad_velocity_mode?: {
    enabled: boolean
    source_pad?: number | null
    velocity_levels: number[]
  }
  repeat?: {
    enabled: boolean
    rate?: string | null
    available_rates: string[]
  }
  quantize?: {
    enabled: boolean
    grid?: string | null
    strength: number
    available_grids: string[]
  }
  pad_bank?: {
    index: number
    count: number
    pads_per_bank: number
    logical_pad_start: number
    logical_pad_end: number
  }
  fixed_length?: {
    enabled: boolean
    preset?: string | null
    bars?: number | null
    beats?: number | null
    steps?: number | null
    available_presets: string[]
  }
  step_grid?: {
    page: number
    selected_step_index?: number | null
    selected_step_instrument?: number | null
  }
  loop_selector?: {
    enabled: boolean
    page: number
    start_step?: number | null
    end_step?: number | null
    length_steps?: number | null
  }
}

export interface PushSurfaceDrumProjectionTransport {
  is_playing: boolean
  bpm: number
  pattern_id: number
  step: number
  bar: number
  beat: number
}

export interface PushSurfaceDrumProjectionPad {
  physical_pad: number
  logical_pad: number
  name: string
  mute: boolean
  solo: boolean
  armed: boolean
  source: string
  color: string
  bus_assignment: number
  volume: number
}

export interface PushSurfaceDrumProjectionStep {
  step: number
  active: boolean
  velocity: number
  probability: number
  micro_timing: number
  pitch?: number | null
  length?: number | null
  ratchet_count?: number
  is_playhead: boolean
  selected: boolean
}

export interface PushSurfaceDrumProjection {
  instance?: Record<string, unknown> | null
  transport: PushSurfaceDrumProjectionTransport
  pads: PushSurfaceDrumProjectionPad[]
  current_bank: {
    index: number
    start_pad: number
    end_pad: number
  }
  modes: {
    pad_velocity_mode: {
      enabled: boolean
      source_pad?: number | null
    }
    repeat: {
      enabled: boolean
      rate?: string | null
    }
    quantize: {
      enabled: boolean
      grid?: string | null
      strength: number
    }
    fixed_length: {
      enabled: boolean
      preset?: string | null
    }
    loop_selector: {
      enabled: boolean
      page: number
      start_step?: number | null
      end_step?: number | null
    }
  }
  step_grid: {
    pattern_id: number
    selected_pad: number
    page: number
    page_start_step: number
    page_end_step: number
    selected_step_index?: number | null
    selected_step_instrument?: number | null
    selected_step?: PushSurfaceDrumProjectionStep | null
    steps: PushSurfaceDrumProjectionStep[]
  }
  browser: {
    favorites: string[]
    recent: string[]
    quick_shortcuts: Array<{
      kind: string
      item_id: string
    }>
    last_browse_payload: Record<string, unknown>
  }
  confirmation?: Record<string, unknown> | null
  display: {
    transport_safe: boolean
    fallback: string
    title: string
    lines: string[]
  }
}

export interface PushSurfaceDrumSessionCommandResponse {
  status?: string
  session?: PushSurfaceDrumSessionState
  available_instances?: Array<Record<string, unknown>>
  selected_projection?: Record<string, unknown> | null
  drum_projection?: PushSurfaceDrumProjection | null
  surface_modes?: PushSurfaceDrumSurfaceModes
  pad_grid?: PushSurfacePadGridCell[]
  command_result?: Record<string, unknown>
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

  getDrumSessionState: (deviceFingerprint: string, nodeId?: string | null) =>
    fetchJson<PushSurfaceDrumSessionCommandResponse>(
      appendNodeQuery(
        `${PUSH_SURFACE_API_BASE}/drum-session/state?device_fingerprint=${encodeURIComponent(deviceFingerprint)}`,
        nodeId,
      ),
      { cache: 'no-store' },
    ),

  dispatchDrumSessionCommand: (
    deviceFingerprint: string,
    command: string,
    payload: Record<string, unknown> = {},
    nodeId?: string | null,
  ) =>
    fetchJson<PushSurfaceDrumSessionCommandResponse>(
      appendNodeQuery(`${PUSH_SURFACE_API_BASE}/drum-session/command`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({
          device_fingerprint: deviceFingerprint,
          command,
          payload,
        }),
      },
    ),
}

export default pushSurfaceApi
