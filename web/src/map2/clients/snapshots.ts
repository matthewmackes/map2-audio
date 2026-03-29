import { fetchJson } from '../http'
import { API_BASE } from '../transport'
import type {
  CommunitySnapshot,
  FlowSnapshot,
  FlowSnapshotData,
  FlowSnapshotDetail,
  FlowSnapshotLoadedEvent,
  FlowSlotSummary,
  RoutingConfigSnapshot,
  SnapshotChannel,
  SnapshotDeployment,
  SnapshotDetail,
  SnapshotExport,
  SnapshotLoadedEvent,
  SnapshotMidiMapEntry,
  SnapshotPlugin,
  SnapshotRouting,
  SnapshotSummary,
} from '../types'

export interface SnapshotListResponse {
  snapshots: SnapshotSummary[]
  count: number
  active_id: number | null
}

export interface SnapshotCreateRequest {
  name: string
  description?: string
  tags?: string[]
  program_number?: number | null
  input_device?: string | null
  output_device?: string | null
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
  input_device?: string | null
  output_device?: string | null
  display_order?: number
  is_favorite?: boolean
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
  status: string
  snapshot_id: number
  name: string
  snapshot_data: SnapshotDetail
  params_applied: number
  bypass_applied: number
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
  return mode === 'parameter_morph' || mode === 'ab_switch' ? 'morph' : mode
}

export function snapshotDetailToFlowSnapshotData(detail: SnapshotDetail): FlowSnapshotData {
  const chains = Object.fromEntries(
    detail.chains.map((chain, index) => [
      String(chain.id ?? index + 1),
      {
        name: chain.name,
        plugins: chain.plugins.map((plugin): SnapshotPlugin => ({
          uri: plugin.uri,
          position: plugin.position,
          bypass: plugin.bypass,
          parameters: { ...plugin.parameters },
          loader_state: plugin.loader_state,
          name: plugin.name,
          is_placeholder: plugin.is_placeholder,
        })),
      },
    ]),
  )

  return {
    flowSlots: detail.channels.map((channel) => ({
      id: channel.channel_key,
      chainId: channel.chain_id ?? null,
      label: channel.label,
      color: channel.color,
      muted: channel.muted,
      solo: channel.solo,
      dryWetMix: channel.dry_wet_mix,
    })),
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
  snapshotData: FlowSnapshotData,
): Pick<SnapshotDetail, 'channels' | 'chains' | 'routing' | 'midi_map'> {
  const chainEntries = Object.entries(snapshotData.chains ?? {})
  const chains = chainEntries.map(([chainKey, chain], index) => {
    const numericChainId = Number.parseInt(chainKey, 10)
    return {
      id: Number.isFinite(numericChainId) ? numericChainId : index + 1,
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

  return {
    channels: (snapshotData.flowSlots ?? []).map((channel, index) => ({
      channel_key: channel.id,
      label: channel.label,
      color: channel.color,
      muted: channel.muted,
      solo: channel.solo,
      dry_wet_mix: channel.dryWetMix,
      order_index: index,
      chain_id: channel.chainId ?? null,
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
  }
}

export function snapshotSummaryToFlowSnapshot(summary: SnapshotSummary): FlowSnapshot {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    tags: [...summary.tags],
    program_number: summary.program_number,
    is_active: summary.is_active,
    is_favorite: summary.is_favorite,
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
    snapshot_data: snapshotDetailToFlowSnapshotData(detail),
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
      snapshot_data: snapshotDetailToFlowSnapshotData(event.data.snapshot_data),
      triggered_by: event.data.triggered_by,
      program_number: event.data.program_number,
    },
    timestamp: event.timestamp,
  }
}

export const snapshotsApi = {
  list: () =>
    fetchJson<SnapshotListResponse>(`${API_BASE}/snapshots`, { cache: 'no-store' }),

  get: (snapshotId: number) =>
    fetchJson<SnapshotDetail>(`${API_BASE}/snapshots/${snapshotId}`, { cache: 'no-store' }),

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

  delete: (snapshotId: number) =>
    fetchJson<SnapshotDeleteResponse>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'DELETE',
    }),

  activate: (snapshotId: number) =>
    fetchJson<SnapshotActivationResponse>(`${API_BASE}/snapshots/${snapshotId}/activate`, {
      method: 'POST',
    }),

  preview: (snapshotData: Pick<SnapshotDetail, 'channels' | 'chains' | 'routing' | 'midi_map'> | FlowSnapshotData) => {
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
      `${API_BASE}/flow-snapshots/${snapshotId}/program`,
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

  exportSnapshot: (snapshotId: number) =>
    fetchJson<SnapshotExport>(`${API_BASE}/snapshots/${snapshotId}/export`),

  importSnapshot: (payload: SnapshotExport | { snapshot: SnapshotDetail } | SnapshotDetail) =>
    fetchJson<SnapshotCreateResponse>(`${API_BASE}/snapshots/import`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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
