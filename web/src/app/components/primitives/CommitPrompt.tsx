// CommitPrompt — canonical "uncommitted changes — apply or discard"
// affordance. Surfaces wherever an operator has edited config that
// is not yet committed to authority. Pairs with StagedChangesIndicator
// (which shows the chip; CommitPrompt is the full apply/discard control).
//
// Per Q8=C — every page that allows editing live-affecting config must
// surface this primitive when there are pending edits, so operators
// always know whether they are looking at the live or staged view.

import { ActionButton } from './ActionButton'
import { StatusChip } from './StatusChip'
import './CommitPrompt.css'

interface CommitPromptProps {
  /** Number of pending changes. Renders as "N change(s) pending". */
  pendingCount: number
  /** Optional human description (e.g., "in 3 chains"). */
  description?: string
  onApply: () => void
  onDiscard?: () => void
  /** Disabled when an apply is mid-flight. */
  busy?: boolean
  applyLabel?: string
  discardLabel?: string
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function CommitPrompt({
  pendingCount,
  description,
  onApply,
  onDiscard,
  busy = false,
  applyLabel = 'Apply',
  discardLabel = 'Discard',
  className,
}: CommitPromptProps) {
  if (pendingCount <= 0) return null
  const noun = pendingCount === 1 ? 'change' : 'changes'
  return (
    <div
      className={joinClasses('map2-commit-prompt', className)}
      role="status"
      aria-live="polite"
    >
      <StatusChip
        tone="uncommitted"
        label="UNCOMMITTED"
        value={`${pendingCount} ${noun}`}
        size="sm"
        dot
      />
      {description ? (
        <span className="map2-commit-prompt__description">{description}</span>
      ) : null}
      <div className="map2-commit-prompt__actions">
        {onDiscard ? (
          <ActionButton
            intent="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={busy}
          >
            {discardLabel}
          </ActionButton>
        ) : null}
        <ActionButton
          intent="primary"
          size="sm"
          onClick={onApply}
          disabled={busy}
        >
          {applyLabel}
        </ActionButton>
      </div>
    </div>
  )
}

export default CommitPrompt
