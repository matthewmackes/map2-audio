/**
 * Custom hooks for Host Machine Page
 * Manages data fetching and caching for system information
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { map2Api } from '@/map2/api';
import type { HostMachineInfo, DiskHealthData, SystemHealthOverview, BrandingAssets } from '@/map2/types';

// Cache durations (in milliseconds)
const CACHE_DURATIONS = {
  HOST_INFO: 24 * 60 * 60 * 1000, // 24 hours - static info
  DISK_HEALTH: 5000, // 5 seconds - changes less frequently
  HEALTH_OVERVIEW: 2000, // 2 seconds - real-time metrics
  BRANDING: 24 * 60 * 60 * 1000, // 24 hours - static branding
};

/**
 * Fetch host machine information (manufacturer, CPU, etc.)
 * Cached for 24 hours as it's static system information
 */
export function useHostMachineInfo() {
  return useQuery<HostMachineInfo>({
    queryKey: ['hostMachineInfo'],
    queryFn: () => map2Api.system.getHostMachineInfo(),
    staleTime: CACHE_DURATIONS.HOST_INFO,
    gcTime: CACHE_DURATIONS.HOST_INFO,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

/**
 * Fetch disk health data (SMART, usage, temperature)
 * Cached for 5 seconds
 * Can be auto-refreshed with refetchInterval
 */
export function useDiskHealth(refetchInterval?: number) {
  return useQuery<DiskHealthData>({
    queryKey: ['diskHealth'],
    queryFn: () => map2Api.system.getDiskHealth(),
    staleTime: CACHE_DURATIONS.DISK_HEALTH,
    gcTime: CACHE_DURATIONS.DISK_HEALTH,
    refetchInterval,
    retry: 2,
    retryDelay: 1000,
  });
}

/**
 * Fetch system health overview (temps, fans, power)
 * Cached for 2 seconds
 * Supports real-time polling via refetchInterval
 */
export function useHealthOverview(refetchInterval?: number) {
  return useQuery<SystemHealthOverview>({
    queryKey: ['healthOverview'],
    queryFn: () => map2Api.system.getHealthOverview(),
    staleTime: CACHE_DURATIONS.HEALTH_OVERVIEW,
    gcTime: CACHE_DURATIONS.HEALTH_OVERVIEW,
    refetchInterval,
    retry: 2,
    retryDelay: 1000,
  });
}

/**
 * Fetch branding assets for manufacturer
 * Cached for 24 hours as it's static
 */
export function useBrandingAssets() {
  return useQuery<BrandingAssets>({
    queryKey: ['brandingAssets'],
    queryFn: () => map2Api.system.getBrandingAssets(),
    staleTime: CACHE_DURATIONS.BRANDING,
    gcTime: CACHE_DURATIONS.BRANDING,
    retry: 2,
  });
}

/**
 * Combined hook for fetching all Host Machine Page data
 * Useful for the main page component
 */
export function useHostMachinePageData(enableAutoRefresh = false) {
  const hostInfo = useHostMachineInfo();
  const diskHealth = useDiskHealth(enableAutoRefresh ? 5000 : undefined);
  const healthOverview = useHealthOverview(enableAutoRefresh ? 2000 : undefined);
  const branding = useBrandingAssets();

  const isLoading = hostInfo.isLoading || diskHealth.isLoading || healthOverview.isLoading || branding.isLoading;
  const isError = hostInfo.isError || diskHealth.isError || healthOverview.isError || branding.isError;
  const error = hostInfo.error || diskHealth.error || healthOverview.error || branding.error;

  return {
    hostInfo,
    diskHealth,
    healthOverview,
    branding,
    isLoading,
    isError,
    error,
  };
}

/**
 * Hook for manually refreshing all Host Machine data
 */
export function useRefreshHostMachineData() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['hostMachineInfo'] });
    queryClient.invalidateQueries({ queryKey: ['diskHealth'] });
    queryClient.invalidateQueries({ queryKey: ['healthOverview'] });
    queryClient.invalidateQueries({ queryKey: ['brandingAssets'] });
  };
}

/**
 * Hook to enable/disable auto-refresh for health metrics
 */
export function useHostMachineAutoRefresh(enabled: boolean) {
  const queryClient = useQueryClient();

  if (enabled) {
    // Set up auto-refresh intervals
    useDiskHealth(5000);
    useHealthOverview(2000);
  } else {
    // Stop refetching
    queryClient.cancelQueries({ queryKey: ['diskHealth'] });
    queryClient.cancelQueries({ queryKey: ['healthOverview'] });
  }
}
