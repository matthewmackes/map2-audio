/**
 * AVB API Client Hooks
 *
 * React Query hooks for all AVB routing backend endpoints.
 * Provides type-safe API calls with automatic caching, refetching, and error handling.
 *
 * Backend API:
 * - GET  /api/avb/router/endpoints
 * - GET  /api/avb/router/connections
 * - GET  /api/avb/router/matrix
 * - POST /api/avb/router/connect
 * - POST /api/avb/router/disconnect
 * - GET  /api/avb/router/stats
 * - GET  /api/avb/devices
 * - GET  /api/avb/avdecc/entities
 * - GET  /api/avb/avdecc/stats
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Endpoint,
  EndpointsResponse,
  ConnectionsResponse,
  RoutingMatrixResponse,
  StreamDirection,
  AvbDiscoveredDevice,
  AvbDevicesResponse,
  AvbChannelCapabilitiesResponse,
  AvbStreamPayload,
  AvbStreamsResponse,
  AvbAvdeccEntity,
  AvbAvdeccEntitiesResponse,
  AvbAvdeccStats,
} from '../types';
import { avbApi, type AvbClusterFanoutResponse } from '../../../../map2/api';
import { normalizeEndpointsResponse, normalizeStreamPayload } from '../utils/endpointSchema';

type ClusterFanoutResponse<T> = AvbClusterFanoutResponse<T>;

function isClusterFanoutResponse<T>(payload: unknown): payload is ClusterFanoutResponse<T> {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      'nodes' in (payload as Record<string, unknown>)
  );
}

function clusterEntries<T>(payload: T | ClusterFanoutResponse<T>): Array<[string, T]> {
  if (!isClusterFanoutResponse<T>(payload)) {
    return [['local', payload]];
  }

  return Object.entries(payload.nodes ?? {})
    .filter(([, result]) => (result?.status_code ?? 200) < 400 && Boolean(result?.body))
    .map(([nodeId, result]) => [nodeId, result?.body as T]);
}

function mergeClusterEndpoints(
  payload: EndpointsResponse | ClusterFanoutResponse<EndpointsResponse>
): EndpointsResponse {
  const endpoints = new Map<string, EndpointsResponse['endpoints'][number]>();

  for (const [nodeId, body] of clusterEntries(payload)) {
    const normalized = normalizeEndpointsResponse(body);
    for (const endpoint of normalized.endpoints) {
      const resolvedNodeId = endpoint.node_id?.trim() || nodeId;
      const key = `${resolvedNodeId}:${endpoint.endpoint_id}:${endpoint.direction}`;
      endpoints.set(key, {
        ...endpoint,
        node_id: resolvedNodeId,
      });
    }
  }

  const merged = Array.from(endpoints.values()).sort((a, b) =>
    `${a.node_id}:${a.endpoint_id}`.localeCompare(`${b.node_id}:${b.endpoint_id}`)
  );

  return {
    endpoints: merged,
    count: merged.length,
  };
}

function mergeClusterConnections(
  payload: ConnectionsResponse | ClusterFanoutResponse<ConnectionsResponse>
): ConnectionsResponse {
  const connections = new Map<string, ConnectionsResponse['connections'][number]>();

  for (const [nodeId, body] of clusterEntries(payload)) {
    for (const connection of body.connections ?? []) {
      const connectionId =
        connection.connection_id ||
        `${connection.talker?.endpoint_id ?? ''}→${connection.listener?.endpoint_id ?? ''}`;

      const talkerNodeId =
        (typeof connection.talker?.node_id === 'string' && connection.talker.node_id.trim()) ||
        nodeId;
      const listenerNodeId =
        (typeof connection.listener?.node_id === 'string' && connection.listener.node_id.trim()) ||
        nodeId;

      const candidate = {
        ...connection,
        connection_id: connectionId,
        talker: {
          ...connection.talker,
          node_id: talkerNodeId,
        },
        listener: {
          ...connection.listener,
          node_id: listenerNodeId,
        },
      };

      const existing = connections.get(connectionId);
      if (!existing) {
        connections.set(connectionId, candidate);
        continue;
      }

      const existingNodeCount = Number(Boolean(existing.talker?.node_id)) + Number(Boolean(existing.listener?.node_id));
      const candidateNodeCount = Number(Boolean(candidate.talker?.node_id)) + Number(Boolean(candidate.listener?.node_id));
      if (candidateNodeCount > existingNodeCount) {
        connections.set(connectionId, candidate);
      }
    }
  }

  const merged = Array.from(connections.values()).sort((a, b) =>
    a.connection_id.localeCompare(b.connection_id)
  );

  return {
    connections: merged,
    count: merged.length,
  };
}

function mergeClusterStreams(
  payload: AvbStreamsResponse | ClusterFanoutResponse<AvbStreamsResponse>
): AvbStreamsResponse {
  const streams = new Map<string, AvbStreamPayload>();
  let available = false;
  let error: string | undefined;

  for (const [nodeId, body] of clusterEntries(payload)) {
    available = available || Boolean(body.available);
    if (!error && typeof body.error === 'string' && body.error.trim()) {
      error = body.error;
    }

    for (const stream of body.streams ?? []) {
      const normalized = normalizeStreamPayload(stream);
      const key = normalized.stream_id;
      const ownership = normalized.ownership
        ? {
            ...normalized.ownership,
            owner_node_id: normalized.ownership.owner_node_id || nodeId,
            node_ids:
              normalized.ownership.node_ids.length > 0
                ? Array.from(new Set(normalized.ownership.node_ids))
                : [nodeId],
          }
        : undefined;

      const candidate: AvbStreamPayload = {
        ...normalized,
        ownership,
      };

      const existing = streams.get(key);
      if (!existing) {
        streams.set(key, candidate);
        continue;
      }

      const existingNodeCount = existing.ownership?.node_ids.length ?? 0;
      const candidateNodeCount = candidate.ownership?.node_ids.length ?? 0;
      if (candidateNodeCount >= existingNodeCount) {
        streams.set(key, candidate);
      }
    }
  }

  return {
    available,
    streams: Array.from(streams.values()).sort((a, b) => a.stream_id.localeCompare(b.stream_id)),
    error,
  };
}

function mergeClusterDevices(
  payload: AvbDevicesResponse | ClusterFanoutResponse<AvbDevicesResponse>
): AvbDevicesResponse {
  const deviceNames = new Set<string>();
  const discoveredDevices = new Map<string, AvbDiscoveredDevice>();
  let available = false;
  let readiness = undefined as AvbDevicesResponse['readiness'];
  let error: string | undefined;

  for (const [nodeId, body] of clusterEntries(payload)) {
    available = available || Boolean(body.available);
    if (!readiness && body.readiness) {
      readiness = body.readiness;
    }
    if (!error && typeof body.error === 'string' && body.error.trim()) {
      error = body.error;
    }

    for (const name of body.device_names ?? []) {
      if (typeof name === 'string' && name.trim()) {
        deviceNames.add(name);
      }
    }

    for (const device of body.discovered_devices ?? []) {
      const sourceNodeId = device.source_node_id || nodeId;
      const resolvedNodeId = device.node_id || sourceNodeId;
      const key = `${sourceNodeId}:${device.endpoint_id}`;
      discoveredDevices.set(key, {
        ...device,
        node_id: resolvedNodeId,
        source_node_id: sourceNodeId,
      });
    }
  }

  const mergedDevices = Array.from(discoveredDevices.values()).sort((a, b) =>
    `${a.source_node_id ?? ''}:${a.endpoint_id}`.localeCompare(`${b.source_node_id ?? ''}:${b.endpoint_id}`)
  );

  return {
    available,
    readiness,
    count: deviceNames.size,
    device_names: Array.from(deviceNames).sort((a, b) => a.localeCompare(b)),
    discovered_count: mergedDevices.length,
    discovered_devices: mergedDevices,
    error,
  };
}

function mergeClusterAvdeccEntities(
  payload: AvbAvdeccEntitiesResponse | ClusterFanoutResponse<AvbAvdeccEntitiesResponse>
): AvbAvdeccEntitiesResponse {
  const entities = new Map<string, AvbAvdeccEntity>();
  let enabled = false;
  let error: string | undefined;

  for (const [nodeId, body] of clusterEntries(payload)) {
    enabled = enabled || Boolean(body.enabled);
    if (!error && typeof body.error === 'string' && body.error.trim()) {
      error = body.error;
    }

    for (const entity of body.entities ?? []) {
      const sourceNodeId = entity.source_node_id || nodeId;
      const key = `${sourceNodeId}:${entity.entity_id}`;
      entities.set(key, {
        ...entity,
        source_node_id: sourceNodeId,
      });
    }
  }

  return {
    enabled,
    entities: Array.from(entities.values()).sort((a, b) =>
      `${a.source_node_id ?? ''}:${a.entity_id}`.localeCompare(`${b.source_node_id ?? ''}:${b.entity_id}`)
    ),
    error,
  };
}

/**
 * Fetch endpoints (talkers and/or listeners)
 */
export function useEndpoints(direction?: StreamDirection) {
  return useQuery<EndpointsResponse>({
    queryKey: ['avb', 'endpoints', direction ?? 'all-directions', 'cluster'],
    queryFn: async () => {
      return mergeClusterEndpoints(await avbApi.getClusterEndpoints(direction));
    },
    refetchInterval: 5000, // Poll every 5 seconds for discovery updates
    staleTime: 2000,       // Consider data stale after 2s
  });
}

/**
 * Fetch active connections
 */
export function useConnections() {
  return useQuery<ConnectionsResponse>({
    queryKey: ['avb', 'connections', 'cluster'],
    queryFn: async () => {
      return mergeClusterConnections(await avbApi.getClusterConnections());
    },
    refetchInterval: 2000, // Poll every 2s for connection state changes
    staleTime: 1000,
  });
}

/**
 * Fetch routing matrix
 */
export function useRoutingMatrix() {
  return useQuery<RoutingMatrixResponse>({
    queryKey: ['avb', 'matrix'],
    queryFn: () => avbApi.getRoutingMatrix(),
    refetchInterval: 3000,
    staleTime: 1500,
  });
}

/**
 * Fetch router statistics
 */
export function useRouterStats() {
  return useQuery({
    queryKey: ['avb', 'stats'],
    queryFn: () => avbApi.getRouterStats(),
    refetchInterval: 5000,
  });
}

/**
 * Fetch AVB stream inventory and transport health snapshots.
 */
export function useAvbStreams() {
  return useQuery<AvbStreamsResponse>({
    queryKey: ['avb', 'streams', 'cluster'],
    queryFn: async () => {
      return mergeClusterStreams(await avbApi.getClusterStreams());
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

/**
 * Fetch AVB device inventory exposed by JUCE engine.
 */
export function useAvbDevices() {
  return useQuery<AvbDevicesResponse>({
    queryKey: ['avb', 'devices', 'cluster'],
    queryFn: async () => {
      return mergeClusterDevices(await avbApi.getClusterDevices());
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

/**
 * Fetch canonical local + AVB channel capability inventory.
 */
export function useAvbChannelCapabilities() {
  return useQuery<AvbChannelCapabilitiesResponse>({
    queryKey: ['avb', 'capabilities', 'channels'],
    queryFn: () => avbApi.getChannelCapabilities(),
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

/**
 * Fetch discovered AVDECC entities (third-party AVB devices).
 */
export function useAvdeccEntities() {
  return useQuery<AvbAvdeccEntitiesResponse>({
    queryKey: ['avb', 'avdecc', 'entities', 'cluster'],
    queryFn: async () => {
      return mergeClusterAvdeccEntities(await avbApi.getClusterAvdeccEntities());
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

/**
 * Fetch AVDECC protocol statistics.
 */
export function useAvdeccStats() {
  return useQuery<AvbAvdeccStats>({
    queryKey: ['avb', 'avdecc', 'stats'],
    queryFn: () => avbApi.getAvdeccStats(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

/**
 * Connect talker to listener (PATCH operation)
 */
export function usePatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { talker_id: string; listener_id: string; node_id?: string | null }) => {
      const { node_id, ...body } = payload;
      return avbApi.connect(body, node_id);
    },
    onSuccess: () => {
      // Invalidate relevant queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['avb', 'connections'] });
      queryClient.invalidateQueries({ queryKey: ['avb', 'matrix'] });
    },
  });
}

/**
 * Disconnect talker from listener (UNPATCH operation)
 */
export function useUnpatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { talker_id: string; listener_id: string; node_id?: string | null }) => {
      const { node_id, ...body } = payload;
      return avbApi.disconnect(body, node_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avb', 'connections'] });
      queryClient.invalidateQueries({ queryKey: ['avb', 'matrix'] });
    },
  });
}

/**
 * Batch patch operations (multiple connect/disconnect in one call)
 */
export function useBatchPatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      operations: Array<{ talker_id: string; listener_id: string; action: 'connect' | 'disconnect'; node_id?: string | null }>
    ) => {
      // Execute operations sequentially (could be parallelized)
      const results = [];

      for (const op of operations) {
        const request = {
          talker_id: op.talker_id,
          listener_id: op.listener_id,
        };
        const result = await (op.action === 'connect'
          ? avbApi.connect(request, op.node_id)
          : avbApi.disconnect(request, op.node_id)).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Unknown batch operation error';
          throw new Error(`Batch operation failed: ${message}`);
        });

        results.push(result);
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avb', 'connections'] });
      queryClient.invalidateQueries({ queryKey: ['avb', 'matrix'] });
    },
  });
}

/**
 * Optimistically update connections
 *
 * Updates the cache immediately before the backend responds.
 * Useful for responsive UI during safe patch mode.
 */
export function optimisticallyUpdateConnection(
  queryClient: QueryClient,
  talker_id: string,
  listener_id: string,
  state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected'
) {
  queryClient.setQueryData<ConnectionsResponse>(
    ['avb', 'connections'],
    (old) => {
      if (!old) return old;

      const route_id = `${talker_id}→${listener_id}`;

      // Add or update connection
      const updatedConnections = old.connections.map(conn =>
        conn.connection_id === route_id
          ? { ...conn, state }
          : conn
      );

      // If not found and connecting/connected, add new connection
      if (
        (state === 'connecting' || state === 'connected') &&
        !updatedConnections.find(c => c.connection_id === route_id)
      ) {
        updatedConnections.push({
          connection_id: route_id,
          talker: { endpoint_id: talker_id } as Partial<Endpoint>,
          listener: { endpoint_id: listener_id } as Partial<Endpoint>,
          state,
          established_time: state === 'connected' ? new Date().toISOString() : null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        });
      }

      // Remove if disconnected
      const finalConnections =
        state === 'disconnected'
          ? updatedConnections.filter(c => c.connection_id !== route_id)
          : updatedConnections;

      return {
        ...old,
        connections: finalConnections,
        count: finalConnections.length,
      };
    }
  );
}

/**
 * Prefetch endpoints
 *
 * Useful for warming the cache before user navigates to routing page.
 */
export function usePrefetchEndpoints() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: ['avb', 'endpoints', 'all-directions', 'cluster'],
      queryFn: async () => mergeClusterEndpoints(await avbApi.getClusterEndpoints()),
    });
  };
}
