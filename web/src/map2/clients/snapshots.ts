import { ApiError, fetchJson } from '../http'
import { API_BASE } from '../transport'
import type {
  CommunitySnapshot,
  FlowSnapshot,
  FlowSnapshotDetail,
  FlowSnapshotLoadedEvent,
  FlowSlotSummary,
  RoutingConfigSnapshot,
  SnapshotChannel,
  SnapshotControls,
  SnapshotDeployment,
  SnapshotDetail,
  SnapshotDraftData,
  SnapshotExport,
  SnapshotActivationEventsResponse,
  SnapshotActivationIntent,
  SnapshotPublishReadiness,
  SnapshotIOBindings,
  SnapshotPath,
  SnapshotLoadedEvent,
  SnapshotMidiMapEntry,
  SnapshotPlugin,
  SnapshotRuntimeClusterLiveStateResponse,
  SnapshotRuntimeLiveState,
  SnapshotRouting,
  SnapshotRevisionSummary,
  SnapshotSummary,
  SnapshotTempoStatus,
} from '../types'

export interface SnapshotListResponse {
  snapshots: SnapshotSummary[]
  count: number
  available_tags: string[]
}

export interface SnapshotCreateRequest {
  name: string
  description?: string
  tags?: string[]
  program_number?: number | null
  tempo_bpm?: number
  derived_from_snapshot_id?: number | null
  output_level_reference_dbfs?: number | null
  output_level_warning_threshold_db?: number
  input_device?: string | null
  output_device?: string | null
  is_locked?: boolean
  io_bindings?: SnapshotIOBindings
  controls?: Partial<SnapshotControls>
  paths?: SnapshotPath[]
  channels?: SnapshotChannel[]
  chains?: SnapshotDetail['chains']
  routing?: SnapshotRouting
  midi_map?: SnapshotMidiMapEntry[]
}

export interface SnapshotUpdateRequest {
  name?: string
  description?: string
  tags?: string[]
  program_number?: number | null
  create_revision?: boolean
  tempo_bpm?: number | null
  derived_from_snapshot_id?: number | null
  output_level_reference_dbfs?: number | null
  output_level_warning_threshold_db?: number | null
  input_device?: string | null
  output_device?: string | null
  io_bindings?: SnapshotIOBindings
  controls?: Partial<SnapshotControls>
  paths?: SnapshotPath[]
  display_order?: number
  is_favorite?: boolean
  is_locked?: boolean
  channels?: SnapshotChannel[]
  chains?: SnapshotDetail['chains']
  routing?: SnapshotRouting
  midi_map?: SnapshotMidiMapEntry[]
}

export interface SnapshotPreviewResponse {
  status: string
  snapshot_data: SnapshotDetail
  chains_created: number
  params_applied: number
  bypass_applied: number
}

export interface SnapshotActivationResponse {
  status: 'success' | 'degraded'
  result_code?: string
  operator_message?: string | null
  technical_detail?: string | null
  recommended_action?: string | null
  repair_action_id?: string | null
  snapshot_id: number
  name: string
  snapshot_data: SnapshotDetail
  snapshot_revision?: string
  request_id?: string
  node_id?: string
  related_node_ids?: string[]
  related_path_ids?: string[]
  activation_intent?: SnapshotActivationIntent
  runtime_live_state?: SnapshotRuntimeLiveState
  params_applied: number
  bypass_applied: number
}

export interface SnapshotPublishMutationResponse extends SnapshotActivationResponse {
  session_id?: string
}

export interface SnapshotCreateResponse {
  status: string
  snapshot_id: number
  message: string
  snapshot: SnapshotDetail
}

export interface SnapshotUpdateResponse {
  status: string
  message: string
  snapshot: SnapshotDetail
}

export interface SnapshotDraftResponse {
  status: string
  snapshot: SnapshotDetail
}

export interface SnapshotTempoResponse {
  status: string
  snapshot_id: number
  tempo: SnapshotTempoStatus
  snapshot?: SnapshotDetail
}

export interface SnapshotRevisionListResponse {
  snapshot_id: number
  count: number
  revisions: SnapshotRevisionSummary[]
}

export interface SnapshotRevisionRestoreResponse {
  status: string
  snapshot_id: number
  restored_revision_number: number
  snapshot: SnapshotDetail
}

export interface SnapshotDeleteResponse {
  status: string
  message: string
}

export interface SnapshotDuplicateResponse {
  status: string
  snapshot_id: number
  message: string
  snapshot: SnapshotDetail
}

export interface CommunityBrowseResponse {
  snapshots: CommunitySnapshot[]
  count: number
}

export interface CommunityMutationResponse {
  status: string
  snapshot: SnapshotSummary
}

export interface SnapshotDeploymentListResponse {
  deployments: Array<SnapshotDeployment & { snapshot?: SnapshotSummary | null }>
  total: number
}

export interface SnapshotDeployRequest {
  snapshot_id: number
  node_id: string
  redundancy_enabled?: boolean
}

export interface SnapshotDeployResponse {
  status: string
  snapshot_id: number
  node_id: string
  snapshot: SnapshotDetail | null
  deployment: SnapshotDeployment
  redundancy_enabled: boolean
}

export interface SnapshotBundleDownload {
  blob: Blob
  filename: string
}

export interface SnapshotFailoverResponse {
  status: string
  snapshot_id: number
  deployment: SnapshotDeployment
}

export interface ClusterNodeSummary {
  id: string
  status: string
  hostname?: string
  [key: string]: unknown
}

function toLegacyRoutingMode(mode: SnapshotRouting['mode']): RoutingConfigSnapshot['mode'] {
  return mode === 'morph' ? 'parameter_morph' : mode
}

function fromLegacyRoutingMode(mode: RoutingConfigSnapshot['mode']): SnapshotRouting['mode'] {
  return mode === 'parameter_morph' ? 'morph' : mode
}

function snapshotBundleFilenameFromHeaders(contentDisposition: string | null, fallback = 'snapshot.map2snapshot') {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i)
  return match?.[1]?.trim() || fallback
}

function normalizeSnapshotPlugin(plugin: SnapshotPlugin): SnapshotPlugin {
  return {
    id: plugin.id ?? null,
    uri: plugin.uri,
    position: plugin.position,
    bypass: plugin.bypass,
    parameters: { ...plugin.parameters },
    loader_state: plugin.loader_state,
    name: plugin.name,
    is_placeholder: plugin.is_placeholder,
  }
}

function defaultMaschineEncoderMap() {
  return {
    enc1: null,
    enc2: null,
    enc3: null,
    enc4: null,
    enc5: null,
    enc6: null,
    enc7: null,
    enc8: null,
    vol: { fixed: true, label: 'Master Gain' },
    tempo: { fixed: true, label: 'MIDI Clock BPM' },
    swing: { label: 'Swing' },
  }
}

export function snapshotDetailToDraftData(detail: SnapshotDetail): SnapshotDraftData {
  const detailPaths = Array.isArray(detail.paths) ? detail.paths : []
  const paths = detailPaths.length > 0
    ? detailPaths
    : detail.channels.map((channel, index) => {
      const chain = detail.chains.find((candidate) => candidate.id === channel.chain_id)
      return {
        id: channel.channel_key,
        name: chain?.name ?? `Path ${index + 1}`,
        label: channel.label,
        color: channel.color,
        muted: channel.muted,
        solo: channel.solo,
        dry_wet_mix: channel.dry_wet_mix,
        order_index: channel.order_index ?? index,
        snapshot_chain_id: channel.chain_id ?? null,
        runtime_chain_id: null,
        plugins: chain?.plugins ?? [],
        loop_insertions: chain?.loop_insertions ?? [],
        effects_loops: chain?.effects_loops ?? [],
      }
    })
  const livePathById = new Map(
    (detail.live_state?.paths ?? []).map((path) => [path.path_id, path] as const),
  )
  const chains = Object.fromEntries(
    paths.flatMap((path) => {
      const livePath = livePathById.get(path.id)
      const editorChainId = livePath?.runtime_chain_id ?? path.runtime_chain_id ?? path.snapshot_chain_id
      if (editorChainId === null) {
        return []
      }
      return [[
        String(editorChainId),
        {
          name: path.name,
          plugins: path.plugins.map(normalizeSnapshotPlugin),
        },
      ]]
    }),
  )

  return {
    flowSlots: paths.map((path) => {
      const livePath = livePathById.get(path.id)
      return {
        id: path.id,
        chainId: livePath?.runtime_chain_id ?? path.runtime_chain_id ?? path.snapshot_chain_id,
        label: path.label,
        color: path.color,
        muted: path.muted,
        solo: path.solo,
        dryWetMix: path.dry_wet_mix,
      }
    }),
    routing: {
      mode: toLegacyRoutingMode(detail.routing.mode),
      activeSlotId: detail.routing.active_channel_key,
      blendPositions: { ...detail.routing.blend_positions },
      morphProgress: detail.routing.morph_position,
      morphSourceSlotId: detail.routing.morph_source_channel_key,
      morphTargetSlotId: detail.routing.morph_target_channel_key,
      seriesOrder: [...detail.routing.series_order],
    },
    activeFlowIndex: detail.active_channel_index,
    chains,
  }
}

export function flowSnapshotDataToSnapshotPayload(
  snapshotData: SnapshotDraftData,
): Pick<SnapshotDetail, 'paths' | 'channels' | 'chains' | 'routing' | 'midi_map' | 'controls'> {
  const chainEntries = Object.entries(snapshotData.chains ?? {})
  const snapshotChainIdBySourceKey = new Map<string, number>(
    chainEntries.map(([chainKey], index) => [chainKey, index + 1] as const),
  )
  const chains = chainEntries.map(([chainKey, chain]) => {
    const snapshotChainId = snapshotChainIdBySourceKey.get(chainKey)
    return {
      id: snapshotChainId ?? null,
      name: chain.name,
      plugins: (chain.plugins ?? []).map((plugin) => ({
        uri: plugin.uri,
        name: undefined,
        position: plugin.position,
        bypass: plugin.bypass,
        parameters: { ...plugin.parameters },
        loader_state: plugin.loader_state,
        is_placeholder: false,
      })),
      loop_insertions: [],
      effects_loops: [],
    }
  })
  const paths = (snapshotData.flowSlots ?? []).map((channel, index) => {
    const sourceChainKey = channel.chainId !== null ? String(channel.chainId) : null
    const chain = sourceChainKey ? snapshotData.chains?.[sourceChainKey] : undefined
    return {
      id: channel.id,
      name: chain?.name ?? `Path ${channel.label}`,
      label: channel.label,
      color: channel.color,
      muted: channel.muted,
      solo: channel.solo,
      dry_wet_mix: channel.dryWetMix,
      order_index: index,
      snapshot_chain_id: sourceChainKey ? (snapshotChainIdBySourceKey.get(sourceChainKey) ?? null) : null,
      runtime_chain_id: null,
      plugins: (chain?.plugins ?? []).map((plugin) => ({
        uri: plugin.uri,
        name: undefined,
        position: plugin.position,
        bypass: plugin.bypass,
        parameters: { ...plugin.parameters },
        loader_state: plugin.loader_state,
        is_placeholder: false,
      })),
      loop_insertions: [],
      effects_loops: [],
    }
  })

  return {
    paths,
    channels: (snapshotData.flowSlots ?? []).map((channel, index) => ({
      channel_key: channel.id,
      label: channel.label,
      color: channel.color,
      muted: channel.muted,
      solo: channel.solo,
      dry_wet_mix: channel.dryWetMix,
      order_index: index,
      chain_id: channel.chainId !== null
        ? (snapshotChainIdBySourceKey.get(String(channel.chainId)) ?? null)
        : null,
    })),
    chains,
    routing: {
      mode: fromLegacyRoutingMode(snapshotData.routing.mode),
      active_channel_key: snapshotData.routing.activeSlotId,
      blend_positions: { ...snapshotData.routing.blendPositions },
      morph_position: snapshotData.routing.morphProgress,
      morph_source_channel_key: snapshotData.routing.morphSourceSlotId,
      morph_target_channel_key: snapshotData.routing.morphTargetSlotId,
      series_order: [...snapshotData.routing.seriesOrder],
    },
    midi_map: [],
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
      maschine_encoder_map: defaultMaschineEncoderMap(),
    },
  }
}

export function snapshotSummaryToFlowSnapshot(summary: SnapshotSummary): FlowSnapshot {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    tags: [...summary.tags],
    program_number: summary.program_number,
    is_favorite: summary.is_favorite,
    is_locked: summary.is_locked,
    display_order: summary.display_order,
    flow_slots: summary.channels.map(
      (channel): FlowSlotSummary => ({
        id: channel.channel_key,
        label: channel.label,
        color: channel.color,
        chainId: channel.chain_id ?? null,
      }),
    ),
    created_at: summary.created_at ?? '',
    updated_at: summary.updated_at ?? '',
  }
}

export function snapshotDetailToFlowSnapshotDetail(detail: SnapshotDetail): FlowSnapshotDetail {
  return {
    ...snapshotSummaryToFlowSnapshot(detail),
    snapshot_data: snapshotDetailToDraftData(detail),
  }
}

export function snapshotLoadedEventToFlowSnapshotEvent(
  event: SnapshotLoadedEvent,
): FlowSnapshotLoadedEvent {
  return {
    type: 'flow_snapshot_loaded',
    topic: 'flow_snapshots',
    data: {
      snapshot_id: event.data.snapshot_id,
      snapshot_name: event.data.snapshot_name,
      snapshot_data: snapshotDetailToDraftData(event.data.snapshot_data),
      triggered_by: event.data.triggered_by,
      program_number: event.data.program_number ?? undefined,
    },
    timestamp: event.timestamp,
  }
}

export const snapshotsApi = {
  list: (options?: { tags?: string[] }) => {
    const params = new URLSearchParams()
    if (options?.tags?.length) {
      params.set('tags', options.tags.join(','))
    }
    const query = params.toString()
    return fetchJson<SnapshotListResponse>(`${API_BASE}/snapshots${query ? `?${query}` : ''}`, { cache: 'no-store' })
  },

  get: (snapshotId: number) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}`, { cache: 'no-store' }),

  getLive: () =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/live`, { cache: 'no-store' }),

  getRuntimeLiveState: (nodeId?: string | null) => {
    const query = nodeId ? `?node_id=${encodeURIComponent(nodeId)}` : ''
    return fetchJson<SnapshotRuntimeLiveState>(`${API_BASE}/runtime/live-state${query}`, { cache: 'no-store' })
  },

  getClusterRuntimeLiveState: () =>
    fetchJson<SnapshotRuntimeClusterLiveStateResponse>(`${API_BASE}/cluster/runtime/live-state`, { cache: 'no-store' }),

  getActivationEvents: (limit = 100, nodeId?: string | null) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (nodeId) {
      params.set('node_id', nodeId)
    }
    return fetchJson<SnapshotActivationEventsResponse>(`${API_BASE}/runtime/activation-events?${params.toString()}`, { cache: 'no-store' })
  },

  openDraft: (snapshotId: number) =>
    fetchJson<SnapshotDraftResponse>(`${API_BASE}/snapshots/${snapshotId}/draft`, {
      method: 'POST',
    }),

  getTempo: (snapshotId: number) =>
    fetchJson<SnapshotTempoResponse>(`${API_BASE}/snapshots/${snapshotId}/tempo`, {
      cache: 'no-store',
    }),

  tapTempo: (snapshotId: number, timestampMs?: number) =>
    fetchJson<SnapshotTempoResponse>(`${API_BASE}/snapshots/${snapshotId}/tempo/tap`, {
      method: 'POST',
      body: JSON.stringify(timestampMs != null ? { timestamp_ms: timestampMs } : {}),
    }),

  resetTempo: (snapshotId: number) =>
    fetchJson<SnapshotTempoResponse>(`${API_BASE}/snapshots/${snapshotId}/tempo/reset`, {
      method: 'POST',
    }),

  listRevisions: (snapshotId: number) =>
    fetchJson<SnapshotRevisionListResponse>(`${API_BASE}/snapshots/${snapshotId}/revisions`, {
      cache: 'no-store',
    }),

  restoreRevision: (snapshotId: number, revisionNumber: number) =>
    fetchJson<SnapshotRevisionRestoreResponse>(`${API_BASE}/snapshots/${snapshotId}/revisions/${revisionNumber}/restore`, {
      method: 'POST',
    }),

  create: (request: SnapshotCreateRequest) =>
    fetchJson<SnapshotCreateResponse>(`${API_BASE}/snapshots`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (snapshotId: number, request: SnapshotUpdateRequest) =>
    fetchJson<SnapshotUpdateResponse>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    }),

  saveAsNew: (snapshotId: number, request: { name?: string; description?: string } = {}) =>
    fetchJson<SnapshotCreateResponse>(`${API_BASE}/snapshots/${snapshotId}/save-as-new`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  delete: (snapshotId: number) =>
    fetchJson<SnapshotDeleteResponse>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'DELETE',
    }),

  activate: (snapshotId: number) =>
    fetchJson<SnapshotActivationResponse>(`${API_BASE}/snapshots/${snapshotId}/activate`, {
      method: 'POST',
    }),

  getPublishReadiness: (snapshotId: number) =>
    fetchJson<SnapshotPublishReadiness>(`${API_BASE}/snapshots/${snapshotId}/publish-readiness`, {
      cache: 'no-store',
    }),

  retryPublish: (snapshotId: number, sessionId?: string) =>
    fetchJson<SnapshotPublishMutationResponse>(`${API_BASE}/snapshots/${snapshotId}/publish-retry`, {
      method: 'POST',
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    }),

  runPublishRepairAction: (snapshotId: number, repairActionId: string) =>
    fetchJson<SnapshotPublishMutationResponse>(`${API_BASE}/snapshots/${snapshotId}/repair/${encodeURIComponent(repairActionId)}`, {
      method: 'POST',
    }),

  preview: (snapshotData: Pick<SnapshotDetail, 'channels' | 'chains' | 'routing' | 'midi_map'> | SnapshotDraftData) => {
    const payload = 'flowSlots' in snapshotData
      ? flowSnapshotDataToSnapshotPayload(snapshotData)
      : snapshotData
    return fetchJson<SnapshotPreviewResponse>(`${API_BASE}/snapshots/preview`, {
      method: 'POST',
      body: JSON.stringify({ snapshot_data: payload }),
    })
  },

  duplicate: (snapshotId: number) =>
    fetchJson<SnapshotDuplicateResponse>(`${API_BASE}/snapshots/${snapshotId}/duplicate`, {
      method: 'POST',
    }),

  getByProgram: (programNumber: number) =>
    fetchJson<SnapshotSummary>(`${API_BASE}/snapshots/by-program/${programNumber}`),

  activateByProgram: (programNumber: number) =>
    fetchJson<SnapshotActivationResponse>(`${API_BASE}/snapshots/program-change/${programNumber}/activate`, {
      method: 'POST',
    }),

  reorder: async (snapshotIds: number[]) => {
    for (const [displayOrder, snapshotId] of snapshotIds.entries()) {
      await snapshotsApi.update(snapshotId, { display_order: displayOrder })
    }
    return { status: 'success', message: 'Reordered snapshots' }
  },

  setProgram: (snapshotId: number, programNumber: number | null) =>
    fetchJson<{ status: string; snapshot_id: number; program_number: number | null }>(
      `${API_BASE}/snapshots/${snapshotId}/program`,
      {
        method: 'POST',
        body: JSON.stringify({ program_number: programNumber }),
      },
    ),

  addChannel: (snapshotId: number, channel: Partial<SnapshotChannel>) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/channels`, {
      method: 'POST',
      body: JSON.stringify(channel),
    }),

  updateChannel: (snapshotId: number, channelId: number, channel: Partial<SnapshotChannel>) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify(channel),
    }),

  deleteChannel: (snapshotId: number, channelId: number) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/channels/${channelId}`, {
      method: 'DELETE',
    }),

  addChain: (snapshotId: number, name: string) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renameChain: (snapshotId: number, chainId: number, name: string) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains/${chainId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  addPlugin: (
    snapshotId: number,
    chainId: number,
    request: { plugin_uri: string; plugin_name?: string; loader_state?: Record<string, unknown> },
  ) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains/${chainId}/plugins`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  removePlugin: (snapshotId: number, chainId: number, pluginId: number) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains/${chainId}/plugins/${pluginId}`, {
      method: 'DELETE',
    }),

  reorderPlugins: (snapshotId: number, chainId: number, pluginIds: number[]) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains/${chainId}/plugins/reorder`, {
      method: 'POST',
      body: JSON.stringify({ plugin_ids: pluginIds }),
    }),

  setPluginBypass: (snapshotId: number, chainId: number, pluginId: number, bypass: boolean) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains/${chainId}/plugins/${pluginId}/bypass`, {
      method: 'POST',
      body: JSON.stringify({ bypass }),
    }),

  setPluginParameters: (
    snapshotId: number,
    chainId: number,
    pluginId: number,
    parameters: Record<string, unknown>,
  ) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/chains/${chainId}/plugins/${pluginId}/parameters`, {
      method: 'PATCH',
      body: JSON.stringify({ parameters }),
    }),

  updateRouting: (snapshotId: number, routing: Partial<SnapshotRouting>) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/routing`, {
      method: 'PATCH',
      body: JSON.stringify(routing),
    }),

  setMorphPosition: (snapshotId: number, morphPosition: number) =>
    fetchJson<SnapshotDetail>(
      `${API_BASE}/snapshots/${snapshotId}/routing/morph?morph_position=${encodeURIComponent(String(morphPosition))}`,
      { method: 'POST' },
    ),

  getMidiMap: (snapshotId: number) =>
    fetchJson<{ snapshot_id: number; entries: SnapshotMidiMapEntry[] }>(`${API_BASE}/snapshots/${snapshotId}/midi-map`),

  replaceMidiMap: (snapshotId: number, entries: SnapshotMidiMapEntry[]) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}/midi-map`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),

  exportSnapshot: async (snapshotId: number): Promise<SnapshotBundleDownload> => {
    const response = await fetch(`${API_BASE}/snapshots/${snapshotId}/export`)
    if (!response.ok) {
      let body: unknown
      try {
        body = await response.text()
      } catch {
        body = response.statusText
      }
      throw new ApiError(response.status, response.statusText, body)
    }
    const blob = await response.blob()
    return {
      blob,
      filename: snapshotBundleFilenameFromHeaders(
        response.headers.get('content-disposition'),
        `snapshot-${snapshotId}.map2snapshot`,
      ),
    }
  },

  importSnapshot: (payload: SnapshotExport | { snapshot: SnapshotDetail } | SnapshotDetail) =>
    fetchJson<SnapshotCreateResponse>(`${API_BASE}/snapshots/import`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importSnapshotBundle: (file: Blob, filename = 'snapshot.map2snapshot') => {
    const formData = new FormData()
    formData.append('file', file, filename)
    return fetchJson<SnapshotCreateResponse>(`${API_BASE}/snapshots/import`, {
      method: 'POST',
      body: formData,
    })
  },

  share: (snapshotId: number, authorName: string) =>
    fetchJson<CommunityMutationResponse>(`${API_BASE}/snapshots/${snapshotId}/share`, {
      method: 'POST',
      body: JSON.stringify({ author_name: authorName }),
    }),

  browseCommunity: (options?: { query?: string; tags?: string[]; author?: string }) => {
    const params = new URLSearchParams()
    if (options?.query) {
      params.set('query', options.query)
    }
    if (options?.tags?.length) {
      params.set('tags', options.tags.join(','))
    }
    if (options?.author) {
      params.set('author', options.author)
    }
    const query = params.toString()
    return fetchJson<CommunityBrowseResponse>(`${API_BASE}/snapshots/community${query ? `?${query}` : ''}`)
  },

  rateCommunity: (communityUuid: string, rating: number) =>
    fetchJson<CommunityMutationResponse>(`${API_BASE}/snapshots/community/${communityUuid}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),

  downloadCommunity: (communityUuid: string) =>
    fetchJson<SnapshotExport>(`${API_BASE}/snapshots/community/${communityUuid}/download`, {
      method: 'POST',
    }),

  listDeployments: () =>
    fetchJson<SnapshotDeploymentListResponse>(`${API_BASE}/cluster/snapshots/deployments`),

  deploy: (request: SnapshotDeployRequest) =>
    fetchJson<SnapshotDeployResponse>(`${API_BASE}/cluster/snapshots/deploy`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  failover: (snapshotId: number) =>
    fetchJson<SnapshotFailoverResponse>(`${API_BASE}/cluster/snapshots/failover`, {
      method: 'POST',
      body: JSON.stringify({ snapshot_id: snapshotId }),
    }),

  listNodes: () =>
    fetchJson<{ nodes: ClusterNodeSummary[]; count: number }>(`${API_BASE}/cluster/nodes`),

  setNodeMaintenance: (nodeId: string, enabled: boolean) =>
    fetchJson<{ status: string; node_id: string }>(`${API_BASE}/cluster/nodes/${encodeURIComponent(nodeId)}/maintenance`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
}
