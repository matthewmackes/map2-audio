/** TypeScript model for LCD Events */

export type EventType = 'audio' | 'system' | 'network' | 'service' | 'user' | 'alert';
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface LCDEvent {
  event_id: string;
  timestamp: string;
  source_node: string;
  event_type: EventType;
  severity: EventSeverity;
  title: string;
  message: string;
  icon: string;
  broadcast: boolean;
  target_nodes: string[];
  ttl: number;
  color: string;
  sound: boolean;
  dismiss_auto: boolean;
  context: Record<string, any>;
}

export interface LCDStatistics {
  local_events: number;
  remote_events: number;
  total_events: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  active_nodes: string[];
  connected_peers: string[];
}
