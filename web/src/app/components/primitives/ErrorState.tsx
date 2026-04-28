// ErrorState — sibling of EmptyState for "the operation failed" surfaces.
// Renders inside a Carbon Tile with an explicit error tone. Use when a
// query/mutation fails and the user needs context plus a retry path.

import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'
import { ErrorFilled } from '@carbon/icons-react'

import './ErrorState.css'

interface ErrorStateProps {
  title: string
  description?: ReactNode
  /** Optional action — typically a "Retry" button. */
  actions?: ReactNode
  /** Optional error detail line — shown in monospace as a diagnostic. */
  detail?: string
  className?: string
  compact?: boolean
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function ErrorState({
  title,
  description,
  actions,
  detail,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <Tile
      className={joinClasses(
        'map2-error-state',
        compact && 'map2-error-state--compact',
        className,
      )}
    >
      <div className="map2-error-state__icon" aria-hidden="true">
        <ErrorFilled />
      </div>
      <div className="map2-error-state__copy">
        <div className="map2-error-state__title">{title}</div>
        {description ? <div className="map2-error-state__description">{description}</div> : null}
        {detail ? <pre className="map2-error-state__detail">{detail}</pre> : null}
      </div>
      {actions ? <div className="map2-error-state__actions">{actions}</div> : null}
    </Tile>
  )
}

export default ErrorState
