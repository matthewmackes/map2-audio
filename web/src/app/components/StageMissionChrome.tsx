import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

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
