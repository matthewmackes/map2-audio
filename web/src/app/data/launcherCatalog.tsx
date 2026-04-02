import type { ComponentType } from 'react'
import { Beaker } from 'lucide-react'

import {
  advancedMenuItems,
  allRouteNavigationItems,
  canonicalizeNavigationRoute,
  findPinnableNavigationItem,
  type HardwareInterfaceMenuItem,
  type NavigationHomeSection,
  type NavigationMaturityState,
  type NavigationRenderKind,
  type ShellNavigationItem,
} from './advancedMenuItems'
import { platformPinnedItems, type PlatformPinnedNavItem } from './platformMenuItems'

export type LandingTileSize = 'small' | 'medium' | 'large'
export type LauncherDirectory = 'core' | 'labs' | 'platforms' | 'nav-only'
export type LauncherCatalogCategory = 'Audio Interface' | 'Human Interface' | 'Platform'
export const REQUIRED_HOME_LAUNCHER_ROUTE = '/platforms/overview'

export interface LandingTilePlacement {
  route: string
  size: LandingTileSize
}

export interface LauncherCatalogItem {
  route: string
  label: string
  heroTitle: string
  shortLabel?: string
  icon: ComponentType<any>
  description: string
  category: LauncherCatalogCategory
  color: string
  maturity: NavigationMaturityState
  directory: LauncherDirectory
  homeSection?: NavigationHomeSection | 'Platform'
  kind: NavigationRenderKind | 'link'
  deviceType?: string
  landingEligible: boolean
  navEligible: boolean
}

type RouteLauncherSource = ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem

const AUDIO_INTERFACE_DEVICE_TYPES = new Set(['edirol-ua1000', 'hotone-jogg', 'generic-interface'])
const HUMAN_INTERFACE_DEVICE_TYPES = new Set(['ableton-push', 'ground-control-pro', 'maschine-mk1'])

const HOME_ONLY_LAUNCHERS: LauncherCatalogItem[] = [
  {
    route: '/platforms/workspace-catalog',
    label: 'Workspace Catalog',
    heroTitle: 'Workspace Catalog',
    shortLabel: 'Catalog',
    icon: Beaker,
    description: 'Browse advanced routes and launcher controls from the integrated Workspace Catalog section.',
    category: 'Platform',
    color: 'var(--cds-link-primary)',
    maturity: 'beta',
    directory: 'core',
    homeSection: 'System',
    kind: 'link',
    landingEligible: true,
    navEligible: false,
  },
]

function routeItemKey(item: ShellNavigationItem | HardwareInterfaceMenuItem): string {
  return `${item.to}::${item.label}`
}

const labsLauncherKeySet = new Set(advancedMenuItems.map((item) => routeItemKey(item)))

function isLabsCatalogRoute(item: ShellNavigationItem | HardwareInterfaceMenuItem): boolean {
  return (
    labsLauncherKeySet.has(routeItemKey(item))
    || item.maturity === 'experimental'
    || (item.maturity === 'hardware-blocked' && item.kind !== 'hardware-submenu')
  )
}

function resolveLauncherCatalogCategory(
  item: RouteLauncherSource,
  route: string,
): LauncherCatalogCategory {
  const deviceType = 'deviceType' in item ? item.deviceType : undefined
  const homeSection = 'homeSection' in item ? item.homeSection : 'Platform'

  if (route === '/hardware-interfaces' || (deviceType && AUDIO_INTERFACE_DEVICE_TYPES.has(deviceType))) {
    return 'Audio Interface'
  }

  if (homeSection === 'MIDI' || route === '/lcd' || (deviceType && HUMAN_INTERFACE_DEVICE_TYPES.has(deviceType))) {
    return 'Human Interface'
  }

  return 'Platform'
}

function toLauncherCatalogItem(
  item: RouteLauncherSource,
  directory: LauncherDirectory,
): LauncherCatalogItem {
  const route = canonicalizeNavigationRoute(item.to)

  return {
    route,
    label: item.label,
    heroTitle: item.label,
    shortLabel: item.shortLabel,
    icon: item.icon,
    description: item.description,
    category: resolveLauncherCatalogCategory(item, route),
    color: item.color,
    maturity: item.maturity,
    directory,
    homeSection: 'homeSection' in item ? item.homeSection : 'Platform',
    kind: item.kind,
    deviceType: 'deviceType' in item ? item.deviceType : undefined,
    landingEligible: item.kind !== 'hardware-submenu' && route !== '/',
    navEligible: item.pinnable,
  }
}

function buildLauncherCatalog(): LauncherCatalogItem[] {
  const byRoute = new Map<string, LauncherCatalogItem>()

  for (const item of platformPinnedItems) {
    const launcher = toLauncherCatalogItem(item, 'platforms')
    if (!byRoute.has(launcher.route)) {
      byRoute.set(launcher.route, launcher)
    }
  }

  for (const item of allRouteNavigationItems) {
    const directory = isLabsCatalogRoute(item) ? 'labs' : 'core'
    const launcher = toLauncherCatalogItem(item, directory)
    if (!byRoute.has(launcher.route)) {
      byRoute.set(launcher.route, launcher)
    }
  }

  for (const item of HOME_ONLY_LAUNCHERS) {
    if (!byRoute.has(item.route)) {
      byRoute.set(item.route, item)
    }
  }

  const navOnlyItem = findPinnableNavigationItem('/hardware-interfaces')
  if (navOnlyItem) {
    byRoute.set('/hardware-interfaces', {
      ...toLauncherCatalogItem(navOnlyItem, 'nav-only'),
      landingEligible: false,
      navEligible: true,
    })
  }

  return Array.from(byRoute.values())
}

export const launcherCatalogItems = buildLauncherCatalog()

export const launcherCatalogByRoute = new Map(
  launcherCatalogItems.map((item) => [item.route, item] as const),
)

export function getLauncherCatalogItem(route: string | null | undefined): LauncherCatalogItem | null {
  if (!route) {
    return null
  }

  const normalizedRoute = canonicalizeNavigationRoute(route.trim())
  return launcherCatalogByRoute.get(normalizedRoute) ?? null
}

export function isLandingTileSize(value: string | null | undefined): value is LandingTileSize {
  return value === 'small' || value === 'medium' || value === 'large'
}

export function normalizeLandingTiles(
  tiles: Array<LandingTilePlacement | { route?: string | null; size?: string | null }> | null | undefined,
): LandingTilePlacement[] {
  if (!tiles || tiles.length === 0) {
    return []
  }

  const normalized: LandingTilePlacement[] = []
  const seen = new Set<string>()

  for (const rawTile of tiles) {
    const rawRoute = typeof rawTile?.route === 'string' ? rawTile.route.trim() : ''
    const route = canonicalizeNavigationRoute(rawRoute)
    const rawSize = typeof rawTile?.size === 'string' ? rawTile.size.trim().toLowerCase() : 'medium'
    const size = isLandingTileSize(rawSize) ? rawSize : null
    const launcher = getLauncherCatalogItem(route)

    if (!launcher || !launcher.landingEligible || !size || seen.has(route)) {
      continue
    }

    seen.add(route)
    normalized.push({ route, size })
  }

  return normalized
}

export function prioritizeRequiredHomeLauncher(tiles: LandingTilePlacement[]): LandingTilePlacement[] {
  const requiredIndex = tiles.findIndex((tile) => tile.route === REQUIRED_HOME_LAUNCHER_ROUTE)
  if (requiredIndex <= 0) {
    return tiles
  }

  const nextTiles = [...tiles]
  const [requiredTile] = nextTiles.splice(requiredIndex, 1)
  nextTiles.unshift(requiredTile)
  return nextTiles
}

export function ensureRequiredHomeLauncher(
  tiles: LandingTilePlacement[],
  size: LandingTileSize = 'medium',
): LandingTilePlacement[] {
  if (tiles.some((tile) => tile.route === REQUIRED_HOME_LAUNCHER_ROUTE)) {
    return tiles
  }

  const launcher = getLauncherCatalogItem(REQUIRED_HOME_LAUNCHER_ROUTE)
  if (!launcher || !launcher.landingEligible) {
    return tiles
  }

  return [{ route: REQUIRED_HOME_LAUNCHER_ROUTE, size }, ...tiles]
}
