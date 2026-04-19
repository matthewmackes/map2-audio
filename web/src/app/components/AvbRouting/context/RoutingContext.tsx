/**
 * Routing Context Provider
 *
 * Central state management for the AVB routing matrix.
 * Combines reducer-based state machine with react-query data fetching.
 *
 * Architecture:
 * - Reducer manages UI state and user actions
 * - react-query manages server state (endpoints, connections)
 * - Context provides state + dispatch to all child components
 * - WebSocket sync updates state in real-time (Phase 6)
 *
 * Usage:
 *   <RoutingProvider>
 *     <AvbRoutingApp />
 *   </RoutingProvider>
 */

import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import { routingReducer } from './routingReducer';
import { useEndpoints, useConnections } from '../hooks/useAvbApi';
import { useNodes, usePtpStatus, useLocalNodeId } from '../hooks/useNodeApi';
import type { RoutingState, RoutingAction, Endpoint, Route, CrossNodeRoute, AvbNode } from '../types';
import { initialRoutingState } from '../types';
import { applyEndpointFilters } from '../utils/filters';
import { useWebSocketTopic } from '../../../../map2/hooks/useWebSocket';

/**
 * Context value shape
 */
interface RoutingContextValue {
  state: RoutingState;
  dispatch: React.Dispatch<RoutingAction>;
}

/**
 * Create context (null initially, set by provider)
 */
const RoutingContext = createContext<RoutingContextValue | null>(null);

/**
 * Provider Props
 */
interface RoutingProviderProps {
  children: ReactNode;
  /**
   * Initial state override (useful for testing)
   */
  initialState?: RoutingState;
}

type EndpointNodeResolutionCandidate = Pick<Endpoint, 'node_id' | 'node_address'>;

function normalizeAddressKey(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '').toLowerCase();
}

function collectNodeAddressKeys(raw: string | null | undefined): string[] {
  const normalized = normalizeAddressKey(raw);
  if (!normalized) {
    return [];
  }

  const keys = new Set<string>([normalized]);

  try {
    const parsed = new URL(normalized);
    keys.add(parsed.origin.toLowerCase());
    keys.add(parsed.host.toLowerCase());
    keys.add(parsed.hostname.toLowerCase());
  } catch (_error) {
    // Node addresses are not guaranteed to be valid URLs; keep normalized raw key.
  }

  return Array.from(keys);
}

function normalizePayloadArray(payload: unknown, key: 'endpoints' | 'connections'): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const container = payload as Record<string, unknown>;
  const raw = container[key];
  return Array.isArray(raw) ? raw : [];
}

function buildEndpointPayloadState(
  payload: unknown,
  nodesData: AvbNode[] | undefined,
  localNodeId: string | null
): Endpoint[] {
  const nodeAddressLookup = buildNodeAddressLookup(nodesData);
  const payloadEndpoints = normalizePayloadArray(payload, 'endpoints');

  return payloadEndpoints
    .map((rawEndpoint) => {
      if (!rawEndpoint || typeof rawEndpoint !== 'object') {
        return null;
      }

      const endpoint = rawEndpoint as Omit<Endpoint, 'tags' | 'color' | 'group' | 'bank' | 'pinned' | 'locked'>;
      return {
        ...endpoint,
        // Add default UI metadata (will be overlaid with localStorage later)
        tags: [],
        color: '#ffffff',
        group: 'Default',
        bank: 0,
        pinned: false,
        locked: false,
        // Preserve backend node ownership when present, then resolve by node address, then local.
        node_id: resolveEndpointNodeId(endpoint, nodeAddressLookup, localNodeId),
      } as Endpoint;
    })
    .filter((endpoint): endpoint is Endpoint => endpoint !== null);
}

type ConnectionPayload = {
  connection_id?: string;
  talker?: Partial<Endpoint>;
  listener?: Partial<Endpoint>;
  state?: Route['state'];
  established_time?: string | null;
  error_message?: string | null;
  srp_reservation_id?: string | null;
  srp_admission_id?: string | null;
};

type ConnectionStatePayload = {
  route_id: string;
  state: Route['state'];
  error_message?: string | null;
};

function buildConnectionPayloadState(payload: unknown): Route[] {
  const payloadConnections = normalizePayloadArray(payload, 'connections');

  return payloadConnections
    .map((rawConnection) => {
      if (!rawConnection || typeof rawConnection !== 'object') {
        return null;
      }

      const connection = rawConnection as ConnectionPayload;
      const talker = connection.talker || {};
      const listener = connection.listener || {};
      const talkerNodeId = talker.node_id || undefined;
      const listenerNodeId = listener.node_id || undefined;

      const route: Route = {
        id: connection.connection_id || `${talker.endpoint_id || ''}→${listener.endpoint_id || ''}`,
        talker_id: talker.endpoint_id || '',
        listener_id: listener.endpoint_id || '',
        state: connection.state || 'disconnected',
        established_time: connection.established_time || null,
        error_message: connection.error_message || null,
        connection_count: 0,
        srp_reservation_id: connection.srp_reservation_id || null,
        srp_admission_id: connection.srp_admission_id || null,
        locked: false,
        valid: true,
        messages: [],
        talker_node_id: talkerNodeId,
        listener_node_id: listenerNodeId,
        cross_node: !!talkerNodeId && !!listenerNodeId && talkerNodeId !== listenerNodeId,
      };

      return route;
    })
    .filter((route): route is Route => route !== null);
}

function isValidConnectionState(value: unknown): value is Route['state'] {
  return (
    value === 'disconnected' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'disconnecting' ||
    value === 'error'
  );
}

function buildConnectionStatePayload(payload: unknown): ConnectionStatePayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const container = payload as Record<string, unknown>;

  const routeId = typeof container.route_id === 'string' ? container.route_id.trim() : '';
  const connectionId = typeof container.connection_id === 'string' ? container.connection_id.trim() : '';
  const talkerId = typeof container.talker_id === 'string' ? container.talker_id.trim() : '';
  const listenerId = typeof container.listener_id === 'string' ? container.listener_id.trim() : '';
  const rawState = container.state;
  if (!routeId && !connectionId && !(talkerId && listenerId)) {
    return null;
  }

  if (!isValidConnectionState(rawState)) {
    return null;
  }

  const state = rawState;
  const derivedRouteId = routeId || connectionId || `${talkerId}→${listenerId}`;
  if (!derivedRouteId) {
    return null;
  }

  const rawError = container.error_message;
  const error_message =
    typeof rawError === 'string' ? rawError : rawError === null ? null : undefined;

  return error_message === undefined
    ? { route_id: derivedRouteId, state }
    : { route_id: derivedRouteId, state, error_message };
}

function buildCrossNodeRoutes(routes: Route[]): CrossNodeRoute[] {
  return routes
    .filter((route) => route.cross_node && route.talker_node_id && route.listener_node_id)
    .map((route) => {
      let status: CrossNodeRoute['status'] = 'pending';
      if (route.state === 'connected') {
        status = 'active';
      } else if (route.state === 'connecting') {
        status = 'establishing';
      } else if (route.state === 'error') {
        status = 'failed';
      }

      return {
        route_id: route.id,
        source_node_id: route.talker_node_id as string,
        dest_node_id: route.listener_node_id as string,
        talker_id: route.talker_id,
        listener_id: route.listener_id,
        status,
        network_path:
          route.network_path && route.network_path.length > 0
            ? route.network_path
            : [route.talker_node_id as string, route.listener_node_id as string],
        latency_ms: route.latency_ms ?? null,
        bandwidth_mbps: route.bandwidth_mbps ?? 0,
      };
    });
}

function syncConnectionsState(
  dispatch: React.Dispatch<RoutingAction>,
  payload: unknown
) {
  const routes = buildConnectionPayloadState(payload);
  dispatch({
    type: 'CONNECTIONS_UPDATED',
    payload: routes,
  });
  dispatch({
    type: 'CROSS_NODE_ROUTES_SYNCED',
    payload: buildCrossNodeRoutes(routes),
  });
}

function buildNodeAddressLookup(nodes: AvbNode[] | undefined): Map<string, string> {
  const lookup = new Map<string, string>();

  if (!nodes) {
    return lookup;
  }

  nodes.forEach((node) => {
    const register = (raw: string | null | undefined) => {
      collectNodeAddressKeys(raw).forEach((key) => {
        if (!lookup.has(key)) {
          lookup.set(key, node.node_id);
        }
      });
    };

    register(node.api_url);
    register(node.address);
  });

  return lookup;
}

function resolveEndpointNodeId(
  endpoint: EndpointNodeResolutionCandidate,
  nodeAddressLookup: Map<string, string>,
  localNodeId: string | null
): string {
  const endpointNodeId = endpoint.node_id?.trim();
  if (endpointNodeId) {
    return endpointNodeId;
  }

  const fromAddress = collectNodeAddressKeys(endpoint.node_address)
    .map((key) => nodeAddressLookup.get(key))
    .find((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0);

  if (fromAddress) {
    return fromAddress;
  }

  return localNodeId || 'local';
}

/**
 * Routing Provider Component
 *
 * Wraps the entire routing UI and provides state management.
 */
export function RoutingProvider({ children, initialState = initialRoutingState }: RoutingProviderProps) {
  // Initialize reducer
  const [state, dispatch] = useReducer(routingReducer, initialState);

  // Fetch endpoints from backend
  const {
    data: endpointsData,
    isLoading: endpointsLoading,
    error: endpointsError,
  } = useEndpoints();

  // Fetch connections from backend
  const {
    data: connectionsData,
    isLoading: connectionsLoading,
    error: connectionsError,
  } = useConnections();

  // Fetch nodes from backend (Multi-Node Support)
  const {
    data: nodesData,
    isLoading: nodesLoading,
    error: nodesError,
  } = useNodes();

  // Fetch PTP sync status
  const {
    data: ptpStatus,
  } = usePtpStatus();

  // Get local node ID
  const localNodeId = useLocalNodeId();

  // Sync nodes with reducer state
  useEffect(() => {
    if (!nodesData) return;

    dispatch({
      type: 'NODES_UPDATED',
      payload: nodesData,
    });
  }, [nodesData]);

  // Set local node ID
  useEffect(() => {
    if (localNodeId) {
      dispatch({
        type: 'SET_LOCAL_NODE_ID',
        payload: localNodeId,
      });
    }
  }, [localNodeId]);

  // Sync PTP status
  useEffect(() => {
    if (ptpStatus) {
      dispatch({
        type: 'SYNC_STATUS_UPDATED',
        payload: ptpStatus,
      });
    }
  }, [ptpStatus]);

  // Sync endpoints with reducer state
  useEffect(() => {
    if (!endpointsData) return;

    dispatch({
      type: 'ENDPOINTS_UPDATED',
      payload: buildEndpointPayloadState(endpointsData, nodesData, localNodeId),
    });
  }, [endpointsData, localNodeId, nodesData]);

  // Sync connections with reducer state
  useEffect(() => {
    if (!connectionsData) return;

    syncConnectionsState(dispatch, connectionsData);
  }, [connectionsData]);

  // Sync endpoints from AVB websocket feed for near-real-time updates.
  useWebSocketTopic('avb:router:endpoints', (data) => {
    dispatch({
      type: 'ENDPOINTS_UPDATED',
      payload: buildEndpointPayloadState(data, nodesData, localNodeId),
    });
  });

  // Sync connections from AVB websocket feed for near-real-time updates.
  useWebSocketTopic('avb:router:connections', (data) => {
    syncConnectionsState(dispatch, data);
  });

  // Sync connection state updates from AVB websocket feed for targeted updates.
  useWebSocketTopic('avb:router:connection_state', (data) => {
    const payload = buildConnectionStatePayload(data);
    if (!payload) {
      return;
    }

    dispatch({
      type: 'CONNECTION_STATE_CHANGE',
      payload,
    });
  });

  // Handle loading state
  useEffect(() => {
    const loading = endpointsLoading || connectionsLoading || nodesLoading;
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, [endpointsLoading, connectionsLoading, nodesLoading]);

  // Handle errors
  useEffect(() => {
    const error = endpointsError || connectionsError || nodesError;
    if (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Unknown error',
      });
    } else {
      dispatch({ type: 'SET_ERROR', payload: null });
    }
  }, [endpointsError, connectionsError, nodesError]);

  // Provide context value
  const value: RoutingContextValue = {
    state,
    dispatch,
  };

  return <RoutingContext.Provider value={value}>{children}</RoutingContext.Provider>;
}

/**
 * Hook to access routing context
 *
 * Usage:
 *   const { state, dispatch } = useRouting();
 *
 * @throws Error if used outside RoutingProvider
 */
export function useRouting(): RoutingContextValue {
  const context = useContext(RoutingContext);

  if (!context) {
    throw new Error('useRouting must be used within a RoutingProvider');
  }

  return context;
}

/**
 * Hook to access routing state only (no dispatch)
 *
 * Useful for components that only read state.
 *
 * Usage:
 *   const state = useRoutingState();
 */
export function useRoutingState(): RoutingState {
  const { state } = useRouting();
  return state;
}

/**
 * Hook to access dispatch only (no state)
 *
 * Useful for components that only dispatch actions.
 *
 * Usage:
 *   const dispatch = useRoutingDispatch();
 */
export function useRoutingDispatch(): React.Dispatch<RoutingAction> {
  const { dispatch } = useRouting();
  return dispatch;
}

/**
 * Hook to access filtered endpoints
 *
 * Applies search and filter criteria from state.
 * Supports multi-node filtering based on view mode.
 *
 * Usage:
 *   const talkers = useFilteredEndpoints('talker');
 */
export function useFilteredEndpoints(direction?: 'talker' | 'listener'): Endpoint[] {
  const { state } = useRouting();

  let endpoints = Object.values(state.endpoints);

  // Filter by node selection (multi-node support)
  const { view_mode, current_node_id, selected_node_ids } = state.network.nodeSelection;

  if (view_mode === 'single_node' && current_node_id) {
    // Show only endpoints from the selected node
    endpoints = endpoints.filter((ep) => ep.node_id === current_node_id);
  } else if (view_mode === 'multi_select' && selected_node_ids.length > 0) {
    // Show only endpoints from selected nodes
    endpoints = endpoints.filter((ep) => selected_node_ids.includes(ep.node_id));
  }
  // view_mode === 'all_nodes' shows all endpoints (no filter)

  // Apply all endpoint filters from the unified filter model.
  endpoints = applyEndpointFilters(endpoints, state.filters, state.network.nodes, direction);

  // Apply search
  if (state.search) {
    const searchLower = state.search.toLowerCase();
    endpoints = endpoints.filter(
      (ep) =>
        ep.device_name.toLowerCase().includes(searchLower) ||
        ep.endpoint_id.toLowerCase().includes(searchLower) ||
        ep.tags.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  }

  // Sort: pinned first, then by name
  endpoints.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.device_name.localeCompare(b.device_name);
  });

  // Apply banking (pagination)
  const { size } = state.bank;
  const bankIndex = direction === 'talker' ? state.bank.talkers : state.bank.listeners;
  const start = bankIndex * size;
  const end = start + size;

  return endpoints.slice(start, end);
}

/**
 * Hook to get a specific route
 *
 * Usage:
 *   const route = useRoute(talker_id, listener_id);
 */
export function useRoute(talker_id: string, listener_id: string): Route | null {
  const { state } = useRouting();
  const route_id = `${talker_id}→${listener_id}`;
  return state.liveRoutes[route_id] || state.pendingRoutes[route_id] || null;
}

/**
 * Hook to check if undo is available
 */
export function useCanUndo(): boolean {
  const { state } = useRouting();
  return state.history.past.length > 0;
}

/**
 * Hook to check if redo is available
 */
export function useCanRedo(): boolean {
  const { state } = useRouting();
  return state.history.future.length > 0;
}

/**
 * Hook to get audit log entries (latest first)
 */
export function useAuditLog(limit?: number) {
  const { state } = useRouting();
  const log = [...state.auditLog].reverse(); // Latest first
  return limit ? log.slice(0, limit) : log;
}
