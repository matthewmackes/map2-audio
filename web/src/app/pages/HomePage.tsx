import type { CSSProperties, KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Idea, Pin, PinFilled } from '@carbon/icons-react'
import {
  MAP2_PLATFORM_META,
  MAP2_PLATFORM_NAME,
  MAP2_PRIMARY_LABEL,
  Map2BrandMark,
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
import { resolvePoster } from './posterManifest'
import './posterFallbacks.css'
import './HomePage.css'

type HomeNavigationItem = ShellNavigationItem | HardwareInterfaceMenuItem

interface HomeCard {
  item: HomeNavigationItem
  sectionTitle: NavigationHomeSection
  posterSlug: string
  temperature: 'warm' | 'cool' | 'neutral'
  profile: ReturnType<typeof resolveHomeCardProfile>
}

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

function resolvePinnedRoutes(routes: string[] | null | undefined): string[] {
  const requestedRoutes = normalizePinnedRoutes(routes)
  return pinnableNavigationItems
    .filter((item) => item.to !== '/' && requestedRoutes.includes(item.to))
    .map((item) => item.to)
    .slice(0, MAX_PINNED_NAV_ITEMS)
}

function isBlockedHomeItem(item: HomeNavigationItem): boolean {
  return 'includeInAdvancedMenu' in item ? isBlockedAdvancedMenuItem(item as AdvancedMenuItem) : false
}

function flattenAllCards(): HomeCard[] {
  const cards: HomeCard[] = []
  for (const section of homeNavigationSections) {
    for (const item of section.items) {
      const poster = resolvePoster(item.to, item.label)
      cards.push({
        item,
        sectionTitle: section.title,
        posterSlug: poster.slug,
        temperature: poster.temperature,
        profile: resolveHomeCardProfile(item),
      })
    }
  }
  return cards
}

function statusDotColor(status: ClusterTile['status']): string {
  switch (status) {
    case 'online':
      return '#24a148'
    case 'degraded':
      return '#f1c21b'
    case 'offline':
      return '#da1e28'
    case 'updating':
      return '#4589ff'
    case 'maintenance':
      return '#8d8d8d'
    default:
      return '#8d8d8d'
  }
}

function parseLastSeenSeconds(value: string | null | undefined): number {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000))
}

function computeTheme(section: NavigationHomeSection): CSSProperties {
  if (section === 'System' || section === 'Hardware') {
    return {
      '--home-temp-accent': '#0f62fe',
      '--home-temp-soft': 'rgba(15, 98, 254, 0.2)',
      '--home-temp-glow': 'rgba(120, 169, 255, 0.24)',
    } as CSSProperties
  }

  if (section === 'AVB') {
    return {
      '--home-temp-accent': '#42be65',
      '--home-temp-soft': 'rgba(66, 190, 101, 0.2)',
      '--home-temp-glow': 'rgba(111, 220, 140, 0.22)',
    } as CSSProperties
  }

  return {
    '--home-temp-accent': '#4589ff',
    '--home-temp-soft': 'rgba(69, 137, 255, 0.2)',
    '--home-temp-glow': 'rgba(166, 200, 255, 0.22)',
  } as CSSProperties
}

export function HomePage() {
  const navigate = useNavigate()
  const { settings: specialSettings, isLoading: specialSettingsLoading, updateSettings: updateSpecialSettings } = useSpecialSettings()

  const pinnedRoutes = useMemo(() => resolvePinnedRoutes(specialSettings?.pinnedRoutes), [specialSettings?.pinnedRoutes])
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])

  const allCards = useMemo(() => flattenAllCards(), [])
  const [activeSection, setActiveSection] = useState<NavigationHomeSection>(homeNavigationSections[0]?.title ?? 'System')
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [stickyCompact, setStickyCompact] = useState(false)
  const [failedPosterSlugs, setFailedPosterSlugs] = useState<Set<string>>(new Set())
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const [tiles, setTiles] = useState<ClusterTile[]>([])
  const [tilesLoading, setTilesLoading] = useState(true)
  const [tilesError, setTilesError] = useState<string | null>(null)
  const [clusterName, setClusterName] = useState('Local Node')

  const carouselRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onScroll = () => {
      setStickyCompact(window.scrollY > 80)
    }

    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

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

      if (summary?.cluster_name) {
        setClusterName(String(summary.cluster_name))
      }

      const localNodeId = typeof peers?.local_node_id === 'string' ? peers.local_node_id : 'local-node'
      const localDevices = devices?.nodes?.[localNodeId] ?? null
      const localAudioDevices: string[] = Array.isArray(localDevices?.usb_audio_devices)
        ? localDevices.usb_audio_devices.map((device: unknown) => {
            if (typeof device === 'string') return device
            if (device && typeof device === 'object' && 'name' in device) {
              return String((device as { name: unknown }).name)
            }
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
          cpuRam: `${navigator.hardwareConcurrency || 4} cores · ${Math.max(4, Math.round((Number(localDevices?.memory_gb) || 16)))} GB`,
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
          const peerAudioDevices: string[] = Array.isArray(peerDevices?.usb_audio_devices)
            ? peerDevices.usb_audio_devices.map((device: unknown) => {
                if (typeof device === 'string') return device
                if (device && typeof device === 'object' && 'name' in device) {
                  return String((device as { name: unknown }).name)
                }
                return 'Audio device'
              })
            : ['No devices reported']

          const latency = typeof peer.latency_ms === 'number' ? peer.latency_ms : null
          const status: ClusterTile['status'] = latency == null ? 'offline' : latency > 180 ? 'degraded' : 'online'
          const healthScore = status === 'offline' ? 25 : status === 'degraded' ? 58 : 88

          tileList.push({
            id: nodeId,
            hostname: String(peer.node_id ?? nodeId),
            ip: String(peer.host ?? 'unknown'),
            status,
            role: String(peer.node_mode ?? 'AUDIO-NODE').toUpperCase(),
            healthScore,
            cpuRam: `${navigator.hardwareConcurrency || 4} cores · ${Math.max(4, Math.round((Number(peerDevices?.memory_gb) || 16)))} GB`,
            audioDevices: peerAudioDevices,
            version: 'MAP2',
            lastSeenSeconds: parseLastSeenSeconds(typeof peer.last_seen === 'string' ? peer.last_seen : null),
            isLocal: false,
          })
        })
      }

      setTiles(tileList)
    } catch (loadError) {
      setTilesError(loadError instanceof Error ? loadError.message : 'Cluster status unavailable')
    } finally {
      setTilesLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTiles()
    const timer = window.setInterval(() => {
      void loadTiles()
    }, 10_000)

    return () => window.clearInterval(timer)
  }, [loadTiles])

  const filteredCards = useMemo(() => {
    return allCards.filter((card) => card.sectionTitle === activeSection)
  }, [activeSection, allCards])

  useEffect(() => {
    setActiveCardIndex(0)
    setExpandedCardId(null)
  }, [activeSection])

  useEffect(() => {
    setActiveCardIndex((current) => {
      if (filteredCards.length === 0) {
        return 0
      }
      if (current < filteredCards.length) {
        return current
      }
      return filteredCards.length - 1
    })
  }, [filteredCards.length])

  const activeCard = filteredCards[activeCardIndex] ?? filteredCards[0] ?? null

  const scrollToCard = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const viewport = carouselRef.current
      const maxIndex = Math.max(0, filteredCards.length - 1)
      const nextIndex = Math.min(Math.max(index, 0), maxIndex)

      if (!viewport) {
        setActiveCardIndex(nextIndex)
        return
      }

      const width = viewport.clientWidth || 1
      const left = width * nextIndex
      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({ left, behavior })
      } else {
        viewport.scrollLeft = left
      }
      setActiveCardIndex(nextIndex)
    },
    [filteredCards.length],
  )

  useEffect(() => {
    scrollToCard(0, 'auto')
  }, [activeSection, scrollToCard])

  useEffect(() => {
    const viewport = carouselRef.current
    if (!viewport) {
      return
    }

    let raf = 0
    const handleScroll = () => {
      if (raf) {
        window.cancelAnimationFrame(raf)
      }

      raf = window.requestAnimationFrame(() => {
        const width = viewport.clientWidth || 1
        const nextIndex = Math.min(filteredCards.length - 1, Math.max(0, Math.round(viewport.scrollLeft / width)))
        setActiveCardIndex((current) => (current === nextIndex ? current : nextIndex))
      })
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      if (raf) {
        window.cancelAnimationFrame(raf)
      }
    }
  }, [filteredCards.length])

  useEffect(() => {
    const handleResize = () => {
      scrollToCard(activeCardIndex, 'auto')
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [activeCardIndex, scrollToCard])

  const handleTogglePin = async (item: HomeNavigationItem, checked: boolean) => {
    if (!item.pinnable) {
      return
    }

    if (!checked) {
      await updateSpecialSettings({ pinnedRoutes: pinnedRoutes.filter((route) => route !== item.to) })
      return
    }

    if (!pinnedRouteSet.has(item.to) && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS) {
      return
    }

    const candidateSet = new Set([...pinnedRoutes, item.to])
    const nextRoutes = pinnableNavigationItems
      .filter((candidate) => candidate.to !== '/' && candidateSet.has(candidate.to))
      .map((candidate) => candidate.to)
      .slice(0, MAX_PINNED_NAV_ITEMS)

    await updateSpecialSettings({ pinnedRoutes: nextRoutes })
  }

  const navigateToCard = (card: HomeCard) => {
    navigate(card.item.to)
  }

  const nextCard = () => {
    if (filteredCards.length <= 1) {
      return
    }
    const nextIndex = (activeCardIndex + 1) % filteredCards.length
    scrollToCard(nextIndex)
  }

  const previousCard = () => {
    if (filteredCards.length <= 1) {
      return
    }
    const nextIndex = activeCardIndex === 0 ? filteredCards.length - 1 : activeCardIndex - 1
    scrollToCard(nextIndex)
  }

  const handleCarouselKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      nextCard()
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      previousCard()
      return
    }

    if (event.key === 'Enter' && activeCard) {
      event.preventDefault()
      navigateToCard(activeCard)
    }
  }

  const stickyStatusDots = tiles.slice(0, 4)
  const themeStyle = computeTheme(activeSection)

  return (
    <div className="home-cinematic-page" style={themeStyle}>
      <div className={`home-cinematic-sticky${stickyCompact ? ' is-compact' : ''}`}>
        <div className="home-cinematic-sticky__brand">MAP2 · {clusterName}</div>
        <div className="home-cinematic-sticky__dots">
          {stickyStatusDots.map((tile) => (
            <span
              key={`sticky-${tile.id}`}
              className="home-cinematic-sticky__dot"
              style={{ background: statusDotColor(tile.status) }}
              title={`${tile.hostname} ${tile.status}`}
            />
          ))}
        </div>
      </div>

      <section className="home-cinematic-panel">
        <div className="home-cinematic-banner">
          <div className="home-cinematic-banner__background-brand" aria-hidden="true">
            <Map2BrandMark className="home-cinematic-banner__background-mark" />
          </div>
          <div className="home-cinematic-banner__overlay" />
          <div className="home-cinematic-banner__headline">
            <div className="home-cinematic-banner__hero-mark" aria-hidden="true">
              <Map2BrandMark className="home-cinematic-banner__hero-mark-svg" />
            </div>
            <div className="home-cinematic-banner__copy">
              <p className="home-cinematic-banner__eyebrow">{MAP2_PRIMARY_LABEL}</p>
              <div className="home-cinematic-banner__title-row">
                <h1>{MAP2_PLATFORM_NAME}</h1>
              </div>
              <p className="home-cinematic-banner__summary">
                Unified routing, control, and node orchestration across the full Mackes Audio Platform.
              </p>
              <div className="home-cinematic-banner__meta">
                <span>{MAP2_PLATFORM_META}</span>
                <span>{clusterName || 'Local Node'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="home-cinematic-content">
          <section className="home-cinematic-tiles" aria-label="Cluster node status">
            <header className="home-cinematic-section-header">
              <h2>{tiles.length > 1 ? 'MAP2 Cluster' : 'MAP2 Node Status'}</h2>
              <button type="button" onClick={() => void loadTiles()}>Refresh</button>
            </header>

            {tilesLoading && (
              <div className="home-cinematic-tiles__skeletons">
                {[0, 1, 2].map((index) => (
                  <div key={`skeleton-${index}`} className="home-cinematic-tile home-cinematic-tile--skeleton" />
                ))}
              </div>
            )}

            {tilesError && (
              <div className="home-cinematic-tiles__error">
                Cluster status unavailable.
                <button type="button" onClick={() => void loadTiles()}>Retry</button>
              </div>
            )}

            {!tilesLoading && !tilesError && (
              <div className="home-cinematic-tiles__row">
                {tiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    className={`home-cinematic-tile${tile.isLocal ? ' is-local' : ''}`}
                    onClick={() => navigate('/cluster-dashboard')}
                  >
                    <div className="home-cinematic-tile__head">
                      <span className="home-cinematic-tile__status" style={{ background: statusDotColor(tile.status) }} />
                      <div>
                        <strong>{tile.hostname}</strong>
                        <p>{tile.ip}</p>
                      </div>
                      {tile.isLocal && <span className="home-cinematic-tile__local">This node</span>}
                    </div>

                    <div className="home-cinematic-tile__role">{tile.role}</div>

                    <div className="home-cinematic-tile__bar-track">
                      <span className="home-cinematic-tile__bar-fill" style={{ width: `${Math.max(4, Math.min(100, tile.healthScore))}%` }} />
                    </div>

                    <div className="home-cinematic-tile__meta">{tile.cpuRam}</div>
                    <div className="home-cinematic-tile__meta home-cinematic-tile__devices">{tile.audioDevices.slice(0, 2).join(' · ')}</div>
                    <div className="home-cinematic-tile__meta">{tile.version} · last seen {tile.lastSeenSeconds}s ago</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="home-cinematic-nav" aria-label="Category navigation">
            <div className="home-cinematic-nav__pills">
              {homeNavigationSections.map((section) => (
                <button
                  key={section.title}
                  type="button"
                  className={`home-cinematic-nav__pill${activeSection === section.title ? ' is-active' : ''}`}
                  onClick={() => setActiveSection(section.title)}
                >
                  {section.title}
                </button>
              ))}
            </div>
          </section>

          <section className="home-cinematic-strip" aria-label="Spotlight navigation strip">
            <header className="home-cinematic-section-header home-cinematic-section-header--spotlight">
              <h2>{activeSection} Spotlight</h2>
              <div className="home-spotlight-controls">
                <span className="home-spotlight-controls__counter">
                  {filteredCards.length === 0 ? '0/0' : `${activeCardIndex + 1}/${filteredCards.length}`}
                </span>
                <button type="button" className="home-spotlight-controls__arrow" onClick={previousCard} aria-label="Previous card">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="home-spotlight-controls__arrow" onClick={nextCard} aria-label="Next card">
                  <ChevronRight size={18} />
                </button>
              </div>
            </header>

            <div
              className="home-spotlight-viewport"
              tabIndex={0}
              ref={carouselRef}
              onKeyDown={handleCarouselKeyDown}
              aria-label="Home spotlight carousel"
            >
              {filteredCards.map((card, index) => {
                const cardId = `${card.item.to}-${card.item.label}`
                const isBlocked = isBlockedHomeItem(card.item)
                const checked = pinnedRouteSet.has(card.item.to)
                const limitReached = !checked && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS
                const pinDisabled = specialSettingsLoading || !card.item.pinnable || limitReached
                const maturityMeta = navigationMaturityMeta[card.item.maturity]
                const isExpanded = expandedCardId === cardId

                return (
                  <article
                    key={cardId}
                    className={`home-spotlight-card poster-fallback poster-fallback--${card.posterSlug}${isBlocked ? ' is-blocked' : ''}`}
                    aria-hidden={index !== activeCardIndex}
                  >
                    {!failedPosterSlugs.has(card.posterSlug) && (
                      <img
                        src={`/posters/${card.posterSlug}.webp`}
                        alt={`${card.item.label} poster`}
                        loading="lazy"
                        onError={() => {
                          setFailedPosterSlugs((prev) => {
                            const next = new Set(prev)
                            next.add(card.posterSlug)
                            return next
                          })
                        }}
                      />
                    )}

                    <div className="home-spotlight-card__shade" />

                    <div className="home-spotlight-card__content">
                      <div className="home-spotlight-card__main">
                        <div className="home-spotlight-card__meta">
                          <span className={`home-cinematic-card__temperature is-${card.temperature}`}>{card.sectionTitle}</span>
                          <span
                            className="home-spotlight-card__maturity"
                            style={{
                              '--maturity-surface': maturityMeta.surface,
                              '--maturity-border': maturityMeta.border,
                              '--maturity-accent': maturityMeta.accent,
                            } as CSSProperties}
                          >
                            {maturityMeta.label}
                          </span>
                        </div>

                        <h3>{card.item.label}</h3>
                        <p className="home-spotlight-card__summary">{card.profile.summary}</p>

                        <div className="home-spotlight-card__actions">
                          <button
                            type="button"
                            className="home-spotlight-card__btn home-spotlight-card__btn--primary"
                            disabled={isBlocked}
                            onClick={() => {
                              if (!isBlocked) {
                                navigateToCard(card)
                              }
                            }}
                          >
                            Open Interface
                          </button>

                          <button
                            type="button"
                            className="home-spotlight-card__btn home-spotlight-card__btn--secondary"
                            onClick={() => {
                              setExpandedCardId((current) => (current === cardId ? null : cardId))
                            }}
                            aria-expanded={isExpanded}
                          >
                            Learn More
                          </button>

                          <button
                            type="button"
                            className={`home-spotlight-card__btn home-spotlight-card__btn--pin${checked ? ' is-pinned' : ''}`}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              if (!pinDisabled) {
                                void handleTogglePin(card.item, !checked)
                              }
                            }}
                            title={
                              !card.item.pinnable
                                ? 'This card cannot be pinned to the top navigation'
                                : limitReached
                                  ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
                                  : checked
                                    ? 'Unpin from top navigation'
                                    : 'Pin to top navigation'
                            }
                            aria-label={checked ? `Unpin ${card.item.label}` : `Pin ${card.item.label}`}
                            aria-pressed={checked}
                            disabled={pinDisabled}
                          >
                            {checked ? <PinFilled size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
                            {checked ? 'Pinned' : 'Pin'}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="home-spotlight-card__learn-more" role="note">
                            <div className="home-spotlight-card__learn-more-title">
                              <Idea size={14} aria-hidden />
                              Workflow Notes
                            </div>
                            <p>{card.profile.learnMore}</p>
                            {card.item.gatedReason && <p className="home-spotlight-card__gated">{card.item.gatedReason}</p>}
                          </div>
                        )}
                      </div>

                      <aside className="home-spotlight-card__details" aria-label={`${card.item.label} capabilities`}>
                        <h4>Capabilities</h4>
                        <ul>
                          {card.profile.capabilities.map((capability) => (
                            <li key={`${cardId}-${capability}`}>{capability}</li>
                          ))}
                        </ul>
                        <div className="home-spotlight-card__best-for">
                          <span>Best for</span>
                          <strong>{card.profile.bestFor}</strong>
                        </div>
                        <div className="home-spotlight-card__route">Route: {card.item.to}</div>
                      </aside>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="home-spotlight-indicators" aria-label="Card indicators">
              {filteredCards.map((card, index) => (
                <button
                  key={`dot-${card.item.to}-${card.item.label}`}
                  type="button"
                  className={`home-spotlight-indicator${index === activeCardIndex ? ' is-active' : ''}`}
                  onClick={() => scrollToCard(index)}
                  aria-label={`View ${card.item.label}`}
                  aria-current={index === activeCardIndex}
                />
              ))}
            </div>
          </section>

          {activeCard && (
            <section className="home-cinematic-quick-open" aria-label="Quick open">
              <button type="button" onClick={() => navigate(activeCard.item.to)}>
                Open {activeCard.item.label}
              </button>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}

export default HomePage
