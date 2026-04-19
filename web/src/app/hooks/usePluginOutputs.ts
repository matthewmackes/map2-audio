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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getWsBaseUrl } from '../../map2/api';
import { getPluginIdentityKeyFromParts } from '../../map2/utils/pluginIdentity';
import type {
  PeakData,
  OutputPortValue,
  TunerData,
  SpectrumData,
  PluginDataMessage
} from '../../map2/types';

// Stable empty array to avoid recreating on every render
const EMPTY_PLUGIN_URIS: string[] = [];

export interface PluginOutputIdentity {
  uri: string;
  instanceId?: number | null;
  pluginPosition?: number | null;
}

type PluginOutputTarget = string | PluginOutputIdentity;

function toPluginOutputIdentity(target: PluginOutputTarget): PluginOutputIdentity {
  if (typeof target === 'string') {
    return { uri: target };
  }

  return target;
}

function getOutputIdentityKey(target: {
  uri: string;
  instance_id?: number | null;
  plugin_position?: number | null;
  instanceId?: number | null;
  pluginPosition?: number | null;
}): string {
  return getPluginIdentityKeyFromParts(
    target.uri,
    target.plugin_position ?? target.pluginPosition,
    target.instance_id ?? target.instanceId,
  );
}

export interface PluginOutputState {
  /** Peak data keyed by plugin runtime identity and port symbol */
  peaks: Record<string, Record<string, PeakData>>;
  /** Output port values keyed by plugin runtime identity and port index */
  outputPorts: Record<string, Record<number, number>>;
  /** Tuner data keyed by plugin runtime identity */
  tuners: Record<string, TunerData>;
  /** Spectrum data keyed by plugin runtime identity */
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
    wsUrl = `${getWsBaseUrl()}/api/ws`,
    autoConnect = true,
    pluginUris = EMPTY_PLUGIN_URIS,
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
                const pluginKey = getOutputIdentityKey(data);
                if (!next.peaks[pluginKey]) {
                  next.peaks[pluginKey] = {};
                }
                next.peaks[pluginKey][data.port_symbol] = data;
                if (pluginKey !== data.uri && !next.peaks[data.uri]) {
                  next.peaks[data.uri] = next.peaks[pluginKey];
                }
                break;
              }

              case 'output_port_update': {
                const data = message.data as OutputPortValue;
                const pluginKey = getOutputIdentityKey(data);
                if (!next.outputPorts[pluginKey]) {
                  next.outputPorts[pluginKey] = {};
                }
                next.outputPorts[pluginKey][data.port_index] = data.value;
                if (pluginKey !== data.uri && !next.outputPorts[data.uri]) {
                  next.outputPorts[data.uri] = next.outputPorts[pluginKey];
                }
                break;
              }

              case 'tuner_update': {
                const data = message.data as TunerData;
                const pluginKey = getOutputIdentityKey(data);
                next.tuners[pluginKey] = data;
                if (pluginKey !== data.uri && !next.tuners[data.uri]) {
                  next.tuners[data.uri] = data;
                }
                break;
              }

              case 'spectrum_update': {
                const data = message.data as SpectrumData;
                const pluginKey = getOutputIdentityKey(data);
                next.spectrums[pluginKey] = data;
                if (pluginKey !== data.uri && !next.spectrums[data.uri]) {
                  next.spectrums[data.uri] = data;
                }
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
  const getPluginData = useCallback((target: PluginOutputTarget) => {
    const identity = toPluginOutputIdentity(target);
    const pluginKey = getOutputIdentityKey(identity);

    return {
      peaks: state.peaks[pluginKey] || state.peaks[identity.uri] || {},
      outputPorts: state.outputPorts[pluginKey] || state.outputPorts[identity.uri] || {},
      tuner: state.tuners[pluginKey] || state.tuners[identity.uri],
      spectrum: state.spectrums[pluginKey] || state.spectrums[identity.uri],
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
export function usePluginOutput(target: PluginOutputTarget) {
  const identity = toPluginOutputIdentity(target);
  const pluginUris = useMemo(() => [identity.uri], [identity.uri]);
  const { getPluginData, connected, clearClip } = usePluginOutputs({
    pluginUris,
  });

  const data = getPluginData(identity);

  return {
    ...data,
    connected,
    clearClip: (portSymbol?: string) => clearClip(identity.uri, portSymbol),
  };
}

export default usePluginOutputs;
