import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'
import './EmptyState.css'

type EmptyStateAlign = 'left' | 'center'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  compact?: boolean
  align?: EmptyStateAlign
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function EmptyState({
  title,
  description,
  icon,
  actions,
  className,
  compact = false,
  align = 'center',
}: EmptyStateProps) {
  return (
    <Tile
      className={joinClasses(
        'app-empty-state',
        align === 'center' && 'app-empty-state--centered',
        compact && 'app-empty-state--compact',
        className,
      )}
    >
      {icon ? <div className="app-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="app-empty-state__copy">
        <div className="app-empty-state__title">{title}</div>
        {description ? <div className="app-empty-state__description">{description}</div> : null}
      </div>
      {actions ? <div className="app-empty-state__actions">{actions}</div> : null}
    </Tile>
  )
}
