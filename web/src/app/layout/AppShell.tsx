import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
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
export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { status: websocketStatus } = useWebSocketConnection()
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

  return (
    <div
      className={shellClassName}
      style={{ '--window-shell-accent': shellAccentColor } as CSSProperties}
    >
      <div className="app-shell__frame">
        <GlobalTreeNav
          onLogOut={() => returnHomeDesktopToBoot()}
          onOpenRestartConfirm={() => setRestartConfirmOpen(true)}
          onRefreshPage={() => reloadHomeDesktopShell()}
        />
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
