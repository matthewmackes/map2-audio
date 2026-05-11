/**
 * T2503 Set 10 — Transport sub-area page.
 *
 * Ports the DawTransportBar + DawTimeline + DawEventTrace components from
 * the retired /daw reference UI into a tier-1-shaped panel grid. The
 * transport mutations fire through dawApi.* — exactly the same verb
 * surface tier-1 MIDI surfaces (MK1, MCU, generic learn) use.
 */
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  ButtonSet,
  Layer,
  NumberInput,
  Stack,
  Tag,
} from '@carbon/react'
import { Play, Stop, Recording, SkipBack } from '@carbon/icons-react'

import { dawApi, type DawModeStatus, type DawEvent } from '../../../map2/clients/daw'
import { useDawEventStream } from '../../components/MultiTrackRecorder/useDawEventStream'

export function MultiTrackTransportPage() {
  const queryClient = useQueryClient()
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['daw', 'mode'] }),
    [queryClient],
  )

  const modeQuery = useQuery<DawModeStatus>({
    queryKey: ['daw', 'mode'],
    queryFn: () => dawApi.getMode(),
    refetchInterval: 2000,
    retry: false,
  })
  const status = modeQuery.data
  const available = status?.daw_mode_available ?? false

  const events = useDawEventStream()
  const lastSnapshot = useMemo<DawEvent | undefined>(
    () => events.find((e) => e.kind === 'snapshot'),
    [events],
  )

  const playMutation = useMutation({
    mutationFn: () => dawApi.play(),
    onSuccess: invalidate,
  })
  const stopMutation = useMutation({
    mutationFn: () => dawApi.stop(),
    onSuccess: invalidate,
  })
  const recMutation = useMutation({
    mutationFn: (arm: boolean) => dawApi.setRecord(arm),
    onSuccess: invalidate,
  })
  const seekMutation = useMutation({
    mutationFn: (samples: number) => dawApi.setPosition(samples),
    onSuccess: invalidate,
  })

  const [position, setPosition] = useState<number>(0)

  return (
    <Stack gap={6}>
      <Layer>
        <div style={{ padding: 16 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Transport</h2>
            <Tag size="sm" type={status?.mode === 'daw' ? 'green' : 'cyan'} data-testid="daw-mode-tag">
              mode: {status?.mode ?? '—'}
            </Tag>
            <Tag size="sm" type={status?.state === 'running' ? 'green' : 'magenta'} data-testid="daw-state-tag">
              state: {status?.state ?? '—'}
            </Tag>
          </header>
          <ButtonSet>
            <Button
              kind="primary"
              renderIcon={Play}
              onClick={() => playMutation.mutate()}
              disabled={!available}
              data-testid="daw-transport-play"
            >
              Play
            </Button>
            <Button
              kind="secondary"
              renderIcon={Stop}
              onClick={() => stopMutation.mutate()}
              disabled={!available}
              data-testid="daw-transport-stop"
            >
              Stop
            </Button>
            <Button
              kind="danger"
              renderIcon={Recording}
              onClick={() => recMutation.mutate(true)}
              disabled={!available}
              data-testid="daw-transport-record"
            >
              Arm
            </Button>
            <Button
              kind="ghost"
              renderIcon={SkipBack}
              onClick={() => {
                setPosition(0)
                seekMutation.mutate(0)
              }}
              disabled={!available}
              data-testid="daw-transport-rewind"
            >
              Rewind
            </Button>
          </ButtonSet>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Seek</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <NumberInput
              id="multitrack-seek-position"
              label="Position (samples)"
              min={0}
              step={48000}
              value={position}
              onChange={(_e, v: any) => setPosition(Number(v.value ?? position))}
              disabled={!available}
              data-testid="daw-seek-position"
            />
            <Button
              kind="primary"
              onClick={() => seekMutation.mutate(position)}
              disabled={!available}
              data-testid="daw-seek-go"
            >
              Seek
            </Button>
          </div>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16 }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Timeline</h2>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
            {lastSnapshot ? (
              <>
                snapshot mode={String(lastSnapshot.payload.mode ?? '?')}
                {' · '}state={String(lastSnapshot.payload.state ?? '?')}
              </>
            ) : (
              'No events yet. Snapshot will appear when the engine emits its first frame.'
            )}
          </p>
        </div>
      </Layer>

      <Layer>
        <div style={{ padding: 16, maxHeight: 280, overflow: 'auto' }}>
          <h2 style={{ margin: 0, marginBottom: 12, fontSize: '1rem' }}>Event trace</h2>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.75rem',
              lineHeight: 1.6,
            }}
            data-testid="daw-event-trace"
          >
            {events.length === 0 ? (
              <li style={{ opacity: 0.6 }}>(no events received)</li>
            ) : (
              events.slice().reverse().map((event, i) => (
                <li key={i}>
                  {event.timestamp
                    ? new Date(event.timestamp * 1000).toISOString().slice(11, 23)
                    : '--:--:--'}
                  {' '}
                  {event.kind}
                </li>
              ))
            )}
          </ol>
        </div>
      </Layer>
    </Stack>
  )
}

export default MultiTrackTransportPage
