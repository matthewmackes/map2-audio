/**
 * Custom hooks for Host Machine Page
 * Manages data fetching and caching for system information
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { map2Api } from '@/map2/api'
import type { HostMachineInfo, DiskHealthData, SystemHealthOverview, BrandingAssets } from '@/map2/types'

type FanoutNodeBody<T> = {
  status_code?: number
  body?: T
}

type FanoutResponse<T> = {
  nodes?: Record<string, FanoutNodeBody<T>>
}

type ClusterHardwareNode = {
  hostname?: string
  audio_interfaces?: string[]
  pipewire_devices?: Array<Record<string, unknown>>
  usb_audio_devices?: Array<Record<string, unknown>>
  midi_devices?: Array<Record<string, unknown>>
  status?: string
}

type ClusterDevicesResponse = {
  nodes?: Record<string, ClusterHardwareNode>
}

export type HostMachineComparisonNode = {
  nodeId: string
  hostInfo: HostMachineInfo | null
  diskHealth: DiskHealthData | null
  healthOverview: SystemHealthOverview | null
  hardware: ClusterHardwareNode | null
}

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
  HOST_INFO: 24 * 60 * 60 * 1000, // 24 hours - static info
  DISK_HEALTH: 5000, // 5 seconds - changes less frequently
  HEALTH_OVERVIEW: 2000, // 2 seconds - real-time metrics
  BRANDING: 24 * 60 * 60 * 1000, // 24 hours - static branding
}

function asNodeRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {}
}

async function fetchFanout<T>(path: string): Promise<Record<string, FanoutNodeBody<T>>> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${path}${separator}node_id=all`)
  if (!response.ok) {
    throw new Error(`Failed to fetch cluster data: ${response.status}`)
  }
  const payload = await response.json() as FanoutResponse<T>
  return asNodeRecord<FanoutNodeBody<T>>(payload?.nodes)
}

async function fetchClusterComparison(): Promise<HostMachineComparisonNode[]> {
  const [hostNodes, diskNodes, healthNodes, devicesPayload] = await Promise.all([
    fetchFanout<HostMachineInfo>('/api/system/host-machine-info'),
    fetchFanout<DiskHealthData>('/api/system/disk-health'),
    fetchFanout<SystemHealthOverview>('/api/system/health-overview'),
    fetch('/api/cluster/health/extended/devices').then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch cluster hardware inventory: ${response.status}`)
      }
      return response.json() as Promise<ClusterDevicesResponse>
    }),
  ])

  const deviceNodes = asNodeRecord<ClusterHardwareNode>(devicesPayload?.nodes)
  const nodeIds = new Set<string>([
    ...Object.keys(hostNodes),
    ...Object.keys(diskNodes),
    ...Object.keys(healthNodes),
    ...Object.keys(deviceNodes),
  ])

  return Array.from(nodeIds)
    .sort()
    .map((nodeId) => ({
      nodeId,
      hostInfo: hostNodes[nodeId]?.body ?? null,
      diskHealth: diskNodes[nodeId]?.body ?? null,
      healthOverview: healthNodes[nodeId]?.body ?? null,
      hardware: deviceNodes[nodeId] ?? null,
    }))
}

/**
 * Fetch host machine information (manufacturer, CPU, etc.)
 * Cached for 24 hours as it's static system information
 */
export function useHostMachineInfo(nodeId?: string | null) {
  return useQuery<HostMachineInfo>({
    queryKey: ['hostMachineInfo', nodeId ?? 'local'],
    queryFn: () => map2Api.system.getHostMachineInfo(nodeId),
    enabled: nodeId !== 'all',
    staleTime: CACHE_DURATIONS.HOST_INFO,
    gcTime: CACHE_DURATIONS.HOST_INFO,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  })
}

/**
 * Fetch disk health data (SMART, usage, temperature)
 * Cached for 5 seconds
 * Can be auto-refreshed with refetchInterval
 */
export function useDiskHealth(refetchInterval?: number, nodeId?: string | null) {
  return useQuery<DiskHealthData>({
    queryKey: ['diskHealth', nodeId ?? 'local'],
    queryFn: () => map2Api.system.getDiskHealth(nodeId),
    enabled: nodeId !== 'all',
    staleTime: CACHE_DURATIONS.DISK_HEALTH,
    gcTime: CACHE_DURATIONS.DISK_HEALTH,
    refetchInterval,
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * Fetch system health overview (temps, fans, power)
 * Cached for 2 seconds
 * Supports real-time polling via refetchInterval
 */
export function useHealthOverview(refetchInterval?: number, nodeId?: string | null) {
  return useQuery<SystemHealthOverview>({
    queryKey: ['healthOverview', nodeId ?? 'local'],
    queryFn: () => map2Api.system.getHealthOverview(nodeId),
    enabled: nodeId !== 'all',
    staleTime: CACHE_DURATIONS.HEALTH_OVERVIEW,
    gcTime: CACHE_DURATIONS.HEALTH_OVERVIEW,
    refetchInterval,
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * Fetch branding assets for manufacturer
 * Cached for 24 hours as it's static
 */
export function useBrandingAssets(nodeId?: string | null) {
  return useQuery<BrandingAssets>({
    queryKey: ['brandingAssets', nodeId ?? 'local'],
    queryFn: () => map2Api.system.getBrandingAssets(nodeId),
    enabled: nodeId !== 'all',
    staleTime: CACHE_DURATIONS.BRANDING,
    gcTime: CACHE_DURATIONS.BRANDING,
    retry: 2,
  })
}

export function useClusterHostMachineComparison(enableAutoRefresh = false, enabled = false) {
  return useQuery<HostMachineComparisonNode[]>({
    queryKey: ['hostMachineComparison'],
    queryFn: fetchClusterComparison,
    enabled,
    staleTime: 5000,
    gcTime: 5000,
    refetchInterval: enabled ? (enableAutoRefresh ? 5000 : 15000) : false,
    retry: 2,
    retryDelay: 1000,
  })
}

/**
 * Combined hook for fetching all Host Machine Page data
 * Useful for the main page component
 */
export function useHostMachinePageData(nodeId?: string | null, enableAutoRefresh = false) {
  const allNodesSelected = nodeId === 'all'
  const hostInfo = useHostMachineInfo(nodeId)
  const diskHealth = useDiskHealth(enableAutoRefresh ? 5000 : undefined, nodeId)
  const healthOverview = useHealthOverview(enableAutoRefresh ? 2000 : undefined, nodeId)
  const branding = useBrandingAssets(nodeId)
  const clusterComparison = useClusterHostMachineComparison(enableAutoRefresh, allNodesSelected)

  const isLoading = allNodesSelected
    ? clusterComparison.isLoading
    : hostInfo.isLoading || diskHealth.isLoading || healthOverview.isLoading || branding.isLoading

  const isError = allNodesSelected
    ? clusterComparison.isError
    : hostInfo.isError || diskHealth.isError || healthOverview.isError || branding.isError

  const error = allNodesSelected
    ? clusterComparison.error
    : hostInfo.error || diskHealth.error || healthOverview.error || branding.error

  return {
    hostInfo,
    diskHealth,
    healthOverview,
    branding,
    clusterComparison,
    isLoading,
    isError,
    error,
  }
}

/**
 * Hook for manually refreshing all Host Machine data
 */
export function useRefreshHostMachineData(nodeId?: string | null) {
  const queryClient = useQueryClient()
  const scopeKey = nodeId ?? 'local'

  return () => {
    queryClient.invalidateQueries({ queryKey: ['hostMachineInfo', scopeKey] })
    queryClient.invalidateQueries({ queryKey: ['diskHealth', scopeKey] })
    queryClient.invalidateQueries({ queryKey: ['healthOverview', scopeKey] })
    queryClient.invalidateQueries({ queryKey: ['brandingAssets', scopeKey] })
    queryClient.invalidateQueries({ queryKey: ['hostMachineComparison'] })
  }
}

/**
 * Hook to enable/disable auto-refresh for health metrics
 */
export function useHostMachineAutoRefresh(enabled: boolean, nodeId?: string | null) {
  const queryClient = useQueryClient()

  if (enabled) {
    useDiskHealth(5000, nodeId)
    useHealthOverview(2000, nodeId)
  } else {
    queryClient.cancelQueries({ queryKey: ['diskHealth', nodeId ?? 'local'] })
    queryClient.cancelQueries({ queryKey: ['healthOverview', nodeId ?? 'local'] })
  }
}
