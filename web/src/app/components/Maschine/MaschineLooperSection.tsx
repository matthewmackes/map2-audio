import { Button, Tag, Tile } from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { looperApi, type LooperStatus } from '../../../map2/clients/looper'
import type { MaschineHidEvent } from '../../../map2/types'

// T2523-C — Performance tab Looper section.
//
// Mirror of the physical MK1 LCD looper context (T2523-B): four-track
// loop-status grid on the left, master controls on the right. Adds
// clickable Play / Stop / Rec / Restart / Erase buttons that fire
// the same /api/v1/looper/* routes the daemon dispatches into.
//
// Active track for the transport buttons is pinned to Track 0 in
// v1 — matches the backend daemon's _LOOPER_ACTIVE_TRACK. Multi-
// track selection lands in a follow-on slice along with SHIFT-combo
// support on the hardware.
//
// State source: polled via TanStack Query @ 250ms while the section
// is mounted. T2523-D swaps this to the existing looper WS topic so
// the GUI mirror gets push updates in real time.

const ACTIVE_TRACK = 0
const STATUS_POLL_MS = 250

interface TransportButtonProps {
  label: string
  onClick: () => void
  intent?: 'danger' | 'primary' | 'secondary'
  disabled?: boolean
  /** Tag this button so the HID-event-driven flash effect can find it
   *  by transport_action without coupling to Carbon internals. */
  transportAction: 'play' | 'stop' | 'record' | 'restart' | 'erase'
}

function TransportButton({ label, onClick, intent = 'secondary', disabled, transportAction }: TransportButtonProps) {
  return (
    <Button
      kind={intent === 'danger' ? 'danger' : intent === 'primary' ? 'primary' : 'secondary'}
      size="md"
      onClick={onClick}
      disabled={disabled}
      data-maschine-looper-transport={transportAction}
    >
      {label}
    </Button>
  )
}

function trackStateTone(label: string): 'green' | 'red' | 'cyan' | 'magenta' | 'warm-gray' {
  switch (label) {
    case 'recording':
      return 'red'
    case 'overdubbing':
      return 'magenta'
    case 'playing':
      return 'green'
    case 'stopped':
      return 'cyan'
    default:
      return 'warm-gray'
  }
}

function trackStateGlyph(label: string): string {
  switch (label) {
    case 'recording':
      return 'REC'
    case 'overdubbing':
      return 'OVR'
    case 'playing':
      return 'PLAY'
    case 'stopped':
      return 'STOP'
    default:
      return '----'
  }
}

interface MaschineLooperSectionProps {
  /**
   * Optional HID event tail. T2523-C uses this only to flash the
   * matching transport button whenever the operator presses the
   * physical MK1 button — the actual dispatch happens on the daemon
   * side. Keep the prop optional so the section is mountable
   * standalone in tests / storybook surfaces.
   */
  hidEvents?: MaschineHidEvent[]
}

export function MaschineLooperSection({ hidEvents }: MaschineLooperSectionProps) {
  const queryClient = useQueryClient()
  const statusQuery = useQuery<LooperStatus>({
    queryKey: ['looper', 'status'],
    queryFn: () => looperApi.getStatus(),
    refetchInterval: STATUS_POLL_MS,
    staleTime: 0,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['looper', 'status'] })
  }

  const playMutation = useMutation({
    mutationFn: () => looperApi.play(ACTIVE_TRACK),
    onSuccess: refresh,
  })
  const stopMutation = useMutation({
    mutationFn: () => looperApi.stop(ACTIVE_TRACK),
    onSuccess: refresh,
  })
  const recordMutation = useMutation({
    mutationFn: () => looperApi.record(ACTIVE_TRACK),
    onSuccess: refresh,
  })
  const restartMutation = useMutation({
    mutationFn: () => looperApi.restart(ACTIVE_TRACK),
    onSuccess: refresh,
  })
  const eraseMutation = useMutation({
    mutationFn: () => looperApi.clear(ACTIVE_TRACK),
    onSuccess: refresh,
  })

  // Subtle visual cue: flash the matching button briefly when the
  // physical transport press lands. Implemented via a transient
  // dataset attribute rather than CSS-in-JS so motion-reduce
  // observers can opt out via the existing motion-reduce media
  // query handled elsewhere in the page.
  useEffect(() => {
    if (!hidEvents || hidEvents.length === 0) return
    const latest = hidEvents[hidEvents.length - 1]
    if (latest?.decoded_type !== 'transport_press') return
    const action = (latest.payload as { transport_action?: string } | undefined)?.transport_action
    if (!action) return
    const btn = document.querySelector<HTMLButtonElement>(
      `[data-maschine-looper-transport="${action}"]`,
    )
    if (!btn) return
    btn.dataset.maschineLooperFlash = 'on'
    const handle = window.setTimeout(() => {
      delete btn.dataset.maschineLooperFlash
    }, 220)
    return () => window.clearTimeout(handle)
  }, [hidEvents])

  const tracks = statusQuery.data?.tracks ?? []
  const paddedTracks = useMemo(() => {
    const list = [...tracks]
    while (list.length < 4) {
      list.push({
        track: list.length,
        state: 0,
        state_label: 'empty',
        loop_length_frames: 0,
        playhead_frames: 0,
        layer_count: 0,
        level_db: 0,
        muted: false,
        soloed: false,
        reverse: false,
        half_speed: false,
        locked: false,
        one_shot: false,
        one_shot_passes: 1,
        auto_armed: false,
        auto_threshold_db: -36,
        auto_last_level_db: -150,
        auto_peak_db: -150,
        stop_mode: 'hard',
        fade_ms: 250,
        sync_mode: 'free',
        slices: [],
        quantize_division: 'off',
      } as LooperStatus['tracks'][number])
    }
    return list.slice(0, 4)
  }, [tracks])

  const masterLevelDb = statusQuery.data?.master_level_db ?? 0
  const masterMuted = statusQuery.data?.master_muted ?? false
  const activeCount = statusQuery.data?.active_track_count ?? 0
  const bpm = statusQuery.data?.bpm ?? null
  const syncMasterTrack = statusQuery.data?.sync_master_track ?? null

  return (
    <Tile className="maschine-perf__looper-section" data-testid="maschine-looper-section">
      <div className="maschine-perf__looper-header">
        <h4>Looper</h4>
        <Tag size="sm" type={statusQuery.data ? 'green' : 'warm-gray'}>
          {statusQuery.data ? 'Live' : 'Connecting…'}
        </Tag>
        <Tag size="sm" type="cyan">{`Active ${activeCount}/4`}</Tag>
        <Tag size="sm" type={masterMuted ? 'red' : 'gray'}>
          {`Master ${masterLevelDb.toFixed(1)} dB${masterMuted ? ' • MUTED' : ''}`}
        </Tag>
        <Tag size="sm" type="purple">{bpm ? `${bpm.toFixed(1)} BPM` : 'Tempo —'}</Tag>
        <Tag size="sm" type="gray">{syncMasterTrack === null ? 'Sync —' : `Sync T${syncMasterTrack}`}</Tag>
      </div>

      <div className="maschine-perf__looper-grid" data-testid="maschine-looper-grid">
        {paddedTracks.map((track, index) => {
          const length = Math.max(track.loop_length_frames ?? 0, 0)
          const playhead = Math.max(track.playhead_frames ?? 0, 0)
          const fillPct = length > 0 ? Math.min(100, (playhead / length) * 100) : 0
          const isActive = index === ACTIVE_TRACK
          return (
            <div
              key={`looper-track-${index}`}
              className={`maschine-perf__looper-track${isActive ? ' maschine-perf__looper-track--active' : ''}`}
              data-testid={`maschine-looper-track-${index}`}
            >
              <div className="maschine-perf__looper-track-meta">
                <span className="maschine-perf__looper-track-label">{`T${index}`}</span>
                <Tag size="sm" type={trackStateTone(track.state_label)}>{trackStateGlyph(track.state_label)}</Tag>
                <span className="maschine-perf__looper-track-layers">{`L${track.layer_count ?? 0}`}</span>
                {track.locked ? <Tag size="sm" type="warm-gray">LOCK</Tag> : null}
              </div>
              <div
                className="maschine-perf__looper-track-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(fillPct)}
              >
                <div
                  className="maschine-perf__looper-track-bar-fill"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="maschine-perf__looper-transport" data-testid="maschine-looper-transport">
        <TransportButton
          label="Rec"
          intent="danger"
          transportAction="record"
          onClick={() => recordMutation.mutate()}
          disabled={recordMutation.isPending}
        />
        <TransportButton
          label="Play"
          intent="primary"
          transportAction="play"
          onClick={() => playMutation.mutate()}
          disabled={playMutation.isPending}
        />
        <TransportButton
          label="Stop"
          transportAction="stop"
          onClick={() => stopMutation.mutate()}
          disabled={stopMutation.isPending}
        />
        <TransportButton
          label="Restart"
          transportAction="restart"
          onClick={() => restartMutation.mutate()}
          disabled={restartMutation.isPending}
        />
        <TransportButton
          label="Erase"
          intent="danger"
          transportAction="erase"
          onClick={() => eraseMutation.mutate()}
          disabled={eraseMutation.isPending}
        />
      </div>
    </Tile>
  )
}
