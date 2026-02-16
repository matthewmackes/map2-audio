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
import type { RoutingState, RoutingAction, Endpoint, Route } from '../types';
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

  // Sync endpoints with reducer state
  useEffect(() => {
    if (!endpointsData) return;

    const endpoints: Endpoint[] = endpointsData.endpoints.map((ep) => ({
      ...ep,
      // Add default UI metadata (will be overlaid with localStorage later)
      tags: [],
      color: '#ffffff',
      group: 'Default',
      bank: 0,
      pinned: false,
      locked: false,
    }));

    dispatch({
      type: 'ENDPOINTS_UPDATED',
      payload: endpoints,
    });
  }, [endpointsData]);

  // Sync connections with reducer state
  useEffect(() => {
    if (!connectionsData) return;

    const routes: Route[] = connectionsData.connections.map((conn) => ({
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
    }));

    dispatch({
      type: 'CONNECTIONS_UPDATED',
      payload: routes,
    });
  }, [connectionsData]);

  // Handle loading state
  useEffect(() => {
    const loading = endpointsLoading || connectionsLoading;
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, [endpointsLoading, connectionsLoading]);

  // Handle errors
  useEffect(() => {
    const error = endpointsError || connectionsError;
    if (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Unknown error',
      });
    } else {
      dispatch({ type: 'SET_ERROR', payload: null });
    }
  }, [endpointsError, connectionsError]);

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
 *
 * Usage:
 *   const talkers = useFilteredEndpoints('talker');
 */
export function useFilteredEndpoints(direction?: 'talker' | 'listener'): Endpoint[] {
  const { state } = useRouting();

  let endpoints = Object.values(state.endpoints);

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
