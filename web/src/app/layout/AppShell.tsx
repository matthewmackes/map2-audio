import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, ComposedModal, ModalBody, ModalFooter, ModalHeader } from '@carbon/react'
import { useLocation, useNavigate } from 'react-router-dom'

import { PageTransition } from '../components/PageTransition'
import {
  MAP2_PLATFORM_VERSION,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import {
  allPinnableNavigationItems,
  allRouteNavigationItems,
} from '../data/advancedMenuItems'
import {
  launcherCatalogDisplayItems,
} from '../data/launcherCatalog'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from '../pages/homeDesktopSession'
import { RestartOverlay } from './RestartOverlay'
import { ShellLauncherPanel, type StartMenuTileItem } from './ShellLauncherPanel'
import { useRestartBackend } from './useRestartBackend'
import { useRunningRoutes } from './useRunningRoutes'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import './AppShell.css'

const APP_WINDOW_CLOSE_DURATION_MS = 180

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`))
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
  const [performFullscreen, setPerformFullscreen] = useState(location.pathname === '/perform')
  const navMenuRef = useRef<HTMLDivElement>(null)

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

  const {
    closingAppRoute,
    handleCloseCurrentApp,
  } = useRunningRoutes({
    pathname: location.pathname,
    isDesktopRoute,
    navigate,
    closeShellMenus,
    closeDurationMs: APP_WINDOW_CLOSE_DURATION_MS,
  })

  const {
    restartConfirmOpen,
    restartProgressStage,
    restartError,
    restartProgressSteps,
    restartProgressIndex,
    restartCurrentStep,
    setRestartConfirmOpen,
    setRestartProgressStage,
    handleConfirmRestartBackend,
  } = useRestartBackend({
    closeShellMenus,
    websocketStatus,
  })

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

  const launcherSummaryItems = [
    `Platform ${MAP2_PLATFORM_VERSION}`,
    hostInfo?.os_version ?? hostInfo?.kernel_version ?? 'OS version unavailable',
    hostInfo?.hostname ?? 'Host unavailable',
  ]
  const platformStatusLabels = [platformStatus.avb.label, platformStatus.avdecc.label, platformStatus.nodes.label]
  const SnapshotEditorIcon = snapshotEditorNavItem?.icon ?? null

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
        <ShellLauncherPanel
          accentColor={shellAccentColor}
          launcherRef={navMenuRef}
          navOpen={navOpen}
          powerMenuOpen={powerMenuOpen}
          launcherSummaryItems={launcherSummaryItems}
          platformStatusLabels={platformStatusLabels}
          startMenuTileItems={startMenuTileItems}
          SnapshotEditorIcon={SnapshotEditorIcon}
          onToggleMenu={() => {
            const nextOpen = !navOpen
            setNavOpen(nextOpen)
            setPowerMenuOpen(false)
          }}
          onTogglePowerMenu={() => {
            setPowerMenuOpen((current) => !current)
          }}
          onCloseMenus={closeShellMenus}
          onOpenSnapshotEditor={() => {
            closeShellMenus()
            navigate('/juce-grid')
          }}
          onOpenRestartConfirm={() => {
            setPowerMenuOpen(false)
            setRestartConfirmOpen(true)
          }}
          onRefreshPage={() => {
            closeShellMenus()
            reloadHomeDesktopShell()
          }}
          onLogOut={() => {
            closeShellMenus()
            returnHomeDesktopToBoot()
          }}
        />
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

      <RestartOverlay
        restartProgressStage={restartProgressStage}
        restartError={restartError}
        restartProgressSteps={restartProgressSteps}
        restartProgressIndex={restartProgressIndex}
        restartCurrentStep={restartCurrentStep}
        onDismiss={() => setRestartProgressStage('idle')}
      />
    </div>
  )
}
