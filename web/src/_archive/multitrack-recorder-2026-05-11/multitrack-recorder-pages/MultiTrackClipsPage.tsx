/**
 * T2503 Set 10 — Clips sub-area page.
 *
 * Ports the DawClipLauncher component. Each pad fires daw.clip.add with
 * the active track + slot offset. Set 8 (Mixxx-derived clip-launcher /
 * deck patterns) fills out the cue/hot-cue/sync semantics behind these
 * pads; this page surfaces the existing add-clip verb today so operators
 * see live state.
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Button,
  Layer,
  NumberInput,
  Stack,
  Tag,
} from '@carbon/react'
import { TrashCan } from '@carbon/icons-react'

import { dawApi } from '../../../map2/clients/daw'
import { useDawProjectStore } from '../../stores/dawProjectStore'

const PADS_PER_ROW = 4
const TOTAL_PADS = 16
const CLIP_LENGTH_SAMPLES = 96000 // 2s @ 48kHz; Set 8 will source per-clip lengths

export function MultiTrackClipsPage() {
  const tracks = useDawProjectStore((s) => s.tracks)
  const clips = useDawProjectStore((s) => s.clips)
  const addClipLocal = useDawProjectStore((s) => s.addClip)
  const removeClipLocal = useDawProjectStore((s) => s.removeClip)

  const [activeTrackId, setActiveTrackId] = useState<number>(() => tracks[0]?.id ?? 0)
  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === activeTrackId) ?? null,
    [tracks, activeTrackId],
  )
  const activeClips = useMemo(
    () => clips.filter((c) => c.track_id === activeTrackId),
    [clips, activeTrackId],
  )

  const addMutation = useMutation({
    mutationFn: (slot: number) =>
      dawApi.addClip({
        track_id: activeTrackId,
        start_samples: slot * CLIP_LENGTH_SAMPLES,
        length_samples: CLIP_LENGTH_SAMPLES,
        source: `audio/pad-${slot + 1}.wav`,
      }),
    onSuccess: (_data, slot) => {
      addClipLocal({
        track_id: activeTrackId,
        start_samples: slot * CLIP_LENGTH_SAMPLES,
        length_samples: CLIP_LENGTH_SAMPLES,
        source: `audio/pad-${slot + 1}.wav`,
      })
    },
  })
  const removeMutation = useMutation({
    mutationFn: (id: number) => dawApi.removeClip(id),
    onSuccess: (_data, id) => removeClipLocal(id),
  })

  return (
    <Stack gap={6}>
      <Layer>
        <div style={{ padding: 16 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Clip launcher</h2>
            <Tag size="sm" type="warm-gray">{activeClips.length} clips on this track</Tag>
          </header>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
            <NumberInput
              id="multitrack-clips-active-track"
              label="Active track id"
              min={0}
              value={activeTrackId}
              onChange={(_e, v: any) => setActiveTrackId(Number(v.value ?? activeTrackId))}
              data-testid="daw-active-track-input"
            />
            <span style={{ alignSelf: 'center', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
              {activeTrack ? `→ ${activeTrack.name} (${activeTrack.type})` : '(no track)'}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${PADS_PER_ROW}, 96px)`,
              gap: 6,
            }}
            data-testid="daw-clip-pad-grid"
          >
            {Array.from({ length: TOTAL_PADS }, (_, i) => (
              <Button
                key={i}
                kind="tertiary"
                size="md"
                onClick={() => addMutation.mutate(i)}
                data-testid={`daw-clip-pad-${i}`}
              >
                Pad {i + 1}
              </Button>
            ))}
          </div>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Clip list</h2>
          {activeClips.length === 0 ? (
            <p style={{ opacity: 0.6, margin: 0 }}>No clips on this track yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {activeClips.map((clip) => (
                <li
                  key={clip.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '64px 1fr 1fr auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--cds-border-subtle-01)',
                  }}
                  data-testid={`daw-clip-row-${clip.id}`}
                >
                  <Tag size="sm" type="cyan">#{clip.id}</Tag>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem' }}>
                    start {clip.start_samples}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem' }}>
                    len {clip.length_samples}
                  </span>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    iconDescription={`Remove clip ${clip.id}`}
                    hasIconOnly
                    onClick={() => removeMutation.mutate(clip.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Layer>
    </Stack>
  )
}

export default MultiTrackClipsPage
