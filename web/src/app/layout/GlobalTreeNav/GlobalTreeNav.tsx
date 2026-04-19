import { FeatureFlags, Layer, Popover, PopoverContent, Tooltip, TreeView } from '@carbon/react'
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChartLine,
  Devices,
  Home,
  IbmWatsonMachineLearning,
  Music,
  Logout,
  Pin,
  PinFilled,
  Power,
  Renew,
  Restart,
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
  onOpenRebootConfirm: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
  onTogglePinned: () => void
}

type TreeIconComponent = NonNullable<ComponentProps<typeof TreeView.TreeNode>['renderIcon']>

type TreeItemDefinition = {
  id: string
  label: string
  route?: string
  icon?: TreeIconComponent
  children?: TreeItemDefinition[]
}

const GLOBAL_TREE_STORAGE_KEY = 'map2:global-tree:expanded'
const TOP_LEVEL_ROUTE_ORDER = [
  '/',
  '/snapshot-editor',
  '/workspace',
  '/midi-hub',
  '/workspace/artifacts',
  '/hardware',
  '/platforms/about',
] as const

const FLAT_TOP_LEVEL_ROUTES = new Set([
  '/',
  '/snapshot-editor',
  '/platforms/about',
])
const HARDWARE_TREE_ID = '/hardware'
const HARDWARE_PHYSICAL_SURFACES_ID = '/hardware::physical-surfaces'
const HARDWARE_OUTBOARD_GEAR_ID = '/hardware::outboard-gear'

const TREE_ICON_OVERRIDES: Record<string, TreeIconComponent> = {
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
  '/maschine/midi-map': Music,
  '/ground-control-pro': Music,
  '/labs/push-surface': IbmWatsonMachineLearning,
  '/expression': ChartLine,
  '/lcd': ScreenMap,
}

const TREE_LABEL_OVERRIDES: Record<string, string> = {
  '/workspace': 'Control Panel',
  '/snapshot-editor': 'Snapshot Editor',
  '/midi-hub': 'MIDI Advanced',
  '/workspace/artifacts': 'Audio Artifacts',
  '/platforms/about': 'Platform Guide',
  '/hardware': 'Hardware',
  '/labs/push-surface': 'Push Surface',
  '/ground-control-pro': 'Ground Control Pro',
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
  const defaultExpandedIds = ['/workspace', '/midi-hub', HARDWARE_TREE_ID, HARDWARE_PHYSICAL_SURFACES_ID, HARDWARE_OUTBOARD_GEAR_ID]

  if (typeof window === 'undefined') {
    return defaultExpandedIds
  }

  try {
    const raw = window.localStorage.getItem(GLOBAL_TREE_STORAGE_KEY)
    if (!raw) {
      return defaultExpandedIds
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : defaultExpandedIds
  } catch {
    return defaultExpandedIds
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
  const childRoutePath = normalizedRoute.split('?')[0]
  const nestedChildren = getLauncherCatalogTreeChildren(childRoutePath)
    .filter((nestedChild) => normalizeTarget(nestedChild.route).split('?')[0] !== childRoutePath)
    .map((nestedChild) => buildChildTreeItem(normalizedRoute, nestedChild))

  return {
    id: `${parentId}::${normalizedRoute}`,
    label: child.label,
    route: normalizedRoute,
    icon: TREE_ICON_OVERRIDES[childRoutePath] ?? childNavigationItem?.icon,
    children: nestedChildren,
  }
}

function buildHardwareTree(): TreeItemDefinition {
  const physicalSurfacesItem = getLauncherCatalogItem('/workspace/physical-surfaces')
  const outboardHardwareItem = getLauncherCatalogItem('/workspace/outboard-hardware')
  const physicalSurfacesChildren = getLauncherCatalogTreeChildren('/workspace/physical-surfaces')
    .map((child) => buildChildTreeItem(HARDWARE_PHYSICAL_SURFACES_ID, child))
  const outboardOverviewChildren = getLauncherCatalogTreeChildren('/workspace/outboard-hardware')
  const outboardChildren = outboardOverviewChildren.map((child) => {
    const normalizedRoute = normalizeTarget(child.route)
    const routePath = normalizedRoute.split('?')[0]
    const navigationItem = findNavigationItem(routePath)
    const nestedChildren = getLauncherCatalogTreeChildren(routePath)
      .filter((nestedChild) => normalizeTarget(nestedChild.route).split('?')[0] !== routePath)
      .map((nestedChild) => buildChildTreeItem(normalizedRoute, nestedChild))

    return {
      id: `${HARDWARE_OUTBOARD_GEAR_ID}::${normalizedRoute}`,
      label: child.label,
      route: normalizedRoute,
      icon: TREE_ICON_OVERRIDES[routePath] ?? navigationItem?.icon,
      children: nestedChildren,
    }
  })

  return {
    id: HARDWARE_TREE_ID,
    label: 'Hardware',
    icon: Devices,
    children: [
      {
        id: HARDWARE_PHYSICAL_SURFACES_ID,
        label: 'Physical Surfaces',
        route: '/workspace/physical-surfaces',
        icon: TREE_ICON_OVERRIDES['/workspace/physical-surfaces'] ?? physicalSurfacesItem?.icon,
        children: physicalSurfacesChildren,
      },
      {
        id: HARDWARE_OUTBOARD_GEAR_ID,
        label: 'Outboard Gear',
        route: '/workspace/outboard-hardware',
        icon: TREE_ICON_OVERRIDES['/workspace/outboard-hardware'] ?? outboardHardwareItem?.icon ?? MapRackDeviceIcon,
        children: outboardChildren,
      },
    ],
  }
}

function buildTreeItems(): TreeItemDefinition[] {
  return TOP_LEVEL_ROUTE_ORDER.flatMap((route) => {
    if (route === HARDWARE_TREE_ID) {
      return [buildHardwareTree()]
    }

    const launcherItem = getLauncherCatalogItem(route)
    const navigationItem = findNavigationItem(route)
    const label = resolveTreeLabel(route, launcherItem?.heroTitle ?? navigationItem?.label)

    if (!label) {
      return []
    }

    const children = FLAT_TOP_LEVEL_ROUTES.has(route)
      ? []
      : getLauncherCatalogTreeChildren(route).map((child) => buildChildTreeItem(route, child))
    return [{
      id: route,
      label,
      route: children.length > 0 ? children[0]?.route ?? route : normalizeTarget(route),
      icon: TREE_ICON_OVERRIDES[route] ?? launcherItem?.icon ?? navigationItem?.icon,
      children,
    }]
  })
}

function findActiveNodePath(items: TreeItemDefinition[], pathname: string, search: string): string[] | null {
  for (const item of items) {
    if (item.children?.length) {
      const nestedMatch = findActiveNodePath(item.children, pathname, search)
      if (nestedMatch) {
        return [item.id, ...nestedMatch]
      }
    }

    if (item.route && routeMatchesLocation(item.route, pathname, search)) {
      return [item.id]
    }
  }

  return null
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function TreeNodeLabel({ label, secondary, isBold = false }: { label: string; secondary?: ReactNode; isBold?: boolean }) {
  return (
    <span className={`global-tree-nav__node-copy${isBold ? ' global-tree-nav__node-copy--bold' : ''}`}>
      <span className="global-tree-nav__node-label">{label}</span>
      {secondary ? <span className="global-tree-nav__node-secondary">{secondary}</span> : null}
    </span>
  )
}

const BOLD_TOP_LEVEL_ROUTES = new Set([
  '/',
  '/snapshot-editor',
  '/workspace',
  '/midi-hub',
  '/workspace/artifacts',
  '/platforms/about',
  '/hardware',
])

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
    const selected = item.id === activeNodeId
    const isBold = BOLD_TOP_LEVEL_ROUTES.has(item.id)

    if (item.children?.length) {
      return (
        <TreeView.TreeNode
          key={item.id}
          id={item.id}
          className={joinClasses('global-tree-nav__tree-node', selected && 'is-selected')}
          isExpanded={expandedIds.includes(item.id)}
          label={<TreeNodeLabel label={item.label} isBold={isBold} />}
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
        label={<TreeNodeLabel label={item.label} isBold={isBold} />}
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
  onOpenRebootConfirm,
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
  const activeNodePath = useMemo(
    () => findActiveNodePath(treeItems, location.pathname, location.search),
    [location.pathname, location.search, treeItems],
  )
  const activeNodeId = activeNodePath?.[activeNodePath.length - 1] ?? null
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

  useEffect(() => {
    if (!activeNodePath || activeNodePath.length < 2) {
      return
    }

    setExpandedIds((previous) => {
      const next = new Set(previous)
      for (const ancestorId of activeNodePath.slice(0, -1)) {
        next.add(ancestorId)
      }
      return Array.from(next)
    })
  }, [activeNodePath])

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
              {isPinned ? <PinFilled size={18} aria-hidden="true" /> : <Pin size={18} aria-hidden="true" />}
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

          <div className="global-tree-nav__quick-actions" role="group" aria-label="System actions">
            <Tooltip label="Refresh" align="bottom" enterDelayMs={300}>
              <button
                type="button"
                className="global-tree-nav__quick-action global-tree-nav__quick-action--refresh"
                aria-label="Refresh"
                onClick={onRefreshPage}
              >
                <Renew size={18} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Restart" align="bottom" enterDelayMs={300}>
              <button
                type="button"
                className="global-tree-nav__quick-action global-tree-nav__quick-action--restart"
                aria-label="Restart"
                onClick={onOpenRestartConfirm}
              >
                <Restart size={18} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Log Out" align="bottom" enterDelayMs={300}>
              <button
                type="button"
                className="global-tree-nav__quick-action global-tree-nav__quick-action--logout"
                aria-label="Log Out"
                onClick={onLogOut}
              >
                <Logout size={18} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Full system reboot" align="bottom" enterDelayMs={300}>
              <button
                type="button"
                className="global-tree-nav__quick-action global-tree-nav__quick-action--reboot"
                aria-label="Full system reboot"
                onClick={onOpenRebootConfirm}
              >
                <Power size={18} aria-hidden />
              </button>
            </Tooltip>
          </div>
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

      </aside>
    </Layer>
  )
}

export default GlobalTreeNav
