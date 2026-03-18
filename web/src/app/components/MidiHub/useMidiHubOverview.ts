import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { midiHubApi } from '../../../map2/api'
import { readPorts } from './MidiHubWorkbenchCards'

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  return value as Record<string, unknown>
}

export function useMidiHubOverview(apiNodeId: string | null, scopeKey: string) {
  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'status'],
    queryFn: () => midiHubApi.getStatusForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'routes'],
    queryFn: () => midiHubApi.getRoutesForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const clockQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'clock'],
    queryFn: () => midiHubApi.getClockStatusForNode(apiNodeId),
    refetchInterval: 2000,
  })

  const presetsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'presets'],
    queryFn: () => midiHubApi.listPresetsForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'network-sessions'],
    queryFn: () => midiHubApi.listNetworkSessionsForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const statusRecord = useMemo(() => readRecord(statusQuery.data), [statusQuery.data])
  const ports = useMemo(() => readPorts(statusRecord.ports), [statusRecord])
  const inputPorts = useMemo(
    () => ports.filter((port) => port.direction === 'input' || port.direction === 'duplex'),
    [ports],
  )
  const outputPorts = useMemo(
    () => ports.filter((port) => port.direction === 'output' || port.direction === 'duplex'),
    [ports],
  )

  const presetMap = useMemo(() => {
    return new Map((presetsQuery.data?.presets ?? []).map((preset) => [preset.preset_id, preset.name]))
  }, [presetsQuery.data?.presets])

  const defaultPresetId = String(readRecord(presetsQuery.data?.default).default_preset_id ?? '')
  const activePresetName = defaultPresetId ? presetMap.get(defaultPresetId) ?? defaultPresetId : 'Manual'
  const routesCount = routesQuery.data?.routes?.length ?? 0
  const connectedDeviceCount = ports.length
  const sessionsCount = sessionsQuery.data?.sessions?.length ?? 0

  const health = statusQuery.isError
    ? 'degraded'
    : ports.length > 0 || routesCount > 0 || sessionsCount > 0
      ? 'online'
      : 'idle'

  return {
    statusQuery,
    routesQuery,
    clockQuery,
    presetsQuery,
    sessionsQuery,
    ports,
    inputPorts,
    outputPorts,
    routesCount,
    connectedDeviceCount,
    sessionsCount,
    activePresetName,
    health,
  }
}
