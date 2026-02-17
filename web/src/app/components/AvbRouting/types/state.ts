/**
 * Routing State Machine Type Definitions
 *
 * Central state management for the AVB routing matrix.
 * Uses reducer pattern for predictable state updates and time-travel debugging.
 */

import type { Endpoint } from './endpoint';
import type { Route } from './route';
import type { Scene } from './scene';
import type { AuditLogEntry } from './audit';
import type {
  AvbNode,
  NodeSelection,
  NetworkTopology,
  NetworkSyncStatus,
  CrossNodeRoute,
} from './node';

/**
 * Filter state
 */
export interface FilterState {
  deviceTypes: ('map2' | 'avdecc' | 'unknown')[];
  sampleRates: number[];
  channelCounts: number[];
  availableOnly: boolean;
  showLocked: boolean;
  groups: string[];
}

/**
 * Selection state
 */
export interface SelectionState {
  selectedEndpoints: string[];   // endpoint_ids
  selectedRoutes: string[];      // route_ids
  hoveredCell: {
    talker_id: string;
    listener_id: string;
  } | null;
  focusedCell: {
    talker_id: string;
    listener_id: string;
  } | null;
}

/**
 * Banking state (pagination for large matrices)
 */
export interface BankState {
  talkers: number;               // Current talker bank (0-based)
  listeners: number;             // Current listener bank (0-based)
  size: number;                  // Endpoints per bank (default: 32)
}

/**
 * History state (for undo/redo)
 */
export interface HistoryState {
  past: RoutingState[];
  future: RoutingState[];
}

/**
 * Validation state
 */
export interface ValidationState {
  enabled: boolean;
  strict: boolean;               // Strict mode blocks invalid connections
  warnings: Map<string, string[]>; // route_id → warnings
  errors: Map<string, string[]>;   // route_id → errors
}

/**
 * Complete routing state
 *
 * This is the single source of truth for the routing matrix UI.
 * Now includes multi-node network awareness as a first-class citizen.
 */
export interface RoutingState {
  // Network (Multi-Node)
  network: {
    nodes: Record<string, AvbNode>;          // All discovered nodes
    nodeSelection: NodeSelection;             // Current node selection
    topology: NetworkTopology | null;         // Network graph
    syncStatus: NetworkSyncStatus | null;    // PTP/gPTP sync
    crossNodeRoutes: Record<string, CrossNodeRoute>; // Cross-node routes
  };

  // Data
  endpoints: Record<string, Endpoint>;
  liveRoutes: Record<string, Route>;
  pendingRoutes: Record<string, Route>;  // Safe patch staging area
  scenes: Record<string, Scene>;

  // UI State
  selection: SelectionState;
  filters: FilterState;
  search: string;
  bank: BankState;
  safePatchMode: boolean;
  validation: ValidationState;

  // History (undo/redo)
  history: HistoryState;

  // Audit log
  auditLog: AuditLogEntry[];

  // Loading/error states
  loading: boolean;
  error: string | null;

  // Last sync timestamp
  lastSync: string | null;
}

/**
 * Initial/default state
 */
export const initialRoutingState: RoutingState = {
  network: {
    nodes: {},
    nodeSelection: {
      current_node_id: null,
      local_node_id: 'local',  // Will be replaced with actual local node ID
      view_mode: 'all_nodes',
      selected_node_ids: [],
      show_offline: false,
    },
    topology: null,
    syncStatus: null,
    crossNodeRoutes: {},
  },

  endpoints: {},
  liveRoutes: {},
  pendingRoutes: {},
  scenes: {},

  selection: {
    selectedEndpoints: [],
    selectedRoutes: [],
    hoveredCell: null,
    focusedCell: null,
  },

  filters: {
    deviceTypes: ['map2', 'avdecc'],
    sampleRates: [],
    channelCounts: [],
    availableOnly: false,
    showLocked: true,
    groups: [],
  },

  search: '',

  bank: {
    talkers: 0,
    listeners: 0,
    size: 32,
  },

  safePatchMode: false,

  validation: {
    enabled: true,
    strict: false,
    warnings: new Map(),
    errors: new Map(),
  },

  history: {
    past: [],
    future: [],
  },

  auditLog: [],

  loading: false,
  error: null,
  lastSync: null,
};
