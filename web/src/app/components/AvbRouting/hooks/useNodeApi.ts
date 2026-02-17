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

// ============================================================================
// API Response Interfaces
// ============================================================================

interface NodesResponse {
  enabled: boolean;
  nodes: Array<{
    node_id: string;
    name: string;
    type: string;
    status: string;
    address: string;
    api_url: string | null;
    entity_id: string | null;
    talker_count: number;
    listener_count: number;
    discovered_at: string;
    last_seen: string;
    capabilities?: Partial<AvbNode['capabilities']>;
    ptp?: Partial<AvbNode['ptp']>;
    health?: Partial<AvbNode['health']>;
    version?: string | null;
    manufacturer?: string | null;
    model?: string | null;
  }>;
  error?: string;
}

interface NodeResponse {
  node_id: string;
  name: string;
  type: string;
  status: string;
  address: string;
  api_url: string | null;
  entity_id: string | null;
  talker_count: number;
  listener_count: number;
  discovered_at: string;
  last_seen: string;
  capabilities?: Partial<AvbNode['capabilities']>;
  ptp?: Partial<AvbNode['ptp']>;
  health?: Partial<AvbNode['health']>;
  version?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

interface PtpStatusResponse {
  enabled: boolean;
  state: string;
  domain: number;
  is_master: boolean;
  master_clock_id: string | null;
  offset_ns: number | null;
  last_sync: string | null;
  gptp_supported: boolean;
}

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

// ============================================================================
// Transform Functions
// ============================================================================

function transformNodeResponse(raw: NodeResponse, index: number): AvbNode {
  return {
    node_id: raw.node_id,
    name: raw.name || `Node ${raw.node_id.slice(0, 8)}`,
    type: (raw.type as NodeType) || 'unknown',
    status: (raw.status as NodeStatus) || 'online',
    capabilities: {
      talker: raw.capabilities?.talker ?? true,
      listener: raw.capabilities?.listener ?? true,
      avdecc_controller: raw.capabilities?.avdecc_controller ?? false,
      audio_processing: raw.capabilities?.audio_processing ?? false,
      remote_control: raw.capabilities?.remote_control ?? true,
      max_talkers: raw.capabilities?.max_talkers ?? 8,
      max_listeners: raw.capabilities?.max_listeners ?? 8,
      sample_rates: raw.capabilities?.sample_rates ?? [48000, 96000],
      formats: raw.capabilities?.formats ?? ['24-bit PCM'],
    },
    ptp: raw.ptp
      ? {
          state: (raw.ptp.state as PtpState) || 'unknown',
          domain: raw.ptp.domain ?? 0,
          is_master: raw.ptp.is_master ?? false,
          master_clock_id: raw.ptp.master_clock_id ?? null,
          offset_ns: raw.ptp.offset_ns ?? null,
          last_sync: raw.ptp.last_sync ?? null,
          gptp_supported: raw.ptp.gptp_supported ?? false,
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
    address: raw.address,
    api_url: raw.api_url,
    entity_id: raw.entity_id,
    talker_count: raw.talker_count || 0,
    listener_count: raw.listener_count || 0,
    active_routes: 0, // Will be calculated from routes
    version: raw.version ?? null,
    manufacturer: raw.manufacturer ?? null,
    model: raw.model ?? null,
    discovered_at: raw.discovered_at,
    last_seen: raw.last_seen,
    color: assignNodeColor(),
    pinned: false,
    notes: '',
  };
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
      const response = await fetch('/api/avb/discovery/nodes');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: NodesResponse = await response.json();

      if (!data.enabled) {
        return [];
      }

      return data.nodes.map((node, index) => transformNodeResponse(node as NodeResponse, index));
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

      const response = await fetch(`/api/avb/discovery/nodes/${nodeId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NodeResponse = await response.json();
      return transformNodeResponse(data, 0);
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
  return useQuery({
    queryKey: ['avb', 'ptp', 'status'],
    queryFn: async () => {
      const response = await fetch('/api/avb/ptp/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: PtpStatusResponse = await response.json();

      return {
        synchronized: data.state === 'master' || data.state === 'slave',
        master_node_id: data.master_clock_id,
        synced_nodes: 0, // TODO: Calculate from node list
        total_nodes: 0,  // TODO: Calculate from node list
        max_offset_ns: data.offset_ns,
        last_check: data.last_sync || new Date().toISOString(),
      };
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
      // Build topology from discovered nodes
      const topology: NetworkTopology = {
        nodes,
        edges: [],
        ptp_master_id: ptpStatus?.master_node_id || null,
        updated_at: new Date().toISOString(),
      };

      // TODO: Build edges from routing connections
      // This will be populated when routes are loaded

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
  // TODO: Get from backend or environment
  // For now, assume 'local' or first node
  const { data: nodes = [] } = useNodes();

  if (nodes.length === 0) return 'local';

  // Find node marked as local, or use first MAP2 node
  const localNode = nodes.find((n) => n.type === 'map2_local') || nodes[0];
  return localNode?.node_id || 'local';
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
