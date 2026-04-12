import './PushSurfacePage.css'

import {
  Add,
  ArrowLeft,
  Copy,
  Edit,
  PlayFilledAlt,
  Renew,
  Save,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Modal,
  Popover,
  PopoverContent,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { startTransition, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'

import pushRenderImage from '../../assets/Abiliton-Push-Render.png'
import {
  pushSurfaceApi,
  type PushSurfaceActiveDevice,
  type PushSurfaceAssignment,
  type PushSurfaceLabsEditorState,
  type PushSurfacePendingConfirmation,
  type PushSurfaceWelcomeLight,
  type PushSurfaceWelcomeRoutine,
  type PushSurfaceWelcomeStep,
} from '../../map2/clients/pushSurface'
import { PageHeader } from '../components/PageHeader'
import { useCluster } from '../contexts/useCluster'
import { useLatencyPressure } from '../hooks/useLatencyPressure'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { type NodeSummary } from '../types/node'
import {
  NODE_PAGE_KEYS,
  formatNodeDisplayName,
  getNodeRoleLabel,
  getNodeStatusLabel,
} from '../utils/nodeDisplay'
import {
  type PushHotspot,
  PUSH_HOTSPOTS,
  PUSH_RENDER_HEIGHT,
  PUSH_RENDER_WIDTH,
  findHotspotForControlId,
} from './labsPushLayout'
import { EmptyState } from '../components/shared/EmptyState'

const INTERACTION_OPTIONS = [
  'tap',
  'hold',
  'double-tap',
  'shift+control',
  'bank-a',
  'bank-b',
  'velocity',
  'pressure',
  'encoder-touch',
] as const

const ASSIGNMENT_TYPE_OPTIONS = [
  'cc',
  'pc',
  'note',
  'nrpn',
  'sysex',
  'macro',
  'map2_action',
  'routing',
  'cluster',
  'transport',
  'custom_command',
] as const

const ROUTINE_PAGE_OPTIONS = [
  'home',
  'chains',
  'node_detail',
  'parameters',
  'presets',
  'routing',
  'cluster',
  'diagnostics',
] as const

const COLOR_OPTIONS = ['OFF', 'DIM', 'WHITE', 'BLUE', 'CYAN', 'GREEN', 'YELLOW', 'AMBER', 'ORANGE', 'RED', 'MAGENTA'] as const

type SurfaceMode = 'mapping' | 'routine'

interface ControlAssignmentDraft {
  id: string
  controlId: string
  controlLabel: string
  label: string
  interaction: string
  assignmentType: string
  deviceScope: string
  clusterScope: string
  payloadText: string
  enabled: boolean
  safeModeConfirm: boolean
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sortQuickAssignments(assignments: PushSurfaceAssignment[]): PushSurfaceAssignment[] {
  return [...assignments].sort((left, right) => {
    const leftPriority = ['cc', 'pc'].includes(left.assignment_type.toLowerCase()) ? 0 : 1
    const rightPriority = ['cc', 'pc'].includes(right.assignment_type.toLowerCase()) ? 0 : 1
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }
    return left.label.localeCompare(right.label)
  })
}

function defaultAssignmentDraft(hotspot: PushHotspot, nodeId: string): ControlAssignmentDraft {
  return {
    id: createId('assign'),
    controlId: hotspot.id,
    controlLabel: hotspot.label,
    label: `${hotspot.label} Mapping`,
    interaction: hotspot.kind === 'encoder' ? 'encoder-touch' : 'tap',
    assignmentType: hotspot.kind === 'pad' ? 'note' : 'cc',
    deviceScope: 'device:auto',
    clusterScope: nodeId,
    payloadText: JSON.stringify(
      hotspot.kind === 'pad'
        ? { midi_channel: 1, note: 60, velocity: 127 }
        : { midi_channel: 1, cc: 1, value: 127 },
      null,
      2,
    ),
    enabled: true,
    safeModeConfirm: hotspot.kind !== 'pad',
  }
}

function draftFromAssignment(assignment: PushSurfaceAssignment, hotspot: PushHotspot): ControlAssignmentDraft {
  return {
    id: assignment.id,
    controlId: assignment.control_id,
    controlLabel: assignment.control_label ?? hotspot.label,
    label: assignment.label,
    interaction: assignment.interaction,
    assignmentType: assignment.assignment_type,
    deviceScope: assignment.device_scope ?? 'device:auto',
    clusterScope: assignment.cluster_scope ?? '',
    payloadText: JSON.stringify(assignment.payload ?? {}, null, 2),
    enabled: assignment.enabled ?? true,
    safeModeConfirm: assignment.safe_mode_confirm ?? false,
  }
}

function parsePayloadText(payloadText: string): Record<string, unknown> {
  const trimmed = payloadText.trim()
  if (!trimmed) {
    return {}
  }

  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payload JSON must be an object.')
  }

  return parsed as Record<string, unknown>
}

function resolveTemplate(value: string | undefined, stats: Record<string, string>): string {
  if (!value) {
    return ''
  }
  return value.replace(/\{([^}]+)\}/g, (_match, key) => stats[key] ?? `{${key}}`)
}

function coerceLines(step: PushSurfaceWelcomeStep | null): string[] {
  const lines = step?.display?.lines ?? []
  return [lines[0] ?? '', lines[1] ?? '', lines[2] ?? '', lines[3] ?? '']
}

function lightColorValue(color: string | undefined): string {
  switch ((color ?? 'OFF').toUpperCase()) {
    case 'DIM':
      return 'rgba(255, 255, 255, 0.18)'
    case 'WHITE':
      return '#f4f4f4'
    case 'BLUE':
      return '#0f62fe'
    case 'CYAN':
      return '#08bdba'
    case 'GREEN':
      return '#42be65'
    case 'YELLOW':
      return '#f1c21b'
    case 'AMBER':
      return '#ff832b'
    case 'ORANGE':
      return '#ff832b'
    case 'RED':
      return '#da1e28'
    case 'MAGENTA':
      return '#be95ff'
    default:
      return 'transparent'
  }
}

function buildCrossOutlineLights(): Record<string, PushSurfaceWelcomeLight> {
  const lights: Record<string, PushSurfaceWelcomeLight> = {}
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const controlId = `grid_${x}_${y}`
      if (x === 3 || x === 4 || y === 3 || y === 4) {
        lights[controlId] = { color: 'BLUE', pulse: true }
        continue
      }
      if (x === 0 || x === 7 || y === 0 || y === 7) {
        lights[controlId] = { color: 'DIM' }
      }
    }
  }
  return lights
}

function buildBlankStep(): PushSurfaceWelcomeStep {
  return {
    id: createId('step'),
    duration_ms: 800,
    pad_lights: {},
    button_lights: {},
    display: {
      title: 'NEW STEP',
      lines: ['', '', '', ''],
    },
  }
}

function buildBlankRoutine(): PushSurfaceWelcomeRoutine {
  return {
    id: createId('routine'),
    name: 'New Welcome Routine',
    description: 'Custom connect-time welcome sequence.',
    category: 'welcome',
    is_example: false,
    run_on_connect: false,
    duration_ms: 800,
    handoff_page: 'home',
    steps: [buildBlankStep()],
  }
}

function lightMatchesHotspot(
  lights: Record<string, PushSurfaceWelcomeLight> | undefined,
  hotspot: PushHotspot,
): PushSurfaceWelcomeLight | null {
  if (!lights) {
    return null
  }
  const controlIds = [hotspot.id, ...(hotspot.aliases ?? [])]
  for (const controlId of controlIds) {
    if (lights[controlId]) {
      return lights[controlId] ?? null
    }
  }
  return null
}

function hotspotMatchesAssignment(assignment: PushSurfaceAssignment, hotspot: PushHotspot): boolean {
  return assignment.control_id === hotspot.id || hotspot.aliases?.includes(assignment.control_id) === true
}

function buildStatsContext(
  activeDevice: PushSurfaceActiveDevice | null | undefined,
  scopeNode: NodeSummary | null,
  currentPresetName: string,
  nodeScore: string,
  cpuLoad: string,
): Record<string, string> {
  const nodeName = scopeNode ? formatNodeDisplayName(scopeNode) : 'Local Node'
  const role = scopeNode ? getNodeRoleLabel(scopeNode.role) : 'Node'
  const status = scopeNode ? getNodeStatusLabel(scopeNode.status) : 'OK'

  return {
    node_name: nodeName,
    firmware_profile: activeDevice?.profile?.display_name ?? activeDevice?.profile?.profile_id ?? 'Generic Push',
    current_preset: currentPresetName,
    current_snapshot: currentPresetName,
    cpu_load: cpuLoad,
    node_score: nodeScore,
    cluster_status: `${role} / ${status}`,
  }
}

function RoutineExamples({ routines }: { routines: PushSurfaceWelcomeRoutine[] }) {
  const exampleRoutines = routines.filter((routine) => routine.is_example)

  return (
    <div className="labs-page__examples">
      <div className="labs-page__section-heading">
        <h3>Example Automations</h3>
        <Tag type="purple">{exampleRoutines.length} seeded</Tag>
      </div>
      <div className="labs-page__example-grid">
        {exampleRoutines.map((routine) => (
          <article key={routine.id} className="labs-page__example-card">
            <div className="labs-page__example-meta">
              <Tag type="cool-gray">{routine.category ?? 'welcome'}</Tag>
              <span>{routine.steps.length} steps</span>
            </div>
            <h4>{routine.name}</h4>
            <p>{routine.description || 'Saved reference animation.'}</p>
          </article>
        ))}
      </div>

    </div>
  )
}

function labelForPendingAction(pendingConfirmation: PushSurfacePendingConfirmation | null): string {
  if (!pendingConfirmation) {
    return 'Pending action'
  }
  if (pendingConfirmation.action_type === 'instance_switch') {
    return 'Confirm instance switch'
  }
  return pendingConfirmation.action_type.replace(/_/g, ' ')
}

function SurfaceSkeleton() {
  return (
    <div className="push-surface-page__surface-skeleton" aria-hidden="true">
      <div className="push-surface-page__skeleton push-surface-page__skeleton--surface-title" />
      <div className="push-surface-page__skeleton push-surface-page__skeleton--surface-line" />
      <div className="push-surface-page__skeleton push-surface-page__skeleton--surface-line" />
      <div className="push-surface-page__skeleton push-surface-page__skeleton--surface-line" />
      <div className="push-surface-page__skeleton push-surface-page__skeleton--surface-line push-surface-page__skeleton--surface-line-short" />
    </div>
  )
}

function ControlPopoverForm({
  hotspot,
  assignments,
  draft,
  errorMessage,
  onSelectAssignment,
  onDraftChange,
  onSave,
  onRemove,
}: {
  hotspot: PushHotspot
  assignments: PushSurfaceAssignment[]
  draft: ControlAssignmentDraft
  errorMessage: string | null
  onSelectAssignment: (assignment: PushSurfaceAssignment) => void
  onDraftChange: (updates: Partial<ControlAssignmentDraft>) => void
  onSave: () => void
  onRemove: () => void
}) {
  return (
    <div className="labs-page__control-popover" data-testid="labs-control-popover">
      <div className="labs-page__control-popover-header">
        <div>
          <p className="labs-page__eyebrow">{hotspot.kind}</p>
          <h4>{hotspot.label}</h4>
        </div>
        <Tag type="blue">{draft.controlId}</Tag>
      </div>

      {assignments.length > 0 ? (
        <div className="labs-page__control-existing">
          <p className="labs-page__micro-heading">Current mappings</p>
          <div className="labs-page__control-existing-list">
            {assignments.map((assignment) => (
              <button
                key={assignment.id}
                type="button"
                className={`labs-page__assignment-pill${draft.id === assignment.id ? ' is-active' : ''}`}
                onClick={() => onSelectAssignment(assignment)}
              >
                {assignment.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <TextInput
        id={`control-label-${hotspot.id}`}
        labelText="Mapping label"
        value={draft.label}
        onChange={(event) => onDraftChange({ label: event.currentTarget.value })}
      />

      <Select
        id={`control-interaction-${hotspot.id}`}
        labelText="Interaction"
        value={draft.interaction}
        onChange={(event) => onDraftChange({ interaction: event.currentTarget.value })}
      >
        {INTERACTION_OPTIONS.map((option) => (
          <SelectItem key={option} value={option} text={option} />
        ))}
      </Select>

      <Select
        id={`control-type-${hotspot.id}`}
        labelText="Assignment type"
        value={draft.assignmentType}
        onChange={(event) => onDraftChange({ assignmentType: event.currentTarget.value })}
      >
        {ASSIGNMENT_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option} value={option} text={option} />
        ))}
      </Select>

      <TextInput
        id={`control-device-scope-${hotspot.id}`}
        labelText="Device scope"
        value={draft.deviceScope}
        onChange={(event) => onDraftChange({ deviceScope: event.currentTarget.value })}
      />

      <TextInput
        id={`control-cluster-scope-${hotspot.id}`}
        labelText="Cluster scope"
        value={draft.clusterScope}
        onChange={(event) => onDraftChange({ clusterScope: event.currentTarget.value })}
      />

      <TextArea
        id={`control-payload-${hotspot.id}`}
        labelText="Payload JSON"
        rows={6}
        value={draft.payloadText}
        onChange={(event) => onDraftChange({ payloadText: event.currentTarget.value })}
      />

      <div className="labs-page__control-flags">
        <Checkbox
          id={`control-enabled-${hotspot.id}`}
          labelText="Enabled"
          checked={draft.enabled}
          onChange={(_event, data) => onDraftChange({ enabled: data.checked })}
        />
        <Checkbox
          id={`control-safe-${hotspot.id}`}
          labelText="Safe-mode confirmation"
          checked={draft.safeModeConfirm}
          onChange={(_event, data) => onDraftChange({ safeModeConfirm: data.checked })}
        />
      </div>

      {errorMessage ? (
        <InlineNotification
          className="labs-page__popover-error"
          kind="error"
          lowContrast
          hideCloseButton
          title="Mapping not saved"
          subtitle={errorMessage}
        />
      ) : null}

      <div className="labs-page__control-actions">
        <Button size="sm" kind="ghost" onClick={onRemove}>
          Remove
        </Button>
        <Button size="sm" renderIcon={Save} onClick={onSave}>
          Save mapping
        </Button>
      </div>
    </div>
  )
}

export function PushSurfacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { viewedNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.labs)
  const { isClusterMode } = useCluster()
  const latencyPressure = useLatencyPressure({ nodeId: viewedNodeId, useWebSocket: true })

  const editorQuery = useQuery({
    queryKey: ['push-surface', 'labs-editor-state', viewedNodeId ?? 'local'],
    queryFn: () => pushSurfaceApi.getLabsEditorState(viewedNodeId),
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    staleTime: 1_500,
    refetchInterval: 5_000,
  })

  const runtimeQuery = useQuery({
    queryKey: ['push-surface', 'runtime-state', viewedNodeId ?? 'local'],
    queryFn: () => pushSurfaceApi.getState(viewedNodeId),
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    staleTime: 1_500,
    refetchInterval: 4_000,
  })
  const pendingConfirmationQuery = usePushConfirmation(viewedNodeId, { refetchInterval: 4_000 })

  const [editorState, setEditorState] = useState<PushSurfaceLabsEditorState | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('mapping')
  const [openControlId, setOpenControlId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStepIndex, setSelectedStepIndex] = useState(0)
  const [previewStepIndex, setPreviewStepIndex] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [paintColor, setPaintColor] = useState<string>('BLUE')
  const [paintPulse, setPaintPulse] = useState(true)
  const [paintBlink, setPaintBlink] = useState(false)
  const [controlDraft, setControlDraft] = useState<ControlAssignmentDraft | null>(null)
  const [controlDraftDirty, setControlDraftDirty] = useState(false)
  const [controlDraftError, setControlDraftError] = useState<string | null>(null)
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const effectiveEditorState = editorState ?? editorQuery.data?.editor_state ?? null

  useEffect(() => {
    if (!editorQuery.data?.editor_state) {
      return
    }
    if (editorState === null || !isDirty) {
      setEditorState(editorQuery.data.editor_state)
    }
  }, [editorQuery.data?.editor_state, editorState, isDirty])

  const saveMutation = useMutation({
    mutationFn: async (state: PushSurfaceLabsEditorState) => pushSurfaceApi.saveLabsEditorState(state, viewedNodeId),
    onSuccess: (response) => {
      queryClient.setQueryData(['push-surface', 'labs-editor-state', viewedNodeId ?? 'local'], response)
      setEditorState(response.editor_state)
      setIsDirty(false)
      setControlDraftDirty(false)
    },
  })
  const activePendingConfirmation = pendingConfirmationQuery.data?.pending_confirmation ?? null
  const confirmationMutation = useMutation({
    mutationFn: async (command: string) => {
      if (!activePendingConfirmation) {
        return null
      }
      return pushSurfaceApi.dispatchDrumSessionCommand(
        activePendingConfirmation.device_fingerprint,
        command,
        { action_id: activePendingConfirmation.action_id },
        viewedNodeId,
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['push-surface', 'pending-confirmation', viewedNodeId ?? 'local'] })
      void queryClient.invalidateQueries({ queryKey: ['push-surface', 'runtime-state', viewedNodeId ?? 'local'] })
    },
  })

  const activeDevice = editorQuery.data?.active_device ?? null
  const runtimeSnapshot = runtimeQuery.data?.snapshot
  const activeWelcomeRuntime = runtimeSnapshot?.welcome_runtime?.active ? runtimeSnapshot.welcome_runtime : null
  const activePresetName = useMemo(() => {
    const presets = runtimeSnapshot?.state?.presets ?? []
    const activePreset = presets.find((preset) => preset.selected || preset.is_active) ?? presets[0]
    return activePreset?.name ?? 'No snapshot selected'
  }, [runtimeSnapshot?.state?.presets])
  const nodeScore = latencyPressure.scoreDisplay === '--' ? '--' : latencyPressure.scoreDisplay.replace(/^0/, '')
  const cpuLoad = typeof latencyPressure.cpuMetrics.totalCpuPercent === 'number'
    ? `${latencyPressure.cpuMetrics.totalCpuPercent.toFixed(1)}%`
    : '--'
  const statsContext = useMemo(
    () => buildStatsContext(activeDevice, viewedNode ?? null, activePresetName, nodeScore, cpuLoad),
    [activeDevice, activePresetName, cpuLoad, nodeScore, viewedNode],
  )

  const quickAssignments = useMemo(() => {
    if (!effectiveEditorState) {
      return []
    }
    const ordered = sortQuickAssignments(effectiveEditorState.assignments)
    if (!deferredSearchTerm.trim()) {
      return ordered
    }
    const query = deferredSearchTerm.trim().toLowerCase()
    return ordered.filter((assignment) => {
      return [
        assignment.label,
        assignment.control_label ?? '',
        assignment.control_id,
        assignment.assignment_type,
        assignment.interaction,
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [deferredSearchTerm, effectiveEditorState])

  const selectedRoutine = useMemo(() => {
    if (!effectiveEditorState) {
      return null
    }
    return effectiveEditorState.welcome_routines.find(
      (routine) => routine.id === effectiveEditorState.selected_welcome_routine_id,
    ) ?? effectiveEditorState.welcome_routines[0] ?? null
  }, [effectiveEditorState])

  useEffect(() => {
    if (!selectedRoutine) {
      return
    }
    if (selectedStepIndex > selectedRoutine.steps.length - 1) {
      setSelectedStepIndex(0)
    }
    if (previewStepIndex > selectedRoutine.steps.length - 1) {
      setPreviewStepIndex(0)
    }
  }, [previewStepIndex, selectedRoutine, selectedStepIndex])

  const previewRoutineStep = selectedRoutine
    ? selectedRoutine.steps[isPreviewPlaying ? previewStepIndex : selectedStepIndex] ?? selectedRoutine.steps[0] ?? null
    : null

  useEffect(() => {
    if (!isPreviewPlaying || !selectedRoutine) {
      return
    }

    const currentStep = selectedRoutine.steps[previewStepIndex]
    if (!currentStep) {
      setIsPreviewPlaying(false)
      setPreviewStepIndex(0)
      return
    }

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        if (previewStepIndex >= selectedRoutine.steps.length - 1) {
          setIsPreviewPlaying(false)
          setPreviewStepIndex(selectedStepIndex)
          return
        }
        setPreviewStepIndex((currentIndex) => currentIndex + 1)
      })
    }, Math.max(200, currentStep.duration_ms))

    return () => window.clearTimeout(timeoutId)
  }, [isPreviewPlaying, previewStepIndex, selectedRoutine, selectedStepIndex])

  const selectedHotspot = useMemo(
    () => PUSH_HOTSPOTS.find((hotspot) => hotspot.id === openControlId) ?? null,
    [openControlId],
  )

  const hotspotAssignments = useMemo(() => {
    if (!effectiveEditorState || !selectedHotspot) {
      return []
    }
    return effectiveEditorState.assignments.filter((assignment) => hotspotMatchesAssignment(assignment, selectedHotspot))
  }, [effectiveEditorState, selectedHotspot])

  useEffect(() => {
    if (!selectedHotspot) {
      setControlDraft(null)
      setControlDraftDirty(false)
      setControlDraftError(null)
      return
    }
    if (controlDraftDirty && controlDraft?.controlId === selectedHotspot.id) {
      return
    }
    const existingAssignment = hotspotAssignments[0]
    setControlDraft(
      existingAssignment
        ? draftFromAssignment(existingAssignment, selectedHotspot)
        : defaultAssignmentDraft(selectedHotspot, viewedNodeId),
    )
    setControlDraftDirty(false)
    setControlDraftError(null)
  }, [controlDraft?.controlId, controlDraftDirty, hotspotAssignments, selectedHotspot, viewedNodeId])

  const previewDisplayTitle = resolveTemplate(previewRoutineStep?.display?.title ?? selectedRoutine?.name ?? 'WELCOME', statsContext)
  const previewDisplayLines = coerceLines(previewRoutineStep).map((line) => resolveTemplate(line, statsContext))
  const surfaceDisplayTitle = activeWelcomeRuntime?.frame?.display?.title ?? previewDisplayTitle
  const surfaceDisplayLines = activeWelcomeRuntime?.frame?.display?.lines ?? previewDisplayLines

  const updateEditorState = (updater: (current: PushSurfaceLabsEditorState) => PushSurfaceLabsEditorState) => {
    setEditorState((current) => {
      const baseState = current ?? effectiveEditorState
      if (!baseState) {
        return current
      }
      const nextState = updater(baseState)
      setIsDirty(true)
      return nextState
    })
  }

  const selectRoutine = (routineId: string) => {
    startTransition(() => {
      updateEditorState((current) => ({
        ...current,
        selected_welcome_routine_id: routineId,
      }))
      setSelectedStepIndex(0)
      setPreviewStepIndex(0)
      setSurfaceMode('routine')
      setOpenControlId(null)
    })
  }

  const updateSelectedRoutine = (updater: (routine: PushSurfaceWelcomeRoutine) => PushSurfaceWelcomeRoutine) => {
    if (!selectedRoutine) {
      return
    }

    updateEditorState((current) => ({
      ...current,
      welcome_routines: current.welcome_routines.map((routine) => (
        routine.id === selectedRoutine.id ? updater(routine) : routine
      )),
    }))
  }

  const updateSelectedStep = (updater: (step: PushSurfaceWelcomeStep) => PushSurfaceWelcomeStep) => {
    if (!selectedRoutine) {
      return
    }

    updateSelectedRoutine((routine) => ({
      ...routine,
      steps: routine.steps.map((step, index) => (
        index === selectedStepIndex ? updater(step) : step
      )),
    }))
  }

  const handlePaintHotspot = (hotspot: PushHotspot) => {
    if (!previewRoutineStep || surfaceMode !== 'routine' || hotspot.kind === 'screen') {
      return
    }

    const lightValue = paintColor === 'OFF'
      ? undefined
      : {
          color: paintColor,
          pulse: paintPulse,
          blink: paintBlink,
        }

    updateSelectedStep((step) => {
      const bucketName = hotspot.kind === 'pad' ? 'pad_lights' : 'button_lights'
      const currentBucket = { ...(step[bucketName] ?? {}) }
      if (lightValue) {
        currentBucket[hotspot.id] = lightValue
      } else {
        delete currentBucket[hotspot.id]
      }
      return {
        ...step,
        [bucketName]: currentBucket,
      }
    })
  }

  const handleSaveDraft = () => {
    if (!selectedHotspot || !controlDraft) {
      return
    }

    try {
      const payload = parsePayloadText(controlDraft.payloadText)
      const assignment: PushSurfaceAssignment = {
        id: controlDraft.id,
        control_id: controlDraft.controlId,
        control_label: controlDraft.controlLabel,
        interaction: controlDraft.interaction,
        assignment_type: controlDraft.assignmentType,
        label: controlDraft.label,
        device_scope: controlDraft.deviceScope,
        cluster_scope: controlDraft.clusterScope || null,
        enabled: controlDraft.enabled,
        safe_mode_confirm: controlDraft.safeModeConfirm,
        payload,
      }

      updateEditorState((current) => {
        const remainder = current.assignments.filter((item) => item.id !== assignment.id)
        return {
          ...current,
          assignments: [assignment, ...remainder],
        }
      })
      setControlDraftDirty(false)
      setControlDraftError(null)
    } catch (error) {
      setControlDraftError(error instanceof Error ? error.message : 'Invalid payload JSON.')
    }
  }

  const handleRemoveDraft = () => {
    if (!controlDraft) {
      return
    }
    updateEditorState((current) => ({
      ...current,
      assignments: current.assignments.filter((assignment) => assignment.id !== controlDraft.id),
    }))
    if (selectedHotspot) {
      setControlDraft(defaultAssignmentDraft(selectedHotspot, viewedNodeId))
    }
    setControlDraftDirty(false)
    setControlDraftError(null)
  }

  const handleSaveAll = async () => {
    const stateToSave = editorState ?? effectiveEditorState
    if (!stateToSave) {
      return
    }
    await saveMutation.mutateAsync(stateToSave)
  }

  const handleReload = async () => {
    const [response] = await Promise.all([editorQuery.refetch(), runtimeQuery.refetch()])
    if (response.data?.editor_state) {
      setEditorState(response.data.editor_state)
      setIsDirty(false)
    }
  }

  const handlePlayPreview = () => {
    if (!selectedRoutine) {
      return
    }
    setPreviewStepIndex(0)
    setIsPreviewPlaying(true)
    setSurfaceMode('routine')
  }

  const handleCreateRoutine = () => {
    const newRoutine = buildBlankRoutine()
    updateEditorState((current) => ({
      ...current,
      welcome_routines: [newRoutine, ...current.welcome_routines],
      selected_welcome_routine_id: newRoutine.id,
    }))
    setSelectedStepIndex(0)
    setPreviewStepIndex(0)
    setSurfaceMode('routine')
  }

  const handleDuplicateRoutine = () => {
    if (!selectedRoutine) {
      return
    }
    const duplicatedRoutine: PushSurfaceWelcomeRoutine = {
      ...selectedRoutine,
      id: createId('routine'),
      name: `${selectedRoutine.name} Copy`,
      is_example: false,
      run_on_connect: false,
      steps: selectedRoutine.steps.map((step) => ({
        ...step,
        id: createId('step'),
        pad_lights: { ...(step.pad_lights ?? {}) },
        button_lights: { ...(step.button_lights ?? {}) },
        display: {
          title: step.display?.title ?? '',
          lines: [...(step.display?.lines ?? [])],
        },
      })),
    }
    updateEditorState((current) => ({
      ...current,
      welcome_routines: [duplicatedRoutine, ...current.welcome_routines],
      selected_welcome_routine_id: duplicatedRoutine.id,
    }))
    setSelectedStepIndex(0)
    setPreviewStepIndex(0)
  }

  const errorMessage = (editorQuery.error instanceof Error && editorQuery.error.message)
    || (runtimeQuery.error instanceof Error && runtimeQuery.error.message)
    || (pendingConfirmationQuery.error instanceof Error && pendingConfirmationQuery.error.message)
    || (saveMutation.error instanceof Error && saveMutation.error.message)
    || (confirmationMutation.error instanceof Error && confirmationMutation.error.message)
    || null
  const isInitialLoading = !effectiveEditorState && (editorQuery.isLoading || runtimeQuery.isLoading)
  const isRefreshing = editorQuery.isFetching || runtimeQuery.isFetching || pendingConfirmationQuery.isFetching
  const pendingActionLabel = labelForPendingAction(activePendingConfirmation)
  const showFallbackConfirmationModal = Boolean(activePendingConfirmation && editorQuery.data && !activeDevice)

  return (
    <div className="push-surface-page">
      <PageHeader
        title="Push Surface"
        subtitle="Standalone Push WYSIWYG editor for mappings, welcome routines, and live surface management."
        actions={(
          <>
            <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={() => navigate('/labs')}>
              Back to Labs
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Renew}
              onClick={() => {
                void handleReload()
              }}
            >
              Reload
            </Button>
            <Button
              size="sm"
              renderIcon={Save}
              onClick={() => {
                void handleSaveAll()
              }}
              disabled={!isDirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Push Surface'}
            </Button>
          </>
        )}
      />

      <Tile className="push-surface-page__refresh-rail">
        <div className="push-surface-page__refresh-copy">
          <p className="push-surface-page__eyebrow">Refresh status</p>
          <h2>Keep the surface stable while runtime data updates</h2>
          <p>
            Editor state polls every 5 seconds and runtime state every 4 seconds. Refreshes now stay
            in-place instead of blanking the full route or discarding an open control draft.
          </p>
        </div>
        <div className="push-surface-page__refresh-meta">
          {isRefreshing ? <InlineLoading description="Refreshing Push state" /> : null}
          <div className="push-surface-page__tag-row">
            <Tag type={isRefreshing ? 'blue' : 'green'}>
              {isRefreshing ? 'Refreshing' : 'In sync'}
            </Tag>
            <Tag type={controlDraftDirty ? 'warm-gray' : isDirty ? 'purple' : 'cool-gray'}>
              {controlDraftDirty ? 'Mapping draft open' : isDirty ? 'Surface changes pending save' : 'No pending changes'}
            </Tag>
            <Tag type={runtimeSnapshot?.running ? 'green' : 'cool-gray'}>
              {runtimeSnapshot?.running ? 'Runtime active' : 'Runtime idle'}
            </Tag>
            {activePendingConfirmation ? (
              <Tag type="warm-gray">Push confirmation pending</Tag>
            ) : null}
          </div>
        </div>
      </Tile>

      {errorMessage ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Push Labs unavailable"
          subtitle={errorMessage}
        />
      ) : null}

      <div className="labs-page__status-grid">
        {isInitialLoading ? (
          <>
            {Array.from({ length: 4 }, (_unused, index) => (
              <Tile key={`status-skeleton-${index}`} className="labs-page__status-card push-surface-page__panel push-surface-page__panel--skeleton">
                <div className="push-surface-page__skeleton push-surface-page__skeleton--eyebrow" />
                <div className="push-surface-page__skeleton push-surface-page__skeleton--title" />
                <div className="push-surface-page__skeleton push-surface-page__skeleton--line" />
                <div className="push-surface-page__skeleton push-surface-page__skeleton--line push-surface-page__skeleton--line-short" />
              </Tile>
            ))}
          </>
        ) : (
          <>
            <Tile className="labs-page__status-card push-surface-page__panel">
          <p className="labs-page__eyebrow">Connection</p>
          <h3>{activeDevice?.profile?.display_name ?? 'Offline editor'}</h3>
          <p>{activeDevice?.input_port_name ?? 'No Push connected. Editing stays available offline.'}</p>
          <div className="labs-page__tag-row">
            <Tag type={editorQuery.data?.manager_running ? 'green' : 'cool-gray'}>
              {editorQuery.data?.manager_running ? 'Manager running' : 'Manager idle'}
            </Tag>
            <Tag type={activeDevice ? 'blue' : 'warm-gray'}>
              {activeDevice?.device_id ?? 'No hardware'}
            </Tag>
            {activeWelcomeRuntime ? (
              <Tag type="purple">
                Welcome live step {activeWelcomeRuntime.step_index + 1}/{activeWelcomeRuntime.total_steps}
              </Tag>
            ) : null}
          </div>
        </Tile>

        <Tile className="labs-page__status-card push-surface-page__panel">
          <p className="labs-page__eyebrow">Node Scope</p>
          <h3>{viewedNode ? formatNodeDisplayName(viewedNode) : 'Local node'}</h3>
          <p>{viewedNode ? `${getNodeRoleLabel(viewedNode.role)} · ${getNodeStatusLabel(viewedNode.status)}` : 'Editing local scope'}</p>
          <div className="labs-page__tag-row">
            <Tag type={isClusterMode ? 'purple' : 'cool-gray'}>
              {isClusterMode ? 'Cluster-aware' : 'Single-node'}
            </Tag>
            <Tag type="teal">Per device + per node</Tag>
          </div>
        </Tile>

        <Tile className="labs-page__status-card push-surface-page__panel">
          <p className="labs-page__eyebrow">Health Score</p>
          <h3>{latencyPressure.scoreDisplay}/10</h3>
          <p>{latencyPressure.helperText}</p>
          <div className="labs-page__tag-row">
            <Tag type={latencyPressure.status === 'critical' ? 'red' : latencyPressure.status === 'watch' ? 'warm-gray' : 'green'}>
              {latencyPressure.statusLabel}
            </Tag>
            <Tag type="cool-gray">CPU {cpuLoad}</Tag>
          </div>
        </Tile>

        <Tile className="labs-page__status-card push-surface-page__panel">
          <p className="labs-page__eyebrow">Welcome Handoff</p>
          <h3>{selectedRoutine?.handoff_page ?? 'home'}</h3>
          <p>
            {selectedRoutine?.run_on_connect
              ? 'Selected routine is armed to run on Push connect.'
              : 'Selected routine is saved but not armed for auto-run.'}
          </p>
          <div className="labs-page__tag-row">
            <Tag type="blue">{activePresetName}</Tag>
            <Tag type="cool-gray">{selectedRoutine?.steps.length ?? 0} steps</Tag>
          </div>
        </Tile>
          </>
        )}
      </div>

      <Tile className="labs-page__quick-panel push-surface-page__panel">
        <div className="labs-page__section-heading">
          <div>
            <p className="labs-page__eyebrow">Quick Assignments</p>
            <h2>Current mappings</h2>
          </div>
          <TextInput
            id="labs-quick-assignments-search"
            labelText="Search mappings"
            hideLabel
            placeholder="Search label, control, or type"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
          />
        </div>
        <div className="labs-page__quick-assignment-list">
          {isInitialLoading ? Array.from({ length: 3 }, (_unused, index) => (
            <div key={`assignment-skeleton-${index}`} className="push-surface-page__quick-assignment-skeleton">
              <div className="push-surface-page__skeleton push-surface-page__skeleton--line" />
              <div className="push-surface-page__skeleton push-surface-page__skeleton--line push-surface-page__skeleton--line-short" />
            </div>
          )) : quickAssignments.length > 0 ? quickAssignments.map((assignment) => {
            const linkedHotspot = findHotspotForControlId(assignment.control_id)
            return (
              <button
                key={assignment.id}
                type="button"
                className="labs-page__quick-assignment"
                onClick={() => {
                  if (!linkedHotspot) {
                    return
                  }
                  startTransition(() => {
                    setSurfaceMode('mapping')
                    setOpenControlId(linkedHotspot.id)
                  })
                }}
              >
                <div className="labs-page__quick-assignment-copy">
                  <strong>{assignment.label}</strong>
                  <span>{assignment.control_label ?? linkedHotspot?.label ?? assignment.control_id}</span>
                </div>
                <div className="labs-page__tag-row">
                  <Tag type={['cc', 'pc'].includes(assignment.assignment_type.toLowerCase()) ? 'blue' : 'cool-gray'}>
                    {assignment.assignment_type.toUpperCase()}
                  </Tag>
                  <Tag type="cool-gray">{assignment.interaction}</Tag>
                </div>
              </button>
            )
          }) : (
            <div className="labs-page__empty">
              <EmptyState
                title="No assignments match this filter"
                description="Adjust the current filter to show matching assignments."
                compact
              />
            </div>
          )}
        </div>
      </Tile>

      <div className="labs-page__workspace">
        <div className="labs-page__surface-column">
          <Tile className="labs-page__surface-panel push-surface-page__panel">
            <div className="labs-page__section-heading">
              <div>
                <p className="labs-page__eyebrow">Push Surface</p>
                <h2>WYSIWYG editor</h2>
              </div>
              <div className="labs-page__surface-actions">
                <Button
                  size="sm"
                  kind={surfaceMode === 'mapping' ? 'primary' : 'tertiary'}
                  renderIcon={Edit}
                  disabled={isInitialLoading}
                  onClick={() => {
                    setSurfaceMode('mapping')
                  }}
                >
                  Edit mappings
                </Button>
                <Button
                  size="sm"
                  kind={surfaceMode === 'routine' ? 'primary' : 'tertiary'}
                  renderIcon={PlayFilledAlt}
                  disabled={isInitialLoading}
                  onClick={() => {
                    setSurfaceMode('routine')
                    setOpenControlId(null)
                  }}
                >
                  Paint routine
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={PlayFilledAlt}
                  onClick={handlePlayPreview}
                  disabled={!selectedRoutine || isInitialLoading}
                >
                  Preview routine
                </Button>
              </div>
            </div>

            {!isInitialLoading ? (
              <>
                <div className="labs-page__surface-toolbar">
                  <Tag type={surfaceMode === 'routine' ? 'purple' : 'blue'}>
                    {surfaceMode === 'routine' ? 'Routine paint mode' : 'Mapping edit mode'}
                  </Tag>
                  <Tag type="cool-gray">
                    {isPreviewPlaying ? `Previewing step ${previewStepIndex + 1}` : `Step ${selectedStepIndex + 1}`}
                  </Tag>
                  <Tag type="cool-gray">{selectedRoutine?.name ?? 'No routine selected'}</Tag>
                </div>

                {surfaceMode === 'routine' ? (
                  <div className="labs-page__paint-toolbar">
                    <Select
                      id="labs-paint-color"
                      labelText="Paint color"
                      value={paintColor}
                      onChange={(event) => setPaintColor(event.currentTarget.value)}
                    >
                      {COLOR_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option} text={option} />
                      ))}
                    </Select>
                    <Checkbox
                      id="labs-paint-pulse"
                      labelText="Pulse"
                      checked={paintPulse}
                      onChange={(_event, data) => setPaintPulse(data.checked)}
                    />
                    <Checkbox
                      id="labs-paint-blink"
                      labelText="Blink"
                      checked={paintBlink}
                      onChange={(_event, data) => setPaintBlink(data.checked)}
                    />
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        updateSelectedStep((step) => ({
                          ...step,
                          pad_lights: buildCrossOutlineLights(),
                        }))
                      }}
                      disabled={!selectedRoutine}
                    >
                      Apply blue cross
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        updateSelectedStep((step) => ({
                          ...step,
                          pad_lights: {},
                          button_lights: {},
                        }))
                      }}
                      disabled={!selectedRoutine}
                    >
                      Clear lights
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className={`labs-page__surface-frame${isInitialLoading ? ' push-surface-page__surface-frame--loading' : ''}`}>
              {isInitialLoading ? <SurfaceSkeleton /> : null}
              <img
                src={pushRenderImage}
                alt="Ableton Push WYSIWYG render"
                className="labs-page__surface-image"
              />
              <div className="labs-page__surface-overlay">
                {!isInitialLoading ? (
                  <>
                    <div className="labs-page__surface-display">
                      <span className="labs-page__surface-display-title">{surfaceDisplayTitle}</span>
                      {surfaceDisplayLines.map((line, index) => (
                        <span key={`${line}-${index}`} className="labs-page__surface-display-line">
                          {line || ' '}
                        </span>
                      ))}
                    </div>

                    {activePendingConfirmation ? (
                      <div className="labs-page__surface-confirmation" role="status" aria-live="polite">
                        <span className="labs-page__surface-confirmation-eyebrow">Push confirmation</span>
                        <strong>{pendingActionLabel}</strong>
                        <span>{activePendingConfirmation.target_display_name}</span>
                        <span>{activePendingConfirmation.device_identity}</span>
                        <div className="labs-page__surface-confirmation-actions">
                          <Button
                            size="sm"
                            kind="secondary"
                            disabled={confirmationMutation.isPending}
                            onClick={() => {
                              void confirmationMutation.mutateAsync(
                                activePendingConfirmation.reject_command,
                              )
                            }}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            disabled={confirmationMutation.isPending}
                            onClick={() => {
                              void confirmationMutation.mutateAsync(
                                activePendingConfirmation.accept_command,
                              )
                            }}
                          >
                            Accept
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {PUSH_HOTSPOTS.map((hotspot) => {
                  const lightState = lightMatchesHotspot(
                    hotspot.kind === 'pad'
                      ? (activeWelcomeRuntime?.frame?.pad_lights ?? previewRoutineStep?.pad_lights)
                      : (activeWelcomeRuntime?.frame?.button_lights ?? previewRoutineStep?.button_lights),
                    hotspot,
                  )
                  const assignmentCount = effectiveEditorState?.assignments.filter((assignment) => hotspotMatchesAssignment(assignment, hotspot)).length ?? 0
                  const style = {
                    left: `${(hotspot.x / PUSH_RENDER_WIDTH) * 100}%`,
                    top: `${(hotspot.y / PUSH_RENDER_HEIGHT) * 100}%`,
                    width: `${(hotspot.width / PUSH_RENDER_WIDTH) * 100}%`,
                    height: `${(hotspot.height / PUSH_RENDER_HEIGHT) * 100}%`,
                    '--hotspot-color': lightColorValue(lightState?.color),
                  } as CSSProperties

                  const trigger = (
                    <button
                      type="button"
                      aria-label={`Control ${hotspot.label}`}
                      data-testid={hotspot.id === 'grid_0_0' ? 'labs-hotspot-grid-0-0' : undefined}
                      className={`labs-page__hotspot labs-page__hotspot--${hotspot.kind}${hotspot.shape ? ` is-${hotspot.shape}` : ''}${openControlId === hotspot.id ? ' is-selected' : ''}${assignmentCount > 0 ? ' has-assignments' : ''}${lightState ? ' is-lit' : ''}${surfaceMode === 'routine' ? ' is-routine' : ''}`}
                      style={style}
                      onClick={() => {
                        if (surfaceMode === 'routine') {
                          handlePaintHotspot(hotspot)
                          return
                        }
                        setOpenControlId((currentId) => currentId === hotspot.id ? null : hotspot.id)
                      }}
                    >
                      {assignmentCount > 0 ? <span className="labs-page__hotspot-badge">{assignmentCount}</span> : null}
                    </button>
                  )

                  if (surfaceMode === 'routine' || hotspot.id === 'screen_display' || !controlDraft || selectedHotspot?.id !== hotspot.id) {
                    return (
                      <div key={hotspot.id}>
                        {trigger}
                      </div>
                    )
                  }

                  return (
                    <Popover
                      key={hotspot.id}
                      align="bottom"
                      caret
                      open={openControlId === hotspot.id}
                      onRequestClose={() => setOpenControlId(null)}
                    >
                      {trigger}
                      <PopoverContent>
                        <ControlPopoverForm
                          hotspot={hotspot}
                          assignments={hotspotAssignments}
                          draft={controlDraft}
                          errorMessage={controlDraftError}
                          onSelectAssignment={(assignment) => {
                            setControlDraft(draftFromAssignment(assignment, hotspot))
                            setControlDraftDirty(false)
                            setControlDraftError(null)
                          }}
                          onDraftChange={(updates) => {
                            setControlDraft((current) => current ? { ...current, ...updates } : current)
                            setControlDraftDirty(true)
                            setControlDraftError(null)
                          }}
                          onSave={handleSaveDraft}
                          onRemove={handleRemoveDraft}
                        />
                      </PopoverContent>
                    </Popover>
                  )
                    })}
                  </>
                ) : null}
              </div>
            </div>
          </Tile>
        </div>

        <div className="labs-page__editor-column">
          <Tile className="labs-page__editor-panel push-surface-page__panel">
            <div className="labs-page__section-heading">
              <div>
                <p className="labs-page__eyebrow">Welcome Routine Studio</p>
                <h2>Create, save, and load connect-time routines</h2>
              </div>
              <div className="labs-page__surface-actions">
                <Button size="sm" kind="ghost" renderIcon={Add} onClick={handleCreateRoutine}>
                  New routine
                </Button>
                <Button size="sm" kind="ghost" renderIcon={Copy} onClick={handleDuplicateRoutine} disabled={!selectedRoutine || isInitialLoading}>
                  Duplicate
                </Button>
              </div>
            </div>

            {isInitialLoading ? (
              <div className="push-surface-page__editor-skeleton" aria-hidden="true">
                <div className="push-surface-page__skeleton push-surface-page__skeleton--input" />
                <div className="push-surface-page__skeleton push-surface-page__skeleton--input" />
                <div className="push-surface-page__skeleton push-surface-page__skeleton--input" />
                <div className="push-surface-page__skeleton push-surface-page__skeleton--input push-surface-page__skeleton--input-tall" />
              </div>
            ) : (
              <>
            <Select
              id="labs-selected-routine"
              labelText="Loaded routine"
              value={selectedRoutine?.id ?? ''}
              onChange={(event) => selectRoutine(event.currentTarget.value)}
            >
              {(effectiveEditorState?.welcome_routines ?? []).map((routine) => (
                <SelectItem key={routine.id} value={routine.id} text={routine.name} />
              ))}
            </Select>

            {selectedRoutine ? (
              <>
                <div className="labs-page__form-grid">
                  <TextInput
                    id="labs-routine-name"
                    labelText="Routine name"
                    value={selectedRoutine.name}
                    onChange={(event) => updateSelectedRoutine((routine) => ({ ...routine, name: event.currentTarget.value }))}
                  />
                  <Select
                    id="labs-routine-page"
                    labelText="Handoff page"
                    value={selectedRoutine.handoff_page ?? 'home'}
                    onChange={(event) => updateSelectedRoutine((routine) => ({ ...routine, handoff_page: event.currentTarget.value }))}
                  >
                    {ROUTINE_PAGE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option} text={option} />
                    ))}
                  </Select>
                  <TextInput
                    id="labs-routine-category"
                    labelText="Category"
                    value={selectedRoutine.category ?? 'welcome'}
                    onChange={(event) => updateSelectedRoutine((routine) => ({ ...routine, category: event.currentTarget.value }))}
                  />
                  <TextInput
                    id="labs-routine-duration"
                    labelText="Routine duration (ms)"
                    value={String(selectedRoutine.duration_ms ?? 0)}
                    onChange={(event) => updateSelectedRoutine((routine) => ({ ...routine, duration_ms: Number(event.currentTarget.value) || 0 }))}
                  />
                </div>

                <TextArea
                  id="labs-routine-description"
                  labelText="Description"
                  rows={3}
                  value={selectedRoutine.description ?? ''}
                  onChange={(event) => updateSelectedRoutine((routine) => ({ ...routine, description: event.currentTarget.value }))}
                />

                <div className="labs-page__control-flags">
                  <Checkbox
                    id="labs-routine-connect"
                    labelText="Run this routine whenever a Push connects"
                    checked={selectedRoutine.run_on_connect ?? false}
                    onChange={(_event, data) => updateSelectedRoutine((routine) => ({ ...routine, run_on_connect: data.checked }))}
                  />
                </div>

                <div className="labs-page__step-header">
                  <div>
                    <p className="labs-page__micro-heading">Routine steps</p>
                    <p className="labs-page__step-helper">Simple step-list editing with live PNG preview.</p>
                  </div>
                  <div className="labs-page__surface-actions">
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={Add}
                      onClick={() => {
                        updateSelectedRoutine((routine) => ({
                          ...routine,
                          steps: [...routine.steps, buildBlankStep()],
                        }))
                        setSelectedStepIndex(selectedRoutine.steps.length)
                      }}
                    >
                      Add step
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        if (selectedRoutine.steps.length <= 1) {
                          return
                        }
                        updateSelectedRoutine((routine) => ({
                          ...routine,
                          steps: routine.steps.filter((_step, index) => index !== selectedStepIndex),
                        }))
                        setSelectedStepIndex((currentIndex) => Math.max(0, currentIndex - 1))
                      }}
                      disabled={selectedRoutine.steps.length <= 1}
                    >
                      Remove step
                    </Button>
                  </div>
                </div>

                <div className="labs-page__step-list" data-testid="labs-step-list">
                  {selectedRoutine.steps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      className={`labs-page__step-chip${selectedStepIndex === index ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedStepIndex(index)
                        setPreviewStepIndex(index)
                      }}
                    >
                      <strong>{step.id}</strong>
                      <span>{step.duration_ms} ms</span>
                    </button>
                  ))}
                </div>

                {previewRoutineStep ? (
                  <div className="labs-page__step-editor">
                    <div className="labs-page__form-grid">
                      <TextInput
                        id="labs-step-id"
                        labelText="Step id"
                        value={previewRoutineStep.id}
                        onChange={(event) => updateSelectedStep((step) => ({ ...step, id: event.currentTarget.value }))}
                      />
                      <TextInput
                        id="labs-step-duration"
                        labelText="Step duration (ms)"
                        value={String(previewRoutineStep.duration_ms)}
                        onChange={(event) => updateSelectedStep((step) => ({ ...step, duration_ms: Number(event.currentTarget.value) || 0 }))}
                      />
                      <TextInput
                        id="labs-step-title"
                        labelText="Display title"
                        value={previewRoutineStep.display?.title ?? ''}
                        onChange={(event) => updateSelectedStep((step) => ({
                          ...step,
                          display: {
                            title: event.currentTarget.value,
                            lines: coerceLines(step),
                          },
                        }))}
                      />
                      <TextInput
                        id="labs-step-line-1"
                        labelText="Display line 1"
                        value={coerceLines(previewRoutineStep)[0]}
                        onChange={(event) => {
                          const lines = coerceLines(previewRoutineStep)
                          lines[0] = event.currentTarget.value
                          updateSelectedStep((step) => ({
                            ...step,
                            display: {
                              title: step.display?.title ?? '',
                              lines,
                            },
                          }))
                        }}
                      />
                      <TextInput
                        id="labs-step-line-2"
                        labelText="Display line 2"
                        value={coerceLines(previewRoutineStep)[1]}
                        onChange={(event) => {
                          const lines = coerceLines(previewRoutineStep)
                          lines[1] = event.currentTarget.value
                          updateSelectedStep((step) => ({
                            ...step,
                            display: {
                              title: step.display?.title ?? '',
                              lines,
                            },
                          }))
                        }}
                      />
                      <TextInput
                        id="labs-step-line-3"
                        labelText="Display line 3"
                        value={coerceLines(previewRoutineStep)[2]}
                        onChange={(event) => {
                          const lines = coerceLines(previewRoutineStep)
                          lines[2] = event.currentTarget.value
                          updateSelectedStep((step) => ({
                            ...step,
                            display: {
                              title: step.display?.title ?? '',
                              lines,
                            },
                          }))
                        }}
                      />
                      <TextInput
                        id="labs-step-line-4"
                        labelText="Display line 4"
                        value={coerceLines(previewRoutineStep)[3]}
                        onChange={(event) => {
                          const lines = coerceLines(previewRoutineStep)
                          lines[3] = event.currentTarget.value
                          updateSelectedStep((step) => ({
                            ...step,
                            display: {
                              title: step.display?.title ?? '',
                              lines,
                            },
                          }))
                        }}
                      />
                    </div>
                    <p className="labs-page__step-helper">
                      Tokens supported in display text: <code>{'{node_name}'}</code>, <code>{'{firmware_profile}'}</code>, <code>{'{current_preset}'}</code>, <code>{'{cpu_load}'}</code>, <code>{'{node_score}'}</code>, and <code>{'{cluster_status}'}</code>.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}

            <RoutineExamples routines={effectiveEditorState?.welcome_routines ?? []} />
              </>
            )}
          </Tile>
        </div>
      </div>

      {showFallbackConfirmationModal ? (
        <Modal
          open
          modalHeading={pendingActionLabel}
          primaryButtonText="Accept on page"
          secondaryButtonText="Reject"
          onRequestClose={() => {
            void confirmationMutation.mutateAsync(
              activePendingConfirmation?.reject_command ?? 'reject_pending_confirmation',
            )
          }}
          onSecondarySubmit={() => {
            void confirmationMutation.mutateAsync(
              activePendingConfirmation?.reject_command ?? 'reject_pending_confirmation',
            )
          }}
          onRequestSubmit={() => {
            void confirmationMutation.mutateAsync(
              activePendingConfirmation?.accept_command ?? 'accept_pending_confirmation',
            )
          }}
        >
          <p>
            No Push hardware is connected, so the guarded action is mirrored here using the same backend
            confirmation contract as the hardware flow.
          </p>
          <p>{activePendingConfirmation?.target_display_name ?? 'Pending target'}</p>
          <p>{activePendingConfirmation?.device_identity ?? 'Push device'}</p>
        </Modal>
      ) : null}
    </div>
  )
}

export default PushSurfacePage
