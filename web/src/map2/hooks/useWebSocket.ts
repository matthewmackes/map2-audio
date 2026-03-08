/**
 * React Hooks for MAP2 WebSocket Integration
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Map2WebSocket,
  getWebSocketClient,
  WebSocketMessage,
  WebSocketTopic,
  ConnectionStatus,
} from '../websocket';
import { sanitizeDisplayPayload } from '../displayNames';

/**
 * Hook to manage WebSocket connection
 *
 * NOTE: This hook uses a global singleton WebSocket client.
 * It connects on first mount but does NOT disconnect on unmount,
 * as that would kill the connection for all components using the singleton.
 */
export function useWebSocketConnection() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [client] = useState(() => getWebSocketClient());

  useEffect(() => {
    // Connect if not already connected
    if (!client.isConnected()) {
      client.connect().catch(console.error);
    }

    // Subscribe to status changes
    const unsubscribe = client.onStatusChange(setStatus);

    // Set initial status
    setStatus(client.getStatus());

    // Only unsubscribe from status changes on unmount
    // Do NOT disconnect - other components may still need the connection
    return () => {
      unsubscribe();
    };
  }, [client]);

  return { status, client, isConnected: status === 'connected' };
}

/**
 * Hook to subscribe to a WebSocket topic
 */
export function useWebSocketTopic<T = any>(
  topic: WebSocketTopic,
  handler: (data: T, message: WebSocketMessage) => void
) {
  const client = getWebSocketClient();
  const handlerRef = useRef(handler);

  // Update handler ref when it changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const messageHandler = (message: WebSocketMessage) => {
      const sanitizedData = sanitizeDisplayPayload(message.data) as T;
      const sanitizedMessage = { ...message, data: sanitizedData };
      handlerRef.current(sanitizedData, sanitizedMessage);
    };

    const unsubscribe = client.subscribe(topic, messageHandler);
    return unsubscribe;
  }, [client, topic]);
}

/**
 * Hook for real-time VU meter data
 */
export function useMeterData() {
  const [levels, setLevels] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useWebSocketTopic('meters', (data, message) => {
    if (message.type === 'meter_update') {
      setLevels(data);
      setLastUpdate(new Date(message.timestamp || Date.now()));
    }
  });

  return { levels, lastUpdate };
}

/**
 * Hook for chain update events
 */
export function useChainUpdates() {
  const [lastEvent, setLastEvent] = useState<WebSocketMessage | null>(null);

  useWebSocketTopic('chain_updates', (data, message) => {
    setLastEvent(message);
  });

  return {
    lastEvent,
    eventType: lastEvent?.type,
    eventData: lastEvent?.data,
  };
}

/**
 * Hook for plugin parameter updates
 */
export function usePluginParams() {
  const [lastEvent, setLastEvent] = useState<WebSocketMessage | null>(null);

  useWebSocketTopic('plugin_params', (data, message) => {
    setLastEvent(message);
  });

  return {
    lastEvent,
    eventType: lastEvent?.type,
    eventData: lastEvent?.data,
  };
}

/**
 * Hook for automation events
 */
export function useAutomation() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [lastEvent, setLastEvent] = useState<WebSocketMessage | null>(null);

  useWebSocketTopic('automation', (data, message) => {
    setLastEvent(message);

    switch (message.type) {
      case 'automation_started':
        setIsPlaying(true);
        if (data.time !== undefined) setCurrentTime(data.time);
        break;

      case 'automation_stopped':
        setIsPlaying(false);
        if (data.time !== undefined) setCurrentTime(data.time);
        break;

      case 'automation_time':
        if (data.time !== undefined) setCurrentTime(data.time);
        break;
    }
  });

  return {
    isPlaying,
    currentTime,
    lastEvent,
    eventType: lastEvent?.type,
    eventData: lastEvent?.data,
  };
}

/**
 * Hook for on-demand WebSocket queries
 */
export function useWebSocketQuery() {
  const client = getWebSocketClient();

  const query = useCallback(
    async (resource: string, params?: Record<string, any>) => {
      return client.query(resource, params);
    },
    [client]
  );

  const getStats = useCallback(async () => {
    return client.getStats();
  }, [client]);

  const getHistory = useCallback(
    async (topic?: WebSocketTopic) => {
      return client.getHistory(topic);
    },
    [client]
  );

  return { query, getStats, getHistory };
}

/**
 * Hook to get WebSocket connection status
 */
export function useWebSocketStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const client = getWebSocketClient();

  useEffect(() => {
    setStatus(client.getStatus());
    const unsubscribe = client.onStatusChange(setStatus);
    return unsubscribe;
  }, [client]);

  return {
    status,
    isConnected: status === 'connected',
    isReconnecting: status === 'reconnecting',
    isDisconnected: status === 'disconnected',
  };
}

/**
 * Hook for custom topic subscriptions
 */
export function useCustomTopic<T = any>(
  topic: WebSocketTopic,
  filter?: (message: WebSocketMessage) => boolean
) {
  const [data, setData] = useState<T | null>(null);
  const [message, setMessage] = useState<WebSocketMessage | null>(null);

  useWebSocketTopic(topic, (eventData, eventMessage) => {
    if (!filter || filter(eventMessage)) {
      setData(eventData);
      setMessage(eventMessage);
    }
  });

  return { data, message };
}

/**
 * Hook for batched parameter updates
 * Optimized for real-time knob/slider interactions
 */
export function useBatchedParameter(
  pluginUri: string,
  paramIndex: number,
  initialValue: number = 0
) {
  const [value, setValue] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);

  // Import the API dynamically to avoid circular deps
  const updateParameter = useCallback(
    async (newValue: number) => {
      setValue(newValue);
      setIsPending(true);

      try {
        // Use dynamic import to get the batched API
        const { pluginsApi } = await import('../api');
        await pluginsApi.setParameterBatched(pluginUri, paramIndex, newValue);
      } catch (error) {
        console.error('Failed to update parameter:', error);
      } finally {
        setIsPending(false);
      }
    },
    [pluginUri, paramIndex]
  );

  // Flush pending updates (call on mouse up / touch end)
  const flush = useCallback(async () => {
    try {
      const { pluginsApi } = await import('../api');
      await pluginsApi.flushParameterBatch();
    } catch (error) {
      console.error('Failed to flush parameter batch:', error);
    }
  }, []);

  // Listen for parameter updates from WebSocket
  useWebSocketTopic('plugin_params', (data, message) => {
    if (message.type === 'parameter_change') {
      if (data?.plugin_uri === pluginUri && data?.param_index === paramIndex) {
        setValue(data.value);
      }
    }
    // Handle batch updates
    if (message.type === 'batch_parameter_change' && data?.updates) {
      const update = data.updates.find(
        (u: any) => u.plugin_uri === pluginUri && u.param_index === paramIndex
      );
      if (update) {
        setValue(update.value);
      }
    }
  });

  return {
    value,
    setValue: updateParameter,
    flush,
    isPending,
  };
}

/**
 * Hook for real-time chain state with WebSocket updates
 */
export function useRealtimeChain(chainId: number) {
  const [chain, setChain] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const loadChain = async () => {
      try {
        setIsLoading(true);
        const { chainsApi } = await import('../api');
        const data = await chainsApi.get(chainId);
        if (!cancelled) {
          setChain(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadChain();
    return () => {
      cancelled = true;
    };
  }, [chainId]);

  // Listen for chain updates via WebSocket
  useWebSocketTopic('chain_updates', (data, message) => {
    if (data?.chain_id === chainId) {
      // Refetch chain on relevant updates
      const relevantTypes = [
        'chain_updated',
        'plugin_added',
        'plugin_removed',
        'plugin_reordered',
      ];
      if (relevantTypes.includes(message.type)) {
        import('../api').then(({ chainsApi }) => {
          chainsApi.get(chainId).then(setChain).catch(console.error);
        });
      }
    }
  });

  // Listen for plugin bypass changes
  useWebSocketTopic('plugin_params', (data, message) => {
    if (message.type === 'bypass_changed' && data?.chain_id === chainId) {
      setChain((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          plugins: prev.plugins.map((p: any) =>
            p.uri === data.plugin_uri ? { ...p, bypassed: data.bypass } : p
          ),
        };
      });
    }
  });

  return { chain, isLoading, error, refetch: () => setChain(null) };
}

// ==================== JUCE Metering Hooks ====================

/**
 * Hook for real-time spectrum analyzer data
 */
export function useSpectrumData() {
  const [spectrum, setSpectrum] = useState<{
    magnitudes: number[];
    frequencies: number[];
    peak?: { frequency: number; magnitude: number };
    centroid?: number;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useWebSocketTopic('spectrum', (data, message) => {
    if (message.type === 'spectrum_update') {
      setSpectrum(data);
      setLastUpdate(new Date(message.timestamp || Date.now()));
    }
  });

  return { spectrum, lastUpdate };
}

/**
 * Hook for real-time LUFS loudness data
 */
export function useLufsData() {
  const [lufs, setLufs] = useState<{
    momentary: number;
    shortTerm: number;
    integrated: number;
    range: number;
    truePeak: number;
    truePeakLeft: number;
    truePeakRight: number;
    running: boolean;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useWebSocketTopic('lufs', (data, message) => {
    if (message.type === 'lufs_update') {
      setLufs(data);
      setLastUpdate(new Date(message.timestamp || Date.now()));
    }
  });

  return { lufs, lastUpdate };
}

/**
 * Hook for real-time CPU metrics data
 */
export function useCpuData() {
  const [cpu, setCpu] = useState<{
    total: number;
    peak: number;
    average: number;
    headroom: number;
    xruns: number;
    perPlugin: Record<string, number>;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useWebSocketTopic('cpu', (data, message) => {
    if (message.type === 'cpu_update') {
      setCpu(data);
      setLastUpdate(new Date(message.timestamp || Date.now()));
    }
  });

  return { cpu, lastUpdate };
}

/**
 * Hook for real-time phase correlation data
 */
export function usePhaseData() {
  const [phase, setPhase] = useState<{
    correlation: number;
    balance: number;
    width: number;
    midLevel: number;
    sideLevel: number;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useWebSocketTopic('phase', (data, message) => {
    if (message.type === 'phase_update') {
      setPhase(data);
      setLastUpdate(new Date(message.timestamp || Date.now()));
    }
  });

  return { phase, lastUpdate };
}

/**
 * Hook for latency information
 */
export function useLatencyData() {
  const [latency, setLatency] = useState<{
    totalSamples: number;
    totalMs: number;
    breakdown: Array<{
      pluginId: number;
      pluginName: string;
      latencySamples: number;
      latencyMs: number;
    }>;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useWebSocketTopic('latency', (data, message) => {
    if (message.type === 'latency_update') {
      setLatency(data);
      setLastUpdate(new Date(message.timestamp || Date.now()));
    }
  });

  return { latency, lastUpdate };
}
