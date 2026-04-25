/**
 * MAP2 WebSocket Client
 * Real-time event-driven communication with backend
 */

import { getWsBaseUrl } from './transport'
import { getRuntimeWebSocket, type RuntimeWebSocketLike } from './runtime'

export type WebSocketMessage = {
  type: string;
  data?: any;
  timestamp?: string;
  request_id?: string;
  topic?: string;
  error?: string;
};

export type WebSocketHandler = (message: WebSocketMessage) => void;

export type WebSocketTopic =
  | 'platform:events'
  | 'platform:events:critical'
  | 'platform:events:error'
  | 'platform:events:warning'
  | 'platform:events:info'
  | 'meters'
  | 'chain_updates'
  | 'plugin_params'
  | 'automation'
  | 'schema_changed'
  | 'avb:router:endpoints'
  | 'avb:router:connections'
  | 'avb:router:connection_state'
  | 'avb:streams'
  | 'avb:ptp'
  | 'avb:avdecc'
  // JUCE metering topics
  | 'spectrum'
  | 'lufs'
  | 'cpu'
  | 'phase'
  | 'latency'
  // MIDI monitor topics
  | 'midi_activity'
  | 'midi_learn'
  | 'midi_cluster'
  | 'midi_cluster_nodes'
  | 'midi_cluster_connections'
  | 'midi_cluster_clock'
  | 'traffic_event'
  // PipeWire audio server
  | 'pipewire'
  // Biamp Tesira Forte AVB fleet
  | 'tesira:meters'        // {device_id, instance_tag, levels_dbu: number[], timestamp}
  | 'tesira:device_state'  // {device_id, event: 'connected'|'disconnected'|'fault'|'preset_changed'|'adopted', detail?}
  | 'tesira:preset_change' // {device_id, preset_index, map2_preset_id, timestamp}
  | 'tesira:preset_reverse_sync' // {device_id, preset_index, matched, map2_preset_ids[], rule_ids[], timestamp}
  | 'tesira:ptp'           // {device_id, state, offset_ns, grandmaster_id, timestamp}
  | 'tesira:discovery'     // {event: 'device_found'|'scan_complete'|'scan_error', device?, total_found?, error?}
  // Effects loops (Tesira AVB external send/return)
  | 'effects_loop_state'
  | 'effects_loop_metrics'
  | 'effects_loop_calibration_progress'
  | 'download:progress'
  | 'soundfont:download:progress'
  | 'brain:runtime'
  | 'brain_metering'
  | 'snapshot_runtime_live_state'
  | 'snapshot_activation_events'
  | 'push_surface:pending_confirmation'
  | 'maschine:status'
  | 'maschine:hid_traffic';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WebSocketConfig {
  url: string;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  pingInterval?: number;
}

/**
 * MAP2 WebSocket Client
 *
 * Features:
 * - Topic-based subscriptions
 * - Automatic reconnection with exponential backoff
 * - Ping/pong keepalive
 * - Request/response pattern for on-demand queries
 * - Type-safe event handlers
 */
export class Map2WebSocket {
  private ws: RuntimeWebSocketLike | null = null;
  private config: Required<WebSocketConfig>;
  private subscriptions = new Map<WebSocketTopic, Set<WebSocketHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private reconnectExhaustedHandlers = new Set<() => void>();
  private requestHandlers = new Map<string, (data: any) => void>();

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnect: config.reconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 10000,
      pingInterval: config.pingInterval ?? 30000,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    const WebSocketImpl = getRuntimeWebSocket()
    if (this.ws?.readyState === WebSocketImpl.OPEN) {
      console.warn('WebSocket already connected');
      return;
    }

    this.updateStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocketImpl(this.config.url);

        this.ws.onopen = () => {
          console.log('MAP2 WebSocket connected');
          this.reconnectAttempts = 0;
          this.updateStatus('connected');
          this.startPing();

          // Resubscribe to all topics
          this.subscriptions.forEach((_, topic) => {
            this.send({ action: 'subscribe', topic });
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.updateStatus('error');
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.cleanup();

          if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            if (this.config.reconnect && this.reconnectAttempts >= this.config.maxReconnectAttempts) {
              this.notifyReconnectExhausted();
            }
            this.updateStatus('disconnected');
          }
        };

      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        this.updateStatus('error');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.config.reconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.cleanup();
    this.updateStatus('disconnected');
  }

  /**
   * Subscribe to a topic
   */
  subscribe(topic: WebSocketTopic, handler: WebSocketHandler): () => void {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());

      // Send subscription message if connected
      if (this.isConnected()) {
        this.send({ action: 'subscribe', topic });
      }
    }

    this.subscriptions.get(topic)!.add(handler);

    // Return unsubscribe function
    return () => this.unsubscribe(topic, handler);
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topic: WebSocketTopic, handler?: WebSocketHandler): void {
    if (handler) {
      this.subscriptions.get(topic)?.delete(handler);

      // If no more handlers, unsubscribe from topic
      if (this.subscriptions.get(topic)?.size === 0) {
        this.subscriptions.delete(topic);
        if (this.isConnected()) {
          this.send({ action: 'unsubscribe', topic });
        }
      }
    } else {
      // Unsubscribe all handlers
      this.subscriptions.delete(topic);
      if (this.isConnected()) {
        this.send({ action: 'unsubscribe', topic });
      }
    }
  }

  /**
   * On-demand query for current state
   */
  async query(resource: string, params?: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const request_id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      this.requestHandlers.set(request_id, (data) => {
        this.requestHandlers.delete(request_id);
        resolve(data);
      });

      this.send({
        action: 'get',
        request_id,
        params: { resource, ...params }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.requestHandlers.has(request_id)) {
          this.requestHandlers.delete(request_id);
          reject(new Error('Request timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Get WebSocket connection statistics
   */
  async getStats(): Promise<any> {
    return this.query('stats');
  }

  /**
   * Get event history for a topic
   */
  async getHistory(topic?: WebSocketTopic): Promise<any> {
    return this.query('history', { topic });
  }

  /**
   * Send an arbitrary action payload to the backend over the active socket.
   */
  sendAction(data: Record<string, unknown>): void {
    this.send(data)
  }

  /**
   * Register status change handler
   */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Register reconnect-exhausted handler
   */
  onReconnectExhausted(handler: () => void): () => void {
    this.reconnectExhaustedHandlers.add(handler);
    return () => this.reconnectExhaustedHandlers.delete(handler);
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === getRuntimeWebSocket().OPEN;
  }

  /**
   * Trigger immediate manual reconnect attempt.
   */
  retryNow(): void {
    const WebSocketImpl = getRuntimeWebSocket()
    if (this.ws?.readyState === WebSocketImpl.OPEN || this.status === 'connecting') {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectAttempts = 0;
    this.config.reconnect = true;
    this.connect().catch(console.error);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      // Handle welcome message
      if (message.type === 'welcome') {
        console.log('Received welcome:', message.data);
        return;
      }

      // Handle response to query
      if (message.type === 'response' && message.request_id) {
        const handler = this.requestHandlers.get(message.request_id);
        if (handler) {
          handler(message.data);
        }
        return;
      }

      // Handle pong
      if (message.type === 'pong') {
        return;
      }

      // Dispatch to topic subscribers. Prefer explicit topic routing when the
      // backend includes it in the payload, otherwise fall back to legacy
      // broadcast-to-all behavior.
      if (message.topic) {
        const typedTopic = message.topic as WebSocketTopic;
        const topicHandlers = this.subscriptions.get(typedTopic);
        if (topicHandlers) {
          topicHandlers.forEach(handler => {
            try {
              handler(message);
            } catch (error) {
              console.error(`Error in handler for topic ${typedTopic}:`, error);
            }
          });
        }
        return;
      }

      // Legacy dispatch path for messages that do not identify a topic.
      for (const [topic, handlers] of this.subscriptions.entries()) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error(`Error in handler for topic ${topic}:`, error);
          }
        });
      }

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Send message to server
   */
  private send(data: any): void {
    if (this.ws?.readyState === getRuntimeWebSocket().OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Start ping/pong keepalive
   */
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ action: 'ping' });
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping/pong keepalive
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.updateStatus('reconnecting');

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(console.error);
    }, delay);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopPing();
    this.ws = null;
  }

  /**
   * Update connection status
   */
  private updateStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusHandlers.forEach(handler => {
        try {
          handler(status);
        } catch (error) {
          console.error('Error in status handler:', error);
        }
      });
    }
  }

  private notifyReconnectExhausted(): void {
    this.reconnectExhaustedHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error('Error in reconnect-exhausted handler:', error);
      }
    });
  }
}

/**
 * Create WebSocket client instance
 */
export function createWebSocketClient(baseUrl?: string): Map2WebSocket {
  const normalizedBaseUrl = (baseUrl || getWsBaseUrl()).replace(/\/$/, '')
  const url = `${normalizedBaseUrl}/ws/v1`

  return new Map2WebSocket({ url });
}

// Global singleton instance
let globalClient: Map2WebSocket | null = null;

/**
 * Get or create global WebSocket client instance
 */
export function getWebSocketClient(): Map2WebSocket {
  if (!globalClient) {
    globalClient = createWebSocketClient();
  }
  return globalClient;
}
