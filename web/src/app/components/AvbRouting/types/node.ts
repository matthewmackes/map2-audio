/**
 * AVB Network Node Types
 *
 * Defines node discovery, capabilities, and network topology.
 */

/**
 * Node type classification
 */
export type NodeType = 'map2_local' | 'map2_remote' | 'avdecc' | 'unknown';

/**
 * Node online status
 */
export type NodeStatus = 'online' | 'offline' | 'degraded' | 'initializing';

/**
 * PTP/gPTP synchronization state
 */
export type PtpState = 'master' | 'slave' | 'listening' | 'passive' | 'disabled' | 'unknown';

/**
 * Node capabilities
 */
export interface NodeCapabilities {
  /**
   * Can act as AVB talker (output streams)
   */
  talker: boolean;

  /**
   * Can act as AVB listener (input streams)
   */
  listener: boolean;

  /**
   * Supports AVDECC controller functions
   */
  avdecc_controller: boolean;

  /**
   * Supports audio processing (DSP, effects)
   */
  audio_processing: boolean;

  /**
   * Can be controlled via REST API
   */
  remote_control: boolean;

  /**
   * Maximum simultaneous talker streams
   */
  max_talkers: number;

  /**
   * Maximum simultaneous listener streams
   */
  max_listeners: number;

  /**
   * Supported sample rates (Hz)
   */
  sample_rates: number[];

  /**
   * Supported audio formats
   */
  formats: string[];
}

/**
 * PTP/gPTP synchronization info
 */
export interface PtpSyncInfo {
  /**
   * Current PTP state
   */
  state: PtpState;

  /**
   * PTP domain number
   */
  domain: number;

  /**
   * Is this node the PTP master?
   */
  is_master: boolean;

  /**
   * Master clock ID (if known)
   */
  master_clock_id: string | null;

  /**
   * Clock offset from master (nanoseconds)
   */
  offset_ns: number | null;

  /**
   * Last sync timestamp
   */
  last_sync: string | null;

  /**
   * gPTP supported
   */
  gptp_supported: boolean;
}

/**
 * Node health metrics
 */
export interface NodeHealth {
  /**
   * CPU usage percentage (0-100)
   */
  cpu_usage: number;

  /**
   * Memory usage percentage (0-100)
   */
  memory_usage: number;

  /**
   * Network latency (milliseconds)
   */
  latency_ms: number;

  /**
   * Packet loss rate (0-1)
   */
  packet_loss: number;

  /**
   * Last health check timestamp
   */
  last_check: string;

  /**
   * Health status
   */
  status: 'healthy' | 'degraded' | 'critical';
}

/**
 * AVB Network Node
 *
 * Represents a single node (MAP2 or AVDECC device) on the AVB network.
 */
export interface AvbNode {
  /**
   * Unique node identifier (MAC address or entity ID)
   */
  node_id: string;

  /**
   * Human-readable node name
   */
  name: string;

  /**
   * Node type
   */
  type: NodeType;

  /**
   * Current online status
   */
  status: NodeStatus;

  /**
   * Node capabilities
   */
  capabilities: NodeCapabilities;

  /**
   * PTP synchronization info
   */
  ptp: PtpSyncInfo | null;

  /**
   * Node health metrics
   */
  health: NodeHealth | null;

  /**
   * Network address (IP or MAC)
   */
  address: string;

  /**
   * API base URL (for MAP2 nodes)
   */
  api_url: string | null;

  /**
   * AVDECC entity ID (for AVDECC nodes)
   */
  entity_id: string | null;

  /**
   * Number of talker endpoints on this node
   */
  talker_count: number;

  /**
   * Number of listener endpoints on this node
   */
  listener_count: number;

  /**
   * Number of active routes on this node
   */
  active_routes: number;

  /**
   * Firmware/software version
   */
  version: string | null;

  /**
   * Manufacturer name
   */
  manufacturer: string | null;

  /**
   * Model name
   */
  model: string | null;

  /**
   * First discovered timestamp
   */
  discovered_at: string;

  /**
   * Last seen timestamp
   */
  last_seen: string;

  /**
   * UI metadata
   */
  color: string;           // Accent color for UI (auto-assigned)
  pinned: boolean;         // Pinned to top of node list
  notes: string;           // User notes
}

/**
 * Network topology edge (connection between nodes)
 */
export interface TopologyEdge {
  /**
   * Source node ID
   */
  from_node_id: string;

  /**
   * Destination node ID
   */
  to_node_id: string;

  /**
   * Edge type
   */
  type: 'audio_route' | 'ptp_sync' | 'network_link';

  /**
   * Number of routes using this edge (for audio_route type)
   */
  route_count?: number;

  /**
   * Total bandwidth (Mbps) for audio_route edges
   */
  bandwidth_mbps?: number;

  /**
   * Link quality (0-1, for network_link type)
   */
  quality?: number;
}

/**
 * Network topology
 */
export interface NetworkTopology {
  /**
   * All nodes in the network
   */
  nodes: AvbNode[];

  /**
   * Edges between nodes
   */
  edges: TopologyEdge[];

  /**
   * PTP master node ID
   */
  ptp_master_id: string | null;

  /**
   * Last topology update
   */
  updated_at: string;
}

/**
 * Node selection state
 */
export interface NodeSelection {
  /**
   * Currently selected node ID (for focused control)
   */
  current_node_id: string | null;

  /**
   * Local node ID (the node running this frontend)
   */
  local_node_id: string;

  /**
   * View mode
   */
  view_mode: 'all_nodes' | 'single_node' | 'multi_select';

  /**
   * Selected node IDs (for multi-select mode)
   */
  selected_node_ids: string[];

  /**
   * Show offline nodes?
   */
  show_offline: boolean;
}

/**
 * Network sync status
 */
export interface NetworkSyncStatus {
  /**
   * Is network synchronized?
   */
  synchronized: boolean;

  /**
   * PTP master node
   */
  master_node_id: string | null;

  /**
   * Number of nodes in sync
   */
  synced_nodes: number;

  /**
   * Total number of nodes
   */
  total_nodes: number;

  /**
   * Maximum clock offset (ns) across all nodes
   */
  max_offset_ns: number | null;

  /**
   * Last sync check
   */
  last_check: string;
}

/**
 * Cross-node routing metadata
 */
export interface CrossNodeRoute {
  /**
   * Route ID
   */
  route_id: string;

  /**
   * Source node ID (talker)
   */
  source_node_id: string;

  /**
   * Destination node ID (listener)
   */
  dest_node_id: string;

  /**
   * Talker endpoint ID
   */
  talker_id: string;

  /**
   * Listener endpoint ID
   */
  listener_id: string;

  /**
   * Cross-node routing status
   */
  status: 'pending' | 'establishing' | 'active' | 'failed';

  /**
   * Network path (list of node IDs for multi-hop routing)
   */
  network_path: string[];

  /**
   * Estimated latency (ms)
   */
  latency_ms: number | null;

  /**
   * Bandwidth usage (Mbps)
   */
  bandwidth_mbps: number;
}
