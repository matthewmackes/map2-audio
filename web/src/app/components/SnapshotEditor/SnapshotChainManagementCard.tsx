import { ArrowLeft, ArrowRight, Edit, Favorite, FavoriteFilled, Play, Renew } from '@carbon/icons-react'
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, Layer, Table, TableBody, TableCell, TableRow, Tag } from '@carbon/react'
import type { SnapshotDetail, SnapshotDraftData, SnapshotMidiMapEntry, SnapshotRuntimeLiveState } from '../../../map2/types'
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
  detailsAction?: ReactNode
  onRenameSnapshot?: () => void
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
    return snapshot.live_state?.is_live || snapshot.is_active ? 'Local live only' : 'Local only'
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
  runtimeLiveState?: SnapshotRuntimeLiveState | null,
): SnapshotLiveHeadline {
  const runtimeDisplayState = runtimeLiveState?.display_state
  const runtimeIsLive = runtimeDisplayState === 'live' || runtimeDisplayState === 'live_warning'
  const runtimeSnapshotId = runtimeLiveState?.snapshot_id ?? runtimeLiveState?.live_snapshot_payload?.id ?? null
  const runtimeSnapshotName = runtimeLiveState?.snapshot_name?.trim()
    || runtimeLiveState?.live_snapshot_payload?.name?.trim()
    || null

  if (runtimeLiveState) {
    if (runtimeIsLive) {
      const isCurrentSnapshot = Boolean(
        snapshot && (
          (runtimeSnapshotId !== null && runtimeSnapshotId === snapshot.id)
          || (runtimeSnapshotId === null && runtimeSnapshotName !== null && runtimeSnapshotName === snapshot.name)
        ),
      )

      if (isCurrentSnapshot) {
        return {
          text: 'LIVE',
          tone: 'current',
          blinking: true,
        }
      }

      if (runtimeSnapshotName) {
        return {
          text: `LIVE: ${runtimeSnapshotName}`,
          tone: 'other',
          blinking: true,
        }
      }

      return {
        text: 'LIVE: OTHER',
        tone: 'other',
        blinking: true,
      }
    }

    return {
      text: 'Stopped',
      tone: 'stopped',
      blinking: false,
    }
  }

  if (snapshot?.live_state?.is_live || snapshot?.is_active) {
    return {
      text: 'LIVE',
      tone: 'current',
      blinking: true,
    }
  }

  return {
    text: 'Stopped',
    tone: 'stopped',
    blinking: false,
  }
}

function resolveChannelActivitySnapshot(
  snapshot: SnapshotDetail | null,
  runtimeLiveState?: SnapshotRuntimeLiveState | null,
): SnapshotDetail | null {
  if (runtimeLiveState?.live_snapshot_payload) {
    return runtimeLiveState.live_snapshot_payload
  }
  return snapshot
}

function buildChannelActivityBadge(
  snapshot: SnapshotDetail | null,
  runtimeLiveState?: SnapshotRuntimeLiveState | null,
): SnapshotChannelActivityBadge | null {
  const activitySnapshot = resolveChannelActivitySnapshot(snapshot, runtimeLiveState)
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

  const livePathsById = new Map(
    (activitySnapshot.live_state?.paths ?? [])
      .map((path) => [path.path_id, path] as const),
  )
  const runtimeChainsById = new Map(
    (activitySnapshot.live_state?.runtime_chains ?? [])
      .map((chain) => [chain.id, chain] as const),
  )
  const offline = Boolean(runtimeLiveState?.is_offline || runtimeLiveState?.display_state === 'offline')
  let activeCount = 0
  const inactiveDescriptions: string[] = []

  channelDefinitions.forEach((channel) => {
    const livePath = livePathsById.get(channel.key)
    const runtimeChain = livePath?.runtime_chain_id != null
      ? runtimeChainsById.get(livePath.runtime_chain_id)
      : undefined
    const runtimeStatus = runtimeChain?.runtime_sync?.status
    const activationStatus = typeof livePath?.activation_status === 'string'
      ? livePath.activation_status.toLowerCase()
      : null
    const channelOffline = activationStatus === 'offline' || runtimeStatus === 'offline' || offline
    const isActive = activationStatus === 'active'
      || runtimeStatus === 'active'
      || (activationStatus == null && runtimeStatus == null && Boolean(runtimeChain?.is_active))

    if (isActive) {
      activeCount += 1
      return
    }

    inactiveDescriptions.push(`Channel ${channel.label} is ${channelOffline ? 'offline' : 'not loaded'}.`)
  })

  const totalCount = channelDefinitions.length
  return {
    label: `${activeCount} of ${totalCount} channels active`,
    tooltip: inactiveDescriptions.length > 0
      ? inactiveDescriptions.join(' ')
      : `All ${totalCount} channels are active.`,
    warning: activeCount < totalCount,
    messages: inactiveDescriptions,
  }
}

function buildMetadataTableRows(
  snapshot: SnapshotDetail,
  includeDetailsAction: boolean,
  editorSnapshotDraft?: SnapshotDraftData | null,
): SnapshotMetadataCell[][] {
  const routingMode = editorSnapshotDraft?.routing.mode ?? snapshot.routing.mode

  return [
    [
      {
        key: 'input-device',
        label: 'Input Device',
        value: snapshot.io_bindings?.input_device || snapshot.input_device || 'Not assigned',
        accent: 'input',
        colSpan: 2,
        muted: !(snapshot.io_bindings?.input_device || snapshot.input_device),
      },
      {
        key: 'output-device',
        label: 'Output Device',
        value: snapshot.io_bindings?.output_device || snapshot.output_device || 'Not assigned',
        accent: 'output',
        colSpan: 2,
        muted: !(snapshot.io_bindings?.output_device || snapshot.output_device),
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
        value: formatCount(resolveChannelCount(snapshot, editorSnapshotDraft), 'channel'),
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
        value: formatNodeSyncStatus(snapshot),
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
    runtimeLiveState = null,
    detailsAction,
    onRenameSnapshot,
    snapshotRenamePending = false,
    onLoadPreviousSnapshot,
    onLoadNextSnapshot,
    previousSnapshotDisabled = false,
    nextSnapshotDisabled = false,
    previousSnapshotDisabledReason,
    nextSnapshotDisabledReason,
    onToggleSnapshotFavorite,
    snapshotFavoritePending = false,
    onToggleSnapshotLock,
    snapshotLockPending = false,
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
    outputLevelWarningMessage = null,
  } = props

  const metadataTableRows = useMemo(
    () => (liveSnapshot ? buildMetadataTableRows(liveSnapshot, Boolean(detailsAction), editorSnapshotDraft) : []),
    [detailsAction, editorSnapshotDraft, liveSnapshot],
  )
  const midiReadout = useMemo(
    () => (liveSnapshot ? formatMidiReadout(liveSnapshot) : 'PC --  CH --'),
    [liveSnapshot],
  )
  const liveHeadline = useMemo(
    () => resolveLiveHeadline(liveSnapshot, runtimeLiveState),
    [liveSnapshot, runtimeLiveState],
  )
  const channelActivityBadge = useMemo(
    () => buildChannelActivityBadge(liveSnapshot, runtimeLiveState),
    [liveSnapshot, runtimeLiveState],
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
  const showSnapshotActionRow = Boolean(
    (liveSnapshot && onToggleSnapshotFavorite)
    || (liveSnapshot && onToggleSnapshotLock)
    || snapshotLocked,
  )

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
                    accentColor="#42be65"
                    className="juce-grid-page__snapshot-status-bpm-input"
                    displayOverlay={(
                      <SegmentedLedText
                        value={storedTempoDisplay}
                        size="md"
                        color="#42be65"
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
                  color={liveSnapshot ? '#78a9ff' : '#525252'}
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
                {channelActivityBadge ? (
                  <div
                    title={channelActivityBadge.tooltip}
                    aria-label={channelActivityBadge.tooltip}
                    className="juce-grid-page__snapshot-status-channel-badge-wrap"
                  >
                    <Tag
                      type={channelActivityBadge.warning ? 'warm-gray' : 'green'}
                      className={`juce-grid-page__snapshot-status-channel-badge ${channelActivityBadge.warning ? 'is-warning' : 'is-healthy'}`}
                    >
                      {channelActivityBadge.label}
                    </Tag>
                  </div>
                ) : null}
              </div>
              <div className="juce-grid-page__snapshot-status-live-row">
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
                {(onLoadPreviousSnapshot || onLoadNextSnapshot) ? (
                  <div className="juce-grid-page__snapshot-status-nav" role="toolbar" aria-label="Snapshot navigation">
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={ArrowLeft}
                      onClick={onLoadPreviousSnapshot}
                      disabled={previousSnapshotDisabled}
                      title={previousSnapshotDisabledReason}
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={ArrowRight}
                      onClick={onLoadNextSnapshot}
                      disabled={nextSnapshotDisabled}
                      title={nextSnapshotDisabledReason}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
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
              {liveSnapshot && goLiveState ? (
                <div className="juce-grid-page__snapshot-status-go-live" aria-live="polite">
                  {goLiveState.phase === 'live' ? (
                    <span className="juce-grid-page__snapshot-status-go-live-indicator juce-grid-page__snapshot-status-state-label is-current is-blinking">
                      LIVE
                    </span>
                  ) : (
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
                  )}
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
              {showSnapshotActionRow ? (
                <div className="juce-grid-page__snapshot-status-secondary-actions" role="group" aria-label="Snapshot actions">
                  {liveSnapshot && onToggleSnapshotFavorite ? (
                    <Button
                      size="sm"
                      kind={liveSnapshot.is_favorite ? 'secondary' : 'ghost'}
                      renderIcon={liveSnapshot.is_favorite ? FavoriteFilled : Favorite}
                      onClick={onToggleSnapshotFavorite}
                      disabled={snapshotFavoritePending}
                    >
                      {snapshotFavoritePending
                        ? (liveSnapshot.is_favorite ? 'Updating…' : 'Saving…')
                        : (liveSnapshot.is_favorite ? 'Favorited' : 'Favorite')}
                    </Button>
                  ) : null}
                  {liveSnapshot && onToggleSnapshotLock ? (
                    <Button
                      size="sm"
                      kind={snapshotLocked ? 'secondary' : 'ghost'}
                      onClick={onToggleSnapshotLock}
                      disabled={snapshotLockPending}
                    >
                      {snapshotLockPending
                        ? (snapshotLocked ? 'Unlocking…' : 'Locking…')
                        : (snapshotLocked ? 'Locked' : 'Lock')}
                    </Button>
                  ) : null}
                  {snapshotLocked ? <Tag type="warm-gray">Locked</Tag> : null}
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
