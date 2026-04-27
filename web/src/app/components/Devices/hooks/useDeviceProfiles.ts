/**
 * useDeviceProfiles / useDevicePackSources / useDeviceKnown / useDeviceDiagnostics
 *
 * T2459-G3. SWR-style TanStack Query hooks over the G1 REST surface
 * (`/api/devices/{packs/sources,profiles,known,diagnostics}`).
 *
 * The Hardware Store page composes connected (WS-driven, from
 * useDeviceConnections) with these polling reads. Polling cadence is
 * conservative — these endpoints are cheap reads, but avoid hammering
 * a multi-node bench.
 */

import { useQuery } from '@tanstack/react-query'

import {
  listConnectedDevices,
  listDeviceDiagnostics,
  listDeviceProfiles,
  listKnownDevices,
  listMeasureLatencyHistory,
  listPackSources,
  listRecentlyDisconnected,
  type DeviceProfileSummary,
  type ConnectedResponse,
  type DiagnosticsResponse,
  type KnownDeviceRow,
  type MeasureLatencyHistoryRow,
  type PackSourceRow,
  type RecentlyDisconnectedRow,
} from '../../../../map2/clients/devices'

const QUERY_KEYS = {
  profiles: (kind?: string) => ['devices', 'profiles', kind ?? 'all'] as const,
  packSources: () => ['devices', 'packs', 'sources'] as const,
  connected: () => ['devices', 'connected'] as const,
  known: () => ['devices', 'known'] as const,
  recentlyDisconnected: () => ['devices', 'recently-disconnected'] as const,
  diagnostics: (severity?: string, source?: string) =>
    ['devices', 'diagnostics', severity ?? 'all', source ?? 'all'] as const,
}

export function useDeviceProfiles(kind?: 'audio' | 'midi' | 'hid') {
  return useQuery<{ profiles: DeviceProfileSummary[]; count: number }>({
    queryKey: QUERY_KEYS.profiles(kind),
    queryFn: () => listDeviceProfiles(kind),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function usePackSources() {
  return useQuery<{ sources: PackSourceRow[]; count: number }>({
    queryKey: QUERY_KEYS.packSources(),
    queryFn: () => listPackSources(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useConnectedDevices() {
  // Polled fallback for the WS hook — covers the gap when the WS is
  // reconnecting, and keeps SWR cache warm for components that don't
  // need the live event stream.
  return useQuery<ConnectedResponse>({
    queryKey: QUERY_KEYS.connected(),
    queryFn: () => listConnectedDevices(),
    staleTime: 2_000,
    refetchInterval: 5_000,
  })
}

export function useKnownDevices() {
  return useQuery<{ known: KnownDeviceRow[]; count: number }>({
    queryKey: QUERY_KEYS.known(),
    queryFn: () => listKnownDevices(),
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useRecentlyDisconnected() {
  return useQuery<{ recently_disconnected: RecentlyDisconnectedRow[]; count: number }>({
    queryKey: QUERY_KEYS.recentlyDisconnected(),
    queryFn: () => listRecentlyDisconnected(),
    staleTime: 2_000,
    refetchInterval: 5_000,
  })
}

export function useDeviceDiagnostics(opts?: {
  severity?: 'info' | 'warning' | 'error'
  source?: string
}) {
  return useQuery<DiagnosticsResponse>({
    queryKey: QUERY_KEYS.diagnostics(opts?.severity, opts?.source),
    queryFn: () => listDeviceDiagnostics(opts),
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useMeasureLatencyHistory(packId: string, model: string, limit = 20) {
  return useQuery<{ history: MeasureLatencyHistoryRow[]; count: number }>({
    queryKey: ['devices', 'measure-latency', 'history', packId, model, limit],
    queryFn: () => listMeasureLatencyHistory(packId, model, limit),
    enabled: Boolean(packId && model),
    staleTime: 10_000,
  })
}
