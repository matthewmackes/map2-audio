import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
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
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import {
  NODE_PAGE_KEYS,
  getNodeStatusLabel,
  pageKeyFromPathname,
} from '../utils/nodeDisplay'
import {
  applyViewedNodeScopeToAllPages,
  readViewedHostFromSearch,
  writeViewedHostToSearch,
} from '../utils/viewedNodeScope'
import { SHELL_OPEN_RESTART_CONFIRM_EVENT } from './shellEvents'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from '../pages/homeDesktopSession'
import { writeHomeShellRecentRoute } from '../pages/homeShellNavigation'
import { GlobalTreeNav } from './GlobalTreeNav/GlobalTreeNav'
import { ContentKicker } from './chrome/ContentKicker'
import './chrome/chrome-tokens.css'
import '../styles/design-language.css'
import '../components/shared/GlobalPrimitives.css'
import './AppShell.css'

// 2026-05-03 nav reskin — sidebar is fixed-width 280 px, no
// collapse/resize. Width lives in CSS (.global-tree-nav) and is
// surfaced to the rest of the shell via --global-tree-width below.
const GLOBAL_NAV_WIDTH = '280px'

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const nodePageKey = pageKeyFromPathname(location.pathname) ?? NODE_PAGE_KEYS.home
  const { status: websocketStatus } = useWebSocketConnection()
  const { topologyNodes, viewedNodeId } = useNodePageContext(nodePageKey)
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const [shellPatch, setShellPatch] = useState<ShellWindowPatch>({})
  const lastQuerySyncedHostRef = useRef<string | null>(null)
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
  const displayedNode = useMemo(
    () => (
      topologyNodes.find((node) => node.node_id === viewedNodeId)
      ?? topologyNodes.find((node) => node.is_local)
      ?? topologyNodes[0]
      ?? null
    ),
    [topologyNodes, viewedNodeId],
  )
  const sortedNodes = useMemo(() => {
    return [...topologyNodes].sort((left, right) => {
      if (left.is_local) return -1
      if (right.is_local) return 1
      return left.hostname.localeCompare(right.hostname)
    })
  }, [topologyNodes])
  const syncViewedHost = useCallback((nodeId: string) => {
    applyViewedNodeScopeToAllPages(setViewedNode, nodeId)
    const nextSearch = writeViewedHostToSearch(location.search, nodeId)
    if (nextSearch !== location.search) {
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true })
    }
  }, [setViewedNode, navigate, location.pathname, location.search])
  const hostBreadcrumbRoot = useMemo(() => ({
    label: displayedNode?.hostname ?? 'Host unavailable',
    options: sortedNodes.map((node) => ({
      nodeId: node.node_id,
      label: node.hostname,
      secondaryLabel: node.display_label || undefined,
      statusLabel: getNodeStatusLabel(node.status),
      statusTone: node.status,
      isActive: node.node_id === viewedNodeId,
    })),
    disabled: sortedNodes.length <= 1,
    onSelect: syncViewedHost,
  }), [displayedNode, sortedNodes, viewedNodeId, syncViewedHost])

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
    const requestedNodeId = readViewedHostFromSearch(location.search)
    if (!requestedNodeId) {
      lastQuerySyncedHostRef.current = null
      return
    }
    if (!topologyNodes.some((node) => node.node_id === requestedNodeId)) {
      return
    }
    if (requestedNodeId === viewedNodeId) {
      lastQuerySyncedHostRef.current = requestedNodeId
      return
    }
    if (lastQuerySyncedHostRef.current === requestedNodeId) {
      return
    }
    applyViewedNodeScopeToAllPages(setViewedNode, requestedNodeId)
    lastQuerySyncedHostRef.current = requestedNodeId
  }, [location.search, topologyNodes, viewedNodeId, setViewedNode])

  const showTopChrome = !isDesktopRoute && location.pathname !== '/perform'

  return (
    <div
      className={shellClassName}
      style={{
        '--window-shell-accent': shellAccentColor,
        '--global-tree-width': GLOBAL_NAV_WIDTH,
        '--global-tree-banner-left-offset': GLOBAL_NAV_WIDTH,
        '--ctx-h': '0px',
        '--ws-h': '0px',
      } as CSSProperties}
    >
      <div className="app-shell__frame">
        <GlobalTreeNav
          onLogOut={() => returnHomeDesktopToBoot()}
          onOpenRebootConfirm={() => void handleOpenRebootConfirm()}
          onOpenRestartConfirm={() => setRestartConfirmOpen(true)}
          onRefreshPage={() => reloadHomeDesktopShell()}
        />
        <main className="app-content app-content--with-global-tree">
          <ShellWindowProvider value={shellWindowContext}>
            <ShellWindowMutatorProvider value={mutator}>
              {showTopChrome ? (
                <ContentKicker
                  kicker={mergedKicker}
                  title={mergedTitle}
                  subtitle={mergedSubtitle}
                  lead={mergedLead}
                  crumbs={mergedCrumbs}
                  hostRoot={hostBreadcrumbRoot}
                  actions={mergedActions}
                  onClose={handleCloseCurrentApp}
                  closeLabel={`Close ${mergedTitle || shellWorkspaceLabel}`}
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
