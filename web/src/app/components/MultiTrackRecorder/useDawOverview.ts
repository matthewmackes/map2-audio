/**
 * T2503 Set 10 — DAW shell overview hook.
 *
 * Mirrors the MidiHub useMidiHubOverview pattern. Returns the live mode
 * snapshot from /api/daw/mode and derives shell-level status actions.
 *
 * Polling cadence: 2s (same as Set 4 reference UI). The WebSocket
 * /api/v1/daw/events stream is observed by sub-area pages directly;
 * the shell uses the polling snapshot for status-bar reads since it
 * needs a consistent point-in-time view across all 8 sub-areas.
 */
import { useQuery } from '@tanstack/react-query'

import { dawApi, type DawModeStatus } from '../../../map2/clients/daw'
import { useDawProjectStore } from '../../stores/dawProjectStore'

export type DawHealth = 'online' | 'idle' | 'unavailable' | 'transitioning'

export interface DawOverview {
  modeQuery: ReturnType<typeof useQuery<DawModeStatus>>
  mode: DawModeStatus | null
  available: boolean
  health: DawHealth
  activeProject: string | null
  trackCount: number
  clipCount: number
  pluginCount: number
  automationLaneCount: number
}

function deriveHealth(status: DawModeStatus | null | undefined): DawHealth {
  if (!status) {
    return 'idle'
  }
  if (!status.daw_mode_available) {
    return 'unavailable'
  }
  if (status.state !== 'idle' && status.state !== 'running') {
    return 'transitioning'
  }
  return status.mode === 'daw' ? 'online' : 'idle'
}

export function useDawOverview(_scopeKey: string): DawOverview {
  const modeQuery = useQuery<DawModeStatus>({
    queryKey: ['daw', 'mode'],
    queryFn: () => dawApi.getMode(),
    refetchInterval: 2000,
    staleTime: 1000,
    retry: false,
  })

  const tracks = useDawProjectStore((s) => s.tracks)
  const clips = useDawProjectStore((s) => s.clips)
  const automationLanes = useDawProjectStore((s) => s.automation_lanes)
  const activeProject = useDawProjectStore((s) => s.active_project)

  const mode = modeQuery.data ?? null
  const available = Boolean(mode?.daw_mode_available)
  const pluginCount = tracks.reduce((sum, t) => sum + t.plugins.length, 0)

  return {
    modeQuery,
    mode,
    available,
    health: deriveHealth(mode),
    activeProject,
    trackCount: tracks.length,
    clipCount: clips.length,
    pluginCount,
    automationLaneCount: automationLanes.length,
  }
}
