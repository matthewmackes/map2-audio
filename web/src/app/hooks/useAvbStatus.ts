/**
 * React hooks for AVB/TSN data fetching
 *
 * Provides type-safe hooks for querying AVB status, streams, and discovery data.
 * Includes graceful degradation when AVB is disabled (503 responses).
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface PTPStatus {
  available: boolean;
  state?: string;
  offset_ns?: number;
  mean_path_delay_ns?: number;
  grandmaster_id?: string;
  error?: string;
}

export interface AVBStatus {
  enabled: boolean;
  available: boolean;
  interface: string;
  ptp: PTPStatus;
  reason?: string;
  config: {
    ptp_domain: number;
    ptp_priority1: number;
    auto_connect: boolean;
    max_streams: number;
  };
}

export interface AVBStream {
  stream_id: string;
  direction: 'talker' | 'listener';
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  channels: number;
  sample_rate: number;
  buffer_size?: number;
  interface?: string;
  dest_mac?: string;
}

export interface AVBStreamsResponse {
  available: boolean;
  streams: AVBStream[];
  error?: string;
}

export interface AVBNode {
  node_id: string;
  hostname: string;
  addresses: string[];
  port: number;
  avb_capabilities?: {
    interface: string;
    stream_id: string;
    ptp_synced: boolean;
    ptp_offset_ns: number;
    tsn_configured: boolean;
    talker_streams: number;
    listener_streams: number;
    max_streams: number;
    sample_rate: number;
    channels: number;
  };
  last_seen: string;
}

export interface AVBDiscoveryResponse {
  enabled: boolean;
  total_discovered: number;
  talker_nodes: number;
  listener_nodes: number;
  nodes: AVBNode[];
  error?: string;
}

export interface TsnStatus {
  available: boolean;
  interface?: string;
  mqprio_configured?: boolean;
  cbs_configured?: boolean;
  etf_configured?: boolean;
  vlan_configured?: boolean;
  num_traffic_classes?: number;
  cbs_idleslope?: number;
  error?: string;
}

// ============================================================================
// API Client Functions
// ============================================================================

const API_BASE = 'http://localhost:8080/api/avb';

async function fetchAVBStatus(): Promise<AVBStatus> {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok && response.status !== 503) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchAVBStreams(): Promise<AVBStreamsResponse> {
  const response = await fetch(`${API_BASE}/streams`);
  if (!response.ok && response.status !== 503) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchAVBDiscovery(): Promise<AVBDiscoveryResponse> {
  const response = await fetch(`${API_BASE}/discovery`);
  if (!response.ok && response.status !== 503) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchPTPStatus(): Promise<PTPStatus> {
  const response = await fetch(`${API_BASE}/ptp/status`);
  if (!response.ok && response.status !== 503) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchTsnStatus(): Promise<TsnStatus> {
  const response = await fetch(`${API_BASE}/tsn/status`);
  if (!response.ok && response.status !== 503) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch overall AVB status
 *
 * Returns AVB availability, config, and PTP status.
 * Gracefully handles 503 (AVB disabled) responses.
 */
export function useAVBStatus(): UseQueryResult<AVBStatus, Error> {
  return useQuery({
    queryKey: ['avb', 'status'],
    queryFn: fetchAVBStatus,
    refetchInterval: 5000, // Poll every 5 seconds
    retry: (failureCount, error) => {
      // Don't retry on 503 (service unavailable = AVB disabled)
      if (error.message.includes('503')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 3000,
  });
}

/**
 * Hook to fetch AVB streams
 *
 * Returns list of active talker and listener streams.
 * Only enabled when AVB is available.
 */
export function useAVBStreams(enabled: boolean = true): UseQueryResult<AVBStreamsResponse, Error> {
  return useQuery({
    queryKey: ['avb', 'streams'],
    queryFn: fetchAVBStreams,
    refetchInterval: 5000,
    enabled,
    retry: (failureCount, error) => {
      if (error.message.includes('503')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 3000,
  });
}

/**
 * Hook to fetch AVB device discovery
 *
 * Returns list of discovered AVB nodes on the network via mDNS.
 * Only enabled when AVB is available.
 */
export function useAVBDiscovery(enabled: boolean = true): UseQueryResult<AVBDiscoveryResponse, Error> {
  return useQuery({
    queryKey: ['avb', 'discovery'],
    queryFn: fetchAVBDiscovery,
    refetchInterval: 10000, // Poll every 10 seconds (discovery is slower)
    enabled,
    retry: (failureCount, error) => {
      if (error.message.includes('503')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 8000,
  });
}

/**
 * Hook to fetch PTP synchronization status
 *
 * Returns gPTP clock sync status (IEEE 802.1AS).
 * Only enabled when AVB is available.
 */
export function usePTPStatus(enabled: boolean = true): UseQueryResult<PTPStatus, Error> {
  return useQuery({
    queryKey: ['avb', 'ptp'],
    queryFn: fetchPTPStatus,
    refetchInterval: 3000, // Poll every 3 seconds (PTP updates frequently)
    enabled,
    retry: (failureCount, error) => {
      if (error.message.includes('503')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 2000,
  });
}

/**
 * Hook to fetch TSN qdisc status
 *
 * Returns TSN traffic shaping configuration status.
 * Only enabled when AVB is available.
 */
export function useTsnStatus(enabled: boolean = true): UseQueryResult<TsnStatus, Error> {
  return useQuery({
    queryKey: ['avb', 'tsn'],
    queryFn: fetchTsnStatus,
    refetchInterval: 10000, // Poll every 10 seconds (TSN config is static)
    enabled,
    retry: (failureCount, error) => {
      if (error.message.includes('503')) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 8000,
  });
}

/**
 * Helper hook to check if AVB is available
 *
 * Returns true if AVB is enabled and available on this node.
 * Use this to conditionally render AVB-related UI components.
 */
export function useIsAVBAvailable(): boolean {
  const { data: status } = useAVBStatus();
  return status?.enabled === true && status?.available === true;
}
