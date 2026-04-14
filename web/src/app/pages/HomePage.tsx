import { startTransition, useEffect, useMemo, useState } from 'react'
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
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { useLauncherInterfaceSummary } from '../layout/useLauncherInterfaceSummary'
import { useAppShellPresentation } from '../layout/useAppShellPresentation'
import { SystemSummary } from '../layout/SystemSummary'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { isHomeShellTileRecent, navigateHomeShellRoute, prefetchHomeShellRoute, readHomeShellRecentRoute } from './homeShellNavigation'
import '../layout/LauncherPanel/LauncherPanel.css'
import './HomePage.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

export function HomePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const { data: hostInfo } = useHostMachineInfo()
  const websocketConnection = useWebSocketConnection()
  const platformStatus = useHomePlatformStatus()
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
          <p className="hp2-boot__subtitle">Initializing the Carbon-governed pre-Warp desktop session and restoring platform context.</p>
        </div>
        <div className="hp2-boot__progress" role="status" aria-live="polite">
          <InlineLoading
            status="active"
            description="Restoring workplace shell"
            iconDescription="Boot in progress"
          />
          <p className="hp2-boot__progress-copy">
            Bringing the Carbon shell online and restoring the last desktop session state.
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
              <h1 className="hp2-home-shell__title">MAP2 Workplace Shell</h1>
              <p className="hp2-home-shell__lede">
                Launch the core MAP2 workspaces from a single Carbon landing surface with fast access to editing, routing, performance, and system operations.
              </p>
              <div className="hp2-home-shell__hero-actions">
                <Button
                  renderIcon={ArrowRight}
                  onClick={() => navigateHomeShellRoute(navigate, '/workspace/platforms/overview')}
                  onMouseEnter={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
                  onFocus={() => prefetchHomeShellRoute('/workspace/platforms/overview')}
                >
                  Open Workspace
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

            <section className="hp2-home-shell__workspace-strip" aria-label="Workspace launch grid">
              {startMenuTileItems.map((item) => {
                const Icon = item.icon
                const isRecent = isHomeShellTileRecent(recentRoute, item.route)
                return (
                  <ClickableTile
                    key={item.route}
                    className={`hp2-home-shell__workspace-tile${isRecent ? ' is-recent' : ''}`}
                    href={item.route}
                    onClick={(event) => {
                      event.preventDefault()
                      navigateHomeShellRoute(navigate, item.route)
                    }}
                    onMouseEnter={() => prefetchHomeShellRoute(item.route)}
                    onFocus={() => prefetchHomeShellRoute(item.route)}
                    data-recent-route={isRecent ? 'true' : 'false'}
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
                  <h2>Node, interfaces, and platform health</h2>
                </div>
                <span className="hp2-home-shell__rail-card-link">Open workspace</span>
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
                  <p className="hp2-home-shell__eyebrow">Landing Mode</p>
                  <h2>Presentation preferences</h2>
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
                  <strong>Backdrop</strong>
                  <p>{landingPreferences.cinematicBackdropEnabled ? `Cinematic ${wallpaper.mode}` : 'Minimal product shell'}</p>
                </div>
                <div>
                  <strong>Boot splash</strong>
                  <p>{landingPreferences.bootSplashEnabled ? 'Enabled for this browser' : 'Disabled by default'}</p>
                </div>
              </div>
              <div className="hp2-home-shell__preference-toggles">
                <Toggle
                  id="home-landing-cinematic-backdrop"
                  size="sm"
                  labelText="Cinematic backdrop"
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
                  labelText="Boot splash"
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
