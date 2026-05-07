import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Search as CarbonSearch } from '@carbon/react'

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
  const [filterValue, setFilterValue] = useState('')
  const normalizedFilter = filterValue.trim().toLocaleLowerCase()
  const filteredSections = useMemo(
    () => sections
      .map((section) => {
        if (!normalizedFilter) {
          return section
        }

        const sectionMatch = section.label.toLocaleLowerCase().includes(normalizedFilter)
        const items = sectionMatch
          ? section.items
          : section.items.filter((item) => item.label.toLocaleLowerCase().includes(normalizedFilter))

        return { ...section, items }
      })
      .filter((section) => section.items.length > 0),
    [normalizedFilter, sections],
  )

  return (
    <nav className={joinClasses('workspace-hub-nav', className)} aria-label="Workspace hub navigation">
      <div>
        <p className="workspace-hub-nav__eyebrow">Workspace hub</p>
        <h1 className="workspace-hub-nav__title">Workspace areas</h1>
      </div>

      <div className="workspace-hub-nav__filter">
        <CarbonSearch
          id="workspace-hub-nav-filter"
          labelText="Filter workspace areas"
          size="sm"
          value={filterValue}
          onChange={(event) => setFilterValue(event.target.value)}
          placeholder="Search sections and pages"
        />
      </div>

      {filteredSections.map((section) => (
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

      {filteredSections.length === 0 ? (
        <p className="workspace-hub-nav__empty">No workspace areas match that filter.</p>
      ) : null}
    </nav>
  )
}

export default WorkspaceHubNav
