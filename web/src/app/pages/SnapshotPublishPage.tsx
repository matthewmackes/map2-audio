import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckmarkFilled, Launch, Renew, WarningFilled } from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tag,
  Tile,
} from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { flowSnapshotDataToSnapshotPayload, snapshotDetailToDraftData, snapshotsApi } from '../../map2/clients/snapshots'
import type { ClusterNodeSummary } from '../../map2/clients/snapshots'
import { audioApi } from '../../map2/api'
import type {
  ChannelConfirmationState,
  NodeConfirmationState,
  PublishBlocker,
  PublishRepairAction,
  SnapshotDeployment,
  SnapshotActivationAuditEvent,
  SnapshotActivationIntent,
  SnapshotPublishReadiness,
} from '../../map2/types'
import {
  SNAPSHOT_IO_USE_DEFAULT_OPTION,
  collectMonitoringOutputPairOptions,
  collectSnapshotIoDeviceOptions,
  normalizeSelectDeviceValue,
} from '../utils/snapshotIoBindings'
import { SnapshotPublishAudioPortWorkspace } from '../components/snapshots/SnapshotPublishAudioPortWorkspace'
import { PublishPerformanceShell } from '../components/snapshots/publish/PublishPerformanceShell'
import { RoutingTopologyContent } from '../components/modals/RoutingTopologyContent'
import { fingerprintSnapshotData } from '../components/SnapshotEditor/snapshotEditorComparison'
import type { JuceGridRoutingFlowInfo } from '../components/SnapshotEditor/SnapshotEditorRoutingVisualizer'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { useToasts } from '../components/Toasts'
import { useCommittedAudioState, useDesiredAudioState, useObservedAudioState } from '../hooks/useAuthoritativeAudioState'
import { isSnapshotFlowRoute, usePendingLiveChangesNavigationGuard } from '../hooks/usePendingLiveChangesNavigationGuard'
import { useSnapshotActivationEvents, useSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import {
  clearLiveWorkingSnapshotDraft,
  readCompatibleLiveWorkingSnapshotDraft,
  readLiveWorkingSnapshotDraft,
  type LiveWorkingSnapshotDraftRecord,
} from '../utils/liveWorkingSnapshotDraft'
import { buildWorkspaceArtifactsPath } from './audioArtifactsRoutes'
import { buildSnapshotWorkflowStageToast } from '../utils/snapshotActivationToast'
import './SnapshotPublishPage.css'

type PublishMode = 'performance' | 'wizard' | 'advanced'
type PublishSection = 'overview' | 'devices' | 'routing' | 'runtime' | 'cleanup'
type WizardStepId = 'save' | 'host' | 'sound' | 'review'
const LIVE_CHANGES_LEAVE_MESSAGE = 'You have unpublished live changes on this snapshot. Leaving this flow will discard them.'
const WIZARD_STEP_ORDER: WizardStepId[] = ['save', 'host', 'sound', 'review']
const PUBLISH_LIVE_HINT = 'Publish makes the audio chain live'

type SummaryCard = {
  id: string
  label: string
  value: string
  tone: 'green' | 'red' | 'cool-gray' | 'warm-gray'
}

type HostWorkflowCard = {
  id: string
  label: string
  hostname: string
  status: string
  isSelected: boolean
  isCurrentDeployment: boolean
}

function toPublishMode(value: string | null): PublishMode {
  if (value === 'wizard' || value === 'guided') {
    return 'wizard'
  }
  if (value === 'performance' || value === 'going-live' || value === 'going_live') {
    return 'performance'
  }
  return 'advanced'
}

function toPublishSection(value: string | null): PublishSection {
  switch (value) {
    case 'devices':
    case 'routing':
    case 'runtime':
    case 'cleanup':
      return value
    default:
      return 'overview'
  }
}

function normalizeMonitoringOutputValue(value: string | null | undefined): number | null {
  if (!value || value === SNAPSHOT_IO_USE_DEFAULT_OPTION) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function statusTagType(status: SnapshotPublishReadiness['status']): 'green' | 'red' | 'cool-gray' | 'warm-gray' {
  switch (status) {
    case 'ready':
    case 'live_confirmed':
      return 'green'
    case 'blocked':
    case 'diverged':
      return 'red'
    case 'waiting_for_confirmation':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function requirementIsResolved(
  requirement: SnapshotPublishReadiness['requirements'][number] | null | undefined,
): boolean {
  return requirement?.status === 'ready' || requirement?.status === 'not_applicable'
}

function isAutoSaveOnlyBlocker(blockers: SnapshotPublishReadiness['blockers']): boolean {
  return blockers.length > 0 && blockers.every((blocker) => blocker.code === 'unsaved_draft')
}

function formatRelativeRequest(event: SnapshotActivationAuditEvent | null): string {
  if (!event?.requested_at) {
    return 'No publish request yet'
  }
  const requestedMs = Date.parse(event.requested_at)
  if (!Number.isFinite(requestedMs)) {
    return 'Publish requested'
  }
  const seconds = Math.max(0, Math.round((Date.now() - requestedMs) / 1000))
  if (seconds < 60) {
    return `Publish requested ${seconds}s ago`
  }
  const minutes = Math.round(seconds / 60)
  return `Publish requested ${minutes}m ago`
}

function summarizeDraft(readiness: SnapshotPublishReadiness, hasEditorWorkingDraft: boolean): SummaryCard {
  if (hasEditorWorkingDraft) {
    return {
      id: 'draft',
      label: 'Current draft',
      value: 'Live changes are still only in the editor',
      tone: 'red',
    }
  }

  return readiness.draft_revision_id
    ? {
        id: 'draft',
        label: 'Current draft',
        value: `Saved as revision ${readiness.draft_revision_id}`,
        tone: 'green',
      }
    : {
        id: 'draft',
        label: 'Current draft',
        value: 'Save the draft in the editor before publishing',
        tone: 'red',
      }
}

function summarizeRequested(readiness: SnapshotPublishReadiness, event: SnapshotActivationAuditEvent | null): SummaryCard {
  return readiness.requested_revision_id
    ? {
        id: 'requested',
        label: 'Requested live state',
        value: formatRelativeRequest(event),
        tone: readiness.confirmed_revision_id ? 'green' : 'warm-gray',
      }
    : {
        id: 'requested',
        label: 'Requested live state',
        value: 'Nothing has been requested yet',
        tone: 'cool-gray',
      }
}

function summarizeConfirmed(readiness: SnapshotPublishReadiness, event: SnapshotActivationAuditEvent | null): SummaryCard {
  if (readiness.confirmed_revision_id) {
    return {
      id: 'confirmed',
      label: 'Confirmed live state',
      value: `Revision ${readiness.confirmed_revision_id} is live`,
      tone: 'green',
    }
  }
  if (event?.outcome === 'failed') {
    return {
      id: 'confirmed',
      label: 'Confirmed live state',
      value: 'The last publish failed before confirmation',
      tone: 'red',
    }
  }
  if (readiness.requested_revision_id) {
    return {
      id: 'confirmed',
      label: 'Confirmed live state',
      value: 'Waiting for runtime confirmation',
      tone: 'warm-gray',
    }
  }
  return {
    id: 'confirmed',
    label: 'Confirmed live state',
    value: 'No live confirmation for this snapshot yet',
    tone: 'cool-gray',
  }
}

function pickCurrentIssue(readiness: SnapshotPublishReadiness): PublishBlocker | null {
  return readiness.blockers[0] ?? readiness.warnings[0] ?? null
}

function findRequirement(readiness: SnapshotPublishReadiness, requirementId: string) {
  return readiness.requirements.find((requirement) => requirement.id === requirementId) ?? null
}

function resolveRepairs(readiness: SnapshotPublishReadiness, issue: PublishBlocker | null): PublishRepairAction[] {
  if (!issue?.repair_action_id) {
    return []
  }
  return readiness.available_repairs.filter((repair) => repair.id === issue.repair_action_id)
}

function getLatestSnapshotEvent(events: SnapshotActivationAuditEvent[] | undefined, snapshotId: number): SnapshotActivationAuditEvent | null {
  return events?.find((event) => event.snapshot_id === snapshotId) ?? null
}

function asNodeConfirmations(event: SnapshotActivationAuditEvent | null): NodeConfirmationState[] {
  const raw = event?.runtime_metrics?.node_confirmations
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return []
  }
  return Object.values(raw as Record<string, NodeConfirmationState>)
}

function asChannelConfirmations(event: SnapshotActivationAuditEvent | null): ChannelConfirmationState[] {
  const raw = event?.runtime_metrics?.channel_confirmations
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return []
  }
  return Object.values(raw as Record<string, ChannelConfirmationState>)
}

function buildIssueMetadata(issue: PublishBlocker | null, event: SnapshotActivationAuditEvent | null) {
  if (!issue && !event) {
    return []
  }

  const rows: Array<{ label: string; value: string }> = []
  if (issue?.code) {
    rows.push({ label: 'Issue code', value: issue.code })
  }
  if (event?.request_id) {
    rows.push({ label: 'Request ID', value: event.request_id })
  }
  if (event?.node_id) {
    rows.push({ label: 'Node', value: event.node_id })
  }
  if (event?.triggered_by) {
    rows.push({ label: 'Triggered by', value: event.triggered_by })
  }
  if (issue?.repair_action_id) {
    rows.push({ label: 'Repair action', value: issue.repair_action_id })
  }
  if (issue?.related_node_ids?.length) {
    rows.push({ label: 'Related nodes', value: issue.related_node_ids.join(', ') })
  }
  if (issue?.related_path_ids?.length) {
    rows.push({ label: 'Related paths', value: issue.related_path_ids.join(', ') })
  }
  return rows
}

function buildDiffRows(args: {
  readiness: SnapshotPublishReadiness
  snapshot: Awaited<ReturnType<typeof snapshotsApi.get>>
  requestedInput?: string | null
  requestedOutput?: string | null
  confirmedInput?: string | null
  confirmedOutput?: string | null
}) {
  const {
    readiness,
    snapshot,
    requestedInput,
    requestedOutput,
    confirmedInput,
    confirmedOutput,
  } = args

  return [
    {
      label: 'Revision',
      draft: readiness.draft_revision_id ? String(readiness.draft_revision_id) : 'Not saved',
      requested: readiness.requested_revision_id ? String(readiness.requested_revision_id) : 'Not requested',
      confirmed: readiness.confirmed_revision_id ? String(readiness.confirmed_revision_id) : 'Not confirmed',
    },
    {
      label: 'Routing mode',
      draft: snapshot.routing.mode,
      requested: snapshot.routing.mode,
      confirmed: snapshot.live_state?.display_label ?? 'Waiting for confirmation',
    },
    {
      label: 'Input device',
      draft: snapshot.input_device ?? 'Default input',
      requested: requestedInput ?? 'Not requested',
      confirmed: confirmedInput ?? 'Waiting for confirmation',
    },
    {
      label: 'Output device',
      draft: snapshot.output_device ?? 'Default output',
      requested: requestedOutput ?? 'Not requested',
      confirmed: confirmedOutput ?? 'Waiting for confirmation',
    },
    {
      label: 'Paths',
      draft: String(snapshot.paths.length),
      requested: String(snapshot.paths.length),
      confirmed: snapshot.live_state?.paths.length ? String(snapshot.live_state.paths.length) : 'Waiting for confirmation',
    },
  ]
}

function resolveSelectedDeployment(snapshot: Awaited<ReturnType<typeof snapshotsApi.get>> | null): SnapshotDeployment | null {
  return snapshot?.deployments?.[0] ?? null
}

function resolveTagTypeForNodeStatus(status: string): 'green' | 'red' | 'cool-gray' | 'warm-gray' {
  switch (status.toLowerCase()) {
    case 'online':
    case 'active':
      return 'green'
    case 'degraded':
    case 'maintenance':
      return 'warm-gray'
    case 'offline':
    case 'failed':
      return 'red'
    default:
      return 'cool-gray'
  }
}

function buildFlowSteps(readiness: SnapshotPublishReadiness, issue: PublishBlocker | null) {
  return [
    {
      id: 'draft',
      label: 'Draft saved',
      state: readiness.draft_revision_id ? 'complete' : 'pending',
    },
    {
      id: 'checks',
      label: 'Readiness checks',
      state: readiness.blockers.length === 0 ? 'complete' : 'failed',
    },
    {
      id: 'request',
      label: 'Publish request',
      state: readiness.requested_revision_id ? 'complete' : issue ? 'pending' : 'pending',
    },
    {
      id: 'confirm',
      label: 'Live confirmation',
      state: readiness.confirmed_revision_id
        ? 'complete'
        : readiness.requested_revision_id
          ? 'active'
          : 'pending',
    },
  ] as const
}

function buildIssueContextMessage(readiness: SnapshotPublishReadiness, issue: PublishBlocker | null): string | null {
  const networkRouting = findRequirement(readiness, 'network_routing')
  const isLocalOnlyPublish = networkRouting?.status === 'not_applicable'
  if (issue?.code === 'unsaved_draft') {
    return isLocalOnlyPublish
      ? 'MAP2 will save this snapshot as a revision first. After that it will ask the local runtime on this machine to publish it and confirm that the channels are live.'
      : 'MAP2 needs a saved revision before it can send a publish request.'
  }
  if (issue?.code === 'engine_unavailable' && isLocalOnlyPublish) {
    return 'This snapshot stays on the local node on this machine. MAP2 is not waiting for a remote node. It is waiting for the local audio engine to start responding so it can accept the publish request.'
  }
  if (isLocalOnlyPublish && readiness.requested_revision_id && !readiness.confirmed_revision_id) {
    return 'This snapshot is already scoped to the local node on this machine. MAP2 is waiting for the local runtime to confirm that the publish finished and the channels are live.'
  }
  if (isLocalOnlyPublish && !readiness.requested_revision_id) {
    return 'This snapshot is local-only. After you publish it, MAP2 will wait for the local runtime on this machine to confirm that the channels are live.'
  }
  return null
}

export function SnapshotPublishPage() {
  const { snapshotId: snapshotIdParam } = useParams<{ snapshotId: string }>()
  const snapshotId = Number(snapshotIdParam)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const mode = toPublishMode(searchParams.get('mode'))
  const section = toPublishSection(searchParams.get('section'))
  const isValidSnapshotId = Number.isFinite(snapshotId) && snapshotId > 0

  const snapshotQuery = useQuery({
    queryKey: ['snapshots', 'detail', snapshotId],
    queryFn: () => snapshotsApi.get(snapshotId),
    enabled: isValidSnapshotId,
  })
  const readinessQuery = useQuery({
    queryKey: ['snapshots', 'publish-readiness', snapshotId],
    queryFn: () => snapshotsApi.getPublishReadiness(snapshotId),
    enabled: isValidSnapshotId,
    refetchInterval: 5_000,
  })

  const runtimeStateQuery = useSnapshotRuntimeLiveState(undefined, {
    enabled: isValidSnapshotId,
    refetchInterval: 5_000,
  })
  const activationEventsQuery = useSnapshotActivationEvents(undefined, {
    enabled: isValidSnapshotId,
    limit: 12,
    refetchInterval: 5_000,
  })
  const committedStateQuery = useCommittedAudioState({ enabled: isValidSnapshotId, refetchInterval: 5_000 })
  const desiredStateQuery = useDesiredAudioState({ enabled: isValidSnapshotId, refetchInterval: 5_000 })
  const observedStateQuery = useObservedAudioState(committedStateQuery.data?.value.state_version, {
    enabled: isValidSnapshotId,
    refetchInterval: 5_000,
  })
  const nodesQuery = useQuery({
    queryKey: ['snapshots', 'cluster-nodes'],
    queryFn: () => snapshotsApi.listNodes(),
    enabled: isValidSnapshotId,
    staleTime: 10_000,
  })
  const snapshotIoDefaultsQuery = useQuery({
    queryKey: ['config', 'snapshot-io-defaults'],
    queryFn: async (): Promise<{
      input_device: string | null
      output_device: string | null
      monitoring_output_index: number | null
    }> => {
      const response = await fetch('/api/cluster/config/runtime')
      if (!response.ok) {
        throw new Error('Failed to load snapshot I/O defaults')
      }
      const payload = await response.json() as {
        config?: {
          snapshots?: {
            default_input_device?: string | null
            default_output_device?: string | null
            default_monitoring_output_index?: number | null
          }
        }
      }
      const snapshotsConfig = payload.config?.snapshots ?? {}
      return {
        input_device: typeof snapshotsConfig.default_input_device === 'string' ? snapshotsConfig.default_input_device : null,
        output_device: typeof snapshotsConfig.default_output_device === 'string' ? snapshotsConfig.default_output_device : null,
        monitoring_output_index: typeof snapshotsConfig.default_monitoring_output_index === 'number'
          ? snapshotsConfig.default_monitoring_output_index
          : null,
      }
    },
    enabled: isValidSnapshotId,
    staleTime: 10_000,
  })

  const hostSectionRef = useRef<HTMLElement | null>(null)
  const ioSectionRef = useRef<HTMLElement | null>(null)
  const routingSectionRef = useRef<HTMLElement | null>(null)
  const confirmationSectionRef = useRef<HTMLElement | null>(null)
  const publishSectionRef = useRef<HTMLElement | null>(null)
  const issueSectionRef = useRef<HTMLElement | null>(null)

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [sessionInputValue, setSessionInputValue] = useState<string>(SNAPSHOT_IO_USE_DEFAULT_OPTION)
  const [sessionOutputValue, setSessionOutputValue] = useState<string>(SNAPSHOT_IO_USE_DEFAULT_OPTION)
  const [sessionMonitoringValue, setSessionMonitoringValue] = useState<string>(SNAPSHOT_IO_USE_DEFAULT_OPTION)
  const [saveRigDefaults, setSaveRigDefaults] = useState(false)
  const [editorWorkingDraft, setEditorWorkingDraft] = useState<LiveWorkingSnapshotDraftRecord | null>(null)
  const [activeWizardStep, setActiveWizardStep] = useState<WizardStepId>('save')

  const hostAudioStatusQuery = useQuery({
    queryKey: ['audio', 'status', 'publish', selectedHostId ?? 'none'],
    queryFn: () => audioApi.getStatus(selectedHostId),
    enabled: Boolean(selectedHostId),
    staleTime: 5_000,
  })
  const hostPortsQuery = useQuery({
    queryKey: ['audio', 'ports', 'publish', selectedHostId ?? 'none'],
    queryFn: () => audioApi.getPorts(selectedHostId),
    enabled: Boolean(selectedHostId),
    staleTime: 5_000,
  })

  const refreshPublishState = () => {
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', snapshotId] })
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'publish-readiness', snapshotId] })
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime'] })
    void queryClient.invalidateQueries({ queryKey: ['audio-state'] })
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'cluster-nodes'] })
  }

  const activateMutation = useMutation({
    mutationFn: async () => {
      const { savedDraftRevision, savedEditorDraft } = await persistSavedRevisionIfNeeded()

      try {
        const activation = await snapshotsApi.activate(snapshotId)
        return {
          activation,
          savedDraftRevision,
          savedEditorDraft,
        }
      } catch (error) {
        if ((savedEditorDraft || savedDraftRevision) && error instanceof Error) {
          const prefix = savedEditorDraft
            ? 'Editor live changes were saved'
            : 'The snapshot draft was saved'
          throw new Error(`${prefix}, but publish failed: ${error.message}`)
        }
        throw error
      }
    },
    onSuccess: ({ activation, savedDraftRevision, savedEditorDraft }) => {
      refreshPublishState()
      const operatorMessage =
        activation.operator_message
          ?? (savedEditorDraft
            ? 'Editor live changes saved and publish requested'
            : savedDraftRevision
              ? 'Draft saved and publish requested'
              : 'Publish requested')
      const stageToast = buildSnapshotWorkflowStageToast({
        workflowId: 'snapshot-publish',
        snapshotId,
        snapshotName: snapshot?.name ?? `Snapshot ${snapshotId}`,
        title: activation.status === 'degraded' ? 'Publish warning' : 'Publish requested',
        message: operatorMessage,
        severity: activation.status === 'degraded' ? 'warning' : 'success',
        nodeId: activation.node_id ?? selectedHostId ?? null,
        durationMs: 8000,
      })
      pushToast(
        operatorMessage,
        activation.status === 'degraded' ? 'warn' : 'success',
        {
          id: stageToast.options.id,
          title: stageToast.title,
          stage: stageToast.options.stage,
          durationMs: 8000,
        },
      )
    },
    onError: (error) => {
      refreshPublishState()
      pushToast(error instanceof Error ? error.message : 'Publish failed', 'error')
    },
  })
  const saveDraftMutation = useMutation({
    mutationFn: () => persistSavedRevisionIfNeeded(),
    onSuccess: ({ savedDraftRevision, savedEditorDraft, snapshot: savedSnapshot }) => {
      refreshPublishState()
      if (savedEditorDraft) {
        pushToast('Editor live changes saved as the next publish revision', 'success')
        return
      }
      if (savedDraftRevision) {
        pushToast(`Saved draft as revision ${savedSnapshot?.revision_number ?? readiness?.draft_revision_id ?? 'current'}`, 'success')
        return
      }
      pushToast('Draft is already saved', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to save draft', 'error')
    },
  })
  const retryMutation = useMutation({
    mutationFn: () => snapshotsApi.retryPublish(snapshotId),
    onSuccess: (response) => {
      refreshPublishState()
      const operatorMessage = response.operator_message ?? 'Publish retried'
      const stageToast = buildSnapshotWorkflowStageToast({
        workflowId: 'snapshot-publish-retry',
        snapshotId,
        snapshotName: snapshot?.name ?? `Snapshot ${snapshotId}`,
        title: response.status === 'degraded' ? 'Retry warning' : 'Publish retried',
        message: operatorMessage,
        severity: response.status === 'degraded' ? 'warning' : 'success',
        nodeId: selectedHostId ?? null,
      })
      pushToast(operatorMessage, response.status === 'degraded' ? 'warn' : 'success', {
        id: stageToast.options.id,
        title: stageToast.title,
        stage: stageToast.options.stage,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Retry failed', 'error')
    },
  })
  const repairMutation = useMutation({
    mutationFn: (repairActionId: string) => snapshotsApi.runPublishRepairAction(snapshotId, repairActionId),
    onSuccess: (response) => {
      refreshPublishState()
      const operatorMessage = response.operator_message ?? 'Repair action requested'
      const stageToast = buildSnapshotWorkflowStageToast({
        workflowId: 'snapshot-publish-repair',
        snapshotId,
        snapshotName: snapshot?.name ?? `Snapshot ${snapshotId}`,
        title: response.status === 'degraded' ? 'Repair warning' : 'Repair requested',
        message: operatorMessage,
        severity: response.status === 'degraded' ? 'warning' : 'success',
        nodeId: selectedHostId ?? null,
      })
      pushToast(
        operatorMessage,
        response.status === 'degraded' ? 'warn' : 'success',
        {
          id: stageToast.options.id,
          title: stageToast.title,
          stage: stageToast.options.stage,
        },
      )
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Repair action failed', 'error')
    },
  })

  const loading = snapshotQuery.isLoading || readinessQuery.isLoading
  const readiness = readinessQuery.data ?? null
  const snapshot = snapshotQuery.data ?? null
  const latestEvent = useMemo(
    () => (isValidSnapshotId ? getLatestSnapshotEvent(activationEventsQuery.data?.events, snapshotId) : null),
    [activationEventsQuery.data?.events, isValidSnapshotId, snapshotId],
  )
  const currentIssue = readiness ? pickCurrentIssue(readiness) : null
  const currentRepairs = readiness ? resolveRepairs(readiness, currentIssue) : []
  const issueContextMessage = readiness ? buildIssueContextMessage(readiness, currentIssue) : null
  const issueMetadata = useMemo(() => buildIssueMetadata(currentIssue, latestEvent), [currentIssue, latestEvent])
  const nodeConfirmations = useMemo(() => asNodeConfirmations(latestEvent), [latestEvent])
  const channelConfirmations = useMemo(() => asChannelConfirmations(latestEvent), [latestEvent])
  const selectedDeployment = useMemo(() => resolveSelectedDeployment(snapshot), [snapshot])
  const clusterNodes = nodesQuery.data?.nodes ?? []
  const fallbackLocalHostId = useMemo(
    () => selectedDeployment?.primary_node_id ?? runtimeStateQuery.data?.node_id ?? latestEvent?.node_id ?? null,
    [latestEvent?.node_id, runtimeStateQuery.data?.node_id, selectedDeployment?.primary_node_id],
  )

  useEffect(() => {
    if (!snapshot) {
      return
    }
    const preferredNodeId = selectedDeployment?.primary_node_id
      ?? fallbackLocalHostId
      ?? clusterNodes.find((node) => typeof node.id === 'string' && node.id.trim())?.id
      ?? null
    setSelectedHostId((current) => current ?? preferredNodeId)
  }, [clusterNodes, fallbackLocalHostId, selectedDeployment?.primary_node_id, snapshot])

  useEffect(() => {
    if (!snapshot) {
      return
    }
    setSessionInputValue(snapshot.input_device ?? SNAPSHOT_IO_USE_DEFAULT_OPTION)
    setSessionOutputValue(snapshot.output_device ?? SNAPSHOT_IO_USE_DEFAULT_OPTION)
    setSessionMonitoringValue(
      snapshot.controls?.monitoring_output_index != null
        ? String(snapshot.controls.monitoring_output_index)
        : snapshot.io_bindings?.monitoring_output_index != null
          ? String(snapshot.io_bindings.monitoring_output_index)
          : SNAPSHOT_IO_USE_DEFAULT_OPTION,
    )
  }, [
    snapshot?.controls?.monitoring_output_index,
    snapshot?.id,
    snapshot?.input_device,
    snapshot?.io_bindings?.monitoring_output_index,
    snapshot?.output_device,
  ])

  const snapshotBaseFingerprint = useMemo(
    () => (snapshot ? fingerprintSnapshotData(snapshotDetailToDraftData(snapshot)) : null),
    [snapshot],
  )

  useEffect(() => {
    if (!snapshot || !snapshotBaseFingerprint) {
      setEditorWorkingDraft(null)
      return
    }

    const compatibleDraft = readCompatibleLiveWorkingSnapshotDraft(snapshot.id, snapshotBaseFingerprint)
    if (compatibleDraft) {
      setEditorWorkingDraft(compatibleDraft)
      return
    }

    if (readLiveWorkingSnapshotDraft(snapshot.id)) {
      clearLiveWorkingSnapshotDraft(snapshot.id)
    }

    setEditorWorkingDraft(null)
  }, [snapshot, snapshotBaseFingerprint])

  const persistEditorWorkingDraftIfNeeded = useCallback(async () => {
    if (!editorWorkingDraft) {
      return {
        savedEditorDraft: false,
        snapshot,
      }
    }

    const updateResponse = await snapshotsApi.update(snapshotId, {
      ...flowSnapshotDataToSnapshotPayload(editorWorkingDraft.draft),
      create_revision: true,
    })
    queryClient.setQueryData(['snapshots', 'detail', snapshotId], updateResponse.snapshot)
    clearLiveWorkingSnapshotDraft(snapshotId)
    setEditorWorkingDraft(null)

    return {
      savedEditorDraft: true,
      snapshot: updateResponse.snapshot,
    }
  }, [editorWorkingDraft, queryClient, snapshot, snapshotId])

  const persistSavedRevisionIfNeeded = useCallback(async () => {
    const persistedEditorDraft = await persistEditorWorkingDraftIfNeeded()
    const currentSnapshot = persistedEditorDraft.snapshot ?? snapshot
    const currentRevisionNumber = currentSnapshot?.revision_number ?? readiness?.draft_revision_id ?? null

    if (currentSnapshot && currentRevisionNumber != null) {
      return {
        savedEditorDraft: persistedEditorDraft.savedEditorDraft,
        savedDraftRevision: false,
        snapshot: currentSnapshot,
      }
    }

    if (!currentSnapshot) {
      return {
        savedEditorDraft: persistedEditorDraft.savedEditorDraft,
        savedDraftRevision: false,
        snapshot: currentSnapshot,
      }
    }

    const updateResponse = await snapshotsApi.update(snapshotId, {
      create_revision: true,
    })
    queryClient.setQueryData(['snapshots', 'detail', snapshotId], updateResponse.snapshot)

    return {
      savedEditorDraft: persistedEditorDraft.savedEditorDraft,
      savedDraftRevision: true,
      snapshot: updateResponse.snapshot,
    }
  }, [persistEditorWorkingDraftIfNeeded, queryClient, readiness?.draft_revision_id, snapshot, snapshotId])

  const summaryCards = useMemo(() => {
    if (!readiness) {
      return []
    }
    return [
      summarizeDraft(readiness, Boolean(editorWorkingDraft)),
      summarizeRequested(readiness, latestEvent),
      summarizeConfirmed(readiness, latestEvent),
    ]
  }, [editorWorkingDraft, latestEvent, readiness])

  const observedSummary = observedStateQuery.data?.observations[0]?.value
  const diffRows = useMemo(() => {
    if (!readiness || !snapshot) {
      return []
    }
    return buildDiffRows({
      readiness,
      snapshot,
      requestedInput: desiredStateQuery.data?.value.io.requested_input_device,
      requestedOutput: desiredStateQuery.data?.value.io.requested_output_device,
      confirmedInput: observedSummary?.effective_input_device ?? committedStateQuery.data?.value.observed_summary.effective_input_device,
      confirmedOutput: observedSummary?.effective_output_device ?? committedStateQuery.data?.value.observed_summary.effective_output_device,
    })
  }, [committedStateQuery.data?.value.observed_summary.effective_input_device, committedStateQuery.data?.value.observed_summary.effective_output_device, desiredStateQuery.data?.value.io.requested_input_device, desiredStateQuery.data?.value.io.requested_output_device, observedSummary?.effective_input_device, observedSummary?.effective_output_device, readiness, snapshot])

  const hostDeployMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      if (!snapshot) {
        throw new Error('Snapshot host cannot be changed before the snapshot loads.')
      }
      const { savedEditorDraft } = await persistEditorWorkingDraftIfNeeded()
      const response = await snapshotsApi.deploy({
        snapshot_id: snapshot.id,
        node_id: nodeId,
        redundancy_enabled: selectedDeployment?.redundancy_enabled ?? false,
      })
      return {
        response,
        savedEditorDraft,
      }
    },
    onSuccess: ({ response, savedEditorDraft }) => {
      setSelectedHostId(response.node_id)
      refreshPublishState()
      const remoteActivation = (response.deployment as SnapshotDeployment & { remote_activation?: { message?: string } }).remote_activation
      const operatorMessage =
        remoteActivation?.message
          ?? (savedEditorDraft
            ? `Editor live changes saved and live host moved to ${response.node_id}`
            : `Live host moved to ${response.node_id}`)
      const stageToast = buildSnapshotWorkflowStageToast({
        workflowId: 'snapshot-move-host',
        snapshotId,
        snapshotName: snapshot?.name ?? `Snapshot ${snapshotId}`,
        title: 'Live host moved',
        message: operatorMessage,
        severity: 'success',
        nodeId: response.node_id,
      })
      pushToast(
        operatorMessage,
        'success',
        {
          id: stageToast.options.id,
          title: stageToast.title,
          stage: stageToast.options.stage,
        },
      )
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to move the live host', 'error')
    },
  })

  const applySnapshotIoMutation = useMutation({
    mutationFn: async () => {
      if (!snapshot) {
        throw new Error('Snapshot devices cannot be updated before the snapshot loads.')
      }

      const persisted = await persistEditorWorkingDraftIfNeeded()
      const currentSnapshot = persisted.snapshot ?? snapshot

      const inputDevice = normalizeSelectDeviceValue(sessionInputValue)
      const outputDevice = normalizeSelectDeviceValue(sessionOutputValue)
      const monitoringOutputIndex = normalizeMonitoringOutputValue(sessionMonitoringValue)

      if (saveRigDefaults) {
        const currentDefaults = snapshotIoDefaultsQuery.data
        const nextDefaults = {
          input_device: inputDevice,
          output_device: outputDevice,
          monitoring_output_index: monitoringOutputIndex,
        }

        if (nextDefaults.input_device !== currentDefaults?.input_device) {
          await fetch('/api/cluster/config/runtime', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: 'snapshots.default_input_device',
              value: nextDefaults.input_device,
              scope: 'cluster',
            }),
          })
        }

        if (nextDefaults.output_device !== currentDefaults?.output_device) {
          await fetch('/api/cluster/config/runtime', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: 'snapshots.default_output_device',
              value: nextDefaults.output_device,
              scope: 'cluster',
            }),
          })
        }

        if (nextDefaults.monitoring_output_index !== currentDefaults?.monitoring_output_index) {
          await fetch('/api/cluster/config/runtime', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: 'snapshots.default_monitoring_output_index',
              value: nextDefaults.monitoring_output_index,
              scope: 'cluster',
            }),
          })
        }
      }

      const response = await snapshotsApi.update(snapshot.id, {
        input_device: inputDevice,
        output_device: outputDevice,
        controls: {
          ...(currentSnapshot?.controls ?? {}),
          monitoring_output_index: monitoringOutputIndex,
        },
      })
      return {
        response,
        savedEditorDraft: persisted.savedEditorDraft,
      }
    },
    onSuccess: ({ savedEditorDraft }) => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', snapshotId] })
      void queryClient.invalidateQueries({ queryKey: ['config', 'snapshot-io-defaults'] })
      pushToast(
        saveRigDefaults
          ? (savedEditorDraft
            ? 'Editor live changes saved, then session devices updated and stored as rig defaults'
            : 'Session devices updated and saved as rig defaults')
          : (savedEditorDraft
            ? 'Editor live changes saved, then session devices updated'
            : 'Session devices updated'),
        'success',
      )
      setSaveRigDefaults(false)
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update session devices', 'error')
    },
  })

  const updateRoutingMutation = useMutation({
    mutationFn: async (updates: {
      mode?: 'parallel_blend' | 'series' | 'morph' | 'sidechain' | 'ab_switch'
      active_channel_key?: string | null
      morph_position?: number
    }) => {
      if (!snapshot) {
        throw new Error('Snapshot routing cannot be updated before the snapshot loads.')
      }
      const { savedEditorDraft } = await persistEditorWorkingDraftIfNeeded()
      const response = await snapshotsApi.updateRouting(snapshot.id, updates)
      return {
        response,
        savedEditorDraft,
      }
    },
    onSuccess: ({ savedEditorDraft }) => {
      refreshPublishState()
      pushToast(savedEditorDraft ? 'Editor live changes saved, then live routing updated' : 'Live routing updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update live routing', 'error')
    },
  })

  const hostCards = useMemo<HostWorkflowCard[]>(() => {
    const cards = clusterNodes
      .filter((node: ClusterNodeSummary) => node.id.trim().length > 0)
      .map((node) => ({
        id: node.id,
        label: node.hostname?.trim() || node.id,
        hostname: node.id,
        status: typeof node.status === 'string' && node.status.trim() ? node.status : 'unknown',
        isSelected: selectedHostId === node.id,
        isCurrentDeployment: selectedDeployment?.primary_node_id === node.id,
      }))

    if (!cards.length && fallbackLocalHostId) {
      cards.push({
        id: fallbackLocalHostId,
        label: 'This machine',
        hostname: fallbackLocalHostId,
        status: runtimeStateQuery.data?.is_offline ? 'offline' : 'online',
        isSelected: selectedHostId === fallbackLocalHostId,
        isCurrentDeployment: true,
      })
    }

    return cards
  }, [clusterNodes, fallbackLocalHostId, runtimeStateQuery.data?.is_offline, selectedDeployment?.primary_node_id, selectedHostId])

  const hostDeviceOptions = useMemo(() => collectSnapshotIoDeviceOptions(hostAudioStatusQuery.data, {
    input: [
      snapshot?.input_device ?? null,
      snapshotIoDefaultsQuery.data?.input_device ?? null,
    ],
    output: [
      snapshot?.output_device ?? null,
      snapshotIoDefaultsQuery.data?.output_device ?? null,
    ],
  }), [
    hostAudioStatusQuery.data,
    snapshot?.input_device,
    snapshot?.output_device,
    snapshotIoDefaultsQuery.data?.input_device,
    snapshotIoDefaultsQuery.data?.output_device,
  ])

  const monitoringOutputOptions = useMemo(
    () => collectMonitoringOutputPairOptions(hostPortsQuery.data?.outputs ?? []),
    [hostPortsQuery.data?.outputs],
  )

  const activeChannelIndex = useMemo(() => {
    if (!snapshot) {
      return 0
    }
    const currentIndex = snapshot.channels.findIndex((channel) => channel.channel_key === snapshot.routing.active_channel_key)
    return currentIndex >= 0 ? currentIndex : 0
  }, [snapshot])

  const routingFocusButtons = useMemo(() => (
    snapshot?.channels.map((channel, index) => ({
      id: channel.channel_key,
      title: `Flow ${channel.label}`,
      caption: channel.chain_id != null ? `Chain ${channel.label}` : 'No chain assigned',
      active: index === activeChannelIndex,
      color: channel.color,
    })) ?? []
  ), [activeChannelIndex, snapshot?.channels])

  const routingVisualizerFlows = useMemo<JuceGridRoutingFlowInfo[]>(() => (
    snapshot?.channels.map((channel) => ({
      id: channel.channel_key,
      label: channel.label,
      color: channel.color,
      muted: channel.muted,
      active: snapshot.routing.active_channel_key === channel.channel_key,
      blendPercent: snapshot.routing.blend_positions[channel.channel_key] ?? 100,
    })) ?? []
  ), [snapshot])

  const liveConfirmationRows = useMemo(() => {
    if (!snapshot) {
      return []
    }
    const confirmationsByPathId = new Map(channelConfirmations.map((entry) => [entry.path_id, entry]))
    const livePathsById = new Map((snapshot.live_state?.paths ?? []).map((path) => [path.path_id, path]))
    return snapshot.channels.map((channel) => {
      const confirmation = confirmationsByPathId.get(channel.channel_key)
      const livePath = livePathsById.get(channel.channel_key)
      const status = confirmation?.status
        ?? livePath?.activation_status
        ?? (snapshot.live_state?.is_live ? 'live_confirmed' : 'pending')
      const message = confirmation?.operator_message
        ?? livePath?.runtime_chain_name
        ?? (snapshot.live_state?.is_live ? 'Channel is live on the selected host.' : 'Waiting for live confirmation.')
      return {
        id: channel.channel_key,
        label: channel.label,
        color: channel.color,
        status,
        message,
      }
    })
  }, [channelConfirmations, snapshot])

  const liveChangesPending = useMemo(() => {
    if (editorWorkingDraft) {
      return true
    }
    if (!readiness) {
      return false
    }
    if (readiness.requested_revision_id == null) {
      return Boolean(readiness.draft_revision_id)
    }
    return readiness.draft_revision_id !== readiness.requested_revision_id || readiness.confirmed_revision_id !== readiness.requested_revision_id
  }, [editorWorkingDraft, readiness])

  useEffect(() => {
    const sectionToRef: Partial<Record<PublishSection, RefObject<HTMLElement | null>>> = {
      devices: ioSectionRef,
      routing: routingSectionRef,
      runtime: confirmationSectionRef,
      cleanup: issueSectionRef,
    }
    const targetRef = sectionToRef[section]
    if (targetRef?.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [section])

  const flowSteps = readiness ? buildFlowSteps(readiness, currentIssue) : []
  const editorWorkingDraftPending = Boolean(editorWorkingDraft)
  const autoSaveOnlyBlocker = readiness ? isAutoSaveOnlyBlocker(readiness.blockers) : false
  const publishDisabled = !readiness
    || (!autoSaveOnlyBlocker && readiness.blockers.length > 0)
    || activateMutation.isPending
    || saveDraftMutation.isPending

  const inputRequirement = readiness ? findRequirement(readiness, 'input_device_available') : null
  const outputRequirement = readiness ? findRequirement(readiness, 'output_device_available') : null
  const monitoringRequirement = readiness ? findRequirement(readiness, 'monitoring_output') : null
  const soundStepComplete = Boolean(selectedHostId)
    && requirementIsResolved(inputRequirement)
    && requirementIsResolved(outputRequirement)
    && requirementIsResolved(monitoringRequirement)
  const saveStepComplete = !editorWorkingDraftPending && Boolean(readiness?.draft_revision_id)
  const hostStepComplete = Boolean(selectedHostId)
  const recommendedWizardStep: WizardStepId = !saveStepComplete
    ? 'save'
    : !hostStepComplete
      ? 'host'
      : !soundStepComplete
        ? 'sound'
        : 'review'

  useEffect(() => {
    setActiveWizardStep((currentStep) => {
      const currentIndex = WIZARD_STEP_ORDER.indexOf(currentStep)
      const recommendedIndex = WIZARD_STEP_ORDER.indexOf(recommendedWizardStep)
      if (currentIndex < 0) {
        return recommendedWizardStep
      }
      if (recommendedIndex < currentIndex) {
        return recommendedWizardStep
      }
      if (recommendedIndex > currentIndex && (
        (currentStep === 'save' && saveStepComplete)
        || (currentStep === 'host' && hostStepComplete)
        || (currentStep === 'sound' && soundStepComplete)
      )) {
        return recommendedWizardStep
      }
      return currentStep
    })
  }, [hostStepComplete, recommendedWizardStep, saveStepComplete, soundStepComplete])

  usePendingLiveChangesNavigationGuard({
    when: editorWorkingDraftPending,
    message: LIVE_CHANGES_LEAVE_MESSAGE,
    allowNavigation: (nextLocation) => isSnapshotFlowRoute(nextLocation.pathname, snapshot?.id ?? snapshotId),
  })

  const setMode = (nextMode: PublishMode) => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', nextMode)
    setSearchParams(next)
  }

  const openAdvancedMode = (nextSection: PublishSection = 'overview') => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', 'advanced')
    next.set('section', nextSection)
    setSearchParams(next)
  }

  const setSection = (nextSection: PublishSection) => {
    const next = new URLSearchParams(searchParams)
    next.set('section', nextSection)
    setSearchParams(next)
  }

  const openEditor = () => {
    navigate('/snapshot-editor')
  }

  const discardEditorWorkingDraft = () => {
    if (!snapshot) {
      return
    }

    clearLiveWorkingSnapshotDraft(snapshot.id)
    setEditorWorkingDraft(null)
    pushToast('Discarded the unpublished editor live changes', 'success')
  }

  const handleRepair = (repairAction: PublishRepairAction) => {
    if (repairAction.id === 'install_plugin') {
      navigate(buildWorkspaceArtifactsPath(new URLSearchParams({ category: 'lv2-plugins' })))
      return
    }
    if (repairAction.id === 'restore_asset') {
      navigate(buildWorkspaceArtifactsPath(new URLSearchParams({ category: 'snapshots' })))
      return
    }
    if (repairAction.id === 'select_available_device') {
      setSection('devices')
      if (mode === 'wizard') {
        setActiveWizardStep('sound')
      }
      ioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    repairMutation.mutate(repairAction.id)
  }

  const wizardSteps = [
    {
      id: 'save' as const,
      eyebrow: 'Step 1',
      title: 'Save the snapshot',
      summary: saveStepComplete
        ? `Revision ${readiness?.draft_revision_id ?? 'current'} is ready to publish.`
        : editorWorkingDraftPending
          ? 'Save the editor’s live changes as the publish revision.'
          : 'Create the first saved revision for this snapshot before publish.',
      complete: saveStepComplete,
    },
    {
      id: 'host' as const,
      eyebrow: 'Step 2',
      title: 'Choose the live host',
      summary: hostStepComplete
        ? `${selectedHostId} is selected for this publish.`
        : 'Pick the machine that should run this published snapshot.',
      complete: hostStepComplete,
    },
    {
      id: 'sound' as const,
      eyebrow: 'Step 3',
      title: 'Confirm sound path',
      summary: soundStepComplete
        ? 'Input, output, and monitor choices are ready.'
        : 'Check the input, output, and monitoring choices before publish.',
      complete: soundStepComplete,
    },
    {
      id: 'review' as const,
      eyebrow: 'Step 4',
      title: 'Publish to live',
      summary: readiness?.confirmed_revision_id
        ? `Revision ${readiness.confirmed_revision_id} is confirmed live.`
        : currentIssue
          ? currentIssue.operator_message
          : 'Review the final state and publish the stage-ready asset.',
      complete: Boolean(readiness?.confirmed_revision_id),
    },
  ]
  const activeWizardStepIndex = WIZARD_STEP_ORDER.indexOf(activeWizardStep)

  if (!isValidSnapshotId) {
    return (
      <div className="snapshot-publish-page">
        <ShellWindowTitleStrip />
        <EmptyState
          className="snapshot-publish-page__empty"
          title="Publish snapshot"
          description="The route needs a valid snapshot id."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="snapshot-publish-page">
        <ShellWindowTitleStrip />
        <Tile className="snapshot-publish-page__empty">
          <LoadingState description="Loading publish workspace" />
        </Tile>
      </div>
    )
  }

  if (snapshotQuery.isError || readinessQuery.isError || !snapshot || !readiness) {
    return (
      <div className="snapshot-publish-page">
        <ShellWindowTitleStrip />
        <EmptyState
          className="snapshot-publish-page__empty"
          title="Publish snapshot"
          description={
            snapshotQuery.error instanceof Error
              ? snapshotQuery.error.message
              : readinessQuery.error instanceof Error
                ? readinessQuery.error.message
                : 'The publish workspace could not load this snapshot.'
          }
          actions={<Button kind="secondary" onClick={openEditor}>Open editor</Button>}
        />
      </div>
    )
  }

  return (
    <div className="snapshot-publish-page">
      <ShellWindowTitleStrip />
      <Grid condensed className="snapshot-publish-page__grid">
        <Column sm={4} md={8} lg={16}>
          <Layer className="snapshot-publish-page__hero">
            <div className="snapshot-publish-page__hero-bar">
              <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={openEditor}>
                Back to editor
              </Button>
              <div className="snapshot-publish-page__mode-switch">
                <Button size="sm" kind={mode === 'performance' ? 'primary' : 'ghost'} onClick={() => setMode('performance')}>
                  Going Live
                </Button>
                <Button size="sm" kind={mode === 'wizard' ? 'primary' : 'ghost'} onClick={() => setMode('wizard')}>
                  Wizard
                </Button>
                <Button size="sm" kind={mode === 'advanced' ? 'primary' : 'ghost'} onClick={() => setMode('advanced')}>
                  Advanced
                </Button>
              </div>
            </div>

            <div className="snapshot-publish-page__hero-copy">
              <div>
                <p className="snapshot-publish-page__eyebrow">Publish snapshot</p>
                <h1>{snapshot.name}</h1>
                <p>
                  Know what is saved, what has been requested, what is confirmed live, and when publish makes this snapshot the live audio chain.
                </p>
              </div>
              <div className="snapshot-publish-page__hero-actions">
                <Tag type={statusTagType(readiness.status)}>{readiness.status.replace(/_/g, ' ')}</Tag>
                <Tag type="purple">{PUBLISH_LIVE_HINT}</Tag>
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={Renew}
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                >
                  Retry publish
                </Button>
                <Button
                  kind="primary"
                  size="sm"
                  renderIcon={Launch}
                  onClick={() => activateMutation.mutate()}
                  disabled={publishDisabled}
                >
                  {activateMutation.isPending ? 'Publishing…' : 'Publish stage-ready asset'}
                </Button>
              </div>
            </div>

            <div className="snapshot-publish-page__summary-rail">
              {summaryCards.map((card) => (
                <Tile key={card.id} className="snapshot-publish-page__summary-card">
                  <p className="snapshot-publish-page__summary-label">{card.label}</p>
                  <div className="snapshot-publish-page__summary-value-row">
                    <Tag type={card.tone}>{card.value}</Tag>
                  </div>
                </Tile>
              ))}
              {editorWorkingDraft ? (
                <InlineNotification
                  kind="warning"
                  lowContrast
                  hideCloseButton
                  title="Editor live changes are pending"
                  subtitle="Publish, host, I/O, and routing actions here will save the editor live changes first so the workflow stays on one live working state."
                />
              ) : null}
            </div>
          </Layer>
        </Column>

        <Column sm={4} md={8} lg={mode === 'wizard' ? 10 : 11}>
          {mode === 'performance' ? (
            <PublishPerformanceShell
              snapshotName={snapshot.name}
              hostId={selectedHostId}
              revisionLabel={readiness?.draft_revision_id ? `rev ${readiness.draft_revision_id}` : 'draft'}
              lastPublishAgo={readiness?.confirmed_revision_id ? `rev ${readiness.confirmed_revision_id} live` : null}
              machineInput={{
                readiness,
                selectedHostId,
                saveStepComplete,
                hostStepComplete,
                soundStepComplete,
                isLive: Boolean(readiness?.confirmed_revision_id && !liveChangesPending),
                isActivating: activateMutation.isPending,
                publishDisabled,
                channelsConfirmed: liveConfirmationRows.length > 0
                  && liveConfirmationRows.every((row) => row.status === 'confirmed' || row.status === 'live_confirmed'),
              }}
              onGoLive={() => activateMutation.mutate()}
              stageBodies={{
                stage: (
                  <div className="snapshot-publish-page__perf-body">
                    <p>
                      {saveStepComplete
                        ? 'Draft saved. Pick a host below to bring on stage.'
                        : editorWorkingDraftPending
                          ? 'Save the editor’s live changes as the publish revision.'
                          : 'Create the first saved revision before moving forward.'}
                    </p>
                    <Button kind="tertiary" size="sm" onClick={() => openAdvancedMode('overview')}>
                      Open host picker in Advanced
                    </Button>
                  </div>
                ),
                instruments: (
                  <div className="snapshot-publish-page__perf-body">
                    <p>
                      {soundStepComplete
                        ? 'Input, output, and monitor devices are ready.'
                        : 'Set session input, output, and monitor devices before signal check.'}
                    </p>
                    <Button kind="tertiary" size="sm" onClick={() => openAdvancedMode('devices')}>
                      Open devices in Advanced
                    </Button>
                  </div>
                ),
                signal: (
                  <div className="snapshot-publish-page__perf-body">
                    <p>Verify local ports, AVB endpoints, and topology for each flow.</p>
                    <Button kind="tertiary" size="sm" onClick={() => openAdvancedMode('routing')}>
                      Open signal routing in Advanced
                    </Button>
                  </div>
                ),
                line: (
                  <div className="snapshot-publish-page__perf-body">
                    <p>
                      {liveConfirmationRows.length > 0
                        ? `Per-channel confirmation: ${liveConfirmationRows.filter((r) => r.status === 'confirmed' || r.status === 'live_confirmed').length} of ${liveConfirmationRows.length} channels live.`
                        : 'No channel confirmations yet — runtime will report after publish.'}
                    </p>
                    <Button kind="tertiary" size="sm" onClick={() => openAdvancedMode('runtime')}>
                      Open line check in Advanced
                    </Button>
                  </div>
                ),
                golive: (
                  <div className="snapshot-publish-page__perf-body">
                    <p>
                      Press <strong>GO LIVE</strong> when armed to make this snapshot the live audio chain on {selectedHostId ?? 'the selected host'}.
                    </p>
                    {readiness?.confirmed_revision_id ? (
                      <p>Revision {readiness.confirmed_revision_id} is confirmed live.</p>
                    ) : null}
                  </div>
                ),
              }}
            />
          ) : mode === 'advanced' ? (
            <section className="snapshot-publish-page__stack">
            <section ref={hostSectionRef}>
              <Tile className="snapshot-publish-page__panel">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">Workflow 1</p>
                    <h2>Host</h2>
                    <p className="snapshot-publish-page__plain-copy">
                      Choose where this live working snapshot session runs. Changing host moves the active live session immediately.
                    </p>
                  </div>
                  {selectedHostId ? (
                    <Tag type="blue">Live host {selectedHostId}</Tag>
                  ) : (
                    <Tag type="cool-gray">No host selected</Tag>
                  )}
                </div>
                {hostCards.length > 0 ? (
                  <div className="snapshot-publish-page__host-grid">
                    {hostCards.map((host) => (
                      <button
                        key={host.id}
                        type="button"
                        className={`snapshot-publish-page__host-card ${host.isSelected ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedHostId(host.id)
                          if (!host.isCurrentDeployment) {
                            hostDeployMutation.mutate(host.id)
                          }
                        }}
                        disabled={hostDeployMutation.isPending || ['offline', 'failed'].includes(host.status.toLowerCase())}
                      >
                        <div className="snapshot-publish-page__host-card-copy">
                          <strong>{host.label}</strong>
                          <span>{host.hostname}</span>
                        </div>
                        <div className="snapshot-publish-page__host-card-meta">
                          <Tag type={resolveTagTypeForNodeStatus(host.status)}>{host.status}</Tag>
                          {host.isCurrentDeployment ? <Tag type="blue">current</Tag> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="snapshot-publish-page__plain-copy">
                    No cluster hosts are currently available.
                  </p>
                )}
                {selectedDeployment ? (
                  <div className="snapshot-publish-page__detail-list">
                    <div><strong>Current deployment</strong><span>{selectedDeployment.primary_node_id}</span></div>
                    <div><strong>Redundancy</strong><span>{selectedDeployment.redundancy_enabled ? 'Enabled' : 'Disabled'}</span></div>
                    <div><strong>Deployment status</strong><span>{selectedDeployment.deployment_status}</span></div>
                  </div>
                ) : null}
              </Tile>
            </section>

            <section ref={ioSectionRef} className="snapshot-publish-page__stack">
              <Tile className="snapshot-publish-page__panel">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">Workflow 2</p>
                    <h2>Devices</h2>
                    <p className="snapshot-publish-page__plain-copy">
                      Set the session’s input, output, and monitoring destinations, then decide whether these choices should also become rig defaults.
                    </p>
                  </div>
                  <div className="snapshot-publish-page__hero-actions">
                    <Tag type={hostAudioStatusQuery.data?.running ? 'green' : 'warm-gray'}>
                      {hostAudioStatusQuery.data?.running ? 'Audio running' : 'Engine state unknown'}
                    </Tag>
                    {snapshotIoDefaultsQuery.data ? (
                      <Tag type="cool-gray">
                        Defaults {snapshotIoDefaultsQuery.data.input_device ?? 'auto'} / {snapshotIoDefaultsQuery.data.output_device ?? 'auto'}
                      </Tag>
                    ) : null}
                  </div>
                </div>
                <div className="snapshot-publish-page__device-grid">
                  <Select
                    id="snapshot-publish-input-device"
                    labelText="Session input device"
                    value={sessionInputValue}
                    onChange={(event) => setSessionInputValue(event.target.value)}
                    disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                  >
                    <SelectItem value={SNAPSHOT_IO_USE_DEFAULT_OPTION} text="Use rig default input" />
                    {hostDeviceOptions.inputOptions.map((option) => (
                      <SelectItem key={`publish-input-${option}`} value={option} text={option} />
                    ))}
                  </Select>

                  <Select
                    id="snapshot-publish-output-device"
                    labelText="Session output device"
                    value={sessionOutputValue}
                    onChange={(event) => setSessionOutputValue(event.target.value)}
                    disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                  >
                    <SelectItem value={SNAPSHOT_IO_USE_DEFAULT_OPTION} text="Use rig default output" />
                    {hostDeviceOptions.outputOptions.map((option) => (
                      <SelectItem key={`publish-output-${option}`} value={option} text={option} />
                    ))}
                  </Select>

                  <Select
                    id="snapshot-publish-monitor-output"
                    labelText="Monitoring output"
                    value={sessionMonitoringValue}
                    onChange={(event) => setSessionMonitoringValue(event.target.value)}
                    disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                  >
                    <SelectItem value={SNAPSHOT_IO_USE_DEFAULT_OPTION} text="Use rig default monitor output" />
                    {monitoringOutputOptions.map((option) => (
                      <SelectItem key={`publish-monitor-${option.value}`} value={option.value} text={option.label} />
                    ))}
                  </Select>
                </div>
                <div className="snapshot-publish-page__workspace-actions snapshot-publish-page__workspace-actions--spread">
                  <Checkbox
                    id="snapshot-publish-save-rig-defaults"
                    labelText="Also save these as rig defaults"
                    checked={saveRigDefaults}
                    onChange={(_, data) => setSaveRigDefaults(Boolean(data.checked))}
                    disabled={applySnapshotIoMutation.isPending}
                  />
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={() => applySnapshotIoMutation.mutate()}
                    disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                  >
                    {applySnapshotIoMutation.isPending ? 'Applying…' : 'Apply device choices'}
                  </Button>
                </div>
              </Tile>

              <SnapshotPublishAudioPortWorkspace
                nodeId={selectedHostId}
                title="Inputs and outputs"
                description="Local ports and AVB endpoints stay visible together so the guitarist can choose the actual signal path on the selected live host."
                applyButtonText="Apply local + AVB I/O"
                beforeApply={async () => {
                  await persistEditorWorkingDraftIfNeeded()
                }}
                onApplied={refreshPublishState}
              />
            </section>

            <section ref={routingSectionRef}>
              <Tile className="snapshot-publish-page__panel">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">Workflow 3</p>
                    <h2>Routing</h2>
                    <p className="snapshot-publish-page__plain-copy">
                      Routing edits act on the same live working snapshot session the editor is using.
                    </p>
                  </div>
                  <Tag type={updateRoutingMutation.isPending ? 'warm-gray' : 'blue'}>{snapshot.routing.mode.replace(/_/g, ' ')}</Tag>
                </div>
                <RoutingTopologyContent
                  routingMode={snapshot.routing.mode === 'morph' ? 'parameter_morph' : snapshot.routing.mode}
                  morphProgress={snapshot.routing.morph_position ?? 0.5}
                  activeFlowIndex={activeChannelIndex}
                  flowSlots={snapshot.channels.map((channel) => ({
                    id: channel.channel_key,
                    label: channel.label,
                    color: channel.color,
                    chainId: channel.chain_id,
                  }))}
                  routingVisualizerFlows={routingVisualizerFlows}
                  activeSlotId={snapshot.routing.active_channel_key}
                  morphSourceSlotId={snapshot.routing.morph_source_channel_key}
                  morphTargetSlotId={snapshot.routing.morph_target_channel_key}
                  routingFocusButtons={routingFocusButtons}
                  onSetRoutingMode={(nextMode) => updateRoutingMutation.mutate({
                    mode: nextMode === 'parameter_morph' ? 'morph' : nextMode,
                  })}
                  onSelectFlowIndex={(index) => {
                    const nextChannel = snapshot.channels[index]
                    if (nextChannel) {
                      updateRoutingMutation.mutate({ active_channel_key: nextChannel.channel_key })
                    }
                  }}
                  onSetMorphProgress={(value) => updateRoutingMutation.mutate({ morph_position: value })}
                  onOpenPortRouting={() => {
                    setSection('devices')
                    ioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  onOpenAssignFlow={() => {
                    hostSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  activeFlowId={snapshot.routing.active_channel_key}
                  liveStatusLabel={updateRoutingMutation.isPending ? 'Applying' : snapshot.live_state?.is_live ? 'Live' : 'Draft'}
                  liveStatusTagType={updateRoutingMutation.isPending ? 'blue' : snapshot.live_state?.is_live ? 'green' : 'cool-gray'}
                  liveStatusMessage={updateRoutingMutation.isPending
                    ? 'Applying the latest routing change to the active live session.'
                    : snapshot.live_state?.is_live
                      ? 'Routing changes affect the active live session on the selected host.'
                      : 'Routing is being prepared on the current snapshot session.'}
                  portActionLabel="Jump to I/O"
                  showAssignAction={false}
                  showMidiPanel={false}
                  readOnly={updateRoutingMutation.isPending}
                />
              </Tile>
            </section>

            <section ref={confirmationSectionRef}>
              <Tile className="snapshot-publish-page__panel">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">Workflow 4</p>
                    <h2>Per-channel live confirmation</h2>
                    <p className="snapshot-publish-page__plain-copy">
                      Confirmation stays visible per channel so the player can trust the rig path-by-path before publishing the stage-ready asset.
                    </p>
                  </div>
                  <div className="snapshot-publish-page__hero-actions">
                    <Tag type={nodeConfirmations.length > 0 ? 'green' : 'cool-gray'}>{nodeConfirmations.length} nodes</Tag>
                    <Tag type={channelConfirmations.length > 0 ? 'green' : 'warm-gray'}>{liveConfirmationRows.length} channels</Tag>
                  </div>
                </div>
                <div className="snapshot-publish-page__confirmation-list">
                  {liveConfirmationRows.map((row) => (
                    <div key={row.id} className="snapshot-publish-page__confirmation-row">
                      <div className="snapshot-publish-page__confirmation-copy">
                        <strong style={{ color: row.color }}>{row.label}</strong>
                        <p>{row.message}</p>
                      </div>
                      <Tag
                        type={
                          row.status === 'live_confirmed' || row.status === 'confirmed'
                            ? 'green'
                            : row.status === 'failed' || row.status === 'blocked'
                              ? 'red'
                              : row.status === 'waiting_for_confirmation'
                                ? 'warm-gray'
                                : 'cool-gray'
                        }
                      >
                        {row.status.replace(/_/g, ' ')}
                      </Tag>
                    </div>
                  ))}
                </div>
              </Tile>
            </section>

            <section ref={publishSectionRef}>
              <Tile className="snapshot-publish-page__panel">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">Workflow 5</p>
                    <h2>Publish stage-ready asset</h2>
                    <p className="snapshot-publish-page__plain-copy">
                      Publishing is the step that makes this snapshot the active live audio chain on the selected host, then waits for confirmation.
                    </p>
                  </div>
                  <div className="snapshot-publish-page__hero-actions">
                    <Tag type={publishDisabled ? 'warm-gray' : 'green'}>{publishDisabled ? 'Not ready' : 'Ready to publish'}</Tag>
                    <Tag type="purple">{PUBLISH_LIVE_HINT}</Tag>
                  </div>
                </div>
                {liveChangesPending ? (
                  <InlineNotification
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    title="Live changes not published"
                    subtitle={editorWorkingDraft
                      ? 'The editor still has unpublished live changes. Publish and the workflow controls in this page will save them first, or discard them here if you do not want to keep them.'
                      : 'The live working state and the published stage-ready asset are not aligned yet.'}
                  />
                ) : (
                  <InlineNotification
                    kind="success"
                    lowContrast
                    hideCloseButton
                    title="Published asset is aligned"
                    subtitle="The current saved asset matches the most recently requested live revision."
                  />
                )}
                <div className="snapshot-publish-page__flow-map">
                  {flowSteps.map((step) => (
                    <div key={step.id} className={`snapshot-publish-page__flow-step is-${step.state}`}>
                      <strong>{step.label}</strong>
                      <span>{step.state.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
                <div className="snapshot-publish-page__workspace-actions">
                  {editorWorkingDraft ? (
                    <>
                      <Button
                        kind="ghost"
                        size="sm"
                        onClick={openEditor}
                      >
                        Return to editor
                      </Button>
                      <Button
                        kind="tertiary"
                        size="sm"
                        onClick={discardEditorWorkingDraft}
                      >
                        Discard live changes
                      </Button>
                    </>
                  ) : null}
                  <Button
                    kind="secondary"
                    size="sm"
                    renderIcon={Renew}
                    onClick={() => retryMutation.mutate()}
                    disabled={retryMutation.isPending || editorWorkingDraftPending}
                  >
                    Retry publish
                  </Button>
                  <Button
                    kind="primary"
                    size="sm"
                    renderIcon={Launch}
                    onClick={() => activateMutation.mutate()}
                    disabled={publishDisabled}
                  >
                    {activateMutation.isPending ? 'Publishing…' : 'Publish stage-ready asset'}
                  </Button>
                </div>
              </Tile>
            </section>
            </section>
          ) : (
            <section className="snapshot-publish-page__stack snapshot-publish-page__wizard">
              <Tile className="snapshot-publish-page__panel snapshot-publish-page__wizard-progress">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">Publish wizard</p>
                    <h2>Fast path to live</h2>
                    <p className="snapshot-publish-page__plain-copy">
                      The wizard keeps the next required choice in front of you and leaves the detailed routing workspace in Advanced mode.
                    </p>
                  </div>
                  <Tag type="cool-gray">{activeWizardStepIndex + 1} / {wizardSteps.length}</Tag>
                </div>
                <div className="snapshot-publish-page__wizard-step-list">
                  {wizardSteps.map((wizardStep, index) => {
                    const isActive = wizardStep.id === activeWizardStep
                    const isComplete = wizardStep.complete
                    const isReachable = index <= activeWizardStepIndex || isComplete
                    return (
                      <button
                        key={wizardStep.id}
                        type="button"
                        className={`snapshot-publish-page__wizard-step ${isActive ? 'is-active' : ''} ${isComplete ? 'is-complete' : ''}`}
                        onClick={() => {
                          if (isReachable) {
                            setActiveWizardStep(wizardStep.id)
                          }
                        }}
                        disabled={!isReachable}
                      >
                        <span className="snapshot-publish-page__wizard-step-index">{index + 1}</span>
                        <span className="snapshot-publish-page__wizard-step-copy">
                          <strong>{wizardStep.title}</strong>
                          <span>{wizardStep.summary}</span>
                        </span>
                        <Tag type={isComplete ? 'green' : isActive ? 'blue' : 'cool-gray'}>
                          {isComplete ? 'ready' : isActive ? 'current' : 'next'}
                        </Tag>
                      </button>
                    )
                  })}
                </div>
              </Tile>

              {activeWizardStep === 'save' ? (
                <section>
                  <Tile className="snapshot-publish-page__panel snapshot-publish-page__wizard-panel">
                    <div className="snapshot-publish-page__panel-header">
                      <div>
                        <p className="snapshot-publish-page__panel-kicker">Step 1</p>
                        <h2>Save the snapshot</h2>
                        <p className="snapshot-publish-page__plain-copy">
                          Publish works from a saved revision. MAP2 can create that revision for you here before anything is sent live.
                        </p>
                      </div>
                      <Tag type={saveStepComplete ? 'green' : 'warm-gray'}>
                        {saveStepComplete ? 'Ready' : 'Needs save'}
                      </Tag>
                    </div>
                    <div className="snapshot-publish-page__wizard-card-grid">
                      <Tile className="snapshot-publish-page__wizard-card">
                        <p className="snapshot-publish-page__panel-kicker">Current state</p>
                        <h3>{saveStepComplete ? `Revision ${readiness.draft_revision_id}` : 'No saved revision yet'}</h3>
                        <p className="snapshot-publish-page__plain-copy">
                          {editorWorkingDraftPending
                            ? 'You still have unpublished editor changes. Saving here captures them as the exact revision the publish flow will use.'
                            : 'Saving now gives this snapshot a concrete revision id so runtime confirmation can be tracked cleanly.'}
                        </p>
                      </Tile>
                      <Tile className="snapshot-publish-page__wizard-card">
                        <p className="snapshot-publish-page__panel-kicker">What happens next</p>
                        <h3>MAP2 saves first, then publishes</h3>
                        <p className="snapshot-publish-page__plain-copy">
                          No publish request is sent until the revision exists. That prevents the confusing local-only waiting state you were seeing before.
                        </p>
                      </Tile>
                    </div>
                    <div className="snapshot-publish-page__wizard-actions">
                      <Button kind="ghost" size="sm" onClick={openEditor}>
                        Return to editor
                      </Button>
                      {editorWorkingDraft ? (
                        <Button kind="tertiary" size="sm" onClick={discardEditorWorkingDraft}>
                          Discard live changes
                        </Button>
                      ) : null}
                      <Button
                        kind="secondary"
                        size="sm"
                        onClick={() => saveDraftMutation.mutate()}
                        disabled={saveDraftMutation.isPending || saveStepComplete}
                      >
                        {saveDraftMutation.isPending ? 'Saving…' : saveStepComplete ? 'Draft saved' : 'Save draft now'}
                      </Button>
                      <Button
                        kind="primary"
                        size="sm"
                        onClick={() => setActiveWizardStep('host')}
                        disabled={!saveStepComplete}
                      >
                        Continue to host
                      </Button>
                    </div>
                  </Tile>
                </section>
              ) : null}

              {activeWizardStep === 'host' ? (
                <section ref={hostSectionRef}>
                  <Tile className="snapshot-publish-page__panel snapshot-publish-page__wizard-panel">
                    <div className="snapshot-publish-page__panel-header">
                      <div>
                        <p className="snapshot-publish-page__panel-kicker">Step 2</p>
                        <h2>Choose the live host</h2>
                        <p className="snapshot-publish-page__plain-copy">
                          Pick where this published snapshot should run. If this is a one-node system, the local machine is selected automatically.
                        </p>
                      </div>
                      <Tag type={hostStepComplete ? 'green' : 'warm-gray'}>
                        {hostStepComplete ? `Host ${selectedHostId}` : 'Choose host'}
                      </Tag>
                    </div>
                    {hostCards.length > 0 ? (
                      <div className="snapshot-publish-page__host-grid">
                        {hostCards.map((host) => (
                          <button
                            key={host.id}
                            type="button"
                            className={`snapshot-publish-page__host-card ${host.isSelected ? 'is-selected' : ''}`}
                            onClick={() => {
                              setSelectedHostId(host.id)
                              if (!host.isCurrentDeployment) {
                                hostDeployMutation.mutate(host.id)
                              }
                            }}
                            disabled={hostDeployMutation.isPending || ['offline', 'failed'].includes(host.status.toLowerCase())}
                          >
                            <div className="snapshot-publish-page__host-card-copy">
                              <strong>{host.label}</strong>
                              <span>{host.hostname}</span>
                            </div>
                            <div className="snapshot-publish-page__host-card-meta">
                              <Tag type={resolveTagTypeForNodeStatus(host.status)}>{host.status}</Tag>
                              {host.isCurrentDeployment ? <Tag type="blue">current</Tag> : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="snapshot-publish-page__plain-copy">
                        MAP2 could not find a reachable host for this snapshot yet.
                      </p>
                    )}
                    <div className="snapshot-publish-page__wizard-actions">
                      <Button kind="ghost" size="sm" onClick={() => setActiveWizardStep('save')}>
                        Back
                      </Button>
                      <Button
                        kind="primary"
                        size="sm"
                        onClick={() => setActiveWizardStep('sound')}
                        disabled={!hostStepComplete}
                      >
                        Continue to sound
                      </Button>
                    </div>
                  </Tile>
                </section>
              ) : null}

              {activeWizardStep === 'sound' ? (
                <section ref={ioSectionRef}>
                  <Tile className="snapshot-publish-page__panel snapshot-publish-page__wizard-panel">
                    <div className="snapshot-publish-page__panel-header">
                      <div>
                        <p className="snapshot-publish-page__panel-kicker">Step 3</p>
                        <h2>Confirm the sound path</h2>
                        <p className="snapshot-publish-page__plain-copy">
                          Keep the current choices if they already look right, or change them here before you publish.
                        </p>
                      </div>
                      <div className="snapshot-publish-page__hero-actions">
                        <Tag type={soundStepComplete ? 'green' : 'warm-gray'}>
                          {soundStepComplete ? 'Ready' : 'Check devices'}
                        </Tag>
                        <Tag type={hostAudioStatusQuery.data?.running ? 'green' : 'warm-gray'}>
                          {hostAudioStatusQuery.data?.running ? 'Audio running' : 'Engine state unknown'}
                        </Tag>
                      </div>
                    </div>
                    <div className="snapshot-publish-page__device-grid">
                      <Select
                        id="snapshot-publish-input-device"
                        labelText="Session input device"
                        value={sessionInputValue}
                        onChange={(event) => setSessionInputValue(event.target.value)}
                        disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                      >
                        <SelectItem value={SNAPSHOT_IO_USE_DEFAULT_OPTION} text="Use rig default input" />
                        {hostDeviceOptions.inputOptions.map((option) => (
                          <SelectItem key={`publish-input-${option}`} value={option} text={option} />
                        ))}
                      </Select>

                      <Select
                        id="snapshot-publish-output-device"
                        labelText="Session output device"
                        value={sessionOutputValue}
                        onChange={(event) => setSessionOutputValue(event.target.value)}
                        disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                      >
                        <SelectItem value={SNAPSHOT_IO_USE_DEFAULT_OPTION} text="Use rig default output" />
                        {hostDeviceOptions.outputOptions.map((option) => (
                          <SelectItem key={`publish-output-${option}`} value={option} text={option} />
                        ))}
                      </Select>

                      <Select
                        id="snapshot-publish-monitor-output"
                        labelText="Monitoring output"
                        value={sessionMonitoringValue}
                        onChange={(event) => setSessionMonitoringValue(event.target.value)}
                        disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                      >
                        <SelectItem value={SNAPSHOT_IO_USE_DEFAULT_OPTION} text="Use rig default monitor output" />
                        {monitoringOutputOptions.map((option) => (
                          <SelectItem key={`publish-monitor-${option.value}`} value={option.value} text={option.label} />
                        ))}
                      </Select>
                    </div>
                    <div className="snapshot-publish-page__workspace-actions snapshot-publish-page__workspace-actions--spread">
                      <Checkbox
                        id="snapshot-publish-save-rig-defaults"
                        labelText="Also save these as rig defaults"
                        checked={saveRigDefaults}
                        onChange={(_, data) => setSaveRigDefaults(Boolean(data.checked))}
                        disabled={applySnapshotIoMutation.isPending}
                      />
                      <div className="snapshot-publish-page__wizard-actions">
                        <Button kind="ghost" size="sm" onClick={() => setActiveWizardStep('host')}>
                          Back
                        </Button>
                        <Button
                          size="sm"
                          kind="secondary"
                          onClick={() => applySnapshotIoMutation.mutate()}
                          disabled={!selectedHostId || applySnapshotIoMutation.isPending}
                        >
                          {applySnapshotIoMutation.isPending ? 'Applying…' : 'Apply device choices'}
                        </Button>
                        <Button kind="primary" size="sm" onClick={() => setActiveWizardStep('review')}>
                          Continue to publish
                        </Button>
                      </div>
                    </div>
                    {(currentIssue?.code === 'local_routing_invalid' || currentIssue?.code === 'network_routing_invalid') ? (
                      <InlineNotification
                        kind="warning"
                        lowContrast
                        hideCloseButton
                        title="Routing needs the Advanced workspace"
                        subtitle="This publish is blocked by a routing detail. Switch to Advanced for the full topology editor and then come back to the wizard."
                      />
                    ) : null}
                  </Tile>
                </section>
              ) : null}

              {activeWizardStep === 'review' ? (
                <section ref={publishSectionRef}>
                  <Tile className="snapshot-publish-page__panel snapshot-publish-page__wizard-panel">
                    <div className="snapshot-publish-page__panel-header">
                      <div>
                        <p className="snapshot-publish-page__panel-kicker">Step 4</p>
                        <h2>Publish to live</h2>
                        <p className="snapshot-publish-page__plain-copy">
                          Review the last blocking issue, then publish. This is the step that makes the snapshot the live audio chain, and MAP2 will save first if the only thing missing is a draft revision.
                        </p>
                      </div>
                      <div className="snapshot-publish-page__hero-actions">
                        <Tag type={publishDisabled ? 'warm-gray' : 'green'}>
                          {publishDisabled ? 'Needs attention' : 'Ready'}
                        </Tag>
                        <Tag type="purple">{PUBLISH_LIVE_HINT}</Tag>
                      </div>
                    </div>
                    <div className="snapshot-publish-page__wizard-card-grid">
                      <Tile className="snapshot-publish-page__wizard-card">
                        <p className="snapshot-publish-page__panel-kicker">Routing</p>
                        <h3>{snapshot.routing.mode.replace(/_/g, ' ')}</h3>
                        <p className="snapshot-publish-page__plain-copy">
                          Focus flow {snapshot.channels[activeChannelIndex]?.label ?? 'A'} is active. If you need a detailed topology edit, switch to Advanced.
                        </p>
                      </Tile>
                      <Tile className="snapshot-publish-page__wizard-card">
                        <p className="snapshot-publish-page__panel-kicker">Live confirmation</p>
                        <h3>{readiness.confirmed_revision_id ? 'Confirmed live' : 'Waiting on publish'}</h3>
                        <p className="snapshot-publish-page__plain-copy">
                          {readiness.confirmed_revision_id
                            ? `Revision ${readiness.confirmed_revision_id} is live on ${selectedHostId ?? 'the selected host'}.`
                            : 'After publish, MAP2 waits for the runtime to confirm the channels are live.'}
                        </p>
                      </Tile>
                    </div>
                    {currentIssue ? (
                      <div className="snapshot-publish-page__issue-card">
                        <p className="snapshot-publish-page__issue-message">{currentIssue.operator_message}</p>
                        {issueContextMessage ? (
                          <p className="snapshot-publish-page__issue-context">{issueContextMessage}</p>
                        ) : null}
                        <p className="snapshot-publish-page__issue-action"><strong>Next action:</strong> {currentIssue.recommended_action}</p>
                        <div className="snapshot-publish-page__issue-actions">
                          {currentIssue.code === 'unsaved_draft' ? (
                            <Button
                              size="sm"
                              kind="secondary"
                              onClick={() => saveDraftMutation.mutate()}
                              disabled={saveDraftMutation.isPending}
                            >
                              {saveDraftMutation.isPending ? 'Saving…' : 'Save draft now'}
                            </Button>
                          ) : null}
                          {currentRepairs.map((repair) => (
                            <Button
                              key={repair.id}
                              size="sm"
                              kind="secondary"
                              onClick={() => handleRepair(repair)}
                              disabled={repairMutation.isPending}
                            >
                              {repair.label}
                            </Button>
                          ))}
                          {currentIssue.repair_action_id === 'retry_publish' && currentRepairs.length === 0 ? (
                            <Button size="sm" kind="secondary" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                              Retry publish
                            </Button>
                          ) : null}
                          {(currentIssue.code === 'local_routing_invalid' || currentIssue.code === 'network_routing_invalid') ? (
                            <Button size="sm" kind="tertiary" onClick={() => openAdvancedMode('routing')}>
                              Open Advanced routing
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <InlineNotification
                        kind="success"
                        lowContrast
                        hideCloseButton
                        title="Everything is lined up"
                        subtitle="This snapshot is ready to publish on the selected host."
                      />
                    )}
                    <div className="snapshot-publish-page__wizard-actions">
                      <Button kind="ghost" size="sm" onClick={() => setActiveWizardStep('sound')}>
                        Back
                      </Button>
                      <Button kind="tertiary" size="sm" onClick={() => openAdvancedMode('routing')}>
                        Open Advanced
                      </Button>
                      <Button
                        kind="secondary"
                        size="sm"
                        renderIcon={Renew}
                        onClick={() => retryMutation.mutate()}
                        disabled={retryMutation.isPending || editorWorkingDraftPending}
                      >
                        Retry publish
                      </Button>
                      <Button
                        kind="primary"
                        size="sm"
                        renderIcon={Launch}
                        onClick={() => activateMutation.mutate()}
                        disabled={publishDisabled}
                      >
                        {activateMutation.isPending ? 'Publishing…' : 'Publish stage-ready asset'}
                      </Button>
                    </div>
                  </Tile>
                </section>
              ) : null}
            </section>
          )}
        </Column>

        {mode !== 'performance' ? (
        <Column sm={4} md={8} lg={mode === 'wizard' ? 6 : 5}>
          <section className="snapshot-publish-page__stack">
            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">Required to publish</p>
                  <h2>Checklist</h2>
                </div>
                <Tag type={readiness.blockers.length === 0 ? 'green' : autoSaveOnlyBlocker ? 'warm-gray' : 'red'}>
                  {readiness.blockers.length === 0
                    ? 'Ready'
                    : autoSaveOnlyBlocker
                      ? 'Auto-save on publish'
                      : `${readiness.blockers.length} blocking`}
                </Tag>
              </div>
              <div className="snapshot-publish-page__checklist">
                {readiness.requirements.map((requirement) => (
                  <div key={requirement.id} className="snapshot-publish-page__checklist-row">
                    <div className="snapshot-publish-page__checklist-icon" aria-hidden="true">
                      {requirement.status === 'ready' ? <CheckmarkFilled size={16} /> : <WarningFilled size={16} />}
                    </div>
                    <div>
                      <strong>{requirement.label}</strong>
                      <p>{requirement.operator_message}</p>
                    </div>
                    <Tag type={requirement.status === 'ready' ? 'green' : requirement.status === 'waiting_for_confirmation' ? 'warm-gray' : 'red'}>
                      {requirement.status.replace(/_/g, ' ')}
                    </Tag>
                  </div>
                ))}
              </div>
            </Tile>

            <section ref={issueSectionRef}>
              <Tile className="snapshot-publish-page__panel">
                <div className="snapshot-publish-page__panel-header">
                  <div>
                    <p className="snapshot-publish-page__panel-kicker">{mode === 'wizard' ? 'Wizard issue' : 'Issue focus'}</p>
                    <h2>{currentIssue ? currentIssue.title : 'No blocking issues'}</h2>
                  </div>
                  <Tag type={currentIssue ? (currentIssue.severity === 'blocking' ? 'red' : 'warm-gray') : 'green'}>
                    {currentIssue ? currentIssue.severity : 'ready'}
                  </Tag>
                </div>
                {currentIssue ? (
                  <div className="snapshot-publish-page__issue-card">
                    <p className="snapshot-publish-page__issue-message">{currentIssue.operator_message}</p>
                    {issueContextMessage ? (
                      <p className="snapshot-publish-page__issue-context">{issueContextMessage}</p>
                    ) : null}
                    {issueMetadata.length > 0 ? (
                      <div className="snapshot-publish-page__issue-metadata" role="list" aria-label="Issue metadata">
                        {issueMetadata.map((item) => (
                          <div key={item.label} className="snapshot-publish-page__issue-metadata-row" role="listitem">
                            <strong>{item.label}</strong>
                            <code>{item.value}</code>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <p className="snapshot-publish-page__issue-action"><strong>Next action:</strong> {currentIssue.recommended_action}</p>
                    {currentIssue.technical_detail ? (
                      <p className="snapshot-publish-page__issue-detail">{currentIssue.technical_detail}</p>
                    ) : null}
                    <div className="snapshot-publish-page__issue-actions">
                      {currentIssue.code === 'unsaved_draft' ? (
                        <Button
                          size="sm"
                          kind="secondary"
                          onClick={() => saveDraftMutation.mutate()}
                          disabled={saveDraftMutation.isPending}
                        >
                          {saveDraftMutation.isPending ? 'Saving…' : 'Save draft now'}
                        </Button>
                      ) : null}
                      {currentRepairs.map((repair) => (
                        <Button
                          key={repair.id}
                          size="sm"
                          kind="secondary"
                          onClick={() => handleRepair(repair)}
                          disabled={repairMutation.isPending}
                        >
                          {repair.label}
                        </Button>
                      ))}
                      {currentIssue.repair_action_id === 'retry_publish' && currentRepairs.length === 0 ? (
                        <Button size="sm" kind="secondary" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                          Retry publish
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="snapshot-publish-page__plain-copy">
                    Nothing is blocking this snapshot. Use Publish stage-ready asset when you are ready.
                  </p>
                )}
              </Tile>
            </section>

            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">Workflow focus</p>
                  <h2>Jump to section</h2>
                </div>
              </div>
              <div className="snapshot-publish-page__section-tabs">
                {(['overview', 'devices', 'routing', 'runtime', 'cleanup'] as PublishSection[]).map((candidate) => (
                  <Button
                    key={candidate}
                    size="sm"
                    kind={section === candidate ? 'primary' : 'ghost'}
                    onClick={() => setSection(candidate)}
                  >
                    {candidate}
                  </Button>
                ))}
              </div>
              <p className="snapshot-publish-page__plain-copy">
                Overview keeps the summary rail at the top. Devices jumps to session I/O, Routing jumps to topology, Runtime jumps to per-channel confirmation, and Cleanup jumps to the blocking issue panel.
              </p>
            </Tile>

            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">Draft vs requested vs confirmed</p>
                  <h2>Comparison</h2>
                </div>
              </div>
              <div className="snapshot-publish-page__diff-table" role="table" aria-label="Publish comparison">
                <div className="snapshot-publish-page__diff-header" role="row">
                  <span role="columnheader">Item</span>
                  <span role="columnheader">Draft</span>
                  <span role="columnheader">Requested</span>
                  <span role="columnheader">Confirmed live</span>
                </div>
                {diffRows.map((row) => (
                  <div key={row.label} className="snapshot-publish-page__diff-row" role="row">
                    <span role="cell">{row.label}</span>
                    <span role="cell">{row.draft}</span>
                    <span role="cell">{row.requested}</span>
                    <span role="cell">{row.confirmed}</span>
                  </div>
                ))}
              </div>
            </Tile>
          </section>
        </Column>
        ) : null}
      </Grid>
    </div>
  )
}

export default SnapshotPublishPage
