import { NavLink, useLocation } from 'react-router-dom'

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
  const location = useLocation()

  return (
    <nav className={joinClasses('workspace-hub-nav', className)} aria-label="Workspace hub navigation">
      <div>
        <p className="workspace-hub-nav__eyebrow">Workspace hub</p>
        <h1 className="workspace-hub-nav__title">Workspace areas</h1>
      </div>

      {sections.map((section) => (
        <div key={section.key} className="workspace-hub-nav__section">
          <div className="workspace-hub-nav__divider" aria-hidden="true">{section.label}</div>
          {section.items.map((item) => (
            (() => {
              const isActive = item.match ? item.match(location) : false

              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive: navLinkIsActive }) =>
                    joinClasses('workspace-hub-nav__link', (isActive || navLinkIsActive) && 'workspace-hub-nav__link--active')}
                  end
                >
                  {item.label}
                </NavLink>
              )
            })()
          ))}
        </div>
      ))}
    </nav>
  )
}

export default WorkspaceHubNav
