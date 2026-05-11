/**
 * T2503 Set 10 — Mixer sub-area page.
 *
 * Reuses the SnapshotEditor's UnifiedChannelGrid (T710) so operators get
 * the same 8-slot channel-strip language they already know from the live
 * rig. Each DAW track adapts into one UnifiedChannelRow via
 * trackToUnifiedRow; meters are keyed by the synthetic chain id
 * `daw-track-<id>` and fed from the shared engine VU stream.
 *
 * The current mixer is read-mostly: mute/solo toggles + plugin selection.
 * Drag-reorder + insert-via-empty-slot land when Set 9 wires the plugin
 * inventory through.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layer, Tag } from '@carbon/react'

import { UnifiedChannelGrid } from '../../components/SnapshotEditor/UnifiedChannelGrid/UnifiedChannelGrid'
import { useChainMeter } from '../../components/SnapshotEditor/UnifiedChannelGrid/useChainMeter'
import type { ChainMeterReading } from '../../components/SnapshotEditor/UnifiedChannelGrid/useChainMeter'
import { useDawProjectStore } from '../../stores/dawProjectStore'
import { trackToUnifiedRow, dawTrackChainId } from '../../components/MultiTrackRecorder/trackToUnifiedRow'

interface TrackMeterRowProps {
  trackId: number
  onResolved: (chainId: string, reading: ChainMeterReading) => void
}

function TrackMeterProbe({ trackId, onResolved }: TrackMeterRowProps) {
  const chainId = dawTrackChainId(trackId)
  const reading = useChainMeter(chainId)
  useEffect(() => {
    onResolved(chainId, reading)
  }, [chainId, reading, onResolved])
  return null
}

export function MultiTrackMixerPage() {
  const navigate = useNavigate()
  const tracks = useDawProjectStore((s) => s.tracks)
  const setTrackMute = useDawProjectStore((s) => s.setTrackMute)
  const setTrackSolo = useDawProjectStore((s) => s.setTrackSolo)

  const rows = useMemo(() => tracks.map(trackToUnifiedRow), [tracks])

  const [meters, setMeters] = useState<Record<string, ChainMeterReading>>({})
  const handleMeter = (chainId: string, reading: ChainMeterReading) => {
    setMeters((prev) => {
      const existing = prev[chainId]
      if (
        existing
        && existing.left === reading.left
        && existing.right === reading.right
        && existing.isLive === reading.isLive
        && existing.clipped === reading.clipped
      ) {
        return prev
      }
      return { ...prev, [chainId]: reading }
    })
  }
  const [selected, setSelected] = useState<{ rowId: string; slotIndex: number } | null>(null)

  return (
    <Layer>
      <div style={{ padding: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Mixer</h2>
          <Tag size="sm" type="warm-gray">{tracks.length} channel{tracks.length === 1 ? '' : 's'}</Tag>
          <Tag size="sm" type="blue">UnifiedChannelGrid · 8 slots/row</Tag>
        </header>

        {tracks.length === 0 ? (
          <p style={{ opacity: 0.6, margin: 0 }} data-testid="daw-mixer-empty">
            Add tracks from the Tracks tab to populate the mixer. Each track maps to
            a channel strip with up to 8 plugin slots.
          </p>
        ) : (
          <>
            {/* Mount one TrackMeterProbe per row to feed the meters dict.
                Probes never render output; they only subscribe to
                useChainMeter and push readings up. */}
            {tracks.map((t) => (
              <TrackMeterProbe key={t.id} trackId={t.id} onResolved={handleMeter} />
            ))}
            <UnifiedChannelGrid
              rows={rows}
              selectedBlock={selected}
              meters={meters}
              onSelectBlock={(rowId, slotIndex) => {
                setSelected({ rowId, slotIndex })
                // Selecting a block routes the operator to the Plugins
                // tab focused on that track for editing.
                const trackId = Number(rowId.replace(/^daw-track-/, ''))
                if (Number.isFinite(trackId)) {
                  navigate(`/multitrack-recorder/plugins?track=${trackId}&slot=${slotIndex}`)
                }
              }}
              onAddBlock={(rowId) => {
                const trackId = Number(rowId.replace(/^daw-track-/, ''))
                if (Number.isFinite(trackId)) {
                  navigate(`/multitrack-recorder/plugins?track=${trackId}`)
                }
              }}
              onToggleMute={(rowId) => {
                const trackId = Number(rowId.replace(/^daw-track-/, ''))
                const track = tracks.find((t) => t.id === trackId)
                if (track) {
                  setTrackMute(trackId, !track.muted)
                }
              }}
              onToggleSolo={(rowId) => {
                const trackId = Number(rowId.replace(/^daw-track-/, ''))
                const track = tracks.find((t) => t.id === trackId)
                if (track) {
                  setTrackSolo(trackId, !track.solo)
                }
              }}
              onDeselect={() => setSelected(null)}
            />
          </>
        )}
      </div>
    </Layer>
  )
}

export default MultiTrackMixerPage
