// ModuleCard — denser variant of ControlPanel with a single title row.
// Use for plugin tiles, device tiles, or any "module" representation in
// a grid. Optional bypass / armed indicator via `state` prop.

import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'

import { StatusChip, type StatusChipTone } from './StatusChip'
import './ModuleCard.css'

interface ModuleCardProps {
  title: ReactNode
  /** Optional uppercase eyebrow above the title. */
  eyebrow?: string
  /** Optional status tone — renders a StatusChip in the top-right. */
  state?: { tone: StatusChipTone; label: string }
  children?: ReactNode
  /** Optional footer slot (often holds bypass toggle or open button). */
  footer?: ReactNode
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function ModuleCard({
  title,
  eyebrow,
  state,
  children,
  footer,
  className,
}: ModuleCardProps) {
  return (
    <Tile className={joinClasses('map2-module-card', className)}>
      <div className="map2-module-card__head">
        <div className="map2-module-card__head-copy">
          {eyebrow ? <span className="map2-module-card__eyebrow">{eyebrow}</span> : null}
          <div className="map2-module-card__title">{title}</div>
        </div>
        {state ? <StatusChip tone={state.tone} label={state.label} size="sm" /> : null}
      </div>
      {children ? <div className="map2-module-card__body">{children}</div> : null}
      {footer ? <div className="map2-module-card__footer">{footer}</div> : null}
    </Tile>
  )
}

export default ModuleCard
