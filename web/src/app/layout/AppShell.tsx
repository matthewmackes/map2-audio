import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronUp } from '@carbon/icons-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageTransition } from '../components/PageTransition'
import { RebootConfirmModal } from './RebootConfirmModal'
import { RebootOverlay } from './RebootOverlay'
import { RestartOverlay } from './RestartOverlay'
import { ShellPowerModal } from './ShellPowerModal'
import { useRebootSystem } from './useRebootSystem'
import { ShellWindowProvider, type ShellActionSlot, type ShellWindowContextValue } from './ShellWindowContext'
import { ShellWindowMutatorProvider, type ShellWindowMutator, type ShellWindowPatch } from './ShellWindowMutatorContext'
import { useAppShellPresentation } from './useAppShellPresentation'
import { useRestartBackend } from './useRestartBackend'
import { useRunningRoutes } from './useRunningRoutes'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { SHELL_OPEN_RESTART_CONFIRM_EVENT } from './shellEvents'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from '../pages/homeDesktopSession'
import { writeHomeShellRecentRoute } from '../pages/homeShellNavigation'
import { GlobalTreeNav } from './GlobalTreeNav/GlobalTreeNav'
import { WorkspaceBar } from './chrome/WorkspaceBar'
import { ContentKicker } from './chrome/ContentKicker'
import './chrome/chrome-tokens.css'
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
  const [shellPatch, setShellPatch] = useState<ShellWindowPatch>({})
  const closeShellMenus = useCallback(() => {}, [])
  const {
    isDesktopRoute,
    shellAccentColor,
    shellClassName,
    shellCrumbs,
    shellKicker,
    shellRouteHint,
    shellSubtitle,
    shellTitle,
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
    rebootConfirmOpen,
    rebootStage,
    rebootError,
    preflight,
    preflightLoading,
    rebootProgressIndex,
    rebootCurrentStep,
    handleOpenRebootConfirm,
    handleConfirmReboot,
    setRebootStage,
    setRebootConfirmOpen,
  } = useRebootSystem({ closeShellMenus, websocketStatus })

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

  // Reset page patch whenever route changes so stale per-page metadata
  // doesn't leak across navigations.
  useEffect(() => {
    setShellPatch({})
  }, [location.pathname])

  const mutator = useMemo<ShellWindowMutator>(() => ({
    set: (patch) => setShellPatch(patch),
    clear: () => setShellPatch({}),
  }), [])

  const mergedActions: ShellActionSlot[] = shellPatch.actions ?? []

  const mergedTitle = shellPatch.title ?? shellTitle
  const mergedSubtitle = shellPatch.subtitle ?? shellSubtitle
  const mergedKicker = shellPatch.kicker ?? shellKicker
  const mergedCrumbs = shellPatch.crumbs ?? shellCrumbs
  const mergedAccent = shellPatch.accentColor ?? shellAccentColor
  const mergedLead = shellPatch.lead

  const shellWindowContext = useMemo<ShellWindowContextValue>(
    () => ({
      title: mergedTitle,
      subtitle: mergedSubtitle,
      kicker: mergedKicker,
      crumbs: mergedCrumbs,
      titleIcon: ShellWindowIcon,
      routeHint: shellRouteHint,
      accentColor: mergedAccent,
      actions: mergedActions,
      lead: mergedLead,
      onClose: handleCloseCurrentApp,
    }),
    [
      mergedTitle,
      mergedSubtitle,
      mergedKicker,
      mergedCrumbs,
      ShellWindowIcon,
      shellRouteHint,
      mergedAccent,
      mergedActions,
      mergedLead,
      handleCloseCurrentApp,
    ],
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

  const showTopChrome = !isDesktopRoute && location.pathname !== '/perform'

  return (
    <div
      className={shellClassName}
      style={{
        '--window-shell-accent': shellAccentColor,
        '--global-tree-width': globalNavPinned ? '16rem' : '3.5rem',
        '--global-tree-banner-left-offset': globalNavPinned ? '16rem' : '3.5rem',
        '--ctx-h': '0px',
        '--ws-h': showTopChrome ? '40px' : '0px',
      } as CSSProperties}
    >
      {showTopChrome ? (
        <WorkspaceBar
          workspaceLabel={mergedTitle || shellWorkspaceLabel}
          actions={mergedActions}
          onClose={handleCloseCurrentApp}
          closeLabel={`Close ${mergedTitle || shellWorkspaceLabel}`}
        />
      ) : null}
      <div className="app-shell__frame">
        {globalNavPinned ? (
          <GlobalTreeNav
            onLogOut={() => returnHomeDesktopToBoot()}
            onOpenRebootConfirm={() => void handleOpenRebootConfirm()}
            onOpenRestartConfirm={() => setRestartConfirmOpen(true)}
            onRefreshPage={() => reloadHomeDesktopShell()}
            onTogglePinned={() => setGlobalNavPinned(false)}
          />
        ) : (
          <aside className="app-shell__nav-collapsed-rail" aria-label="Collapsed navigation rail">
            <button
              type="button"
              className="app-shell__nav-pin-toggle"
              aria-label="Expand global navigation"
              onClick={() => setGlobalNavPinned(true)}
            >
              <ChevronUp size={18} aria-hidden="true" />
            </button>
          </aside>
        )}
        <main className="app-content app-content--with-global-tree">
          <ShellWindowProvider value={shellWindowContext}>
            <ShellWindowMutatorProvider value={mutator}>
              {showTopChrome ? (
                <ContentKicker
                  kicker={mergedKicker}
                  title={mergedTitle}
                  subtitle={mergedSubtitle}
                  lead={mergedLead}
                />
              ) : null}
              <PageTransition>{children}</PageTransition>
            </ShellWindowMutatorProvider>
          </ShellWindowProvider>
        </main>
      </div>
      {(websocketStatus === 'reconnecting' || websocketStatus === 'error') ? (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      ) : null}
      <RebootConfirmModal
        open={rebootConfirmOpen}
        preflightLoading={preflightLoading}
        preflight={preflight}
        onClose={() => setRebootConfirmOpen(false)}
        onConfirm={() => void handleConfirmReboot()}
      />
      <RebootOverlay
        rebootStage={rebootStage}
        rebootError={rebootError}
        rebootProgressIndex={rebootProgressIndex}
        rebootCurrentStep={rebootCurrentStep}
        onDismiss={() => setRebootStage('idle')}
      />
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
