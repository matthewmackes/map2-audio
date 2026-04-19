/**
 * Shared metering utilities for plugin cards
 * 
 * Standardizes meter calculations and level conversions across all plugins.
 */

/**
 * Convert dB value to normalized 0-1 range for visualization
 * @param db - Level in dB
 * @param minDb - Minimum dB (floor)
 * @param maxDb - Maximum dB (ceiling)
 * @returns Normalized value 0-1
 */
export const dbToNormalized = (db: number, minDb: number = -60, maxDb: number = 0): number => {
  return Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)))
}

/**
 * Calculate bar size (height or width) from dB level
 * @param db - Level in dB
 * @param maxSize - Maximum bar size in pixels
 * @param minDb - Minimum dB (floor)
 * @returns Bar size in pixels
 */
export const dbToBarSize = (db: number, maxSize: number, minDb: number = -60): number => {
  return Math.max(0, ((db - minDb) / Math.abs(minDb)) * maxSize)
}

/**
 * Calculate vertical bar position and height for SVG meter
 * @param db - Level in dB
 * @param containerHeight - Height of meter container
 * @param minDb - Minimum dB (floor)
 * @returns Object with y position and height
 */
export const dbToVerticalBar = (
  db: number,
  containerHeight: number,
  minDb: number = -60
): { y: number; height: number } => {
  const height = dbToBarSize(db, containerHeight, minDb)
  const y = containerHeight - height
  return { y, height }
}

/**
 * Check if level is clipping
 * @param level - Level in dB
 * @param threshold - Clipping threshold in dB (default: -0.1)
 * @returns True if clipping
 */
export const isClipping = (level: number, threshold: number = -0.1): boolean => {
  return level > threshold
}

/**
 * Get meter color based on level (green/yellow/red zones)
 * @param db - Level in dB
 * @param greenThreshold - Threshold for yellow zone (default: -12)
 * @param yellowThreshold - Threshold for red zone (default: -3)
 * @returns Color string
 */
export const getMeterColor = (
  db: number,
  greenThreshold: number = -12,
  yellowThreshold: number = -3
): string => {
  if (db > yellowThreshold) return '#ff4444'
  if (db > greenThreshold) return '#ffaa00'
  return '#44ff44'
}

/**
 * Convert linear amplitude (0-1) to dB
 * @param amplitude - Linear amplitude 0-1
 * @returns Level in dB
 */
export const amplitudeToDB = (amplitude: number): number => {
  if (amplitude <= 0) return -Infinity
  return 20 * Math.log10(amplitude)
}

/**
 * Convert dB to linear amplitude (0-1)
 * @param db - Level in dB
 * @returns Linear amplitude 0-1
 */
export const dbToAmplitude = (db: number): number => {
  return Math.pow(10, db / 20)
}

/**
 * Calculate stereo width from L/R levels
 * @param left - Left channel level (dB)
 * @param right - Right channel level (dB)
 * @returns Width metric 0-1 (0=mono, 1=wide stereo)
 */
export const calculateStereoWidth = (left: number, right: number): number => {
  const diff = Math.abs(left - right)
  return Math.min(1, diff / 20) // Normalize to 0-1
}

/**
 * Smooth meter movement with ballistics (attack/release)
 * @param current - Current meter value
 * @param target - Target meter value
 * @param attackCoeff - Attack coefficient (0-1, higher = faster)
 * @param releaseCoeff - Release coefficient (0-1, higher = faster)
 * @returns New smoothed value
 */
export const smoothMeter = (
  current: number,
  target: number,
  attackCoeff: number = 0.3,
  releaseCoeff: number = 0.1
): number => {
  if (target > current) {
    // Attack (fast rise)
    return current + (target - current) * attackCoeff
  } else {
    // Release (slow fall)
    return current + (target - current) * releaseCoeff
  }
}

/**
 * All metering utilities as a convenient object export
 */
export const meteringUtils = {
  dbToNormalized,
  dbToBarSize,
  dbToVerticalBar,
  isClipping,
  getMeterColor,
  amplitudeToDB,
  dbToAmplitude,
  calculateStereoWidth,
  smoothMeter,
}
