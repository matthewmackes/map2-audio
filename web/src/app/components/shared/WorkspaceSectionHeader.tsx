import type { ReactNode } from 'react'

import './WorkspaceSectionHeader.css'

type WorkspaceSectionHeaderProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  actions?: ReactNode
}

export function WorkspaceSectionHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: WorkspaceSectionHeaderProps) {
  return (
    <header className="workspace-section-header">
      <div className="workspace-section-header__copy">
        {eyebrow ? <span className="workspace-section-header__eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="workspace-section-header__actions">{actions}</div> : null}
    </header>
  )
}

export default WorkspaceSectionHeader
