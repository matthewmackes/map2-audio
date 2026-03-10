/**
 * PerformPage — full-window Performance Mode (T098).
 *
 * Renders as a 100vw × 100vh fixed overlay with no AppShell chrome.
 * Optimised for tablet or 7–10" touch display mounted on stage.
 *
 * Sections:
 *   Topbar   — STAGE MODE label | active chain name | MIDI SETUP | EXIT
 *   Grid     — 4×2 paginated chain (preset) buttons
 *   Strip    — per-block bypass tiles
 *   Lower    — tap tempo | chromatic tuner
 *   Healthbar — engine status | RTL | xruns | CPU | MIDI LED | clock
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chainsApi } from '../../map2/api'
import type { Chain } from '../../map2/types'

// ── Carbon tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#161616',
  surface:   '#262626',
  surface2:  '#333333',
  surface3:  '#3d3d3d',
  blue:      '#0f62fe',
  text:      '#f4f4f4',
  secondary: '#c6c6c6',
  muted:     '#8d8d8d',
  border:    '#525252',
  green:     '#24a148',
  amber:     '#f1c21b',
  red:       '#da1e28',
  teal:      '#009d9a',
  purple:    '#8a3ffc',
  mono:      "'IBM Plex Mono', monospace",
  sans:      "'IBM Plex Sans', sans-serif",
} as const

const API = import.meta.env.VITE_API_BASE as string || '/api'
const STAGE_ORDER_KEY = 'map2.perform.stage_order.v1'
const STAGE_COLOR_KEY = 'map2.perform.accent_colors.v1'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { cache: 'no-store', ...init })
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface HealthData {
  engineStatus: 'ok' | 'degraded' | 'offline'
  rtlMs: number
  xruns: number
  cpuPct: number
}

interface TunerData {
  note: string
  octave: number
  cents: number
  in_tune: boolean
  online: boolean
}

interface PerformanceEvent {
  seq: number
  action: string
  payload?: Record<string, unknown>
  channel: number
  timestamp_ns: number
  source_port: string
}

interface PerformanceEventsResponse {
  events: PerformanceEvent[]
  last_seq: number
}

interface MidiHubClockStatus {
  source_mode?: string
  detected_bpm?: number | null
}

const ACCENT_COLORS = ['#009d9a','#0f62fe','#24a148','#f1c21b','#da1e28','#8a3ffc','#f4f4f4','']

// ── Utility ───────────────────────────────────────────────────────────────────
function pluginCategory(name: string): string {
  const n = name.toLowerCase()
  if (/comp|limit|gate|expand/.test(n)) return C.teal
  if (/cho|phas|flan|mod|vibr|tremol/.test(n)) return C.purple
  if (/delay|echo|reverb|room/.test(n)) return C.blue
  if (/amp|nam|cab|ir|dist|over|fuzz|drive/.test(n)) return C.amber
  return C.surface3
}

function pluginAbbr(name: string): string {
  const map: Record<string, string> = {
    compressor: 'COMP', limiter: 'LIM', gate: 'GATE', expander: 'EXP',
    chorus: 'CHO', phaser: 'PHS', flanger: 'FLG', tremolo: 'TRM',
    vibrato: 'VIB', delay: 'DLY', echo: 'ECHO', reverb: 'REV',
    'nam': 'NAM', cabinet: 'CAB', distortion: 'DIST', overdrive: 'OD',
    fuzz: 'FUZZ', drive: 'DRV', eq: 'EQ', equalizer: 'EQ',
    pitch: 'PCH', harmonizer: 'HAR', wah: 'WAH', volume: 'VOL',
  }
  const n = name.toLowerCase()
  for (const [k, v] of Object.entries(map)) if (n.includes(k)) return v
  return name.slice(0, 4).toUpperCase()
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

// ── PresetGrid ───────────────────────────────────────────────────────────────
function PresetGrid({
  chains,
  activeChainId,
  onActivate,
  page,
  onPageChange,
  flashingSlot,
  flashingPagePrev,
  flashingPageNext,
  onLongPress,
  accentByChainId,
}: {
  chains: Chain[]
  activeChainId: number | null
  onActivate: (id: number) => void
  page: number
  onPageChange: (p: number) => void
  flashingSlot: number | null
  flashingPagePrev: boolean
  flashingPageNext: boolean
  onLongPress: (chain: Chain, slot: number, x: number, y: number) => void
  accentByChainId: Record<number, string>
}) {
  const PER_PAGE = 8
  const totalPages = Math.max(1, Math.ceil(chains.length / PER_PAGE))
  const slice = chains.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  // pad to 8 slots
  const slots: (Chain | null)[] = [...slice, ...Array(PER_PAGE - slice.length).fill(null)]
  const longPressTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const suppressClickRef = useRef<Record<number, boolean>>({})

  const clearLongPress = useCallback((slot: number) => {
    const timer = longPressTimersRef.current[slot]
    if (timer) {
      clearTimeout(timer)
      delete longPressTimersRef.current[slot]
    }
  }, [])

  useEffect(() => () => {
    Object.values(longPressTimersRef.current).forEach((timer) => clearTimeout(timer))
    longPressTimersRef.current = {}
    suppressClickRef.current = {}
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {slots.map((chain, i) => {
          const isActive = chain != null && chain.id === activeChainId
          const accentColor = chain ? (accentByChainId[chain.id] ?? ACCENT_COLORS[i % ACCENT_COLORS.length]) : ''
          const slot = i + 1
          const flashing = flashingSlot === slot
          return (
            <button
              key={chain?.id ?? `empty-${i}`}
              disabled={chain == null}
              onClick={() => {
                if (!chain) return
                if (suppressClickRef.current[slot]) {
                  suppressClickRef.current[slot] = false
                  return
                }
                onActivate(chain.id)
              }}
              onPointerDown={(event) => {
                if (!chain) return
                clearLongPress(slot)
                const x = event.clientX
                const y = event.clientY
                longPressTimersRef.current[slot] = setTimeout(() => {
                  suppressClickRef.current[slot] = true
                  onLongPress(chain, slot, x, y)
                }, 500)
              }}
              onPointerUp={() => clearLongPress(slot)}
              onPointerLeave={() => clearLongPress(slot)}
              onPointerCancel={() => clearLongPress(slot)}
              onContextMenu={(event) => {
                if (!chain) return
                event.preventDefault()
                clearLongPress(slot)
                suppressClickRef.current[slot] = true
                onLongPress(chain, slot, event.clientX, event.clientY)
              }}
              style={{
                height: 80,
                background: isActive ? C.surface3 : C.surface,
                border: isActive ? `2px solid ${C.text}` : `1px solid ${C.border}`,
                borderRadius: 4,
                cursor: chain ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: 0,
                overflow: 'hidden',
                transition: 'border-color 80ms, background 80ms',
                opacity: chain ? 1 : 0.3,
                filter: flashing ? 'brightness(1.1)' : undefined,
              }}
            >
              {/* accent strip */}
              <div style={{ width: '100%', height: 4, background: accentColor || 'transparent' }} />
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '0 8px',
              }}>
                <span style={{
                  fontFamily: C.sans,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? C.text : C.secondary,
                  textAlign: 'center',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                }}>
                  {chain?.name ?? '—'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      {/* Pager */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          style={{
            ...ghostBtn(page === 0),
            filter: flashingPagePrev ? 'brightness(1.1)' : undefined,
          }}
        >
          ‹
        </button>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>
          Page {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          style={{
            ...ghostBtn(page >= totalPages - 1),
            filter: flashingPageNext ? 'brightness(1.1)' : undefined,
          }}
        >
          ›
        </button>
      </div>
    </div>
  )
}

// ── BypassStrip ───────────────────────────────────────────────────────────────
function BypassStrip({
  chain,
  onToggle,
  isBlockFlashing,
}: {
  chain: Chain | null
  onToggle: (chainId: number, uri: string, bypass: boolean, pluginPosition?: number) => void
  isBlockFlashing: (blockIndex: number) => boolean
}) {
  if (!chain || chain.plugins.length === 0) {
    return (
      <div style={{ color: C.muted, fontFamily: C.sans, fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
        No active chain or no plugins loaded
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
      {chain.plugins.map((plug, idx) => {
        const bypassed = plug.bypassed
        const accent = pluginCategory(plug.name)
        const blockIndex = idx + 1
        const flashing = isBlockFlashing(blockIndex)
        return (
          <button
            key={`${plug.uri}-${plug.position}`}
            onClick={() => onToggle(chain.id, plug.uri, !bypassed, plug.position)}
            title={plug.name}
            style={{
              minWidth: 56,
              height: 44,
              background: bypassed ? C.surface : accent + '22',
              border: bypassed ? `1px solid ${C.border}` : `1px solid ${accent}55`,
              borderRadius: 4,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              opacity: bypassed ? 0.45 : 1,
              transition: 'opacity 80ms, border-color 80ms',
              filter: flashing ? 'brightness(1.1)' : undefined,
            }}
          >
            <span style={{
              fontFamily: C.mono,
              fontSize: 10,
              fontWeight: 600,
              color: bypassed ? C.muted : C.text,
              letterSpacing: 0.5,
            }}>
              {pluginAbbr(plug.name)}
            </span>
          </button>
        )
      })}
      {/* ALL ON */}
      <button
        onClick={() =>
          chain.plugins.filter(p => p.bypassed).forEach(p => onToggle(chain.id, p.uri, false, p.position))
        }
        style={{
          minWidth: 56,
          height: 44,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 4,
          cursor: 'pointer',
          flexShrink: 0,
          color: C.secondary,
          fontFamily: C.mono,
          fontSize: 9,
          letterSpacing: 0.5,
        }}
      >
        ALL ON
      </button>
    </div>
  )
}

// ── TapTempo ──────────────────────────────────────────────────────────────────
function TapTempo({
  onBpm,
  tapSignal,
  flashing,
}: {
  onBpm: (bpm: number) => void
  tapSignal: number
  flashing: boolean
}) {
  const [bpm, setBpm] = useState<number | null>(null)
  const [midiSync, setMidiSync] = useState(false)
  const [label, setLabel] = useState<'MIN' | 'MAX' | null>(null)
  const taps = useRef<number[]>([])
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTapSignalRef = useRef<number>(tapSignal)
  const unlockUntilRef = useRef<number>(0)

  const handleTap = useCallback(() => {
    if (midiSync) {
      unlockUntilRef.current = Date.now() + 5000
      setMidiSync(false)
      return
    }
    const now = Date.now()
    taps.current.push(now)
    if (taps.current.length > 4) taps.current = taps.current.slice(-4)

    clearTimeout(lockTimer.current)
    lockTimer.current = setTimeout(() => { taps.current = [] }, 3000)

    if (taps.current.length < 2) return
    const intervals = taps.current.slice(1).map((t, i) => t - taps.current[i])
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    let computed = Math.round(60000 / avg)
    if (computed < 40) { computed = 40; setLabel('MIN') }
    else if (computed > 300) { computed = 300; setLabel('MAX') }
    else setLabel(null)
    setBpm(computed)
    onBpm(computed)
  }, [midiSync, onBpm])

  useEffect(() => () => clearTimeout(lockTimer.current), [])

  useEffect(() => {
    let closed = false
    const pollClock = async () => {
      try {
        const payload = await apiFetch<MidiHubClockStatus>('/midi/hub/clock')
        if (closed) return
        const detected = Number(payload.detected_bpm ?? 0)
        const externalClock = payload.source_mode === 'external' && Number.isFinite(detected) && detected > 0
        if (!externalClock) {
          unlockUntilRef.current = 0
          setMidiSync(false)
          return
        }
        if (Date.now() < unlockUntilRef.current) return
        const clamped = Math.max(40, Math.min(300, Math.round(detected)))
        setMidiSync(true)
        setLabel(null)
        setBpm(clamped)
      } catch {
        // Clock route optional in some deployments.
      }
    }
    void pollClock()
    const id = window.setInterval(() => {
      void pollClock()
    }, 500)
    return () => {
      closed = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (tapSignal === lastTapSignalRef.current) return
    lastTapSignalRef.current = tapSignal
    handleTap()
  }, [tapSignal, handleTap])

  const rtlColor = bpm == null ? C.muted : C.text

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
        Tap Tempo
      </div>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <span style={{ fontFamily: C.mono, fontSize: 48, fontWeight: 700, color: rtlColor, lineHeight: 1 }}>
          {bpm ?? '—'}
        </span>
        <span style={{ fontFamily: C.sans, fontSize: 11, color: C.muted, display: 'block', marginTop: 2 }}>
          {midiSync ? 'MIDI SYNC' : label ?? 'BPM'}
        </span>
      </div>
      {midiSync ? (
        <div
          onClick={() => setMidiSync(false)}
          style={{
            width: 80, height: 80, background: C.surface2,
            border: `1px solid ${C.teal}`, borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            fontFamily: C.mono, fontSize: 10, color: C.teal,
            filter: flashing ? 'brightness(1.1)' : undefined,
          }}
        >
          LOCK
        </div>
      ) : (
        <button
          onClick={handleTap}
          style={{
            width: 80, height: 80,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: C.sans, fontSize: 14, fontWeight: 600,
            color: C.secondary,
            transition: 'background 80ms',
            filter: flashing ? 'brightness(1.1)' : undefined,
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.background = C.surface2 }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.background = C.surface }}
          aria-label="Tap tempo"
          title="Tap tempo"
        >
          TAP
        </button>
      )}
    </div>
  )
}

// ── Tuner ─────────────────────────────────────────────────────────────────────
function Tuner({
  toggleSignal,
  flashing,
}: {
  toggleSignal: number
  flashing: boolean
}) {
  const [tuner, setTuner] = useState<TunerData>({
    note: '--', octave: 4, cents: 0, in_tune: false, online: false,
  })
  const [muted, setMuted] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const lastToggleSignalRef = useRef<number>(toggleSignal)
  const mutedRef = useRef<boolean>(false)

  useEffect(() => {
    const poll = async () => {
      try {
        const d = await apiFetch<TunerData>('/v2/expression/engine/tuner')
        setTuner(d)
      } catch {
        setTuner(t => ({ ...t, online: false }))
      }
    }
    poll()
    intervalRef.current = setInterval(poll, 100)
    return () => clearInterval(intervalRef.current)
  }, [])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  const toggleMute = useCallback(async () => {
    const next = !mutedRef.current
    setMuted(next)
    try {
      await apiFetch('/v2/expression/engine/output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted: next }),
      })
    } catch {
      setMuted(!next) // revert on error
    }
  }, [])

  useEffect(() => {
    if (toggleSignal === lastToggleSignalRef.current) return
    lastToggleSignalRef.current = toggleSignal
    void toggleMute()
  }, [toggleSignal, toggleMute])

  // Cents bar: -50 to +50 maps to 0..100% of 200px bar
  const clampedCents = Math.max(-50, Math.min(50, tuner.cents))
  const needleX = ((clampedCents + 50) / 100) * 200  // px position 0..200
  const inTuneZone = Math.abs(clampedCents) <= 5

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
      {muted && (
        <div style={{
          position: 'absolute', inset: -12, background: `${C.amber}18`,
          border: `1px solid ${C.amber}40`, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1, pointerEvents: 'none',
        }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.amber, letterSpacing: 1 }}>
            MUTING OUTPUT
          </span>
        </div>
      )}
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
        Tuner
      </div>
      {/* Note + octave */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontFamily: C.mono, fontSize: 36, fontWeight: 700, color: tuner.online ? C.text : C.muted }}>
          {tuner.note}
        </span>
        {tuner.online && (
          <span style={{ fontFamily: C.mono, fontSize: 14, color: C.muted, marginLeft: 4 }}>
            {tuner.octave}
          </span>
        )}
      </div>
      {/* Cents bar */}
      {tuner.online ? (
        <div style={{ position: 'relative', width: 200, height: 20 }}>
          {/* track */}
          <div style={{
            position: 'absolute', top: 8, left: 0, right: 0, height: 4,
            background: C.surface3, borderRadius: 0,
          }} />
          {/* left half amber, right half amber, center green */}
          <div style={{
            position: 'absolute', top: 8, left: 0, width: 90, height: 4,
            background: inTuneZone ? C.green : C.amber, opacity: 0.5,
          }} />
          <div style={{
            position: 'absolute', top: 8, right: 0, width: 90, height: 4,
            background: inTuneZone ? C.green : C.amber, opacity: 0.5,
          }} />
          <div style={{
            position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
            width: 20, height: 8, background: C.green, opacity: 0.8,
          }} />
          {/* needle */}
          <div style={{
            position: 'absolute', top: 2, left: needleX - 2,
            width: 4, height: 16,
            background: inTuneZone ? C.green : C.text,
            transition: 'left 40ms linear',
          }} />
        </div>
      ) : (
        <div style={{ fontFamily: C.sans, fontSize: 11, color: C.muted }}>Engine offline</div>
      )}
      {/* Mute button */}
      <button
        onClick={toggleMute}
        style={{
          padding: '6px 16px',
          background: muted ? `${C.amber}22` : C.surface,
          border: muted ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: C.mono,
          fontSize: 11,
          color: muted ? C.amber : C.secondary,
          letterSpacing: 0.5,
          filter: flashing ? 'brightness(1.1)' : undefined,
        }}
      >
        {muted ? '■ UNMUTE' : '♩ TUNE'}
      </button>
    </div>
  )
}

// ── HealthBar ─────────────────────────────────────────────────────────────────
function HealthBar({ midiPulseSignal }: { midiPulseSignal: number }) {
  const [health, setHealth] = useState<HealthData>({
    engineStatus: 'offline', rtlMs: 0, xruns: 0, cpuPct: 0,
  })
  const [midiFlash, setMidiFlash] = useState(false)
  const [clock, setClock] = useState('')
  const midiTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMidiPulseRef = useRef<number>(midiPulseSignal)

  // Clock
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (midiPulseSignal === lastMidiPulseRef.current) return
    lastMidiPulseRef.current = midiPulseSignal
    setMidiFlash(true)
    if (midiTimer.current) clearTimeout(midiTimer.current)
    midiTimer.current = setTimeout(() => setMidiFlash(false), 100)
  }, [midiPulseSignal])

  // Health poll
  useEffect(() => {
    const poll = async () => {
      try {
        const [engine, jitter, cpu] = await Promise.allSettled([
          apiFetch<{ status?: string; running?: boolean }>('/v2/engine/status'),
          apiFetch<{ rtl_p95_ms?: number; xrun_count?: number }>('/v2/latency/jitter-stats'),
          apiFetch<{ cpu_percent?: number }>('/performance/current'),
        ])
        const engineStatus = engine.status === 'fulfilled'
          ? ((engine.value.status as 'ok' | 'degraded' | 'offline') || (engine.value.running ? 'ok' : 'offline'))
          : 'offline'
        setHealth({
          engineStatus,
          rtlMs: jitter.status === 'fulfilled' ? (jitter.value.rtl_p95_ms ?? 0) : 0,
          xruns: jitter.status === 'fulfilled' ? (jitter.value.xrun_count ?? 0) : 0,
          cpuPct: cpu.status === 'fulfilled' ? ((cpu.value as any)?.cpu_percent ?? 0) : 0,
        })
      } catch { /* silent */ }
    }
    poll()
    const id = setInterval(poll, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => {
    if (midiTimer.current) clearTimeout(midiTimer.current)
  }, [])

  const rtlColor = health.rtlMs > 5.0 ? C.red : health.rtlMs >= 3.5 ? C.amber : C.green
  const cpuColor = health.cpuPct > 90 ? C.red : health.cpuPct > 70 ? C.amber : C.secondary
  const xrunColor = health.xruns > 0 ? C.red : C.muted
  const engineColor = health.engineStatus === 'ok' ? C.green : health.engineStatus === 'degraded' ? C.amber : C.red

  const seg: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    borderRight: `1px solid ${C.border}`, padding: '0 12px',
    fontFamily: C.mono, fontSize: 11,
  }

  return (
    <div style={{
      height: 32,
      background: '#111111',
      borderTop: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Engine */}
      <div
        style={{ ...seg, cursor: health.engineStatus === 'ok' ? 'default' : 'pointer' }}
        onClick={() => {
          if (health.engineStatus !== 'ok') window.open('/engine', '_blank', 'noopener')
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: engineColor, display: 'inline-block' }} />
        <span style={{ color: engineColor }}>
          {health.engineStatus === 'ok' ? 'ENGINE OK' : health.engineStatus === 'degraded' ? 'ENGINE DEGRADED' : 'ENGINE OFFLINE'}
        </span>
      </div>
      {/* RTL */}
      <div
        style={{ ...seg, cursor: health.rtlMs > 5.0 ? 'pointer' : 'default' }}
        onClick={() => {
          if (health.rtlMs > 5.0) window.open('/engine', '_blank', 'noopener')
        }}
      >
        <span style={{ color: rtlColor }}>RTL {health.rtlMs.toFixed(1)}ms</span>
      </div>
      {/* Xruns */}
      <div
        style={{ ...seg, cursor: 'pointer' }}
        onClick={() => {
          setHealth(h => ({ ...h, xruns: 0 }))
          if (health.xruns > 0) window.open('/engine', '_blank', 'noopener')
        }}
      >
        <span style={{ color: xrunColor }}>XRUNS: {health.xruns}</span>
      </div>
      {/* CPU */}
      <div
        style={{ ...seg, cursor: health.cpuPct > 90 ? 'pointer' : 'default' }}
        onClick={() => {
          if (health.cpuPct > 90) window.open('/cpu-performance', '_blank', 'noopener')
        }}
      >
        <span style={{ color: cpuColor }}>CPU {Math.round(health.cpuPct)}%</span>
      </div>
      {/* MIDI LED */}
      <div
        style={{ ...seg, cursor: 'pointer' }}
        onClick={() => window.open('/midi-hub', '_blank', 'noopener')}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: midiFlash ? C.green : C.surface3,
          display: 'inline-block',
          transition: 'background 80ms',
        }} />
        <span style={{ color: C.muted }}>MIDI</span>
      </div>
      {/* Clock */}
      <div style={{ ...seg, borderRight: 'none', marginLeft: 'auto' }}>
        <span style={{ color: C.muted }}>{clock}</span>
      </div>
    </div>
  )
}

// ── Ghost button helper ───────────────────────────────────────────────────────
function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${disabled ? C.border : C.secondary}`,
    borderRadius: 4,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? C.muted : C.secondary,
    fontFamily: C.sans,
    fontSize: 14,
    padding: '4px 12px',
    opacity: disabled ? 0.4 : 1,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main PerformPage
// ═══════════════════════════════════════════════════════════════════════════
export function PerformPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [activeChainId, setActiveChainId] = useState<number | null>(null)
  const [activatingId, setActivatingId] = useState<number | null>(null)
  const [tapSignal, setTapSignal] = useState(0)
  const [tunerToggleSignal, setTunerToggleSignal] = useState(0)
  const [midiPulseSignal, setMidiPulseSignal] = useState(0)
  const [flashFlags, setFlashFlags] = useState<Record<string, boolean>>({})
  const [stageOrder, setStageOrder] = useState<number[]>([])
  const [accentByChainId, setAccentByChainId] = useState<Record<number, string>>({})
  const [presetMenu, setPresetMenu] = useState<{
    chain: Chain
    slot: number
    x: number
    y: number
  } | null>(null)

  const perfSeqRef = useRef(0)
  const activatingRef = useRef<number | null>(null)
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const chainsRef = useRef<Chain[]>([])
  const activeChainRef = useRef<Chain | null>(null)
  const totalPagesRef = useRef(1)
  const pageRef = useRef(0)

  const triggerFlash = useCallback((key: string) => {
    setFlashFlags(prev => ({ ...prev, [key]: true }))
    const prior = flashTimersRef.current[key]
    if (prior) clearTimeout(prior)
    flashTimersRef.current[key] = setTimeout(() => {
      setFlashFlags(prev => ({ ...prev, [key]: false }))
      delete flashTimersRef.current[key]
    }, 200)
  }, [])

  // Load chains
  const { data: chainsData } = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const chains: Chain[] = useMemo(() => chainsData?.chains ?? [], [chainsData])
  const chainsById = useMemo(() => {
    const map = new Map<number, Chain>()
    chains.forEach((chain) => {
      map.set(chain.id, chain)
    })
    return map
  }, [chains])

  const stageChains = useMemo(() => {
    if (stageOrder.length === 0) return chains
    const seen = new Set<number>()
    const ordered: Chain[] = []
    for (const chainId of stageOrder) {
      const chain = chainsById.get(chainId)
      if (chain) {
        ordered.push(chain)
        seen.add(chainId)
      }
    }
    for (const chain of chains) {
      if (!seen.has(chain.id)) ordered.push(chain)
    }
    return ordered
  }, [chains, chainsById, stageOrder])
  const activeChain = useMemo(
    () => stageChains.find(c => c.id === activeChainId) ?? stageChains.find(c => c.is_active) ?? null,
    [stageChains, activeChainId],
  )
  const totalPages = Math.max(1, Math.ceil(stageChains.length / 8))

  useEffect(() => {
    try {
      const rawOrder = window.localStorage.getItem(STAGE_ORDER_KEY)
      if (rawOrder) {
        const parsed = JSON.parse(rawOrder)
        if (Array.isArray(parsed)) {
          const ids = parsed.map(Number).filter((id) => Number.isFinite(id) && id > 0)
          setStageOrder(ids)
        }
      }
      const rawAccent = window.localStorage.getItem(STAGE_COLOR_KEY)
      if (rawAccent) {
        const parsed = JSON.parse(rawAccent)
        if (parsed && typeof parsed === 'object') {
          const next: Record<number, string> = {}
          Object.entries(parsed as Record<string, unknown>).forEach(([k, value]) => {
            const id = Number(k)
            if (Number.isFinite(id) && typeof value === 'string') {
              next[id] = value
            }
          })
          setAccentByChainId(next)
        }
      }
    } catch {
      // Ignore localStorage parse failures.
    }
  }, [])

  useEffect(() => {
    const backendIds = chains.map(chain => chain.id)
    if (backendIds.length === 0) {
      setStageOrder(prev => (prev.length === 0 ? prev : []))
      return
    }
    setStageOrder((prev) => {
      if (prev.length === 0) return backendIds
      const present = prev.filter((id) => backendIds.includes(id))
      const missing = backendIds.filter((id) => !present.includes(id))
      const next = [...present, ...missing]
      if (next.length === prev.length && next.every((value, idx) => value === prev[idx])) return prev
      return next
    })
  }, [chains])

  useEffect(() => {
    try {
      window.localStorage.setItem(STAGE_ORDER_KEY, JSON.stringify(stageOrder))
    } catch {
      // Ignore localStorage write failures.
    }
  }, [stageOrder])

  useEffect(() => {
    try {
      window.localStorage.setItem(STAGE_COLOR_KEY, JSON.stringify(accentByChainId))
    } catch {
      // Ignore localStorage write failures.
    }
  }, [accentByChainId])

  useEffect(() => {
    chainsRef.current = stageChains
    activeChainRef.current = activeChain
    totalPagesRef.current = totalPages
    pageRef.current = page
  }, [stageChains, activeChain, totalPages, page])

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages - 1))
  }, [totalPages])

  useEffect(() => () => {
    Object.values(flashTimersRef.current).forEach((timer) => clearTimeout(timer))
    flashTimersRef.current = {}
  }, [])

  // Sync activeChainId from loaded chains
  useEffect(() => {
    if (activeChainId == null) {
      const a = stageChains.find(c => c.is_active)
      if (a) setActiveChainId(a.id)
    }
  }, [stageChains, activeChainId])

  // F11 — exit performance mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); navigate(-1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  // Activate chain
  const handleActivate = useCallback(async (chainId: number) => {
    if (activatingRef.current != null) return
    activatingRef.current = chainId
    setActivatingId(chainId)
    try {
      await chainsApi.activate(chainId)
      setActiveChainId(chainId)
      await qc.invalidateQueries({ queryKey: ['chains'] })
    } catch (err) {
      console.error('Failed to activate chain:', err)
    } finally {
      activatingRef.current = null
      setActivatingId(null)
    }
  }, [qc])

  // Toggle plugin bypass
  const handleBypass = useCallback(async (chainId: number, uri: string, bypass: boolean, pluginPosition?: number) => {
    try {
      await chainsApi.togglePluginBypass(chainId, uri, bypass, pluginPosition)
      await qc.invalidateQueries({ queryKey: ['chains'] })
    } catch (err) {
      console.error('Failed to toggle bypass:', err)
    }
  }, [qc])

  // Tap tempo → BPM API
  const handleBpm = useCallback(async (bpm: number) => {
    try {
      await apiFetch('/v2/expression/engine/bpm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm }),
      })
    } catch { /* silent */ }
  }, [])

  const activateSlot = useCallback(async (slot: number) => {
    const slotNum = Math.max(1, Math.min(8, Math.floor(slot)))
    triggerFlash(`slot-${slotNum}`)
    const idx = (pageRef.current * 8) + (slotNum - 1)
    const target = chainsRef.current[idx]
    if (!target) return
    if (activeChainRef.current?.id === target.id) return
    await handleActivate(target.id)
  }, [handleActivate, triggerFlash])

  const toggleBypassBlock = useCallback(async (blockIndex: number) => {
    const idx = Math.max(1, Math.min(64, Math.floor(blockIndex)))
    triggerFlash(`bypass-${idx}`)
    const chain = activeChainRef.current
    if (!chain) return
    const plugin = chain.plugins[idx - 1]
    if (!plugin) return
    await handleBypass(chain.id, plugin.uri, !plugin.bypassed, plugin.position)
  }, [handleBypass, triggerFlash])

  const dispatchPerformanceEvent = useCallback((event: PerformanceEvent) => {
    const payload = event.payload ?? {}

    if (event.action === 'perform.page_next') {
      triggerFlash('page-next')
      setPage(prev => Math.min(totalPagesRef.current - 1, prev + 1))
      return
    }
    if (event.action === 'perform.page_prev') {
      triggerFlash('page-prev')
      setPage(prev => Math.max(0, prev - 1))
      return
    }
    if (event.action === 'perform.tap_tempo') {
      triggerFlash('tap')
      setTapSignal(prev => prev + 1)
      return
    }
    if (event.action === 'perform.tuner_mute') {
      triggerFlash('tuner')
      setTunerToggleSignal(prev => prev + 1)
      return
    }
    if (event.action.startsWith('perform.bypass.')) {
      const blockFromPayload = Number(payload.block_index)
      const blockFromAction = Number(event.action.split('.').pop())
      const block = Number.isFinite(blockFromPayload) ? blockFromPayload : blockFromAction
      if (Number.isFinite(block) && block >= 1 && block <= 8) {
        void toggleBypassBlock(block)
      }
      return
    }
    if (event.action === 'perform.load_slot') {
      const slot = Number(payload.slot ?? payload.program)
      if (Number.isFinite(slot) && slot >= 1 && slot <= 8) {
        void activateSlot(slot)
      }
    }
  }, [activateSlot, toggleBypassBlock, triggerFlash])

  // Poll MIDI-triggered performance actions.
  useEffect(() => {
    let closed = false
    const poll = async () => {
      try {
        const payload = await apiFetch<PerformanceEventsResponse>(
          `/v2/expression/performance-events?after_seq=${perfSeqRef.current}&limit=256`,
        )
        if (closed) return
        const events = Array.isArray(payload.events) ? payload.events : []
        if (events.length > 0) {
          setMidiPulseSignal(prev => prev + 1)
          for (const event of events) {
            dispatchPerformanceEvent(event)
          }
        }
        const lastSeq = Number(payload.last_seq || 0)
        const eventLastSeq = events.length > 0 ? Number(events[events.length - 1]?.seq || 0) : 0
        perfSeqRef.current = Math.max(perfSeqRef.current, lastSeq, eventLastSeq)
      } catch {
        // Keep stage UI responsive when backend poll fails.
      }
    }

    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, 120)
    return () => {
      closed = true
      window.clearInterval(id)
    }
  }, [dispatchPerformanceEvent])

  // Keyboard shortcuts for page nav.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        triggerFlash('page-next')
        setPage(prev => Math.min(totalPagesRef.current - 1, prev + 1))
      }
      if (e.key === 'ArrowLeft') {
        triggerFlash('page-prev')
        setPage(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [triggerFlash])

  const flashingSlot = useMemo(() => {
    for (let slot = 1; slot <= 8; slot += 1) {
      if (flashFlags[`slot-${slot}`]) return slot
    }
    return null
  }, [flashFlags])

  const isBypassFlashing = useCallback((idx: number) => Boolean(flashFlags[`bypass-${idx}`]), [flashFlags])

  const openPresetMenu = useCallback((chain: Chain, slot: number, x: number, y: number) => {
    setPresetMenu({ chain, slot, x, y })
  }, [])

  const closePresetMenu = useCallback(() => {
    setPresetMenu(null)
  }, [])

  const renameFromMenu = useCallback(async () => {
    if (!presetMenu) return
    const nextName = window.prompt('Rename preset', presetMenu.chain.name)?.trim()
    if (!nextName || nextName === presetMenu.chain.name) {
      closePresetMenu()
      return
    }
    try {
      await chainsApi.rename(presetMenu.chain.id, nextName)
      await qc.invalidateQueries({ queryKey: ['chains'] })
    } catch (err) {
      console.error('Failed to rename chain from Stage Mode menu:', err)
    } finally {
      closePresetMenu()
    }
  }, [closePresetMenu, presetMenu, qc])

  const setAccentFromMenu = useCallback((color: string) => {
    if (!presetMenu) return
    const chainId = presetMenu.chain.id
    setAccentByChainId((prev) => {
      const next = { ...prev }
      if (!color) {
        delete next[chainId]
      } else {
        next[chainId] = color
      }
      return next
    })
    closePresetMenu()
  }, [closePresetMenu, presetMenu])

  const moveFromMenu = useCallback(() => {
    if (!presetMenu) return
    const max = Math.max(1, stageChains.length)
    const raw = window.prompt(`Move to position (1-${max})`, String((pageRef.current * 8) + presetMenu.slot))
    if (!raw) {
      closePresetMenu()
      return
    }
    const requested = Number(raw)
    if (!Number.isFinite(requested)) {
      closePresetMenu()
      return
    }
    const targetIndex = Math.max(0, Math.min(max - 1, Math.floor(requested) - 1))
    const chainId = presetMenu.chain.id
    setStageOrder((prev) => {
      const source = prev.length > 0 ? [...prev] : stageChains.map(chain => chain.id)
      const without = source.filter(id => id !== chainId)
      without.splice(targetIndex, 0, chainId)
      return without
    })
    closePresetMenu()
  }, [closePresetMenu, presetMenu, stageChains])

  const removeFromMenu = useCallback(() => {
    if (!presetMenu) return
    const chainId = presetMenu.chain.id
    setStageOrder((prev) => prev.filter(id => id !== chainId))
    closePresetMenu()
  }, [closePresetMenu, presetMenu])

  useEffect(() => {
    if (!presetMenu) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresetMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presetMenu])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: C.sans,
      overflow: 'hidden',
    }}>
      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 40,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
          Stage Mode
        </span>
        <span style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 500, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeChain?.name ?? '—'}
          {activatingId != null && <span style={{ color: C.muted, marginLeft: 8, fontSize: 11 }}>switching…</span>}
        </span>
        <button
          onClick={() => window.open('/expression', '_blank')}
          style={{ ...ghostBtn(false), fontSize: 11, padding: '4px 10px' }}
        >
          MIDI FOOTSWITCH SETUP
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{ ...ghostBtn(false), fontSize: 11, padding: '4px 10px' }}
          title="Exit Performance Mode (F11)"
        >
          EXIT (F11)
        </button>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>

        {/* Preset grid */}
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <PresetGrid
            chains={stageChains}
            activeChainId={activeChain?.id ?? null}
            onActivate={handleActivate}
            page={Math.min(page, totalPages - 1)}
            onPageChange={(nextPage) => {
              setPage(Math.max(0, Math.min(totalPages - 1, nextPage)))
            }}
            flashingSlot={flashingSlot}
            flashingPagePrev={Boolean(flashFlags['page-prev'])}
            flashingPageNext={Boolean(flashFlags['page-next'])}
            onLongPress={openPresetMenu}
            accentByChainId={accentByChainId}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.border, flexShrink: 0 }} />

        {/* Bypass strip */}
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Effect Blocks
          </div>
          <BypassStrip chain={activeChain} onToggle={handleBypass} isBlockFlashing={isBypassFlashing} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.border, flexShrink: 0 }} />

        {/* Lower third: tap tempo + tuner */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          overflow: 'hidden',
        }}>
          {/* Tap tempo */}
          <div style={{
            borderRight: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}>
            <TapTempo onBpm={handleBpm} tapSignal={tapSignal} flashing={Boolean(flashFlags.tap)} />
          </div>

          {/* Tuner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}>
            <Tuner toggleSignal={tunerToggleSignal} flashing={Boolean(flashFlags.tuner)} />
          </div>
        </div>
      </div>

      {presetMenu && (
        <div
          onClick={closePresetMenu}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            background: 'transparent',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'absolute',
              left: Math.max(8, Math.min(window.innerWidth - 220, presetMenu.x - 80)),
              top: Math.max(8, Math.min(window.innerHeight - 210, presetMenu.y - 24)),
              width: 212,
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <button onClick={renameFromMenu} style={{ ...ghostBtn(false), width: '100%', textAlign: 'left', fontSize: 11 }}>
              Rename
            </button>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, letterSpacing: 0.7 }}>
              Assign Color
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {ACCENT_COLORS.map((color, idx) => (
                <button
                  key={`accent-${idx}`}
                  onClick={() => setAccentFromMenu(color)}
                  title={color || 'No color'}
                  style={{
                    height: 20,
                    background: color || 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <button onClick={moveFromMenu} style={{ ...ghostBtn(false), width: '100%', textAlign: 'left', fontSize: 11 }}>
              Move
            </button>
            <button onClick={removeFromMenu} style={{ ...ghostBtn(false), width: '100%', textAlign: 'left', fontSize: 11, color: C.amber }}>
              Remove from Setlist
            </button>
          </div>
        </div>
      )}

      {/* ── Health bar ─────────────────────────────────────────────────── */}
      <HealthBar midiPulseSignal={midiPulseSignal} />
    </div>
  )
}

export default PerformPage
