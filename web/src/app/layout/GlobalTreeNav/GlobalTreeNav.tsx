import { FeatureFlags, Layer, Popover, PopoverContent, TreeView } from '@carbon/react'
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChartLine,
  Home,
  IbmWatsonMachineLearning,
  Music,
  ScreenMap,
  Settings,
} from '@carbon/icons-react'

import { MapRackDeviceIcon } from '../../components/icons/map'
import { NodeMiniCard } from '../../components/NodeNav/NodeMiniCard'
import {
  allRouteNavigationItems,
  canonicalizeNavigationRoute,
  type HardwareInterfaceMenuItem,
  type ShellNavigationItem,
} from '../../data/advancedMenuItems'
import {
  getLauncherCatalogItem,
  getLauncherCatalogTreeChildren,
  type LauncherCatalogTreeChild,
} from '../../data/launcherCatalog'
import { platformPinnedItems, type PlatformPinnedNavItem } from '../../data/platformMenuItems'
import { useNodePageContext } from '../../hooks/useNodePageContext'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import {
  NODE_PAGE_KEYS,
  formatNodeDisplayName,
  getNodeStatusLabel,
  pageKeyFromPathname,
} from '../../utils/nodeDisplay'
import './GlobalTreeNav.css'

type GlobalTreeNavProps = {
  isPinned: boolean
  onLogOut: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
  onTogglePinned: () => void
}

type TreeItemDefinition = {
  id: string
  label: string
  route?: string
  icon?: ComponentType<any>
  children?: TreeItemDefinition[]
  isGroupHeader?: boolean
}

const GLOBAL_TREE_STORAGE_KEY = 'map2:global-tree:expanded'
const TOP_LEVEL_ROUTE_ORDER = [
  '/',
  '/snapshot-editor',
  'INSTRUMENTS_GROUP_HEADER',
  '/brain',
  'HARDWARE_GROUP_HEADER',
  '/midi-hub',
  '/tesira',
  '/mpx1',
  '/intelfx',
  '/edirol-ua1000',
  '/hotone-jogg',
  '/mcu',
  '/launch-control',
  '/midi-commander',
  '/maschine',
  '/ground-control-pro',
  '/labs/push-surface',
  '/expression',
  '/lcd',
  '/welcome',
] as const

const TREE_ICON_OVERRIDES: Record<string, ComponentType<any>> = {
  '/': Home,
  '/snapshot-editor': ScreenMap,
  '/brain': Music,
  '/midi-hub': Music,
  '/tesira': Settings,
  '/mpx1': MapRackDeviceIcon,
  '/intelfx': MapRackDeviceIcon,
  '/edirol-ua1000': MapRackDeviceIcon,
  '/hotone-jogg': MapRackDeviceIcon,
  '/mcu': Music,
  '/launch-control': Music,
  '/midi-commander': Music,
  '/maschine': Music,
  '/ground-control-pro': Music,
  '/labs/push-surface': IbmWatsonMachineLearning,
  '/expression': ChartLine,
  '/lcd': ScreenMap,
}

const TREE_LABEL_OVERRIDES: Record<string, string> = {
  '/workspace': 'Control Panel',
  '/snapshot-editor': 'Snapshot Editor',
  '/labs/push-surface': 'Push Surface',
  '/ground-control-pro': 'Ground Control Pro',
}

const GROUP_HEADER_LABELS: Record<string, string> = {
  'INSTRUMENTS_GROUP_HEADER': 'Instruments',
  'HARDWARE_GROUP_HEADER': 'Hardware',
}

function normalizeTarget(target: string): string {
  const [pathnamePart, searchPart] = target.split('?')
  const pathname = canonicalizeNavigationRoute(pathnamePart.trim())
  return searchPart ? `${pathname}?${searchPart}` : pathname
}

function routeMatchesLocation(target: string, pathname: string, search: string): boolean {
  const normalizedTarget = normalizeTarget(target)
  const [targetPathname, targetSearch = ''] = normalizedTarget.split('?')
  const canonicalPathname = canonicalizeNavigationRoute(pathname)

  if (!(canonicalPathname === targetPathname || canonicalPathname.startsWith(`${targetPathname}/`))) {
    return false
  }

  if (!targetSearch) {
    return true
  }

  const currentSearch = search.startsWith('?') ? search.slice(1) : search
  return currentSearch === targetSearch
}

function readExpandedIds(): string[] {
  if (typeof window === 'undefined') {
    return ['/workspace', '/midi-hub']
  }

  try {
    const raw = window.localStorage.getItem(GLOBAL_TREE_STORAGE_KEY)
    if (!raw) {
      return ['/workspace', '/midi-hub']
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : ['/workspace', '/midi-hub']
  } catch {
    return ['/workspace', '/midi-hub']
  }
}

function findNavigationItem(route: string): PlatformPinnedNavItem | ShellNavigationItem | HardwareInterfaceMenuItem | null {
  const normalizedRoute = canonicalizeNavigationRoute(route)
  return platformPinnedItems.find((item) => canonicalizeNavigationRoute(item.to) === normalizedRoute)
    ?? allRouteNavigationItems.find((item) => canonicalizeNavigationRoute(item.to) === normalizedRoute)
    ?? null
}

function resolveTreeLabel(route: string, fallbackLabel: string | undefined): string {
  return TREE_LABEL_OVERRIDES[route] ?? fallbackLabel ?? route
}

function buildChildTreeItem(parentId: string, child: LauncherCatalogTreeChild): TreeItemDefinition {
  const normalizedRoute = normalizeTarget(child.route)
  const childNavigationItem = findNavigationItem(normalizedRoute.split('?')[0])

  return {
    id: `${parentId}::${normalizedRoute}`,
    label: child.label,
    route: normalizedRoute,
    icon: childNavigationItem?.icon,
  }
}

function buildTreeItems(): TreeItemDefinition[] {
  const items: TreeItemDefinition[] = []
  
  for (const route of TOP_LEVEL_ROUTE_ORDER) {
    // Handle group headers
    if (route.endsWith('_GROUP_HEADER')) {
      const label = GROUP_HEADER_LABELS[route]
      if (label) {
        items.push({
          id: route,
          label,
          isGroupHeader: true,
        })
      }
      continue
    }

    const launcherItem = getLauncherCatalogItem(route)
    const navigationItem = findNavigationItem(route)
    const label = resolveTreeLabel(route, launcherItem?.heroTitle ?? navigationItem?.label)

    if (!label) {
      continue
    }

    const children = getLauncherCatalogTreeChildren(route).map((child) => buildChildTreeItem(route, child))
    items.push({
      id: route,
      label,
      route: children.length > 0 ? children[0]?.route ?? route : normalizeTarget(route),
      icon: TREE_ICON_OVERRIDES[route] ?? launcherItem?.icon ?? navigationItem?.icon,
      children,
    })
  }
  
  return items
}

function findActiveNodeId(items: TreeItemDefinition[], pathname: string, search: string): string | null {
  for (const item of items) {
    if (item.children?.length) {
      const nestedMatch = findActiveNodeId(item.children, pathname, search)
      if (nestedMatch) {
        return nestedMatch
      }
    }

    if (item.route && routeMatchesLocation(item.route, pathname, search)) {
      return item.id
    }
  }

  return null
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function TreeNodeLabel({ label, secondary }: { label: string; secondary?: ReactNode }) {
  return (
    <span className="global-tree-nav__node-copy">
      <span className="global-tree-nav__node-label">{label}</span>
      {secondary ? <span className="global-tree-nav__node-secondary">{secondary}</span> : null}
    </span>
  )
}

function renderTreeItems(
  items: TreeItemDefinition[],
  activeNodeId: string | null,
  expandedIds: string[],
  setExpandedIds: React.Dispatch<React.SetStateAction<string[]>>,
  navigate: (route: string) => void,
): ReactNode[] {
  const setExpanded = (itemId: string, nextExpanded: boolean) => {
    setExpandedIds((previous) => {
      const next = new Set(previous)
      if (nextExpanded) {
        next.add(itemId)
      } else {
        next.delete(itemId)
      }
      return Array.from(next)
    })
  }

  return items.map((item) => {
    // Render group headers as non-interactive elements
    if (item.isGroupHeader) {
      return (
        <div key={item.id} className="global-tree-nav__group-header">
          {item.label}
        </div>
      )
    }

    const selected = item.id === activeNodeId

    if (item.children?.length) {
      return (
        <TreeView.TreeNode
          key={item.id}
          id={item.id}
          className={joinClasses('global-tree-nav__tree-node', selected && 'is-selected')}
          isExpanded={expandedIds.includes(item.id)}
          label={<TreeNodeLabel label={item.label} />}
          onSelect={(event) => {
            event.preventDefault()
            if (item.route) {
              navigate(item.route)
            }
          }}
          onToggle={(nextExpanded) => setExpanded(item.id, Boolean(nextExpanded))}
          renderIcon={item.icon}
        >
          {renderTreeItems(item.children, activeNodeId, expandedIds, setExpandedIds, navigate)}
        </TreeView.TreeNode>
      )
    }

    return (
      <TreeView.TreeNode
        key={item.id}
        id={item.id}
        className={joinClasses('global-tree-nav__tree-node', selected && 'is-selected')}
        label={<TreeNodeLabel label={item.label} />}
        onSelect={(event) => {
          event.preventDefault()
          if (item.route) {
            navigate(item.route)
          }
        }}
        renderIcon={item.icon}
      />
    )
  })
}

function syncNodeScope(setViewedNode: (pageKey: string, nodeId: string) => void, nodeId: string) {
  for (const pageKey of Object.values(NODE_PAGE_KEYS)) {
    setViewedNode(pageKey, nodeId)
  }
}

export function GlobalTreeNav({
  isPinned,
  onLogOut,
  onOpenRestartConfirm,
  onRefreshPage,
  onTogglePinned,
}: GlobalTreeNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const pageKey = pageKeyFromPathname(location.pathname) ?? NODE_PAGE_KEYS.home
  const { topologyNodes, viewedNodeId, nodeTopologyQuery } = useNodePageContext(pageKey)
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const [expandedIds, setExpandedIds] = useState<string[]>(() => readExpandedIds())
  const [nodeSelectorOpen, setNodeSelectorOpen] = useState(false)
  const treeItems = useMemo(() => buildTreeItems(), [])
  const activeNodeId = useMemo(
    () => findActiveNodeId(treeItems, location.pathname, location.search),
    [location.pathname, location.search, treeItems],
  )
  const displayedNode = topologyNodes.find((node) => node.node_id === viewedNodeId)
    ?? topologyNodes.find((node) => node.is_local)
    ?? null
  const sortedNodes = useMemo(() => {
    return [...topologyNodes].sort((left, right) => {
      if (left.is_local) return -1
      if (right.is_local) return 1
      return left.hostname.localeCompare(right.hostname)
    })
  }, [topologyNodes])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(GLOBAL_TREE_STORAGE_KEY, JSON.stringify(expandedIds))
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  }, [expandedIds])

  return (
    <Layer className="global-tree-nav__layer">
      <aside className="global-tree-nav" aria-label="Global navigation tree">
        <div className="global-tree-nav__header">
          <div className="global-tree-nav__header-row">
            <p className="global-tree-nav__eyebrow">Global Navigation</p>
            <button
              type="button"
              className="global-tree-nav__pin-button"
              aria-label={isPinned ? 'Unpin Navigation' : 'Pin Navigation'}
              aria-pressed={isPinned}
              onClick={onTogglePinned}
            >
              {isPinned ? 'Unpin Navigation' : 'Pin Navigation'}
            </button>
          </div>
          <Popover
            align="bottom-start"
            caret
            open={nodeSelectorOpen}
            onRequestClose={() => setNodeSelectorOpen(false)}
          >
            <button
              type="button"
              className="global-tree-nav__node-button"
              aria-label="Open node selector"
              onClick={() => setNodeSelectorOpen((current) => !current)}
            >
              <span className="global-tree-nav__node-button-copy">
                <span className="global-tree-nav__node-button-label">
                  {displayedNode ? formatNodeDisplayName(displayedNode) : 'Node discovery unavailable'}
                </span>
                <span className="global-tree-nav__node-button-status">
                  {displayedNode ? getNodeStatusLabel(displayedNode.status) : nodeTopologyQuery.isLoading ? 'Loading' : 'Unavailable'}
                </span>
              </span>
            </button>
            <PopoverContent className="global-tree-nav__node-popover">
              {displayedNode ? <NodeMiniCard node={displayedNode} pageKey={pageKey} onClose={() => setNodeSelectorOpen(false)} /> : null}
              <div className="global-tree-nav__node-switcher">
                <p className="global-tree-nav__node-switcher-title">Switch all pages to</p>
                <div className="global-tree-nav__node-switcher-list">
                  {sortedNodes.map((node) => (
                    <button
                      key={node.node_id}
                      type="button"
                      className={joinClasses(
                        'global-tree-nav__node-switcher-button',
                        node.node_id === viewedNodeId && 'is-active',
                      )}
                      onClick={() => {
                        syncNodeScope(setViewedNode, node.node_id)
                        setNodeSelectorOpen(false)
                      }}
                    >
                      <span>{formatNodeDisplayName(node)}</span>
                      <span>{getNodeStatusLabel(node.status)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="global-tree-nav__body">
          <FeatureFlags enableTreeviewControllable>
            <TreeView
              active={activeNodeId ?? undefined}
              className="global-tree-nav__tree"
              hideLabel
              label="All MAP2 pages"
              selected={activeNodeId ? [activeNodeId] : []}
              size="sm"
            >
              {renderTreeItems(treeItems, activeNodeId, expandedIds, setExpandedIds, (route) => navigate(route))}
            </TreeView>
          </FeatureFlags>
        </div>

        <div className="global-tree-nav__footer" role="group" aria-label="System actions">
          <button type="button" className="global-tree-nav__footer-button" onClick={onRefreshPage}>
            Refresh
          </button>
          <button type="button" className="global-tree-nav__footer-button" onClick={onOpenRestartConfirm}>
            Restart
          </button>
          <button type="button" className="global-tree-nav__footer-button" onClick={onLogOut}>
            Log Out
          </button>
        </div>
      </aside>
    </Layer>
  )
}

export default GlobalTreeNav
