import { useMemo } from 'react'

import { MAP2_PLATFORM_VERSION, Map2BrandMark } from '../components/branding/map2Branding'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { allPinnableNavigationItems, allRouteNavigationItems } from '../data/advancedMenuItems'
import { launcherCatalogDisplayItems } from '../data/launcherCatalog'

import type { HomePlatformStatus } from '../hooks/useHomePlatformStatus'
import type { StartMenuTileItem } from './ShellLauncherPanel'

const START_MENU_EXCLUDED_ROUTES = new Set([
  '/launch-control',
  '/midi-commander',
  '/platforms/overview',
  '/artifacts',
  '/physical-surfaces',
  '/outboard-hardware',
  '/workspace/artifacts',
  '/workspace/physical-surfaces',
  '/workspace/outboard-hardware',
])

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

type HostInfoLike = {
  hostname?: string | null
  kernel_version?: string | null
  os_version?: string | null
} | null | undefined

type UseAppShellPresentationOptions = {
  hostInfo: HostInfoLike
  pathname: string
  platformStatus: HomePlatformStatus
  websocketStatus: string
}

export function useAppShellPresentation({
  hostInfo,
  pathname,
  platformStatus,
  websocketStatus,
}: UseAppShellPresentationOptions) {
  const { isTabletTouchRoute } = useTabletTouchRouteLayout(pathname)

  const startMenuTileItems = useMemo<StartMenuTileItem[]>(
    () => {
      const launcherItems = launcherCatalogDisplayItems
        .filter((item) => item.route !== '/')
        .filter((item) => !START_MENU_EXCLUDED_ROUTES.has(item.route))
        .map((item) => ({
          route: item.route,
          label: item.label,
          shortLabel: item.shortLabel,
          icon: item.icon,
          description: item.description,
          color: item.color,
          maturity: item.maturity,
          featured: item.route === '/tesira' ? false : item.storefrontCollections.includes('featured'),
        }))

      const advancedMidiItem = allRouteNavigationItems.find((item) => item.to === '/midi-hub')
      const nextItems
        = !advancedMidiItem || launcherItems.some((item) => item.route === '/midi-hub')
          ? launcherItems
          : [
              {
                route: '/midi-hub',
                label: 'Advanced MIDI',
                shortLabel: 'Advanced MIDI',
                icon: advancedMidiItem.icon,
                description: advancedMidiItem.description,
                color: advancedMidiItem.color,
                maturity: advancedMidiItem.maturity,
                featured: true,
              } satisfies StartMenuTileItem,
              ...launcherItems,
            ]

      return nextItems
    },
    [],
  )

  const snapshotEditorNavItem = useMemo(
    () =>
      [...allPinnableNavigationItems, ...allRouteNavigationItems].find((item) => item.to === '/juce-grid'),
    [],
  )

  const currentShellItem = useMemo(() => {
    const candidates = [...allPinnableNavigationItems, ...allRouteNavigationItems]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.to === item.to) === index)
      .filter((item) => isRouteMatch(pathname, item.to))
      .sort((left, right) => right.to.length - left.to.length)

    return candidates[0] ?? null
  }, [pathname])

  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'
  const isDesktopRoute = pathname === '/'
  const isPlatformWorkspaceRoute = pathname === '/workspace' || pathname.startsWith('/workspace/')
  const isIntegratedWorkspaceRoute =
    isPlatformWorkspaceRoute
    || pathname.startsWith('/midi-hub')
    || pathname.startsWith('/platforms')
    || pathname.startsWith('/artifacts')
    || pathname.startsWith('/audio-artifacts')
    || pathname.startsWith('/physical-surfaces')
    || pathname.startsWith('/outboard-hardware')
  const isAudioGridWorkspaceRoute = pathname === '/juce-grid' || pathname === '/snapshot-editor'
  const isThemedWorkspaceRoute = isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const shellClassName = `app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}${isAudioGridWorkspaceRoute ? ' app-shell--audio-grid' : ''}${isThemedWorkspaceRoute ? ' app-shell--themed-workspace' : ''}${pathname !== '/perform' ? ' app-shell--windowed' : ''}${pathname === '/perform' ? ' app-shell--perform-route' : ''}${pathname === '/' ? ' app-shell--landing' : ''}`

  return {
    SnapshotEditorIcon: snapshotEditorNavItem?.icon ?? null,
    currentShellItem,
    isAudioGridWorkspaceRoute,
    isDesktopRoute,
    isFullBleedBaseRoute: pathname === '/' || isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute,
    isIntegratedWorkspaceRoute,
    isTabletTouchRoute,
    isThemedWorkspaceRoute,
    launcherSummaryItems: [
      `Platform ${MAP2_PLATFORM_VERSION}`,
      hostInfo?.os_version ?? hostInfo?.kernel_version ?? 'OS version unavailable',
      hostInfo?.hostname ?? 'Host unavailable',
    ],
    platformStatusLabels: [platformStatus.avb.label, platformStatus.avdecc.label, platformStatus.nodes.label],
    shellAccentColor: currentShellItem?.color ?? 'var(--cds-link-primary, #0f62fe)',
    shellClassName,
    shellRouteHint: formatShellRouteHint(pathname),
    shellWindowIcon: currentShellItem?.icon ?? Map2BrandMark,
    shellWorkspaceLabel: currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace',
    showMobileConnectionBanner,
    startMenuTileItems,
  }
}
