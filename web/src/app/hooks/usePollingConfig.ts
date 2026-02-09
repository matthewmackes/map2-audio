/**
 * Centralized polling configuration for all TUI services
 * 
 * All polling intervals set to 7000ms (7 seconds) to ensure:
 * - Non-disruptive audio stream monitoring
 * - Consistent system-wide refresh rates
 * - Balanced between responsiveness and resource efficiency
 */

export const POLLING_CONFIG = {
  // Core polling interval (7 seconds)
  DEFAULT: 7000,
  
  // Service-specific intervals (all normalized to 7s)
  AUDIO_STATUS: 7000,
  AUDIO_HEALTH: 7000,
  AUDIO_LATENCY: 7000,
  AUDIO_XRUNS: 7000,
  AUDIO_JUCE_METRICS: 7000,
  
  DRUM_STATE: 7000,
  
  CLUSTER_STATUS: 7000,
  DEPLOYMENT_MODE: 7000,
  
  LCD_STATUS: 7000,
  LCD_SIMULATION: 7000,
  LCD_ALERTS: 7000,
  
  // Cache stale time (5 seconds - allows some local caching)
  STALE_TIME: 5000,
  
  // Retry behavior
  RETRY_COUNT: 1,
}

/**
 * Query options factory for consistent polling configuration
 */
export const createPollingOptions = (interval: number = POLLING_CONFIG.DEFAULT) => ({
  refetchInterval: interval,
  staleTime: POLLING_CONFIG.STALE_TIME,
  retry: POLLING_CONFIG.RETRY_COUNT,
})

/**
 * Conditional polling based on enable/disable flag
 */
export const createConditionalPollingOptions = (
  enabled: boolean,
  interval: number = POLLING_CONFIG.DEFAULT
) => ({
  refetchInterval: enabled ? interval : false,
  staleTime: POLLING_CONFIG.STALE_TIME,
  retry: POLLING_CONFIG.RETRY_COUNT,
})
