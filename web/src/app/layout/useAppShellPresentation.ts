import { useMemo } from 'react'

import { Map2BrandMark } from '../components/branding/map2Branding'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { allPinnableNavigationItems, allRouteNavigationItems, canonicalizeNavigationRoute } from '../data/advancedMenuItems'
import { buildStartMenuItems } from './startMenuItems'

import type { HomePlatformStatus } from '../hooks/useHomePlatformStatus'
import type { StartMenuTileItem } from './ShellLauncherPanel'

type ShellRoutePresentation = {
  sectionLabel: string
  windowLabel: string
}

const NODE_OPS_ROUTE_PRESENTATION: Record<string, ShellRoutePresentation> = {
  '/workspace': { sectionLabel: 'Node Ops', windowLabel: 'Overview' },
  '/workspace/platforms/overview': { sectionLabel: 'Node Ops', windowLabel: 'Overview' },
  '/platforms/overview': { sectionLabel: 'Node Ops', windowLabel: 'Overview' },
  '/workspace/platforms/management': { sectionLabel: 'Node Ops', windowLabel: 'Device Manager' },
  '/platforms/management': { sectionLabel: 'Node Ops', windowLabel: 'Device Manager' },
  '/workspace/platforms/audio-engine': { sectionLabel: 'Node Ops', windowLabel: 'Audio Engine' },
  '/platforms/audio-engine': { sectionLabel: 'Node Ops', windowLabel: 'Audio Engine' },
  '/chains': { sectionLabel: 'Node Ops', windowLabel: 'Chains' },
  '/workspace/platforms/avb-routing': { sectionLabel: 'Node Ops', windowLabel: 'AVB Routing' },
  '/platforms/avb-routing': { sectionLabel: 'Node Ops', windowLabel: 'AVB Routing' },
  '/workspace/platforms/network-discovery': { sectionLabel: 'Node Ops', windowLabel: 'Network Discovery' },
  '/platforms/network-discovery': { sectionLabel: 'Node Ops', windowLabel: 'Network Discovery' },
  '/workspace/platforms/cluster-dashboard': { sectionLabel: 'Node Ops', windowLabel: 'Cluster Dashboard' },
  '/platforms/cluster-dashboard': { sectionLabel: 'Node Ops', windowLabel: 'Cluster Dashboard' },
  '/workspace/platforms/midpoint': { sectionLabel: 'Node Ops', windowLabel: 'Midpoint' },
  '/platforms/midpoint': { sectionLabel: 'Node Ops', windowLabel: 'Midpoint' },
  '/platforms/api-webhooks': { sectionLabel: 'Node Ops', windowLabel: 'Midpoint' },
  '/workspace/platforms/api-webhooks': { sectionLabel: 'Node Ops', windowLabel: 'Midpoint' },
  '/workspace/platforms/adoption': { sectionLabel: 'Node Ops', windowLabel: 'Adoption' },
  '/platforms/adoption': { sectionLabel: 'Node Ops', windowLabel: 'Adoption' },
  '/workspace/platforms/theme': { sectionLabel: 'Node Ops', windowLabel: 'Theme' },
  '/platforms/theme': { sectionLabel: 'Node Ops', windowLabel: 'Theme' },
  '/workspace/platforms/about': { sectionLabel: 'Node Ops', windowLabel: 'About' },
  '/platforms/about': { sectionLabel: 'Node Ops', windowLabel: 'About' },
}

function resolveShellRoutePresentation(pathname: string, canonicalPathname: string): ShellRoutePresentation | null {
  return NODE_OPS_ROUTE_PRESENTATION[pathname]
    ?? NODE_OPS_ROUTE_PRESENTATION[canonicalPathname]
    ?? null
}

export type TaskbarPillItem = {
  label: string
  route: string
  tone: 'info' | 'status'
}

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`))
}

function formatShellRouteHint(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return 'landing'
  }

  return segments.join(' / ')
}

type UseAppShellPresentationOptions = {
  hostInfo?: {
    hostname?: string | null
    kernel_version?: string | null
    os_version?: string | null
  } | null
  pathname: string
  platformStatus?: HomePlatformStatus
  websocketStatus?: string
}

export function useAppShellPresentation({
  hostInfo,
  pathname,
  platformStatus,
}: UseAppShellPresentationOptions) {
  const { isTabletTouchRoute } = useTabletTouchRouteLayout(pathname)
  const canonicalPathname = useMemo(() => canonicalizeNavigationRoute(pathname), [pathname])
  const startMenuTileItems = useMemo<StartMenuTileItem[]>(() => buildStartMenuItems(), [])

  const currentShellItem = useMemo(() => {
    const candidates = [...allPinnableNavigationItems, ...allRouteNavigationItems]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.to === item.to) === index)
      .filter((item) => isRouteMatch(canonicalPathname, item.to))
      .sort((left, right) => right.to.length - left.to.length)

    return candidates[0] ?? null
  }, [canonicalPathname])

  const isDesktopRoute = pathname === '/'
  const isPlatformWorkspaceRoute = canonicalPathname === '/workspace' || canonicalPathname.startsWith('/workspace/')
  const isIntegratedWorkspaceRoute =
    isPlatformWorkspaceRoute
    || canonicalPathname.startsWith('/midi-hub')
    || canonicalPathname.startsWith('/midi/assignments')
    || canonicalPathname.startsWith('/platforms')
  const isAudioGridWorkspaceRoute = pathname === '/juce-grid' || pathname === '/snapshot-editor'
  const isSnapshotEditorRoute = canonicalPathname === '/snapshot-editor'
  const isMidiAssignmentsRoute = canonicalPathname === '/midi/assignments'
  const shellRoutePresentation = resolveShellRoutePresentation(pathname, canonicalPathname)
  const isThemedWorkspaceRoute = isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const shellClassName = `app-shell${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}${isAudioGridWorkspaceRoute ? ' app-shell--audio-grid' : ''}${isThemedWorkspaceRoute ? ' app-shell--themed-workspace' : ''}${pathname !== '/perform' ? ' app-shell--windowed' : ''}${pathname === '/perform' ? ' app-shell--perform-route' : ''}${pathname === '/' ? ' app-shell--landing' : ''}`

  const shellSectionLabel = shellRoutePresentation?.sectionLabel ?? 'Platform Workspace'
  const workspaceLabel = shellRoutePresentation
    ? `${shellRoutePresentation.sectionLabel}: ${shellRoutePresentation.windowLabel}`
    : isSnapshotEditorRoute
    ? 'Snapshot Editor'
    : isMidiAssignmentsRoute
      ? 'MIDI Assignments'
    : currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace'
  const shellTitle = shellRoutePresentation
    ? `${shellRoutePresentation.sectionLabel}: ${shellRoutePresentation.windowLabel}`
    : currentShellItem?.label ?? workspaceLabel
  const shellSubtitle = currentShellItem?.description
  const shellKicker = shellRoutePresentation
    ? `${shellRoutePresentation.sectionLabel} / ${shellRoutePresentation.windowLabel}`
    : `Platform / ${workspaceLabel}`
  const shellCrumbs = shellRoutePresentation
    ? [shellRoutePresentation.sectionLabel, shellRoutePresentation.windowLabel]
    : [isSnapshotEditorRoute ? 'Snapshot Editor surface' : 'Workspace surface', workspaceLabel]

  return {
    currentShellItem,
    isAudioGridWorkspaceRoute,
    isDesktopRoute,
    isFullBleedBaseRoute: pathname === '/' || isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute,
    isIntegratedWorkspaceRoute,
    isTabletTouchRoute,
    isThemedWorkspaceRoute,
    launcherSummaryItems: [
      hostInfo?.os_version ?? hostInfo?.kernel_version ?? 'OS version unavailable',
      hostInfo?.hostname ?? 'Host unavailable',
    ],
    platformStatusLabels: platformStatus
      ? [platformStatus.avb.label, platformStatus.avdecc.label, platformStatus.nodes.label]
      : [],
    shellAccentColor: currentShellItem?.color ?? 'var(--cds-link-primary, #0f62fe)',
    shellClassName,
    shellCrumbs,
    shellKicker,
    shellRouteHint: formatShellRouteHint(canonicalPathname),
    shellSectionLabel,
    shellSubtitle,
    shellTitle,
    shellWindowIcon: currentShellItem?.icon ?? Map2BrandMark,
    shellWorkspaceLabel: workspaceLabel,
    startMenuTileItems,
  }
}
