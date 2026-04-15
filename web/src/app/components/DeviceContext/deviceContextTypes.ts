import type { DeviceLocation } from '../../hooks/useDeviceLocation'
import type { NodeInfo } from '../../contexts/ClusterContextStore'

export type { DeviceLocation, NodeInfo }

// ── Device state ─────────────────────────────────────────────────────────────

export type DeviceNodeState =
  | 'loading'       // inventory query in-flight
  | 'not_found'     // device not seen on any cluster node
  | 'needs_switch'  // device found but on a different node than currently managed
  | 'node_offline'  // device's node exists but isOnline === false
  | 'ready'         // device is on the currently-selected node

// ── Issue descriptor (multiple can be active simultaneously) ─────────────────

export type DeviceIssueSeverity = 'info' | 'warning' | 'error'

export interface DeviceIssue {
  id: string
  severity: DeviceIssueSeverity
  title: string
  detail: string
}

// ── Switch progress state machine ────────────────────────────────────────────

export type SwitchStep = 'initiating' | 'connecting' | 'authenticating' | 'ready' | 'failed'

export interface SwitchProgressState {
  active: boolean
  currentStep: SwitchStep
  completedSteps: SwitchStep[]
  failedStep: SwitchStep | null
  errorDetail: string | null
  targetNodeId: string | null
}

export const SWITCH_STEPS: Exclude<SwitchStep, 'failed'>[] = [
  'initiating',
  'connecting',
  'authenticating',
  'ready',
]

export const SWITCH_STEP_LABELS: Record<SwitchStep, string> = {
  initiating: 'Initiating context switch',
  connecting: 'Connecting to node',
  authenticating: 'Authenticating session',
  ready: 'Context ready',
  failed: 'Switch failed',
}

// ── Hook return type ─────────────────────────────────────────────────────────

export interface DeviceNodeContextValue {
  deviceState: DeviceNodeState
  deviceLocation: DeviceLocation | null
  allNodesWithDevice: DeviceLocation[]
  currentNode: NodeInfo | null
  targetNode: NodeInfo | null
  issues: DeviceIssue[]
  canSwitch: boolean
  isLoading: boolean
}
