/**
 * React Hooks for Real-Time Parameter Control
 *
 * Provides ultra-low latency (<10ms) parameter updates for:
 * - UI knob/slider interactions
 * - MIDI controller visualization
 * - Automation (LFO, envelope) display
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  RTParameterClient,
  getRTParameterClient,
  RTParameterIdentity,
  RTParameterUpdate,
  RTConnectionStatus,
} from '../realtimeParams';

/**
 * Hook to manage RT WebSocket connection
 *
 * Connects on first mount and maintains connection for all components.
 */
export function useRTConnection() {
  const [status, setStatus] = useState<RTConnectionStatus>('disconnected');
  const [client] = useState(() => getRTParameterClient());

  useEffect(() => {
    // Connect if not already connected
    if (!client.isConnected()) {
      client.connect().catch(console.error);
    }

    // Subscribe to status changes
    const unsubscribe = client.onStatusChange(setStatus);
    setStatus(client.getStatus());

    return () => {
      unsubscribe();
    };
  }, [client]);

  return {
    status,
    client,
    isConnected: status === 'connected',
  };
}

/**
 * Hook for real-time parameter control
 *
 * Provides bidirectional parameter sync:
 * - Local changes are sent immediately to server
 * - Remote changes (MIDI, automation) update local state
 *
 * @param pluginUri - Plugin URI
 * @param paramIndex - Parameter index
 * @param initialValue - Initial value (used before connection)
 */
export function useRTParameter(
  pluginUri: string,
  paramIndex: number,
  initialValue: number = 0,
  identity: RTParameterIdentity = {},
) {
  const instanceId = identity.instance_id
  const pluginPosition = identity.plugin_position
  const [value, setValue] = useState(initialValue);
  const [remoteValue, setRemoteValue] = useState(initialValue);
  const [isDragging, setIsDragging] = useState(false);
  const client = getRTParameterClient();
  const lastSentValue = useRef<number>(initialValue);

  // Subscribe to remote parameter updates
  useEffect(() => {
    if (!pluginUri) return;

    const unsubscribe = client.subscribeToParameter(
      pluginUri,
      paramIndex,
      (update: RTParameterUpdate) => {
        setRemoteValue(update.value);
        // Only update local value if not currently dragging
        if (!isDragging) {
          setValue(update.value);
        }
      },
      { instance_id: instanceId, plugin_position: pluginPosition },
    );

    // Get initial cached value
    client.getCachedValue(pluginUri, paramIndex, { instance_id: instanceId, plugin_position: pluginPosition }).then(cached => {
      if (cached !== null) {
        setValue(cached);
        setRemoteValue(cached);
      }
    });

    return unsubscribe;
  }, [client, instanceId, isDragging, pluginPosition, pluginUri, paramIndex]);

  // Send value update to server (debounced)
  const sendUpdate = useCallback(
    (newValue: number) => {
      // Avoid sending duplicate values
      if (Math.abs(newValue - lastSentValue.current) < 0.0001) {
        return;
      }
      lastSentValue.current = newValue;
      client.sendParameterUpdate(pluginUri, paramIndex, newValue, {
        instance_id: instanceId,
        plugin_position: pluginPosition,
      });
    },
    [client, instanceId, pluginPosition, pluginUri, paramIndex]
  );

  // Update value and send to server
  const updateValue = useCallback(
    (newValue: number) => {
      setValue(newValue);
      sendUpdate(newValue);
    },
    [sendUpdate]
  );

  // Start drag - prevents remote updates from interfering
  const startDrag = useCallback(() => {
    setIsDragging(true);
  }, []);

  // End drag - syncs with latest remote value if different
  const endDrag = useCallback(() => {
    setIsDragging(false);
    // Send final value
    sendUpdate(value);
  }, [sendUpdate, value]);

  return {
    value,
    setValue: updateValue,
    remoteValue,
    isDragging,
    startDrag,
    endDrag,
    isConnected: client.isConnected(),
  };
}

/**
 * Hook for multiple parameters on a single plugin
 *
 * More efficient than multiple useRTParameter calls.
 */
export function useRTPluginParameters(
  pluginUri: string,
  paramCount: number,
  initialValues?: number[],
  identity: RTParameterIdentity = {},
) {
  const instanceId = identity.instance_id
  const pluginPosition = identity.plugin_position
  const [values, setValues] = useState<number[]>(
    initialValues || new Array(paramCount).fill(0)
  );
  const client = getRTParameterClient();
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Subscribe to all parameters
  useEffect(() => {
    if (!pluginUri || paramCount === 0) return;

    const unsubscribe = client.subscribeToPlugin(
      pluginUri,
      paramCount,
      (update: RTParameterUpdate) => {
        setValues(prev => {
          const next = [...prev];
          next[update.param_index] = update.value;
          return next;
        });
      },
      { instance_id: instanceId, plugin_position: pluginPosition },
    );

    return unsubscribe;
  }, [client, instanceId, pluginPosition, pluginUri, paramCount]);

  // Update a single parameter
  const updateParameter = useCallback(
    (paramIndex: number, value: number) => {
      setValues(prev => {
        const next = [...prev];
        next[paramIndex] = value;
        return next;
      });
      client.sendParameterUpdate(pluginUri, paramIndex, value, {
        instance_id: instanceId,
        plugin_position: pluginPosition,
      });
    },
    [client, instanceId, pluginPosition, pluginUri]
  );

  // Batch update multiple parameters
  const updateParameters = useCallback(
    (updates: Array<{ index: number; value: number }>) => {
      setValues(prev => {
        const next = [...prev];
        updates.forEach(u => {
          next[u.index] = u.value;
        });
        return next;
      });

      client.sendBatchUpdate(
        updates.map(u => ({
          plugin_uri: pluginUri,
          param_index: u.index,
          value: u.value,
          ...(instanceId !== undefined ? { instance_id: instanceId } : {}),
          ...(pluginPosition !== undefined ? { plugin_position: pluginPosition } : {}),
        }))
      );
    },
    [client, instanceId, pluginPosition, pluginUri]
  );

  return {
    values,
    updateParameter,
    updateParameters,
    isConnected: client.isConnected(),
  };
}

/**
 * Hook to observe all real-time parameter updates (for debugging/visualization)
 */
export function useRTParameterStream() {
  const [updates, setUpdates] = useState<RTParameterUpdate[]>([]);
  const [lastUpdate, setLastUpdate] = useState<RTParameterUpdate | null>(null);
  const client = getRTParameterClient();

  useEffect(() => {
    const unsubscribe = client.subscribeToAllUpdates((update) => {
      setLastUpdate(update);
      setUpdates(prev => {
        const next = [...prev, update];
        // Keep last 100 updates
        return next.slice(-100);
      });
    });

    return unsubscribe;
  }, [client]);

  const clear = useCallback(() => {
    setUpdates([]);
    setLastUpdate(null);
  }, []);

  return {
    updates,
    lastUpdate,
    clear,
    isConnected: client.isConnected(),
  };
}

/**
 * Hook for RT connection status
 */
export function useRTStatus() {
  const [status, setStatus] = useState<RTConnectionStatus>('disconnected');
  const client = getRTParameterClient();

  useEffect(() => {
    setStatus(client.getStatus());
    const unsubscribe = client.onStatusChange(setStatus);
    return unsubscribe;
  }, [client]);

  return {
    status,
    isConnected: status === 'connected',
    isReconnecting: status === 'connecting',
    clientId: client.getClientId(),
  };
}
