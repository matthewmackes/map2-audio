import { allRouteNavigationItems, canonicalizeNavigationRoute, findPinnableNavigationItem } from '../data/advancedMenuItems'
import { getLauncherCatalogTreeChildren, getLauncherRoutePresentation, launcherCatalogItems } from '../data/launcherCatalog'
import { prefetchAppRoute } from '../routePrefetch'

const HOME_SHELL_RECENT_ROUTES_STORAGE_KEY = 'map2:home-shell-recent-routes'
const LEGACY_HOME_SHELL_RECENT_ROUTE_STORAGE_KEY = 'map2:home-shell-recent-route'
const MAX_HOME_SHELL_RECENT_ROUTES = 4

type NavigateLike = (to: string) => void
export type HomeShellRecentDestination = {
  route: string
  label: string
  description: string
  group: string
}

function isRouteMatch(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function splitRoute(route: string) {
  const trimmedRoute = route.trim()
  const [pathname, ...searchParts] = trimmedRoute.split('?')
  return {
    pathname,
    search: searchParts.length > 0 ? `?${searchParts.join('?')}` : '',
  }
}

function normalizeTrackedRoute(route: string) {
  const { pathname, search } = splitRoute(route)
  if (!pathname.startsWith('/')) {
    return null
  }

  return `${canonicalizeNavigationRoute(pathname)}${search}`
}

function flattenTreeDestinations() {
  const destinations = new Map<string, HomeShellRecentDestination>()

  for (const item of launcherCatalogItems) {
    for (const child of item.treeChildren ?? []) {
      destinations.set(child.route, {
        route: child.route,
        label: child.label,
        description: `Return to ${item.heroTitle}.`,
        group: item.heroTitle,
      })
    }
  }

  for (const item of allRouteNavigationItems) {
    const parentPresentation = getLauncherRoutePresentation(item.to)
    const parentLabel = parentPresentation?.heroTitle ?? item.label
    for (const child of getLauncherCatalogTreeChildren(item.to)) {
      if (!destinations.has(child.route)) {
        destinations.set(child.route, {
          route: child.route,
          label: child.label,
          description: `Return to ${parentLabel}.`,
          group: parentLabel,
        })
      }
    }
  }

  return Array.from(destinations.values())
}

const HOME_SHELL_TREE_DESTINATIONS = flattenTreeDestinations()

export function prefetchHomeShellRoute(route: string) {
  prefetchAppRoute(route)
}

export function navigateHomeShellRoute(navigate: NavigateLike, route: string) {
  prefetchHomeShellRoute(route)
  navigate(route)
}

export function writeHomeShellRecentRoute(pathname: string) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const normalizedRoute = normalizeTrackedRoute(pathname)
    if (!normalizedRoute || normalizedRoute === '/') {
      return
    }

    const nextRoutes = [
      normalizedRoute,
      ...readHomeShellRecentRoutes().filter((route) => route !== normalizedRoute),
    ].slice(0, MAX_HOME_SHELL_RECENT_ROUTES)
    window.sessionStorage.setItem(HOME_SHELL_RECENT_ROUTES_STORAGE_KEY, JSON.stringify(nextRoutes))
    window.sessionStorage.removeItem(LEGACY_HOME_SHELL_RECENT_ROUTE_STORAGE_KEY)
  } catch {
    // Storage failures should not break routing.
  }
}

export function readHomeShellRecentRoute() {
  return readHomeShellRecentRoutes()[0] ?? null
}

export function readHomeShellRecentRoutes() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.sessionStorage.getItem(HOME_SHELL_RECENT_ROUTES_STORAGE_KEY)
    if (rawValue) {
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => (typeof value === 'string' ? normalizeTrackedRoute(value) : null))
          .filter((value): value is string => Boolean(value))
          .slice(0, MAX_HOME_SHELL_RECENT_ROUTES)
      }
    }

    const legacyValue = window.sessionStorage.getItem(LEGACY_HOME_SHELL_RECENT_ROUTE_STORAGE_KEY)
    const normalizedLegacyValue = typeof legacyValue === 'string' ? normalizeTrackedRoute(legacyValue) : null
    return normalizedLegacyValue ? [normalizedLegacyValue] : []
  } catch {
    return []
  }
}

export function isHomeShellTileRecent(recentPathname: string | null, route: string) {
  if (!recentPathname) {
    return false
  }

  // Nav reorg 2026-05-03 (second pass) — both legacy `/workspace/*`
  // and canonical `/node-ops/*` count as recent for the Node Ops
  // home tile.
  if (route === '/node-ops/overview' || route === '/node-ops' || route === '/workspace/platforms/overview') {
    return recentPathname.startsWith('/node-ops/')
      || recentPathname === '/node-ops'
      || recentPathname.startsWith('/workspace/')
  }

  return isRouteMatch(recentPathname, route)
}

export function readHomeShellRecentDestinations() {
  return readHomeShellRecentRoutes()
    .map<HomeShellRecentDestination | null>((route) => {
      const exactPresentation = getLauncherRoutePresentation(route)
      if (exactPresentation) {
        return {
          route,
          label: exactPresentation.heroTitle,
          description: exactPresentation.description,
          group: exactPresentation.homeSection ?? exactPresentation.label,
        }
      }

      const treeDestination = HOME_SHELL_TREE_DESTINATIONS.find((destination) => destination.route === route)
      if (treeDestination) {
        return treeDestination
      }

      const { pathname } = splitRoute(route)
      const exactNavigationItem = allRouteNavigationItems.find((item) => item.to === pathname)
      if (exactNavigationItem) {
        return {
          route,
          label: exactNavigationItem.label,
          description: exactNavigationItem.description,
          group: exactNavigationItem.homeSection,
        }
      }

      const pinnableItem = findPinnableNavigationItem(pathname)
      if (pinnableItem) {
        return {
          route,
          label: pinnableItem.label,
          description: pinnableItem.description,
          group: 'homeSection' in pinnableItem ? pinnableItem.homeSection : 'Platform',
        }
      }

      return null
    })
    .filter((destination): destination is HomeShellRecentDestination => destination !== null)
}
