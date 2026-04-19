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
  EndpointApiPayload,
  StreamDirection,
  DeviceType,
  CanonicalEndpointField,
  EndpointsResponse,
  EndpointStatus,
  AvbDiscoveredDevice,
  AvbReadinessContract,
  AvbDevicesResponse,
  AvbChannelCapabilitiesResponse,
  AvbAvdeccEntity,
  AvbAvdeccEntitiesResponse,
  AvbAvdeccStats,
  AvbAvdeccProtocolStats,
  AvbStreamHealth,
  AvbStreamOwnership,
  AvbStreamEffectiveConfig,
  AvbStreamPtpLockDiagnostics,
  AvbStreamTsnDiagnostics,
  AvbStreamSrpDiagnostics,
  AvbStreamDiagnostics,
  AvbStreamPayload,
  AvbStreamsResponse,
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
  FilterQuality,
  SelectionState,
  BankState,
  HistoryState,
  ValidationState,
} from './state';

export {
  FILTER_QUALITY_OPTIONS,
  clearAllFilterState,
  defaultFilterState,
  initialRoutingState,
} from './state';

// Action types
export type { RoutingAction } from './actions';
export type * from './actions'; // Export all individual action types
