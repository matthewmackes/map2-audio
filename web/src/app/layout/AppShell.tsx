import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTransition } from '../components/PageTransition'
import { RestartOverlay } from './RestartOverlay'
import { ShellPowerModal } from './ShellPowerModal'
import { ShellWindowProvider } from './ShellWindowContext'
import type { ShellWindowContextValue } from './ShellWindowContext'
import { useAppShellPresentation } from './useAppShellPresentation'
import { useRestartBackend } from './useRestartBackend'
import { useRunningRoutes } from './useRunningRoutes'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { SHELL_OPEN_RESTART_CONFIRM_EVENT } from './shellEvents'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from '../pages/homeDesktopSession'
import { writeHomeShellRecentRoute } from '../pages/homeShellNavigation'
import { GlobalTreeNav } from './GlobalTreeNav/GlobalTreeNav'
import '../components/shared/GlobalPrimitives.css'
import './AppShell.css'

const GLOBAL_NAV_PINNED_STORAGE_KEY = 'map2:global-nav:pinned'

function readGlobalNavPinned(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const raw = window.localStorage.getItem(GLOBAL_NAV_PINNED_STORAGE_KEY)
    return raw == null ? true : raw !== 'false'
  } catch {
    return true
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { status: websocketStatus } = useWebSocketConnection()
  const [globalNavPinned, setGlobalNavPinned] = useState<boolean>(() => readGlobalNavPinned())
  const closeShellMenus = useCallback(() => {}, [])
  const {
    isDesktopRoute,
    shellAccentColor,
    shellClassName,
    shellRouteHint,
    shellWindowIcon: ShellWindowIcon,
    shellWorkspaceLabel,
  } = useAppShellPresentation({
    pathname: location.pathname,
  })
  const { handleCloseCurrentApp } = useRunningRoutes({
    pathname: location.pathname,
    isDesktopRoute,
    navigate,
    closeShellMenus,
    closeDurationMs: 0,
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

  const shellWindowContext = useMemo<ShellWindowContextValue>(
    () => ({
      title: shellWorkspaceLabel,
      titleIcon: ShellWindowIcon,
      routeHint: shellRouteHint,
      accentColor: shellAccentColor,
      onClose: handleCloseCurrentApp,
    }),
    [shellWorkspaceLabel, ShellWindowIcon, shellRouteHint, shellAccentColor, handleCloseCurrentApp],
  )

  useEffect(() => {
    const handleOpenRestartConfirm = () => {
      closeShellMenus()
      setRestartConfirmOpen(true)
    }

    window.addEventListener(SHELL_OPEN_RESTART_CONFIRM_EVENT, handleOpenRestartConfirm)
    return () => {
      window.removeEventListener(SHELL_OPEN_RESTART_CONFIRM_EVENT, handleOpenRestartConfirm)
    }
  }, [closeShellMenus, setRestartConfirmOpen])

  useEffect(() => {
    writeHomeShellRecentRoute(`${location.pathname}${location.search}`)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(GLOBAL_NAV_PINNED_STORAGE_KEY, globalNavPinned ? 'true' : 'false')
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  }, [globalNavPinned])

  return (
    <div
      className={shellClassName}
      style={{
        '--window-shell-accent': shellAccentColor,
        '--global-tree-width': globalNavPinned ? '16rem' : '3.5rem',
        '--global-tree-banner-left-offset': globalNavPinned ? '16rem' : '3.5rem',
      } as CSSProperties}
    >
      <div className="app-shell__frame">
        {globalNavPinned ? (
          <GlobalTreeNav
            isPinned={globalNavPinned}
            onLogOut={() => returnHomeDesktopToBoot()}
            onOpenRestartConfirm={() => setRestartConfirmOpen(true)}
            onRefreshPage={() => reloadHomeDesktopShell()}
            onTogglePinned={() => setGlobalNavPinned(false)}
          />
        ) : (
          <aside className="app-shell__nav-collapsed-rail" aria-label="Collapsed navigation rail">
            <button
              type="button"
              className="app-shell__nav-pin-toggle"
              aria-label="Pin Navigation"
              onClick={() => setGlobalNavPinned(true)}
            >
              Pin Navigation
            </button>
          </aside>
        )}
        <main className="app-content app-content--with-global-tree">
          <ShellWindowProvider value={isDesktopRoute ? null : shellWindowContext}>
            <PageTransition>{children}</PageTransition>
          </ShellWindowProvider>
        </main>
      </div>
      {(websocketStatus === 'reconnecting' || websocketStatus === 'error') ? (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      ) : null}
      <ShellPowerModal
        open={restartConfirmOpen}
        onClose={() => setRestartConfirmOpen(false)}
        onConfirm={() => void handleConfirmRestartBackend()}
      />
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
