import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Button, ComposedModal, Layer, ModalBody, ModalFooter, ModalHeader, ProgressBar } from '@carbon/react'

import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { PageTransition } from '../components/PageTransition'
import {
  MAP2_PLATFORM_NAME,
  MAP2_PLATFORM_VERSION,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import {
  allPinnableNavigationItems,
  allRouteNavigationItems,
} from '../data/advancedMenuItems'
import {
  getLauncherCatalogMaturityLabel,
  launcherCatalogDisplayItems,
  type LauncherCatalogItem,
} from '../data/launcherCatalog'
import { systemApi } from '../../map2/clients/platform'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import {
  readHomeDesktopSession,
  reloadHomeDesktopShell,
  returnHomeDesktopToBoot,
  updateHomeDesktopSession,
} from '../pages/homeDesktopSession'
import { prefetchAppRoute } from '../routePrefetch'
import './AppShell.css'

type RestartProgressStage = 'idle' | 'stopping' | 'restarting' | 'reconnecting' | 'ready' | 'error'
type StartMenuTileItem = Pick<
  LauncherCatalogItem,
  'route' | 'label' | 'shortLabel' | 'icon' | 'description' | 'color' | 'maturity'
> & { featured?: boolean }

const APP_WINDOW_CLOSE_DURATION_MS = 180
function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(to + '/'))
}

function formatShellRouteHint(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return 'landing'
  }

  return segments.join(' / ')
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isTabletTouchRoute } = useTabletTouchRouteLayout(location.pathname)
  const { status: websocketStatus } = useWebSocketConnection()
  const platformStatus = useHomePlatformStatus()
  const { data: hostInfo } = useHostMachineInfo()
  const [navOpen, setNavOpen] = useState(false)
  const [powerMenuOpen, setPowerMenuOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [restartProgressStage, setRestartProgressStage] = useState<RestartProgressStage>('idle')
  const [restartError, setRestartError] = useState<string | null>(null)
  const [performFullscreen, setPerformFullscreen] = useState(location.pathname === '/perform')
  const navMenuRef = useRef<HTMLDivElement>(null)
  const restartSawUnavailableRef = useRef(false)
  const restartSawReconnectRef = useRef(false)
  const restartCompletionRequestedRef = useRef(false)
  const closeWindowTimerRef = useRef<number | null>(null)
  const [closingAppRoute, setClosingAppRoute] = useState<string | null>(null)
  const [runningRoutes, setRunningRoutes] = useState<string[]>(() => (
    readHomeDesktopSession()?.runningRoutes.filter((route) => route !== '/') ?? []
  ))

  const startMenuTileItems = useMemo<StartMenuTileItem[]>(
    () => launcherCatalogDisplayItems
      .filter((item) => item.route !== '/')
      .map((item) => ({
        route: item.route,
        label:
          item.route === '/platforms/overview'
            ? 'Platforms'
            : item.route === '/artifacts'
              ? 'Files'
              : item.label,
        shortLabel:
          item.route === '/platforms/overview'
            ? 'Platforms'
            : item.route === '/artifacts'
              ? 'Files'
              : item.shortLabel,
        icon: item.icon,
        description: item.description,
        color: item.color,
        maturity: item.maturity,
        featured: item.route === '/platforms/overview' || item.route === '/artifacts',
      })),
    [],
  )
  const snapshotEditorNavItem = useMemo(
    () => [...allPinnableNavigationItems, ...allRouteNavigationItems].find((item) => item.to === '/juce-grid'),
    [],
  )
  const currentShellItem = useMemo(() => {
    const candidates = [...allPinnableNavigationItems, ...allRouteNavigationItems]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.to === item.to) === index)
      .filter((item) => isRouteMatch(location.pathname, item.to))
      .sort((left, right) => right.to.length - left.to.length)

    return candidates[0] ?? null
  }, [location.pathname])

  const ShellWindowIcon = currentShellItem?.icon ?? Map2BrandMark
  const shellWorkspaceLabel = currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace'
  const shellAccentColor = currentShellItem?.color ?? 'var(--cds-link-primary, #0f62fe)'
  const shellRouteHint = formatShellRouteHint(location.pathname)
  const isDesktopRoute = location.pathname === '/'
  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'
  const isPlatformWorkspaceRoute = location.pathname.startsWith('/platforms')
  const isIntegratedWorkspaceRoute =
    isPlatformWorkspaceRoute
    || location.pathname.startsWith('/midi-hub')
    || location.pathname.startsWith('/artifacts')
    || location.pathname.startsWith('/audio-artifacts')
  const isAudioGridWorkspaceRoute = location.pathname === '/juce-grid' || location.pathname === '/snapshot-editor'
  const showPerformFullscreen = location.pathname === '/perform' && performFullscreen
  const isThemedWorkspaceRoute = isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const isFullBleedRoute = location.pathname === '/' || isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute || showPerformFullscreen
  const showLauncherShell = !showPerformFullscreen

  const closeShellMenus = () => {
    setNavOpen(false)
    setPowerMenuOpen(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        closeShellMenus()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeShellMenus()
      }
    }

    if (!navOpen) {
      return undefined
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [navOpen])

  useEffect(() => {
    closeShellMenus()
  }, [location.pathname])

  useEffect(() => {
    setPerformFullscreen(location.pathname === '/perform')
  }, [location.pathname])

  useEffect(() => {
    if (!showPerformFullscreen) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPerformFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showPerformFullscreen])

  useEffect(() => {
    setRunningRoutes((current) => {
      const sanitized = current.filter((route) => route !== '/')
      if (isDesktopRoute || location.pathname === '/' || sanitized.includes(location.pathname)) {
        return sanitized
      }

      return [...sanitized, location.pathname]
    })

    if (closingAppRoute && closingAppRoute !== location.pathname) {
      setClosingAppRoute(null)
    }
  }, [closingAppRoute, isDesktopRoute, location.pathname])

  useEffect(() => () => {
    if (closeWindowTimerRef.current !== null) {
      window.clearTimeout(closeWindowTimerRef.current)
    }
  }, [])

  useEffect(() => {
    updateHomeDesktopSession({
      runningRoutes: runningRoutes.filter((route) => route !== '/'),
      currentRoute: location.pathname,
    })
  }, [location.pathname, runningRoutes])

  const handleMenuToggle = () => {
    const nextOpen = !navOpen
    setNavOpen(nextOpen)
    setPowerMenuOpen(false)
  }

  const handleRefreshPage = () => {
    closeShellMenus()
    reloadHomeDesktopShell()
  }

  const handleLogOut = () => {
    closeShellMenus()
    returnHomeDesktopToBoot()
  }

  const handleCloseCurrentApp = () => {
    if (isDesktopRoute) {
      return
    }

    const routeToClose = location.pathname
    closeShellMenus()
    setClosingAppRoute(routeToClose)
    setRunningRoutes((current) => current.filter((route) => route !== routeToClose))

    if (closeWindowTimerRef.current !== null) {
      window.clearTimeout(closeWindowTimerRef.current)
    }

    closeWindowTimerRef.current = window.setTimeout(() => {
      closeWindowTimerRef.current = null
      setRunningRoutes((current) => current.filter((runningRoute) => runningRoute !== routeToClose))
      navigate('/')
    }, APP_WINDOW_CLOSE_DURATION_MS)
  }

  const handleConfirmRestartBackend = async () => {
    setRestartConfirmOpen(false)
    closeShellMenus()
    restartSawUnavailableRef.current = false
    restartSawReconnectRef.current = false
    restartCompletionRequestedRef.current = false
    setRestartError(null)

    try {
      await systemApi.restartBackend()
      setRestartProgressStage('stopping')
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Failed to restart backend.')
      setRestartProgressStage('error')
    }
  }

  useEffect(() => {
    if (restartProgressStage === 'idle' || restartProgressStage === 'error') {
      return undefined
    }

    if (restartProgressStage === 'stopping') {
      const timerId = window.setTimeout(() => setRestartProgressStage('restarting'), 1100)
      return () => window.clearTimeout(timerId)
    }

    if (restartProgressStage === 'restarting') {
      const timerId = window.setTimeout(() => setRestartProgressStage('reconnecting'), 1200)
      return () => window.clearTimeout(timerId)
    }

    if (restartProgressStage === 'ready' && !restartCompletionRequestedRef.current) {
      restartCompletionRequestedRef.current = true
      const timerId = window.setTimeout(() => {
        returnHomeDesktopToBoot()
      }, 900)
      return () => window.clearTimeout(timerId)
    }

    return undefined
  }, [restartProgressStage])

  useEffect(() => {
    if (!['stopping', 'restarting', 'reconnecting'].includes(restartProgressStage)) {
      return undefined
    }

    let cancelled = false

    const probeHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        if (!cancelled && restartSawUnavailableRef.current) {
          setRestartProgressStage('ready')
        }
      } catch {
        restartSawUnavailableRef.current = true
      }
    }

    void probeHealth()
    const intervalId = window.setInterval(() => {
      void probeHealth()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [restartProgressStage])

  useEffect(() => {
    if (!['stopping', 'restarting', 'reconnecting'].includes(restartProgressStage)) {
      return
    }

    if (websocketStatus === 'reconnecting' || websocketStatus === 'error') {
      restartSawReconnectRef.current = true
      setRestartProgressStage('reconnecting')
      return
    }

    if (websocketStatus === 'connected' && restartSawReconnectRef.current) {
      setRestartProgressStage('ready')
    }
  }, [restartProgressStage, websocketStatus])

  const restartProgressSteps = [
    { key: 'stopping', label: 'Stopping engine', description: 'Closing active backend processes and preparing the shell for restart.' },
    { key: 'restarting', label: 'Restarting service', description: 'Waiting for the MAP2 backend service manager to bring the runtime back.' },
    { key: 'reconnecting', label: 'Reconnecting', description: 'Restoring live shell connectivity and validating the desktop session.' },
    { key: 'ready', label: 'Ready', description: 'Backend is reachable again. Returning to the boot splash.' },
  ] as const

  const restartProgressIndex = Math.max(
    0,
    restartProgressSteps.findIndex((step) => step.key === restartProgressStage),
  )
  const restartCurrentStep = restartProgressStage === 'error'
    ? null
    : restartProgressSteps[restartProgressIndex] ?? restartProgressSteps[0]

  const renderStartMenuItem = (item: StartMenuTileItem) => {
    const Icon = item.icon

    return (
      <NavLink
        key={`start-link-${item.route}`}
        to={item.route}
        end={item.route === '/'}
        className={({ isActive }) => `start-menu-card start-menu-card--tile${item.featured ? ' start-menu-card--featured' : ''}${isActive ? ' is-active' : ''}`}
        style={{ '--item-color': item.color } as CSSProperties}
        title={`${item.description} • ${getLauncherCatalogMaturityLabel(item.maturity)}`}
        onClick={closeShellMenus}
        onMouseEnter={() => prefetchAppRoute(item.route)}
        onFocus={() => prefetchAppRoute(item.route)}
      >
        <span className="start-menu-card__icon-frame" aria-hidden="true">
          <span className="start-menu-card__icon start-menu-card__icon--tile">
            <Icon size={28} aria-hidden />
          </span>
        </span>
        <span className="start-menu-card__body">
          <span className="start-menu-card__label start-menu-card__label--tile">{item.label}</span>
          {item.maturity === 'hardware-blocked' ? (
            <span className="start-menu-card__meta">{getLauncherCatalogMaturityLabel(item.maturity)}</span>
          ) : null}
        </span>
      </NavLink>
    )
  }

  const launcherSummaryItems = [
    `Platform ${MAP2_PLATFORM_VERSION}`,
    hostInfo?.os_version ?? hostInfo?.kernel_version ?? 'OS version unavailable',
    hostInfo?.hostname ?? 'Host unavailable',
  ]
  const SnapshotEditorIcon = snapshotEditorNavItem?.icon

  return (
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}${isAudioGridWorkspaceRoute ? ' app-shell--audio-grid' : ''}${isThemedWorkspaceRoute ? ' app-shell--themed-workspace' : ''}${showLauncherShell ? ' app-shell--windowed' : ''}${showPerformFullscreen ? ' app-shell--perform-fullscreen' : ''}${location.pathname === '/' ? ' app-shell--landing' : ''}`}>
      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>
        {isDesktopRoute ? (
          <PageTransition>{children}</PageTransition>
        ) : (
          <section
            className={`app-window${closingAppRoute === location.pathname ? ' is-closing' : ' is-open'}`}
            aria-label={`${shellWorkspaceLabel} window`}
            style={{ '--window-shell-accent': shellAccentColor } as CSSProperties}
          >
            {!showPerformFullscreen ? (
              <div className="window-titlebar">
                <div className="window-titlebar__lead">
                  <span className="window-titlebar__badge" aria-hidden="true">
                    <ShellWindowIcon width={16} height={16} className="window-titlebar__icon" />
                  </span>
                  <div className="window-titlebar__copy">
                    <span className="window-titlebar__eyebrow">Program object</span>
                    <div className="window-titlebar__title-row">
                      <strong className="window-titlebar__title">{shellWorkspaceLabel}</strong>
                      <span className="window-titlebar__meta">{shellRouteHint}</span>
                    </div>
                  </div>
                </div>
                <div className="app-window__controls">
                  <button
                    type="button"
                    className="app-window__close"
                    aria-label={`Close ${shellWorkspaceLabel}`}
                    onClick={handleCloseCurrentApp}
                  >
                    X
                  </button>
                </div>
              </div>
            ) : null}
            <div className="app-window__body">
              <PageTransition>{children}</PageTransition>
            </div>
          </section>
        )}
      </main>

      {showMobileConnectionBanner ? (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      ) : null}

      {showLauncherShell ? (
        <div className="shell-launcher" ref={navMenuRef} style={{ '--window-shell-accent': shellAccentColor } as CSSProperties}>
          <div className="shell-launcher__button-wrap">
            <button
              type="button"
              className={`shell-launcher__button${navOpen ? ' is-active' : ''}`}
              onClick={handleMenuToggle}
              aria-label={navOpen ? 'Close platform menu' : 'Open platform menu'}
              aria-haspopup="menu"
              aria-expanded={navOpen}
              aria-controls="shell-launcher-panel"
            >
              <Map2BrandMark className="shell-launcher__button-icon" />
            </button>

            {navOpen ? (
              <Layer
                id="shell-launcher-panel"
                className="shell-launcher__panel"
                role="menu"
                aria-label="Platform menu"
              >
                <div className="shell-launcher__header">
                  <div className="shell-launcher__header-main">
                    <div className="shell-launcher__header-mark" aria-hidden="true">
                      <Map2BrandMark className="shell-launcher__header-icon" />
                    </div>
                    <div className="shell-launcher__header-copy">
                      <strong>{MAP2_PLATFORM_NAME}</strong>
                      {launcherSummaryItems.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                  {SnapshotEditorIcon ? (
                    <button
                      type="button"
                      className="shell-launcher__header-action"
                      aria-label="Open Snapshot Editor"
                      title="Open Snapshot Editor"
                      onClick={() => {
                        closeShellMenus()
                        navigate('/juce-grid')
                      }}
                    >
                      <SnapshotEditorIcon aria-hidden />
                    </button>
                  ) : null}
                </div>

                <div className="shell-launcher__system-summary" aria-label="System summary">
                  <div className="shell-launcher__summary-row">
                    <NodeNavBar />
                  </div>
                  <div className="shell-launcher__summary-row shell-launcher__summary-row--metrics">
                    <LatencyPressureShellReadout />
                    <TaskbarClock />
                  </div>
                  <div className="shell-launcher__summary-status-list" aria-label="Platform status">
                    <span>{platformStatus.avb.label}</span>
                    <span>{platformStatus.avdecc.label}</span>
                    <span>{platformStatus.nodes.label}</span>
                  </div>
                </div>

                <div className="shell-launcher__body">
                  <div className="shell-launcher__tile-grid">
                    {startMenuTileItems.map((item) => renderStartMenuItem(item))}
                  </div>
                </div>

                <div className="shell-launcher__footer">
                  <div className="shell-launcher__power-root">
                    <button
                      type="button"
                      className={`shell-launcher__power-button${powerMenuOpen ? ' is-active' : ''}`}
                      onClick={() => {
                        setPowerMenuOpen((current) => !current)
                      }}
                      aria-haspopup="menu"
                      aria-expanded={powerMenuOpen}
                      aria-controls="shell-launcher-power-menu"
                    >
                      Power
                    </button>
                    {powerMenuOpen ? (
                      <div id="shell-launcher-power-menu" className="start-menu-power-menu" role="menu" aria-label="Power actions">
                        <button
                          type="button"
                          className="start-menu-power-menu__item"
                          onClick={() => {
                            setPowerMenuOpen(false)
                            setRestartConfirmOpen(true)
                          }}
                        >
                          Restart Backend
                        </button>
                        <button
                          type="button"
                          className="start-menu-power-menu__item"
                          onClick={handleRefreshPage}
                        >
                          Refresh Desktop
                        </button>
                        <button
                          type="button"
                          className="start-menu-power-menu__item"
                          onClick={handleLogOut}
                        >
                          Log Out
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Layer>
            ) : null}
          </div>
        </div>
      ) : null}

      <ComposedModal className="shell-power-modal" open={restartConfirmOpen} onClose={() => setRestartConfirmOpen(false)} size="sm">
        <ModalHeader title="Restart backend" label="Power" closeModal={() => setRestartConfirmOpen(false)} />
        <ModalBody>
          Restart the MAP2 backend service? Audio processing will pause briefly while the shell reconnects.
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setRestartConfirmOpen(false)}>
            Cancel
          </Button>
          <Button kind="primary" onClick={() => void handleConfirmRestartBackend()}>
            Confirm restart
          </Button>
        </ModalFooter>
      </ComposedModal>

      {restartProgressStage !== 'idle' ? (
        <div className="shell-restart-overlay" role="status" aria-live="polite">
          <div className="shell-restart-overlay__panel">
            <div className="shell-restart-overlay__eyebrow">Power</div>
            <h2 className="shell-restart-overlay__title">
              {restartProgressStage === 'error' ? 'Restart failed' : 'Restarting backend'}
            </h2>
            <p className="shell-restart-overlay__subtitle">
              {restartProgressStage === 'error'
                ? (restartError ?? 'The backend restart request did not complete.')
                : restartCurrentStep?.description}
            </p>
            {restartProgressStage === 'error' ? (
              <Button kind="primary" onClick={() => setRestartProgressStage('idle')}>
                Close
              </Button>
            ) : (
              <>
                <ProgressBar
                  className="shell-restart-overlay__progress"
                  label="Restart progress"
                  hideLabel
                  helperText={restartCurrentStep?.label}
                  value={((restartProgressIndex + 1) / restartProgressSteps.length) * 100}
                />
                <div className="shell-restart-overlay__steps" aria-label="Restart progress steps">
                  {restartProgressSteps.map((step, index) => {
                    const isActive = step.key === restartProgressStage
                    const isComplete = index < restartProgressIndex || restartProgressStage === 'ready'
                    return (
                      <div
                        key={step.key}
                        className={`shell-restart-overlay__step${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
                      >
                        <span className="shell-restart-overlay__step-label">{step.label}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
