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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  Modal,
  NumberInput,
  Select,
  SelectItem,
  Slider,
  Tag,
  TextInput,
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
  type LooperQuantizeDivision,
  type LooperStatus,
  type LooperStopMode,
  type LooperSyncMode,
  type LooperTrackStatus,
} from '../../map2/clients/looper'

import {
  DEFAULT_LOOPER_KEYBINDINGS,
  LOOPER_ACTIONS,
  LOOPER_ACTION_LABEL,
  type LooperAction,
  type LooperKeybindings,
  type KeyBinding,
  bindingFromEvent,
  bindingLabel,
  findDuplicateBindings,
  loadLooperKeybindings,
  resolveActionForEvent,
  saveLooperKeybindings,
} from './looperKeybindings'

import {
  SPARKLINE_CAPACITY,
  type MetricsHistory,
  appendMetricsDelta,
  sparklinePoints,
  trailingSum,
} from './looperMetricsSparkline'

import './LooperPage.css'

const TRACK_COUNT = 4

/**
 * T2512-AUTO-PEAK-UI — format a per-track input-level dB.
 *
 * Service sentinel is -150 dB (means "no sample yet since last
 * arm/reset"). Render that as an em-dash so the indicator doesn't
 * imply silence.
 */
function formatPeakDb(db: number | undefined): string {
  if (db == null || db <= -149.9) {
    return '—'
  }
  return `${db.toFixed(1)} dB`
}

/**
 * T2512-AUTO-PEAK-UI — true when peak has crossed the threshold,
 * meaning auto-record *would* have triggered if armed. Operators use
 * this to know whether to widen the threshold.
 */
function isPeakAboveThreshold(track: LooperTrackStatus): boolean {
  if (track.auto_peak_db == null || track.auto_peak_db <= -149.9) {
    return false
  }
  return track.auto_peak_db > track.auto_threshold_db
}

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
  { label: 'MIDI control (CC / Program Change)',      live: true,  note: 'T2512-MIDI + LOCK-MIDI + DISPATCH-V2 — 18 dispatcher patterns covering record/stop/clear/undo/redo + level/mute/solo/reverse/half-speed + locked/one_shot/auto_armed + stop_mode/fade_ms/sync_mode/quantize_division + master.level.' },
  { label: 'Precise loop timing (quantize/auto-close)', live: true,  note: 'T2512-QUANT (math helper) + T2512-QUANT-WIRE — per-track quantize_division flag + LooperService.quantize_record_length() snapping decision helper reads snapshot tempo + clamps. Engine-side application of the snapped length pending under T2512-QUANT-ENGINE.' },
  { label: 'MIDI sync (clock in/out)',                 live: false, note: 'T2512-CLOCK (inbound) shipped — current snapshot BPM surfaced in LooperStatus and the page header. Outbound clock + tempo-clock source picker still pending.' },
  { label: 'External footswitch support',              live: true,  note: 'T2512-FSW — generic MIDI-learn catalog exposes 69 verbs across all looper state. T2512-FSW-MAC ships a ready MeloAudio Commander profile. T2512-SCRIPT/PACK-V2 provide the JS handler module for custom packs.' },
  { label: 'Multiple footswitch controls',             live: true,  note: 'Covered by the generic-learn catalog (T2512-FSW): any number of CC/PC bindings, no surface limit.' },
  { label: 'Loop syncing (master/slave)',              live: true,  note: 'T2512-SYNC — per-track sync_mode (free/master/slave) with at-most-one-master invariant. Engine loop-length locking deferred to T2512-SYNC-LOCK (RT-critical).' },
  { label: 'One-shot / trigger mode',                  live: true,  note: 'T2512-OS + T2512-OS-RUNNER — per-track one-shot flag + async runner that fires stop_track() after one playhead pass. Cancelled on any state change.' },
  { label: 'Auto-record (threshold start)',            live: true,  note: 'T2512-AUTO — operator-armed flag + threshold (clamped -90..0 dB). Actual trigger fires once T2512-AUTO-TRIGGER lands the engine-side input-level RMS push.' },
  { label: 'Fade-out / stop modes',                    live: true,  note: 'T2512-FADE — per-track stop_mode (hard/fade) + fade_ms (clamped 0..5000) state surface + UI. Actual gain-ramp on stop deferred to T2512-FADE-RAMP (RT-critical).' },
  { label: 'Loop / layer protection',                  live: true,  note: 'T2512-LOCK — per-track write-lock toggle. Locked tracks reject record/clear/undo/redo (HTTP 409); playback, level, mute, solo, reverse, half-speed, and stop remain live.' },
  { label: 'True bypass / buffered signal path',       live: false, note: 'Signal-path placement review needed (T2512-BYP).' },
  { label: 'Per-track effects (EQ / reverb)',          live: false, note: 'Per-track FX bus (T2512-FX).' },
  { label: 'Time-stretching',                          live: false, note: 'RT-safe DSP work (T2512-TIME).' },
  { label: 'Loop slicing / editing',                   live: true,  note: 'T2512-SLICE — non-destructive slice metadata model (start_frame/end_frame/label, no overlaps, 64/track cap). Add/clear routes shipped; region-editor UI pending under T2512-SLICE-UI.' },
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
  // T2512-RESET — confirmation modal state.
  const [resetModalOpen, setResetModalOpen] = useState(false)
  // T2512-KEYBOARD — active track for keyboard transport shortcuts.
  // Operators press 1..4 to retarget; Space records, Shift+Space stops,
  // U/Y undo/redo, M toggles mute, R toggles reverse. ? toggles the
  // help overlay. Defaults to 0; persisted to localStorage so an
  // operator's preferred starting track survives a reload.
  const [activeKbTrack, setActiveKbTrack] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('map2.looper.activeKbTrack')
      if (raw != null) {
        const n = parseInt(raw, 10)
        if (Number.isFinite(n) && n >= 0 && n < TRACK_COUNT) return n
      }
    } catch {
      // Quota / private mode — fall through to default.
    }
    return 0
  })
  const [kbHelpOpen, setKbHelpOpen] = useState(false)
  // T2512-KEYBOARD-CUSTOMIZE — operator-remappable shortcuts.
  // Bindings live in localStorage under ``map2.looper.keybindings``;
  // a missing/corrupt entry falls back to DEFAULT_LOOPER_KEYBINDINGS.
  const [keybindings, setKeybindings] = useState<LooperKeybindings>(() =>
    loadLooperKeybindings(),
  )
  const [customizeOpen, setCustomizeOpen] = useState(false)
  // Action currently capturing a new binding (null = not capturing).
  const [capturingAction, setCapturingAction] = useState<LooperAction | null>(
    null,
  )

  // T2512-IMPORT-UI — file input ref + handler. The file picker is
  // a hidden <input type="file"> triggered by an Import button so we
  // don't need to ship a custom modal — operators pick from the OS
  // file dialog the same way they would for a snapshot save.
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const handleImportState = useCallback(
    async (file: File): Promise<void> => {
      try {
        // Use FileReader rather than File.text() for broader browser
        // compatibility (and so jsdom under jest can exercise this
        // path — its File.text() implementation is patchy).
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result
            if (typeof result === 'string') {
              resolve(result)
            } else {
              reject(new Error('FileReader returned non-string result'))
            }
          }
          reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
          reader.readAsText(file)
        })
        const parsed = JSON.parse(text) as unknown
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !Array.isArray((parsed as { tracks?: unknown }).tracks)
        ) {
          throw new Error(
            'Invalid looper state payload — expected an object with a tracks array',
          )
        }
        // T2512-PRESET-EXPORT-WITH-LOCAL — if the file is an
        // enveloped export (carries ``__preset_cache``), seed the
        // localStorage cache from it after applying the live state.
        // Strip the envelope fields before applyState so the backend
        // sees only its schema. Backward-compat: plain state files
        // (no envelope) just skip the cache write.
        const obj = parsed as Record<string, unknown>
        const cacheField = obj.__preset_cache
        const stateOnly: Record<string, unknown> = { ...obj }
        delete stateOnly.__preset_cache
        delete stateOnly.__schema
        await looperApi.applyState(
          stateOnly as unknown as Parameters<typeof looperApi.applyState>[0],
        )
        if (
          cacheField !== undefined &&
          typeof cacheField === 'object' &&
          cacheField !== null &&
          !Array.isArray(cacheField)
        ) {
          // Quick shape-check before writing; same gate as the
          // dedicated cache importer.
          const entries = Object.entries(
            cacheField as Record<string, unknown>,
          )
          const allValid = entries.every(([, v]) =>
            typeof v === 'object' &&
            v !== null &&
            Array.isArray((v as { tracks?: unknown }).tracks),
          )
          if (allValid) {
            try {
              localStorage.setItem(
                'map2.looper.presetCache',
                JSON.stringify(cacheField),
              )
            } catch {
              // Best-effort — quota / private mode silently swallowed.
            }
          }
        }
        setError(null)
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : 'Failed to import state',
        )
      }
    },
    [],
  )

  // T2512-EXPORT-UI — fetch the current LooperStatePayload, format
  // as pretty JSON, and trigger a browser download. No mutation;
  // safe to click any time. Filename includes ISO date so an
  // operator with multiple backups can sort by name.
  //
  // T2512-PRESET-EXPORT-WITH-LOCAL — envelope the state payload with
  // an optional ``__preset_cache`` mirror of the localStorage preset
  // cache. Imports remain backward-compatible: a plain
  // LooperStatePayload (no envelope) still applies; an enveloped
  // file additionally seeds the cache. The envelope's ``__schema``
  // tag identifies the file format so future expansions (snapshot
  // links, slice catalogs) can land additively.
  const handleExportState = useCallback(async () => {
    try {
      const payload = await looperApi.getState()
      // Inline cache read — keep the file independent of PresetPanel
      // state so the export still works while the panel is closed
      // (it isn't in this layout, but the test mode toggles it).
      let cache: Record<string, unknown> = {}
      try {
        const raw = localStorage.getItem('map2.looper.presetCache')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed === 'object' && parsed !== null) {
            cache = parsed as Record<string, unknown>
          }
        }
      } catch {
        // Quota / parse / private-mode — fall through with empty cache.
      }
      const envelope: Record<string, unknown> = { ...payload }
      if (Object.keys(cache).length > 0) {
        envelope.__schema = 'map2.looper.state+cache@1'
        envelope.__preset_cache = cache
      }
      const json = JSON.stringify(envelope, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url
      a.download = `looper-state-${ts}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to export state')
    }
  }, [])

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

  // T2512-KEYBOARD — persist the operator's chosen active track.
  useEffect(() => {
    try {
      localStorage.setItem(
        'map2.looper.activeKbTrack',
        String(activeKbTrack),
      )
    } catch {
      // Best-effort; quota / private-mode silently swallowed.
    }
  }, [activeKbTrack])

  // T2512-KEYBOARD-CUSTOMIZE — persist remapped bindings whenever they
  // change. Quota errors are swallowed by the storage helper.
  useEffect(() => {
    saveLooperKeybindings(keybindings)
  }, [keybindings])

  // T2512-KEYBOARD — global keyboard listener. We attach to window so
  // an operator can drive the looper from anywhere on the page (not
  // just when a button has focus). Shortcuts intentionally ignore
  // when the event target is an editable field (input / textarea /
  // contenteditable) so typing into a preset name or slice label
  // doesn't accidentally fire a stomp verb.
  //
  // T2512-KEYBOARD-CUSTOMIZE — every shortcut now resolves through
  // the live ``keybindings`` map (with localStorage-backed
  // persistence). The default map matches the original hardcoded
  // layout; remapping any action takes effect on the next keypress.
  useEffect(() => {
    function isEditableTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      if (el.isContentEditable) return true
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    function handler(ev: KeyboardEvent) {
      // Capture mode: the customizer is recording the next key press
      // for a specific action. Swallow the event and forward it to
      // the capture sink instead of firing transport verbs.
      if (capturingAction != null) {
        const captured = bindingFromEvent(ev)
        if (captured == null) return // pure modifier — wait
        ev.preventDefault()
        setKeybindings((prev) => ({ ...prev, [capturingAction]: captured }))
        setCapturingAction(null)
        return
      }
      if (isEditableTarget(ev.target)) return
      const action = resolveActionForEvent(keybindings, ev)
      if (action == null) return
      // Selectors and the help-overlay action don't depend on the
      // current status; fire them eagerly.
      if (action === 'selectTrack1' || action === 'selectTrack2' ||
          action === 'selectTrack3' || action === 'selectTrack4') {
        const idx = parseInt(action.slice('selectTrack'.length), 10) - 1
        if (idx >= 0 && idx < TRACK_COUNT) {
          ev.preventDefault()
          setActiveKbTrack(idx)
        }
        return
      }
      if (action === 'helpToggle') {
        ev.preventDefault()
        setKbHelpOpen((v) => !v)
        return
      }
      if (status == null) return
      const t = activeKbTrack
      const track = status.tracks[t]
      if (!track) return
      ev.preventDefault()
      switch (action) {
        case 'record':
          void wrap(() => looperApi.record(t))
          break
        case 'stop':
          void wrap(() => looperApi.stop(t))
          break
        case 'undo':
          void wrap(() => looperApi.undo(t))
          break
        case 'redo':
          void wrap(() => looperApi.redo(t))
          break
        case 'muteToggle':
          void wrap(() => looperApi.setMuted(t, !track.muted))
          break
        case 'reverseToggle':
          void wrap(() => looperApi.setReverse(t, !track.reverse))
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeKbTrack, capturingAction, keybindings, status, wrap])

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
          {/* T2512-KEYBOARD — active-track chip. Click cycles 0→1→2→3→0.
              Press 1..4 for direct selection. The current track is
              what every transport shortcut acts on. */}
          <Tag
            type="blue"
            size="sm"
            data-testid="looper-kb-active-track"
            title="Active track for keyboard shortcuts (press 1..4 to switch, ? for help)"
            onClick={() =>
              setActiveKbTrack((t) => (t + 1) % TRACK_COUNT)
            }
            style={{ cursor: 'pointer' }}
          >
            ⌨ track {activeKbTrack + 1}
          </Tag>
          <Button
            kind="ghost"
            size="sm"
            data-testid="looper-kb-help-button"
            onClick={() => setKbHelpOpen(true)}
          >
            ?
          </Button>
          {/* T2512-FOOTER-STATS — compact metrics chip. Shows total
              verb count without expanding the foldable MetricsPanel.
              Reuses status.metrics so the value is push-synced via
              WS — no extra HTTP round-trip. Hidden until at least
              one verb has fired so the page header stays compact
              for a fresh backend. */}
          {(() => {
            const metrics = status?.metrics ?? {}
            const total = Object.values(metrics).reduce(
              (sum, n) => sum + n,
              0,
            )
            if (total === 0) return null
            return (
              <Tag
                data-testid="looper-footer-stats"
                type="cool-gray"
                size="sm"
                title={`${Object.keys(metrics).length} verbs tracked`}
              >
                {total} call{total === 1 ? '' : 's'}
              </Tag>
            )
          })()}
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
              {/* T2512-MASTER-MUTE-UI — operator-visible Tag echoing
                  the muted state so the panic button's effect is
                  obvious even when the dial hasn't moved. */}
              {status.master_muted ? (
                <Tag
                  type="red"
                  size="sm"
                  data-testid="looper-master-mute-tag"
                >
                  Master muted
                </Tag>
              ) : null}
              {status.sync_master && status.sync_master_track != null ? (
                <Tag
                  type="blue"
                  size="sm"
                  data-testid="looper-master-sync-tag"
                >
                  Track {status.sync_master_track + 1} = sync master
                </Tag>
              ) : null}
              <Button
                kind="tertiary"
                size="sm"
                data-testid="looper-export-state-button"
                onClick={handleExportState}
              >
                Export state (JSON)
              </Button>
              <Button
                kind="tertiary"
                size="sm"
                data-testid="looper-import-state-button"
                onClick={() => importInputRef.current?.click()}
              >
                Import state…
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                data-testid="looper-import-state-input"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    void handleImportState(file)
                  }
                  // Reset so picking the same file twice in a row still fires onChange.
                  e.target.value = ''
                }}
              />
              {/* T2512-MASTER-MUTE-UI — panic mute. Same danger-tertiary
                  styling as Reset so operators read it as a high-impact
                  action; label flips so the button doubles as a release
                  trigger. No modal: panic-mute MUST be one click. */}
              <Button
                kind={status.master_muted ? 'primary' : 'danger--tertiary'}
                size="sm"
                data-testid="looper-master-mute-button"
                onClick={() =>
                  wrap(() => looperApi.setMasterMuted(!status.master_muted))
                }
              >
                {status.master_muted ? 'Unmute master' : 'Panic mute'}
              </Button>
              {/* T2512-RESET-PEAK-ALL — clears the auto-record peak
                  indicator across all 4 tracks in one click. Fans out
                  to the per-track ``/auto-record/reset-peak`` route
                  sequentially; the service-side mutex serializes
                  anyway. No modal: the only state cleared is the
                  recent-peak tag — no recall-relevant data lost. */}
              <Button
                kind="ghost"
                size="sm"
                data-testid="looper-reset-all-peaks-button"
                onClick={() =>
                  wrap(async () => {
                    let last: LooperStatus | null = null
                    for (let t = 0; t < TRACK_COUNT; t++) {
                      last = await looperApi.resetAutoPeak(t)
                    }
                    return last ?? (await looperApi.getStatus())
                  })
                }
              >
                Reset all peaks
              </Button>
              <Button
                kind="danger--tertiary"
                size="sm"
                data-testid="looper-reset-state-button"
                onClick={() => setResetModalOpen(true)}
              >
                Reset state
              </Button>
            </div>
          </Tile>

          {/* T2512-RESET — confirmation modal. Pretty rare to need
              this; the explicit modal protects against an accidental
              click on the danger-tinted button. */}
          <Modal
            data-testid="looper-reset-modal"
            open={resetModalOpen}
            modalHeading="Reset all looper policy state?"
            primaryButtonText="Reset state"
            secondaryButtonText="Cancel"
            danger
            onRequestClose={() => setResetModalOpen(false)}
            onRequestSubmit={() => {
              setResetModalOpen(false)
              wrap(() => looperApi.resetState())
            }}
          >
            <p>
              This clears every per-track flag (lock, one-shot,
              auto-record, stop mode, fade, sync, quantize, slices)
              and resets the master level to 0 dB.
            </p>
            <p>
              Captured loop content is <strong>not</strong> touched —
              use the per-track <em>Clear</em> button to discard a
              loop.
            </p>
          </Modal>

          {/* T2512-KEYBOARD — shortcuts help modal. Rows render live
              from the customizable binding map (T2512-KEYBOARD-CUSTOMIZE)
              so a remapped binding shows up here immediately. */}
          <Modal
            data-testid="looper-kb-help-modal"
            open={kbHelpOpen}
            modalHeading="Keyboard shortcuts"
            passiveModal
            onRequestClose={() => setKbHelpOpen(false)}
          >
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 1rem' }}>
              {LOOPER_ACTIONS.map((action) => (
                <li
                  key={action}
                  style={{ display: 'contents' }}
                  data-testid={`looper-kb-help-row-${action}`}
                >
                  <kbd>{bindingLabel(keybindings[action])}</kbd>
                  <span>{LOOPER_ACTION_LABEL[action]}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: '1rem', color: 'var(--cds-text-secondary)' }}>
              Shortcuts are suppressed while editing a text field (preset name, slice label, etc.).
            </p>
            <Button
              data-testid="looper-kb-customize-open"
              kind="tertiary"
              size="sm"
              onClick={() => {
                setKbHelpOpen(false)
                setCustomizeOpen(true)
              }}
              style={{ marginTop: '1rem' }}
            >
              Customize shortcuts…
            </Button>
          </Modal>

          {/* T2512-KEYBOARD-CUSTOMIZE — rebind any action to any key.
              Click "Record" beside an action then press the key combo
              you want; the page absorbs the keystroke instead of
              firing the original shortcut. Reset returns the entire
              map to DEFAULT_LOOPER_KEYBINDINGS. */}
          <LooperKeybindingsModal
            open={customizeOpen}
            bindings={keybindings}
            capturingAction={capturingAction}
            onCaptureStart={setCapturingAction}
            onClear={(action) =>
              setKeybindings((prev) => ({
                ...prev,
                [action]: {} as KeyBinding,
              }))
            }
            onResetAll={() => {
              setKeybindings({ ...DEFAULT_LOOPER_KEYBINDINGS })
              setCapturingAction(null)
            }}
            onClose={() => {
              setCustomizeOpen(false)
              setCapturingAction(null)
            }}
          />

          <PresetPanel
            presetNames={status.preset_names ?? []}
            onAction={wrap}
            setError={setError}
          />
          <MetricsPanel
            metrics={status.metrics ?? {}}
            onAction={wrap}
          />
          <FeatureInventory />
          <ActivityPanel
            statusRecentActivity={status.recent_activity}
            wsConnected={wsConnected}
          />
        </>
      )}
    </div>
  )
}

/**
 * T2512-PRESET-UI — named in-memory state presets.
 *
 * Backend exposes 5 routes (`GET/POST/DELETE /presets`,
 * `POST /presets/{name}/apply`, `DELETE /presets/{name}`) with a
 * 32-entry cap. The list is volatile (cleared on backend restart);
 * persistent presets remain the snapshot service's job, which is
 * tracked separately under T2512-SNAP.
 *
 * UX: a Save-current input + Save button along the top, then one
 * row per saved preset with Apply / Delete buttons. A Clear-all
 * button appears once any presets exist.
 */
/**
 * T2512-PRESET-PERSIST — durable preset cache.
 *
 * The backend's named-preset store is volatile (cleared on backend
 * restart). This module shadows every save into localStorage so an
 * operator's named takes survive a service restart: on page load we
 * compare local cache vs backend ``preset_names`` and offer a
 * one-click restore for any names the backend forgot.
 *
 * Cache shape: ``Record<name, LooperStatePayload>``. The payload is
 * the exact same shape ``applyState`` accepts, so restore is a
 * straight apply-then-save chain. Capped at 32 entries (same as
 * the backend) — oldest write evicted when over.
 */
const PRESET_CACHE_KEY = 'map2.looper.presetCache'
const PRESET_CACHE_MAX = 32

type PresetCache = Record<string, import('../../map2/clients/looper').LooperStatePayload>

function readPresetCache(): PresetCache {
  try {
    const raw = localStorage.getItem(PRESET_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as PresetCache
  } catch {
    return {}
  }
}

function writePresetCache(cache: PresetCache): void {
  try {
    // Cap at PRESET_CACHE_MAX by dropping the oldest insertion-order
    // entry first (JS object property order is insertion order).
    const entries = Object.entries(cache)
    if (entries.length > PRESET_CACHE_MAX) {
      const trimmed = entries.slice(entries.length - PRESET_CACHE_MAX)
      cache = Object.fromEntries(trimmed) as PresetCache
    }
    localStorage.setItem(PRESET_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Quota exhausted / private mode / etc. — the cache is best-effort,
    // the backend is the source of truth.
  }
}

function PresetPanel({
  presetNames,
  onAction,
  setError,
}: {
  presetNames: ReadonlyArray<string>
  onAction: (fn: () => Promise<LooperStatus>) => Promise<void>
  setError: (msg: string | null) => void
}) {
  const [draftName, setDraftName] = useState('')
  // Re-read the cache on every render of a name list that might have
  // diverged. Cheap: localStorage hits a synchronous map.
  const [cacheTick, setCacheTick] = useState(0)
  const cache = useMemo(() => readPresetCache(), [cacheTick])
  const sortedNames = useMemo(() => [...presetNames], [presetNames])
  // Names cached locally but missing on the backend — restore
  // candidates. Backend cleared its volatile store; ours survived.
  const missingFromBackend = useMemo(() => {
    const backendSet = new Set(sortedNames)
    return Object.keys(cache)
      .filter((n) => !backendSet.has(n))
      .sort()
  }, [cache, sortedNames])

  const isFull = sortedNames.length >= 32
  const trimmed = draftName.trim()
  const isDuplicate = trimmed !== '' && sortedNames.includes(trimmed)
  const canSave = trimmed !== '' && (!isFull || isDuplicate)

  const handleSave = useCallback(async () => {
    if (!canSave) return
    const name = trimmed
    setError(null)
    await onAction(() => looperApi.savePreset(name))
    // T2512-PRESET-PERSIST — shadow the save into localStorage. We
    // pull the current state right after the server save so the cache
    // mirrors whatever the backend just stored. If getState() fails
    // (server hiccup), the server-side save is still committed; the
    // cache simply stays stale.
    try {
      const payload = await looperApi.getState()
      const next = { ...readPresetCache(), [name]: payload }
      writePresetCache(next)
      setCacheTick((v) => v + 1)
    } catch {
      // Best-effort cache shadow — log nothing to the UI.
    }
    setDraftName('')
  }, [canSave, onAction, setError, trimmed])

  const handleDelete = useCallback(
    async (name: string) => {
      setError(null)
      await onAction(() => looperApi.deletePreset(name))
      const next = { ...readPresetCache() }
      delete next[name]
      writePresetCache(next)
      setCacheTick((v) => v + 1)
    },
    [onAction, setError],
  )

  const handleClearAll = useCallback(async () => {
    setError(null)
    await onAction(() => looperApi.clearPresets())
    writePresetCache({})
    setCacheTick((v) => v + 1)
  }, [onAction, setError])

  const handleRestoreFromCache = useCallback(
    async (name: string) => {
      const payload = readPresetCache()[name]
      if (!payload) return
      setError(null)
      // Two-step: applyState to seed the live state, then savePreset
      // to anchor the name. Both calls are caught by wrap()'s error
      // path; failures surface through the existing InlineNotification.
      await onAction(async () => {
        await looperApi.applyState(payload)
        return looperApi.savePreset(name)
      })
      setCacheTick((v) => v + 1)
    },
    [onAction, setError],
  )

  // T2512-PRESET-PERSIST-EXPORT — hidden file input + handler for
  // importing a cache JSON. Replaces the cache (does NOT merge) so
  // an operator can pin a known-good set without leaving stale local
  // entries behind. Validates that the payload is an object of
  // ``name → LooperStatePayload``-shaped values; bad shapes are
  // rejected via setError without touching the cache.
  const cacheImportInputRef = useRef<HTMLInputElement | null>(null)
  const handleImportCache = useCallback(
    async (file: File): Promise<void> => {
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result
            if (typeof result === 'string') resolve(result)
            else reject(new Error('FileReader returned non-string result'))
          }
          reader.onerror = () =>
            reject(reader.error ?? new Error('Read failed'))
          reader.readAsText(file)
        })
        const parsed = JSON.parse(text) as unknown
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error(
            'Invalid cache payload — expected an object keyed by preset name',
          )
        }
        // Shape-check each value: must have schema_version + tracks
        // array + master_level_db. Reject the whole import if any
        // entry fails — a partial import is hard to reason about.
        const entries = Object.entries(parsed as Record<string, unknown>)
        for (const [name, val] of entries) {
          if (
            typeof val !== 'object' ||
            val === null ||
            !Array.isArray((val as { tracks?: unknown }).tracks)
          ) {
            throw new Error(
              `Invalid cache entry for "${name}" — missing tracks array`,
            )
          }
        }
        writePresetCache(parsed as PresetCache)
        setCacheTick((v) => v + 1)
        setError(null)
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : 'Failed to import preset cache',
        )
      }
    },
    [setError],
  )

  return (
    <Tile
      className="looper-page__presets"
      data-testid="looper-preset-panel"
    >
      <div className="looper-page__presets-header">
        <h3 style={{ margin: 0 }}>Presets</h3>
        <Tag
          type="cool-gray"
          size="sm"
          data-testid="looper-preset-count-tag"
        >
          {sortedNames.length} / 32 saved
        </Tag>
        {Object.keys(cache).length > 0 ? (
          <Tag
            type="purple"
            size="sm"
            data-testid="looper-preset-cache-tag"
            title="Number of presets currently in the durable localStorage cache"
          >
            {Object.keys(cache).length} cached
          </Tag>
        ) : null}
        {/* T2512-PRESET-PERSIST-EXPORT — operator-facing export of
            the localStorage preset cache so an operator can transport
            their named takes between machines or browser profiles.
            Import accepts the same JSON shape and replaces the local
            cache (intentional: an import wipes any local-only entries
            the file doesn't have so the operator can pin a known
            good set). The import does NOT touch the live backend
            — operator hits Restore on each row to re-anchor names. */}
        <Button
          kind="ghost"
          size="sm"
          data-testid="looper-preset-cache-export"
          disabled={Object.keys(cache).length === 0}
          onClick={() => {
            const json = JSON.stringify(cache, null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            const ts = new Date().toISOString().replace(/[:.]/g, '-')
            a.href = url
            a.download = `looper-preset-cache-${ts}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }}
        >
          Export cache
        </Button>
        <Button
          kind="ghost"
          size="sm"
          data-testid="looper-preset-cache-import"
          onClick={() => cacheImportInputRef.current?.click()}
        >
          Import cache…
        </Button>
        <input
          ref={cacheImportInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          data-testid="looper-preset-cache-import-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportCache(file)
            e.target.value = ''
          }}
        />
      </div>
      <p className="looper-page__presets-help">
        Named in-memory snapshots of every per-track flag + master
        level. Recall is instant; the list clears on backend
        restart. Use Snapshot Editor for persistent saves.
      </p>

      <div className="looper-page__presets-save-row">
        <TextInput
          id="looper-preset-name-input"
          data-testid="looper-preset-name-input"
          labelText="New preset name"
          placeholder="e.g. verse-a"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault()
              void handleSave()
            }
          }}
        />
        <Button
          kind="primary"
          size="sm"
          disabled={!canSave}
          data-testid="looper-preset-save-button"
          onClick={() => void handleSave()}
        >
          {isDuplicate ? 'Overwrite' : 'Save'}
        </Button>
      </div>

      {sortedNames.length === 0 ? (
        <p
          className="looper-page__presets-empty"
          data-testid="looper-preset-empty"
        >
          No presets saved yet.
        </p>
      ) : (
        <>
          <ul
            className="looper-page__presets-list"
            data-testid="looper-preset-list"
          >
            {sortedNames.map((name) => (
              <li
                key={name}
                className="looper-page__presets-row"
                data-testid={`looper-preset-row-${name}`}
              >
                <span
                  className="looper-page__presets-row-name"
                  title={name}
                >
                  {name}
                </span>
                <div className="looper-page__presets-row-actions">
                  <Button
                    kind="tertiary"
                    size="sm"
                    data-testid={`looper-preset-apply-${name}`}
                    onClick={() =>
                      void onAction(() => looperApi.applyPreset(name))
                    }
                  >
                    Apply
                  </Button>
                  <Button
                    kind="danger--ghost"
                    size="sm"
                    data-testid={`looper-preset-delete-${name}`}
                    onClick={() => void handleDelete(name)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="looper-page__presets-clear-row">
            <Button
              kind="danger--tertiary"
              size="sm"
              data-testid="looper-preset-clear-all"
              onClick={() => void handleClearAll()}
            >
              Clear all presets
            </Button>
          </div>
        </>
      )}

      {/* T2512-PRESET-PERSIST — Restore-from-cache section. Only
          surfaces when the operator has a locally-cached preset the
          backend doesn't have (typical after a backend restart). One
          click re-seeds the state and saves under the same name. */}
      {missingFromBackend.length > 0 ? (
        <div
          className="looper-page__presets-restore"
          data-testid="looper-preset-restore-section"
        >
          <p className="looper-page__presets-help">
            Local cache has {missingFromBackend.length} preset
            {missingFromBackend.length === 1 ? '' : 's'} the backend
            doesn't know about — restore in one click.
          </p>
          <ul
            className="looper-page__presets-list"
            data-testid="looper-preset-restore-list"
          >
            {missingFromBackend.map((name) => (
              <li
                key={name}
                className="looper-page__presets-row"
                data-testid={`looper-preset-restore-row-${name}`}
              >
                <span
                  className="looper-page__presets-row-name"
                  title={name}
                >
                  {name}
                </span>
                <div className="looper-page__presets-row-actions">
                  <Button
                    kind="primary"
                    size="sm"
                    data-testid={`looper-preset-restore-${name}`}
                    onClick={() => void handleRestoreFromCache(name)}
                  >
                    Restore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Tile>
  )
}

/**
 * T2512-METRICS-UI — verb invocation counters panel.
 *
 * Backend (T2512-METRICS-WS) embeds the cumulative counter dict in
 * every WS status frame so the page never has to poll /metrics. This
 * panel renders the counters as a sortable table inside a foldable
 * Tile. The Reset button drops the counters server-side (DELETE
 * /metrics) without touching the activity log. Counter keys are the
 * exact LooperService verb names (record / stop / clear / undo /
 * redo / reset_state / apply_state) so the panel doesn't need its
 * own pretty-name map — what you see is what fires.
 */
function MetricsPanel({
  metrics,
  onAction,
}: {
  metrics: Record<string, number>
  onAction: (fn: () => Promise<LooperStatus>) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const entries = useMemo(() => {
    return Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b))
  }, [metrics])
  const total = useMemo(
    () => entries.reduce((sum, [, n]) => sum + n, 0),
    [entries],
  )

  // T2512-METRICS-CHART — ring-buffer per-verb deltas across status
  // frames so each row renders a sparkline. ``prevRef`` holds the
  // last seen snapshot so delta computation is incremental, and
  // ``historyRef`` is the mutable map of verb → samples. The
  // dependency is the ``metrics`` object reference: every status
  // frame creates a new dict via the LooperPage refresh path, so
  // identity-stability is sufficient — no deep-compare needed.
  // A version counter forces React to re-render after we mutate
  // the ref-backed history (mutating refs alone wouldn't re-render).
  const prevRef = useRef<Record<string, number>>({})
  const historyRef = useRef<MetricsHistory>(new Map())
  const [historyVersion, setHistoryVersion] = useState(0)

  useEffect(() => {
    appendMetricsDelta(historyRef.current, prevRef.current, metrics)
    prevRef.current = metrics
    setHistoryVersion((v) => v + 1)
  }, [metrics])

  const recentTotal = useMemo(() => {
    let sum = 0
    for (const buf of historyRef.current.values()) {
      sum += trailingSum(buf)
    }
    return sum
    // historyVersion tracks ref mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVersion])
  return (
    <Tile
      className="looper-page__metrics"
      data-testid="looper-metrics-panel"
    >
      <button
        type="button"
        className="looper-page__metrics-toggle"
        data-testid="looper-metrics-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          aria-hidden
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span>
          Metrics — {total} verb call{total === 1 ? '' : 's'} ({entries.length}{' '}
          tracked
          {recentTotal > 0 ? (
            <span data-testid="looper-metrics-recent">
              {' '}· {recentTotal} in last {SPARKLINE_CAPACITY} samples
            </span>
          ) : null}
          )
        </span>
      </button>
      {open ? (
        <div className="looper-page__metrics-body">
          {entries.length === 0 ? (
            <p
              className="looper-page__metrics-empty"
              data-testid="looper-metrics-empty"
            >
              No verb has fired yet since the backend started (or since
              the last reset).
            </p>
          ) : (
            <ul
              className="looper-page__metrics-list"
              data-testid="looper-metrics-list"
            >
              {entries.map(([verb, count]) => {
                const samples = historyRef.current.get(verb) ?? []
                const points = sparklinePoints(samples, 80, 18)
                const recent = trailingSum(samples)
                return (
                  <li
                    key={verb}
                    data-testid={`looper-metrics-row-${verb}`}
                  >
                    <span>{verb}</span>
                    <svg
                      data-testid={`looper-metrics-sparkline-${verb}`}
                      role="img"
                      aria-label={`${verb} — ${recent} in the last ${samples.length} sample${samples.length === 1 ? '' : 's'}`}
                      width={80}
                      height={18}
                      viewBox="0 0 80 18"
                      style={{ flex: '0 0 80px', alignSelf: 'center' }}
                    >
                      {points ? (
                        <polyline
                          fill="none"
                          stroke="var(--cds-support-info, #4589ff)"
                          strokeWidth={1.5}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          points={points}
                        />
                      ) : (
                        <line
                          x1={0}
                          y1={17}
                          x2={80}
                          y2={17}
                          stroke="var(--cds-border-subtle, #c6c6c6)"
                          strokeWidth={1}
                          strokeDasharray="2 2"
                        />
                      )}
                    </svg>
                    <span>{count}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="looper-page__metrics-actions">
            <Button
              kind="danger--ghost"
              size="sm"
              disabled={entries.length === 0}
              data-testid="looper-metrics-reset-button"
              onClick={() =>
                onAction(async () => {
                  await looperApi.resetMetrics()
                  // Reset the counters server-side, then pull a fresh
                  // status so the page reflects the zeroed dict (the
                  // WS broadcast also re-broadcasts on the next verb,
                  // but doesn't fire on the reset itself).
                  return looperApi.getStatus()
                })
              }
            >
              Reset counters
            </Button>
          </div>
        </div>
      ) : null}
    </Tile>
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

      {/* T2512-AUTO-PEAK-UI — threshold slider + peak indicator. The
          backend already exposes auto_last_level_db + auto_peak_db on
          every status frame; this block surfaces them so an operator
          can tune the threshold from the page. Sentinel -150 dB means
          "no sample yet"; render as em-dash so the meter doesn't
          imply silence. */}
      <div
        className="looper-track__auto-peak"
        data-testid={`looper-auto-peak-${track.track}`}
      >
        <Slider
          id={`looper-auto-threshold-${track.track}`}
          labelText={`Threshold: ${track.auto_threshold_db.toFixed(1)} dB`}
          min={-90}
          max={0}
          step={1}
          value={track.auto_threshold_db}
          onRelease={(e: { value: number }) =>
            onAction(() => looperApi.setAutoThresholdDb(track.track, e.value))
          }
        />
        <div className="looper-track__auto-peak-meta">
          <Tag
            type={
              isPeakAboveThreshold(track)
                ? 'green'
                : 'cool-gray'
            }
            size="sm"
            data-testid={`looper-auto-peak-tag-${track.track}`}
          >
            Peak {formatPeakDb(track.auto_peak_db)}
          </Tag>
          <Tag
            type="cool-gray"
            size="sm"
            data-testid={`looper-auto-last-tag-${track.track}`}
          >
            Last {formatPeakDb(track.auto_last_level_db)}
          </Tag>
          <Button
            kind="ghost"
            size="sm"
            data-testid={`looper-auto-peak-reset-${track.track}`}
            onClick={() =>
              onAction(() => looperApi.resetAutoPeak(track.track))
            }
          >
            Reset peak
          </Button>
        </div>
      </div>

      {/* T2512-PAGE-V2 — advanced operator state surface (sync / stop / quantize). */}
      <div className="looper-track__advanced" data-testid={`looper-advanced-${track.track}`}>
        <Select
          id={`looper-sync-${track.track}`}
          size="sm"
          labelText="Sync mode"
          value={track.sync_mode}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onAction(() =>
              looperApi.setSyncMode(track.track, e.target.value as LooperSyncMode),
            )
          }
        >
          <SelectItem value="free"   text="Free" />
          <SelectItem value="master" text="Master" />
          <SelectItem value="slave"  text="Slave" />
        </Select>

        <Select
          id={`looper-stop-mode-${track.track}`}
          size="sm"
          labelText="Stop mode"
          value={track.stop_mode}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onAction(() =>
              looperApi.setStopMode(track.track, e.target.value as LooperStopMode),
            )
          }
        >
          <SelectItem value="hard" text="Hard" />
          <SelectItem value="fade" text="Fade" />
        </Select>

        <NumberInput
          id={`looper-fade-ms-${track.track}`}
          size="sm"
          label="Fade ms"
          min={0}
          max={5000}
          step={50}
          value={track.fade_ms}
          // Disable when stop_mode is "hard" — the field has no effect.
          disabled={track.stop_mode === 'hard'}
          onChange={(_evt: unknown, payload: { value: number | string }) => {
            const next = typeof payload.value === 'number'
              ? payload.value
              : parseInt(payload.value, 10)
            if (!Number.isFinite(next)) return
            onAction(() => looperApi.setFadeMs(track.track, next))
          }}
        />

        <Select
          id={`looper-quantize-${track.track}`}
          size="sm"
          labelText="Quantize"
          value={track.quantize_division}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onAction(() =>
              looperApi.setQuantizeDivision(
                track.track,
                e.target.value as LooperQuantizeDivision,
              ),
            )
          }
        >
          <SelectItem value="off"           text="Off" />
          <SelectItem value="whole"         text="1/1 (whole)" />
          <SelectItem value="half"          text="1/2 (half)" />
          <SelectItem value="quarter"       text="1/4 (quarter)" />
          <SelectItem value="eighth"        text="1/8 (eighth)" />
          <SelectItem value="sixteenth"     text="1/16 (sixteenth)" />
          <SelectItem value="thirty-second" text="1/32 (thirty-second)" />
        </Select>

        {/* T2512-OS-COUNT-UI — multi-pass one-shot count. Backend
            clamps to 1..32; the input mirrors the same bounds. Disabled
            when the one-shot flag is off so operators can't tune a
            value that nothing consumes — the runner reads this only
            at one-shot+playing transition. */}
        <NumberInput
          id={`looper-one-shot-passes-${track.track}`}
          data-testid={`looper-one-shot-passes-${track.track}`}
          size="sm"
          label="One-shot passes"
          min={1}
          max={32}
          step={1}
          value={track.one_shot_passes ?? 1}
          disabled={!track.one_shot}
          onChange={(_evt: unknown, payload: { value: number | string }) => {
            const next = typeof payload.value === 'number'
              ? payload.value
              : parseInt(payload.value, 10)
            if (!Number.isFinite(next)) return
            const clamped = Math.max(1, Math.min(32, next))
            onAction(() =>
              looperApi.setOneShotPasses(track.track, clamped),
            )
          }}
        />

        {/* T2512-SLICE — slice count + clear action. */}
        <div
          className="looper-track__slices"
          data-testid={`looper-slices-${track.track}`}
        >
          <Tag type={track.slices.length > 0 ? 'cool-gray' : 'gray'} size="sm">
            {track.slices.length} slice{track.slices.length === 1 ? '' : 's'}
          </Tag>
          {track.slices.length > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              data-testid={`looper-clear-slices-${track.track}`}
              onClick={() => onAction(() => looperApi.clearSlices(track.track))}
            >
              Clear slices
            </Button>
          ) : null}
        </div>
      </div>

      {/* T2512-SLICE-UI — region editor: inline add-slice form +
          sorted list of existing slices. Lives outside the advanced
          grid row so the form widgets don't compete with the
          dropdown column track. */}
      <SliceEditor track={track} onAction={onAction} />
    </Tile>
  )
}

function SliceEditor({
  track,
  onAction,
}: {
  track: LooperTrackStatus
  onAction: (fn: () => Promise<LooperStatus>) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState<number>(0)
  const [end, setEnd] = useState<number>(48000)
  const [label, setLabel] = useState<string>('')
  // T2512-SLICE-MULTI — multi-select state. Keyed by start_frame
  // (the same primary key the DELETE route uses). Reset on every
  // status update because the underlying slice list can change
  // out-of-band (preset apply / clear-slices / etc.); stale
  // start_frame keys are filtered out at render time.
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  // Prune selections that no longer correspond to a slice on the
  // current track (preset apply / external clear can change the
  // list under us).
  const validSelected = useMemo(() => {
    const present = new Set(track.slices.map((s) => s.start_frame))
    const out = new Set<number>()
    selected.forEach((sf) => {
      if (present.has(sf)) out.add(sf)
    })
    return out
  }, [selected, track.slices])

  const handleAdd = () => {
    if (end <= start) return  // service rejects anyway; spare the round-trip
    onAction(() => looperApi.addSlice(track.track, start, end, label.trim()))
    // Reset label after a successful add so the operator can chain entries.
    setLabel('')
  }

  const toggleSelected = (startFrame: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(startFrame)) {
        next.delete(startFrame)
      } else {
        next.add(startFrame)
      }
      return next
    })
  }

  const handleDeleteSelected = useCallback(async () => {
    if (validSelected.size === 0) return
    const targets = Array.from(validSelected).sort((a, b) => a - b)
    // Sequential awaits — DELETE on the same track is cheap and the
    // service-side mutex serializes anyway. Bulk DELETE isn't worth
    // a separate route until operators actually feel the cost.
    await onAction(async () => {
      let last: LooperStatus | null = null
      for (const sf of targets) {
        last = await looperApi.deleteSlice(track.track, sf)
      }
      // onAction expects a LooperStatus — fall back to a status fetch
      // if nothing was deleted (shouldn't happen because validSelected
      // is non-empty, but TS doesn't know that).
      return last ?? (await looperApi.getStatus())
    })
    setSelected(new Set())
  }, [onAction, track.track, validSelected])

  const handleSelectAll = () => {
    setSelected(new Set(track.slices.map((s) => s.start_frame)))
  }

  const handleClearSelection = () => {
    setSelected(new Set())
  }

  return (
    <div
      className="looper-track__slice-editor"
      data-testid={`looper-slice-editor-${track.track}`}
    >
      <button
        type="button"
        className="looper-track__slice-editor-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid={`looper-slice-editor-toggle-${track.track}`}
      >
        <ChevronDown size={16} />
        <span>Slice editor</span>
        <Tag type={track.slices.length > 0 ? 'cool-gray' : 'gray'} size="sm">
          {track.slices.length}
        </Tag>
      </button>

      {open ? (
        <div className="looper-track__slice-editor-body">
          <div className="looper-track__slice-form">
            <NumberInput
              id={`looper-slice-start-${track.track}`}
              size="sm"
              label="Start frame"
              min={0}
              step={1}
              value={start}
              onChange={(_evt: unknown, payload: { value: number | string }) => {
                const v = typeof payload.value === 'number'
                  ? payload.value
                  : parseInt(payload.value, 10)
                if (Number.isFinite(v)) setStart(v)
              }}
            />
            <NumberInput
              id={`looper-slice-end-${track.track}`}
              size="sm"
              label="End frame"
              min={1}
              step={1}
              value={end}
              onChange={(_evt: unknown, payload: { value: number | string }) => {
                const v = typeof payload.value === 'number'
                  ? payload.value
                  : parseInt(payload.value, 10)
                if (Number.isFinite(v)) setEnd(v)
              }}
            />
            <input
              type="text"
              className="looper-track__slice-label"
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={64}
              data-testid={`looper-slice-label-${track.track}`}
            />
            <Button
              kind="primary"
              size="sm"
              disabled={end <= start}
              data-testid={`looper-add-slice-${track.track}`}
              onClick={handleAdd}
            >
              Add slice
            </Button>
          </div>

          {/* T2512-SLICE-AT-PLAYHEAD — quick action: slice from the
              previous boundary up to the current playhead. Only
              renders when there's captured content (playhead > 0). */}
          {track.playhead_frames > 0 ? (
            <Button
              kind="tertiary"
              size="sm"
              data-testid={`looper-slice-at-playhead-${track.track}`}
              onClick={() =>
                onAction(() =>
                  looperApi.addSliceAtPlayhead(track.track, label.trim()),
                )
              }
            >
              Slice here (playhead @ {track.playhead_frames})
            </Button>
          ) : null}

          {track.slices.length > 0 ? (
            <>
              {/* T2512-SLICE-MULTI — bulk-action row. Only renders
                  selection-driven buttons; the per-row delete trash
                  can still works for single-shot deletes. */}
              <div
                className="looper-track__slice-bulk"
                data-testid={`looper-slice-bulk-${track.track}`}
              >
                <Button
                  kind="ghost"
                  size="sm"
                  data-testid={`looper-slice-select-all-${track.track}`}
                  onClick={handleSelectAll}
                  disabled={validSelected.size === track.slices.length}
                >
                  Select all
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  data-testid={`looper-slice-clear-selection-${track.track}`}
                  onClick={handleClearSelection}
                  disabled={validSelected.size === 0}
                >
                  Clear selection
                </Button>
                <Button
                  kind="danger--tertiary"
                  size="sm"
                  data-testid={`looper-slice-delete-selected-${track.track}`}
                  onClick={() => void handleDeleteSelected()}
                  disabled={validSelected.size === 0}
                >
                  Delete selected ({validSelected.size})
                </Button>
              </div>
              <ul
                className="looper-track__slice-list"
                data-testid={`looper-slice-list-${track.track}`}
              >
                {track.slices.map((slc) => (
                  <SliceRow
                    key={`${slc.start_frame}-${slc.end_frame}`}
                    trackIdx={track.track}
                    slice={slc}
                    selected={validSelected.has(slc.start_frame)}
                    onToggleSelected={toggleSelected}
                    onAction={onAction}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="looper-track__slice-empty">
              No slices yet. Add a region using start + end frame counts
              (1 second @ 48 kHz = 48000 frames).
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * T2512-SLICE-EDIT — single slice row with inline-rename affordance.
 *
 * Renames go through the existing T2512-SLICE-RENAME PATCH route;
 * the rest of the row (checkbox / range / delete trash can) is
 * unchanged from the original SliceEditor inline render.
 *
 * UX:
 *   - Idle: shows label (or "unlabeled" placeholder) + a ghost edit
 *     button that swaps the row into edit mode.
 *   - Edit: shows a TextInput pre-populated with the current label;
 *     Save commits, Cancel reverts. Enter submits; Escape cancels.
 *
 * State is local to the row so a parent re-render (WS frame
 * application) does not stomp the operator's draft.
 */
function SliceRow({
  trackIdx,
  slice,
  selected,
  onToggleSelected,
  onAction,
}: {
  trackIdx: number
  slice: { start_frame: number; end_frame: number; label: string }
  selected: boolean
  onToggleSelected: (startFrame: number) => void
  onAction: (fn: () => Promise<LooperStatus>) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(slice.label)

  const startEdit = useCallback(() => {
    setDraft(slice.label)
    setEditing(true)
  }, [slice.label])

  const commit = useCallback(async () => {
    const trimmed = draft.trim().slice(0, 64)
    if (trimmed === slice.label) {
      setEditing(false)
      return
    }
    await onAction(() =>
      looperApi.renameSlice(trackIdx, slice.start_frame, trimmed),
    )
    setEditing(false)
  }, [draft, onAction, slice.label, slice.start_frame, trackIdx])

  const cancel = useCallback(() => {
    setDraft(slice.label)
    setEditing(false)
  }, [slice.label])

  return (
    <li>
      <input
        type="checkbox"
        className="looper-track__slice-checkbox"
        data-testid={`looper-slice-checkbox-${trackIdx}-${slice.start_frame}`}
        aria-label={`Select slice ${slice.start_frame}–${slice.end_frame}`}
        checked={selected}
        onChange={() => onToggleSelected(slice.start_frame)}
      />
      <span className="looper-track__slice-range">
        {slice.start_frame}–{slice.end_frame}
      </span>
      {editing ? (
        <span className="looper-track__slice-label-edit">
          <input
            type="text"
            className="looper-track__slice-label-input"
            data-testid={`looper-slice-rename-input-${trackIdx}-${slice.start_frame}`}
            value={draft}
            maxLength={64}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              }
            }}
          />
          <Button
            kind="primary"
            size="sm"
            data-testid={`looper-slice-rename-save-${trackIdx}-${slice.start_frame}`}
            onClick={() => void commit()}
          >
            Save
          </Button>
          <Button
            kind="ghost"
            size="sm"
            data-testid={`looper-slice-rename-cancel-${trackIdx}-${slice.start_frame}`}
            onClick={cancel}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <span className="looper-track__slice-label-text">
          <span data-testid={`looper-slice-label-${trackIdx}-${slice.start_frame}`}>
            {slice.label || <em>unlabeled</em>}
          </span>
          <Button
            kind="ghost"
            size="sm"
            data-testid={`looper-slice-rename-${trackIdx}-${slice.start_frame}`}
            onClick={startEdit}
          >
            Rename
          </Button>
        </span>
      )}
      <Button
        kind="ghost"
        size="sm"
        hasIconOnly
        renderIcon={TrashCan}
        iconDescription={`Delete slice ${slice.start_frame}–${slice.end_frame}`}
        tooltipPosition="left"
        data-testid={`looper-delete-slice-${trackIdx}-${slice.start_frame}`}
        onClick={() =>
          onAction(() => looperApi.deleteSlice(trackIdx, slice.start_frame))
        }
      />
    </li>
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


// T2512-ACTIVITY-UI — collapsible panel surfacing the audit log
// shipped under T2512-ACTIVITY. After T2512-ACTIVITY-WS, the recent
// activity tail rides every status broadcast, so when WS is
// connected the panel renders that tail and skips polling. The HTTP
// fallback still fetches the full 200-event log every 2 s when WS
// is down (operator can still audit during a reconnect).
type ActivityEvent = {
  timestamp_iso: string
  verb: string
  track: number | null
  summary: string
}

function ActivityPanel({
  statusRecentActivity,
  wsConnected,
}: {
  statusRecentActivity: ActivityEvent[]
  wsConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [polledEvents, setPolledEvents] = useState<ActivityEvent[]>([])
  const [cap, setCap] = useState<number>(200)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await looperApi.getActivity()
      setPolledEvents(data.events)
      setCap(data.cap)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // When WS is live, the embedded status carries the recent tail —
    // no need to poll. We still fetch once on open so the cap is set.
    if (wsConnected) {
      // One fetch to populate `cap` (status frames don't carry it).
      void refresh()
      return
    }
    void refresh()
    const handle = window.setInterval(() => { void refresh() }, 2000)
    return () => window.clearInterval(handle)
  }, [open, wsConnected, refresh])

  // Pick the live source. WS-connected → status tail (newest-first
  // already). HTTP poll → reverse oldest-first to newest-first below.
  const liveEvents: ActivityEvent[] = wsConnected
    ? statusRecentActivity
    : polledEvents.slice().reverse()
  // Number-displayed count. Use the WS tail length when connected;
  // otherwise the polled list length.
  const events = liveEvents

  const handleClear = () => {
    void (async () => {
      try {
        await looperApi.clearActivity()
        setPolledEvents([])
        setError(null)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to clear activity')
      }
    })()
  }

  // Already newest-first thanks to the WS branch handling reversal
  // in the source selection above.
  const newestFirst = events

  return (
    <section className="looper-page__inventory" data-testid="looper-activity-panel">
      <button
        type="button"
        className="looper-page__inventory-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="looper-activity-toggle"
      >
        <ChevronDown size={16} />
        <span>
          Recent activity — {events.length} of {cap} captured
        </span>
      </button>
      {open ? (
        <div className="looper-page__inventory-body">
          <div className="looper-page__activity-actions">
            <Button
              kind="ghost"
              size="sm"
              data-testid="looper-activity-clear"
              disabled={events.length === 0}
              onClick={handleClear}
            >
              Clear log
            </Button>
          </div>
          {error ? (
            <InlineNotification
              kind="warning"
              title="Activity log error"
              subtitle={error}
              hideCloseButton
              lowContrast
            />
          ) : null}
          {newestFirst.length === 0 ? (
            <p className="looper-track__slice-empty">
              No recorded activity yet. Mutating verbs (record, stop,
              clear, undo, redo, reset, snapshot apply) will appear
              here as they happen.
            </p>
          ) : (
            <ul
              className="looper-page__activity-list"
              data-testid="looper-activity-list"
            >
              {newestFirst.map((ev) => (
                <li key={`${ev.timestamp_iso}-${ev.verb}-${ev.track ?? 'm'}`}>
                  <span className="looper-track__slice-range">
                    {ev.timestamp_iso}
                  </span>
                  <span className="looper-track__slice-label-text">
                    <strong>{ev.verb}</strong>
                    {ev.track != null ? <> · track {ev.track + 1}</> : null}
                    {' '}— {ev.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}

/**
 * T2512-KEYBOARD-CUSTOMIZE — rebind dialog.
 *
 * Each action row shows its current binding label + a "Rebind"
 * button that arms capture mode. While capturingAction is set, the
 * LooperPage's global keydown handler routes the next non-modifier
 * keypress here instead of firing transport verbs.
 *
 * Duplicate bindings are surfaced with an InlineNotification but not
 * blocked — operators sometimes deliberately stack two actions on
 * one key (rare but useful for footswitch overlays).
 */
function LooperKeybindingsModal({
  open,
  bindings,
  capturingAction,
  onCaptureStart,
  onClear,
  onResetAll,
  onClose,
}: {
  open: boolean
  bindings: LooperKeybindings
  capturingAction: LooperAction | null
  onCaptureStart: (action: LooperAction | null) => void
  onClear: (action: LooperAction) => void
  onResetAll: () => void
  onClose: () => void
}) {
  const duplicates = useMemo(
    () => findDuplicateBindings(bindings),
    [bindings],
  )
  return (
    <Modal
      data-testid="looper-kb-customize-modal"
      open={open}
      modalHeading="Customize keyboard shortcuts"
      primaryButtonText="Done"
      secondaryButtonText="Reset all to defaults"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      onSecondarySubmit={onResetAll}
      preventCloseOnClickOutside
    >
      <p
        style={{
          margin: '0 0 0.75rem',
          color: 'var(--cds-text-secondary)',
        }}
      >
        Click <em>Rebind</em> beside an action, then press the key
        combo you want. Bindings save to this browser only.
      </p>
      {duplicates.length > 0 ? (
        <InlineNotification
          data-testid="looper-kb-customize-dupe-warning"
          kind="warning"
          lowContrast
          hideCloseButton
          title="Duplicate bindings"
          subtitle={duplicates
            .map((arr) =>
              arr.map((a) => LOOPER_ACTION_LABEL[a]).join(' & '),
            )
            .join('; ')}
          style={{ marginBottom: '0.75rem' }}
        />
      ) : null}
      <ul
        data-testid="looper-kb-customize-list"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto',
          gap: '0.5rem 0.75rem',
          alignItems: 'center',
        }}
      >
        {LOOPER_ACTIONS.map((action) => {
          const capturing = capturingAction === action
          return (
            <li
              key={action}
              style={{ display: 'contents' }}
              data-testid={`looper-kb-customize-row-${action}`}
            >
              <span>{LOOPER_ACTION_LABEL[action]}</span>
              <kbd data-testid={`looper-kb-customize-binding-${action}`}>
                {bindingLabel(bindings[action])}
              </kbd>
              <Button
                kind={capturing ? 'danger--tertiary' : 'tertiary'}
                size="sm"
                data-testid={`looper-kb-customize-capture-${action}`}
                onClick={() =>
                  onCaptureStart(capturing ? null : action)
                }
              >
                {capturing ? 'Press a key…' : 'Rebind'}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                data-testid={`looper-kb-customize-clear-${action}`}
                onClick={() => onClear(action)}
              >
                Clear
              </Button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
