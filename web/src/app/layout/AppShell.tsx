import type { ReactNode } from 'react'
import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTransition } from '../components/PageTransition'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { RestartOverlay } from './RestartOverlay'
import { ShellLauncherPanel } from './ShellLauncherPanel'
import { ShellPowerModal } from './ShellPowerModal'
import { ShellWindowProvider } from './ShellWindowContext'
import type { ShellWindowContextValue } from './ShellWindowContext'
import { useAppShellState } from './useAppShellState'
import { useAppShellPresentation } from './useAppShellPresentation'
import { useRestartBackend } from './useRestartBackend'
import { useShellLauncherActions } from './useShellLauncherActions'
import { useRunningRoutes } from './useRunningRoutes'
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { useLauncherInterfaceSummary } from './useLauncherInterfaceSummary'
import { SHELL_OPEN_RESTART_CONFIRM_EVENT } from './shellEvents'
import '../components/shared/GlobalPrimitives.css'
import './AppShell.css'
export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { status: websocketStatus } = useWebSocketConnection()
  const pendingPushConfirmationQuery = usePushConfirmation(undefined, { refetchInterval: 15_000 })
  const platformStatus = useHomePlatformStatus()
  const { data: hostInfo } = useHostMachineInfo()
  const {
    closeShellMenus,
    navMenuRef,
    navOpen,
    performFullscreen,
    powerMenuOpen,
    setNavOpen,
    setPowerMenuOpen,
  } = useAppShellState({ pathname: location.pathname })
  const launcherInterfaceSummary = useLauncherInterfaceSummary(navOpen)
  const {
    isAudioGridWorkspaceRoute,
    isDesktopRoute,
    isIntegratedWorkspaceRoute,
    launcherSummaryItems,
    platformStatusLabels,
    shellAccentColor,
    shellClassName,
    shellRouteHint,
    shellWindowIcon: ShellWindowIcon,
    shellWorkspaceLabel,
    showMobileConnectionBanner,
    startMenuTileItems,
  } = useAppShellPresentation({
    hostInfo,
    pathname: location.pathname,
    platformStatus,
    websocketStatus,
  })
  const showPerformFullscreen = location.pathname === '/perform' && performFullscreen
  const showLauncherShell = !showPerformFullscreen && !isDesktopRoute
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
  const launcherActions = useShellLauncherActions({
    closeShellMenus,
    navOpen,
    setNavOpen,
    setPowerMenuOpen,
    setRestartConfirmOpen,
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

  return (
    <div
      className={`${showLauncherShell ? shellClassName : shellClassName.replace(' app-shell--windowed', '')}${showPerformFullscreen ? ' app-shell--perform-fullscreen' : ''}`}
      style={!isDesktopRoute ? { '--window-shell-accent': shellAccentColor } as CSSProperties : undefined}
    >
      <main className="app-content app-content--full">
        <ShellWindowProvider value={isDesktopRoute ? null : shellWindowContext}>
          <PageTransition>{children}</PageTransition>
        </ShellWindowProvider>
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
          launcherInterfaceSummary={launcherInterfaceSummary}
          launcherRef={navMenuRef}
          navOpen={navOpen}
          powerMenuOpen={powerMenuOpen}
          launcherSummaryItems={launcherSummaryItems}
          pendingPushConfirmation={pendingPushConfirmationQuery.data?.pending_confirmation ?? null}
          platformStatusLabels={platformStatusLabels}
          startMenuTileItems={startMenuTileItems}
          onToggleMenu={launcherActions.onToggleMenu}
          onTogglePowerMenu={launcherActions.onTogglePowerMenu}
          onCloseMenus={launcherActions.onCloseMenus}
          onOpenRestartConfirm={launcherActions.onOpenRestartConfirm}
          onRefreshPage={launcherActions.onRefreshPage}
          onLogOut={launcherActions.onLogOut}
        />
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
