import {
  Popover,
  PopoverContent,
  Tooltip,
} from '@carbon/react'
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Add,
  AddAlt,
  AudioConsole,
  BareMetalServer,
  CaretRight,
  ChartLine,
  ChartNetwork,
  Chemistry,
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
  RecordingFilledAlt,
  Renew,
  Restart,
  ScanAlt,
  ScreenMap,
  Settings,
  SettingsAdjust,
  Grid,
} from '@carbon/icons-react'

import { MapArtifactsLibraryIcon, MapRackDeviceIcon } from '../../components/icons/map'
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
  LEGACY_DEVICE_MANIFEST,
  type LegacyDeviceManifestEntry,
} from '../../data/legacyDeviceManifest'
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
import { usePersistedState, type PersistedKey } from '../../utils/persistedState'
import {
  applyViewedNodeScopeToAllPages,
  writeViewedHostToSearch,
} from '../../utils/viewedNodeScope'
import type { SnapshotRuntimeClusterLiveStateResponse, SnapshotRuntimeLiveState } from '../../../map2/types'
import './GlobalTreeNav.css'

type GlobalTreeNavProps = {
  onLogOut: () => void
  onOpenRebootConfirm: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
}

// Permissive icon component type — accepts both Carbon icons (size:
// number | string, optional className/aria-hidden) and the MAP custom
// icons (size: number, SVG props). All consumers in this file pass
// only `size` and `className`/`aria-hidden`, so the loose shape is
// sufficient and keeps both icon families assignable.
type CarbonIconComponent = ComponentType<{
  size?: number | string
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

export type TreeNodeAction = {
  label: string
  onClick: () => void
}

export type TreeItemDefinition = {
  id: string
  label: string
  route?: string
  icon?: CarbonIconComponent
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

const BROWSE_DEVICES_TREE_ID = '/hardware::devices::browse'

const DEFAULT_EXPANDED_IDS: readonly string[] = [
  '/snapshot-editor',
  '/multitrack-recorder',
  '/sequencer',
  '/midi-hub',
  '/hardware',
  '/hardware::devices',
]
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

// Pinned (hero cards) — Snapshot Editor, MultiTrack Recorder, Sequencer.
// Hard-coded order, no user reorder. The MultiTrack Recorder hero is the
// DAW entry point; it sits between the Snapshot Editor (graph/snapshot
// authoring) and Sequencer (performance brain) heroes.
const PINNED_HERO_ROUTES = ['/snapshot-editor', '/multitrack-recorder', '/sequencer'] as const
// Services section — MIDI, AVB, Audio Artifacts.
const SERVICES_ROUTES = ['/midi-hub', '/avb', '/artifacts'] as const
// System section — Settings, Hardware, Node Ops. Hardware bucket folds
// in the launcher catalog + dynamic device pins per the design Q4.
const SYSTEM_ROUTES = ['/settings', '/hardware', '/node-ops'] as const
const FLAT_TOP_LEVEL_ROUTES = new Set(['/', '/about'])
const HARDWARE_TREE_ID = '/hardware'
const HARDWARE_DEVICES_ID = '/hardware::devices'
const HARDWARE_HOST_MACHINE_ID = '/hardware::host-machine'

const TREE_ICON_OVERRIDES: Record<string, CarbonIconComponent> = {
  '/': Home,
  '/snapshot-editor': ScreenMap,
  '/multitrack-recorder': RecordingFilledAlt,
  '/sequencer': Grid,
  '/midi-hub': Music,
  '/avb': ChartNetwork,
  '/settings': Settings,
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
  '/node-ops': Dashboard,
  '/node-ops/overview': Dashboard,
  '/node-ops/audio-engine': AudioConsole,
  '/artifacts': MapArtifactsLibraryIcon,
  '/node-ops/management': SettingsAdjust,
  '/node-ops/network-discovery': ScanAlt,
  '/node-ops/cluster-dashboard': Dashboard,
  '/node-ops/midpoint': Flash,
  '/node-ops/adoption': AddAlt,
  [HOST_MACHINE_ROUTE]: BareMetalServer,
  '/node-ops/theme': ColorPalette,
  '/about': Information,
  '/midi/connections': Plug,
  '/midi/devices': Devices,
  '/midi/bindings': Connect,
  '/midi/routing': ChartNetwork,
  '/midi/presets': Document,
  '/midi/transport': PlayFilled,
  '/midi/events': EventSchedule,
  '/midi/processing': Settings,
  '/midi/network': Network_3,
  '/midi/lab': Chemistry,
  '/avb/overview': Dashboard,
  '/avb/connections': Plug,
  '/avb/bindings': Connect,
  '/avb/devices': Devices,
  '/avb/routing': ChartNetwork,
  '/avb/network': Network_3,
}

const TREE_LABEL_OVERRIDES: Record<string, string> = {
  '/node-ops': 'Node Ops',
  '/artifacts': 'Audio Artifacts',
  '/about': 'Platform Guide',
  '/snapshot-editor': 'Snapshot Editor',
  '/multitrack-recorder': 'MultiTrack Recorder',
  '/sequencer': 'Sequencer',
  '/midi-hub': 'MIDI Services',
  '/avb': 'AVB',
  '/settings': 'Settings',
  '/midi/assignments': 'MIDI Assignments',
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
    icon: TREE_ICON_OVERRIDES[childRoutePath] ?? (childNavigationItem?.icon as CarbonIconComponent | undefined),
    children: nestedChildren,
  }
}

export function buildDevicesSubtree(
  pinnedIds: string[],
  navigateTo: (route: string) => void,
  onRequestUnpin: (entry: LegacyDeviceManifestEntry) => void,
  benchStorePins: string[] = [],
): TreeItemDefinition[] {
  const pinnedSet = new Set(pinnedIds)
  const pinnedEntries = LEGACY_DEVICE_MANIFEST.filter((entry) => pinnedSet.has(entry.id))

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

  const sorted = [...pinnedEntries].sort((left, right) => left.label.localeCompare(right.label))
  const nodes: TreeItemDefinition[] = sorted.map((entry) => {
    const routePath = `/devices/${entry.id}`
    return {
      id: `${HARDWARE_DEVICES_ID}::${routePath}`,
      label: entry.label,
      route: entry.legacyRoute,
      icon: TREE_ICON_OVERRIDES[routePath] ?? (entry.icon as CarbonIconComponent | undefined),
      actions: [
        { label: 'Unpin', onClick: () => onRequestUnpin(entry) },
        { label: 'Open in store', onClick: () => navigateTo('/devices') },
      ],
      children: [],
    }
  })

  return [
    ...nodes,
    ...benchStoreNodes.map((n, i) => ({ ...n, groupBoundary: i === 0 })),
  ]
}

const HARDWARE_DEVICE_MANAGER_ID = '/hardware::device-manager'

function buildHardwareTree(
  pinnedIds: string[],
  navigateTo: (route: string) => void,
  onRequestUnpin: (entry: LegacyDeviceManifestEntry) => void,
  benchStorePins: string[] = [],
): TreeItemDefinition {
  // Per the 2026-05-03 design Q4: launcher catalog children for the
  // legacy `/hardware` route fold in here too, so the System →
  // Hardware bucket holds every device-touching surface.
  const launcherChildren = getLauncherCatalogTreeChildren(HARDWARE_TREE_ID)
    .map((child) => buildChildTreeItem(HARDWARE_TREE_ID, child))

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
        id: HARDWARE_DEVICE_MANAGER_ID,
        label: 'Device Manager',
        route: '/workspace/platforms/management',
        icon: Devices,
      },
      {
        id: HARDWARE_DEVICES_ID,
        label: 'Devices',
        route: '/devices',
        icon: Devices,
        children: buildDevicesSubtree(pinnedIds, navigateTo, onRequestUnpin, benchStorePins),
      },
      ...launcherChildren,
    ],
  }
}

type SectionTier = 'pinned' | 'services' | 'system'

function buildSectionItems(
  routes: readonly string[],
  pinnedIds: string[],
  navigateTo: (route: string) => void,
  onRequestUnpin: (entry: LegacyDeviceManifestEntry) => void,
  snapshotEditorStatus: SnapshotEditorTreeStatus,
  benchStorePins: string[],
): TreeItemDefinition[] {
  return routes.flatMap((route) => {
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
      icon: TREE_ICON_OVERRIDES[route] ?? (launcherItem?.icon as CarbonIconComponent | undefined) ?? (navigationItem?.icon as CarbonIconComponent | undefined),
      children,
      secondary: route === '/snapshot-editor' ? snapshotEditorStatus.label : undefined,
      secondaryTone: route === '/snapshot-editor' ? snapshotEditorStatus.tone : undefined,
      badge: route === '/snapshot-editor'
        ? 'Signal Flow'
        : route === '/multitrack-recorder'
          ? 'DAW'
          : undefined,
      featured: route === '/snapshot-editor' || route === '/multitrack-recorder',
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

function isItemOrDescendantActive(item: TreeItemDefinition, activeId: string | null): boolean {
  if (!activeId) return false
  if (item.id === activeId) return true
  if (!item.children) return false
  return item.children.some((child) => isItemOrDescendantActive(child, activeId))
}

function HeroCard({
  item,
  isOpen,
  activeId,
  onToggle,
  onNavigate,
}: {
  item: TreeItemDefinition
  isOpen: boolean
  activeId: string | null
  onToggle: () => void
  onNavigate: (route: string) => void
}) {
  const Icon = item.icon
  const childCount = item.children?.length ?? 0
  const isActive = isItemOrDescendantActive(item, activeId)

  return (
    <div className={joinClasses('global-tree-nav__hero', isActive && 'is-active')}>
      <button
        type="button"
        className="global-tree-nav__hero-header"
        onClick={() => {
          onToggle()
          if (item.route) onNavigate(item.route)
        }}
        aria-expanded={isOpen}
      >
        <span className="global-tree-nav__hero-icon-tile" aria-hidden="true">
          {Icon ? <Icon size={16} /> : null}
        </span>
        <span className="global-tree-nav__hero-text">
          <span className="global-tree-nav__hero-title-row">
            <span className="global-tree-nav__hero-title">{item.label}</span>
            {item.badge ? (
              <span className="global-tree-nav__hero-badge">{item.badge}</span>
            ) : null}
          </span>
          {item.secondary ? (
            <span
              className={joinClasses(
                'global-tree-nav__hero-status',
                `is-${item.secondaryTone ?? 'neutral'}`,
              )}
            >
              <span className="global-tree-nav__hero-status-dot" aria-hidden="true" />
              {item.secondary}
            </span>
          ) : childCount > 0 ? (
            <span className="global-tree-nav__hero-subtitle">
              {childCount} {childCount === 1 ? 'section' : 'sections'}
            </span>
          ) : null}
        </span>
        <CaretRight
          size={12}
          className={joinClasses(
            'global-tree-nav__hero-caret',
            isOpen && 'is-open',
          )}
          aria-hidden="true"
        />
      </button>
      {isOpen && childCount > 0 ? (
        <div className="global-tree-nav__hero-body">
          {item.children!.map((child) => {
            const childActive = child.id === activeId
            return (
              <button
                key={child.id}
                type="button"
                className={joinClasses(
                  'global-tree-nav__hero-child',
                  childActive && 'is-active',
                )}
                onClick={() => child.route && onNavigate(child.route)}
              >
                {child.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function DenseRow({
  item,
  depth,
  activeId,
  expandedIds,
  toggleExpanded,
  onNavigate,
}: {
  item: TreeItemDefinition
  depth: number
  activeId: string | null
  expandedIds: string[]
  toggleExpanded: (id: string) => void
  onNavigate: (route: string) => void
}) {
  const Icon = item.icon
  const hasChildren = (item.children?.length ?? 0) > 0
  const isOpen = expandedIds.includes(item.id)
  const isActive = item.id === activeId
  const padLeft = 16 + depth * 16

  if (item.separator) {
    return <div className="global-tree-nav__dense-separator" aria-hidden="true" />
  }

  return (
    <>
      <button
        type="button"
        className={joinClasses(
          'global-tree-nav__dense-row',
          isActive && 'is-active',
          item.groupBoundary && 'is-group-boundary',
        )}
        style={{ paddingLeft: padLeft }}
        onClick={() => {
          if (hasChildren) toggleExpanded(item.id)
          if (item.route) onNavigate(item.route)
        }}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        {hasChildren ? (
          <CaretRight
            size={9}
            className={joinClasses(
              'global-tree-nav__dense-caret',
              isOpen && 'is-open',
            )}
            aria-hidden="true"
          />
        ) : (
          <span className="global-tree-nav__dense-spacer" aria-hidden="true" />
        )}
        {depth === 0 && Icon ? (
          <Icon size={14} className="global-tree-nav__dense-icon" aria-hidden="true" />
        ) : null}
        <span className="global-tree-nav__dense-label">{item.label}</span>
      </button>
      {isOpen && hasChildren ? (
        <div
          className="global-tree-nav__dense-children"
          style={{ paddingLeft: padLeft + 4 }}
        >
          <div className="global-tree-nav__dense-indent-guide" aria-hidden="true" />
          {item.children!.map((child) => (
            <DenseRow
              key={child.id}
              item={child}
              depth={depth + 1}
              activeId={activeId}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

function SectionBar({ tier, label }: { tier: SectionTier; label: string }) {
  return (
    <div className={joinClasses('global-tree-nav__section-bar', `is-${tier}`)}>
      <span className="global-tree-nav__section-marker" aria-hidden="true" />
      <span className="global-tree-nav__section-label">{label}</span>
      <span className="global-tree-nav__section-rule" aria-hidden="true" />
    </div>
  )
}

export function GlobalTreeNav({
  onLogOut,
  onOpenRebootConfirm,
  onOpenRestartConfirm,
  onRefreshPage,
}: GlobalTreeNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const pageKey = pageKeyFromPathname(location.pathname) ?? NODE_PAGE_KEYS.home
  const { topologyNodes, viewedNodeId, nodeTopologyQuery } = useNodePageContext(pageKey)
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const [expandedIds, setExpandedIds] = usePersistedState(GLOBAL_TREE_EXPANDED_KEY)
  const [nodeSelectorOpen, setNodeSelectorOpen] = useState(false)
  const pinnedDeviceIds = usePinnedDevices()
  const clusterRuntimeStateQuery = useClusterSnapshotRuntimeLiveState({ refetchInterval: false })
  const { pushToast } = useToasts()

  const handleRequestUnpin = useMemo(() => {
    return (entry: LegacyDeviceManifestEntry) => {
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

  const knownDevicesQuery = useKnownDevices()
  const benchStorePins = useMemo(() => {
    return (knownDevicesQuery.data?.known ?? [])
      .filter((row) => row.is_pinned)
      .map((row) => row.profile_key)
  }, [knownDevicesQuery.data])

  // `navigate` from React Router is stable, so wrapping `navigateTo`
  // in useCallback gives the three useMemo blocks below a stable
  // reference and lets the exhaustive-deps lint pass without
  // re-running on every render.
  const navigateTo = useCallback((route: string) => navigate(route), [navigate])

  const pinnedItems = useMemo(
    () => buildSectionItems(
      PINNED_HERO_ROUTES,
      pinnedDeviceIds,
      navigateTo,
      handleRequestUnpin,
      snapshotEditorStatus,
      benchStorePins,
    ),
    [pinnedDeviceIds, navigateTo, handleRequestUnpin, snapshotEditorStatus, benchStorePins],
  )
  const servicesItems = useMemo(
    () => buildSectionItems(
      SERVICES_ROUTES,
      pinnedDeviceIds,
      navigateTo,
      handleRequestUnpin,
      snapshotEditorStatus,
      benchStorePins,
    ),
    [pinnedDeviceIds, navigateTo, handleRequestUnpin, snapshotEditorStatus, benchStorePins],
  )
  const systemItems = useMemo(
    () => buildSectionItems(
      SYSTEM_ROUTES,
      pinnedDeviceIds,
      navigateTo,
      handleRequestUnpin,
      snapshotEditorStatus,
      benchStorePins,
    ),
    [pinnedDeviceIds, navigateTo, handleRequestUnpin, snapshotEditorStatus, benchStorePins],
  )
  const allItems = useMemo(
    () => [...pinnedItems, ...servicesItems, ...systemItems],
    [pinnedItems, servicesItems, systemItems],
  )

  const activeNodePath = useMemo(
    () => findActiveNodePath(allItems, location.pathname, location.search),
    [location.pathname, location.search, allItems],
  )
  const activeNodeId = activeNodePath?.[activeNodePath.length - 1] ?? null
  const homeActive = routeMatchesLocation('/', location.pathname, location.search)
  const guideActive = routeMatchesLocation('/about', location.pathname, location.search)

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
  }, [activeNodePath, setExpandedIds])

  const toggleExpanded = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return Array.from(next)
    })
  }

  const renderDenseGroup = (items: TreeItemDefinition[]): ReactNode => (
    <div className="global-tree-nav__dense-group">
      {items.map((item) => (
        <DenseRow
          key={item.id}
          item={item}
          depth={0}
          activeId={activeNodeId}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          onNavigate={navigateTo}
        />
      ))}
    </div>
  )

  return (
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
                      applyViewedNodeScopeToAllPages(setViewedNode, node.node_id)
                      const nextSearch = writeViewedHostToSearch(location.search, node.node_id)
                      if (nextSearch !== location.search) {
                        navigate({ pathname: location.pathname, search: nextSearch }, { replace: true })
                      }
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

      <div className="global-tree-nav__scroll">
        <button
          type="button"
          className={joinClasses('global-tree-nav__home-row', homeActive && 'is-active')}
          onClick={() => navigateTo('/')}
        >
          <span className="global-tree-nav__dense-spacer" aria-hidden="true" />
          <Home size={14} className="global-tree-nav__dense-icon" aria-hidden="true" />
          <span className="global-tree-nav__dense-label">Home</span>
        </button>

        <div className="global-tree-nav__hero-stack">
          {pinnedItems.map((item) => (
            <HeroCard
              key={item.id}
              item={item}
              isOpen={expandedIds.includes(item.id)}
              activeId={activeNodeId}
              onToggle={() => toggleExpanded(item.id)}
              onNavigate={navigateTo}
            />
          ))}
        </div>

        <SectionBar tier="services" label="Services" />
        {renderDenseGroup(servicesItems)}
        {renderDenseGroup(systemItems)}
      </div>

      <div className="global-tree-nav__footer">
        <button
          type="button"
          className={joinClasses('global-tree-nav__guide-row', guideActive && 'is-active')}
          onClick={() => navigateTo('/#platform-guide')}
        >
          <span className="global-tree-nav__dense-spacer" aria-hidden="true" />
          <Information size={13} className="global-tree-nav__dense-icon" aria-hidden="true" />
          <span className="global-tree-nav__dense-label">Platform Guide</span>
        </button>
      </div>
    </nav>
  )
}

export default GlobalTreeNav
