// SectionHeader — section-level (h2) header for grouping content within
// a page. Use PageHeader for the top-of-page identity; SectionHeader for
// inner sections.
//
// This is intentionally distinct from the existing WorkspaceSectionHeader
// (which renders an h1 and behaves like PageHeader). New code should use
// SectionHeader for h2 sections inside a page; existing call sites of
// WorkspaceSectionHeader keep working unchanged and migrate at the
// per-workspace bundle (B5–B11) cadence.

import type { ReactNode } from 'react'
import './SectionHeader.css'

interface SectionHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <header className={joinClasses('map2-section-header', className)}>
      <div className="map2-section-header__copy">
        <h2 className="map2-section-header__title">{title}</h2>
        {description ? <p className="map2-section-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="map2-section-header__actions">{actions}</div> : null}
    </header>
  )
}

export default SectionHeader
