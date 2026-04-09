import type { CSSProperties, ComponentType, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'

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

function renderLauncherItem(item: ShellNavigationRenderItem, onNavigate: () => void) {
  const Icon = item.icon

  return (
    <NavLink
      key={`nav-link-${item.route}`}
      to={item.route}
      end={item.route === '/'}
      role="menuitem"
      className={({ isActive }) => `start-menu-card start-menu-card--tile${item.featured ? ' start-menu-card--featured' : ''}${isActive ? ' is-active' : ''}`}
      style={{ '--item-color': item.color } as CSSProperties}
      title={`${item.description} • ${getLauncherCatalogMaturityLabel(item.maturity)}`}
      onClick={onNavigate}
      onMouseEnter={() => prefetchAppRoute(item.route)}
      onFocus={() => prefetchAppRoute(item.route)}
    >
      <span className="start-menu-card__icon-frame" aria-hidden="true">
        <span className="start-menu-card__icon start-menu-card__icon--tile">
          <Icon size={28} aria-hidden />
        </span>
      </span>
      <span className="start-menu-card__body">
        <span className="start-menu-card__label start-menu-card__label--tile">{item.label}</span>
        {item.maturity === 'hardware-blocked' ? (
          <span className="start-menu-card__meta">{getLauncherCatalogMaturityLabel(item.maturity)}</span>
        ) : null}
      </span>
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

  return <>{items.map((item) => renderLauncherItem(item, onNavigate))}</>
}
