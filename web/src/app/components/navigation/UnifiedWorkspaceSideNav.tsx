import type { ComponentType, ReactNode } from 'react'
import { SideNav, SideNavItems, SideNavLink } from '@carbon/react'

import './UnifiedWorkspaceSideNav.css'

export interface UnifiedWorkspaceSideNavItem {
  key: string
  label: string
  description?: string
  to: string
  icon: ComponentType<any>
  active: boolean
  onOpen: () => void
  meta?: ReactNode
  labelDecor?: ReactNode
  action?: ReactNode
  variant?: 'default' | 'utility'
}

interface UnifiedWorkspaceSideNavProps {
  ariaLabel: string
  eyebrow: string
  title: string
  description: string
  items: UnifiedWorkspaceSideNavItem[]
  footerTitle?: string
  footerItems?: UnifiedWorkspaceSideNavItem[]
  footer?: ReactNode
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function UnifiedWorkspaceSideNav({
  ariaLabel,
  eyebrow,
  title,
  description,
  items,
  footerTitle,
  footerItems,
  footer,
  className,
}: UnifiedWorkspaceSideNavProps) {
  const renderItem = (item: UnifiedWorkspaceSideNavItem) => {
    const Icon = item.icon

    return (
      <article
        key={item.key}
        role="listitem"
        data-variant={item.variant ?? 'default'}
        className={joinClasses(
          'workspace-side-nav__item',
          item.active && 'is-selected',
          item.variant === 'utility' && 'is-utility',
        )}
      >
        <SideNavLink
          href={item.to}
          isActive={item.active}
          className="workspace-side-nav__item-main"
          aria-label={`Open ${item.label}`}
          onClick={(event) => {
            event.preventDefault()
            item.onOpen()
          }}
          renderIcon={Icon}
        >
          <span className="workspace-side-nav__item-copy">
            <span className="workspace-side-nav__item-row">
              <span className="workspace-side-nav__item-label-wrap">
                {item.labelDecor}
                <span className="workspace-side-nav__item-label">{item.label}</span>
              </span>
              {item.meta ? <span className="workspace-side-nav__item-meta">{item.meta}</span> : null}
            </span>
            {item.description ? (
              <span className="workspace-side-nav__item-desc">{item.description}</span>
            ) : null}
          </span>
        </SideNavLink>
        {item.action ? <div className="workspace-side-nav__item-action">{item.action}</div> : null}
      </article>
    )
  }

  return (
    <SideNav
      className={joinClasses('workspace-side-nav', className)}
      aria-label={ariaLabel}
      expanded
      isFixedNav={false}
      isChildOfHeader={false}
    >
      <div className="workspace-side-nav__head">
        <p className="workspace-side-nav__eyebrow">{eyebrow}</p>
        <h2 className="workspace-side-nav__title">{title}</h2>
        <p className="workspace-side-nav__copy">{description}</p>
      </div>

      <SideNavItems className="workspace-side-nav__nav">
        <div className="workspace-side-nav__list" role="list">
          {items.map(renderItem)}
        </div>

        {footerItems?.length || footer ? (
          <div className="workspace-side-nav__footer">
            {footerTitle ? <p className="workspace-side-nav__section-label">{footerTitle}</p> : null}
            {footerItems?.map(renderItem)}
            {footer}
          </div>
        ) : null}
      </SideNavItems>
    </SideNav>
  )
}

export default UnifiedWorkspaceSideNav
