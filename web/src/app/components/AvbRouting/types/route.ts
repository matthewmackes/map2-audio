/**
 * AVB Route Type Definitions
 *
 * Represents stream connections between talkers and listeners.
 * Maps to backend StreamConnection schema from avb_router.py.
 */

import type { Endpoint } from './endpoint';

/**
 * Connection state enum
 *
 * Lifecycle:
 * disconnected → connecting → connected
 *                    ↓
 *                 error
 *
 * connected → disconnecting → disconnected
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

/**
 * Stream Connection / Route
 *
 * Represents a talker-to-listener connection in the routing matrix.
 */
export interface Route {
  // Core backend fields (from StreamConnection)
  id: string;                         // Format: "talker_id→listener_id"
  talker_id: string;
  listener_id: string;
  state: ConnectionState;
  established_time: string | null;    // ISO 8601 timestamp
  error_message: string | null;
  connection_count: number;           // ACMP connection count
  srp_reservation_id: string | null;  // SRP admission control
  srp_admission_id: string | null;

  // UI metadata
  locked: boolean;                    // UI-level lock (prevents disconnect)
  lock_reason?: string;               // Why this route is locked
  locked_by?: string;                 // User who locked it
  locked_at?: string;                 // When it was locked

  // Validation
  valid: boolean;                     // Passes validation checks
  messages: string[];                 // Validation warnings/errors

  // Multi-node routing
  talker_node_id?: string;            // Source node ID
  listener_node_id?: string;          // Destination node ID
  cross_node: boolean;                // Is this a cross-node route?
  network_path?: string[];            // Path through network (for multi-hop)
  latency_ms?: number | null;         // Measured latency
  bandwidth_mbps?: number;            // Bandwidth usage
}

/**
 * Backend API response format for connections
 */
export interface ConnectionsResponse {
  connections: Array<{
    connection_id: string;
    talker: Partial<Endpoint>;
    listener: Partial<Endpoint>;
    state: ConnectionState;
    established_time: string | null;
    error_message: string | null;
    srp_reservation_id: string | null;
    srp_admission_id: string | null;
  }>;
  count: number;
}

/**
 * Routing matrix
 *
 * Format: matrix[talker_id][listener_id] = ConnectionState | null
 */
export interface RoutingMatrix {
  [talker_id: string]: {
    [listener_id: string]: ConnectionState | null;
  };
}

/**
 * Backend API response for routing matrix
 */
export interface RoutingMatrixResponse {
  matrix: RoutingMatrix;
  talker_count: number;
  listener_count: number;
}

/**
 * Patch/unpatch operation
 */
export interface PatchOperation {
  talker_id: string;
  listener_id: string;
  action: 'connect' | 'disconnect';
}

/**
 * Batch patch request
 */
export interface BatchPatchRequest {
  operations: PatchOperation[];
}
