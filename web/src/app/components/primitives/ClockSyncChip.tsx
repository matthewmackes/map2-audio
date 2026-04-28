// ClockSyncChip — renders the audio clock domain status.
// Maps to MAP semantic clock tokens from B1:
//   'master'   → blue-50  (this node is the clock master)
//   'slave'    → blue-40  (this node follows another)
//   'locked'   → green-40 (sync acquired and stable)
//   'unlocked' → red-50   (sync lost)
//   'unknown'  → gray-60  (no telemetry)

import { StatusChip, type StatusChipSize } from './StatusChip'

export type ClockSyncState = 'master' | 'slave' | 'locked' | 'unlocked' | 'unknown'

interface ClockSyncChipProps {
  state: ClockSyncState
  size?: StatusChipSize
  /** Optional sample rate value to display (e.g., "48k"). */
  sampleRateHz?: number | null
  className?: string
}

function toneForClockState(state: ClockSyncState) {
  switch (state) {
    case 'master':
      return 'info' as const
    case 'slave':
      return 'info' as const
    case 'locked':
      return 'ok' as const
    case 'unlocked':
      return 'critical' as const
    case 'unknown':
    default:
      return 'offline' as const
  }
}

function labelForClockState(state: ClockSyncState): string {
  switch (state) {
    case 'master':
      return 'CLK MASTER'
    case 'slave':
      return 'CLK SLAVE'
    case 'locked':
      return 'CLK LOCKED'
    case 'unlocked':
      return 'CLK UNLOCKED'
    case 'unknown':
    default:
      return 'CLK —'
  }
}

function formatSampleRate(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k`
  return `${hz}`
}

export function ClockSyncChip({
  state,
  size = 'sm',
  sampleRateHz,
  className,
}: ClockSyncChipProps) {
  const tone = toneForClockState(state)
  const label = labelForClockState(state)
  const value =
    sampleRateHz !== null && sampleRateHz !== undefined && Number.isFinite(sampleRateHz)
      ? formatSampleRate(sampleRateHz)
      : undefined
  return <StatusChip tone={tone} label={label} value={value} size={size} dot className={className} />
}

export default ClockSyncChip
