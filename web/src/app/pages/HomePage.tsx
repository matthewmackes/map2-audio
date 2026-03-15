import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Pin, PinFilled, Renew } from '@carbon/icons-react'
import {
  MAP2_PLATFORM_META,
  MAP2_PLATFORM_NAME,
  MAP2_PRIMARY_LABEL,
} from '../components/branding/map2Branding'
import { resolveHomeCardProfile } from '../data/homeCardProfiles'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import {
  homeNavigationSections,
  MAX_PINNED_NAV_ITEMS,
  navigationMaturityMeta,
  normalizePinnedRoutes,
  pinnableNavigationItems,
  type AdvancedMenuItem,
  type HardwareInterfaceMenuItem,
  type NavigationHomeSection,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { isBlockedAdvancedMenuItem } from '../layout/advancedMenuState'
import './HomePage.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type HomeNavigationItem = ShellNavigationItem | HardwareInterfaceMenuItem

interface ClusterTile {
  id: string
  hostname: string
  ip: string
  status: 'online' | 'degraded' | 'offline' | 'updating' | 'maintenance'
  role: string
  healthScore: number
  cpuRam: string
  audioDevices: string[]
  version: string
  lastSeenSeconds: number
  isLocal: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePinnedRoutes(routes: string[] | null | undefined): string[] {
  const requested = normalizePinnedRoutes(routes)
  return pinnableNavigationItems
    .filter((item) => item.to !== '/' && requested.includes(item.to))
    .map((item) => item.to)
    .slice(0, MAX_PINNED_NAV_ITEMS)
}

function isBlockedHomeItem(item: HomeNavigationItem): boolean {
  return 'includeInAdvancedMenu' in item
    ? isBlockedAdvancedMenuItem(item as AdvancedMenuItem)
    : false
}

function parseLastSeenSeconds(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000))
}

function statusDotClass(status: ClusterTile['status']): string {
  return `hp-hero__node-dot hp-hero__node-dot--${status}`
}

function clusterDotClass(status: ClusterTile['status']): string {
  const colors: Record<ClusterTile['status'], string> = {
    online: '#24a148',
    degraded: '#f1c21b',
    offline: '#da1e28',
    updating: '#4589ff',
    maintenance: '#525252',
  }
  return colors[status] ?? '#525252'
}

// ── Main Component ────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()

  const pinnedRoutes = useMemo(
    () => resolvePinnedRoutes(specialSettings?.pinnedRoutes),
    [specialSettings?.pinnedRoutes],
  )
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])

  const [activeSection, setActiveSection] = useState<NavigationHomeSection>(
    homeNavigationSections[0]?.title ?? 'System',
  )
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const [tiles, setTiles] = useState<ClusterTile[]>([])
  const [tilesLoading, setTilesLoading] = useState(true)
  const [tilesError, setTilesError] = useState<string | null>(null)
  const [clusterName, setClusterName] = useState('Local Node')

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadTiles = useCallback(async () => {
    setTilesLoading(true)
    setTilesError(null)
    try {
      const [summaryRes, peersRes, devicesRes] = await Promise.all([
        fetch('/api/cluster/admin/summary'),
        fetch('/api/peers'),
        fetch('/api/cluster/health/extended/devices'),
      ])
      const summary = summaryRes.ok ? await summaryRes.json() : null
      const peers = peersRes.ok ? await peersRes.json() : null
      const devices = devicesRes.ok ? await devicesRes.json() : null

      if (summary?.cluster_name) setClusterName(String(summary.cluster_name))

      const localNodeId =
        typeof peers?.local_node_id === 'string' ? peers.local_node_id : 'local-node'
      const localDevices = devices?.nodes?.[localNodeId] ?? null
      const localAudioDevices: string[] = Array.isArray(localDevices?.usb_audio_devices)
        ? localDevices.usb_audio_devices.map((d: unknown) => {
            if (typeof d === 'string') return d
            if (d && typeof d === 'object' && 'name' in d)
              return String((d as { name: unknown }).name)
            return 'Audio device'
          })
        : ['Audio device unavailable']

      const tileList: ClusterTile[] = [
        {
          id: localNodeId,
          hostname: window.location.hostname || 'localhost',
          ip: '127.0.0.1',
          status: summary?.online_nodes ? 'online' : 'degraded',
          role: 'LOCAL-NODE',
          healthScore: Math.round(Number(summary?.overall_health ?? 82)),
          cpuRam: `${navigator.hardwareConcurrency || 4} cores · ${Math.max(4, Math.round(Number(localDevices?.memory_gb) || 16))} GB`,
          audioDevices: localAudioDevices,
          version: 'MAP2',
          lastSeenSeconds: 0,
          isLocal: true,
        },
      ]

      if (Array.isArray(peers?.peers)) {
        peers.peers.forEach((peer: Record<string, unknown>) => {
          const nodeId = String(peer.node_id ?? `peer-${tileList.length + 1}`)
          const peerDevices = devices?.nodes?.[nodeId] ?? null
          const peerAudio: string[] = Array.isArray(peerDevices?.usb_audio_devices)
            ? peerDevices.usb_audio_devices.map((d: unknown) => {
                if (typeof d === 'string') return d
                if (d && typeof d === 'object' && 'name' in d)
                  return String((d as { name: unknown }).name)
                return 'Audio device'
              })
            : ['No devices reported']

          const latency = typeof peer.latency_ms === 'number' ? peer.latency_ms : null
          const status: ClusterTile['status'] =
            latency == null ? 'offline' : latency > 180 ? 'degraded' : 'online'

          tileList.push({
            id: nodeId,
            hostname: String(peer.node_id ?? nodeId),
            ip: String(peer.host ?? 'unknown'),
            status,
            role: String(peer.node_mode ?? 'AUDIO-NODE').toUpperCase(),
            healthScore: status === 'offline' ? 25 : status === 'degraded' ? 58 : 88,
            cpuRam: `${navigator.hardwareConcurrency || 4} cores · ${Math.max(4, Math.round(Number(peerDevices?.memory_gb) || 16))} GB`,
            audioDevices: peerAudio,
            version: 'MAP2',
            lastSeenSeconds: parseLastSeenSeconds(
              typeof peer.last_seen === 'string' ? peer.last_seen : null,
            ),
            isLocal: false,
          })
        })
      }

      setTiles(tileList)
    } catch (err) {
      setTilesError(err instanceof Error ? err.message : 'Cluster status unavailable')
    } finally {
      setTilesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTiles()
    const timer = window.setInterval(() => void loadTiles(), 10_000)
    return () => window.clearInterval(timer)
  }, [loadTiles])

  // ── Pin toggling ────────────────────────────────────────────────────────────

  const handleTogglePin = async (item: HomeNavigationItem, checked: boolean) => {
    if (!item.pinnable) return
    if (!checked) {
      await updateSpecialSettings({ pinnedRoutes: pinnedRoutes.filter((r) => r !== item.to) })
      return
    }
    if (!pinnedRouteSet.has(item.to) && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS) return
    const candidateSet = new Set([...pinnedRoutes, item.to])
    const nextRoutes = pinnableNavigationItems
      .filter((c) => c.to !== '/' && candidateSet.has(c.to))
      .map((c) => c.to)
      .slice(0, MAX_PINNED_NAV_ITEMS)
    await updateSpecialSettings({ pinnedRoutes: nextRoutes })
  }

  // ── Active section cards ────────────────────────────────────────────────────

  const activeCards = useMemo(() => {
    const section = homeNavigationSections.find((s) => s.title === activeSection)
    return section?.items ?? []
  }, [activeSection])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="hp-root">
      {/* ══════════════════════════════════════════════════════════
          HERO — MAP2-BANNER.png full-bleed + scanline effects
          ══════════════════════════════════════════════════════════ */}
      <header className="hp-hero">
        {/* Background banner image */}
        <img
          className="hp-hero__img"
          src="/MAP2-BANNER.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />

        {/* Vignette overlay */}
        <div className="hp-hero__vignette" aria-hidden="true" />

        {/* Bottom fade to page bg */}
        <div className="hp-hero__bottom-fade" aria-hidden="true" />

        {/* Scanline shimmer */}
        <div className="hp-hero__scanlines" aria-hidden="true" />

        {/* Version badge — bottom right */}
        <div className="hp-hero__version-badge" aria-label="Platform version">
          {MAP2_PLATFORM_META}
        </div>

        {/* Hero copy + cluster status */}
        <div className="hp-hero__inner">
          <div className="hp-hero__copy">
            <p className="hp-hero__eyebrow">{MAP2_PRIMARY_LABEL}</p>
            <h1 className="hp-hero__title">{MAP2_PLATFORM_NAME}</h1>
            <p className="hp-hero__summary">
              Unified routing, control, and node orchestration across the full Mackes Audio Platform.
            </p>
          </div>

          {/* Live cluster node strip */}
          <div className="hp-hero__cluster" aria-label="Cluster node status">
            <span className="hp-hero__cluster-label">
              {tiles.length > 1 ? 'MAP2 Cluster' : 'MAP2 Node'} · {clusterName}
            </span>

            <div className="hp-hero__nodes">
              {tilesLoading && (
                <>
                  <span className="hp-hero__node hp-hero__node--skeleton" aria-hidden="true" />
                  <span className="hp-hero__node hp-hero__node--skeleton" aria-hidden="true" />
                </>
              )}

              {!tilesLoading &&
                tiles.map((tile) => (
                  <button
                    key={`hero-node-${tile.id}`}
                    type="button"
                    className="hp-hero__node"
                    onClick={() => navigate('/cluster-dashboard')}
                    title={`${tile.hostname} · ${tile.status}`}
                  >
                    <span
                      className={statusDotClass(tile.status)}
                      style={{ background: clusterDotClass(tile.status) }}
                      aria-label={tile.status}
                    />
                    <span className="hp-hero__node-name">{tile.hostname}</span>
                    <span className="hp-hero__node-score">{tile.healthScore}%</span>
                  </button>
                ))}
            </div>

            <button
              type="button"
              className="hp-hero__cluster-refresh"
              onClick={() => void loadTiles()}
              aria-label="Refresh cluster status"
            >
              <Renew size={14} aria-hidden />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          CONTENT AREA
          ══════════════════════════════════════════════════════════ */}
      <main className="hp-content">

        {/* ── Section tab bar ─────────────────────────────────── */}
        <nav className="hp-tabs" aria-label="Navigation sections">
          <div className="hp-tabs__list" role="tablist">
            {homeNavigationSections.map((section) => (
              <button
                key={section.title}
                type="button"
                role="tab"
                className={`hp-tabs__btn${activeSection === section.title ? ' is-active' : ''}`}
                aria-selected={activeSection === section.title}
                onClick={() => {
                  setActiveSection(section.title)
                  setExpandedCardId(null)
                }}
              >
                {section.title}
                <span className="hp-tabs__count">{section.items.length}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ── Section header ──────────────────────────────────── */}
        <div className="hp-section-header" role="region" aria-label={`${activeSection} interfaces`}>
          <h2>{activeSection} Interfaces</h2>
          <span className="hp-section-count">
            {activeCards.length} interface{activeCards.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── 4-up card grid ──────────────────────────────────── */}
        <div
          className="hp-card-grid"
          role="list"
          aria-label={`${activeSection} navigation cards`}
        >
          {activeCards.map((item) => {
            const cardId = `${item.to}-${item.label}`
            const isBlocked = isBlockedHomeItem(item)
            const isPinned = pinnedRouteSet.has(item.to)
            const limitReached = !isPinned && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS
            const pinDisabled = specialSettingsLoading || !item.pinnable || limitReached
            const maturityMeta = navigationMaturityMeta[item.maturity]
            const profile = resolveHomeCardProfile(item)
            const isExpanded = expandedCardId === cardId
            const Icon = item.icon

            return (
              <article
                key={cardId}
                role="listitem"
                className={`hp-card${isBlocked ? ' is-blocked' : ''}`}
                onClick={() => {
                  if (!isBlocked) navigate(item.to)
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !isBlocked) {
                    e.preventDefault()
                    navigate(item.to)
                  }
                }}
                tabIndex={0}
                aria-label={`Open ${item.label}`}
              >
                {/* Pin button */}
                <button
                  type="button"
                  className={`hp-card__pin-btn${isPinned ? ' is-pinned' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!pinDisabled) void handleTogglePin(item, !isPinned)
                  }}
                  title={
                    !item.pinnable
                      ? 'Cannot be pinned'
                      : limitReached
                        ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned`
                        : isPinned
                          ? 'Unpin from navigation'
                          : 'Pin to navigation'
                  }
                  aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                  aria-pressed={isPinned}
                  disabled={pinDisabled}
                >
                  {isPinned ? <PinFilled size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
                </button>

                {/* Icon */}
                <Icon className="hp-card__icon" aria-hidden />

                {/* Maturity badge */}
                <span
                  className={`hp-card__maturity hp-card__maturity--${item.maturity}`}
                  title={maturityMeta.description}
                >
                  {maturityMeta.label}
                </span>

                {/* Label */}
                <h3 className="hp-card__label">{item.label}</h3>

                {/* Description */}
                <p className="hp-card__desc">{item.description}</p>

                {/* Footer actions */}
                <div className="hp-card__footer">
                  <button
                    type="button"
                    className="hp-card__open-btn"
                    disabled={isBlocked}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isBlocked) navigate(item.to)
                    }}
                  >
                    Open Interface
                  </button>

                  <button
                    type="button"
                    className="hp-card__details-btn"
                    aria-expanded={isExpanded}
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedCardId((current) => (current === cardId ? null : cardId))
                    }}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp size={14} aria-hidden /> Less
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} aria-hidden /> Details
                      </>
                    )}
                  </button>
                </div>

                {/* Expandable detail panel */}
                {isExpanded && (
                  <div className="hp-card__detail-panel" role="note">
                    <div>
                      <p className="hp-card__detail-heading">Capabilities</p>
                      <ul className="hp-card__detail-list">
                        {profile.capabilities.slice(0, 4).map((cap) => (
                          <li key={`${cardId}-${cap}`}>{cap}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="hp-card__detail-heading">Workflow notes</p>
                      <p className="hp-card__detail-body">{profile.learnMore}</p>
                    </div>

                    <div>
                      <p className="hp-card__best-for-label">Best for</p>
                      <p className="hp-card__best-for-value">{profile.bestFor}</p>
                    </div>

                    {item.gatedReason && (
                      <p className="hp-card__detail-body" style={{ color: '#ffd7d9' }}>
                        {item.gatedReason}
                      </p>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════
            CLUSTER NODE TILES SECTION
            ══════════════════════════════════════════════════════════ */}
        <section className="hp-cluster-section" aria-label="Cluster node status">
          <div className="hp-cluster-header">
            <h2>{tiles.length > 1 ? 'MAP2 Cluster' : 'MAP2 Node Status'}</h2>
            <button
              type="button"
              className="hp-cluster-refresh-btn"
              onClick={() => void loadTiles()}
            >
              <Renew size={14} aria-hidden />
              Refresh
            </button>
          </div>

          {tilesLoading && (
            <div className="hp-cluster-grid">
              {[0, 1, 2, 3].map((i) => (
                <div key={`sk-${i}`} className="hp-cluster-tile hp-cluster-tile--skeleton" />
              ))}
            </div>
          )}

          {tilesError && !tilesLoading && (
            <div className="hp-cluster-error">
              <span>Cluster status unavailable — {tilesError}</span>
              <button
                type="button"
                className="hp-cluster-error__retry"
                onClick={() => void loadTiles()}
              >
                Retry
              </button>
            </div>
          )}

          {!tilesLoading && !tilesError && (
            <div className="hp-cluster-grid">
              {tiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className={`hp-cluster-tile${tile.isLocal ? ' is-local' : ''}`}
                  onClick={() => navigate('/cluster-dashboard')}
                >
                  <div className="hp-cluster-tile__head">
                    <span
                      className="hp-cluster-tile__dot"
                      style={{ background: clusterDotClass(tile.status) }}
                      aria-label={tile.status}
                    />
                    <div>
                      <div className="hp-cluster-tile__hostname">{tile.hostname}</div>
                      <div className="hp-cluster-tile__ip">{tile.ip}</div>
                    </div>
                    {tile.isLocal && (
                      <span className="hp-cluster-tile__local-badge">This node</span>
                    )}
                  </div>

                  <div className="hp-cluster-tile__role">{tile.role}</div>

                  <div
                    className="hp-cluster-tile__bar-track"
                    role="progressbar"
                    aria-valuenow={tile.healthScore}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Health ${tile.healthScore}%`}
                  >
                    <span
                      className="hp-cluster-tile__bar-fill"
                      style={{ width: `${Math.max(4, Math.min(100, tile.healthScore))}%` }}
                    />
                  </div>

                  <div className="hp-cluster-tile__meta">{tile.cpuRam}</div>
                  <div className="hp-cluster-tile__meta">
                    {tile.audioDevices.slice(0, 2).join(' · ')}
                  </div>
                  <div className="hp-cluster-tile__meta">
                    {tile.version} · last seen {tile.lastSeenSeconds}s ago
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default HomePage
