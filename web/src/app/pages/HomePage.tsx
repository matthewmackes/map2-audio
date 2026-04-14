import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Launch, Settings } from '@carbon/icons-react'
import { Button, Column, Content, Grid, Header, HeaderGlobalBar, HeaderName, InlineLoading, Modal, OverflowMenu, OverflowMenuItem, Search, Tag, Toggle } from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import defaultWallpaperImage from '../../../../branding/MAP-GRID-HORIZON-2026.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import { readHomeLandingPreferences, updateHomeLandingPreferences } from './homeLandingPreferences'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useAppShellPresentation } from '../layout/useAppShellPresentation'
import { SystemSummary } from '../layout/SystemSummary'
import { useShellSummaryData } from '../layout/useShellSummaryData'
import { DashboardCard } from '../components/shared/DashboardCard'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { getLauncherRoutePresentation, type LandingTileSize } from '../data/launcherCatalog'
import { isHomeShellTileRecent, navigateHomeShellRoute, prefetchHomeShellRoute, readHomeShellRecentRoute } from './homeShellNavigation'
import '../layout/LauncherPanel/LauncherPanel.css'
import './HomePage.boot.css'
import './HomePage.landing.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000
const HOME_GROUP_ORDER = ['Workspace', 'Performance', 'MIDI', 'Device Operations'] as const

type HomeLaunchTile = {
  route: string
  label: string
  shortLabel: string
  homeGroup: typeof HOME_GROUP_ORDER[number]
  description: string
  icon: ComponentType<any>
  color: string
  maturity: 'production' | 'qualified-with-waiver' | 'beta' | 'experimental' | 'hardware-blocked'
  size: LandingTileSize
}

type QuickLaunchItem = {
  route: string
  label: string
  description: string
  group: string
  keywords: string[]
}

const QUICK_LAUNCH_STATIC_ITEMS: QuickLaunchItem[] = [
  {
    route: '/workspace/platforms/overview',
    label: 'Control Panel',
    description: 'Open system posture, nodes, devices, and workspace-wide controls.',
    group: 'Workspace',
    keywords: ['workspace', 'overview', 'platforms', 'control panel'],
  },
  {
    route: '/snapshot-editor',
    label: 'Snapshot Editor',
    description: 'Open graph editing, routing, and recall work.',
    group: 'Workspace',
    keywords: ['snapshot', 'editor', 'routing', 'graph'],
  },
  {
    route: '/platforms/theme',
    label: 'Display Settings',
    description: 'Open desktop theme and appearance controls.',
    group: 'Platform',
    keywords: ['theme', 'display', 'settings', 'appearance'],
  },
  {
    route: '/platforms/about',
    label: 'About MAP2',
    description: 'Open platform references, background, and documentation links.',
    group: 'Platform',
    keywords: ['about', 'docs', 'documentation', 'info'],
  },
]

function resolveHomeGroup(route: string): typeof HOME_GROUP_ORDER[number] {
  if (route === '/workspace' || route.startsWith('/workspace/')) {
    return 'Workspace'
  }
  if (route === '/brain' || route === '/perform') {
    return 'Performance'
  }
  if (route === '/midi-hub') {
    return 'MIDI'
  }
  return 'Device Operations'
}

function resolveHomeGroupValue(homeGroup: string | undefined, route: string): typeof HOME_GROUP_ORDER[number] {
  return HOME_GROUP_ORDER.includes(homeGroup as typeof HOME_GROUP_ORDER[number])
    ? homeGroup as typeof HOME_GROUP_ORDER[number]
    : resolveHomeGroup(route)
}

function normalizeQuickLaunchValue(value: string) {
  return value.trim().toLowerCase()
}

function buildQuickLaunchItems(startMenuTileItems: Array<{
  route: string
  label: string
  homeGroup?: string
  description: string
  shortLabel: string
}>) {
  const dedupedItems = new Map<string, QuickLaunchItem>()

  for (const item of QUICK_LAUNCH_STATIC_ITEMS) {
    dedupedItems.set(item.route, item)
  }

  for (const item of startMenuTileItems) {
    dedupedItems.set(item.route, {
      route: item.route,
      label: item.label,
      description: item.description,
      group: item.homeGroup ?? resolveHomeGroup(item.route),
      keywords: [item.shortLabel, item.label, item.description, item.homeGroup ?? resolveHomeGroup(item.route)],
    })
  }

  return Array.from(dedupedItems.values())
}

export function HomePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const websocketConnection = useWebSocketConnection()
  const specialSettings = useSpecialSettings()
  const shellSummaryData = useShellSummaryData({
    pathname: '/',
    navOpen: true,
  })
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])
  const [landingPreferences, setLandingPreferences] = useState(() => readHomeLandingPreferences())
  const shouldShowSplash = useMemo(() => landingPreferences.bootSplashEnabled && shouldShowHomeBootSplash(), [landingPreferences.bootSplashEnabled])
  const [showBootSplash, setShowBootSplash] = useState(shouldShowSplash)
  const [quickLaunchOpen, setQuickLaunchOpen] = useState(false)
  const [quickLaunchQuery, setQuickLaunchQuery] = useState('')
  const [activeQuickLaunchIndex, setActiveQuickLaunchIndex] = useState(0)
  const quickLaunchSearchRef = useRef<HTMLInputElement | null>(null)
  const deferredQuickLaunchQuery = useDeferredValue(quickLaunchQuery)
  const recentRoute = useMemo(() => readHomeShellRecentRoute(), [location.key])
  const {
    startMenuTileItems,
  } = useAppShellPresentation({
    pathname: '/',
    websocketStatus: websocketConnection.status,
  })
  const groupedStartMenuTileItems = useMemo(
    () => {
      const startMenuTileByRoute = new Map(startMenuTileItems.map((item) => [item.route, item] as const))

      const configuredTiles: HomeLaunchTile[] = specialSettings.settings?.landingTiles.flatMap((tile) => {
        const startMenuTile = startMenuTileByRoute.get(tile.route)
        if (startMenuTile) {
          return [{
            ...startMenuTile,
            homeGroup: resolveHomeGroupValue(startMenuTile.homeGroup, startMenuTile.route),
            size: tile.size,
          }]
        }

        const launcherItem = getLauncherRoutePresentation(tile.route)
        if (!launcherItem) {
          return []
        }

        return [{
          route: launcherItem.route,
          label: launcherItem.heroTitle,
          shortLabel: launcherItem.shortLabel ?? launcherItem.label,
          homeGroup: resolveHomeGroup(launcherItem.route),
          description: launcherItem.description,
          icon: launcherItem.icon,
          color: launcherItem.color,
          maturity: launcherItem.maturity,
          size: tile.size,
        }]
      }) ?? []

      const fallbackTiles: HomeLaunchTile[] = startMenuTileItems.map((item) => ({
        ...item,
        homeGroup: resolveHomeGroupValue(item.homeGroup, item.route),
        size: 'medium',
      }))

      const resolvedTiles = configuredTiles.length > 0 ? configuredTiles : fallbackTiles

      return HOME_GROUP_ORDER
        .map((group) => ({
          group,
          items: resolvedTiles.filter((item) => item.homeGroup === group),
        }))
        .filter((section) => section.items.length > 0)
    },
    [specialSettings.settings?.landingTiles, startMenuTileItems],
  )
  const quickLaunchItems = useMemo(() => buildQuickLaunchItems(startMenuTileItems), [startMenuTileItems])
  const filteredQuickLaunchItems = useMemo(() => {
    const normalizedQuery = normalizeQuickLaunchValue(deferredQuickLaunchQuery)
    if (!normalizedQuery) {
      return quickLaunchItems
    }

    return quickLaunchItems.filter((item) => {
      const haystack = [
        item.label,
        item.description,
        item.group,
        item.route,
        ...item.keywords,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [deferredQuickLaunchQuery, quickLaunchItems])

  useEffect(() => {
    if (!quickLaunchOpen) {
      return
    }

    setActiveQuickLaunchIndex(0)
  }, [deferredQuickLaunchQuery, quickLaunchOpen])

  useEffect(() => {
    if (!quickLaunchOpen) {
      return
    }

    const focusId = window.setTimeout(() => {
      quickLaunchSearchRef.current?.focus()
    }, 0)

    return () => {
      window.clearTimeout(focusId)
    }
  }, [quickLaunchOpen])

  useEffect(() => {
    if (!quickLaunchOpen) {
      return
    }

    for (const item of filteredQuickLaunchItems.slice(0, 5)) {
      prefetchHomeShellRoute(item.route)
    }
  }, [filteredQuickLaunchItems, quickLaunchOpen])

  useEffect(() => {
    const handleQuickLaunchShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setQuickLaunchOpen(true)
        return
      }

      if (event.key !== 'Escape') {
        return
      }

      setQuickLaunchOpen(false)
    }

    window.addEventListener('keydown', handleQuickLaunchShortcut)
    return () => {
      window.removeEventListener('keydown', handleQuickLaunchShortcut)
    }
  }, [])

  const handleOpenQuickLaunch = () => {
    setQuickLaunchOpen(true)
  }

  const handleCloseQuickLaunch = () => {
    setQuickLaunchOpen(false)
    setQuickLaunchQuery('')
    setActiveQuickLaunchIndex(0)
  }

  const handleSelectQuickLaunchItem = (route: string) => {
    handleCloseQuickLaunch()
    navigateHomeShellRoute(navigate, route)
  }

  useEffect(() => {
    if (!landingPreferences.bootSplashEnabled && shouldShowHomeBootSplash()) {
      completeHomeDesktopBoot()
    }
  }, [landingPreferences.bootSplashEnabled])

  useEffect(() => {
    if (!showBootSplash) {
      return undefined
    }

    if (shouldReduceEffects) {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
    }, HOME_BOOT_SPLASH_DURATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [showBootSplash, shouldReduceEffects])

  if (showBootSplash) {
    return (
      <section className="hp2-boot" aria-label="MAP2 boot splash">
        <div className="hp2-boot__center">
          <div className="hp2-boot__mark-wrap">
            <img src={map2Logo} alt="MAP2 logo" className="hp2-boot__mark" />
          </div>
          <h1 className="hp2-boot__title">{MAP2_PLATFORM_NAME}</h1>
          <p className="hp2-boot__subtitle">Starting up and restoring your settings.</p>
        </div>
        <div className="hp2-boot__progress" role="status" aria-live="polite">
          <InlineLoading
            status="active"
            description="Restoring your desktop"
            iconDescription="Boot in progress"
          />
          <p className="hp2-boot__progress-copy">
            Loading your desktop and settings.
          </p>
        </div>
      </section>
    )
  }

  return (
    <div
      className={`hp2-root hp2-root--landing${landingPreferences.cinematicBackdropEnabled ? ` hp2-root--${wallpaper.mode}` : ' hp2-root--minimal'}`}
      data-testid="home-shell"
      data-wallpaper-mode={landingPreferences.cinematicBackdropEnabled ? wallpaper.mode : 'minimal'}
      data-reduced-effects={shouldReduceEffects ? 'true' : 'false'}
    >
      {landingPreferences.cinematicBackdropEnabled && wallpaper.mode === 'uploaded-image' && wallpaper.imageDataUrl ? (
        <img
          src={wallpaper.imageDataUrl}
          alt=""
          className="hp2-root__wallpaper"
          data-testid="home-desktop-wallpaper-image"
          aria-hidden="true"
        />
      ) : null}
      {landingPreferences.cinematicBackdropEnabled && wallpaper.mode === 'default-image' ? (
        <img
          src={defaultWallpaperImage}
          alt=""
          className="hp2-root__default-wallpaper"
          data-testid="home-desktop-default-wallpaper-image"
          aria-hidden="true"
        />
      ) : null}
      <div className="hp2-root__backdrop" aria-hidden="true" />

      <Header aria-label="MAP2 home shell" className="hp2-home-shell__masthead">
        <HeaderName href="/" prefix="">
          {MAP2_PLATFORM_NAME}
        </HeaderName>
        <HeaderGlobalBar>
          <Tag type="blue">Carbon landing</Tag>
          <OverflowMenu ariaLabel="Landing actions" size="lg" flipped>
            <OverflowMenuItem itemText="Open Workspace" onClick={() => navigateHomeShellRoute(navigate, '/workspace/platforms/overview')} />
            <OverflowMenuItem itemText="Display settings" onClick={() => navigateHomeShellRoute(navigate, '/platforms/theme')} />
            <OverflowMenuItem itemText="About MAP2" onClick={() => navigateHomeShellRoute(navigate, '/platforms/about')} />
          </OverflowMenu>
        </HeaderGlobalBar>
      </Header>

      <Content className="hp2-home-shell__content">
        <Grid className="hp2-home-shell__grid" condensed>
          <Column lg={10} md={8} sm={4} className="hp2-home-shell__main">
            <DashboardCard className="hp2-home-shell__hero">
              <p className="hp2-home-shell__eyebrow dashboard-card__eyebrow">Home</p>
              <h1 className="hp2-home-shell__title">Desktop Control Panel</h1>
              <p className="hp2-home-shell__lede">
                Access your tools: editing, routing, performance, and system controls.
              </p>
              <div className="hp2-home-shell__hero-actions">
                <Button
                  renderIcon={ArrowRight}
                  onClick={() => navigateHomeShellRoute(navigate, '/workspace/platforms/overview')}
                  onMouseEnter={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
                  onFocus={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
                >
                  Open Control Panel
                </Button>
                <Button
                  kind="tertiary"
                  renderIcon={Launch}
                  onClick={() => navigateHomeShellRoute(navigate, '/snapshot-editor')}
                  onMouseEnter={() => prefetchHomeShellRoute('/snapshot-editor')}
                  onFocus={() => prefetchHomeShellRoute('/snapshot-editor')}
                >
                  Open Snapshot Editor
                </Button>
                <Button
                  kind="ghost"
                  renderIcon={Settings}
                  onClick={() => navigateHomeShellRoute(navigate, '/platforms/theme')}
                  onMouseEnter={() => prefetchHomeShellRoute('/platforms/theme')}
                  onFocus={() => prefetchHomeShellRoute('/platforms/theme')}
                >
                  Display settings
                </Button>
                <Button
                  kind="ghost"
                  onClick={handleOpenQuickLaunch}
                >
                  Quick launch
                </Button>
              </div>
              <div className="hp2-home-shell__quick-launch-callout">
                <span className="hp2-home-shell__quick-launch-kbd">Ctrl</span>
                <span className="hp2-home-shell__quick-launch-kbd">K</span>
                <span>Search every main destination</span>
              </div>
            </DashboardCard>

            <section className="hp2-home-shell__workspace-sections" aria-label="Control Panel shortcuts">
              {groupedStartMenuTileItems.map((section) => (
                <section key={section.group} className="hp2-home-shell__workspace-section" aria-label={`${section.group} shortcuts`}>
                  <div className="hp2-home-shell__workspace-section-head">
                    <p className="hp2-home-shell__eyebrow">{section.group}</p>
                  </div>
                  <div className="hp2-home-shell__workspace-strip">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const isRecent = isHomeShellTileRecent(recentRoute, item.route)
                      return (
                        <DashboardCard
                          key={item.route}
                          interactive
                          className={`hp2-home-shell__workspace-tile hp2-home-shell__workspace-tile--${item.size}${isRecent ? ' is-recent' : ''}`}
                          href={item.route}
                          onClick={(event) => {
                            event.preventDefault()
                            navigateHomeShellRoute(navigate, item.route)
                          }}
                          onMouseEnter={() => prefetchHomeShellRoute(item.route)}
                          onFocus={() => prefetchHomeShellRoute(item.route)}
                          data-recent-route={isRecent ? 'true' : 'false'}
                          data-tile-size={item.size}
                        >
                          <div className="hp2-home-shell__workspace-tile-head dashboard-card__header">
                            <span className="hp2-home-shell__workspace-icon" style={{ '--home-tile-accent': item.color } as React.CSSProperties}>
                              <Icon size={20} aria-hidden />
                            </span>
                            <Tag type={item.maturity === 'production' ? 'green' : item.maturity === 'hardware-blocked' ? 'red' : 'cool-gray'}>
                              {isRecent ? 'Recent' : item.shortLabel}
                            </Tag>
                          </div>
                          <div className="hp2-home-shell__workspace-copy">
                            <h2 className="dashboard-card__title">{item.label}</h2>
                            <p className="dashboard-card__body-copy">{item.description}</p>
                          </div>
                        </DashboardCard>
                      )
                    })}
                  </div>
                </section>
              ))}
            </section>
          </Column>

          <Column lg={6} md={8} sm={4} className="hp2-home-shell__rail">
            <DashboardCard
              interactive
              className="hp2-home-shell__rail-card hp2-home-shell__rail-card--summary"
              href="/workspace/platforms/overview"
              onClick={(event) => {
                event.preventDefault()
                navigateHomeShellRoute(navigate, '/workspace/platforms/overview')
              }}
              onMouseEnter={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
              onFocus={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
            >
              <div className="hp2-home-shell__rail-card-head dashboard-card__header">
                <div>
                  <p className="hp2-home-shell__eyebrow dashboard-card__eyebrow">System Status</p>
                  <h2 className="dashboard-card__title">System health and devices</h2>
                </div>
                <span className="hp2-home-shell__rail-card-link">Open control panel</span>
              </div>
              <SystemSummary
                classNamePrefix="map2-launcher"
                summaryData={shellSummaryData}
              />
            </DashboardCard>

            <DashboardCard className="hp2-home-shell__rail-card">
              <div className="hp2-home-shell__rail-card-head dashboard-card__header">
                <div>
                  <p className="hp2-home-shell__eyebrow dashboard-card__eyebrow">Display Settings</p>
                  <h2 className="dashboard-card__title">Visual preferences</h2>
                </div>
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={() => navigateHomeShellRoute(navigate, '/platforms/theme')}
                  onMouseEnter={() => prefetchHomeShellRoute('/platforms/theme')}
                  onFocus={() => prefetchHomeShellRoute('/platforms/theme')}
                >
                  Open theme settings
                </Button>
              </div>
              <div className="hp2-home-shell__preference-list">
                <div>
                  <strong>Desktop Background</strong>
                  <p className="dashboard-card__body-copy">{landingPreferences.cinematicBackdropEnabled ? `Custom ${wallpaper.mode}` : 'Simple dark'}</p>
                </div>
                <div>
                  <strong>Startup Screen</strong>
                  <p className="dashboard-card__body-copy">{landingPreferences.bootSplashEnabled ? 'On' : 'Off'}</p>
                </div>
              </div>
              <div className="hp2-home-shell__preference-toggles">
                <Toggle
                  id="home-landing-cinematic-backdrop"
                  size="sm"
                  labelText="Desktop background"
                  labelA="Off"
                  labelB="On"
                  toggled={landingPreferences.cinematicBackdropEnabled}
                  onToggle={(enabled: boolean) => {
                    setLandingPreferences(updateHomeLandingPreferences({ cinematicBackdropEnabled: enabled }))
                  }}
                />
                <Toggle
                  id="home-landing-boot-splash"
                  size="sm"
                  labelText="Startup screen"
                  labelA="Off"
                  labelB="On"
                  toggled={landingPreferences.bootSplashEnabled}
                  onToggle={(enabled: boolean) => {
                    setLandingPreferences(updateHomeLandingPreferences({ bootSplashEnabled: enabled }))
                  }}
                />
              </div>
            </DashboardCard>
          </Column>
        </Grid>
      </Content>
      <Modal
        open={quickLaunchOpen}
        passiveModal
        modalHeading="Quick launch"
        size="sm"
        onRequestClose={handleCloseQuickLaunch}
      >
        <div className="hp2-home-shell__quick-launch-panel">
          <p className="hp2-home-shell__quick-launch-copy">
            Search the main MAP2 destinations and press Enter to jump.
          </p>
          <Search
            id="home-quick-launch-search"
            ref={quickLaunchSearchRef}
            labelText="Search destinations"
            placeholder="Search control panel, Brain, MIDI, snapshots..."
            value={quickLaunchQuery}
            onChange={(event) => setQuickLaunchQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveQuickLaunchIndex((current) => (
                  filteredQuickLaunchItems.length === 0
                    ? 0
                    : Math.min(current + 1, filteredQuickLaunchItems.length - 1)
                ))
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveQuickLaunchIndex((current) => Math.max(current - 1, 0))
                return
              }

              if (event.key === 'Enter' && filteredQuickLaunchItems[activeQuickLaunchIndex]) {
                event.preventDefault()
                handleSelectQuickLaunchItem(filteredQuickLaunchItems[activeQuickLaunchIndex].route)
              }
            }}
          />
          <div className="hp2-home-shell__quick-launch-results" role="listbox" aria-label="Quick launch results">
            {filteredQuickLaunchItems.length > 0 ? filteredQuickLaunchItems.slice(0, 8).map((item, index) => (
              <button
                key={item.route}
                type="button"
                role="option"
                aria-selected={index === activeQuickLaunchIndex}
                className={`hp2-home-shell__quick-launch-result${index === activeQuickLaunchIndex ? ' is-active' : ''}`}
                onClick={() => handleSelectQuickLaunchItem(item.route)}
                onMouseEnter={() => setActiveQuickLaunchIndex(index)}
                onFocus={() => {
                  setActiveQuickLaunchIndex(index)
                  prefetchHomeShellRoute(item.route)
                }}
              >
                <span className="hp2-home-shell__quick-launch-result-main">
                  <span className="hp2-home-shell__quick-launch-result-label">{item.label}</span>
                  <span className="hp2-home-shell__quick-launch-result-group">{item.group}</span>
                </span>
                <span className="hp2-home-shell__quick-launch-result-description">{item.description}</span>
                <span className="hp2-home-shell__quick-launch-result-route">{item.route}</span>
              </button>
            )) : (
              <div className="hp2-home-shell__quick-launch-empty" role="status">
                No destinations match that search.
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default HomePage
