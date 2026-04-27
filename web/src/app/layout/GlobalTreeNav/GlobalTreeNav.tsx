import {
  FeatureFlags,
  Layer,
  OverflowMenu,
  OverflowMenuItem,
  Popover,
  PopoverContent,
  Tooltip,
  TreeView,
} from '@carbon/react'
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Add,
  AddAlt,
  AudioConsole,
  BareMetalServer,
  ChartLine,
  ChartNetwork,
  Chemistry,
  ChevronDown,
  ColorPalette,
  Connect,
  Dashboard,
  Devices,
  Document,
  EventSchedule,
  Flash,
  Home,
  IbmWatsonMachineLearning,
  Information,
  Music,
  Logout,
  Network_3,
  PlayFilled,
  Plug,
  Power,
  Renew,
  Restart,
  ScanAlt,
  ScreenMap,
  Settings,
} from '@carbon/icons-react'

import { MapRackDeviceIcon } from '../../components/icons/map'
import { NodeIdentityCard } from '../../components/NodeNav/NodeIdentityCard'
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
import {
  DEVICE_REGISTRY,
  buildDeviceRoute,
  resolveDeviceOpenRoute,
  type DeviceRegistryEntry,
} from '../../data/deviceRegistry'
import { useKnownDevices } from '../../components/Devices/hooks/useDeviceProfiles'
import { platformPinnedItems, type PlatformPinnedNavItem } from '../../data/platformMenuItems'
import { pinDevice, unpinDevice, usePinnedDevices } from '../../state/uiSettings'
import { useToasts } from '../../components/Toasts'
import { useNodePageContext } from '../../hooks/useNodePageContext'
import { HOST_MACHINE_ROUTE } from '../../pages/hostMachineRoutes'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import {
  NODE_PAGE_KEYS,
  formatNodeDisplayName,
  getNodeStatusLabel,
  pageKeyFromPathname,
} from '../../utils/nodeDisplay'
import { useClusterSnapshotRuntimeLiveState } from '../../hooks/useSnapshotRuntimeState'
import { readPersisted, writePersisted, type PersistedKey } from '../../utils/persistedState'
import type { SnapshotRuntimeClusterLiveStateResponse, SnapshotRuntimeLiveState } from '../../../map2/types'
import './GlobalTreeNav.css'

type GlobalTreeNavProps = {
  onLogOut: () => void
  onOpenRebootConfirm: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
  onTogglePinned: () => void
}

type TreeIconComponent = NonNullable<ComponentProps<typeof TreeView.TreeNode>['renderIcon']>

export type TreeNodeAction = {
  label: string
  onClick: () => void
}

export type TreeItemDefinition = {
  id: string
  label: string
  route?: string
  icon?: TreeIconComponent
  children?: TreeItemDefinition[]
  actions?: TreeNodeAction[]
  secondary?: string
  secondaryTone?: TreeNodeSecondaryTone
  badge?: string
  featured?: boolean
  groupBoundary?: boolean
  separator?: boolean
}

type TreeNodeSecondaryTone = 'neutral' | 'live' | 'warning' | 'offline'

type SnapshotEditorTreeStatus = {
  label: string
  tone: TreeNodeSecondaryTone
}

const DEVICE_KIND_ORDER: DeviceRegistryEntry['kind'][] = [
  'processor',
  'console',
  'control-surface',
  'audio-interface',
]

const BROWSE_DEVICES_TREE_ID = '/hardware::devices::browse'
const PRIMARY_SEPARATOR_ONE_ID = '__separator-primary-1__'
const PRIMARY_SEPARATOR_TWO_ID = '__separator-primary-2__'

const DEFAULT_EXPANDED_IDS: readonly string[] = ['/workspace', '/midi-hub', '/hardware', '/hardware::devices']
const GLOBAL_TREE_EXPANDED_KEY: PersistedKey<string[]> = {
  storageKey: 'map2:global-tree:expanded',
  fallback: [...DEFAULT_EXPANDED_IDS],
  parse: (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return undefined
      return parsed.filter((value): value is string => typeof value === 'string')
    } catch {
      return undefined
    }
  },
}
const TOP_LEVEL_ROUTE_ORDER = [
  '/',
  '/snapshot-editor',
  '/midi/assignments',
  '/brain',
  '/workspace/artifacts',
  PRIMARY_SEPARATOR_ONE_ID,
  '/midi-hub',
  '/workspace',
  '/hardware',
  PRIMARY_SEPARATOR_TWO_ID,
  '/platforms/about',
] as const

const FLAT_TOP_LEVEL_ROUTES = new Set([
  '/',
  '/snapshot-editor',
  '/midi/assignments',
  '/platforms/about',
])
const HARDWARE_TREE_ID = '/hardware'
const HARDWARE_DEVICES_ID = '/hardware::devices'
const HARDWARE_HOST_MACHINE_ID = '/hardware::host-machine'

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
  '/midi/assignments': Music,
  '/lcd': ScreenMap,
  // Control Panel (/workspace) sub-items
  '/workspace/platforms/overview': Dashboard,
  '/workspace/platforms/management': Devices,
  '/workspace/platforms/audio-engine': AudioConsole,
  '/chains': Connect,
  '/workspace/platforms/avb-routing': ChartNetwork,
  '/workspace/platforms/network-discovery': ScanAlt,
  '/workspace/platforms/cluster-dashboard': Dashboard,
  '/workspace/platforms/midpoint': Flash,
  '/workspace/platforms/adoption': AddAlt,
  [HOST_MACHINE_ROUTE]: BareMetalServer,
  '/workspace/platforms/theme': ColorPalette,
  '/workspace/platforms/about': Information,
  // MIDI Advanced (/midi-hub) sub-items
  '/midi-hub/connections': Plug,
  '/midi-hub/presets': Document,
  '/midi-hub/transport': PlayFilled,
  '/midi-hub/events': EventSchedule,
  '/midi-hub/processing': Settings,
  '/midi-hub/network': Network_3,
  '/midi-hub/lab': Chemistry,
}

const TREE_LABEL_OVERRIDES: Record<string, string> = {
  '/workspace': 'Node Ops',
  '/snapshot-editor': 'Snapshot Editor',
  '/brain': 'Drums&Synth',
  '/midi-hub': 'MIDI Advanced',
  '/midi/assignments': 'MIDI Assignments',
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

  const currentParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const targetParams = new URLSearchParams(targetSearch)

  for (const [key, value] of targetParams.entries()) {
    if (currentParams.get(key) !== value) {
      return false
    }
  }

  return true
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

function compareSnapshotRuntimeStates(
  left: SnapshotRuntimeLiveState,
  right: SnapshotRuntimeLiveState,
  localNodeId: string | null,
) {
  if (left.node_id === localNodeId && right.node_id !== localNodeId) {
    return -1
  }
  if (right.node_id === localNodeId && left.node_id !== localNodeId) {
    return 1
  }
  return (right.seq ?? 0) - (left.seq ?? 0)
}

function resolveSnapshotRuntimeTone(state: SnapshotRuntimeLiveState): TreeNodeSecondaryTone {
  if (state.is_offline || state.display_state === 'offline') {
    return 'offline'
  }
  if (state.is_warning || state.display_state === 'live_warning') {
    return 'warning'
  }
  if (state.state === 'live' || state.display_state === 'live') {
    return 'live'
  }
  return 'neutral'
}

export function resolveSnapshotEditorTreeStatus(
  clusterState: SnapshotRuntimeClusterLiveStateResponse | null | undefined,
): SnapshotEditorTreeStatus {
  const nodes = clusterState?.nodes ?? []
  const localNodeId = clusterState?.local_node_id ?? null

  const activeLiveState = nodes
    .filter((state) => !state.is_offline && state.state === 'live')
    .sort((left, right) => compareSnapshotRuntimeStates(left, right, localNodeId))[0] ?? null

  const fallbackState = nodes
    .slice()
    .sort((left, right) => compareSnapshotRuntimeStates(left, right, localNodeId))[0] ?? null

  const preferredState = activeLiveState ?? fallbackState

  if (!preferredState) {
    return {
      label: 'Live',
      tone: 'live',
    }
  }

  return {
    label: preferredState.display_label?.trim() || (preferredState.state === 'live' ? 'Live' : 'Stopped'),
    tone: resolveSnapshotRuntimeTone(preferredState),
  }
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

export function buildDevicesSubtree(
  pinnedIds: string[],
  navigateTo: (route: string) => void,
  onRequestUnpin: (entry: DeviceRegistryEntry) => void,
  benchStorePins: string[] = [],
): TreeItemDefinition[] {
  const pinnedSet = new Set(pinnedIds)
  const pinnedEntries = DEVICE_REGISTRY.filter((entry) => pinnedSet.has(entry.id))

  // T2459-G11b — append Hardware Store BenchStateTracker pins as a
  // parallel section. Each entry routes to the v2 device detail strip.
  // The tree node label is the model name extracted from the
  // profile_key (`<pack_id>/<model>.<kind>`).
  const benchStoreNodes: TreeItemDefinition[] = benchStorePins.map((profileKey) => {
    const slash = profileKey.indexOf('/')
    if (slash < 0) return null
    const packId = profileKey.slice(0, slash)
    const dotted = profileKey.slice(slash + 1)
    const lastDot = dotted.lastIndexOf('.')
    const model = lastDot > 0 ? dotted.slice(0, lastDot) : dotted
    return {
      id: `${HARDWARE_DEVICES_ID}::bench-pin::${profileKey}`,
      label: `${model} (Hardware Store)`,
      route: `/devices/profile/${encodeURIComponent(packId)}/${encodeURIComponent(model)}/v2`,
      icon: Devices,
    } as TreeItemDefinition
  }).filter((n): n is TreeItemDefinition => n !== null)

  if (pinnedEntries.length === 0 && benchStoreNodes.length === 0) {
    return [
      {
        id: BROWSE_DEVICES_TREE_ID,
        label: '➕ Browse devices…',
        route: '/devices',
        icon: Add,
      },
    ]
  }

  if (pinnedEntries.length === 0) {
    // Only bench-store pins; no legacy registry entries.
    return [
      {
        id: BROWSE_DEVICES_TREE_ID,
        label: '➕ Browse devices…',
        route: '/devices',
        icon: Add,
      },
      ...benchStoreNodes.map((n, i) => ({ ...n, groupBoundary: i === 0 })),
    ]
  }

  const grouped = DEVICE_KIND_ORDER.flatMap((kind) => {
    const entries = pinnedEntries
      .filter((entry) => entry.kind === kind)
      .sort((left, right) => left.label.localeCompare(right.label))
    return entries.map((entry, entryIndexWithinKind) => ({ entry, boundary: entryIndexWithinKind === 0 }))
  })

  // The very first child must not carry a group boundary (nothing to separate from above).
  const nodes: TreeItemDefinition[] = grouped.map(({ entry, boundary }, index) => {
    const route = resolveDeviceOpenRoute(entry.id)
    const routePath = `/devices/${entry.id}`
    const isFirst = index === 0
    const hasUnifiedRoute = entry.kind !== 'control-surface'
    return {
      id: `${HARDWARE_DEVICES_ID}::${routePath}`,
      label: entry.label,
      route,
      icon: TREE_ICON_OVERRIDES[routePath] ?? entry.icon,
      groupBoundary: boundary && !isFirst,
      actions: [
        { label: 'Unpin', onClick: () => onRequestUnpin(entry) },
        { label: 'Open in store', onClick: () => navigateTo('/devices') },
      ],
      // Sub-views only expand for devices whose unified `/devices/<id>/<view>`
      // routes are mounted in the router. Control-surface entries fall back to
      // their `legacyRoute` and do not expose per-view children in the tree.
      children: hasUnifiedRoute
        ? entry.views.map((view) => ({
            id: `${HARDWARE_DEVICES_ID}::${routePath}/${view.id}`,
            label: view.label,
            route: buildDeviceRoute(entry.id, view.id),
            icon: view.icon,
          }))
        : [],
    }
  })

  // T2459-G11b — append bench-store pins after the legacy nodes with
  // a groupBoundary divider so operators see them as a distinct group.
  return [
    ...nodes,
    ...benchStoreNodes.map((n, i) => ({ ...n, groupBoundary: i === 0 })),
  ]
}

function buildHardwareTree(
  pinnedIds: string[],
  navigateTo: (route: string) => void,
  onRequestUnpin: (entry: DeviceRegistryEntry) => void,
  benchStorePins: string[] = [],
): TreeItemDefinition {
  return {
    id: HARDWARE_TREE_ID,
    label: 'Hardware',
    icon: Devices,
    children: [
      {
        id: HARDWARE_HOST_MACHINE_ID,
        label: 'Host Machine',
        route: HOST_MACHINE_ROUTE,
        icon: TREE_ICON_OVERRIDES[HOST_MACHINE_ROUTE] ?? BareMetalServer,
      },
      {
        id: HARDWARE_DEVICES_ID,
        label: 'Devices',
        route: '/devices',
        icon: Devices,
        children: buildDevicesSubtree(pinnedIds, navigateTo, onRequestUnpin, benchStorePins),
      },
    ],
  }
}

function buildTreeItems(
  pinnedIds: string[],
  navigateTo: (route: string) => void,
  onRequestUnpin: (entry: DeviceRegistryEntry) => void,
  snapshotEditorStatus: SnapshotEditorTreeStatus,
  benchStorePins: string[] = [],
): TreeItemDefinition[] {
  return TOP_LEVEL_ROUTE_ORDER.flatMap((route) => {
    if (route === PRIMARY_SEPARATOR_ONE_ID || route === PRIMARY_SEPARATOR_TWO_ID) {
      return [{
        id: route,
        label: '',
        separator: true,
      }]
    }

    if (route === HARDWARE_TREE_ID) {
      return [buildHardwareTree(pinnedIds, navigateTo, onRequestUnpin, benchStorePins)]
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
      secondary: route === '/snapshot-editor' ? snapshotEditorStatus.label : undefined,
      secondaryTone: route === '/snapshot-editor' ? snapshotEditorStatus.tone : undefined,
      badge: route === '/snapshot-editor' ? 'Signal Editor' : undefined,
      featured: route === '/snapshot-editor',
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

function TreeNodeLabel({
  label,
  secondary,
  isBold = false,
  actions,
  secondaryTone = 'neutral',
  badge,
  featured = false,
}: {
  label: string
  secondary?: ReactNode
  isBold?: boolean
  actions?: TreeNodeAction[]
  secondaryTone?: TreeNodeSecondaryTone
  badge?: string
  featured?: boolean
}) {
  return (
    <span
      className={joinClasses(
        'global-tree-nav__node-copy',
        isBold && 'global-tree-nav__node-copy--bold',
        featured && 'global-tree-nav__node-copy--featured',
      )}
    >
      <span className="global-tree-nav__node-main">
        <span className="global-tree-nav__node-main-copy">
          <span className="global-tree-nav__node-label-row">
            <span className="global-tree-nav__node-label">{label}</span>
            {badge ? <span className="global-tree-nav__node-badge">{badge}</span> : null}
          </span>
          {secondary ? (
            <span className={joinClasses('global-tree-nav__node-secondary', `is-${secondaryTone}`)} aria-live="polite">
              <span className="global-tree-nav__node-secondary-dot" aria-hidden="true" />
              <span>{secondary}</span>
            </span>
          ) : null}
        </span>
        {actions && actions.length > 0 ? (
          <span
            className="global-tree-nav__node-actions"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <OverflowMenu size="sm" flipped aria-label={`Actions for ${label}`} menuOptionsClass="global-tree-nav__node-actions-menu">
              {actions.map((action) => (
                <OverflowMenuItem
                  key={action.label}
                  itemText={action.label}
                  onClick={() => action.onClick()}
                />
              ))}
            </OverflowMenu>
          </span>
        ) : null}
      </span>
    </span>
  )
}

const BOLD_TOP_LEVEL_ROUTES = new Set([
  '/',
  '/snapshot-editor',
  '/midi/assignments',
  '/brain',
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
    const nodeClass = joinClasses(
      'global-tree-nav__tree-node',
      selected && 'is-selected',
      item.featured && 'is-featured',
      item.groupBoundary && 'is-group-boundary',
      item.separator && 'is-separator',
    )

    if (item.separator) {
      return (
        <TreeView.TreeNode
          key={item.id}
          id={item.id}
          className={nodeClass}
          label={<span className="global-tree-nav__separator-line" aria-hidden="true" />}
          onSelect={(event) => {
            event.preventDefault()
          }}
        />
      )
    }

    if (item.children?.length) {
      return (
        <TreeView.TreeNode
          key={item.id}
          id={item.id}
          className={nodeClass}
          isExpanded={expandedIds.includes(item.id)}
          label={(
            <TreeNodeLabel
              label={item.label}
              secondary={item.secondary}
              secondaryTone={item.secondaryTone}
              isBold={isBold}
              badge={item.badge}
              featured={item.featured}
              actions={item.actions}
            />
          )}
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
        className={nodeClass}
        label={(
          <TreeNodeLabel
            label={item.label}
            secondary={item.secondary}
            secondaryTone={item.secondaryTone}
            isBold={isBold}
            badge={item.badge}
            featured={item.featured}
            actions={item.actions}
          />
        )}
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
  const [expandedIds, setExpandedIds] = useState<string[]>(() => readPersisted(GLOBAL_TREE_EXPANDED_KEY))
  const [nodeSelectorOpen, setNodeSelectorOpen] = useState(false)
  const pinnedDeviceIds = usePinnedDevices()
  const clusterRuntimeStateQuery = useClusterSnapshotRuntimeLiveState({ refetchInterval: false })
  const { pushToast } = useToasts()

  const handleRequestUnpin = useMemo(() => {
    return (entry: DeviceRegistryEntry) => {
      unpinDevice(entry.id)
      pushToast(`Unpinned ${entry.label} from Devices.`, 'info', {
        durationMs: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            pinDevice(entry.id)
          },
        },
      })
    }
  }, [pushToast])

  const snapshotEditorStatus = useMemo(
    () => resolveSnapshotEditorTreeStatus(clusterRuntimeStateQuery.data),
    [clusterRuntimeStateQuery.data],
  )

  // T2459-G11b — read Hardware Store BenchStateTracker pins so the
  // left-rail mirrors the new pin path alongside the legacy registry one.
  const knownDevicesQuery = useKnownDevices()
  const benchStorePins = useMemo(() => {
    return (knownDevicesQuery.data?.known ?? [])
      .filter((row) => row.is_pinned)
      .map((row) => row.profile_key)
  }, [knownDevicesQuery.data])

  const treeItems = useMemo(
    () => buildTreeItems(pinnedDeviceIds, (route) => navigate(route), handleRequestUnpin, snapshotEditorStatus, benchStorePins),
    [pinnedDeviceIds, navigate, handleRequestUnpin, snapshotEditorStatus, benchStorePins],
  )
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
    writePersisted(GLOBAL_TREE_EXPANDED_KEY, expandedIds)
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
      <nav className="global-tree-nav" aria-label="Global navigation">
        <div className="global-tree-nav__header">
          <Popover
            align="bottom-start"
            caret
            open={nodeSelectorOpen}
            onRequestClose={() => setNodeSelectorOpen(false)}
          >
            <NodeIdentityCard
              node={displayedNode ?? null}
              isOpen={nodeSelectorOpen}
              onToggle={() => setNodeSelectorOpen((current) => !current)}
              loadingLabel={nodeTopologyQuery.isLoading ? 'LOADING' : 'UNAVAILABLE'}
            />
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
        <div className="global-tree-nav__footer">
          <Tooltip label="Collapse global navigation" align="top" enterDelayMs={300}>
            <button
              type="button"
              className="global-tree-nav__footer-button global-tree-nav__footer-button--collapse"
              aria-label="Collapse global navigation"
              onClick={onTogglePinned}
            >
              <ChevronDown size={16} aria-hidden />
            </button>
          </Tooltip>
        </div>

      </nav>
    </Layer>
  )
}

export default GlobalTreeNav
