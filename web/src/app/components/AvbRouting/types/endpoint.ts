/**
 * AVB Endpoint Type Definitions
 *
 * Represents AVB talker and listener endpoints discovered on the network.
 * Maps directly to backend AudioEndpoint schema from avb_router.py.
 */

/**
 * Stream direction enum
 */
export type StreamDirection = 'talker' | 'listener';

/**
 * Device type classification
 */
export type DeviceType = 'map2' | 'avdecc' | 'unknown';

/**
 * AVB Audio Endpoint
 *
 * Represents a single audio stream endpoint (talker or listener) on the AVB network.
 * Combines backend data with UI-specific metadata stored in localStorage.
 */
export interface Endpoint {
  // Core backend fields (from AudioEndpoint)
  endpoint_id: string;           // Format: "entity_id:unique_id"
  entity_id: string;             // 16-char hex string (e.g., "001122fffe334455")
  unique_id: number;             // Stream index (0-65535)
  direction: StreamDirection;
  device_type: DeviceType;
  device_name: string;
  channels: number;
  sample_rate: number;           // Hz (e.g., 48000, 96000)
  format: string;                // e.g., "24-bit PCM"
  mac_address: string | null;
  node_address: string | null;   // e.g., "http://192.168.1.10:8080"
  available: boolean;
  last_seen: string;             // ISO 8601 timestamp

  // UI metadata (stored in localStorage, overlaid on backend data)
  tags: string[];                // User-defined tags for search/filtering
  color: string;                 // Hex color for visual grouping (#RRGGBB)
  group: string;                 // Logical grouping name
  bank: number;                  // Banking for pagination (0-based)
  pinned: boolean;               // Pin to top of list
  locked: boolean;               // Prevent modifications
}

/**
 * Backend API response format for endpoints
 */
export interface EndpointsResponse {
  endpoints: Omit<Endpoint, 'tags' | 'color' | 'group' | 'bank' | 'pinned' | 'locked'>[];
  count: number;
}

/**
 * Endpoint status information
 */
export interface EndpointStatus {
  endpoint_id: string;
  available: boolean;
  link_up: boolean;
  sync: boolean;            // Clock sync status (PTP)
  active: boolean;          // Currently streaming
}
