/**
 * Real-Time Parameter WebSocket Client
 *
 * Ultra-low latency (<10ms) parameter control via dedicated WebSocket endpoint.
 * Optimized for live performance with MIDI controllers and automation.
 */

export type RTConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RTParameterUpdate {
  plugin_uri: string;
  param_index: number;
  value: number;
  source?: string;
  timestamp?: number;
}

export type RTParameterHandler = (update: RTParameterUpdate) => void;

export interface RTClientConfig {
  url?: string;
  useBinary?: boolean;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

/**
 * Real-Time Parameter Client
 *
 * Provides ultra-low latency parameter updates via dedicated WebSocket.
 * Optimized for:
 * - UI knob/slider interactions
 * - MIDI controller input
 * - Automation (LFO, envelope) visualization
 */
export class RTParameterClient {
  private ws: WebSocket | null = null;
  private config: Required<RTClientConfig>;
  private status: RTConnectionStatus = 'disconnected';
  private statusHandlers = new Set<(status: RTConnectionStatus) => void>();
  private paramHandlers = new Map<string, Set<RTParameterHandler>>();
  private globalHandlers = new Set<RTParameterHandler>();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private clientId: string | null = null;

  constructor(config: RTClientConfig = {}) {
    const protocol = typeof window !== 'undefined'
      ? (window.location.protocol === 'https:' ? 'wss:' : 'ws:')
      : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const frontendPort = typeof window !== 'undefined' ? window.location.port === '3000' : false;
    const hostWithPort = typeof window !== 'undefined' ? window.location.host : host;
    const baseHost = frontendPort ? hostWithPort : host;
    const portSuffix = frontendPort ? '' : ':8080';

    this.config = {
      url: config.url || `${protocol}//${baseHost}${portSuffix}/ws/rt`,
      useBinary: config.useBinary ?? false,
      reconnect: config.reconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    };
  }

  /**
   * Connect to real-time WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        const url = this.config.useBinary
          ? `${this.config.url}?binary=true`
          : this.config.url;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[RT] Connected to real-time parameter endpoint');
          this.reconnectAttempts = 0;
          this.updateStatus('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[RT] WebSocket error:', error);
          this.updateStatus('error');
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('[RT] WebSocket closed:', event.code);
          this.ws = null;

          if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else {
            this.updateStatus('disconnected');
          }
        };
      } catch (error) {
        this.updateStatus('error');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
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
    this.updateStatus('disconnected');
  }

  /**
   * Send parameter update to server
   *
   * @param pluginUri - Plugin URI
   * @param paramIndex - Parameter index
   * @param value - New parameter value
   */
  sendParameterUpdate(pluginUri: string, paramIndex: number, value: number): void {
    if (!this.isConnected()) {
      console.warn('[RT] Cannot send: not connected');
      return;
    }

    const message = {
      action: 'param_update',
      plugin_uri: pluginUri,
      param_index: paramIndex,
      value,
    };

    this.ws!.send(JSON.stringify(message));
  }

  /**
   * Send batch parameter updates
   *
   * @param updates - Array of parameter updates
   */
  sendBatchUpdate(updates: RTParameterUpdate[]): void {
    if (!this.isConnected() || updates.length === 0) {
      return;
    }

    const message = {
      action: 'param_batch',
      updates: updates.map(u => ({
        plugin_uri: u.plugin_uri,
        param_index: u.param_index,
        value: u.value,
      })),
    };

    this.ws!.send(JSON.stringify(message));
  }

  /**
   * Subscribe to parameter updates for a specific plugin/param
   *
   * @param pluginUri - Plugin URI
   * @param paramIndex - Parameter index
   * @param handler - Callback for updates
   * @returns Unsubscribe function
   */
  subscribeToParameter(
    pluginUri: string,
    paramIndex: number,
    handler: RTParameterHandler
  ): () => void {
    const key = `${pluginUri}:${paramIndex}`;

    if (!this.paramHandlers.has(key)) {
      this.paramHandlers.set(key, new Set());

      // Tell server we want updates for this parameter
      if (this.isConnected()) {
        this.ws!.send(JSON.stringify({
          action: 'subscribe',
          plugin_uri: pluginUri,
          param_index: paramIndex,
        }));
      }
    }

    this.paramHandlers.get(key)!.add(handler);

    return () => {
      const handlers = this.paramHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.paramHandlers.delete(key);
          // Unsubscribe from server
          if (this.isConnected()) {
            this.ws!.send(JSON.stringify({
              action: 'unsubscribe',
              plugin_uri: pluginUri,
              param_index: paramIndex,
            }));
          }
        }
      }
    };
  }

  /**
   * Subscribe to all parameters for a plugin
   *
   * @param pluginUri - Plugin URI
   * @param paramCount - Number of parameters
   * @param handler - Callback for updates
   * @returns Unsubscribe function
   */
  subscribeToPlugin(
    pluginUri: string,
    paramCount: number,
    handler: RTParameterHandler
  ): () => void {
    // Subscribe to all params
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify({
        action: 'subscribe_all',
        plugin_uri: pluginUri,
        param_count: paramCount,
      }));
    }

    // Add handler for each param
    const unsubscribes: (() => void)[] = [];
    for (let i = 0; i < paramCount; i++) {
      unsubscribes.push(this.subscribeToParameter(pluginUri, i, handler));
    }

    return () => unsubscribes.forEach(unsub => unsub());
  }

  /**
   * Subscribe to all parameter updates (global handler)
   *
   * @param handler - Callback for all updates
   * @returns Unsubscribe function
   */
  subscribeToAllUpdates(handler: RTParameterHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  /**
   * Get cached parameter value from server
   *
   * @param pluginUri - Plugin URI
   * @param paramIndex - Parameter index
   */
  async getCachedValue(pluginUri: string, paramIndex: number): Promise<number | null> {
    if (!this.isConnected()) {
      return null;
    }

    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.type === 'value' &&
            msg.plugin_uri === pluginUri &&
            msg.param_index === paramIndex
          ) {
            this.ws!.removeEventListener('message', handler);
            resolve(msg.value);
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws!.addEventListener('message', handler);
      this.ws!.send(JSON.stringify({
        action: 'get_value',
        plugin_uri: pluginUri,
        param_index: paramIndex,
      }));

      // Timeout after 1 second
      setTimeout(() => {
        this.ws?.removeEventListener('message', handler);
        resolve(null);
      }, 1000);
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection status
   */
  getStatus(): RTConnectionStatus {
    return this.status;
  }

  /**
   * Get client ID assigned by server
   */
  getClientId(): string | null {
    return this.clientId;
  }

  /**
   * Register status change handler
   */
  onStatusChange(handler: (status: RTConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      // Handle welcome message
      if (msg.type === 'rt_welcome') {
        this.clientId = msg.client_id;
        console.log('[RT] Client ID:', this.clientId, 'Protocol:', msg.protocol);

        // Resubscribe to all parameters after reconnect
        this.paramHandlers.forEach((_, key) => {
          const [pluginUri, paramIndex] = key.split(':');
          this.ws!.send(JSON.stringify({
            action: 'subscribe',
            plugin_uri: pluginUri,
            param_index: parseInt(paramIndex, 10),
          }));
        });
        return;
      }

      // Handle pong
      if (msg.type === 'pong') {
        return;
      }

      // Handle parameter update
      if (msg.type === 'param_update') {
        const update: RTParameterUpdate = {
          plugin_uri: msg.plugin_uri,
          param_index: msg.param_index,
          value: msg.value,
          source: msg.source,
          timestamp: msg.timestamp,
        };

        // Dispatch to specific handlers
        const key = `${msg.plugin_uri}:${msg.param_index}`;
        const handlers = this.paramHandlers.get(key);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(update);
            } catch (e) {
              console.error('[RT] Handler error:', e);
            }
          });
        }

        // Dispatch to global handlers
        this.globalHandlers.forEach(handler => {
          try {
            handler(update);
          } catch (e) {
            console.error('[RT] Global handler error:', e);
          }
        });
      }
    } catch (error) {
      console.error('[RT] Failed to parse message:', error);
    }
  }

  private scheduleReconnect(): void {
    this.updateStatus('connecting');

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      10000
    );

    console.log(`[RT] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(console.error);
    }, delay);
  }

  private updateStatus(status: RTConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusHandlers.forEach(handler => {
        try {
          handler(status);
        } catch (e) {
          console.error('[RT] Status handler error:', e);
        }
      });
    }
  }
}

// Global singleton instance
let globalRTClient: RTParameterClient | null = null;

/**
 * Get or create global RT parameter client
 */
export function getRTParameterClient(): RTParameterClient {
  if (!globalRTClient) {
    globalRTClient = new RTParameterClient();
  }
  return globalRTClient;
}

/**
 * Create RT parameter client with custom config
 */
export function createRTParameterClient(config: RTClientConfig): RTParameterClient {
  return new RTParameterClient(config);
}
