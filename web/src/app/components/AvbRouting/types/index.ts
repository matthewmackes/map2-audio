/**
 * AVB Routing Types
 *
 * Central export for all type definitions used in the AVB routing matrix.
 */

// Node types (Multi-Node Support)
export type {
  AvbNode,
  NodeType,
  NodeStatus,
  PtpState,
  NodeCapabilities,
  PtpSyncInfo,
  NodeHealth,
  TopologyEdge,
  NetworkTopology,
  NodeSelection,
  NetworkSyncStatus,
  CrossNodeRoute,
} from './node';

// Endpoint types
export type {
  Endpoint,
  StreamDirection,
  DeviceType,
  EndpointsResponse,
  EndpointStatus,
} from './endpoint';

// Route types
export type {
  Route,
  ConnectionState,
  ConnectionsResponse,
  RoutingMatrix,
  RoutingMatrixResponse,
  PatchOperation,
  BatchPatchRequest,
} from './route';

// Scene types
export type {
  Scene,
  SceneDiff,
  SceneDiffPreset,
  SceneSummary,
} from './scene';

// Audit types
export type {
  AuditLogEntry,
  AuditEventType,
  ValidationOutcome,
  AuditLogFilter,
  AuditLogResponse,
} from './audit';

// State types
export type {
  RoutingState,
  FilterState,
  SelectionState,
  BankState,
  HistoryState,
  ValidationState,
} from './state';

export { initialRoutingState } from './state';

// Action types
export type { RoutingAction } from './actions';
export type * from './actions'; // Export all individual action types
