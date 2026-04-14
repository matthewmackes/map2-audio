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
  homeGroup?: string
  icon: ComponentType<{ size?: number; ariaHidden?: boolean } | SVGProps<SVGSVGElement>>
  description: string
  color: string
  maturity: NavigationMaturityState
}

type NavigationItemsProps = {
  items: ShellNavigationRenderItem[]
  onNavigate: () => void
  variant: 'launcher' | 'topbar' | 'mobile'
}

function renderLauncherStripItem(item: ShellNavigationRenderItem, onNavigate: () => void) {
  const Icon = item.icon
  const isBlocked = item.maturity === 'hardware-blocked'

  return (
    <NavLink
      key={`nav-strip-${item.route}-${item.label}`}
      to={item.route}
      end={item.route === '/'}
      role="menuitem"
      className={({ isActive }) =>
        `start-menu-strip-item${isBlocked ? ' start-menu-strip-item--blocked' : ''}${isActive ? ' is-active' : ''}`
      }
      style={{ '--item-color': item.color } as CSSProperties}
      title={`${item.description} • ${getLauncherCatalogMaturityLabel(item.maturity)}`}
      onClick={onNavigate}
      onMouseEnter={() => prefetchAppRoute(item.route)}
      onFocus={() => prefetchAppRoute(item.route)}
    >
      <span className="start-menu-strip-item__icon" aria-hidden="true">
        <Icon size={16} aria-hidden />
      </span>
      <span className="start-menu-strip-item__body">
        <span className="start-menu-strip-item__label">{item.label}</span>
        <span className="start-menu-strip-item__desc">{item.description}</span>
      </span>
      {isBlocked ? (
        <span className="start-menu-strip-item__status">
          {getLauncherCatalogMaturityLabel(item.maturity)}
        </span>
      ) : null}
      <ArrowRight size={14} className="start-menu-strip-item__arrow" aria-hidden />
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

  return (
    <div className="shell-launcher__nav-strip" aria-label="Start menu items">
      {items.map((item) => renderLauncherStripItem(item, onNavigate))}
    </div>
  )
}
