import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTransition } from '../components/PageTransition'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { AppWindow } from './AppWindow'
import { RestartOverlay } from './RestartOverlay'
import { ShellLauncherPanel } from './ShellLauncherPanel'
import { ShellPowerModal } from './ShellPowerModal'
import { useAppShellState } from './useAppShellState'
import { useAppShellPresentation } from './useAppShellPresentation'
import { useRestartBackend } from './useRestartBackend'
import { useShellLauncherActions } from './useShellLauncherActions'
import { useRunningRoutes } from './useRunningRoutes'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import './AppShell.css'
const APP_WINDOW_CLOSE_DURATION_MS = 180
export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { status: websocketStatus } = useWebSocketConnection()
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
  const {
    SnapshotEditorIcon,
    isAudioGridWorkspaceRoute,
    isDesktopRoute,
    isFullBleedBaseRoute,
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
  const isFullBleedRoute = isFullBleedBaseRoute || showPerformFullscreen
  const showLauncherShell = !showPerformFullscreen
  const { closingAppRoute, handleCloseCurrentApp } = useRunningRoutes({
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
  const launcherActions = useShellLauncherActions({
    closeShellMenus,
    navOpen,
    navigate,
    setNavOpen,
    setPowerMenuOpen,
    setRestartConfirmOpen,
  })
  return (
    <div className={`${showLauncherShell ? shellClassName : shellClassName.replace(' app-shell--windowed', '')}${showPerformFullscreen ? ' app-shell--perform-fullscreen' : ''}`}>
      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>
        {isDesktopRoute ? (
          <PageTransition>{children}</PageTransition>
        ) : (
          <AppWindow
            accentColor={shellAccentColor}
            ariaLabel={`${shellWorkspaceLabel} window`}
            closeLabel={`Close ${shellWorkspaceLabel}`}
            closing={closingAppRoute === location.pathname}
            routeHint={shellRouteHint}
            showPerformFullscreen={showPerformFullscreen}
            title={shellWorkspaceLabel}
            titleIcon={ShellWindowIcon}
            onClose={handleCloseCurrentApp}
          >
            {children}
          </AppWindow>
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
          onToggleMenu={launcherActions.onToggleMenu}
          onTogglePowerMenu={launcherActions.onTogglePowerMenu}
          onCloseMenus={launcherActions.onCloseMenus}
          onOpenSnapshotEditor={launcherActions.onOpenSnapshotEditor}
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
