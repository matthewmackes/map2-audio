/**
 * T2503 Set 10 — Tracks sub-area page.
 *
 * Ports the DawTrackList component (with arm/delete) from the retired
 * /daw page. The local-state mirror is replaced by the shared
 * `useDawProjectStore` so the Mixer / Plugins / Automation sub-areas
 * see the same tracks without round-tripping through the engine.
 *
 * Each mutation still fires the canonical daw.* verb. The engine
 * remains the source of truth; on Set 7+ WebSocket events will hydrate
 * the store and remove the optimistic update.
 */
import { useMutation } from '@tanstack/react-query'
import {
  Button,
  Layer,
  Stack,
  Tag,
  TextInput,
} from '@carbon/react'
import { Add, TrashCan } from '@carbon/icons-react'
import { useState } from 'react'

import { dawApi, type TrackType } from '../../../map2/clients/daw'
import { useDawProjectStore } from '../../stores/dawProjectStore'

export function MultiTrackTracksPage() {
  const tracks = useDawProjectStore((s) => s.tracks)
  const createTrack = useDawProjectStore((s) => s.createTrack)
  const deleteTrack = useDawProjectStore((s) => s.deleteTrack)
  const setTrackArm = useDawProjectStore((s) => s.setTrackArm)
  const setTrackMute = useDawProjectStore((s) => s.setTrackMute)
  const setTrackSolo = useDawProjectStore((s) => s.setTrackSolo)
  const renameTrack = useDawProjectStore((s) => s.renameTrack)

  const [pendingName, setPendingName] = useState('')
  const [pendingType, setPendingType] = useState<TrackType>('audio')

  const createMutation = useMutation({
    mutationFn: ({ type, name }: { type: TrackType; name?: string }) =>
      dawApi.createTrack({ type, name }),
    onSuccess: (_data, vars) => {
      createTrack(vars.type, vars.name)
      setPendingName('')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => dawApi.deleteTrack(id),
    onSuccess: (_data, id) => deleteTrack(id),
  })
  const armMutation = useMutation({
    mutationFn: ({ id, armed }: { id: number; armed: boolean }) =>
      dawApi.setTrackArm(id, armed),
    onSuccess: (_data, vars) => setTrackArm(vars.id, vars.armed),
  })

  return (
    <Layer>
      <div style={{ padding: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Tracks</h2>
          <Tag size="sm" type="warm-gray">{tracks.length} active</Tag>
        </header>
        <Stack gap={4}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextInput
              id="multitrack-new-track-name"
              labelText="New track name"
              placeholder={pendingType === 'audio' ? `Audio ${tracks.length + 1}` : `MIDI ${tracks.length + 1}`}
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              data-testid="daw-new-track-name"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="multitrack-new-track-type" style={{ fontSize: 11, color: 'var(--cds-text-helper, #a8a8a8)' }}>
                Track type
              </label>
              <select
                id="multitrack-new-track-type"
                aria-label="Track type"
                value={pendingType}
                onChange={(e) => setPendingType(e.target.value as TrackType)}
                data-testid="daw-new-track-type"
              >
                <option value="audio">Audio</option>
                <option value="midi">MIDI</option>
              </select>
            </div>
            <Button
              kind="primary"
              renderIcon={Add}
              onClick={() => createMutation.mutate({ type: pendingType, name: pendingName || undefined })}
              data-testid="daw-create-track"
            >
              Add track
            </Button>
          </div>

          {tracks.length === 0 ? (
            <p style={{ opacity: 0.6, margin: 0 }} data-testid="daw-tracks-empty">
              No tracks yet. Add one above, or load a project from the Sessions tab.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {tracks.map((track) => (
                <li
                  key={track.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '64px 1fr auto auto auto auto auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--cds-border-subtle-01)',
                  }}
                  data-testid={`daw-track-row-${track.id}`}
                >
                  <Tag size="sm" type={track.type === 'audio' ? 'cyan' : 'purple'}>
                    {track.type}
                  </Tag>
                  <TextInput
                    id={`daw-track-name-${track.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={track.name}
                    onChange={(e) => renameTrack(track.id, e.target.value)}
                  />
                  <Button
                    kind={track.armed ? 'danger' : 'tertiary'}
                    size="sm"
                    onClick={() => armMutation.mutate({ id: track.id, armed: !track.armed })}
                    data-testid={`daw-track-arm-${track.id}`}
                  >
                    {track.armed ? 'Disarm' : 'Arm'}
                  </Button>
                  <Button
                    kind={track.muted ? 'danger' : 'ghost'}
                    size="sm"
                    onClick={() => setTrackMute(track.id, !track.muted)}
                    data-testid={`daw-track-mute-${track.id}`}
                  >
                    {track.muted ? 'Muted' : 'Mute'}
                  </Button>
                  <Button
                    kind={track.solo ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setTrackSolo(track.id, !track.solo)}
                    data-testid={`daw-track-solo-${track.id}`}
                  >
                    {track.solo ? 'Solo' : 'Solo'}
                  </Button>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    iconDescription={`Delete ${track.name}`}
                    hasIconOnly
                    onClick={() => deleteMutation.mutate(track.id)}
                    data-testid={`daw-track-delete-${track.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </div>
    </Layer>
  )
}

export default MultiTrackTracksPage
