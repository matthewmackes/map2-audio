import { startTransition, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Launch, Settings } from '@carbon/icons-react'
import { Button, ClickableTile, Column, Content, Grid, Header, HeaderGlobalBar, HeaderName, InlineLoading, OverflowMenu, OverflowMenuItem, Tag, Tile, Toggle } from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import defaultWallpaperImage from '../../../../branding/MAP-GRID-HORIZON-2026.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import { readHomeLandingPreferences, updateHomeLandingPreferences } from './homeLandingPreferences'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { useLauncherInterfaceSummary } from '../layout/useLauncherInterfaceSummary'
import { useAppShellPresentation } from '../layout/useAppShellPresentation'
import { SystemSummary } from '../layout/SystemSummary'
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

export function HomePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const { data: hostInfo } = useHostMachineInfo()
  const websocketConnection = useWebSocketConnection()
  const platformStatus = useHomePlatformStatus()
  const specialSettings = useSpecialSettings()
  const launcherInterfaceSummary = useLauncherInterfaceSummary(true)
  const pendingPushConfirmationQuery = usePushConfirmation(undefined, {
    refetchInterval: 15_000,
  })
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])
  const [landingPreferences, setLandingPreferences] = useState(() => readHomeLandingPreferences())
  const shouldShowSplash = useMemo(() => landingPreferences.bootSplashEnabled && shouldShowHomeBootSplash(), [landingPreferences.bootSplashEnabled])
  const [showBootSplash, setShowBootSplash] = useState(shouldShowSplash)
  const recentRoute = useMemo(() => readHomeShellRecentRoute(), [location.key])
  const {
    launcherSummaryItems,
    platformStatusLabels,
    startMenuTileItems,
  } = useAppShellPresentation({
    hostInfo: hostInfo ?? null,
    pathname: '/',
    platformStatus,
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
            <Tile className="hp2-home-shell__hero">
              <p className="hp2-home-shell__eyebrow">Home</p>
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
              </div>
            </Tile>

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
                        <ClickableTile
                          key={item.route}
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
                          <div className="hp2-home-shell__workspace-tile-head">
                            <span className="hp2-home-shell__workspace-icon" style={{ '--home-tile-accent': item.color } as React.CSSProperties}>
                              <Icon size={20} aria-hidden />
                            </span>
                            <Tag type={item.maturity === 'production' ? 'green' : item.maturity === 'hardware-blocked' ? 'red' : 'cool-gray'}>
                              {isRecent ? 'Recent' : item.shortLabel}
                            </Tag>
                          </div>
                          <div className="hp2-home-shell__workspace-copy">
                            <h2>{item.label}</h2>
                            <p>{item.description}</p>
                          </div>
                        </ClickableTile>
                      )
                    })}
                  </div>
                </section>
              ))}
            </section>
          </Column>

          <Column lg={6} md={8} sm={4} className="hp2-home-shell__rail">
            <ClickableTile
              className="hp2-home-shell__rail-card hp2-home-shell__rail-card--summary"
              href="/workspace/platforms/overview"
              onClick={(event) => {
                event.preventDefault()
                navigateHomeShellRoute(navigate, '/workspace/platforms/overview')
              }}
              onMouseEnter={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
              onFocus={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
            >
              <div className="hp2-home-shell__rail-card-head">
                <div>
                  <p className="hp2-home-shell__eyebrow">System Status</p>
                  <h2>System health and devices</h2>
                </div>
                <span className="hp2-home-shell__rail-card-link">Open control panel</span>
              </div>
              <SystemSummary
                classNamePrefix="map2-launcher"
                launcherInterfaceSummary={launcherInterfaceSummary}
                launcherSummaryItems={launcherSummaryItems}
                pendingPushConfirmation={pendingPushConfirmationQuery.data?.pending_confirmation ?? null}
                platformStatusLabels={platformStatusLabels}
              />
            </ClickableTile>

            <Tile className="hp2-home-shell__rail-card">
              <div className="hp2-home-shell__rail-card-head">
                <div>
                  <p className="hp2-home-shell__eyebrow">Display Settings</p>
                  <h2>Visual preferences</h2>
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
                  <p>{landingPreferences.cinematicBackdropEnabled ? `Custom ${wallpaper.mode}` : 'Simple dark'}</p>
                </div>
                <div>
                  <strong>Startup Screen</strong>
                  <p>{landingPreferences.bootSplashEnabled ? 'On' : 'Off'}</p>
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
            </Tile>
          </Column>
        </Grid>
      </Content>
    </div>
  )
}

export default HomePage
