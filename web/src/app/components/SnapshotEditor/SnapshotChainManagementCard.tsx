import { Edit, Play, Renew } from '@carbon/icons-react'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, Layer, Table, TableBody, TableCell, TableRow, Tag } from '@carbon/react'
import type { AuthoritativeAudioState, SnapshotDetail, SnapshotDraftData, SnapshotMidiMapEntry, SnapshotRuntimeLiveState } from '../../../map2/types'
import { NumberInput } from '../ParameterControl'
import { SegmentedLedText } from '../Displays/SegmentedLedText'
import { MapAudioGridIcon } from '../icons/map'
import { formatSnapshotLastUsedValue } from '../../utils/snapshotLastUsed'
import type { SnapshotGoLiveState } from '../../utils/snapshotGoLiveState'

interface FlowSlotRef {
  id: string
  chainId: number | null
  label: string
  color: string
}

interface SnapshotChainManagementCardProps {
  selectedChainId?: number | null
  onChainSelect?: (chainId: number) => void
  onSelectedChainRemoved?: (chainId: number) => void
  flowSlots?: FlowSlotRef[]
  focusedFlowLabel?: string
  onToggleSelectedChainActive: () => void
  onDuplicateChain: () => void
  onRenameChain: () => void
  pluginMeta?: Record<string, unknown>
  onPluginChipClick?: (chainId: number, pluginUri: string, pluginPosition: number) => void
  liveSnapshot?: SnapshotDetail | null
  editorSnapshotDraft?: SnapshotDraftData | null
  runtimeLiveState?: SnapshotRuntimeLiveState | null
  authoritativeAudioState?: AuthoritativeAudioState | null
  detailsAction?: ReactNode
  onRenameSnapshot?: () => void
  snapshotNameEditing?: boolean
  snapshotNameDraft?: string
  snapshotNameError?: string | null
  onSnapshotNameDraftChange?: (value: string) => void
  onSubmitSnapshotName?: () => void
  onCancelSnapshotRename?: () => void
  snapshotRenamePending?: boolean
  onLoadPreviousSnapshot?: () => void
  onLoadNextSnapshot?: () => void
  previousSnapshotDisabled?: boolean
  nextSnapshotDisabled?: boolean
  previousSnapshotDisabledReason?: string
  nextSnapshotDisabledReason?: string
  onToggleSnapshotFavorite?: () => void
  snapshotFavoritePending?: boolean
  onToggleSnapshotLock?: () => void
  snapshotLockPending?: boolean
  onGoLive?: () => void
  goLiveState?: SnapshotGoLiveState | null
  goLiveDiffItems?: string[] | null
  goLiveDiffExpanded?: boolean
  onToggleGoLiveDiff?: () => void
  onDismissGoLiveDiff?: () => void
  onSubmitSnapshotDescription?: (description: string) => void
  snapshotDescriptionPending?: boolean
  onSubmitTempoBpm?: (tempoBpm: number) => void
  tempoPending?: boolean
  monitoringStatusLabel?: string | null
  monitoringStatusWarning?: boolean
  outputLevelWarningMessage?: string | null
}

interface SnapshotMetadataCell {
  key: string
  label: string
  value: string
  accent: 'input' | 'output' | 'blocks' | 'routing' | 'channels' | 'reference' | 'updated' | 'sync'
  colSpan: number
  muted?: boolean
}

interface SnapshotLiveHeadline {
  text: string
  tone: 'current' | 'other' | 'stopped'
  blinking: boolean
}

interface SnapshotChannelActivityBadge {
  label: string
  tooltip: string
  tagType: 'green' | 'warm-gray' | 'cool-gray'
  warning: boolean
  messages: string[]
}

const MIDI_CHANNEL_KEYS = ['channel', 'midi_channel', 'midiChannel', 'channel_number', 'channelNumber'] as const
const MIDI_CHANNEL_LIST_KEYS = ['channels', 'midi_channels', 'midiChannels', 'channel_numbers', 'channelNumbers'] as const

function parseMidiNumbers(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseMidiNumbers(item))
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return [Math.trunc(value)]
  }

  if (typeof value === 'string') {
    return value
      .split(/[\s,/:|]+/)
      .map((segment) => Number.parseInt(segment, 10))
      .filter((segment) => Number.isFinite(segment))
  }

  return []
}

function collectSnapshotMidiEntries(snapshot: SnapshotDetail): SnapshotMidiMapEntry[] {
  const canonicalEntries = Array.isArray(snapshot.controls?.midi_map) ? snapshot.controls.midi_map : []
  const compatibilityEntries = Array.isArray(snapshot.midi_map) ? snapshot.midi_map : []
  return [...canonicalEntries, ...compatibilityEntries]
}

function normalizeUniqueMidiNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((left, right) => left - right)
}

function isSnapshotRecallEntry(entry: SnapshotMidiMapEntry): boolean {
  return entry.action === undefined || entry.action === 'load_snapshot'
}

function collectMidiPrograms(snapshot: SnapshotDetail): number[] {
  const values = snapshot.program_number !== null ? [snapshot.program_number] : []
  collectSnapshotMidiEntries(snapshot).forEach((entry) => {
    if (!isSnapshotRecallEntry(entry)) {
      return
    }
    values.push(...parseMidiNumbers(entry.program_number))
  })
  return normalizeUniqueMidiNumbers(values)
}

function collectMidiChannels(snapshot: SnapshotDetail): number[] {
  const values: number[] = []

  collectSnapshotMidiEntries(snapshot).forEach((entry) => {
    if (!isSnapshotRecallEntry(entry)) {
      return
    }

    MIDI_CHANNEL_KEYS.forEach((key) => {
      values.push(...parseMidiNumbers(entry[key]))
    })

    MIDI_CHANNEL_LIST_KEYS.forEach((key) => {
      values.push(...parseMidiNumbers(entry[key]))
    })
  })

  return normalizeUniqueMidiNumbers(values)
}

function formatRoutingMode(mode: SnapshotDetail['routing']['mode'] | SnapshotDraftData['routing']['mode']): string {
  switch (mode) {
    case 'parallel_blend':
      return 'Parallel Blend'
    case 'series':
      return 'Series'
    case 'morph':
    case 'parameter_morph':
      return 'Morph'
    case 'ab_switch':
      return 'A/B Switch'
    case 'sidechain':
      return 'Sidechain'
    default:
      return 'Custom'
  }
}

function formatMidiReadout(snapshot: SnapshotDetail): string {
  const programs = collectMidiPrograms(snapshot)
  const channels = collectMidiChannels(snapshot)
  const programText = programs.length > 0
    ? programs.map((value) => String(value).padStart(3, '0')).join('/')
    : '--'
  const channelText = channels.length > 0
    ? channels.map((value) => String(value).padStart(2, '0')).join('/')
    : '--'
  return `PC ${programText}  CH ${channelText}`
}

function formatCount(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : `${singular}s`}`
}

function formatOutputReferenceValue(referenceDbfs?: number | null): string {
  if (referenceDbfs == null || !Number.isFinite(referenceDbfs)) {
    return 'Unset'
  }
  return `${referenceDbfs.toFixed(1)} dBFS`
}

function formatOutputReferenceSummary(snapshot: SnapshotDetail): string {
  return `${formatOutputReferenceValue(snapshot.output_level_reference_dbfs)} • ±${(snapshot.output_level_warning_threshold_db ?? 3).toFixed(1)} dB`
}

function resolveSnapshotBlockCount(snapshot: SnapshotDetail): number {
  const chainBlockCount = snapshot.chains.reduce(
    (total, chain) => total + (chain.plugins?.length ?? 0),
    0,
  )
  if (chainBlockCount > 0) {
    return chainBlockCount
  }

  const pathBlockCount = snapshot.paths.reduce(
    (total, path) => total + (path.plugins?.length ?? 0),
    0,
  )
  if (pathBlockCount > 0) {
    return pathBlockCount
  }

  return snapshot.live_state.runtime_chains.reduce(
    (total, chain) => total + (chain.plugins?.length ?? 0),
    0,
  )
}

function resolveBlockCount(snapshot: SnapshotDetail, editorSnapshotDraft?: SnapshotDraftData | null): number {
  if (editorSnapshotDraft) {
    return Object.values(editorSnapshotDraft.chains ?? {}).reduce(
      (total, chain) => total + (chain.plugins?.length ?? 0),
      0,
    )
  }

  return resolveSnapshotBlockCount(snapshot)
}

function resolveChannelCount(snapshot: SnapshotDetail, editorSnapshotDraft?: SnapshotDraftData | null): number {
  if (editorSnapshotDraft) {
    return editorSnapshotDraft.flowSlots.length
  }

  if (snapshot.channel_count > 0) {
    return snapshot.channel_count
  }
  if (snapshot.channels.length > 0) {
    return snapshot.channels.length
  }
  return snapshot.paths.length
}

function resolveLastUsedAt(snapshot: SnapshotDetail): string | null {
  return snapshot.activated_at ?? snapshot.live_state?.activated_at ?? null
}

function formatNodeSyncStatus(snapshot: SnapshotDetail): string {
  const deployments = snapshot.deployments ?? []
  if (deployments.length === 0) {
    return 'Local only'
  }

  const activeCount = deployments.filter((deployment) => deployment.deployment_status === 'active').length
  const failedCount = deployments.filter((deployment) => deployment.deployment_status === 'failed').length

  if (failedCount === deployments.length) {
    return 'Deployment failed'
  }

  if (activeCount === deployments.length) {
    return activeCount === 1
      ? `Synced to ${deployments[0].primary_node_id}`
      : `Synced to ${activeCount} nodes`
  }

  if (activeCount > 0) {
    return `Partial sync (${activeCount}/${deployments.length})`
  }

  return deployments.map((deployment) => deployment.deployment_status).filter(Boolean).join(' / ') || 'Pending sync'
}

function resolveLiveHeadline(
  snapshot: SnapshotDetail | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
): SnapshotLiveHeadline {
  if (authoritativeAudioState) {
    const authorityIsLive = authoritativeAudioState.engine.display_state === 'live'
      || authoritativeAudioState.engine.display_state === 'live_warning'
    const authoritySnapshotId = authoritativeAudioState.source_snapshot?.snapshot_id ?? null
    if (authorityIsLive && snapshot && authoritySnapshotId === snapshot.id) {
      return {
        text: 'LIVE',
        tone: 'current',
        blinking: true,
      }
    }
    if (authorityIsLive && authoritativeAudioState.source_snapshot?.name) {
      return {
        text: `LIVE: ${authoritativeAudioState.source_snapshot.name}`,
        tone: 'other',
        blinking: true,
      }
    }
    if (authoritativeAudioState.engine.display_state === 'offline') {
      return {
        text: 'Stopped',
        tone: 'stopped',
        blinking: false,
      }
    }
  }

  return {
    text: 'Stopped',
    tone: 'stopped',
    blinking: false,
  }
}

function formatAuthorityPathMessage(label: string, status: AuthoritativeAudioState['paths'][number]['status']): string {
  switch (status) {
    case 'pending':
      return `Channel ${label} pending apply.`
    case 'offline':
      return `Channel ${label} is offline.`
    case 'degraded':
      return `Channel ${label} is degraded.`
    case 'not_loaded':
      return `Channel ${label} is not loaded.`
    default:
      return `Channel ${label} is not loaded.`
  }
}

function buildChannelActivityBadge(
  snapshot: SnapshotDetail | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
): SnapshotChannelActivityBadge | null {
  if (authoritativeAudioState) {
    const totalCount = authoritativeAudioState.derived.total_channel_count || authoritativeAudioState.paths.length
    if (totalCount <= 0) {
      return null
    }

    const activeCount = authoritativeAudioState.derived.active_channel_count
    const inactiveDescriptions = authoritativeAudioState.derived.inactive_messages.length > 0
      ? authoritativeAudioState.derived.inactive_messages
      : authoritativeAudioState.paths
        .filter((path) => path.status !== 'active')
        .map((path) => path.status_reason?.trim() || formatAuthorityPathMessage(path.label, path.status))
    return {
      label: `${activeCount} of ${totalCount} channels active`,
      tooltip: inactiveDescriptions.length > 0
        ? inactiveDescriptions.join(' ')
        : `All ${totalCount} channels are active.`,
      tagType: activeCount < totalCount ? 'warm-gray' : 'green',
      warning: activeCount < totalCount,
      messages: inactiveDescriptions,
    }
  }

  const activitySnapshot = snapshot
  if (!activitySnapshot) {
    return null
  }

  const channelDefinitions = activitySnapshot.channels.length > 0
    ? activitySnapshot.channels.map((channel) => ({
      key: channel.channel_key,
      label: channel.label || channel.channel_key,
    }))
    : activitySnapshot.paths.map((path) => ({
      key: path.id,
      label: path.label || path.name || path.id,
    }))

  if (channelDefinitions.length === 0) {
    return null
  }

  const totalCount = channelDefinitions.length
  const channelNoun = totalCount === 1 ? 'channel' : 'channels'
  return {
    label: `${totalCount} ${channelNoun} saved`,
    tooltip: `No control-plane snapshot is live. This snapshot defines ${totalCount} saved ${channelNoun}.`,
    tagType: 'cool-gray',
    warning: false,
    messages: [],
  }
}

function formatAuthoritySyncStatus(syncStatus: string): string {
  switch (syncStatus) {
    case 'synced':
      return 'Synced'
    case 'partial_apply':
      return 'Partial apply'
    case 'pending_apply':
      return 'Pending apply'
    case 'degraded':
      return 'Degraded'
    default:
      return syncStatus
        .split('_')
        .filter((segment) => segment.length > 0)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    }
}

function buildMetadataTableRows(
  snapshot: SnapshotDetail,
  includeDetailsAction: boolean,
  editorSnapshotDraft?: SnapshotDraftData | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
): SnapshotMetadataCell[][] {
  const routingMode = editorSnapshotDraft?.routing.mode ?? snapshot.routing.mode
  const effectiveInputDevice = authoritativeAudioState?.observed_summary.effective_input_device
    ?? authoritativeAudioState?.desired.io.requested_input_device
    ?? snapshot.io_bindings?.input_device
    ?? snapshot.input_device
    ?? null
  const effectiveOutputDevice = authoritativeAudioState?.observed_summary.effective_output_device
    ?? authoritativeAudioState?.desired.io.requested_output_device
    ?? snapshot.io_bindings?.output_device
    ?? snapshot.output_device
    ?? null
  const channelCount = authoritativeAudioState?.derived.total_channel_count || resolveChannelCount(snapshot, editorSnapshotDraft)
  const nodeSyncStatus = authoritativeAudioState
    ? formatAuthoritySyncStatus(authoritativeAudioState.cluster.sync_status)
    : formatNodeSyncStatus(snapshot)

  return [
    [
      {
        key: 'input-device',
        label: 'Input Device',
        value: effectiveInputDevice || 'Not assigned',
        accent: 'input',
        colSpan: 2,
        muted: !effectiveInputDevice,
      },
      {
        key: 'output-device',
        label: 'Output Device',
        value: effectiveOutputDevice || 'Not assigned',
        accent: 'output',
        colSpan: 2,
        muted: !effectiveOutputDevice,
      },
      {
        key: 'block-count',
        label: 'Number of Blocks involved',
        value: formatCount(resolveBlockCount(snapshot, editorSnapshotDraft), 'block'),
        accent: 'blocks',
        colSpan: 2,
      },
    ],
    [
      {
        key: 'routing-mode',
        label: 'Routing Mode',
        value: formatRoutingMode(routingMode),
        accent: 'routing',
        colSpan: 2,
      },
      {
        key: 'channel-count',
        label: 'Number of Channels',
        value: formatCount(channelCount, 'channel'),
        accent: 'channels',
        colSpan: 2,
      },
      {
        key: 'output-reference',
        label: 'Output Reference',
        value: formatOutputReferenceSummary(snapshot),
        accent: 'reference',
        colSpan: 2,
      },
    ],
    [
      {
        key: 'last-used',
        label: 'Last Used',
        value: formatSnapshotLastUsedValue(resolveLastUsedAt(snapshot)),
        accent: 'updated',
        colSpan: includeDetailsAction ? 2 : 3,
      },
      {
        key: 'node-sync-status',
        label: 'Node Sync Status',
        value: nodeSyncStatus,
        accent: 'sync',
        colSpan: includeDetailsAction ? 2 : 3,
      },
    ],
  ]
}

export function SnapshotChainManagementCard(props: SnapshotChainManagementCardProps) {
  const {
    liveSnapshot = null,
    editorSnapshotDraft = null,
    authoritativeAudioState = null,
    detailsAction,
    onRenameSnapshot,
    snapshotNameEditing = false,
    snapshotNameDraft,
    snapshotNameError = null,
    onSnapshotNameDraftChange,
    onSubmitSnapshotName,
    onCancelSnapshotRename,
    snapshotRenamePending = false,
    onGoLive,
    goLiveState = null,
    goLiveDiffItems = null,
    goLiveDiffExpanded = false,
    onToggleGoLiveDiff,
    onDismissGoLiveDiff,
    onSubmitSnapshotDescription,
    snapshotDescriptionPending = false,
    onSubmitTempoBpm,
    tempoPending = false,
    monitoringStatusLabel = null,
    monitoringStatusWarning = false,
    outputLevelWarningMessage = null,
  } = props

  const metadataTableRows = useMemo(
    () => (liveSnapshot ? buildMetadataTableRows(liveSnapshot, Boolean(detailsAction), editorSnapshotDraft, authoritativeAudioState) : []),
    [authoritativeAudioState, detailsAction, editorSnapshotDraft, liveSnapshot],
  )
  const midiReadout = useMemo(
    () => (liveSnapshot ? formatMidiReadout(liveSnapshot) : 'PC --  CH --'),
    [liveSnapshot],
  )
  const liveHeadline = useMemo(
    () => resolveLiveHeadline(liveSnapshot, authoritativeAudioState),
    [authoritativeAudioState, liveSnapshot],
  )
  const channelActivityBadge = useMemo(
    () => buildChannelActivityBadge(liveSnapshot, authoritativeAudioState),
    [authoritativeAudioState, liveSnapshot],
  )
  const snapshotTitle = liveSnapshot?.name ?? 'No live snapshot'
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(liveSnapshot?.description ?? '')
  const [tempoDraftValue, setTempoDraftValue] = useState(liveSnapshot?.tempo_bpm ?? 120)
  const storedTempoBpm = liveSnapshot?.tempo_bpm ?? 120
  const storedTempoDisplay = storedTempoBpm.toFixed(1)
  const liveTempoBpm = liveSnapshot?.live_tempo_bpm ?? null
  const liveTapOverrideActive = liveSnapshot?.tempo_source === 'tap' && liveTempoBpm != null
  const snapshotLocked = Boolean(liveSnapshot?.is_locked)

  useEffect(() => {
    if (!editingDescription) {
      setDescriptionDraft(liveSnapshot?.description ?? '')
    }
  }, [editingDescription, liveSnapshot?.description])

  useEffect(() => {
    setTempoDraftValue(liveSnapshot?.tempo_bpm ?? 120)
  }, [liveSnapshot?.tempo_bpm])

  const submitDescription = () => {
    setEditingDescription(false)
    if (!liveSnapshot || !onSubmitSnapshotDescription) {
      return
    }
    onSubmitSnapshotDescription(descriptionDraft)
  }

  const handleDescriptionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitDescription()
    }
  }

  const handleSnapshotNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmitSnapshotName?.()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelSnapshotRename?.()
    }
  }

  return (
    <Layer className="juce-grid-page__chain-card juce-grid-page__snapshot-status-card">
      <div className="juce-grid-page__snapshot-status-layout">
        <div className="juce-grid-page__snapshot-status-hero">
          <div className="juce-grid-page__snapshot-status-top-row">
            <div className="juce-grid-page__snapshot-status-brand">
              <div className="juce-grid-page__snapshot-status-brand-row">
                <div className="juce-grid-page__workspace-header-icon juce-grid-page__snapshot-status-brand-icon" aria-hidden="true">
                  <MapAudioGridIcon size={32} />
                </div>
                <div className="juce-grid-page__snapshot-status-brand-copy">
                  <h1 className="juce-grid-page__workspace-header-title">Audio Grid</h1>
                  <p className="juce-grid-page__workspace-header-subtitle">
                    Build signal flow, configure routing, and manage the live snapshot workspace.
                  </p>
                </div>
              </div>
            </div>

            <div className="juce-grid-page__snapshot-status-top-tools">
              {liveSnapshot ? (
                <div className="juce-grid-page__snapshot-status-bpm-stack">
                  <NumberInput
                    label="Stored BPM"
                    value={tempoDraftValue}
                    min={20}
                    max={300}
                    step={0.1}
                    precision={1}
                    unit="BPM"
                    defaultValue={storedTempoBpm}
                    valueFormatter={(value) => value.toFixed(1)}
                    onChange={setTempoDraftValue}
                    onChangeCommitted={(value) => onSubmitTempoBpm?.(value)}
                    disabled={!onSubmitTempoBpm || tempoPending || snapshotLocked}
                    size="small"
                    showBounds={false}
                    accentColor="var(--juce-grid-midi-led-color, #78a9ff)"
                    className="juce-grid-page__snapshot-status-bpm-input"
                    displayOverlay={(
                      <SegmentedLedText
                        value={storedTempoDisplay}
                        size="md"
                        color="var(--juce-grid-midi-led-color, #78a9ff)"
                        className="juce-grid-page__snapshot-status-bpm-overlay"
                      />
                    )}
                  />
                  {liveTapOverrideActive ? (
                    <Tag type="green" className="juce-grid-page__snapshot-status-tempo-tag">
                      MIDI tap override active
                    </Tag>
                  ) : null}
                </div>
              ) : null}
              <div className="juce-grid-page__snapshot-status-midi">
                <SegmentedLedText
                  value={midiReadout}
                  size="md"
                  color={liveSnapshot ? 'var(--juce-grid-midi-led-color, #78a9ff)' : 'var(--juce-grid-midi-led-idle-color, #525252)'}
                  className={`juce-grid-page__snapshot-status-midi-readout ${liveSnapshot ? '' : 'is-idle'}`}
                />
              </div>
            </div>
          </div>

          <div className="juce-grid-page__snapshot-status-content-row">
            <div className="juce-grid-page__snapshot-status-live-block">
              <div className="juce-grid-page__snapshot-status-state-row">
                <span
                  className={`juce-grid-page__snapshot-status-state-label is-${liveHeadline.tone} ${liveHeadline.blinking ? 'is-blinking' : ''}`}
                >
                  {liveHeadline.text}
                </span>
              </div>
              <div className="juce-grid-page__snapshot-status-live-row">
                {liveSnapshot && snapshotNameEditing ? (
                  <div className="juce-grid-page__snapshot-status-title-editor-shell">
                    <div className="juce-grid-page__snapshot-status-title-editor">
                      <input
                        type="text"
                        className="juce-grid-page__snapshot-status-title-input"
                        aria-label="Snapshot name"
                        value={snapshotNameDraft ?? ''}
                        onChange={(event) => onSnapshotNameDraftChange?.(event.target.value)}
                        onKeyDown={handleSnapshotNameKeyDown}
                        disabled={snapshotRenamePending}
                        autoFocus
                      />
                      <div className="juce-grid-page__snapshot-status-title-editor-actions">
                        <Button
                          size="sm"
                          kind="primary"
                          onClick={onSubmitSnapshotName}
                          disabled={snapshotRenamePending || !onSubmitSnapshotName || Boolean(snapshotNameError)}
                        >
                          {snapshotRenamePending ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          kind="ghost"
                          onClick={onCancelSnapshotRename}
                          disabled={snapshotRenamePending || !onCancelSnapshotRename}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                    {snapshotNameError ? (
                      <p className="juce-grid-page__snapshot-status-title-error">{snapshotNameError}</p>
                    ) : null}
                  </div>
                ) : (
                  <h2 className="juce-grid-page__snapshot-status-title">
                    {liveSnapshot && onRenameSnapshot ? (
                      <button
                        type="button"
                        className="juce-grid-page__snapshot-status-title-button"
                        onClick={onRenameSnapshot}
                        disabled={snapshotRenamePending}
                        aria-label={`Rename snapshot ${snapshotTitle}`}
                        title="Rename snapshot"
                      >
                        <span className="juce-grid-page__snapshot-status-title-text">{snapshotTitle}</span>
                        <Edit size={20} aria-hidden="true" />
                      </button>
                    ) : snapshotTitle}
                  </h2>
                )}
              </div>
              {channelActivityBadge || monitoringStatusLabel ? (
                <div className="juce-grid-page__snapshot-status-pill-row">
                  {channelActivityBadge ? (
                    <div
                      title={channelActivityBadge.tooltip}
                      aria-label={channelActivityBadge.tooltip}
                      className="juce-grid-page__snapshot-status-channel-badge-wrap"
                    >
                      <Tag
                        type={channelActivityBadge.tagType}
                        className={`juce-grid-page__snapshot-status-channel-badge ${channelActivityBadge.warning ? 'is-warning' : channelActivityBadge.tagType === 'green' ? 'is-healthy' : 'is-saved'}`}
                      >
                        {channelActivityBadge.label}
                      </Tag>
                    </div>
                  ) : null}
                  {monitoringStatusLabel ? (
                    <Tag
                      type={monitoringStatusWarning ? 'warm-gray' : 'cool-gray'}
                      className={`juce-grid-page__snapshot-status-monitoring-badge ${monitoringStatusWarning ? 'is-warning' : ''}`}
                    >
                      {monitoringStatusLabel}
                    </Tag>
                  ) : null}
                </div>
              ) : null}
              {liveSnapshot && onSubmitSnapshotDescription ? (
                editingDescription ? (
                  <textarea
                    className="juce-grid-page__snapshot-status-description-input"
                    aria-label="Snapshot description"
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    onBlur={submitDescription}
                    onKeyDown={handleDescriptionKeyDown}
                    disabled={snapshotDescriptionPending}
                    placeholder="Add rig notes..."
                    rows={3}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className={`juce-grid-page__snapshot-status-description-button ${liveSnapshot.description?.trim() ? '' : 'is-placeholder'}`}
                    onClick={() => setEditingDescription(true)}
                    disabled={snapshotDescriptionPending}
                    aria-label={liveSnapshot.description?.trim() ? 'Edit snapshot description' : 'Add snapshot description'}
                  >
                    {liveSnapshot.description?.trim() || 'Add rig notes...'}
                  </button>
                )
              ) : null}
              {liveSnapshot && goLiveState && (goLiveState.phase !== 'live' || Boolean(goLiveState.errorMessage)) ? (
                <div className="juce-grid-page__snapshot-status-go-live" aria-live="polite">
                  {goLiveState.phase !== 'live' ? (
                    <Button
                      size="sm"
                      kind={goLiveState.phase === 'error' ? 'danger' : 'primary'}
                      className={`juce-grid-page__snapshot-status-go-live-button ${goLiveState.phase === 'activating' ? 'is-pending' : ''}`}
                      renderIcon={goLiveState.phase === 'activating' || goLiveState.phase === 'error' ? Renew : Play}
                      onClick={onGoLive}
                      disabled={!onGoLive || goLiveState.disabled}
                    >
                      {goLiveState.label}
                    </Button>
                  ) : null}
                  {goLiveState.errorMessage ? (
                    <p className="juce-grid-page__snapshot-status-go-live-error">{goLiveState.errorMessage}</p>
                  ) : null}
                </div>
              ) : null}
              {channelActivityBadge?.warning && channelActivityBadge.messages.length > 0 ? (
                <div className="juce-grid-page__snapshot-status-channel-warning-list" aria-live="polite">
                  {channelActivityBadge.messages.map((message) => (
                    <Tag
                      key={message}
                      type="warm-gray"
                      className="juce-grid-page__snapshot-status-channel-warning"
                    >
                      {message}
                    </Tag>
                  ))}
                </div>
              ) : null}
              {goLiveDiffItems && goLiveDiffItems.length > 0 ? (
                <div className="juce-grid-page__snapshot-status-go-live-diff">
                  <div className="juce-grid-page__snapshot-status-go-live-diff-actions">
                    <Button
                      size="sm"
                      kind="ghost"
                      className="juce-grid-page__snapshot-status-go-live-diff-toggle"
                      onClick={onToggleGoLiveDiff}
                      disabled={!onToggleGoLiveDiff}
                    >
                      {goLiveDiffExpanded ? `Hide changes (${goLiveDiffItems.length})` : `Show changes (${goLiveDiffItems.length})`}
                    </Button>
                    {onDismissGoLiveDiff ? (
                      <Button
                        size="sm"
                        kind="ghost"
                        className="juce-grid-page__snapshot-status-go-live-diff-dismiss"
                        onClick={onDismissGoLiveDiff}
                      >
                        Dismiss
                      </Button>
                    ) : null}
                  </div>
                  {goLiveDiffExpanded ? (
                    <ul className="juce-grid-page__snapshot-status-go-live-diff-list" aria-label="Snapshot changes">
                      {goLiveDiffItems.map((item, index) => (
                        <li key={`${item}-${index}`} className="juce-grid-page__snapshot-status-go-live-diff-item">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {!liveSnapshot && (
                <p className="juce-grid-page__snapshot-status-empty-copy">
                  Recall or create a snapshot to populate live snapshot status here.
                </p>
              )}
              {outputLevelWarningMessage ? (
                <Tag type="warm-gray" className="juce-grid-page__snapshot-status-output-warning">
                  {outputLevelWarningMessage}
                </Tag>
              ) : null}
            </div>

            <div className="juce-grid-page__snapshot-status-aside">
              {metadataTableRows.length > 0 ? (
                <div className="juce-grid-page__snapshot-status-metadata-shell">
                  <Table
                    aria-label="Live snapshot metadata"
                    className="juce-grid-page__snapshot-status-metadata-table"
                  >
                    <TableBody>
                      {metadataTableRows.map((row, rowIndex) => (
                        <TableRow key={`metadata-row-${rowIndex}`} className="juce-grid-page__snapshot-status-metadata-row">
                          {row.map((cell) => (
                            <TableCell
                              key={cell.key}
                              colSpan={cell.colSpan}
                              className={`juce-grid-page__snapshot-status-metadata-cell is-${cell.accent} ${cell.muted ? 'is-muted' : ''}`}
                            >
                              <span className={`juce-grid-page__snapshot-status-metadata-chip is-${cell.accent}`}>
                                {cell.label}
                              </span>
                              <span className="juce-grid-page__snapshot-status-metadata-value">{cell.value}</span>
                            </TableCell>
                          ))}
                          {rowIndex === metadataTableRows.length - 1 && detailsAction ? (
                            <TableCell
                              colSpan={2}
                              className="juce-grid-page__snapshot-status-metadata-cell juce-grid-page__snapshot-status-metadata-cell--action"
                            >
                              {detailsAction}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {metadataTableRows.length === 0 && detailsAction ? (
                <div className="juce-grid-page__snapshot-status-details-slot">
                  {detailsAction}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Layer>
  )
}
