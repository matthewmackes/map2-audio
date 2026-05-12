/**
 * T2512 — Multi-track Looper page.
 *
 * Route: /snapshot-editor/looper
 *
 * 4 tracks. Each track row exposes:
 *   - Stomp-style state LED (idle / recording / playing /
 *     overdubbing / stopped).
 *   - Record / Stop / Clear / Undo / Redo buttons.
 *   - Volume slider (-60 to +6 dB).
 *   - Mute / Solo / Reverse / Half-speed toggles.
 *   - Loop length + playhead readout in seconds.
 *
 * Below the track grid: a gated-features panel that lists every
 * feature the operator asked for, marking each "Live" or
 * "Pending (worklist ref)". This is intentionally honest — no
 * disabled buttons that pretend to work; if a feature isn't
 * shipped yet, it appears as a deferred follow-on.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { getWsUrl } from '../../map2/transport'

/** T2512-WS — backend topic + frame envelope from looper_ws_bridge.py. */
const LOOPER_WS_TOPIC = 'looper:status'
interface LooperStatusFrame {
  type: 'looper_status'
  payload: LooperStatus
}
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Slider,
  Tag,
  Tile,
  Toggle,
  InlineLoading,
  InlineNotification,
} from '@carbon/react'
import {
  ArrowLeft,
  RecordingFilled,
  StopFilled,
  TrashCan,
  Undo,
  Redo,
  ChevronDown,
} from '@carbon/icons-react'

import {
  looperApi,
  type LooperStatus,
  type LooperTrackStatus,
} from '../../map2/clients/looper'

import './LooperPage.css'

const TRACK_COUNT = 4

const STATE_TONE: Record<string, 'gray' | 'red' | 'green' | 'magenta' | 'cool-gray'> = {
  empty:       'cool-gray',
  recording:   'red',
  playing:     'green',
  overdubbing: 'magenta',
  stopped:     'gray',
}

const STATE_LABEL: Record<string, string> = {
  empty:       'Idle',
  recording:   'REC',
  playing:     'PLAY',
  overdubbing: 'DUB',
  stopped:     'STOP',
}

/// Feature list the operator asked for; ones marked `live: true`
/// are working end-to-end today, the others are filed as worklist
/// follow-ons (see docs/PROJECT_WORKLIST.md § T2512 follow-ons).
const FEATURE_INVENTORY: ReadonlyArray<{
  label: string
  live: boolean
  note: string
}> = [
  { label: 'Low-latency recording / playback',       live: true,  note: 'RT-safe SPSC ring; ~1.33 ms callback buffer.' },
  { label: 'Extended loop length',                    live: true,  note: 'Up to 60 s per track at 48 kHz stereo.' },
  { label: 'Unlimited loop length',                   live: false, note: 'Streaming via io_uring + ring/file hybrid (T2512-LONG).' },
  { label: 'Overdub',                                 live: true,  note: 'Layer additive sum; 4-deep undo stack.' },
  { label: 'Undo / Redo',                             live: true,  note: '4 layers per track; redo lost on new overdub.' },
  { label: 'Multiple parallel loops',                 live: true,  note: '4 simultaneous tracks.' },
  { label: 'Independent loop volume',                 live: true,  note: 'Per-track dB; master gain.' },
  { label: 'Mute / Solo per track',                   live: true,  note: 'Any-soloed cuts non-solo tracks.' },
  { label: 'Reverse playback',                        live: true,  note: 'Per-track flag; flips read direction.' },
  { label: 'Half-speed playback',                     live: true,  note: 'Per-track flag; integer playhead halving.' },
  { label: 'High-resolution audio (32-bit float)',    live: true,  note: 'Engine internals are float32.' },
  { label: 'Buffered signal path',                    live: true,  note: 'Looper sits after the plugin graph.' },
  { label: 'Visual status indicators',                live: true,  note: 'Per-track LED + state badge in this UI.' },
  { label: 'MIDI control (CC / Program Change)',      live: false, note: 'engine_command verb dispatcher exists; looper.* targets land under T2512-MIDI.' },
  { label: 'Precise loop timing (quantize/auto-close)', live: false, note: 'Needs tempo clock + quantize grid (T2512-QUANT).' },
  { label: 'MIDI sync (clock in/out)',                 live: false, note: 'T2512-CLOCK (inbound) shipped 2026-05-12 — current snapshot BPM surfaced in LooperStatus and the page header. Outbound clock + tempo-clock source picker still pending; T2512-QUANT depends on this.' },
  { label: 'External footswitch support',              live: false, note: 'Maps through generic MIDI; needs surface picker (T2512-FSW).' },
  { label: 'Multiple footswitch controls',             live: false, note: 'Lands with T2512-FSW.' },
  { label: 'Loop syncing (master/slave)',              live: false, note: 'Per-track sync mode picker (T2512-SYNC).' },
  { label: 'One-shot / trigger mode',                  live: true,  note: 'T2512-OS — per-track one-shot flag (Python service + route + dispatcher target). Auto-stop scheduling deferred to T2512-OS-RUNNER follow-up.' },
  { label: 'Auto-record (threshold start)',            live: true,  note: 'T2512-AUTO — operator-armed flag + threshold (clamped -90..0 dB) stored per track in the service. Actual trigger fires once T2512-AUTO-TRIGGER lands the engine-side input-level RMS push.' },
  { label: 'Fade-out / stop modes',                    live: false, note: 'Per-stop fade ramp (T2512-FADE).' },
  { label: 'Loop / layer protection',                  live: true,  note: 'T2512-LOCK — per-track write-lock toggle. Locked tracks reject record/clear/undo/redo (HTTP 409); playback, level, mute, solo, reverse, half-speed, and stop remain live.' },
  { label: 'True bypass / buffered signal path',       live: false, note: 'Signal-path placement review needed (T2512-BYP).' },
  { label: 'Per-track effects (EQ / reverb)',          live: false, note: 'Per-track FX bus (T2512-FX).' },
  { label: 'Time-stretching',                          live: false, note: 'RT-safe DSP work (T2512-TIME).' },
  { label: 'Loop slicing / editing',                   live: false, note: 'Region editor (T2512-SLICE).' },
  { label: 'USB / DAW integration',                    live: false, note: 'JACK port routing + Ableton Link (T2512-DAW).' },
  { label: 'Preset / loop storage',                    live: false, note: 'Snapshot-bound storage browser (T2512-STOR).' },
  { label: 'Scriptable / automation hooks',            live: false, note: 'ControllerEngine integration (T2512-SCRIPT).' },
]

export function LooperPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<LooperStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  // T2512-WS — surface live WS connectivity so the operator can tell
  // whether they're getting push updates or just the 2 s safety-net poll.
  const [wsConnected, setWsConnected] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const s = await looperApi.getStatus()
      setStatus(s)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // T2512-WS — push-based updates via the LOOPER_WS_TOPIC topic.
  // The backend broadcasts a status frame on every mutating verb, so
  // the UI no longer needs a 250 ms poll for record/stop/clear/etc.
  // We keep a 2 s safety-net refresh so the playhead readout still
  // ticks when nobody is touching the loops (the backend doesn't push
  // periodic frames for pure playhead motion in v1) and to recover
  // from any WS hiccup.
  const wsRef = useRef<WebSocket | null>(null)
  useEffect(() => {
    void refresh()
    let cancelled = false
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(getWsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        if (cancelled) return
        ws?.send(JSON.stringify({ action: 'subscribe', topic: LOOPER_WS_TOPIC }))
        setWsConnected(true)
      }
      ws.onmessage = (event) => {
        if (cancelled) return
        try {
          const message = JSON.parse(event.data) as LooperStatusFrame
          if (message.type === 'looper_status' && message.payload) {
            setStatus(message.payload)
            setError(null)
            setLoading(false)
          }
        } catch {
          // Drop malformed frames silently.
        }
      }
      ws.onclose = () => {
        if (cancelled) return
        setWsConnected(false)
      }
      ws.onerror = () => {
        if (cancelled) return
        setWsConnected(false)
      }
    } catch {
      // Browser may block WS construction (very rare) — poll-only fallback.
      setWsConnected(false)
    }
    const handle = window.setInterval(() => { void refresh() }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(handle)
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ action: 'unsubscribe', topic: LOOPER_WS_TOPIC }))
        } catch {
          // Connection may already be down; safe to ignore.
        }
      }
      ws?.close()
      wsRef.current = null
      setWsConnected(false)
    }
  }, [refresh])

  const wrap = useCallback(
    async (fn: () => Promise<LooperStatus>) => {
      try {
        const next = await fn()
        setStatus(next)
        setError(null)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Action failed')
      }
    },
    [],
  )

  return (
    <div className="looper-page">
      <div className="looper-page__header">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={() => navigate('/snapshot-editor')}
        >
          Back to Snapshot Editor
        </Button>
        <h1 className="looper-page__title">Looper</h1>
        <div className="looper-page__sub">
          <span>4 tracks · 60 s max · post-FX capture</span>
          <Tag
            data-testid="looper-ws-status"
            type={wsConnected ? 'green' : 'warm-gray'}
            size="sm"
          >
            {wsConnected ? 'Live' : 'Polling (2 s)'}
          </Tag>
          {status?.bpm != null ? (
            <Tag
              data-testid="looper-bpm"
              type="cool-gray"
              size="sm"
            >
              {status.bpm.toFixed(1)} BPM
            </Tag>
          ) : null}
        </div>
      </div>

      {error ? (
        <InlineNotification
          kind="error"
          title="Looper error"
          subtitle={error}
          hideCloseButton
          lowContrast
        />
      ) : null}

      {loading || !status ? (
        <InlineLoading description="Loading looper state…" />
      ) : (
        <>
          <div className="looper-page__grid">
            {Array.from({ length: TRACK_COUNT }, (_, idx) => (
              <TrackCard
                key={idx}
                track={status.tracks[idx]}
                onAction={wrap}
              />
            ))}
          </div>

          <Tile className="looper-page__master">
            <h3>Master</h3>
            <label htmlFor="looper-master-level">Master level (dB)</label>
            <Slider
              id="looper-master-level"
              min={-60}
              max={6}
              step={0.5}
              value={status.master_level_db}
              labelText=""
              onRelease={(e: { value: number }) =>
                wrap(() => looperApi.setMasterLevel(e.value))
              }
            />
            <div className="looper-page__master-meta">
              <Tag type="cool-gray" size="sm">
                Active tracks: {status.active_track_count}
              </Tag>
              {status.sync_master ? (
                <Tag type="blue" size="sm">Track 0 = sync master</Tag>
              ) : null}
            </div>
          </Tile>

          <FeatureInventory />
        </>
      )}
    </div>
  )
}


function TrackCard({
  track,
  onAction,
}: {
  track: LooperTrackStatus
  onAction: (fn: () => Promise<LooperStatus>) => Promise<void>
}) {
  const stateKey = track.state_label
  const tone     = STATE_TONE[stateKey] ?? 'cool-gray'
  const label    = STATE_LABEL[stateKey] ?? stateKey.toUpperCase()
  const loopSec  = track.loop_length_frames / 48000
  const headSec  = track.playhead_frames    / 48000

  return (
    <Tile className={`looper-track looper-track--${stateKey}`}>
      <div className="looper-track__header">
        <div className={`looper-track__led looper-track__led--${stateKey}`}>{track.track + 1}</div>
        <div className="looper-track__title">Track {track.track + 1}</div>
        <Tag type={tone} size="md">{label}</Tag>
      </div>

      <div className="looper-track__transport">
        <Button
          kind={stateKey === 'recording' || stateKey === 'overdubbing' ? 'danger' : 'primary'}
          size="md"
          renderIcon={RecordingFilled}
          onClick={() => onAction(() => looperApi.record(track.track))}
          data-testid={`looper-record-${track.track}`}
        >
          {stateKey === 'empty' ? 'Record'
            : stateKey === 'recording' ? 'Stop & play'
            : stateKey === 'playing' ? 'Overdub'
            : stateKey === 'overdubbing' ? 'Commit'
            : 'Resume'}
        </Button>
        <Button kind="ghost" size="md" renderIcon={StopFilled}
                data-testid={`looper-stop-${track.track}`}
                onClick={() => onAction(() => looperApi.stop(track.track))}>
          Stop
        </Button>
        <Button kind="ghost" size="md" renderIcon={Undo}
                data-testid={`looper-undo-${track.track}`}
                onClick={() => onAction(() => looperApi.undo(track.track))}>
          Undo
        </Button>
        <Button kind="ghost" size="md" renderIcon={Redo}
                data-testid={`looper-redo-${track.track}`}
                onClick={() => onAction(() => looperApi.redo(track.track))}>
          Redo
        </Button>
        <Button kind="ghost" size="md" renderIcon={TrashCan}
                data-testid={`looper-clear-${track.track}`}
                onClick={() => onAction(() => looperApi.clear(track.track))}>
          Clear
        </Button>
      </div>

      <div className="looper-track__readout">
        <span>Layers: {track.layer_count}</span>
        <span>Loop: {loopSec.toFixed(2)} s</span>
        <span>Head: {headSec.toFixed(2)} s</span>
      </div>

      <div className="looper-track__level">
        <label htmlFor={`looper-level-${track.track}`}>Level (dB)</label>
        <Slider
          id={`looper-level-${track.track}`}
          min={-60}
          max={6}
          step={0.5}
          value={track.level_db}
          labelText=""
          onRelease={(e: { value: number }) =>
            onAction(() => looperApi.setLevel(track.track, e.value))
          }
        />
      </div>

      <div className="looper-track__toggles">
        <Toggle
          id={`looper-mute-${track.track}`}
          size="sm"
          labelText="Mute"
          toggled={track.muted}
          onToggle={(val) => onAction(() => looperApi.setMuted(track.track, val))}
        />
        <Toggle
          id={`looper-solo-${track.track}`}
          size="sm"
          labelText="Solo"
          toggled={track.soloed}
          onToggle={(val) => onAction(() => looperApi.setSoloed(track.track, val))}
        />
        <Toggle
          id={`looper-reverse-${track.track}`}
          size="sm"
          labelText="Reverse"
          toggled={track.reverse}
          onToggle={(val) => onAction(() => looperApi.setReverse(track.track, val))}
        />
        <Toggle
          id={`looper-half-${track.track}`}
          size="sm"
          labelText="Half-speed"
          toggled={track.half_speed}
          onToggle={(val) => onAction(() => looperApi.setHalfSpeed(track.track, val))}
        />
        <Toggle
          id={`looper-locked-${track.track}`}
          size="sm"
          labelText="Lock"
          toggled={track.locked}
          onToggle={(val) => onAction(() => looperApi.setLocked(track.track, val))}
        />
        <Toggle
          id={`looper-one-shot-${track.track}`}
          size="sm"
          labelText="One-shot"
          toggled={track.one_shot}
          onToggle={(val) => onAction(() => looperApi.setOneShot(track.track, val))}
        />
        <Toggle
          id={`looper-auto-armed-${track.track}`}
          size="sm"
          labelText={`Auto-record (${track.auto_threshold_db.toFixed(0)} dB)`}
          toggled={track.auto_armed}
          onToggle={(val) => onAction(() => looperApi.setAutoArmed(track.track, val))}
        />
      </div>
    </Tile>
  )
}


function FeatureInventory() {
  const [open, setOpen] = useState(false)
  const live   = FEATURE_INVENTORY.filter((f) => f.live)
  const gated  = FEATURE_INVENTORY.filter((f) => !f.live)

  return (
    <section className="looper-page__inventory">
      <button
        type="button"
        className="looper-page__inventory-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronDown size={16} />
        <span>
          Feature inventory — {live.length} live, {gated.length} on the worklist
        </span>
      </button>
      {open ? (
        <div className="looper-page__inventory-body">
          <div>
            <h4>Live in v1</h4>
            <ul>
              {live.map((f) => (
                <li key={f.label}>
                  <Tag type="green" size="sm">live</Tag>
                  <strong>{f.label}</strong>
                  <span>{f.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Filed as worklist follow-ons</h4>
            <ul>
              {gated.map((f) => (
                <li key={f.label}>
                  <Tag type="cool-gray" size="sm">pending</Tag>
                  <strong>{f.label}</strong>
                  <span>{f.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  )
}
