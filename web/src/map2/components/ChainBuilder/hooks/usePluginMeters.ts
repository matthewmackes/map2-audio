// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Plugin Meters Hook
// Manages per-plugin metering data with WebSocket subscriptions
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { PluginMeterData } from '../nodes/PluginMeterPanel';

// ============================================================================
// Types
// ============================================================================

export interface PluginMetersState {
  [pluginUri: string]: PluginMeterData;
}

export interface UsePluginMetersOptions {
  /** Plugin URIs to subscribe to */
  pluginUris: string[];
  /** WebSocket instance for real-time data */
  websocket?: WebSocket | null;
  /** REST API for fetching spectrum data */
  fetchSpectrum?: (pluginUri: string) => Promise<number[]>;
  /** Whether to subscribe to spectrum data (more expensive) */
  includeSpectrum?: boolean;
  /** Update rate throttle in ms */
  throttleMs?: number;
  /** Expanded plugin URIs (only subscribe to these for detailed data) */
  expandedPlugins?: Set<string>;
}

export interface UsePluginMetersReturn {
  /** Current meter data for all plugins */
  meters: PluginMetersState;
  /** Get meter data for a specific plugin */
  getMeterData: (pluginUri: string) => PluginMeterData | undefined;
  /** Manually update meter data */
  updateMeterData: (pluginUri: string, data: Partial<PluginMeterData>) => void;
  /** Clear all meter data */
  clearMeters: () => void;
}

// ============================================================================
// Default meter data
// ============================================================================

const DEFAULT_METER_DATA: PluginMeterData = {
  inputLeft: 0,
  inputRight: 0,
  outputLeft: 0,
  outputRight: 0,
  inputPeak: 0,
  outputPeak: 0,
  spectrum: undefined,
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePluginMeters(options: UsePluginMetersOptions): UsePluginMetersReturn {
  const {
    pluginUris,
    websocket,
    fetchSpectrum,
    includeSpectrum = false,
    throttleMs = 50,
    expandedPlugins,
  } = options;

  const [meters, setMeters] = useState<PluginMetersState>({});
  const lastUpdateRef = useRef<{ [key: string]: number }>({});
  const spectrumIntervalRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Get meter data for a specific plugin
  const getMeterData = useCallback(
    (pluginUri: string): PluginMeterData | undefined => {
      return meters[pluginUri];
    },
    [meters]
  );

  // Update meter data for a specific plugin
  const updateMeterData = useCallback(
    (pluginUri: string, data: Partial<PluginMeterData>) => {
      const now = Date.now();
      const lastUpdate = lastUpdateRef.current[pluginUri] || 0;

      // Throttle updates
      if (now - lastUpdate < throttleMs) {
        return;
      }

      lastUpdateRef.current[pluginUri] = now;

      setMeters((prev) => ({
        ...prev,
        [pluginUri]: {
          ...DEFAULT_METER_DATA,
          ...prev[pluginUri],
          ...data,
        },
      }));
    },
    [throttleMs]
  );

  // Clear all meter data
  const clearMeters = useCallback(() => {
    setMeters({});
    lastUpdateRef.current = {};
  }, []);

  // Initialize meter data for all plugins
  useEffect(() => {
    setMeters((prev) => {
      const newMeters = { ...prev };
      for (const uri of pluginUris) {
        if (!newMeters[uri]) {
          newMeters[uri] = { ...DEFAULT_METER_DATA };
        }
      }
      return newMeters;
    });
  }, [pluginUris]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        // Handle meter updates
        if (message.type === 'meters' || message.type === 'plugin_meters') {
          const data = message.data;

          // Update all plugins in the message
          if (data.plugins && Array.isArray(data.plugins)) {
            for (const pluginData of data.plugins) {
              if (pluginUris.includes(pluginData.uri)) {
                updateMeterData(pluginData.uri, {
                  inputLeft: pluginData.input_left ?? pluginData.input ?? 0,
                  inputRight: pluginData.input_right ?? pluginData.input ?? 0,
                  outputLeft: pluginData.output_left ?? pluginData.output ?? 0,
                  outputRight: pluginData.output_right ?? pluginData.output ?? 0,
                  inputPeak: pluginData.input_peak ?? 0,
                  outputPeak: pluginData.output_peak ?? 0,
                });
              }
            }
          }
        }

        // Handle per-plugin spectrum updates
        if (message.type === 'plugin_spectrum') {
          const { uri, magnitudes } = message.data;
          if (pluginUris.includes(uri)) {
            updateMeterData(uri, { spectrum: magnitudes });
          }
        }

        // Handle CPU updates
        if (message.type === 'cpu' || message.type === 'plugin_cpu') {
          const data = message.data;
          if (data.plugins && Array.isArray(data.plugins)) {
            for (const pluginData of data.plugins) {
              if (pluginUris.includes(pluginData.uri)) {
                updateMeterData(pluginData.uri, {
                  cpuPercent: pluginData.cpu_percent,
                });
              }
            }
          }
        }
      } catch (error) {
        // Ignore parse errors for non-JSON messages
      }
    };

    websocket.addEventListener('message', handleMessage);
    return () => websocket.removeEventListener('message', handleMessage);
  }, [websocket, pluginUris, updateMeterData]);

  // Fetch spectrum data periodically for expanded plugins
  useEffect(() => {
    if (!fetchSpectrum || !includeSpectrum) return;

    // Clear existing intervals
    Object.values(spectrumIntervalRef.current).forEach(clearInterval);
    spectrumIntervalRef.current = {};

    // Set up intervals for expanded plugins
    const expandedUris = expandedPlugins
      ? pluginUris.filter((uri) => expandedPlugins.has(uri))
      : [];

    for (const uri of expandedUris) {
      const fetchAndUpdate = async () => {
        try {
          const spectrum = await fetchSpectrum(uri);
          updateMeterData(uri, { spectrum });
        } catch (error) {
          console.warn(`Failed to fetch spectrum for ${uri}:`, error);
        }
      };

      // Initial fetch
      fetchAndUpdate();

      // Set up interval (30fps for spectrum)
      spectrumIntervalRef.current[uri] = setInterval(fetchAndUpdate, 33);
    }

    return () => {
      Object.values(spectrumIntervalRef.current).forEach(clearInterval);
      spectrumIntervalRef.current = {};
    };
  }, [fetchSpectrum, includeSpectrum, pluginUris, expandedPlugins, updateMeterData]);

  return {
    meters,
    getMeterData,
    updateMeterData,
    clearMeters,
  };
}

export default usePluginMeters;
