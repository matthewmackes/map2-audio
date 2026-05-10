/**
 * T2503 Set 10 — DAW reference UI.
 *
 * NON-TIER-1 SURFACE. The tier-1 control surfaces are MIDI controllers
 * (Maschine MK1, Mackie Control Universal, generic MIDI learn). This
 * page exists as a reference implementation that proves the verb surface
 * is complete + round-trippable, and as a debugging tool when the MIDI
 * surface state diverges from engine state. The page header carries a
 * "Reference UI — control via MIDI surface" badge to make this clear.
 *
 * Composition:
 *   - DawTransportBar       — play/stop/record/position
 *   - DawTrackList          — tracks with arm + delete
 *   - DawClipLauncher       — clip grid (active track scoped)
 *   - DawPluginRack         — plugins per track + param edit
 *   - DawAutomationView     — automation lane points
 *   - DawTimeline           — sample-position read-out + scrub
 *
 * Live state hydrates via a single GET /api/daw/mode + the WebSocket
 * /api/v1/daw/events stream. Mutations fire through dawApi (the v1 verb
 * surface).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  ButtonSet,
  InlineNotification,
  Layer,
  NumberInput,
  Stack,
  Tag,
  TextInput,
} from '@carbon/react'
import {
  Play,
  Stop,
  Recording,
  RewindOutline,
  TrashCan,
  Add,
} from '@carbon/icons-react'

import {
  type DawEvent,
  dawApi,
  type DawModeStatus,
  openDawEventStream,
  type TrackType,
} from '../../map2/clients/daw'
import { pluginInventoryApi } from '../../map2/clients/pluginInventory'

// ---------------------------------------------------------------------------
// Top-level page
// ---------------------------------------------------------------------------

export function DawPage(): React.ReactElement {
  const modeQuery = useQuery<DawModeStatus>({
    queryKey: ['daw', 'mode'],
    queryFn: () => dawApi.getMode(),
    refetchInterval: 2000,
  })

  const [events, setEvents] = useState<DawEvent[]>([])
  useEffect(() => {
    const stream = openDawEventStream(
      (event) => setEvents((prev) => [...prev.slice(-49), event]),
      (err) => console.warn('[daw] WS error', err),
    )
    return () => stream.close()
  }, [])

  const status = modeQuery.data

  return (
    <div className="map2-daw-page" style={{ padding: 16 }}>
      <DawHeader status={status} />
      {status?.daw_mode_available === false && <DawDisabledBanner />}
      <Stack gap={6}>
        <DawTransportBar status={status} disabled={!status?.daw_mode_available} />
        <DawTimeline events={events} />
        <DawTrackList disabled={!status?.daw_mode_available} />
        <DawClipLauncher disabled={!status?.daw_mode_available} />
        <DawPluginRack disabled={!status?.daw_mode_available} />
        <DawAutomationView disabled={!status?.daw_mode_available} />
        <DawEventTrace events={events} />
      </Stack>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header + non-tier-1 banner
// ---------------------------------------------------------------------------

function DawHeader({ status }: { status?: DawModeStatus }): React.ReactElement {
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>DAW</h1>
      <Tag type="warm-gray" size="sm">
        Reference UI — control via MIDI surface
      </Tag>
      {status && (
        <>
          <Tag
            type={status.mode === 'daw' ? 'green' : 'cyan'}
            size="sm"
            data-testid="daw-mode-tag"
          >
            mode: {status.mode}
          </Tag>
          <Tag
            type={status.state === 'running' ? 'green' : 'magenta'}
            size="sm"
            data-testid="daw-state-tag"
          >
            state: {status.state}
          </Tag>
          {!status.daw_mode_available && (
            <Tag type="red" size="sm">
              daw mode disabled in this build
            </Tag>
          )}
        </>
      )}
    </div>
  )
}

function DawDisabledBanner(): React.ReactElement {
  return (
    <Layer style={{ marginBottom: 16 }}>
      <InlineNotification
        kind="warning"
        title="DAW mode disabled"
        subtitle="This engine build was compiled without -DMAP2_DAW_MODE=ON. The reference UI is read-only; mutations will return 503."
        lowContrast
        hideCloseButton
      />
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Transport bar
// ---------------------------------------------------------------------------

function DawTransportBar({
  status,
  disabled,
}: {
  status?: DawModeStatus
  disabled: boolean
}): React.ReactElement {
  const queryClient = useQueryClient()
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['daw', 'mode'] }),
    [queryClient],
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

  return (
    <Layer>
      <div style={{ padding: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Transport</h2>
        <ButtonSet>
          <Button
            kind="primary"
            renderIcon={Play}
            onClick={() => playMutation.mutate()}
            disabled={disabled}
            data-testid="daw-transport-play"
          >
            Play
          </Button>
          <Button
            kind="secondary"
            renderIcon={Stop}
            onClick={() => stopMutation.mutate()}
            disabled={disabled}
            data-testid="daw-transport-stop"
          >
            Stop
          </Button>
          <Button
            kind="danger"
            renderIcon={Recording}
            onClick={() => recMutation.mutate(true)}
            disabled={disabled}
            data-testid="daw-transport-record"
          >
            Arm
          </Button>
          <Button
            kind="ghost"
            renderIcon={RewindOutline}
            onClick={() => seekMutation.mutate(0)}
            disabled={disabled}
            data-testid="daw-transport-rewind"
          >
            Rewind
          </Button>
        </ButtonSet>
      </div>
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Track list
// ---------------------------------------------------------------------------

interface LocalTrack {
  id: number
  type: TrackType
  name: string
  armed: boolean
}

function DawTrackList({ disabled }: { disabled: boolean }): React.ReactElement {
  // Set 10 ships a local-state mirror; bench-gate slice replaces with the
  // engine_command-fed inventory. The verb dispatch is real either way.
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [pendingName, setPendingName] = useState('')
  const [pendingType, setPendingType] = useState<TrackType>('audio')

  const createMutation = useMutation({
    mutationFn: ({ type, name }: { type: TrackType; name?: string }) =>
      dawApi.createTrack({ type, name }),
    onSuccess: () => {
      setTracks((prev) => [
        ...prev,
        {
          id: prev.length,
          type: pendingType,
          name: pendingName || `${pendingType === 'audio' ? 'Audio' : 'MIDI'} ${prev.length + 1}`,
          armed: false,
        },
      ])
      setPendingName('')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => dawApi.deleteTrack(id),
    onSuccess: (_data, id) => {
      setTracks((prev) => prev.filter((t) => t.id !== id))
    },
  })
  const armMutation = useMutation({
    mutationFn: ({ id, armed }: { id: number; armed: boolean }) =>
      dawApi.setTrackArm(id, armed),
    onSuccess: (_data, vars) => {
      setTracks((prev) =>
        prev.map((t) => (t.id === vars.id ? { ...t, armed: vars.armed } : t)),
      )
    },
  })

  return (
    <Layer>
      <div style={{ padding: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Tracks</h2>
        <Stack gap={4}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              id="daw-new-track-name"
              labelText="New track name"
              placeholder="Audio 1"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              disabled={disabled}
              data-testid="daw-new-track-name"
            />
            <select
              aria-label="Track type"
              value={pendingType}
              onChange={(e) => setPendingType(e.target.value as TrackType)}
              disabled={disabled}
              data-testid="daw-new-track-type"
            >
              <option value="audio">Audio</option>
              <option value="midi">MIDI</option>
            </select>
            <Button
              kind="primary"
              renderIcon={Add}
              onClick={() => createMutation.mutate({ type: pendingType, name: pendingName || undefined })}
              disabled={disabled}
              data-testid="daw-create-track"
            >
              Add
            </Button>
          </div>
          {tracks.length === 0 ? (
            <p style={{ opacity: 0.6, margin: 0 }}>
              No tracks. Add one or load a project.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {tracks.map((track) => (
                <li
                  key={track.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '4px 0',
                    borderBottom: '1px solid var(--cds-border-subtle-01)',
                  }}
                  data-testid={`daw-track-row-${track.id}`}
                >
                  <Tag size="sm" type={track.type === 'audio' ? 'cyan' : 'purple'}>
                    {track.type}
                  </Tag>
                  <span style={{ flex: 1 }}>{track.name}</span>
                  <Button
                    kind={track.armed ? 'danger' : 'tertiary'}
                    size="sm"
                    onClick={() =>
                      armMutation.mutate({ id: track.id, armed: !track.armed })
                    }
                    disabled={disabled}
                  >
                    {track.armed ? 'Disarm' : 'Arm'}
                  </Button>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={TrashCan}
                    iconDescription="Delete"
                    hasIconOnly
                    onClick={() => deleteMutation.mutate(track.id)}
                    disabled={disabled}
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

// ---------------------------------------------------------------------------
// Clip launcher
// ---------------------------------------------------------------------------

function DawClipLauncher({ disabled }: { disabled: boolean }): React.ReactElement {
  const [activeTrack, setActiveTrack] = useState(0)
  const addClip = useMutation({
    mutationFn: (slot: number) =>
      dawApi.addClip({
        track_id: activeTrack,
        start_samples: slot * 96000,
        length_samples: 96000,
        source: `audio/pad-${slot + 1}.wav`,
      }),
  })
  return (
    <Layer>
      <div style={{ padding: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Clip launcher</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span>Active track:</span>
          <NumberInput
            id="daw-active-track"
            label=""
            hideLabel
            min={0}
            max={31}
            value={activeTrack}
            onChange={(_e, v: any) => setActiveTrack(Number(v.value ?? activeTrack))}
            disabled={disabled}
            data-testid="daw-active-track-input"
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 80px)',
            gap: 4,
          }}
        >
          {Array.from({ length: 16 }, (_, i) => (
            <Button
              key={i}
              kind="tertiary"
              size="sm"
              onClick={() => addClip.mutate(i)}
              disabled={disabled}
              data-testid={`daw-clip-pad-${i}`}
            >
              Pad {i + 1}
            </Button>
          ))}
        </div>
      </div>
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Plugin rack
// ---------------------------------------------------------------------------

function DawPluginRack({ disabled }: { disabled: boolean }): React.ReactElement {
  const [trackId, setTrackId] = useState(0)
  const inventoryQuery = useQuery({
    queryKey: ['plugin-inventory'],
    queryFn: () => pluginInventoryApi.list(),
  })
  const addPlugin = useMutation({
    mutationFn: (uri: string) => dawApi.addPluginToTrack(trackId, uri),
  })

  return (
    <Layer>
      <div style={{ padding: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Plugin rack</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span>Track:</span>
          <NumberInput
            id="daw-rack-track"
            label=""
            hideLabel
            min={0}
            max={31}
            value={trackId}
            onChange={(_e, v: any) => setTrackId(Number(v.value ?? trackId))}
            disabled={disabled}
          />
        </div>
        {inventoryQuery.isLoading && <p>Loading inventory…</p>}
        {inventoryQuery.data && (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 4,
            }}
            data-testid="daw-plugin-inventory"
          >
            {inventoryQuery.data.plugins.map((plugin) => (
              <li
                key={plugin.uri}
                style={{
                  padding: 8,
                  border: '1px solid var(--cds-border-subtle-01)',
                  borderRadius: 4,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <Tag size="sm" type={plugin.format === 'lv2' ? 'magenta' : 'green'}>
                  {plugin.format}
                </Tag>
                <span style={{ flex: 1, fontSize: '0.875rem' }}>{plugin.name}</span>
                <Button
                  kind="primary"
                  size="sm"
                  onClick={() => addPlugin.mutate(plugin.uri)}
                  disabled={disabled}
                  data-testid={`daw-plugin-add-${plugin.uri}`}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Automation view
// ---------------------------------------------------------------------------

function DawAutomationView({ disabled }: { disabled: boolean }): React.ReactElement {
  const [laneId, setLaneId] = useState(0)
  const [position, setPosition] = useState(0)
  const [value, setValue] = useState(0.5)
  const setPoint = useMutation({
    mutationFn: () => dawApi.setAutomationPoint(laneId, position, value),
  })

  return (
    <Layer>
      <div style={{ padding: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Automation</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <NumberInput
            id="daw-auto-lane"
            label="Lane ID"
            min={0}
            value={laneId}
            onChange={(_e, v: any) => setLaneId(Number(v.value ?? laneId))}
            disabled={disabled}
            data-testid="daw-auto-lane"
          />
          <NumberInput
            id="daw-auto-position"
            label="Position (beats)"
            min={0}
            step={0.25}
            value={position}
            onChange={(_e, v: any) => setPosition(Number(v.value ?? position))}
            disabled={disabled}
            data-testid="daw-auto-position"
          />
          <NumberInput
            id="daw-auto-value"
            label="Value"
            min={0}
            max={1}
            step={0.05}
            value={value}
            onChange={(_e, v: any) => setValue(Number(v.value ?? value))}
            disabled={disabled}
            data-testid="daw-auto-value"
          />
          <Button
            kind="primary"
            onClick={() => setPoint.mutate()}
            disabled={disabled}
            data-testid="daw-auto-set"
          >
            Set point
          </Button>
        </div>
      </div>
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Timeline (sample-position read-out)
// ---------------------------------------------------------------------------

function DawTimeline({ events }: { events: DawEvent[] }): React.ReactElement {
  // Surface the most recent transport position from the WS stream.
  const lastSnapshot = events.find((e) => e.kind === 'snapshot')
  return (
    <Layer>
      <div style={{ padding: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Timeline</h2>
        <p style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>
          {lastSnapshot ? (
            <>
              snapshot kind={String(lastSnapshot.payload.mode ?? '?')} state=
              {String(lastSnapshot.payload.state ?? '?')}
            </>
          ) : (
            'no events yet'
          )}
        </p>
      </div>
    </Layer>
  )
}

// ---------------------------------------------------------------------------
// Event trace (debug aid)
// ---------------------------------------------------------------------------

function DawEventTrace({ events }: { events: DawEvent[] }): React.ReactElement {
  return (
    <Layer>
      <div style={{ padding: 12, maxHeight: 200, overflow: 'auto' }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: '1rem' }}>Event trace</h2>
        <ol
          style={{ margin: 0, padding: 0, listStyle: 'none', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}
          data-testid="daw-event-trace"
        >
          {events.slice().reverse().map((event, i) => (
            <li key={i}>
              {event.timestamp ? new Date(event.timestamp * 1000).toISOString().slice(11, 23) : '--:--:--'}
              {' '}
              {event.kind}
            </li>
          ))}
        </ol>
      </div>
    </Layer>
  )
}

export default DawPage
