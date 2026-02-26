/**
 * React Query hooks for Tesira Forte AVB REST API.
 * All hooks use the tesiraApi object from map2/api.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tesiraApi } from '../../../../map2/api'
import type {
  TesiraDeviceSummary,
  TesiraDeviceDetail,
  TesiraPresetInfo,
  TesiraPTPStatus,
  TesiraStreamInfo,
  PresetInterlockRule,
  DiscoveryScanStatus,
} from '../types'

// ── Query keys ────────────────────────────────────────────────────────────────
export const TESIRA_KEYS = {
  devices:        ['tesira', 'devices'] as const,
  device:         (id: string) => ['tesira', 'devices', id] as const,
  presets:        (id: string) => ['tesira', 'devices', id, 'presets'] as const,
  faults:         (id: string) => ['tesira', 'devices', id, 'faults'] as const,
  avbStreams:     (id: string) => ['tesira', 'devices', id, 'avb', 'streams'] as const,
  ptp:            (id: string) => ['tesira', 'devices', id, 'avb', 'ptp'] as const,
  interlock:      ['tesira', 'preset_interlock'] as const,
  discoveryStatus: ['tesira', 'discovery', 'status'] as const,
}

// ── Device listing ────────────────────────────────────────────────────────────

export function useTesiraDevices() {
  return useQuery<TesiraDeviceSummary[]>({
    queryKey: TESIRA_KEYS.devices,
    queryFn:  () => tesiraApi.listDevices(),
    refetchInterval: 10_000,
  })
}

export function useTesiraDevice(deviceId: string) {
  return useQuery<TesiraDeviceDetail>({
    queryKey: TESIRA_KEYS.device(deviceId),
    queryFn:  () => tesiraApi.getDevice(deviceId),
    enabled:  !!deviceId,
    refetchInterval: 5_000,
  })
}

export function useTesiraPresets(deviceId: string) {
  return useQuery<TesiraPresetInfo[]>({
    queryKey: TESIRA_KEYS.presets(deviceId),
    queryFn:  () => tesiraApi.listPresets(deviceId),
    enabled:  !!deviceId,
  })
}

export function useTesiraFaults(deviceId: string) {
  return useQuery<{ device_id: string; faults: string[] }>({
    queryKey: TESIRA_KEYS.faults(deviceId),
    queryFn:  () => tesiraApi.getFaults(deviceId),
    enabled:  !!deviceId,
    refetchInterval: 30_000,
  })
}

export function useTesiraAvbStreams(deviceId: string) {
  return useQuery<TesiraStreamInfo[]>({
    queryKey: TESIRA_KEYS.avbStreams(deviceId),
    queryFn:  () => tesiraApi.getAvbStreams(deviceId),
    enabled:  !!deviceId,
  })
}

export function useTesiraPTP(deviceId: string) {
  return useQuery<TesiraPTPStatus>({
    queryKey: TESIRA_KEYS.ptp(deviceId),
    queryFn:  () => tesiraApi.getPtp(deviceId),
    enabled:  !!deviceId,
    refetchInterval: 2_000,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useRecallPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deviceId, presetIndex }: { deviceId: string; presetIndex: number }) =>
      tesiraApi.recallPreset(deviceId, presetIndex),
    onSuccess: (_data, { deviceId }) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.device(deviceId) })
    },
  })
}

export function useSetLevel() {
  return useMutation({
    mutationFn: ({ deviceId, tag, channel, levelDb }: {
      deviceId: string; tag: string; channel: number; levelDb: number
    }) => tesiraApi.setLevel(deviceId, tag, channel, levelDb),
  })
}

export function useSetMute() {
  return useMutation({
    mutationFn: ({ deviceId, tag, channel, muted }: {
      deviceId: string; tag: string; channel: number; muted: boolean
    }) => tesiraApi.setMute(deviceId, tag, channel, muted),
  })
}

export function useSetCrosspoint() {
  return useMutation({
    mutationFn: ({ deviceId, tag, row, col, gainDb }: {
      deviceId: string; tag: string; row: number; col: number; gainDb: number
    }) => tesiraApi.setCrosspoint(deviceId, tag, row, col, gainDb),
  })
}

// ── Preset interlock ──────────────────────────────────────────────────────────

export function usePresetInterlockRules() {
  return useQuery<PresetInterlockRule[]>({
    queryKey: TESIRA_KEYS.interlock,
    queryFn:  () => tesiraApi.listInterlockRules(),
  })
}

export function useAddInterlockRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { map2_preset_id: number; tesira_device_id: string; tesira_preset_index: number }) =>
      tesiraApi.addInterlockRule(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TESIRA_KEYS.interlock }),
  })
}

export function useDeleteInterlockRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: number) => tesiraApi.deleteInterlockRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: TESIRA_KEYS.interlock }),
  })
}

// ── Device connect/disconnect ─────────────────────────────────────────────────

export function useConnectDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => tesiraApi.connectDevice(deviceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: TESIRA_KEYS.devices }),
  })
}

export function useDisconnectDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => tesiraApi.disconnectDevice(deviceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: TESIRA_KEYS.devices }),
  })
}

// ── Auto-discovery ────────────────────────────────────────────────────────────

/**
 * Start an mDNS scan for factory-reset Tesira Forte AVB units.
 * After calling mutate(), poll useDiscoveryStatus() or subscribe to
 * the 'tesira:discovery' WebSocket topic for live device-found events.
 */
export function useStartDiscovery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (timeoutS: number = 8) => tesiraApi.startDiscovery(timeoutS),
    onSuccess: () => {
      // Immediately kick off a status poll
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.discoveryStatus })
    },
  })
}

/**
 * Poll the discovery scan status.
 * Automatically re-fetches every second while is_scanning=true.
 */
export function useDiscoveryStatus() {
  return useQuery<DiscoveryScanStatus>({
    queryKey: TESIRA_KEYS.discoveryStatus,
    queryFn:  () => tesiraApi.getDiscoveryStatus(),
    refetchInterval: (q) => (q.state.data?.is_scanning ? 1000 : false),
  })
}

/**
 * Adopt a discovered Tesira device — persists it to config and hot-connects
 * it to the running fleet. Invalidates the device list on success.
 */
export function useAdoptDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ host, name }: { host: string; name?: string }) =>
      tesiraApi.adoptDevice(host, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.devices })
    },
  })
}
