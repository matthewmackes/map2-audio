/**
 * Node API Hooks
 *
 * React Query hooks for multi-node network discovery and management.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AvbNode,
  NetworkTopology,
  NetworkSyncStatus,
  NodeType,
  NodeStatus,
  PtpState,
} from '../types';
import {
  avbApi,
  type AvbDiscoveryNodePayload,
  type AvbPtpStatusResponse,
  type AvbRouterConnectionPayload,
} from '../../../../map2/api';

// ============================================================================
// Color Assignment
// ============================================================================

const NODE_COLORS = [
  '#1976d2', // Blue
  '#d32f2f', // Red
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c2185b', // Pink
  '#0097a7', // Cyan
  '#fbc02d', // Yellow
  '#5d4037', // Brown
  '#455a64', // Blue Grey
];

let colorIndex = 0;

function assignNodeColor(): string {
  const color = NODE_COLORS[colorIndex % NODE_COLORS.length];
  colorIndex++;
  return color;
}

function normalizePtpState(value: unknown, fallback: PtpState = 'unknown'): PtpState {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'master' ||
    normalized === 'slave' ||
    normalized === 'listening' ||
    normalized === 'passive' ||
    normalized === 'disabled' ||
    normalized === 'unknown'
  ) {
    return normalized;
  }

  // Backends may report this alias; map into the canonical enum.
  if (normalized === 'unsynced') {
    return 'listening';
  }

  return fallback;
}

// ============================================================================
// Transform Functions
// ============================================================================

function transformNodeResponse(raw: AvbDiscoveryNodePayload, index: number): AvbNode {
  const fallbackAddress = raw.addresses?.[0] || '';
  const address = raw.address || fallbackAddress;
  const apiUrl = raw.api_url ?? (address ? `http://${address}:${raw.port ?? 8080}` : null);
  const talkerCount = raw.talker_count ?? raw.avb_capabilities?.talker_streams ?? 0;
  const listenerCount = raw.listener_count ?? raw.avb_capabilities?.listener_streams ?? 0;
  const ptpSynced = raw.avb_capabilities?.ptp_synced === true;
  const ptpOffset = raw.avb_capabilities?.ptp_offset_ns ?? null;

  return {
    node_id: raw.node_id,
    name: raw.name || raw.hostname || `Node ${raw.node_id.slice(0, 8)}`,
    type: (raw.type as NodeType) || 'map2_remote',
    status: (raw.status as NodeStatus) || 'online',
    capabilities: {
      talker: raw.capabilities?.talker ?? talkerCount > 0,
      listener: raw.capabilities?.listener ?? listenerCount > 0,
      avdecc_controller: raw.capabilities?.avdecc_controller ?? false,
      audio_processing: raw.capabilities?.audio_processing ?? false,
      remote_control: raw.capabilities?.remote_control ?? true,
      max_talkers: raw.capabilities?.max_talkers ?? 8,
      max_listeners: raw.capabilities?.max_listeners ?? 8,
      sample_rates: raw.capabilities?.sample_rates ?? [raw.avb_capabilities?.sample_rate ?? 48000],
      formats: raw.capabilities?.formats ?? ['24-bit PCM'],
    },
    ptp: raw.ptp
      ? {
          state: normalizePtpState(raw.ptp.state, 'unknown'),
          domain: raw.ptp.domain ?? 0,
          is_master: raw.ptp.is_master ?? false,
          master_clock_id: raw.ptp.master_clock_id ?? null,
          offset_ns: raw.ptp.offset_ns ?? null,
          last_sync: raw.ptp.last_sync ?? null,
          gptp_supported: raw.ptp.gptp_supported ?? false,
        }
      : raw.avb_capabilities
        ? {
            state: ptpSynced ? 'slave' : 'listening',
            domain: 0,
            is_master: false,
            master_clock_id: null,
            offset_ns: ptpOffset,
            last_sync: raw.last_seen,
            gptp_supported: true,
          }
      : null,
    health: raw.health
      ? {
          cpu_usage: raw.health.cpu_usage ?? 0,
          memory_usage: raw.health.memory_usage ?? 0,
          latency_ms: raw.health.latency_ms ?? 0,
          packet_loss: raw.health.packet_loss ?? 0,
          last_check: raw.health.last_check ?? new Date().toISOString(),
          status: raw.health.status ?? 'healthy',
        }
      : null,
    address,
    api_url: apiUrl,
    entity_id: raw.entity_id ?? null,
    talker_count: talkerCount,
    listener_count: listenerCount,
    active_routes: 0, // Will be calculated from routes
    version: raw.version ?? null,
    manufacturer: raw.manufacturer ?? null,
    model: raw.model ?? null,
    discovered_at: raw.discovered_at || raw.last_seen,
    last_seen: raw.last_seen,
    color: assignNodeColor(),
    pinned: false,
    notes: '',
  };
}

export function normalizeDiscoveredNodesPayload(value: unknown): AvbDiscoveryNodePayload[] {
  return Array.isArray(value) ? value : [];
}

function normalizeEntityId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.toLowerCase().replace(/^0x/, '').trim();
  if (!value) return null;
  return value;
}

function normalizeHost(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch (_error) {
    const withoutProto = trimmed.replace(/^[a-z]+:\/\//i, '');
    return withoutProto.split('/')[0]?.split(':')[0]?.toLowerCase() || null;
  }
}

function isSyncedState(state: string | null | undefined): boolean {
  return state === 'master' || state === 'slave';
}

export function calculateSyncStatus(nodes: AvbNode[], ptpStatus: AvbPtpStatusResponse): NetworkSyncStatus {
  const totalNodes = nodes.length;
  const syncedFromNodes = nodes.filter((node) => isSyncedState(node.ptp?.state ?? null)).length;
  const fallbackSynced = isSyncedState(ptpStatus.state) ? 1 : 0;
  const syncedNodes = totalNodes > 0 ? syncedFromNodes : fallbackSynced;
  const nodeOffsets = nodes
    .map((node) => node.ptp?.offset_ns)
    .filter((offset): offset is number => typeof offset === 'number');
  const maxOffsetFromNodes = nodeOffsets.length > 0 ? Math.max(...nodeOffsets.map((value) => Math.abs(value))) : null;

  return {
    synchronized: isSyncedState(ptpStatus.state),
    master_node_id: ptpStatus.master_clock_id,
    synced_nodes: syncedNodes,
    total_nodes: totalNodes > 0 ? totalNodes : fallbackSynced,
    max_offset_ns: maxOffsetFromNodes ?? ptpStatus.offset_ns,
    last_check: ptpStatus.last_sync || new Date().toISOString(),
  };
}

function endpointEntityId(endpointId: string | undefined): string | null {
  if (!endpointId) return null;
  const [rawEntity] = endpointId.split(':');
  return normalizeEntityId(rawEntity);
}

function resolveNodeId(
  endpoint: AvbRouterConnectionPayload['talker'] | AvbRouterConnectionPayload['listener'] | undefined,
  nodes: Map<string, AvbNode>,
  entityToNode: Map<string, string>,
  hostToNode: Map<string, string>,
  nameToNode: Map<string, string>
): string | null {
  if (!endpoint) return null;

  const explicitNodeId = endpoint.node_id?.trim();
  if (explicitNodeId && nodes.has(explicitNodeId)) {
    return explicitNodeId;
  }

  const entityId = endpointEntityId(endpoint.endpoint_id);
  if (entityId && entityToNode.has(entityId)) {
    return entityToNode.get(entityId) || null;
  }

  const host = normalizeHost(endpoint.node_address || null);
  if (host && hostToNode.has(host)) {
    return hostToNode.get(host) || null;
  }

  const normalizedName = endpoint.device_name?.trim().toLowerCase() || '';
  if (normalizedName && nameToNode.has(normalizedName)) {
    return nameToNode.get(normalizedName) || null;
  }

  return null;
}

export function buildTopologyEdges(
  nodes: AvbNode[],
  connections: AvbRouterConnectionPayload[],
  ptpMasterId: string | null
): NetworkTopology['edges'] {
  const nodeMap = new Map(nodes.map((node) => [node.node_id, node]));
  const entityToNode = new Map<string, string>();
  const hostToNode = new Map<string, string>();
  const nameToNode = new Map<string, string>();

  nodes.forEach((node) => {
    const entityId = normalizeEntityId(node.entity_id);
    if (entityId) {
      entityToNode.set(entityId, node.node_id);
    }

    const nodeHost = normalizeHost(node.api_url || node.address);
    if (nodeHost) {
      hostToNode.set(nodeHost, node.node_id);
    }

    nameToNode.set(node.name.trim().toLowerCase(), node.node_id);
  });

  const audioEdgeMap = new Map<string, { from: string; to: string; routeCount: number; bandwidthMbps: number }>();

  connections.forEach((connection) => {
    if (!connection || connection.state === 'disconnected') {
      return;
    }

    const fromNodeId = resolveNodeId(connection.talker, nodeMap, entityToNode, hostToNode, nameToNode);
    const toNodeId = resolveNodeId(connection.listener, nodeMap, entityToNode, hostToNode, nameToNode);

    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      return;
    }

    const key = `${fromNodeId}→${toNodeId}`;
    const existing = audioEdgeMap.get(key);
    const bandwidth = typeof connection.bandwidth_mbps === 'number' ? connection.bandwidth_mbps : 0;

    if (existing) {
      existing.routeCount += 1;
      existing.bandwidthMbps += bandwidth;
      return;
    }

    audioEdgeMap.set(key, {
      from: fromNodeId,
      to: toNodeId,
      routeCount: 1,
      bandwidthMbps: bandwidth,
    });
  });

  const audioEdges: NetworkTopology['edges'] = Array.from(audioEdgeMap.values()).map((edge) => ({
    from_node_id: edge.from,
    to_node_id: edge.to,
    type: 'audio_route',
    route_count: edge.routeCount,
    bandwidth_mbps: edge.bandwidthMbps > 0 ? Number(edge.bandwidthMbps.toFixed(3)) : undefined,
  }));

  if (!ptpMasterId || !nodeMap.has(ptpMasterId)) {
    return audioEdges;
  }

  const ptpEdges: NetworkTopology['edges'] = nodes
    .filter((node) => node.node_id !== ptpMasterId)
    .map((node) => ({
      from_node_id: ptpMasterId,
      to_node_id: node.node_id,
      type: 'ptp_sync' as const,
    }));

  return [...audioEdges, ...ptpEdges];
}

function configuredLocalNodeId(): string | null {
  if (typeof window !== 'undefined') {
    const fromGlobal = (window as unknown as { __MAP2_NODE_ID__?: unknown }).__MAP2_NODE_ID__;
    if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
      return fromGlobal.trim();
    }

    const fromStorage = window.localStorage.getItem('map2.node_id');
    if (typeof fromStorage === 'string' && fromStorage.trim()) {
      return fromStorage.trim();
    }
  }

  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const configured = processEnv?.MAP2_NODE_ID || processEnv?.VITE_MAP2_NODE_ID || processEnv?.VITE_NODE_ID;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : null;
}

export function inferLocalNodeId(nodes: AvbNode[]): string {
  if (nodes.length === 0) {
    return 'local';
  }

  const configured = configuredLocalNodeId();
  if (configured) {
    const exact = nodes.find((node) => node.node_id === configured);
    if (exact) {
      return exact.node_id;
    }
  }

  if (typeof window !== 'undefined') {
    const browserHost = normalizeHost(window.location.hostname);
    if (browserHost) {
      const byHost = nodes.find((node) => {
        const nodeHost = normalizeHost(node.api_url || node.address);
        return nodeHost === browserHost;
      });
      if (byHost) {
        return byHost.node_id;
      }
    }
  }

  const taggedLocal = nodes.find((node) => node.type === 'map2_local');
  if (taggedLocal) {
    return taggedLocal.node_id;
  }

  const firstMap2 = nodes.find((node) => node.type === 'map2_local' || node.type === 'map2_remote');
  return firstMap2?.node_id || nodes[0].node_id;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Get all discovered nodes
 */
export function useNodes(): UseQueryResult<AvbNode[]> {
  return useQuery({
    queryKey: ['avb', 'nodes'],
    queryFn: async () => {
      const data = await avbApi.getDiscoveredNodes();

      if (!data?.enabled) {
        return [];
      }

      return normalizeDiscoveredNodesPayload(data.nodes).map((node, index) => transformNodeResponse(node, index));
    },
    refetchInterval: 5000, // Poll every 5s for node discovery
    staleTime: 3000,
  });
}

/**
 * Get specific node by ID
 */
export function useNode(nodeId: string | null): UseQueryResult<AvbNode | null> {
  return useQuery({
    queryKey: ['avb', 'nodes', nodeId],
    queryFn: async () => {
      if (!nodeId) return null;

      try {
        const data = await avbApi.getDiscoveredNode(nodeId);
        return transformNodeResponse(data, 0);
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('404') || message.includes('not found')) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!nodeId,
    refetchInterval: 3000,
    staleTime: 2000,
  });
}

/**
 * Get PTP/gPTP sync status
 */
export function usePtpStatus(): UseQueryResult<NetworkSyncStatus> {
  const { data: nodes = [] } = useNodes();

  return useQuery({
    queryKey: ['avb', 'ptp', 'status', nodes.length],
    queryFn: async () => {
      const data = await avbApi.getPtpStatus();
      return calculateSyncStatus(nodes, data);
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

/**
 * Build network topology from nodes and routes
 */
export function useNetworkTopology(): UseQueryResult<NetworkTopology> {
  const { data: nodes = [] } = useNodes();
  const { data: ptpStatus } = usePtpStatus();

  return useQuery({
    queryKey: ['avb', 'topology', nodes.length, ptpStatus?.master_node_id],
    queryFn: async () => {
      let connections: AvbRouterConnectionPayload[] = [];

      try {
        const data = await avbApi.getConnections();
        connections = Array.isArray(data.connections) ? data.connections : [];
      } catch (_error) {
        // Topology can still render nodes/PTP edges when connection snapshot fetch fails.
      }

      // Build topology from discovered nodes
      const topology: NetworkTopology = {
        nodes,
        edges: buildTopologyEdges(nodes, connections, ptpStatus?.master_node_id || null),
        ptp_master_id: ptpStatus?.master_node_id || null,
        updated_at: new Date().toISOString(),
      };

      return topology;
    },
    enabled: nodes.length > 0,
    staleTime: 5000,
  });
}

/**
 * Get local node ID
 */
export function useLocalNodeId(): string {
  const { data: nodes = [] } = useNodes();
  return inferLocalNodeId(nodes);
}

/**
 * Filter nodes by status
 */
export function useOnlineNodes(): AvbNode[] {
  const { data: nodes = [] } = useNodes();
  return nodes.filter((n) => n.status === 'online');
}

export function useOfflineNodes(): AvbNode[] {
  const { data: nodes = [] } = useNodes();
  return nodes.filter((n) => n.status === 'offline');
}

/**
 * Get node by type
 */
export function useNodesByType(type: NodeType): AvbNode[] {
  const { data: nodes = [] } = useNodes();
  return nodes.filter((n) => n.type === type);
}

// ============================================================================
// Mutation Hooks (Future)
// ============================================================================

/**
 * Update node metadata (UI-only, stored in localStorage)
 */
export function useUpdateNodeMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      node_id: string;
      color?: string;
      pinned?: boolean;
      notes?: string;
    }) => {
      // Store in localStorage
      const key = `avb_node_metadata_${payload.node_id}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      const updated = { ...existing, ...payload };
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avb', 'nodes'] });
    },
  });
}

export default {
  useNodes,
  useNode,
  usePtpStatus,
  useNetworkTopology,
  useLocalNodeId,
  useOnlineNodes,
  useOfflineNodes,
  useNodesByType,
  useUpdateNodeMetadata,
};
