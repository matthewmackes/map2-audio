import { Edit } from '@carbon/icons-react'
import { useMemo, type ReactNode } from 'react'
import { Layer, Tag } from '@carbon/react'
import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../../map2/types'
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
  detailsAction?: ReactNode
  onRenameSnapshot?: () => void
  snapshotRenamePending?: boolean
}

interface SnapshotStatusTile {
  label: string
  value: string
  tone?: 'default' | 'secondary'
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

function formatRoutingMode(mode: SnapshotDetail['routing']['mode']): string {
  switch (mode) {
    case 'parallel_blend':
      return 'Parallel'
    case 'series':
      return 'Series'
    case 'morph':
      return 'Morph'
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

function buildStatusTiles(snapshot: SnapshotDetail): SnapshotStatusTile[] {
  const pathCount = snapshot.channel_count || snapshot.paths.length
  return [
    {
      label: 'Input device',
      value: snapshot.io_bindings?.input_device || snapshot.input_device || 'Not assigned',
      tone: snapshot.io_bindings?.input_device || snapshot.input_device ? 'default' : 'secondary',
    },
    {
      label: 'Output device',
      value: snapshot.io_bindings?.output_device || snapshot.output_device || 'Not assigned',
      tone: snapshot.io_bindings?.output_device || snapshot.output_device ? 'default' : 'secondary',
    },
    {
      label: 'Routing mode',
      value: formatRoutingMode(snapshot.routing.mode),
    },
    {
      label: 'Path count',
      value: `${pathCount} ${pathCount === 1 ? 'path' : 'paths'}`,
    },
    {
      label: 'Favorite status',
      value: snapshot.is_favorite ? 'Favorite' : 'Standard',
      tone: snapshot.is_favorite ? 'default' : 'secondary',
    },
    {
      label: 'Last updated',
      value: formatDateTime(snapshot.updated_at || snapshot.created_at),
    },
    {
      label: 'Derived from snapshot',
      value: snapshot.lineage?.derived_from_snapshot_id !== null
        ? `Snapshot #${snapshot.lineage.derived_from_snapshot_id}`
        : 'Original snapshot',
      tone: snapshot.lineage?.derived_from_snapshot_id !== null ? 'default' : 'secondary',
    },
  ]
}

export function SnapshotChainManagementCard(props: SnapshotChainManagementCardProps) {
  const {
    liveSnapshot = null,
    detailsAction,
    onRenameSnapshot,
    snapshotRenamePending = false,
  } = props

  const statusSummaryItems = useMemo(
    () => (liveSnapshot ? buildStatusTiles(liveSnapshot) : []),
    [liveSnapshot],
  )
  const midiReadout = useMemo(
    () => (liveSnapshot ? formatMidiReadout(liveSnapshot) : 'PC --  CH --'),
    [liveSnapshot],
  )
  const isLive = Boolean(liveSnapshot?.live_state?.is_live ?? liveSnapshot?.is_active)
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
              <div className="juce-grid-page__snapshot-status-live-block">
                <span className="juce-grid-page__chain-action-label">Live</span>
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
                  {isLive && (
                    <Tag type="green" size="sm" className="juce-grid-page__snapshot-status-live-tag">
                      Live now
                    </Tag>
                  )}
                </div>
                {!liveSnapshot && (
                  <p className="juce-grid-page__snapshot-status-empty-copy">
                    Recall or create a snapshot to populate live snapshot status here.
                  </p>
                )}
              </div>
            </div>

            <div className="juce-grid-page__snapshot-status-aside">
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

          {statusSummaryItems.length > 0 || detailsAction ? (
            <div
              className={`juce-grid-page__snapshot-status-summary-row ${detailsAction ? 'has-details-action' : ''}`}
              aria-label="Live snapshot summary"
            >
              {statusSummaryItems.map((item) => (
                <div
                  key={item.label}
                  className={`juce-grid-page__snapshot-status-summary-item ${item.tone === 'secondary' ? 'is-secondary' : ''}`}
                >
                  <span className="juce-grid-page__snapshot-status-summary-label">{item.label}</span>
                  <span className="juce-grid-page__snapshot-status-summary-value">{item.value}</span>
                </div>
              ))}
              {detailsAction ? (
                <div className="juce-grid-page__snapshot-status-summary-action">
                  {detailsAction}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Layer>
  )
}
