import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckmarkFilled, Launch, Renew, WarningFilled } from '@carbon/icons-react'
import { Button, Column, Grid, InlineLoading, Layer, Tag, Tile } from '@carbon/react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { snapshotsApi } from '../../map2/clients/snapshots'
import type {
  ChannelConfirmationState,
  NodeConfirmationState,
  PublishBlocker,
  PublishRepairAction,
  SnapshotActivationAuditEvent,
  SnapshotActivationIntent,
  SnapshotPublishReadiness,
} from '../../map2/types'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { useToasts } from '../components/Toasts'
import { useCommittedAudioState, useDesiredAudioState, useObservedAudioState } from '../hooks/useAuthoritativeAudioState'
import { useSnapshotActivationEvents, useSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import { buildWorkspaceArtifactsPath } from './audioArtifactsRoutes'
import './SnapshotPublishPage.css'

type PublishMode = 'guided' | 'advanced'
type PublishSection = 'overview' | 'devices' | 'routing' | 'runtime' | 'cleanup'

type SummaryCard = {
  id: string
  label: string
  value: string
  tone: 'green' | 'red' | 'cool-gray' | 'warm-gray'
}

function toPublishMode(value: string | null): PublishMode {
  return value === 'advanced' ? 'advanced' : 'guided'
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

function summarizeDraft(readiness: SnapshotPublishReadiness): SummaryCard {
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

  const refreshPublishState = () => {
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', snapshotId] })
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'publish-readiness', snapshotId] })
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime'] })
    void queryClient.invalidateQueries({ queryKey: ['audio-state'] })
  }

  const activateMutation = useMutation({
    mutationFn: () => snapshotsApi.activate(snapshotId),
    onSuccess: () => {
      refreshPublishState()
      pushToast('Publish requested', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Publish failed', 'error')
    },
  })
  const retryMutation = useMutation({
    mutationFn: () => snapshotsApi.retryPublish(snapshotId),
    onSuccess: () => {
      refreshPublishState()
      pushToast('Publish retried', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Retry failed', 'error')
    },
  })
  const repairMutation = useMutation({
    mutationFn: (repairActionId: string) => snapshotsApi.runPublishRepairAction(snapshotId, repairActionId),
    onSuccess: () => {
      refreshPublishState()
      pushToast('Repair action requested', 'success')
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
  const nodeConfirmations = useMemo(() => asNodeConfirmations(latestEvent), [latestEvent])
  const channelConfirmations = useMemo(() => asChannelConfirmations(latestEvent), [latestEvent])

  const summaryCards = useMemo(() => {
    if (!readiness) {
      return []
    }
    return [
      summarizeDraft(readiness),
      summarizeRequested(readiness, latestEvent),
      summarizeConfirmed(readiness, latestEvent),
    ]
  }, [latestEvent, readiness])

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

  const flowSteps = readiness ? buildFlowSteps(readiness, currentIssue) : []
  const publishDisabled = !readiness || readiness.blockers.length > 0 || activateMutation.isPending

  const setMode = (nextMode: PublishMode) => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', nextMode)
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
      navigate('/snapshot-editor')
      return
    }
    repairMutation.mutate(repairAction.id)
  }

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
                <Button size="sm" kind={mode === 'guided' ? 'primary' : 'ghost'} onClick={() => setMode('guided')}>
                  Guided
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
                  Know what is saved, what has been requested, what is confirmed live, and the next action to take.
                </p>
              </div>
              <div className="snapshot-publish-page__hero-actions">
                <Tag type={statusTagType(readiness.status)}>{readiness.status.replace(/_/g, ' ')}</Tag>
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
                  {activateMutation.isPending ? 'Publishing…' : 'Publish to live'}
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
            </div>
          </Layer>
        </Column>

        <Column sm={4} md={8} lg={mode === 'guided' ? 10 : 11}>
          <section className="snapshot-publish-page__stack">
            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">Required to publish</p>
                  <h2>Checklist</h2>
                </div>
                <Tag type={readiness.blockers.length === 0 ? 'green' : 'red'}>
                  {readiness.blockers.length === 0 ? 'Ready' : `${readiness.blockers.length} blocking`}
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

            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">{mode === 'guided' ? 'Guided issue' : 'Issue focus'}</p>
                  <h2>{currentIssue ? currentIssue.title : 'No blocking issues'}</h2>
                </div>
                <Tag type={currentIssue ? (currentIssue.severity === 'blocking' ? 'red' : 'warm-gray') : 'green'}>
                  {currentIssue ? currentIssue.severity : 'ready'}
                </Tag>
              </div>
              {currentIssue ? (
                <div className="snapshot-publish-page__issue-card">
                  <p className="snapshot-publish-page__issue-message">{currentIssue.operator_message}</p>
                  <p className="snapshot-publish-page__issue-action"><strong>Next action:</strong> {currentIssue.recommended_action}</p>
                  {currentIssue.technical_detail ? (
                    <p className="snapshot-publish-page__issue-detail">{currentIssue.technical_detail}</p>
                  ) : null}
                  <div className="snapshot-publish-page__issue-actions">
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
                  Nothing is blocking this snapshot. Use Publish to live when you are ready.
                </p>
              )}
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

        <Column sm={4} md={8} lg={mode === 'guided' ? 6 : 5}>
          <section className="snapshot-publish-page__stack">
            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">Path to live</p>
                  <h2>Flow map</h2>
                </div>
              </div>
              <div className="snapshot-publish-page__flow-map">
                {flowSteps.map((step) => (
                  <div key={step.id} className={`snapshot-publish-page__flow-step is-${step.state}`}>
                    <strong>{step.label}</strong>
                    <span>{step.state.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </Tile>

            <Tile className="snapshot-publish-page__panel">
              <div className="snapshot-publish-page__panel-header">
                <div>
                  <p className="snapshot-publish-page__panel-kicker">Advanced view</p>
                  <h2>Section focus</h2>
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
              {section === 'overview' ? (
                <p className="snapshot-publish-page__plain-copy">
                  Status comes from the backend publish-readiness model, not from draft-only editor state.
                </p>
              ) : null}
              {section === 'devices' ? (
                <div className="snapshot-publish-page__detail-list">
                  <div><strong>Draft input</strong><span>{snapshot.input_device ?? 'Default input'}</span></div>
                  <div><strong>Draft output</strong><span>{snapshot.output_device ?? 'Default output'}</span></div>
                  <div><strong>Requested input</strong><span>{desiredStateQuery.data?.value.io.requested_input_device ?? 'Not requested'}</span></div>
                  <div><strong>Requested output</strong><span>{desiredStateQuery.data?.value.io.requested_output_device ?? 'Not requested'}</span></div>
                </div>
              ) : null}
              {section === 'routing' ? (
                <div className="snapshot-publish-page__detail-list">
                  <div><strong>Routing mode</strong><span>{snapshot.routing.mode}</span></div>
                  <div><strong>Active path</strong><span>{snapshot.routing.active_channel_key ?? 'None'}</span></div>
                  <div><strong>Saved paths</strong><span>{snapshot.paths.length}</span></div>
                </div>
              ) : null}
              {section === 'runtime' ? (
                <div className="snapshot-publish-page__detail-list">
                  <div><strong>Runtime state</strong><span>{runtimeStateQuery.data?.display_label ?? 'Unknown'}</span></div>
                  <div><strong>Latest outcome</strong><span>{latestEvent?.outcome ?? 'No publish event yet'}</span></div>
                  <div><strong>Confirmed nodes</strong><span>{nodeConfirmations.length}</span></div>
                  <div><strong>Confirmed channels</strong><span>{channelConfirmations.length}</span></div>
                </div>
              ) : null}
              {section === 'cleanup' ? (
                <div className="snapshot-publish-page__detail-list">
                  <div><strong>Available repairs</strong><span>{readiness.available_repairs.length}</span></div>
                  <div><strong>Blocking issues</strong><span>{readiness.blockers.length}</span></div>
                  <div><strong>Warnings</strong><span>{readiness.warnings.length}</span></div>
                </div>
              ) : null}
            </Tile>
          </section>
        </Column>
      </Grid>
    </div>
  )
}

export default SnapshotPublishPage
