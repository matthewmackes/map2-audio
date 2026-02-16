/**
 * Routing State Machine Reducer
 *
 * Pure reducer function that handles all state mutations for the AVB routing matrix.
 *
 * Architecture:
 * - All state changes go through this reducer (single source of truth)
 * - Safe patch mode stages changes in `pendingRoutes` before applying
 * - History tracked via `past`/`future` stacks for undo/redo
 * - Audit log captures all user actions with timestamps
 *
 * State Flow:
 *   User Action → Reducer → State Update → API Call (side effect in hook)
 *                                        ↓
 *                              WebSocket Update → State Sync
 */

import type {
  RoutingState,
  RoutingAction,
  Route,
  Endpoint,
  AuditLogEntry,
} from '../types';

function generateId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomA = Math.random().toString(36).slice(2, 10);
  const randomB = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${randomA}-${randomB}`;
}

/**
 * Create a new audit log entry
 */
function createAuditEntry(
  type: AuditLogEntry['event_type'],
  payload: Record<string, unknown>,
  summary: string,
  outcome: AuditLogEntry['validation_outcome'] = 'success'
): AuditLogEntry {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    event_type: type,
    actor: 'user', // TODO: Get from auth context
    payload,
    diff_summary: summary,
    validation_outcome: outcome,
  };
}

/**
 * Save state to history (for undo/redo)
 */
function saveToHistory(state: RoutingState): RoutingState {
  return {
    ...state,
    history: {
      past: [...state.history.past, state],
      future: [], // Clear redo stack on new action
    },
  };
}

/**
 * Routing Reducer
 *
 * Handles all state mutations in a predictable, type-safe manner.
 */
export function routingReducer(
  state: RoutingState,
  action: RoutingAction
): RoutingState {
  switch (action.type) {
    // ========================================================================
    // Connection Actions
    // ========================================================================

    case 'PATCH': {
      const { talker_id, listener_id } = action.payload;
      const route_id = `${talker_id}→${listener_id}`;

      // Check if route already exists
      const existingRoute = state.liveRoutes[route_id];
      if (existingRoute?.state === 'connected') {
        return state; // Already connected, no-op
      }

      // In safe patch mode, stage the connection
      if (state.safePatchMode) {
        const newState = {
          ...state,
          pendingRoutes: {
            ...state.pendingRoutes,
            [route_id]: {
              id: route_id,
              talker_id,
              listener_id,
              state: 'connecting' as const,
              established_time: null,
              error_message: null,
              connection_count: 0,
              srp_reservation_id: null,
              srp_admission_id: null,
              locked: false,
              valid: true,
              messages: [],
            },
          },
          auditLog: [
            ...state.auditLog,
            createAuditEntry('PATCH', action.payload, `Staged connection: ${route_id}`),
          ],
        };

        return saveToHistory(newState);
      }

      // Direct patch (API call handled by side effect)
      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            id: route_id,
            talker_id,
            listener_id,
            state: 'connecting' as const,
            established_time: null,
            error_message: null,
            connection_count: 0,
            srp_reservation_id: null,
            srp_admission_id: null,
            locked: false,
            valid: true,
            messages: [],
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry('PATCH', action.payload, `Connecting: ${route_id}`),
        ],
      };

      return saveToHistory(newState);
    }

    case 'UNPATCH': {
      const { route_id } = action.payload;

      // Check if route is locked
      const route = state.liveRoutes[route_id];
      if (route?.locked) {
        return {
          ...state,
          error: `Cannot disconnect locked route: ${route_id}`,
        };
      }

      // In safe patch mode, stage the disconnection
      if (state.safePatchMode) {
        const newState = {
          ...state,
          pendingRoutes: {
            ...state.pendingRoutes,
            [route_id]: {
              ...route,
              state: 'disconnecting' as const,
            } as Route,
          },
          auditLog: [
            ...state.auditLog,
            createAuditEntry('UNPATCH', action.payload, `Staged disconnection: ${route_id}`),
          ],
        };

        return saveToHistory(newState);
      }

      // Direct unpatch
      const newLiveRoutes = { ...state.liveRoutes };
      delete newLiveRoutes[route_id];

      const newState = {
        ...state,
        liveRoutes: newLiveRoutes,
        auditLog: [
          ...state.auditLog,
          createAuditEntry('UNPATCH', action.payload, `Disconnected: ${route_id}`),
        ],
      };

      return saveToHistory(newState);
    }

    case 'BATCH_PATCH': {
      const { operations } = action.payload;

      // Apply all operations
      let newState = state;
      for (const op of operations) {
        if (op.action === 'connect') {
          newState = routingReducer(newState, {
            type: 'PATCH',
            payload: { talker_id: op.talker_id, listener_id: op.listener_id },
          });
        } else if (op.action === 'disconnect') {
          const route_id = `${op.talker_id}→${op.listener_id}`;
          newState = routingReducer(newState, {
            type: 'UNPATCH',
            payload: { route_id },
          });
        }
      }

      return {
        ...newState,
        auditLog: [
          ...newState.auditLog,
          createAuditEntry(
            'BATCH_PATCH',
            action.payload,
            `Batch operation: ${operations.length} changes`
          ),
        ],
      };
    }

    // ========================================================================
    // Locking Actions
    // ========================================================================

    case 'LOCK_ROUTE': {
      const { route_id, reason } = action.payload;
      const route = state.liveRoutes[route_id];

      if (!route) {
        return { ...state, error: `Route not found: ${route_id}` };
      }

      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            ...route,
            locked: true,
            lock_reason: reason,
            locked_by: 'user', // TODO: Get from auth
            locked_at: new Date().toISOString(),
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'LOCK_ROUTE',
            action.payload,
            `Locked route: ${route_id} (${reason})`
          ),
        ],
      };

      return saveToHistory(newState);
    }

    case 'UNLOCK_ROUTE': {
      const { route_id } = action.payload;
      const route = state.liveRoutes[route_id];

      if (!route) {
        return { ...state, error: `Route not found: ${route_id}` };
      }

      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            ...route,
            locked: false,
            lock_reason: undefined,
            locked_by: undefined,
            locked_at: undefined,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry('UNLOCK_ROUTE', action.payload, `Unlocked route: ${route_id}`),
        ],
      };

      return saveToHistory(newState);
    }

    case 'LOCK_ENDPOINT': {
      const { endpoint_id, reason } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return { ...state, error: `Endpoint not found: ${endpoint_id}` };
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            locked: true,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'LOCK_ENDPOINT',
            action.payload,
            `Locked endpoint: ${endpoint_id} (${reason})`
          ),
        ],
      };
    }

    case 'UNLOCK_ENDPOINT': {
      const { endpoint_id } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return { ...state, error: `Endpoint not found: ${endpoint_id}` };
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            locked: false,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'UNLOCK_ENDPOINT',
            action.payload,
            `Unlocked endpoint: ${endpoint_id}`
          ),
        ],
      };
    }

    // ========================================================================
    // Safe Patch Mode
    // ========================================================================

    case 'ENTER_SAFE_MODE': {
      return {
        ...state,
        safePatchMode: true,
        pendingRoutes: {},
        auditLog: [
          ...state.auditLog,
          createAuditEntry('ENTER_SAFE_MODE', {}, 'Entered safe patch mode'),
        ],
      };
    }

    case 'APPLY_SAFE_CHANGES': {
      // Merge pending routes into live routes
      const newState = {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          ...state.pendingRoutes,
        },
        pendingRoutes: {},
        safePatchMode: false,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'APPLY_SAFE_CHANGES',
            { count: Object.keys(state.pendingRoutes).length },
            `Applied ${Object.keys(state.pendingRoutes).length} pending changes`
          ),
        ],
      };

      return saveToHistory(newState);
    }

    case 'DISCARD_SAFE_CHANGES': {
      return {
        ...state,
        pendingRoutes: {},
        safePatchMode: false,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'DISCARD_SAFE_CHANGES',
            { count: Object.keys(state.pendingRoutes).length },
            `Discarded ${Object.keys(state.pendingRoutes).length} pending changes`
          ),
        ],
      };
    }

    // ========================================================================
    // Scene Management
    // ========================================================================

    case 'SAVE_SCENE': {
      const { name, description, tags } = action.payload;
      const scene_id = generateId();

      const scene = {
        id: scene_id,
        name,
        description,
        tags,
        routes: Object.values(state.liveRoutes),
        timestamp: new Date().toISOString(),
        created_by: 'user', // TODO: Get from auth
      };

      const newState = {
        ...state,
        scenes: {
          ...state.scenes,
          [scene_id]: scene,
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'SAVE_SCENE',
            action.payload,
            `Saved scene: ${name} (${Object.keys(state.liveRoutes).length} routes)`
          ),
        ],
      };

      return saveToHistory(newState);
    }

    case 'RECALL_SCENE': {
      const { scene_id } = action.payload;
      const scene = state.scenes[scene_id];

      if (!scene) {
        return { ...state, error: `Scene not found: ${scene_id}` };
      }

      // Replace live routes with scene routes
      const newLiveRoutes: Record<string, Route> = {};
      for (const route of scene.routes) {
        newLiveRoutes[route.id] = route;
      }

      const newState = {
        ...state,
        liveRoutes: newLiveRoutes,
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'RECALL_SCENE',
            action.payload,
            `Recalled scene: ${scene.name} (${scene.routes.length} routes)`
          ),
        ],
      };

      return saveToHistory(newState);
    }

    case 'DELETE_SCENE': {
      const { scene_id } = action.payload;
      const scene = state.scenes[scene_id];

      if (!scene) {
        return state;
      }

      const newScenes = { ...state.scenes };
      delete newScenes[scene_id];

      return {
        ...state,
        scenes: newScenes,
        auditLog: [
          ...state.auditLog,
          createAuditEntry('DELETE_SCENE', action.payload, `Deleted scene: ${scene.name}`),
        ],
      };
    }

    // ========================================================================
    // UI State Actions
    // ========================================================================

    case 'SET_FILTERS': {
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload,
        },
      };
    }

    case 'SET_SEARCH': {
      return {
        ...state,
        search: action.payload,
      };
    }

    case 'SET_BANK': {
      return {
        ...state,
        bank: {
          ...state.bank,
          ...action.payload,
        },
      };
    }

    case 'SELECT_ENDPOINT': {
      const endpoint_id = action.payload;
      const isSelected = state.selection.selectedEndpoints.includes(endpoint_id);

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedEndpoints: isSelected
            ? state.selection.selectedEndpoints.filter(id => id !== endpoint_id)
            : [...state.selection.selectedEndpoints, endpoint_id],
        },
      };
    }

    case 'SELECT_ROUTE': {
      const route_id = action.payload;
      const isSelected = state.selection.selectedRoutes.includes(route_id);

      return {
        ...state,
        selection: {
          ...state.selection,
          selectedRoutes: isSelected
            ? state.selection.selectedRoutes.filter(id => id !== route_id)
            : [...state.selection.selectedRoutes, route_id],
        },
      };
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        selection: {
          selectedEndpoints: [],
          selectedRoutes: [],
          hoveredCell: null,
        },
      };
    }

    case 'HOVER_CELL': {
      return {
        ...state,
        selection: {
          ...state.selection,
          hoveredCell: action.payload,
        },
      };
    }

    // ========================================================================
    // Endpoint Metadata Actions
    // ========================================================================

    case 'UPDATE_ENDPOINT_LABEL': {
      const { endpoint_id, label } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            device_name: label, // Update display name
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'ENDPOINT_LABEL_CHANGE',
            action.payload,
            `Renamed endpoint: ${endpoint_id} → "${label}"`
          ),
        ],
      };
    }

    case 'UPDATE_ENDPOINT_TAGS': {
      const { endpoint_id, tags } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            tags,
          },
        },
      };
    }

    case 'UPDATE_ENDPOINT_COLOR': {
      const { endpoint_id, color } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            color,
          },
        },
      };
    }

    // ========================================================================
    // Data Sync Actions (from API/WebSocket)
    // ========================================================================

    case 'ENDPOINTS_UPDATED': {
      const endpoints = action.payload;
      const newEndpoints: Record<string, Endpoint> = {};

      for (const endpoint of endpoints) {
        // Preserve UI metadata if endpoint already exists
        const existing = state.endpoints[endpoint.endpoint_id];
        newEndpoints[endpoint.endpoint_id] = {
          ...endpoint,
          tags: existing?.tags || [],
          color: existing?.color || '#ffffff',
          group: existing?.group || 'Default',
          bank: existing?.bank || 0,
          pinned: existing?.pinned || false,
          locked: existing?.locked || false,
        };
      }

      return {
        ...state,
        endpoints: newEndpoints,
        lastSync: new Date().toISOString(),
      };
    }

    case 'CONNECTIONS_UPDATED': {
      const routes = action.payload;
      const newRoutes: Record<string, Route> = {};

      for (const route of routes) {
        // Preserve UI metadata if route already exists
        const existing = state.liveRoutes[route.id];
        newRoutes[route.id] = {
          ...route,
          locked: existing?.locked || false,
          lock_reason: existing?.lock_reason,
          locked_by: existing?.locked_by,
          locked_at: existing?.locked_at,
          valid: existing?.valid ?? true,
          messages: existing?.messages || [],
        };
      }

      return {
        ...state,
        liveRoutes: newRoutes,
        lastSync: new Date().toISOString(),
      };
    }

    case 'STATUS_UPDATE': {
      const { endpoint_id, available } = action.payload;
      const endpoint = state.endpoints[endpoint_id];

      if (!endpoint) {
        return state;
      }

      return {
        ...state,
        endpoints: {
          ...state.endpoints,
          [endpoint_id]: {
            ...endpoint,
            available,
            last_seen: new Date().toISOString(),
          },
        },
      };
    }

    case 'CONNECTION_STATE_CHANGE': {
      const { route_id, state: newState, error_message } = action.payload;
      const route = state.liveRoutes[route_id];

      if (!route) {
        return state;
      }

      return {
        ...state,
        liveRoutes: {
          ...state.liveRoutes,
          [route_id]: {
            ...route,
            state: newState,
            error_message: error_message || null,
            established_time: newState === 'connected' ? new Date().toISOString() : route.established_time,
          },
        },
        auditLog: [
          ...state.auditLog,
          createAuditEntry(
            'CONNECTION_STATE_CHANGE',
            { route_id, state: newState, error_message },
            `Connection state changed: ${route_id} → ${newState}`
          ),
        ],
      };
    }

    // ========================================================================
    // History Actions
    // ========================================================================

    case 'UNDO': {
      if (state.history.past.length === 0) {
        return state;
      }

      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      return {
        ...previous,
        history: {
          past: newPast,
          future: [state, ...state.history.future],
        },
      };
    }

    case 'REDO': {
      if (state.history.future.length === 0) {
        return state;
      }

      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);

      return {
        ...next,
        history: {
          past: [...state.history.past, state],
          future: newFuture,
        },
      };
    }

    case 'CLEAR_HISTORY': {
      return {
        ...state,
        history: {
          past: [],
          future: [],
        },
      };
    }

    // ========================================================================
    // Loading/Error Actions
    // ========================================================================

    case 'SET_LOADING': {
      return {
        ...state,
        loading: action.payload,
      };
    }

    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
      };
    }

    default:
      return state;
  }
}
