import { prefetchAppRoute } from '../routePrefetch'

const HOME_SHELL_RECENT_ROUTE_STORAGE_KEY = 'map2:home-shell-recent-route'

type NavigateLike = (to: string) => void

function isRouteMatch(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function prefetchHomeShellRoute(route: string) {
  prefetchAppRoute(route)
}

export function navigateHomeShellRoute(navigate: NavigateLike, route: string) {
  prefetchHomeShellRoute(route)
  navigate(route)
}

export function writeHomeShellRecentRoute(pathname: string) {
  if (typeof window === 'undefined' || pathname === '/') {
    return
  }

  try {
    window.sessionStorage.setItem(HOME_SHELL_RECENT_ROUTE_STORAGE_KEY, pathname)
  } catch {
    // Storage failures should not break routing.
  }
}

export function readHomeShellRecentRoute() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage.getItem(HOME_SHELL_RECENT_ROUTE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function isHomeShellTileRecent(recentPathname: string | null, route: string) {
  if (!recentPathname) {
    return false
  }

  if (route === '/workspace/platforms/overview') {
    return recentPathname.startsWith('/workspace/')
  }

  return isRouteMatch(recentPathname, route)
}
