import { memo, useMemo, type CSSProperties, type MouseEvent, type ReactElement } from 'react'
import mapWordmark from '../../../../../branding/MAP-LOGO-2026.png'
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

type IconProps = { name: 'midi' | 'audio' | 'arrow' | 'book' }

const ICON_PATHS: Record<IconProps['name'], string[]> = {
  midi: ['M4 8v8', 'M20 8v8', 'M8 6v12', 'M12 6v12', 'M16 6v12'],
  audio: ['M3 12h3l3-7 3 14 3-10 3 5h3'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  book: ['M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z', 'M4 4v12a4 4 0 004 4'],
}

function Icon({ name }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" aria-hidden>
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

function formatCount(count: number): string {
  return Number.isFinite(count) ? count.toLocaleString() : '—'
}

function buildLede(
  totalArtifacts: number,
  midiLive: number,
  audioLive: number,
): ReactElement {
  return (
    <>
      Your studio is warmed up and every device is reporting in.{' '}
      <b>{formatCount(totalArtifacts)}</b> artifacts are loaded in the library,{' '}
      <b>
        {midiLive} MIDI {midiLive === 1 ? 'controller' : 'controllers'}
      </b>{' '}
      and{' '}
      <b>
        {audioLive} audio {audioLive === 1 ? 'interface' : 'interfaces'}
      </b>{' '}
      are live on the bus, and the routing matrix is holding steady at sub‑millisecond latency. Pick up where you left off, or start something new — the whole rig is yours.
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

  const hardwareRows = useMemo<WelcomeHeroHardwareDevice[]>(() => {
    const midiRows = midiDevices.slice(0, 2)
    const audioRows = audioDevices.slice(0, 3)
    return [...midiRows, ...audioRows]
  }, [midiDevices, audioDevices])

  const liveHardwareCount = hardwareCounts.midiLive + hardwareCounts.cardsLive

  return (
    <section className="wh-shell" aria-label="MAP2 welcome hero" data-testid="welcome-hero">
      {/* ---------- topbar ---------- */}
      <div className="wh-topbar">
        <div className="wh-topbar__left">
          <span className="wh-topbar__dot" aria-hidden />
          <span>MAP2 · Live Operations Surface</span>
          <span className="wh-topbar__sep" aria-hidden>·</span>
          <span>node · {topbar.nodeLabel}</span>
        </div>
        <div className="wh-topbar__right">
          <span>
            v <b>{topbar.versionLabel}</b>
          </span>
          <span>
            sr <b>{topbar.sampleRateLabel}</b>
          </span>
          <span>
            buf <b>{topbar.bufferLabel}</b>
          </span>
          <span>
            cpu <b>{topbar.cpuLabel}</b>
          </span>
        </div>
      </div>

      {/* ---------- hero ---------- */}
      <div className="wh-hero">
        <div className="wh-hero__grid" aria-hidden />
        <div className="wh-hero__glow" aria-hidden />
        <div className="wh-hero__wordmark" aria-hidden>
          <img src={mapWordmark} alt="" />
        </div>

        <div className="wh-hero__content">
          <div className="wh-hero__eyebrow">WELCOME TO MAP2 · MACKES AUDIO PLATFORM</div>

          <h1 className="wh-hero__title">
            <span>System nominal.</span>{' '}
            <span className="wh-accent">Welcome to MAP2.</span>
          </h1>

          <p className="wh-hero__lede">
            {buildLede(totalArtifacts, hardwareCounts.midiLive, hardwareCounts.cardsLive)}
          </p>

          <div className="wh-hero__cta-row">
            <button
              type="button"
              className="wh-btn wh-btn--primary"
              onClick={onEnterLiveSurface}
              data-testid="welcome-hero-cta-enter"
            >
              Enter Live Surface <Icon name="arrow" />
            </button>
            <button
              type="button"
              className="wh-btn wh-btn--ghost"
              onClick={onBrowseLibrary}
              data-testid="welcome-hero-cta-library"
            >
              Browse Library <Icon name="book" />
            </button>
          </div>

          <div className="wh-hero__session">
            <div>
              <label>Last Session</label>
              <strong>{session.lastSessionLabel}</strong>
            </div>
            <div>
              <label>Open Patch</label>
              <strong>{session.openPatchLabel}</strong>
            </div>
            <div>
              <label>Uptime</label>
              <strong>{session.uptimeLabel}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- stats ---------- */}
      <div className="wh-stats">
        <section className="wh-panel" aria-label="Artifact library">
          <header className="wh-panel__head">
            <h2 className="wh-panel__title">
              Artifact Library · {formatCount(totalArtifacts)} total
            </h2>
            <div className="wh-panel__kicker">
              <b>● indexed</b> · {librarianScanLabel}
            </div>
          </header>

          <div className="wh-artifacts">
            {artifacts.map((artifact) => {
              const style = { '--wh-accent': artifact.accent } as CSSProperties
              const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation()
                onArtifactClick?.(artifact)
              }
              return (
                <button
                  type="button"
                  key={artifact.key}
                  className="wh-artifact"
                  style={style}
                  onClick={handleClick}
                  data-artifact={artifact.key}
                >
                  <div className="wh-artifact__count">
                    {formatCount(artifact.count)}
                    {artifact.unit ? <small>{artifact.unit}</small> : null}
                  </div>
                  <div className="wh-artifact__label">{artifact.label}</div>
                  <div className="wh-artifact__sub">{artifact.sub}</div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="wh-panel" aria-label="Hardware ready">
          <header className="wh-panel__head">
            <h2 className="wh-panel__title">Hardware · Ready to Play</h2>
            <div className="wh-panel__kicker">
              <b>● {liveHardwareCount} live</b>
            </div>
          </header>

          <div className="wh-hw-summary">
            <button
              type="button"
              className="wh-hw-summary__tile"
              style={{ '--wh-accent': 'var(--wh-primary)' } as CSSProperties}
              onClick={() => onHardwareSummaryClick?.('midi')}
              aria-label="MIDI devices summary"
            >
              <div className="wh-hw-summary__count">
                {hardwareCounts.midiLive}
                <span className="wh-hw-summary__count-frac">/{hardwareCounts.midiTotal}</span>
              </div>
              <div className="wh-hw-summary__label">MIDI Devices</div>
              <div className="wh-hw-summary__sub">controllers · foot · sequencers</div>
            </button>
            <button
              type="button"
              className="wh-hw-summary__tile"
              style={{ '--wh-accent': 'var(--wh-accent-teal)' } as CSSProperties}
              onClick={() => onHardwareSummaryClick?.('audio')}
              aria-label="Audio interfaces summary"
            >
              <div className="wh-hw-summary__count">
                {hardwareCounts.cardsLive}
                <span className="wh-hw-summary__count-frac">/{hardwareCounts.cardsTotal}</span>
              </div>
              <div className="wh-hw-summary__label">Audio Interfaces</div>
              <div className="wh-hw-summary__sub">
                {hardwareCounts.aggregateIoChannels > 0
                  ? `${hardwareCounts.aggregateIoChannels}‑channel aggregate I/O`
                  : 'connected interface inventory'}
              </div>
            </button>
          </div>

          <div className="wh-hw-list">
            {hardwareRows.map((device) => {
              const accent = device.kind === 'midi' ? 'var(--wh-primary)' : 'var(--wh-accent-teal)'
              const style = { '--wh-accent': accent } as CSSProperties
              return (
                <button
                  type="button"
                  key={device.id}
                  className="wh-hw-row"
                  style={style}
                  onClick={() => onHardwareClick?.(device)}
                  aria-label={`${device.name} — ${device.status === 'standby' ? 'standby' : 'live'}`}
                >
                  <div className="wh-hw-row__icon">
                    <Icon name={device.kind === 'midi' ? 'midi' : 'audio'} />
                  </div>
                  <div className="wh-hw-row__body">
                    <strong>{device.name}</strong>
                    <span>{device.port}</span>
                  </div>
                  <div
                    className={`wh-hw-row__status${device.status === 'standby' ? ' wh-standby' : ''}`}
                  >
                    <span className="wh-dot" aria-hidden />
                    {device.status === 'standby' ? 'Standby' : 'Live'}
                  </div>
                </button>
              )
            })}
            {hardwareRows.length === 0 ? (
              <div className="wh-hw-row" aria-live="polite">
                <div className="wh-hw-row__icon">
                  <Icon name="audio" />
                </div>
                <div className="wh-hw-row__body">
                  <strong>No hardware reporting</strong>
                  <span>Connect a MIDI or audio device to light this up</span>
                </div>
                <div className="wh-hw-row__status wh-standby">
                  <span className="wh-dot" aria-hidden />
                  Standby
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* ---------- footer ribbon ---------- */}
      <div className="wh-ribbon" role="group" aria-label="Platform status ribbon">
        {ribbon.map((item) => {
          const valueClass = item.tone === 'ok' ? 'wh-ok' : ''
          if (item.route && onRibbonClick) {
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onRibbonClick(item)}
                data-ribbon={item.id}
              >
                {item.label} · <b className={valueClass}>{item.value}</b>
              </button>
            )
          }
          return (
            <div key={item.id} data-ribbon={item.id}>
              {item.label} · <b className={valueClass}>{item.value}</b>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export const WelcomeHero = memo(WelcomeHeroImpl)
export default WelcomeHero
