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
import type { RoutingState, RoutingAction, Endpoint, Route, CrossNodeRoute } from '../types';
import { initialRoutingState } from '../types';

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

    // Infer node_id from endpoint data (use entity_id or node_address as fallback)
    const endpoints: Endpoint[] = endpointsData.endpoints.map((ep) => ({
      ...ep,
      // Add default UI metadata (will be overlaid with localStorage later)
      tags: [],
      color: '#ffffff',
      group: 'Default',
      bank: 0,
      pinned: false,
      locked: false,
      // Assign node_id (for now, use local until we have multi-node backend support)
      node_id: localNodeId || 'local',
    }));

    dispatch({
      type: 'ENDPOINTS_UPDATED',
      payload: endpoints,
    });
  }, [endpointsData, localNodeId]);

  // Sync connections with reducer state
  useEffect(() => {
    if (!connectionsData) return;

    const routes: Route[] = connectionsData.connections.map((conn) => {
      const talkerNodeId = conn.talker.node_id || undefined;
      const listenerNodeId = conn.listener.node_id || undefined;

      return {
        id: conn.connection_id,
        talker_id: conn.talker.endpoint_id || '',
        listener_id: conn.listener.endpoint_id || '',
        state: conn.state,
        established_time: conn.established_time,
        error_message: conn.error_message,
        connection_count: 0,
        srp_reservation_id: conn.srp_reservation_id,
        srp_admission_id: conn.srp_admission_id,
        locked: false,
        valid: true,
        messages: [],
        talker_node_id: talkerNodeId,
        listener_node_id: listenerNodeId,
        cross_node: !!talkerNodeId && !!listenerNodeId && talkerNodeId !== listenerNodeId,
      };
    });

    const crossNodeRoutes: CrossNodeRoute[] = routes
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

    dispatch({
      type: 'CONNECTIONS_UPDATED',
      payload: routes,
    });

    dispatch({
      type: 'CROSS_NODE_ROUTES_SYNCED',
      payload: crossNodeRoutes,
    });
  }, [connectionsData]);

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

  // Filter by direction
  if (direction) {
    endpoints = endpoints.filter((ep) => ep.direction === direction);
  }

  // Apply filters
  if (state.filters.deviceTypes.length > 0) {
    endpoints = endpoints.filter((ep) => state.filters.deviceTypes.includes(ep.device_type));
  }

  if (state.filters.sampleRates.length > 0) {
    endpoints = endpoints.filter((ep) => state.filters.sampleRates.includes(ep.sample_rate));
  }

  if (state.filters.channelCounts.length > 0) {
    endpoints = endpoints.filter((ep) => state.filters.channelCounts.includes(ep.channels));
  }

  if (state.filters.availableOnly) {
    endpoints = endpoints.filter((ep) => ep.available);
  }

  if (!state.filters.showLocked) {
    endpoints = endpoints.filter((ep) => !ep.locked);
  }

  if (state.filters.groups.length > 0) {
    endpoints = endpoints.filter((ep) => state.filters.groups.includes(ep.group));
  }

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
