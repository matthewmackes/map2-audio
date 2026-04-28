// StagedChangesIndicator — small status chip showing "N staged changes".
// Display-only sibling of CommitPrompt for surfaces where the apply/
// discard buttons live elsewhere (e.g., a header summary that links to
// the editor where the actual commit happens).

import { StatusChip, type StatusChipSize } from './StatusChip'

interface StagedChangesIndicatorProps {
  count: number
  size?: StatusChipSize
  /** Optional override for the label (default "STAGED"). */
  label?: string
  className?: string
}

export function StagedChangesIndicator({
  count,
  size = 'sm',
  label = 'STAGED',
  className,
}: StagedChangesIndicatorProps) {
  if (count <= 0) return null
  return (
    <StatusChip
      tone="staged"
      label={label}
      value={String(count)}
      size={size}
      dot
      className={className}
      title={`${count} staged change${count === 1 ? '' : 's'} not yet applied to live`}
    />
  )
}

export default StagedChangesIndicator
