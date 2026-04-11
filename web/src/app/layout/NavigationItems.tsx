import type { CSSProperties, ComponentType, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import { ArrowRight } from '@carbon/icons-react'

import type { NavigationMaturityState } from '../data/advancedMenuItems'
import { getLauncherCatalogMaturityLabel } from '../data/launcherCatalog'
import { prefetchAppRoute } from '../routePrefetch'

export type ShellNavigationRenderItem = {
  route: string
  label: string
  shortLabel: string
  icon: ComponentType<{ size?: number; ariaHidden?: boolean } | SVGProps<SVGSVGElement>>
  description: string
  color: string
  maturity: NavigationMaturityState
  featured?: boolean
}

type NavigationItemsProps = {
  items: ShellNavigationRenderItem[]
  onNavigate: () => void
  variant: 'launcher' | 'topbar' | 'mobile'
}

function renderLauncherHeroItem(item: ShellNavigationRenderItem, onNavigate: () => void) {
  const Icon = item.icon

  return (
    <NavLink
      key={`nav-hero-${item.route}`}
      to={item.route}
      end={item.route === '/'}
      role="menuitem"
      className={({ isActive }) => `start-menu-hero-card${isActive ? ' is-active' : ''}`}
      style={{ '--item-color': item.color } as CSSProperties}
      title={`${item.description} • ${getLauncherCatalogMaturityLabel(item.maturity)}`}
      onClick={onNavigate}
      onMouseEnter={() => prefetchAppRoute(item.route)}
      onFocus={() => prefetchAppRoute(item.route)}
    >
      <span className="start-menu-hero-card__icon-wrap" aria-hidden="true">
        <Icon size={20} aria-hidden />
      </span>
      <span className="start-menu-hero-card__body">
        <span className="start-menu-hero-card__label">{item.label}</span>
        {item.description ? (
          <span className="start-menu-hero-card__desc">{item.description}</span>
        ) : null}
      </span>
      <ArrowRight size={16} className="start-menu-hero-card__arrow" aria-hidden />
    </NavLink>
  )
}

function renderLauncherCompactItem(item: ShellNavigationRenderItem, onNavigate: () => void) {
  const Icon = item.icon
  const isBlocked = item.maturity === 'hardware-blocked'

  return (
    <NavLink
      key={`nav-compact-${item.route}`}
      to={item.route}
      end={item.route === '/'}
      role="menuitem"
      className={({ isActive }) =>
        `start-menu-compact-card${isBlocked ? ' start-menu-compact-card--blocked' : ''}${isActive ? ' is-active' : ''}`
      }
      style={{ '--item-color': item.color } as CSSProperties}
      title={`${item.description} • ${getLauncherCatalogMaturityLabel(item.maturity)}`}
      onClick={onNavigate}
      onMouseEnter={() => prefetchAppRoute(item.route)}
      onFocus={() => prefetchAppRoute(item.route)}
    >
      <span className="start-menu-compact-card__icon" aria-hidden="true">
        <Icon size={16} aria-hidden />
      </span>
      <span className="start-menu-compact-card__label">{item.label}</span>
      {isBlocked ? (
        <span className="start-menu-compact-card__status">
          {getLauncherCatalogMaturityLabel(item.maturity)}
        </span>
      ) : null}
    </NavLink>
  )
}

export function NavigationItems({
  items,
  onNavigate,
  variant,
}: NavigationItemsProps) {
  if (variant !== 'launcher') {
    return null
  }

  const heroItems = items.filter((item) => item.featured)
  const compactItems = items.filter((item) => !item.featured)

  return (
    <div className="shell-launcher__nav-v5">
      {heroItems.length > 0 ? (
        <section className="shell-launcher__hero-section" aria-label="Pinned workspaces">
          <span className="shell-launcher__section-label" aria-hidden="true">Pinned</span>
          <div className="shell-launcher__hero-grid">
            {heroItems.map((item) => renderLauncherHeroItem(item, onNavigate))}
          </div>
        </section>
      ) : null}
      {compactItems.length > 0 ? (
        <section className="shell-launcher__compact-section" aria-label="All workspaces">
          <span className="shell-launcher__section-label" aria-hidden="true">All Workspaces</span>
          <div className="shell-launcher__compact-grid">
            {compactItems.map((item) => renderLauncherCompactItem(item, onNavigate))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
