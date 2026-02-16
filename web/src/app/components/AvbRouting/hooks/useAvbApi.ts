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
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Endpoint,
  EndpointsResponse,
  Route,
  ConnectionsResponse,
  RoutingMatrix,
  RoutingMatrixResponse,
  StreamDirection,
} from '../types';

const API_BASE = '/api/avb';

/**
 * Fetch endpoints (talkers and/or listeners)
 */
export function useEndpoints(direction?: StreamDirection) {
  return useQuery<EndpointsResponse>({
    queryKey: ['avb', 'endpoints', direction],
    queryFn: async () => {
      const params = direction ? `?direction=${direction}` : '';
      const response = await fetch(`${API_BASE}/router/endpoints${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch endpoints: ${response.statusText}`);
      }

      return response.json();
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
    queryKey: ['avb', 'connections'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/router/connections`);

      if (!response.ok) {
        throw new Error(`Failed to fetch connections: ${response.statusText}`);
      }

      return response.json();
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
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/router/matrix`);

      if (!response.ok) {
        throw new Error(`Failed to fetch routing matrix: ${response.statusText}`);
      }

      return response.json();
    },
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
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/router/stats`);

      if (!response.ok) {
        throw new Error(`Failed to fetch router stats: ${response.statusText}`);
      }

      return response.json();
    },
    refetchInterval: 5000,
  });
}

/**
 * Connect talker to listener (PATCH operation)
 */
export function usePatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { talker_id: string; listener_id: string }) => {
      const response = await fetch(`${API_BASE}/router/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || errorData.detail || 'Connection failed');
      }

      return response.json();
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
    mutationFn: async (payload: { talker_id: string; listener_id: string }) => {
      const response = await fetch(`${API_BASE}/router/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || errorData.detail || 'Disconnection failed');
      }

      return response.json();
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
    mutationFn: async (operations: Array<{ talker_id: string; listener_id: string; action: 'connect' | 'disconnect' }>) => {
      // Execute operations sequentially (could be parallelized)
      const results = [];

      for (const op of operations) {
        const endpoint = op.action === 'connect' ? '/router/connect' : '/router/disconnect';
        const response = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            talker_id: op.talker_id,
            listener_id: op.listener_id,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(`Batch operation failed: ${errorData.error || errorData.detail}`);
        }

        results.push(await response.json());
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
      queryKey: ['avb', 'endpoints'],
      queryFn: async () => {
        const response = await fetch(`${API_BASE}/router/endpoints`);
        return response.json();
      },
    });
  };
}
