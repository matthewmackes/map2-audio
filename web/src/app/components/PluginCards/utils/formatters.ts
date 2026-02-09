/**
 * Shared formatting utilities for plugin cards
 * 
 * Centralizes all display formatting logic to ensure consistency
 * across all plugin interfaces and reduce code duplication.
 */

/**
 * Format frequency value for display
 * @param hz - Frequency in Hz
 * @returns Formatted string (e.g., "440", "1.2k", "12k")
 */
export const formatFrequency = (hz: number): string => {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return hz.toFixed(0)
}

/**
 * Format pitch shift value in cents
 * @param cents - Pitch shift in cents
 * @returns Formatted string (e.g., "0", "+12st", "-50c")
 */
export const formatPitch = (cents: number): string => {
  if (cents === 0) return '0'
  const sign = cents > 0 ? '+' : ''
  if (Math.abs(cents) >= 1200) {
    const semitones = cents / 100
    return `${sign}${semitones.toFixed(0)}st`
  }
  return `${sign}${cents.toFixed(0)}c`
}

/**
 * Format semitone interval with musical notation
 * @param semitones - Interval in semitones
 * @returns Formatted string (e.g., "Uni", "3rd", "Oct", "+5st")
 */
export const formatSemitones = (semitones: number): string => {
  const intervals: Record<number, string> = {
    '-24': '-2Oct',
    '-12': '-Oct',
    '-7': '-5th',
    '-5': '-4th',
    '-4': '-3rd',
    '-3': '-m3',
    '0': 'Uni',
    '3': 'm3',
    '4': '3rd',
    '5': '4th',
    '7': '5th',
    '8': 'm6',
    '9': '6th',
    '12': 'Oct',
    '24': '+2Oct',
  }
  return intervals[String(semitones)] || ((semitones > 0 ? '+' : '') + semitones + 'st')
}

/**
 * Format interval for display
 * @param semitones - Interval in semitones
 * @returns Formatted string with musical interval names
 */
export const formatInterval = (semitones: number): string => {
  return formatSemitones(semitones)
}

/**
 * Format decay time in seconds
 * @param seconds - Decay time in seconds
 * @returns Formatted string (e.g., "1.5s", "12s")
 */
export const formatDecay = (seconds: number): string => {
  if (seconds >= 10) return `${seconds.toFixed(0)}s`
  return `${seconds.toFixed(1)}s`
}

/**
 * Format delay time in milliseconds
 * @param ms - Delay time in milliseconds
 * @returns Formatted string (e.g., "25ms", "1.23s")
 */
export const formatDelay = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 100) return `${ms.toFixed(0)}ms`
  return `${ms.toFixed(1)}ms`
}

/**
 * Format decibel value
 * @param value - Value in dB
 * @param precision - Decimal places (default: 1)
 * @returns Formatted string (e.g., "+3.5dB", "-12.0dB")
 */
export const formatDb = (value: number, precision: number = 1): string => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(precision)}dB`
}

/**
 * Format percentage value
 * @param value - Value 0-1 or 0-100
 * @param normalized - If true, expects 0-1 range (default: false)
 * @returns Formatted string (e.g., "50%", "100%")
 */
export const formatPercentage = (value: number, normalized: boolean = false): string => {
  const percent = normalized ? value * 100 : value
  return `${Math.round(percent)}%`
}

/**
 * Format pan position
 * @param value - Pan value -100 to +100 or -1 to +1
 * @param normalized - If true, expects -1 to +1 range (default: false)
 * @returns Formatted string (e.g., "L50", "C", "R75")
 */
export const formatPan = (value: number, normalized: boolean = false): string => {
  const panValue = normalized ? value * 100 : value
  if (Math.abs(panValue) < 5) return 'C'
  if (panValue < 0) return `L${Math.abs(Math.round(panValue))}`
  return `R${Math.round(panValue)}`
}

/**
 * Format tempo/rate in Hz or BPM
 * @param hz - Rate in Hz
 * @param showBpm - Also show BPM equivalent (default: false)
 * @returns Formatted string (e.g., "2.5Hz", "120BPM (2Hz)")
 */
export const formatRate = (hz: number, showBpm: boolean = false): string => {
  if (showBpm) {
    const bpm = hz * 60
    return `${bpm.toFixed(0)}BPM (${hz.toFixed(2)}Hz)`
  }
  return `${hz.toFixed(2)}Hz`
}

/**
 * Format quality/Q factor
 * @param q - Q value
 * @returns Formatted string
 */
export const formatQ = (q: number): string => {
  return q.toFixed(2)
}

/**
 * Format ratio (e.g., for compression)
 * @param ratio - Ratio value
 * @returns Formatted string (e.g., "4:1", "∞:1")
 */
export const formatRatio = (ratio: number): string => {
  if (ratio >= 100) return '∞:1'
  return `${ratio.toFixed(1)}:1`
}

/**
 * Format time in ms or seconds based on magnitude
 * @param ms - Time in milliseconds
 * @returns Formatted string
 */
export const formatTime = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${ms.toFixed(0)}ms`
}

/**
 * All formatters as a convenient object export
 */
export const formatters = {
  frequency: formatFrequency,
  pitch: formatPitch,
  semitones: formatSemitones,
  interval: formatInterval,
  decay: formatDecay,
  delay: formatDelay,
  db: formatDb,
  percentage: formatPercentage,
  pan: formatPan,
  rate: formatRate,
  q: formatQ,
  ratio: formatRatio,
  time: formatTime,
}
