// PageHeader — page-level (h1) header for workspace pages.
//
// Unlike WorkspaceSectionHeader (which is also h1 but is the only "section"
// title on its surface), PageHeader is intended for pages that may have
// multiple sections beneath. The PageHeader establishes the page identity
// and lives at the top of the page body, below the global shell chrome.
//
// Slots:
//   - eyebrow (optional)  — uppercase context label, IBM Plex Mono small
//   - title               — h1
//   - subtitle (optional) — single explanatory line
//   - actions (optional)  — right-aligned action buttons / chips

import type { ReactNode } from 'react'
import './PageHeader.css'

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={joinClasses('map2-page-header', className)}>
      <div className="map2-page-header__copy">
        {eyebrow ? <span className="map2-page-header__eyebrow">{eyebrow}</span> : null}
        <h1 className="map2-page-header__title">{title}</h1>
        {subtitle ? <p className="map2-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="map2-page-header__actions">{actions}</div> : null}
    </header>
  )
}

export default PageHeader
