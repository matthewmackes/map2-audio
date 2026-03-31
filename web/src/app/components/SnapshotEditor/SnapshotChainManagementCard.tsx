import { Edit } from '@carbon/icons-react'
import { useMemo, type ReactNode } from 'react'
import { Layer, Table, TableBody, TableCell, TableRow } from '@carbon/react'
import type { SnapshotDetail, SnapshotDraftData, SnapshotMidiMapEntry, SnapshotRuntimeLiveState } from '../../../map2/types'
import { SegmentedLedText } from '../Displays/SegmentedLedText'
import { MapAudioGridIcon } from '../icons/map'

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
}

interface SnapshotMetadataCell {
  key: string
  label: string
  value: string
  accent: 'input' | 'output' | 'blocks' | 'routing' | 'channels' | 'updated' | 'sync'
  colSpan: number
  muted?: boolean
}

interface SnapshotLiveHeadline {
  text: string
  tone: 'current' | 'other' | 'stopped'
  blinking: boolean
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
      return 'Parallel'
    case 'series':
      return 'Series'
    case 'morph':
    case 'parameter_morph':
      return 'Morph'
    case 'ab_switch':
      return 'A/B'
    case 'sidechain':
      return 'Sidechain'
    default:
      return 'Custom'
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return 'Unavailable'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unavailable'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
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
        colSpan: 3,
      },
      {
        key: 'channel-count',
        label: 'Number of Channels',
        value: formatCount(resolveChannelCount(snapshot, editorSnapshotDraft), 'channel'),
        accent: 'channels',
        colSpan: 3,
      },
    ],
    [
      {
        key: 'last-updated',
        label: 'Last Updated',
        value: formatDateTime(snapshot.updated_at || snapshot.created_at),
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
  const snapshotTitle = liveSnapshot?.name ?? 'No live snapshot'

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

            <div className="juce-grid-page__snapshot-status-midi">
              <SegmentedLedText
                value={midiReadout}
                size="md"
                color={liveSnapshot ? '#78a9ff' : '#525252'}
                className={`juce-grid-page__snapshot-status-midi-readout ${liveSnapshot ? '' : 'is-idle'}`}
              />
            </div>
          </div>

          <div className="juce-grid-page__snapshot-status-content-row">
            <div className="juce-grid-page__snapshot-status-live-block">
              <span
                className={`juce-grid-page__snapshot-status-state-label is-${liveHeadline.tone} ${liveHeadline.blinking ? 'is-blinking' : ''}`}
              >
                {liveHeadline.text}
              </span>
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
              </div>
              {!liveSnapshot && (
                <p className="juce-grid-page__snapshot-status-empty-copy">
                  Recall or create a snapshot to populate live snapshot status here.
                </p>
              )}
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
