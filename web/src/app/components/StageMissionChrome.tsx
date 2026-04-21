import { useEffect, useReducer, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

function formatTimeMono(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(iv)
  }, [])
  return now
}

interface DatelineItem {
  label: string
  value: string
}

interface StageDatelineProps {
  rigLabel: string
  items: DatelineItem[]
  mountedAt?: number
}

export function StageDateline({ rigLabel, items, mountedAt }: StageDatelineProps) {
  const now = useClock()
  const uptime = mountedAt ? formatUptime(Date.now() - mountedAt) : null
  return (
    <div className="stage-mission-dateline" aria-label="Stage dateline">
      <span className="stage-mission-dateline__dot" aria-hidden="true" />
      <span className="stage-mission-dateline__brand">MAP2 · STAGE SURFACE</span>
      <span className="stage-mission-dateline__sep" aria-hidden="true" />
      <span className="stage-mission-dateline__rig">{rigLabel}</span>
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="stage-mission-dateline__item">
          <span className="stage-mission-dateline__sep" aria-hidden="true" />
          <span className="stage-mission-dateline__k">{it.label}</span>
          <span className="stage-mission-dateline__v">{it.value}</span>
        </span>
      ))}
      <span className="stage-mission-dateline__spacer" />
      <span className="stage-mission-dateline__clock">{formatTimeMono(now)}</span>
      {uptime ? (
        <>
          <span className="stage-mission-dateline__sep" aria-hidden="true" />
          <span className="stage-mission-dateline__k">UPTIME</span>
          <span className="stage-mission-dateline__v">{uptime}</span>
        </>
      ) : null}
    </div>
  )
}

interface StrapItem {
  label: string
  value: string
}

interface StageChyronStrapProps {
  items: StrapItem[]
  reducedMotion?: boolean
}

export function StageChyronStrap({ items, reducedMotion = false }: StageChyronStrapProps) {
  const now = useClock()
  const loop = reducedMotion ? items : [...items, ...items]
  return (
    <div className="stage-chyron__strap" aria-label="Live KPI strap">
      <span className="stage-chyron__strap-label">Live</span>
      <div className="stage-chyron__strap-content">
        <div
          className={`stage-chyron__strap-scroll${reducedMotion ? ' stage-chyron__strap-scroll--static' : ''}`}
        >
          {loop.map((it, i) => (
            <span key={`${it.label}-${i}`} className="stage-chyron__strap-item">
              <span className="stage-chyron__strap-k">{it.label}</span>
              <span className="stage-chyron__strap-v">{it.value}</span>
            </span>
          ))}
        </div>
      </div>
      <span className="stage-chyron__strap-clock">{formatTimeMono(now)}</span>
    </div>
  )
}

export interface TickerEvent {
  time: string
  severity: 'info' | 'warn' | 'crit' | 'ok'
  text: string
}

interface StageEventTickerProps {
  events: TickerEvent[]
  reducedMotion?: boolean
  leading?: ReactNode
}

export function StageEventTicker({ events, reducedMotion = false, leading }: StageEventTickerProps) {
  if (events.length === 0) return null
  const loop = reducedMotion ? events : [...events, ...events]
  return (
    <div className="stage-mission-ticker" aria-label="Event log ticker">
      <span className="stage-mission-ticker__leading">{leading ?? 'EVENT LOG ▸'}</span>
      <div className="stage-mission-ticker__viewport">
        <div
          className={`stage-mission-ticker__track${reducedMotion ? ' stage-mission-ticker__track--static' : ''}`}
        >
          {loop.map((ev, i) => (
            <span key={`${ev.time}-${i}`} className="stage-mission-ticker__item">
              <span className="stage-mission-ticker__time">{ev.time}</span>
              <span className={`stage-mission-ticker__dot stage-mission-ticker__dot--${ev.severity}`} aria-hidden="true" />
              <span className="stage-mission-ticker__text">{ev.text}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// StageMidiPanel — compact realtime MIDI IN feed
// ─────────────────────────────────────────────

export type MidiEventType = 'CC' | 'PC' | 'Note'

export interface StageMidiEvent {
  id: string
  type: MidiEventType
  ch: number
  a: number
  b: number | null
  label: string
  timestamp: number
}

interface StageMidiPanelProps {
  events: StageMidiEvent[]
  reducedMotion?: boolean
}

function midiTypeColor(type: MidiEventType): string {
  if (type === 'CC') return '#78a9ff'
  if (type === 'PC') return '#be95ff'
  return '#42be65'
}

function midiAgo(timestamp: number): string {
  const s = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (s < 1) return 'now'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

function MidiEventRow({ event, isFresh, reducedMotion }: { event: StageMidiEvent; isFresh: boolean; reducedMotion: boolean }) {
  const color = midiTypeColor(event.type)
  const [, tick] = useReducer((x: number) => x + 1, 0)

  // tick every second to update ago label
  useEffect(() => {
    const iv = window.setInterval(tick, 1000)
    return () => window.clearInterval(iv)
  }, [])

  return (
    <motion.li
      layout
      className="stage-midi-panel__row"
      initial={reducedMotion ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: isFresh ? 1 : 0.68, x: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, x: 12, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ type: 'spring', stiffness: 80, damping: 24, mass: 1.4 }}
    >
      <motion.span
        className={`stage-midi-panel__type stage-midi-panel__type--${event.type.toLowerCase()}`}
        animate={isFresh && !reducedMotion ? {
          backgroundColor: [`${color}44`, 'var(--cds-layer-03, #525252)'],
        } : {}}
        transition={{ duration: 2.2, ease: 'easeOut' }}
        style={{ color }}
      >
        {event.type}
      </motion.span>
      <span className="stage-midi-panel__ch">CH{String(event.ch).padStart(2, '0')}</span>
      <span className="stage-midi-panel__vals">
        <b>{event.a}</b>
        {event.b != null ? <>, <b>{event.b}</b></> : null}
      </span>
      <span className="stage-midi-panel__label">{event.label}</span>
      <span className="stage-midi-panel__ago">{midiAgo(event.timestamp)}</span>
    </motion.li>
  )
}

function MidiHeroBlock({ event, rank, reducedMotion }: { event: StageMidiEvent; rank: 0 | 1 | 2; reducedMotion: boolean }) {
  const color = midiTypeColor(event.type)
  const [, tick] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const iv = window.setInterval(tick, 1000)
    return () => window.clearInterval(iv)
  }, [])

  return (
    <motion.li
      layout
      className={`stage-midi-hero stage-midi-hero--rank-${rank}`}
      data-rank={rank}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 90, damping: 22 }}
    >
      {/* Reference designator top-left, e.g., [CC][CH03] */}
      <span className="stage-midi-hero__ref">
        <span className={`stage-midi-hero__ref-type stage-midi-hero__ref-type--${event.type.toLowerCase()}`} style={{ color }}>
          [{event.type}]
        </span>
        <span className="stage-midi-hero__ref-ch">[CH{String(event.ch).padStart(2, '0')}]</span>
      </span>
      {/* Pulse ring — newest green, 2nd cyan 50%, 3rd cyan 25% */}
      <span className="stage-midi-hero__pulse" aria-hidden="true" />
      {/* Component value — label is main, numeric values secondary */}
      <span className="stage-midi-hero__value">
        <span className="stage-midi-hero__label">{event.label || '—'}</span>
        <span className="stage-midi-hero__nums">
          <b>{event.a}</b>{event.b != null ? <>, <b>{event.b}</b></> : null}
        </span>
      </span>
      {/* Tolerance (timestamp) bottom-right */}
      <span className="stage-midi-hero__tolerance">± {midiAgo(event.timestamp)}</span>
    </motion.li>
  )
}

function MidiArchiveChip({ event }: { event: StageMidiEvent }) {
  return (
    <li className="stage-midi-archive__chip">
      <span className={`stage-midi-archive__type stage-midi-archive__type--${event.type.toLowerCase()}`}>
        {event.type}
      </span>
      <span className="stage-midi-archive__ch">{String(event.ch).padStart(2, '0')}</span>
      <span className="stage-midi-archive__vals">
        {event.a}{event.b != null ? `,${event.b}` : ''}
      </span>
      <span className="stage-midi-archive__label">{event.label || ''}</span>
      <span className="stage-midi-archive__ago">{midiAgo(event.timestamp)}</span>
    </li>
  )
}

export function StageMidiPanel({ events, reducedMotion = false }: StageMidiPanelProps) {
  const heroes = events.slice(0, 3)
  const archive = events.slice(3, 10)
  const hasHero = heroes.length > 0

  return (
    <motion.section
      className="stage-midi-panel"
      aria-label="MIDI IN feed"
      data-cadence="midi-event"
      data-event={hasHero ? 'true' : 'false'}
      initial={reducedMotion ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1.4, delay: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="stage-midi-panel__head">
        <span className="stage-midi-panel__led" aria-hidden="true" />
        <span className="stage-midi-panel__head-label">MIDI IN</span>
        <span className="stage-midi-panel__spacer" />
        <span className="stage-midi-panel__count">LAST {events.length}</span>
      </div>

      {/* Slice F — Hero 3 schematic component blocks */}
      {heroes.length > 0 ? (
        <ol className="stage-midi-hero-list" aria-label="Last 3 MIDI events">
          <AnimatePresence initial={false}>
            {heroes.map((ev, i) => (
              <MidiHeroBlock key={ev.id} event={ev} rank={i as 0 | 1 | 2} reducedMotion={reducedMotion} />
            ))}
          </AnimatePresence>
          {/* Dimension line connector between heroes */}
          {heroes.length > 1 ? <li className="stage-midi-hero-list__dimension" aria-hidden="true" /> : null}
        </ol>
      ) : null}

      {/* Slice F — Secondary 7 as schematic parts-list appendix */}
      {archive.length > 0 ? (
        <ol className="stage-midi-archive" aria-label="Prior MIDI events">
          {archive.map((ev) => (
            <MidiArchiveChip key={ev.id} event={ev} />
          ))}
        </ol>
      ) : null}
    </motion.section>
  )
}
