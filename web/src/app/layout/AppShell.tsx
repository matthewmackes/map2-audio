import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import {
  NODE_PAGE_KEYS,
  getNodeStatusLabel,
  pageKeyFromPathname,
} from '../utils/nodeDisplay'
import { readPersisted, writePersisted } from '../utils/persistedState'
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

const GLOBAL_NAV_PINNED_KEY = {
  storageKey: 'map2:global-nav:pinned',
  fallback: true,
  // Pinned by default — only the explicit string "false" unpins.
  parse: (raw: string) => (raw === 'false' ? false : true),
  serialize: (value: boolean) => (value ? 'true' : 'false'),
} as const

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const nodePageKey = pageKeyFromPathname(location.pathname) ?? NODE_PAGE_KEYS.home
  const { status: websocketStatus } = useWebSocketConnection()
  const { topologyNodes, viewedNodeId } = useNodePageContext(nodePageKey)
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const [globalNavPinned, setGlobalNavPinned] = useState<boolean>(() => readPersisted(GLOBAL_NAV_PINNED_KEY))
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
    writePersisted(GLOBAL_NAV_PINNED_KEY, globalNavPinned)
  }, [globalNavPinned])

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
        '--global-tree-width': globalNavPinned ? '16rem' : '3.5rem',
        '--global-tree-banner-left-offset': globalNavPinned ? '16rem' : '3.5rem',
        '--ctx-h': '0px',
        '--ws-h': '0px',
      } as CSSProperties}
    >
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
