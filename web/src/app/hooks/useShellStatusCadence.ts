import { useMemo } from 'react'

import { useRealtimeCadence } from './useRealtimeCadence'
import { useRouteActive, type RouteActivityPattern } from './useRouteActive'

export type ShellStatusCadence = {
  pollMs: number
  staleMs: number
}

const SHELL_STATUS_HEAVY_ROUTE_PATTERNS: RouteActivityPattern[] = [
  '/snapshot-editor',
  '/snapshots',
  '/metering',
  '/perform',
  '/engine',
  '/pipewire',
]

export function useShellStatusCadence(): ShellStatusCadence {
  const heavyRouteActive = useRouteActive(SHELL_STATUS_HEAVY_ROUTE_PATTERNS)
  const pollMs = useRealtimeCadence({
    routeActive: !heavyRouteActive,
    visibleMs: 10_000,
    hiddenMs: 30_000,
    inactiveMs: 30_000,
  })

  return useMemo(() => {
    const resolvedPollMs = typeof pollMs === 'number' ? pollMs : 30_000
    return {
      pollMs: resolvedPollMs,
      staleMs: Math.max(1_000, resolvedPollMs - 2_000),
    }
  }, [pollMs])
}

export default useShellStatusCadence
