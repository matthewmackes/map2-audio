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
  AvbDevicesResponse,
  AvbStreamsResponse,
  AvbAvdeccEntitiesResponse,
  AvbAvdeccStats,
} from '../types';

const API_BASE = '/api/avb';

function extractRemediationHint(detailObj: Record<string, unknown>): string | null {
  const remediation = detailObj.remediation;

  if (typeof remediation === 'string' && remediation.trim()) {
    return remediation.trim();
  }

  if (Array.isArray(remediation)) {
    const firstHint = remediation.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    );
    if (firstHint) {
      return firstHint.trim();
    }
  }

  return null;
}

function appendRemediation(message: string, remediationHint: string | null): string {
  if (!remediationHint) {
    return message;
  }

  const normalizedMessage = message.toLowerCase();
  const normalizedHint = remediationHint.toLowerCase();
  if (normalizedMessage.includes(normalizedHint)) {
    return message;
  }

  const separator = message.endsWith('.') ? '' : '.';
  return `${message}${separator} Remediation: ${remediationHint}`;
}

function extractErrorMessage(errorData: unknown, fallback: string): string {
  if (typeof errorData === 'string' && errorData.trim()) {
    return errorData;
  }

  if (errorData && typeof errorData === 'object') {
    const payload = errorData as Record<string, unknown>;

    const directError = payload.error;
    if (typeof directError === 'string' && directError.trim()) {
      return directError;
    }

    const detail = payload.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    if (detail && typeof detail === 'object') {
      const detailObj = detail as Record<string, unknown>;
      const code = typeof detailObj.code === 'string' ? detailObj.code : null;
      const message = typeof detailObj.message === 'string' ? detailObj.message : null;
      const reason = typeof detailObj.reason === 'string' ? detailObj.reason : null;
      const remediationHint = extractRemediationHint(detailObj);

      if (message && code) {
        return appendRemediation(`${message} (${code})`, remediationHint);
      }
      if (message) {
        return appendRemediation(message, remediationHint);
      }
      if (reason && code) {
        return appendRemediation(`${reason} (${code})`, remediationHint);
      }
      if (reason) {
        return appendRemediation(reason, remediationHint);
      }
      if (code) {
        return appendRemediation(code, remediationHint);
      }
    }
  }

  return fallback;
}

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
 * Fetch AVB stream inventory and transport health snapshots.
 */
export function useAvbStreams() {
  return useQuery<AvbStreamsResponse>({
    queryKey: ['avb', 'streams'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/streams`);

      if (!response.ok) {
        throw new Error(`Failed to fetch AVB streams: ${response.statusText}`);
      }

      return response.json();
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
    queryKey: ['avb', 'devices'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/devices`);

      if (!response.ok) {
        throw new Error(`Failed to fetch AVB devices: ${response.statusText}`);
      }

      return response.json();
    },
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

/**
 * Fetch discovered AVDECC entities (third-party AVB devices).
 */
export function useAvdeccEntities() {
  return useQuery<AvbAvdeccEntitiesResponse>({
    queryKey: ['avb', 'avdecc', 'entities'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/avdecc/entities`);

      if (!response.ok) {
        throw new Error(`Failed to fetch AVDECC entities: ${response.statusText}`);
      }

      return response.json();
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
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/avdecc/stats`);

      if (!response.ok) {
        throw new Error(`Failed to fetch AVDECC stats: ${response.statusText}`);
      }

      return response.json();
    },
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
        throw new Error(extractErrorMessage(errorData, 'Connection failed'));
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
        throw new Error(extractErrorMessage(errorData, 'Disconnection failed'));
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
          throw new Error(`Batch operation failed: ${extractErrorMessage(errorData, response.statusText)}`);
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
