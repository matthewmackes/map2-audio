import { useLocation } from 'react-router-dom'

export type RouteActivityPattern =
  | string
  | RegExp
  | ((pathname: string) => boolean)

function normalizeRoutePattern(pattern: string) {
  return pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern
}

function matchesRoutePattern(pathname: string, pattern: RouteActivityPattern): boolean {
  if (typeof pattern === 'function') {
    return pattern(pathname)
  }

  if (pattern instanceof RegExp) {
    return pattern.test(pathname)
  }

  const normalized = normalizeRoutePattern(pattern)
  return pathname === normalized || pathname.startsWith(`${normalized}/`)
}

export function useRouteActive(patterns: RouteActivityPattern | RouteActivityPattern[]): boolean {
  const location = useLocation()
  const routePatterns = Array.isArray(patterns) ? patterns : [patterns]

  return routePatterns.some((pattern) => matchesRoutePattern(location.pathname, pattern))
}

export default useRouteActive
