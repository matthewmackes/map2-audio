// AvbStatusChip — renders the AVB stream status (locked/unlocked/grandmaster).
// Maps to MAP semantic AVB tokens from B1:
//   'locked'      → green-40 (stream locked to grandmaster)
//   'unlocked'    → red-50   (no PTP lock or stream broken)
//   'grandmaster' → blue-50  (this node is the grandmaster)
//   'unknown'     → gray-60  (no telemetry / AVB disabled)

import { StatusChip, type StatusChipSize } from './StatusChip'

export type AvbStatus = 'locked' | 'unlocked' | 'grandmaster' | 'unknown'

interface AvbStatusChipProps {
  status: AvbStatus
  size?: StatusChipSize
  /** Optional stream count or other short value (e.g., "8 streams"). */
  value?: string
  className?: string
}

function toneForAvbStatus(status: AvbStatus) {
  switch (status) {
    case 'locked':
      return 'ok' as const
    case 'unlocked':
      return 'critical' as const
    case 'grandmaster':
      return 'info' as const
    case 'unknown':
    default:
      return 'offline' as const
  }
}

function labelForAvbStatus(status: AvbStatus): string {
  switch (status) {
    case 'locked':
      return 'AVB LOCKED'
    case 'unlocked':
      return 'AVB UNLOCKED'
    case 'grandmaster':
      return 'AVB GM'
    case 'unknown':
    default:
      return 'AVB —'
  }
}

export function AvbStatusChip({ status, size = 'sm', value, className }: AvbStatusChipProps) {
  return (
    <StatusChip
      tone={toneForAvbStatus(status)}
      label={labelForAvbStatus(status)}
      value={value}
      size={size}
      dot
      className={className}
    />
  )
}

export default AvbStatusChip
