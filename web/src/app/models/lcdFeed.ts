/** TypeScript model for LCD feed entries derived from canonical PlatformEvents. */

export type LCDFeedCategory = 'audio' | 'system' | 'network' | 'service' | 'user' | 'alert';
export type LCDFeedSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface LCDFeedEntry {
  event_id: string;
  timestamp: string;
  source_node: string;
  category: LCDFeedCategory;
  severity: LCDFeedSeverity;
  title: string;
  message: string;
  icon: string;
  broadcast: boolean;
  target_nodes: string[];
  ttl: number;
  color: string;
  sound: boolean;
  dismiss_auto: boolean;
  context: Record<string, unknown>;
}

export interface LCDFeedStats {
  local_events: number;
  remote_events: number;
  total_events: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  active_nodes: string[];
  connected_peers: string[];
}
