import { NavLink } from 'react-router-dom'

import type { WorkspaceHubNavSection } from './WorkspaceHubContext'
import './WorkspaceHubNav.css'

interface WorkspaceHubNavProps {
  sections: WorkspaceHubNavSection[]
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function WorkspaceHubNav({ sections, className }: WorkspaceHubNavProps) {
  return (
    <nav className={joinClasses('workspace-hub-nav', className)} aria-label="Workspace hub navigation">
      <div>
        <p className="workspace-hub-nav__eyebrow">Workspace Hub</p>
        <h1 className="workspace-hub-nav__title">Unified Workspaces</h1>
        <p className="workspace-hub-nav__copy">
          Flat scaffold for the upcoming consolidated workspace shell. Section bodies migrate in later slices.
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.key} className="workspace-hub-nav__section">
          <div className="workspace-hub-nav__divider" aria-hidden="true">{section.label}</div>
          {section.items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => joinClasses('workspace-hub-nav__link', isActive && 'workspace-hub-nav__link--active')}
              end
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export default WorkspaceHubNav
