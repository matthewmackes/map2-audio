import { useMemo } from 'react'

import { Map2BrandMark } from '../components/branding/map2Branding'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { allPinnableNavigationItems, allRouteNavigationItems, canonicalizeNavigationRoute } from '../data/advancedMenuItems'
import { buildStartMenuItems } from './startMenuItems'

import type { HomePlatformStatus } from '../hooks/useHomePlatformStatus'
import type { StartMenuTileItem } from './ShellLauncherPanel'

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
    || canonicalPathname.startsWith('/platforms')
  const isAudioGridWorkspaceRoute = pathname === '/juce-grid' || pathname === '/snapshot-editor'
  const isThemedWorkspaceRoute = isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const shellClassName = `app-shell${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}${isAudioGridWorkspaceRoute ? ' app-shell--audio-grid' : ''}${isThemedWorkspaceRoute ? ' app-shell--themed-workspace' : ''}${pathname !== '/perform' ? ' app-shell--windowed' : ''}${pathname === '/perform' ? ' app-shell--perform-route' : ''}${pathname === '/' ? ' app-shell--landing' : ''}`

  const workspaceLabel = currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace'
  const shellTitle = currentShellItem?.label ?? workspaceLabel
  const shellSubtitle = currentShellItem?.description
  const shellKicker = `Platform / ${workspaceLabel}`
  const shellCrumbs = ['Workspace surface', workspaceLabel]

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
    shellSubtitle,
    shellTitle,
    shellWindowIcon: currentShellItem?.icon ?? Map2BrandMark,
    shellWorkspaceLabel: workspaceLabel,
    startMenuTileItems,
  }
}
