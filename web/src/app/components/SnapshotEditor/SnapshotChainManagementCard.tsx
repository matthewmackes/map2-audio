import { useMemo } from 'react'
import { Music } from '@carbon/icons-react'
import { Layer, Tag, Tile } from '@carbon/react'
import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../../map2/types'
import { SegmentedLedText } from '../Displays/SegmentedLedText'

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
}

interface SnapshotStatusTile {
  label: string
  value: string
  tone?: 'default' | 'secondary'
  wide?: boolean
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
      label: 'Description',
      value: snapshot.description.trim() || 'No description',
      tone: snapshot.description.trim() ? 'default' : 'secondary',
      wide: true,
    },
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
  const { liveSnapshot = null } = props

  const statusTiles = useMemo(
    () => (liveSnapshot ? buildStatusTiles(liveSnapshot) : []),
    [liveSnapshot],
  )
  const midiReadout = useMemo(
    () => (liveSnapshot ? formatMidiReadout(liveSnapshot) : 'PC --  CH --'),
    [liveSnapshot],
  )

  return (
    <Layer className="juce-grid-page__chain-card juce-grid-page__snapshot-status-card">
      <div className="juce-grid-page__snapshot-status-header">
        <div className="juce-grid-page__snapshot-status-header-copy">
          <div className="juce-grid-page__snapshot-status-heading">
            <Music size={18} />
            <strong>Live Snapshot</strong>
          </div>
          <p>Read-only status for the snapshot currently driving this signal workspace.</p>
        </div>
        {liveSnapshot && (
          <div className="juce-grid-page__snapshot-status-header-actions">
            <Tag type="green">Live now</Tag>
            {liveSnapshot.is_favorite && <Tag type="cool-gray">Favorite</Tag>}
          </div>
        )}
      </div>

      {liveSnapshot ? (
        <div className="juce-grid-page__snapshot-status-layout">
          <div className="juce-grid-page__snapshot-status-hero">
            <div className="juce-grid-page__snapshot-status-hero-copy">
              <span className="juce-grid-page__chain-action-label">Current snapshot</span>
              <div className="juce-grid-page__snapshot-status-hero-row">
                <h2 className="juce-grid-page__snapshot-status-title">{liveSnapshot.name}</h2>
                <div className="juce-grid-page__snapshot-status-midi">
                  <SegmentedLedText
                    value={midiReadout}
                    size="md"
                    color="#78a9ff"
                    className="juce-grid-page__snapshot-status-midi-readout"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="juce-grid-page__snapshot-status-grid" role="list" aria-label="Live snapshot attributes">
            {statusTiles.map((tile) => (
              <Tile
                key={tile.label}
                role="listitem"
                className={`juce-grid-page__snapshot-status-tile ${tile.wide ? 'is-wide' : ''}`}
              >
                <span className="juce-grid-page__chain-action-label">{tile.label}</span>
                <strong className={`juce-grid-page__snapshot-status-value ${tile.tone === 'secondary' ? 'is-secondary' : ''}`}>
                  {tile.value}
                </strong>
              </Tile>
            ))}
          </div>
        </div>
      ) : (
        <Tile className="juce-grid-page__snapshot-status-empty">
          <span className="juce-grid-page__chain-action-label">Current snapshot</span>
          <h2 className="juce-grid-page__snapshot-status-title">No live snapshot</h2>
          <p>Recall or create a snapshot to populate live snapshot status here.</p>
          <div className="juce-grid-page__snapshot-status-midi">
            <SegmentedLedText
              value={midiReadout}
              size="md"
              color="#525252"
              className="juce-grid-page__snapshot-status-midi-readout is-idle"
            />
          </div>
        </Tile>
      )}
    </Layer>
  )
}
