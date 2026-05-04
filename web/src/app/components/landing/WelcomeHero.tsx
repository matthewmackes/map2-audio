import { memo, useMemo, type CSSProperties, type MouseEvent, type ReactElement } from 'react'
import mapGridHorizon from '../../../../../branding/MAP-GRID-HORIZON-2026.png'
import './WelcomeHero.css'

export type WelcomeHeroArtifact = {
  key: string
  count: number
  label: string
  sub: string
  accent: string
  unit?: string
  route?: string
}

export type WelcomeHeroHardwareDevice = {
  id: string
  name: string
  port: string
  status: 'live' | 'standby'
  kind: 'midi' | 'audio'
  route?: string
}

export type WelcomeHeroSessionInfo = {
  lastSessionLabel: string
  openPatchLabel: string
  uptimeLabel: string
}

export type WelcomeHeroTopbarInfo = {
  nodeLabel: string
  versionLabel: string
  sampleRateLabel: string
  bufferLabel: string
  cpuLabel: string
}

export type WelcomeHeroRibbonItem = {
  id: string
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'neutral'
  route?: string
}

export type WelcomeHeroHardwareCounts = {
  midiLive: number
  midiTotal: number
  cardsLive: number
  cardsTotal: number
  aggregateIoChannels: number
}

export type WelcomeHeroProps = {
  topbar: WelcomeHeroTopbarInfo
  artifacts: WelcomeHeroArtifact[]
  midiDevices: WelcomeHeroHardwareDevice[]
  audioDevices: WelcomeHeroHardwareDevice[]
  hardwareCounts: WelcomeHeroHardwareCounts
  session: WelcomeHeroSessionInfo
  ribbon: WelcomeHeroRibbonItem[]
  librarianScanLabel: string
  onEnterLiveSurface?: () => void
  onBrowseLibrary?: () => void
  onArtifactClick?: (artifact: WelcomeHeroArtifact) => void
  onHardwareClick?: (device: WelcomeHeroHardwareDevice) => void
  onHardwareSummaryClick?: (kind: 'midi' | 'audio') => void
  onRibbonClick?: (item: WelcomeHeroRibbonItem) => void
}

function formatCount(count: number): string {
  return Number.isFinite(count) ? count.toLocaleString() : '—'
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <path d="M2 3h5l1 2h6v8H2V3z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function AudioGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  )
}

function MidiGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <line x1="5" y1="6" x2="5" y2="10" />
      <line x1="8" y1="6" x2="8" y2="10" />
      <line x1="11" y1="6" x2="11" y2="10" />
    </svg>
  )
}

type GuideCard = {
  tag: string
  title: string
  body: string
  href: string
  meta: string
}

const GUIDE_CARDS: GuideCard[] = [
  {
    tag: '01 · Overview',
    title: 'What is MAP2?',
    body:
      'The why and how — modes (Audio · All-in-One · Management), signal chain, real-time latency targets, and how to set up a node.',
    href: '/about',
    meta: '6 min read',
  },
  {
    tag: '02 · Architecture',
    title: 'The stack, end to end.',
    body:
      'C++ JUCE engine, FastAPI backend, React 19 dashboard, PipeWire / JACK transport, AVB clustering. The exact technologies and how they fit.',
    href: '/about#architecture',
    meta: '8 min read',
  },
  {
    tag: '03 · Built with',
    title: 'Open-source roots.',
    body:
      'JUCE, PipeWire, JACK, FastAPI, React, Material UI, Neural Amp Modeler, Textual, plus 37 more PyPI and npm packages standing on shoulders.',
    href: '/about#built-with',
    meta: 'Credits',
  },
  {
    tag: '04 · Legal',
    title: 'AGPL-3.0 & disclaimer.',
    body:
      'MAP2 is licensed under AGPLv3. Educational and research use only — not production-ready, not a substitute for any commercial product.',
    href: '/about#legal',
    meta: 'Important',
  },
]

const SYSTEM_ROW_DEFAULT: Array<{ label: string; value: string; state: 'ok' | 'idle' | 'warn' }> = [
  { label: 'AVB', value: 'OPERATIONAL', state: 'ok' },
  { label: 'Avahi', value: '0 ENTITIES', state: 'idle' },
  { label: 'Cluster', value: '0 NODE/SD', state: 'idle' },
  { label: 'Clock', value: 'INTERNAL · 96 KHZ', state: 'ok' },
  { label: 'Storage', value: 'SESSION READY', state: 'ok' },
]

function buildSystemRow(ribbon: WelcomeHeroRibbonItem[]) {
  if (ribbon.length === 0) return SYSTEM_ROW_DEFAULT
  return ribbon.slice(0, 5).map((item) => ({
    label: item.label.toUpperCase(),
    value: item.value.toUpperCase(),
    state: (item.tone === 'ok' ? 'ok' : item.tone === 'warn' ? 'warn' : 'idle') as 'ok' | 'idle' | 'warn',
  }))
}

function buildLede(totalArtifacts: number, midiLive: number, audioLive: number): ReactElement {
  return (
    <>
      Every device is reporting in. <b>{formatCount(totalArtifacts)}</b> artifacts loaded,{' '}
      <b>
        {midiLive} MIDI {midiLive === 1 ? 'controller' : 'controllers'}
      </b>{' '}
      and{' '}
      <b>
        {audioLive} audio {audioLive === 1 ? 'interface' : 'interfaces'}
      </b>{' '}
      are live on the bus, the routing matrix is holding steady at sub-millisecond latency. Pick up where you left off,
      or start something new — the whole rig is yours.
    </>
  )
}

function WelcomeHeroImpl({
  topbar,
  artifacts,
  midiDevices,
  audioDevices,
  hardwareCounts,
  session,
  ribbon,
  librarianScanLabel,
  onEnterLiveSurface,
  onBrowseLibrary,
  onArtifactClick,
  onHardwareClick,
  onHardwareSummaryClick,
  onRibbonClick,
}: WelcomeHeroProps) {
  const totalArtifacts = useMemo(
    () => artifacts.reduce((sum, artifact) => sum + (Number.isFinite(artifact.count) ? artifact.count : 0), 0),
    [artifacts],
  )

  const hardwareList = useMemo(() => {
    const audioRows = audioDevices.slice(0, 3)
    const midiRows = midiDevices.slice(0, 2)
    return [...audioRows, ...midiRows]
  }, [audioDevices, midiDevices])

  const liveHardwareCount = hardwareCounts.midiLive + hardwareCounts.cardsLive
  const systemRow = useMemo(() => buildSystemRow(ribbon), [ribbon])

  const heroFooter = useMemo(
    () => [
      { l: 'Last session', v: session.lastSessionLabel || '—', s: session.openPatchLabel || '' },
      {
        l: 'Nodes online',
        v: `1 node · ${topbar.nodeLabel || 'master'}`,
        s: '',
      },
      {
        l: 'Audio I/O',
        v: `${hardwareCounts.cardsLive} of ${hardwareCounts.cardsTotal} live`,
        s: 'AVB operational',
      },
      {
        l: 'Uptime',
        v: session.uptimeLabel || 'Live',
        s: `${topbar.sampleRateLabel} · ${topbar.bufferLabel} buffer`,
      },
    ],
    [
      session.lastSessionLabel,
      session.openPatchLabel,
      session.uptimeLabel,
      topbar.nodeLabel,
      topbar.sampleRateLabel,
      topbar.bufferLabel,
      hardwareCounts.cardsLive,
      hardwareCounts.cardsTotal,
    ],
  )

  return (
    <div className="map2x" data-testid="welcome-hero">
      {/* ---------- HERO ---------- */}
      <section className="map2x-hero">
        <div
          className="map2x-hero__banner"
          style={{ backgroundImage: `url(${mapGridHorizon})` } as CSSProperties}
          aria-hidden
        />
        <div className="map2x-hero__overlay" aria-hidden />
        <div className="map2x-hero__radial" aria-hidden />
        <div className="map2x-hero__grid" aria-hidden />

        <div className="map2x-hero__inner">
          <div className="map2x-hero__eyebrow-row">
            <span className="map2x-eyebrow map2x-eyebrow--accent">— Welcome to MAP2</span>
            <span className="map2x-hero__sep">·</span>
            <span className="map2x-eyebrow">Mackes Audio Platform · Educational Build</span>
          </div>

          <h1 className="map2x-hero__title">
            Open source, assembled.
            <br />
            <span className="map2x-hero__title-accent">One platform for the whole rig.</span>
          </h1>

          <p className="map2x-hero__lede">
            A purpose-built digital audio backbone — one node or one hundred — running on commodity Linux hardware.
            Centralised I/O, shared routing, deterministic processing, direct capture. No DAW in every room; one platform
            for the whole band.
          </p>

          <div className="map2x-hero__cta-row">
            <button type="button" className="map2x-btn map2x-btn--primary" onClick={onEnterLiveSurface}>
              Read the Platform Guide
              <ArrowIcon />
            </button>
            <button type="button" className="map2x-btn" onClick={onBrowseLibrary}>
              Browse library
              <BookIcon />
            </button>
            <a
              className="map2x-btn"
              href="https://github.com/matthewmackes/map2-audio"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
              <GitHubIcon />
            </a>
          </div>

          <div className="map2x-hero__footer">
            {heroFooter.map((cell, i) => (
              <div key={cell.l} className={`map2x-hero__footer-cell${i === heroFooter.length - 1 ? ' is-last' : ''}`}>
                <div className="map2x-eyebrow">{cell.l}</div>
                <div className="map2x-hero__footer-value">{cell.v}</div>
                {cell.s ? <div className="map2x-mono map2x-hero__footer-sub">{cell.s}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- LIVE STATUS ---------- */}
      <section id="live-surface" className="map2x-section">
        <div className="map2x-section__head">
          <div>
            <div className="map2x-eyebrow map2x-eyebrow--accent map2x-section__eyebrow">— Live surface</div>
            <h2 className="map2x-section__title">Your studio is warmed up.</h2>
            <p className="map2x-section__sub">
              {buildLede(totalArtifacts, hardwareCounts.midiLive, hardwareCounts.cardsLive)}
            </p>
          </div>
          <div className="map2x-section__tags">
            <span className="map2x-tag map2x-tag--live">
              <span className="map2x-dot map2x-dot--live" />
              Live
            </span>
            <span className="map2x-tag">Snapshot 30</span>
            <span className="map2x-tag">Rev cb6a04…</span>
          </div>
        </div>

        <div className="map2x-live-grid">
          {/* Artifact panel */}
          <div className="map2x-panel">
            <div className="map2x-strip">
              <div className="map2x-strip__title">
                <b>Artifact library</b> · {formatCount(totalArtifacts)} total
              </div>
              <div className="map2x-strip__meta">
                <span className="map2x-dot map2x-dot--ok" />
                indexed · {librarianScanLabel}
              </div>
            </div>
            <div className="map2x-stat-grid">
              {artifacts.slice(0, 6).map((artifact, i) => {
                const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation()
                  onArtifactClick?.(artifact)
                }
                const isLastCol = (i + 1) % 3 === 0
                const isFirstRow = i < 3
                return (
                  <button
                    key={artifact.key}
                    type="button"
                    className="map2x-stat-cell"
                    data-last-col={isLastCol ? 'true' : 'false'}
                    data-first-row={isFirstRow ? 'true' : 'false'}
                    onClick={handleClick}
                  >
                    <div className="map2x-stat-cell__value">
                      {formatCount(artifact.count)}
                      {artifact.unit ? <small>{artifact.unit}</small> : null}
                    </div>
                    <div className="map2x-eyebrow map2x-stat-cell__label">{artifact.label}</div>
                    <div className="map2x-stat-cell__sub">{artifact.sub}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Hardware panel */}
          <div className="map2x-panel">
            <div className="map2x-strip">
              <div className="map2x-strip__title">
                <b>Hardware</b> · ready to play
              </div>
              <div className="map2x-strip__meta">
                <span className="map2x-dot map2x-dot--live" />
                {liveHardwareCount} LIVE
              </div>
            </div>
            <div className="map2x-hw-summary">
              <button
                type="button"
                className="map2x-hw-summary__cell"
                onClick={() => onHardwareSummaryClick?.('midi')}
              >
                <div className="map2x-stat-cell__value">
                  {hardwareCounts.midiLive}/{hardwareCounts.midiTotal}
                </div>
                <div className="map2x-eyebrow map2x-stat-cell__label">MIDI devices</div>
                <div className="map2x-stat-cell__sub">controllers · live sequencers</div>
              </button>
              <button
                type="button"
                className="map2x-hw-summary__cell is-last"
                onClick={() => onHardwareSummaryClick?.('audio')}
              >
                <div className="map2x-stat-cell__value">
                  {hardwareCounts.cardsLive}/{hardwareCounts.cardsTotal}
                </div>
                <div className="map2x-eyebrow map2x-stat-cell__label">Audio interfaces</div>
                <div className="map2x-stat-cell__sub">node-aware · audio-interface</div>
              </button>
            </div>
            <ul className="map2x-hw-list">
              {hardwareList.length === 0 ? (
                <li className="map2x-hw-row">
                  <span className="map2x-hw-row__icon">
                    <AudioGlyph />
                  </span>
                  <div className="map2x-hw-row__body">
                    <div className="map2x-hw-row__name">No hardware reporting</div>
                    <div className="map2x-mono map2x-hw-row__scope">
                      Connect a MIDI or audio device to light this up
                    </div>
                  </div>
                  <span className="map2x-tag">
                    <span className="map2x-dot map2x-dot--idle" />
                    STANDBY
                  </span>
                </li>
              ) : (
                hardwareList.map((device) => (
                  <li key={device.id} className="map2x-hw-row">
                    <span className="map2x-hw-row__icon">
                      {device.kind === 'midi' ? <MidiGlyph /> : <AudioGlyph />}
                    </span>
                    <button
                      type="button"
                      className="map2x-hw-row__body"
                      onClick={() => onHardwareClick?.(device)}
                    >
                      <div className="map2x-hw-row__name">{device.name}</div>
                      <div className="map2x-mono map2x-hw-row__scope">
                        {device.port} · {device.kind === 'midi' ? 'Node-aware MIDI device' : 'Node-aware audio interface'}
                      </div>
                    </button>
                    <span className={`map2x-tag ${device.status === 'live' ? 'map2x-tag--live' : ''}`}>
                      <span className={`map2x-dot ${device.status === 'live' ? 'map2x-dot--live' : 'map2x-dot--idle'}`} />
                      {device.status === 'live' ? 'LIVE' : 'STANDBY'}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* System row */}
        <div className="map2x-system-row">
          {systemRow.map((cell, i) => (
            <button
              key={cell.label}
              type="button"
              className={`map2x-system-row__cell${i === systemRow.length - 1 ? ' is-last' : ''}`}
              onClick={() => {
                const item = ribbon[i]
                if (item) onRibbonClick?.(item)
              }}
            >
              <span className={`map2x-dot map2x-dot--${cell.state}`} />
              <span className="map2x-mono map2x-system-row__label">
                <span className="map2x-system-row__label-text">{cell.label}</span>
                <span className="map2x-system-row__sep">·</span>
                <span className="map2x-system-row__value">{cell.value}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- PLATFORM GUIDE CARDS ---------- */}
      <section className="map2x-section">
        <div className="map2x-section__head">
          <div>
            <div className="map2x-eyebrow map2x-eyebrow--accent map2x-section__eyebrow">— Platform guide</div>
            <h2 className="map2x-section__title">
              An open, educational platform for{' '}
              <span className="map2x-section__title-accent">real-time audio</span>.
            </h2>
          </div>
          <div className="map2x-section__sub-right">
            Four entry points into the deeper documentation. Each opens its own page; everything else remains a scroll
            away below.
          </div>
        </div>

        <div className="map2x-guide-grid">
          {GUIDE_CARDS.map((card) => (
            <a key={card.tag} className="map2x-guide-card" href={card.href}>
              <div className="map2x-eyebrow map2x-eyebrow--accent map2x-guide-card__tag">{card.tag}</div>
              <div className="map2x-guide-card__title">{card.title}</div>
              <div className="map2x-guide-card__body">{card.body}</div>
              <div className="map2x-guide-card__foot">
                <span className="map2x-mono map2x-guide-card__meta">{card.meta}</span>
                <span className="map2x-guide-card__open">
                  Open
                  <ArrowIcon />
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}

export const WelcomeHero = memo(WelcomeHeroImpl)
