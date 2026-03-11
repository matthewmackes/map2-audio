/**
 * React Query hooks for Tesira Forte AVB REST API.
 * All hooks use the tesiraApi object from map2/api.ts.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { tesiraApi } from '../../../../map2/api'
import type {
  TesiraCapabilityEnvelope,
  TesiraCrosspointMatrix,
  TesiraDesignCompileBatchResponse,
  TesiraDesignCompileResponse,
  TesiraDesignDiagnosticsResponse,
  TesiraDesignGraph,
  TesiraDesignLibraryResponse,
  TesiraDesignMutationResponse,
  TesiraDesignValidateResponse,
  TesiraDesignWorkspaceDetailResponse,
  TesiraDesignWorkspaceListResponse,
  TesiraDeploymentJob,
  TesiraDeviceSummary,
  TesiraDeviceDetail,
  TesiraDspBlock,
  TesiraDspBulkResult,
  TesiraDspBulkOperation,
  TesiraDspParamsResponse,
  TesiraDspProbeResult,
  TesiraFleetHealth,
  TesiraGpioListResponse,
  TesiraMeterHistoryResponse,
  TesiraMeterPeakResponse,
  TesiraPtpTopologyResponse,
  TesiraPresetInfo,
  TesiraPTPStatus,
  TesiraLayoutArtifact,
  TesiraLayoutListResponse,
  TesiraSageVueStatus,
  TesiraStreamInfo,
  PresetInterlockRule,
  DiscoveryScanStatus,
  TesiraFirmwareStatus,
  TesiraLatestFirmware,
  TesiraMutationResponse,
  TesiraSceneListResponse,
} from '../types'

type FanoutNodeResponse<T> = {
  status_code?: number
  body?: T
}

type FanoutPayload<T> = {
  nodes?: Record<string, FanoutNodeResponse<T>>
}

// ── Query keys ────────────────────────────────────────────────────────────────
export const TESIRA_KEYS = {
  devices:        ['tesira', 'devices'] as const,
  device:         (id: string) => ['tesira', 'devices', id] as const,
  presets:        (id: string) => ['tesira', 'devices', id, 'presets'] as const,
  faults:         (id: string) => ['tesira', 'devices', id, 'faults'] as const,
  capabilities:   (id: string) => ['tesira', 'devices', id, 'capabilities'] as const,
  avbStreams:     (id: string) => ['tesira', 'devices', id, 'avb', 'streams'] as const,
  ptp:            (id: string) => ['tesira', 'devices', id, 'avb', 'ptp'] as const,
  fleetHealth:    ['tesira', 'fleet', 'health'] as const,
  ptpTopology:    ['tesira', 'fleet', 'ptp-topology'] as const,
  crosspoint:     (id: string, tag: string, rows: number, cols: number) =>
    ['tesira', 'devices', id, 'crosspoint', tag, rows, cols] as const,
  dspBlocks:      (id: string) => ['tesira', 'devices', id, 'dsp', 'blocks'] as const,
  dspBlock:       (id: string, tag: string) => ['tesira', 'devices', id, 'dsp', 'blocks', tag] as const,
  dspParams:      (id: string, tag: string) => ['tesira', 'devices', id, 'dsp', tag, 'params'] as const,
  gpio:           (id: string) => ['tesira', 'devices', id, 'gpio'] as const,
  scenes:         (id: string) => ['tesira', 'devices', id, 'scenes'] as const,
  meterHistory:   (id: string, tag: string, limit: number) =>
    ['tesira', 'devices', id, 'meters', tag, 'history', limit] as const,
  meterPeak:      (id: string, tag: string) => ['tesira', 'devices', id, 'meters', tag, 'peak'] as const,
  layouts:        ['tesira', 'layouts'] as const,
  layout:         (layoutId: string, version?: string) => ['tesira', 'layouts', layoutId, version ?? 'latest'] as const,
  sagevueStatus:  ['tesira', 'sagevue', 'status'] as const,
  deployment:     (jobId: string) => ['tesira', 'deployments', jobId] as const,
  designs:        (deviceId: string) => ['tesira', 'devices', deviceId, 'designs'] as const,
  design:         (deviceId: string, designId: string) => ['tesira', 'devices', deviceId, 'designs', designId] as const,
  designLibrary:  (deviceId: string, profile?: string) =>
    ['tesira', 'devices', deviceId, 'designs', 'library', profile ?? 'forte_ci_v1'] as const,
  designDiagnostics: (deviceId: string, designId: string) =>
    ['tesira', 'devices', deviceId, 'designs', designId, 'diagnostics'] as const,
  interlock:      ['tesira', 'preset_interlock'] as const,
  discoveryStatus: ['tesira', 'discovery', 'status'] as const,
  firmwareLatest: ['tesira', 'firmware', 'latest'] as const,
  deviceFirmware: (id: string) => ['tesira', 'devices', id, 'firmware'] as const,
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(typeof document === 'undefined' ? true : !document.hidden)

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return visible
}

async function fetchTesiraFanout<T>(path: string): Promise<Record<string, FanoutNodeResponse<T>>> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${path}${separator}node_id=all`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Tesira cluster data: ${response.status}`)
  }
  const payload = await response.json() as FanoutPayload<T>
  return payload.nodes ?? {}
}

async function fetchTesiraJson<T>(path: string, nodeId?: string | null): Promise<T> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(nodeId ? `${path}${separator}node_id=${encodeURIComponent(nodeId)}` : path)
  if (!response.ok) {
    throw new Error(`Failed to fetch Tesira data: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function mergeTesiraDevices(nodes: Record<string, FanoutNodeResponse<TesiraDeviceSummary[]>>): TesiraDeviceSummary[] {
  const merged = new Map<string, TesiraDeviceSummary>()

  for (const [nodeId, nodeResponse] of Object.entries(nodes)) {
    for (const device of nodeResponse.body ?? []) {
      const existing = merged.get(device.device_id)
      const hosts = Array.from(new Set([...(existing?.discovered_by_hosts ?? []), device.host]))
      const nodeIds = Array.from(new Set([...(existing?.discovered_by_node_ids ?? []), nodeId]))
      merged.set(device.device_id, {
        ...(existing ?? device),
        ...device,
        source_node_id: existing?.source_node_id ?? nodeId,
        source_hostname: existing?.source_hostname ?? device.host,
        discovered_by_node_ids: nodeIds,
        discovered_by_hosts: hosts,
      })
    }
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name))
}

function useTesiraDeviceNodeId(deviceId: string): string | null {
  const { data: devices = [] } = useTesiraDevices()
  return useMemo(
    () => devices.find((device) => device.device_id === deviceId)?.source_node_id ?? null,
    [deviceId, devices],
  )
}

// ── Device listing ────────────────────────────────────────────────────────────

export function useTesiraDevices() {
  const visible = usePageVisible()
  return useQuery<TesiraDeviceSummary[]>({
    queryKey: TESIRA_KEYS.devices,
    queryFn: async () => mergeTesiraDevices(await fetchTesiraFanout<TesiraDeviceSummary[]>('/api/tesira/devices')),
    refetchInterval: visible ? 10_000 : false,
  })
}

export function useTesiraDevice(deviceId: string) {
  const visible = usePageVisible()
  const { data: devices = [] } = useTesiraDevices()
  const nodeId = useTesiraDeviceNodeId(deviceId)
  const deviceSummary = devices.find((device) => device.device_id === deviceId)
  return useQuery<TesiraDeviceDetail>({
    queryKey: [...TESIRA_KEYS.device(deviceId), nodeId ?? 'local'],
    queryFn: async () => {
      const detail = await fetchTesiraJson<TesiraDeviceDetail>(`/api/tesira/devices/${encodeURIComponent(deviceId)}`, nodeId)
      return {
        ...detail,
        source_node_id: deviceSummary?.source_node_id ?? nodeId,
        source_hostname: deviceSummary?.source_hostname ?? deviceSummary?.source_node_id ?? nodeId,
        discovered_by_node_ids: deviceSummary?.discovered_by_node_ids ?? (nodeId ? [nodeId] : []),
        discovered_by_hosts: deviceSummary?.discovered_by_hosts ?? [],
      }
    },
    enabled:  !!deviceId && !!nodeId,
    refetchInterval: visible ? 5_000 : false,
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
  const visible = usePageVisible()
  return useQuery<{ device_id: string; faults: string[] }>({
    queryKey: TESIRA_KEYS.faults(deviceId),
    queryFn:  () => tesiraApi.getFaults(deviceId),
    enabled:  !!deviceId,
    refetchInterval: visible ? 30_000 : false,
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
  const visible = usePageVisible()
  return useQuery<TesiraPTPStatus>({
    queryKey: TESIRA_KEYS.ptp(deviceId),
    queryFn:  () => tesiraApi.getPtp(deviceId),
    enabled:  !!deviceId,
    refetchInterval: visible ? 2_000 : false,
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
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deviceId, tag, row, col, gainDb }: {
      deviceId: string; tag: string; row: number; col: number; gainDb: number; rows?: number; cols?: number
    }) => tesiraApi.setCrosspoint(deviceId, tag, row, col, gainDb),
    onSuccess: (_data, vars) => {
      if (vars.rows && vars.cols) {
        qc.invalidateQueries({ queryKey: TESIRA_KEYS.crosspoint(vars.deviceId, vars.tag, vars.rows, vars.cols) })
      }
    },
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
  const visible = usePageVisible()
  return useQuery<DiscoveryScanStatus>({
    queryKey: TESIRA_KEYS.discoveryStatus,
    queryFn:  () => tesiraApi.getDiscoveryStatus(),
    refetchInterval: (q) => (visible && q.state.data?.is_scanning ? 1000 : false),
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

/**
 * Manually add a Tesira device by IP — no TTP probe required.
 * Works for configured units where TTP/SSH may be disabled (port 61451 open).
 * Device will show Offline until TTP is enabled in Tesira Software.
 */
export function useAddDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ host, port = 23, name }: { host: string; port?: number; name?: string }) =>
      tesiraApi.addDevice(host, port, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.devices })
    },
  })
}

// ── Firmware management ────────────────────────────────────────────────────────

/**
 * Fetch the latest Tesira firmware version from Biamp's release notes.
 * Cached on the backend for 1 hour.
 */
export function useFirmwareLatest() {
  return useQuery<TesiraLatestFirmware>({
    queryKey: TESIRA_KEYS.firmwareLatest,
    queryFn:  () => tesiraApi.getLatestFirmware(),
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

/**
 * Fetch firmware status for a specific device: current vs latest version,
 * update_available flag, and useful links.
 */
export function useDeviceFirmware(deviceId: string) {
  const visible = usePageVisible()
  return useQuery<TesiraFirmwareStatus>({
    queryKey: TESIRA_KEYS.deviceFirmware(deviceId),
    queryFn:  () => tesiraApi.getDeviceFirmware(deviceId),
    enabled:  !!deviceId,
    refetchInterval: visible ? 5 * 60 * 1000 : false, // 5 min
  })
}

/**
 * Reboot a Tesira device via TTP DEVICE reboot command.
 * Only works when device is connected (TTP enabled).
 */
export function useRebootDevice() {
  const qc = useQueryClient()
  return useMutation<TesiraMutationResponse, Error, string>({
    mutationFn: (deviceId: string) => tesiraApi.rebootDevice(deviceId),
    onSuccess: (_data, deviceId) => {
      // Device will disconnect during reboot; invalidate after brief delay
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: TESIRA_KEYS.devices })
        qc.invalidateQueries({ queryKey: TESIRA_KEYS.device(deviceId) })
      }, 2000)
    },
  })
}

/**
 * Trigger an immediate reconnect attempt for an offline device.
 * Probes port 61451 and retries TTP port 23.
 */
export function useReconnectDevice() {
  const qc = useQueryClient()
  return useMutation<TesiraMutationResponse, Error, string>({
    mutationFn: (deviceId: string) => tesiraApi.reconnectDevice(deviceId),
    onSuccess: (_data, deviceId) => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: TESIRA_KEYS.devices })
        qc.invalidateQueries({ queryKey: TESIRA_KEYS.device(deviceId) })
      }, 3000)
    },
  })
}

// ── Fleet + topology ─────────────────────────────────────────────────────────

export function useTesiraFleetHealth() {
  const devicesQuery = useTesiraDevices()
  const health = useMemo<TesiraFleetHealth | undefined>(() => {
    if (!devicesQuery.data) {
      return undefined
    }
    const total = devicesQuery.data.length
    const connected = devicesQuery.data.filter((device) => device.connected).length
    const offline = total - connected
    return {
      status: connected > 0 ? 'healthy' : 'degraded',
      total_devices: total,
      connected_devices: connected,
      offline_devices: offline,
      connected_ratio: total > 0 ? connected / total : 0,
    }
  }, [devicesQuery.data])

  return {
    data: health,
    error: devicesQuery.error,
    isError: devicesQuery.isError,
    isLoading: devicesQuery.isLoading,
    refetch: devicesQuery.refetch,
  }
}

export function useTesiraPtpTopology() {
  const visible = usePageVisible()
  return useQuery<TesiraPtpTopologyResponse>({
    queryKey: TESIRA_KEYS.ptpTopology,
    queryFn: async () => {
      const nodes = await fetchTesiraFanout<TesiraPtpTopologyResponse>('/api/tesira/fleet/ptp-topology')
      const mergedNodes = Object.entries(nodes).flatMap(([nodeId, response]) =>
        (response.body?.nodes ?? []).map((row) => ({
          ...row,
          source_node_id: nodeId,
        }))
      )
      return {
        nodes: mergedNodes,
        grandmaster_ids: Array.from(new Set(mergedNodes.map((row) => row.grandmaster_id).filter(Boolean))) as string[],
        node_count: mergedNodes.length,
      }
    },
    refetchInterval: visible ? 2000 : false,
  })
}

export function useTesiraCapabilities(deviceId: string) {
  return useQuery<TesiraCapabilityEnvelope>({
    queryKey: TESIRA_KEYS.capabilities(deviceId),
    queryFn: () => tesiraApi.getCapabilities(deviceId),
    enabled: !!deviceId,
  })
}

export function useTesiraLayouts(params?: { deviceFamily?: string; includeInactive?: boolean }) {
  return useQuery<TesiraLayoutListResponse>({
    queryKey: [...TESIRA_KEYS.layouts, params?.deviceFamily ?? 'all', params?.includeInactive ? 'with-inactive' : 'active'],
    queryFn: () => tesiraApi.listLayouts(params),
  })
}

export function useTesiraLayout(layoutId: string, version?: string) {
  return useQuery<TesiraLayoutArtifact>({
    queryKey: TESIRA_KEYS.layout(layoutId, version),
    queryFn: () => tesiraApi.getLayout(layoutId, version),
    enabled: !!layoutId,
  })
}

export function useTesiraSageVueStatus() {
  const visible = usePageVisible()
  return useQuery<TesiraSageVueStatus>({
    queryKey: TESIRA_KEYS.sagevueStatus,
    queryFn: () => tesiraApi.getSageVueStatus(),
    refetchInterval: visible ? 15_000 : false,
  })
}

export function useStartTesiraDeployment() {
  const qc = useQueryClient()
  return useMutation<TesiraDeploymentJob, Error, {
    deviceId: string
    layoutId: string
    layoutVersion?: string
    dryRun?: boolean
    requestedBy?: string
    rollbackLayoutId?: string
    rollbackLayoutVersion?: string
  }>({
    mutationFn: ({
      deviceId,
      layoutId,
      layoutVersion = '1.0.0',
      dryRun = true,
      requestedBy,
      rollbackLayoutId,
      rollbackLayoutVersion,
    }) =>
      tesiraApi.startDeployment(deviceId, {
        layout_id: layoutId,
        layout_version: layoutVersion,
        dry_run: dryRun,
        requested_by: requestedBy ?? null,
        rollback_layout_id: rollbackLayoutId ?? null,
        rollback_layout_version: rollbackLayoutVersion ?? null,
      }),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.device(job.device_id) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.layouts })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.deployment(job.job_id) })
    },
  })
}

export function useTesiraDeployment(jobId: string) {
  const visible = usePageVisible()
  return useQuery<TesiraDeploymentJob>({
    queryKey: TESIRA_KEYS.deployment(jobId),
    queryFn: () => tesiraApi.getDeployment(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      if (!visible || !query.state.data) return false
      const status = query.state.data.status
      if (status === 'succeeded' || status === 'failed' || status === 'rolled_back') return false
      return 1500
    },
  })
}

export function useRollbackTesiraDeployment() {
  const qc = useQueryClient()
  return useMutation<TesiraDeploymentJob, Error, {
    jobId: string
    requestedBy?: string
    layoutId?: string
    layoutVersion?: string
  }>({
    mutationFn: ({ jobId, requestedBy, layoutId, layoutVersion }) =>
      tesiraApi.rollbackDeployment(jobId, {
        requested_by: requestedBy ?? null,
        layout_id: layoutId ?? null,
        layout_version: layoutVersion ?? null,
      }),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.deployment(job.job_id) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.device(job.device_id) })
    },
  })
}

export function useTesiraDesigns(deviceId: string) {
  return useQuery<TesiraDesignWorkspaceListResponse>({
    queryKey: TESIRA_KEYS.designs(deviceId),
    queryFn: () => tesiraApi.listDesigns(deviceId),
    enabled: !!deviceId,
  })
}

export function useTesiraDesign(deviceId: string, designId: string) {
  return useQuery<TesiraDesignWorkspaceDetailResponse>({
    queryKey: TESIRA_KEYS.design(deviceId, designId),
    queryFn: () => tesiraApi.getDesign(deviceId, designId),
    enabled: !!deviceId && !!designId,
  })
}

export function useTesiraDesignLibrary(deviceId: string, profile?: string) {
  return useQuery<TesiraDesignLibraryResponse>({
    queryKey: TESIRA_KEYS.designLibrary(deviceId, profile),
    queryFn: () => tesiraApi.getDesignLibrary(deviceId, profile),
    enabled: !!deviceId,
  })
}

export function useCreateTesiraDesign() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignMutationResponse, Error, {
    deviceId: string
    name: string
    description?: string
    graph?: TesiraDesignGraph
  }>({
    mutationFn: ({ deviceId, name, description, graph }) =>
      tesiraApi.createDesign(deviceId, {
        name,
        description: description ?? null,
        graph: graph ?? { nodes: [], edges: [], groups: [] },
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
    },
  })
}

export function useUpdateTesiraDesign() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignMutationResponse, Error, {
    deviceId: string
    designId: string
    name?: string
    description?: string
    graph?: TesiraDesignGraph
  }>({
    mutationFn: ({ deviceId, designId, name, description, graph }) =>
      tesiraApi.updateDesign(deviceId, designId, {
        name,
        description: description ?? null,
        graph,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.design(vars.deviceId, vars.designId) })
    },
  })
}

export function useDeleteTesiraDesign() {
  const qc = useQueryClient()
  return useMutation<{ ok: boolean; device_id: string; design_id: string }, Error, {
    deviceId: string
    designId: string
  }>({
    mutationFn: ({ deviceId, designId }) => tesiraApi.deleteDesign(deviceId, designId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
    },
  })
}

export function useValidateTesiraDesign() {
  return useMutation<TesiraDesignValidateResponse, Error, {
    deviceId: string
    designId: string
    graph?: TesiraDesignGraph
  }>({
    mutationFn: ({ deviceId, designId, graph }) => tesiraApi.validateDesign(deviceId, designId, graph),
  })
}

export function useTesiraDesignDiagnostics(deviceId: string, designId: string) {
  return useQuery<TesiraDesignDiagnosticsResponse>({
    queryKey: TESIRA_KEYS.designDiagnostics(deviceId, designId),
    queryFn: () => tesiraApi.getDesignDiagnostics(deviceId, designId),
    enabled: !!deviceId && !!designId,
  })
}

export function useCompileTesiraDesign() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignCompileResponse, Error, {
    deviceId: string
    designId: string
    optimize?: boolean
    recompile?: boolean
  }>({
    mutationFn: ({ deviceId, designId, optimize = false, recompile = false }) =>
      tesiraApi.compileDesign(deviceId, designId, { optimize, recompile }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.design(vars.deviceId, vars.designId) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designDiagnostics(vars.deviceId, vars.designId) })
    },
  })
}

export function useRecompileTesiraDesign() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignCompileResponse, Error, {
    deviceId: string
    designId: string
    optimize?: boolean
  }>({
    mutationFn: ({ deviceId, designId, optimize = false }) =>
      tesiraApi.recompileDesign(deviceId, designId, { optimize }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.design(vars.deviceId, vars.designId) })
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designDiagnostics(vars.deviceId, vars.designId) })
    },
  })
}

export function useCompileActiveTesiraDesign() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignCompileBatchResponse, Error, {
    deviceId: string
    optimize?: boolean
    recompile?: boolean
  }>({
    mutationFn: ({ deviceId, optimize = false, recompile = false }) =>
      tesiraApi.compileActiveDesign(deviceId, { optimize, recompile }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
    },
  })
}

export function useCompileAllTesiraDesigns() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignCompileBatchResponse, Error, {
    deviceId: string
    optimize?: boolean
    recompile?: boolean
    includeTemplates?: boolean
  }>({
    mutationFn: ({ deviceId, optimize = false, recompile = false, includeTemplates = false }) =>
      tesiraApi.compileAllDesigns(deviceId, {
        optimize,
        recompile,
        include_templates: includeTemplates,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
    },
  })
}

export function useCompileUncompiledTesiraDesigns() {
  const qc = useQueryClient()
  return useMutation<TesiraDesignCompileBatchResponse, Error, {
    deviceId: string
    optimize?: boolean
    recompile?: boolean
    includeTemplates?: boolean
  }>({
    mutationFn: ({ deviceId, optimize = false, recompile = false, includeTemplates = false }) =>
      tesiraApi.compileUncompiledDesigns(deviceId, {
        optimize,
        recompile,
        include_templates: includeTemplates,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.designs(vars.deviceId) })
    },
  })
}

// ── DSP model ────────────────────────────────────────────────────────────────

export function useTesiraDspBlocks(deviceId: string) {
  return useQuery<TesiraDspBlock[]>({
    queryKey: TESIRA_KEYS.dspBlocks(deviceId),
    queryFn: async () => (await tesiraApi.listDspBlocks(deviceId)).blocks,
    enabled: !!deviceId,
  })
}

export function useTesiraDspBlock(deviceId: string, instanceTag: string) {
  return useQuery<{ device_id: string } & TesiraDspBlock>({
    queryKey: TESIRA_KEYS.dspBlock(deviceId, instanceTag),
    queryFn: () => tesiraApi.getDspBlock(deviceId, instanceTag),
    enabled: !!deviceId && !!instanceTag,
  })
}

export function useTesiraDspParams(deviceId: string, instanceTag: string) {
  return useQuery<TesiraDspParamsResponse>({
    queryKey: TESIRA_KEYS.dspParams(deviceId, instanceTag),
    queryFn: () => tesiraApi.getDspParams(deviceId, instanceTag),
    enabled: !!deviceId && !!instanceTag,
  })
}

export function useProbeTesiraDsp(deviceId: string) {
  const qc = useQueryClient()
  return useMutation<TesiraDspProbeResult, Error, number>({
    mutationFn: (maxInstances: number) => tesiraApi.probeDspBlocks(deviceId, maxInstances),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.dspBlocks(deviceId) })
    },
  })
}

export function useSetTesiraDspParam() {
  const qc = useQueryClient()
  return useMutation<TesiraMutationResponse, Error, {
    deviceId: string;
    instanceTag: string;
    attribute: string;
    value: unknown;
    args?: unknown[];
  }>({
    mutationFn: ({ deviceId, instanceTag, attribute, value, args }) =>
      tesiraApi.setDspParam(deviceId, instanceTag, attribute, value, args ?? []),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.dspParams(vars.deviceId, vars.instanceTag) })
    },
  })
}

export function useTesiraDspBulkSet() {
  return useMutation<{ device_id: string; count: number; results: TesiraDspBulkResult[] }, Error, {
    deviceId: string;
    operations: TesiraDspBulkOperation[];
  }>({
    mutationFn: ({ deviceId, operations }) => tesiraApi.dspBulkSet(deviceId, operations),
  })
}

// ── Crosspoint matrix ────────────────────────────────────────────────────────

export function useTesiraCrosspointMatrix(deviceId: string, tag: string, rows: number, cols: number) {
  const visible = usePageVisible()
  return useQuery<TesiraCrosspointMatrix>({
    queryKey: TESIRA_KEYS.crosspoint(deviceId, tag, rows, cols),
    queryFn: () => tesiraApi.getCrosspointMatrix(deviceId, tag, rows, cols),
    enabled: !!deviceId && !!tag,
    refetchInterval: visible ? 2000 : false,
  })
}

export function useSetCrosspointMute() {
  const qc = useQueryClient()
  return useMutation<TesiraMutationResponse, Error, {
    deviceId: string;
    tag: string;
    row: number;
    col: number;
    muted: boolean;
    rows: number;
    cols: number;
  }>({
    mutationFn: ({ deviceId, tag, row, col, muted }) =>
      tesiraApi.setCrosspointMute(deviceId, tag, row, col, muted),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.crosspoint(vars.deviceId, vars.tag, vars.rows, vars.cols) })
    },
  })
}

// ── GPIO + scenes ────────────────────────────────────────────────────────────

export function useTesiraGpio(deviceId: string) {
  return useQuery<TesiraGpioListResponse>({
    queryKey: TESIRA_KEYS.gpio(deviceId),
    queryFn: () => tesiraApi.listGpio(deviceId),
    enabled: !!deviceId,
  })
}

export function useSetTesiraGpioPin() {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean; device_id: string; pin: number; state: boolean },
    Error,
    { deviceId: string; pin: number; state: boolean }
  >({
    mutationFn: ({ deviceId, pin, state }) => tesiraApi.setGpioPin(deviceId, pin, state),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.gpio(vars.deviceId) })
    },
  })
}

export function useTesiraScenes(deviceId: string) {
  return useQuery<TesiraSceneListResponse>({
    queryKey: TESIRA_KEYS.scenes(deviceId),
    queryFn: () => tesiraApi.listScenes(deviceId),
    enabled: !!deviceId,
  })
}

export function useCaptureTesiraScene() {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean; device_id: string; scene_id: string; name: string; block_count: number },
    Error,
    { deviceId: string; name: string }
  >({
    mutationFn: ({ deviceId, name }) => tesiraApi.captureScene(deviceId, name),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.scenes(vars.deviceId) })
    },
  })
}

export function useRecallTesiraScene() {
  return useMutation<
    { ok: boolean; device_id: string; scene_id: string; applied: number; failed: string[] },
    Error,
    { deviceId: string; sceneId: string }
  >({
    mutationFn: ({ deviceId, sceneId }) => tesiraApi.recallScene(deviceId, sceneId),
  })
}

export function useDeleteTesiraScene() {
  const qc = useQueryClient()
  return useMutation<
    { ok: boolean; device_id: string; scene_id: string },
    Error,
    { deviceId: string; sceneId: string }
  >({
    mutationFn: ({ deviceId, sceneId }) => tesiraApi.deleteScene(deviceId, sceneId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: TESIRA_KEYS.scenes(vars.deviceId) })
    },
  })
}

// ── Meter history ────────────────────────────────────────────────────────────

export function useTesiraMeterHistory(deviceId: string, instanceTag: string, limit: number = 300) {
  const visible = usePageVisible()
  return useQuery<TesiraMeterHistoryResponse>({
    queryKey: TESIRA_KEYS.meterHistory(deviceId, instanceTag, limit),
    queryFn: () => tesiraApi.getMeterHistory(deviceId, instanceTag, limit),
    enabled: !!deviceId && !!instanceTag,
    refetchInterval: visible ? 2000 : false,
  })
}

export function useTesiraMeterPeak(deviceId: string, instanceTag: string) {
  const visible = usePageVisible()
  return useQuery<TesiraMeterPeakResponse>({
    queryKey: TESIRA_KEYS.meterPeak(deviceId, instanceTag),
    queryFn: () => tesiraApi.getMeterPeak(deviceId, instanceTag),
    enabled: !!deviceId && !!instanceTag,
    refetchInterval: visible ? 2000 : false,
  })
}
