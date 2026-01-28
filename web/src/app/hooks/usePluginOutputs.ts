/**
 * usePluginOutputs - React Hook for Real-time Plugin Output Data
 * 
 * Subscribes to WebSocket updates for plugin output data including:
 * - Peak meter data (audio levels)
 * - Output control port values (gain reduction, meters)
 * - Tuner data (frequency, note, cents)
 * - Spectrum data (FFT magnitudes)
 * 
 * Uses the MAP2 WebSocket infrastructure with topic-based subscriptions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { 
  PeakData, 
  OutputPortValue, 
  TunerData, 
  SpectrumData,
  PluginDataMessage 
} from '../../map2/types';

export interface PluginOutputState {
  /** Peak data keyed by plugin URI and port symbol */
  peaks: Record<string, Record<string, PeakData>>;
  /** Output port values keyed by plugin URI and port index */
  outputPorts: Record<string, Record<number, number>>;
  /** Tuner data keyed by plugin URI */
  tuners: Record<string, TunerData>;
  /** Spectrum data keyed by plugin URI */
  spectrums: Record<string, SpectrumData>;
  /** Connection status */
  connected: boolean;
  /** Last update timestamp */
  lastUpdate: number | null;
}

const initialState: PluginOutputState = {
  peaks: {},
  outputPorts: {},
  tuners: {},
  spectrums: {},
  connected: false,
  lastUpdate: null,
};

export interface UsePluginOutputsOptions {
  /** WebSocket URL (defaults to current host) */
  wsUrl?: string;
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Plugins to subscribe to (empty = all) */
  pluginUris?: string[];
}

export function usePluginOutputs(options: UsePluginOutputsOptions = {}) {
  const {
    wsUrl = `ws://${window.location.host}/api/ws`,
    autoConnect = true,
    pluginUris = [],
  } = options;

  const [state, setState] = useState<PluginOutputState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[PluginOutputs] WebSocket connected');
        reconnectAttempts.current = 0;
        setState(prev => ({ ...prev, connected: true }));

        // Subscribe to plugin outputs topic
        ws.send(JSON.stringify({
          action: 'subscribe',
          topic: 'plugin_outputs',
        }));

        // If specific plugins, register them
        if (pluginUris.length > 0) {
          ws.send(JSON.stringify({
            action: 'subscribe',
            topic: 'plugin_outputs',
            plugins: pluginUris,
          }));
        }
      };

      ws.onclose = () => {
        console.log('[PluginOutputs] WebSocket disconnected');
        setState(prev => ({ ...prev, connected: false }));
        wsRef.current = null;

        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        
        if (autoConnect) {
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[PluginOutputs] WebSocket error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as PluginDataMessage | { type: string; data: any };
          
          setState(prev => {
            const next = { ...prev, lastUpdate: Date.now() };

            switch (message.type) {
              case 'peak_update': {
                const data = message.data as PeakData;
                if (!next.peaks[data.uri]) {
                  next.peaks[data.uri] = {};
                }
                next.peaks[data.uri][data.port_symbol] = data;
                break;
              }

              case 'output_port_update': {
                const data = message.data as OutputPortValue;
                if (!next.outputPorts[data.uri]) {
                  next.outputPorts[data.uri] = {};
                }
                next.outputPorts[data.uri][data.port_index] = data.value;
                break;
              }

              case 'tuner_update': {
                const data = message.data as TunerData;
                next.tuners[data.uri] = data;
                break;
              }

              case 'spectrum_update': {
                const data = message.data as SpectrumData;
                next.spectrums[data.uri] = data;
                break;
              }
            }

            return next;
          });
        } catch (e) {
          // Ignore non-JSON or malformed messages
        }
      };
    } catch (error) {
      console.error('[PluginOutputs] Failed to create WebSocket:', error);
    }
  }, [wsUrl, autoConnect, pluginUris]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setState(prev => ({ ...prev, connected: false }));
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Get data for a specific plugin
  const getPluginData = useCallback((uri: string) => {
    return {
      peaks: state.peaks[uri] || {},
      outputPorts: state.outputPorts[uri] || {},
      tuner: state.tuners[uri],
      spectrum: state.spectrums[uri],
    };
  }, [state]);

  // Clear clip indicators for a plugin
  const clearClip = useCallback((uri: string, portSymbol?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'clear_clip',
        uri,
        port_symbol: portSymbol,
      }));
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    getPluginData,
    clearClip,
  };
}

/**
 * Hook for a single plugin's output data
 */
export function usePluginOutput(pluginUri: string) {
  const { getPluginData, connected, clearClip } = usePluginOutputs({
    pluginUris: [pluginUri],
  });

  const data = getPluginData(pluginUri);

  return {
    ...data,
    connected,
    clearClip: (portSymbol?: string) => clearClip(pluginUri, portSymbol),
  };
}

export default usePluginOutputs;
