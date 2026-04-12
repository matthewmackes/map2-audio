import type { ComponentType, ReactNode } from 'react'
import { Layer, SideNav, SideNavItems, SideNavLink } from '@carbon/react'

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

export interface UnifiedWorkspaceSideNavMetaBlock {
  key: string
  label: string
  value: ReactNode
}

export interface UnifiedWorkspaceSideNavCallout {
  kind?: 'info' | 'warning'
  text: ReactNode
}

interface UnifiedWorkspaceSideNavProps {
  ariaLabel: string
  eyebrow: string
  title: string
  description: string
  items: UnifiedWorkspaceSideNavItem[]
  footerTitle?: string
  footerItems?: UnifiedWorkspaceSideNavItem[]
  metaBlocks?: UnifiedWorkspaceSideNavMetaBlock[]
  callout?: UnifiedWorkspaceSideNavCallout
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
  metaBlocks,
  callout,
  className,
}: UnifiedWorkspaceSideNavProps) {
  const renderItem = (item: UnifiedWorkspaceSideNavItem) => {
    const Icon = item.icon

    return (
      <Layer key={item.key} className="workspace-side-nav__item-layer">
        <article
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
      </Layer>
    )
  }

  return (
    <Layer className="workspace-side-nav__layer">
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

          {footerItems?.length || metaBlocks?.length || callout ? (
            <div className="workspace-side-nav__footer">
              {footerTitle ? <p className="workspace-side-nav__section-label">{footerTitle}</p> : null}
              {footerItems?.map(renderItem)}
              {metaBlocks?.length ? (
                <div className="workspace-side-nav__meta-grid" aria-label="Workspace side panel status">
                  {metaBlocks.map((block) => (
                    <article key={block.key} className="workspace-side-nav__meta-block">
                      <p className="workspace-side-nav__meta-label">{block.label}</p>
                      <div className="workspace-side-nav__meta-value">{block.value}</div>
                    </article>
                  ))}
                </div>
              ) : null}
              {callout ? (
                <div
                  className={joinClasses(
                    'workspace-side-nav__callout',
                    callout.kind === 'warning' && 'is-warning',
                  )}
                >
                  <p className="workspace-side-nav__callout-copy">{callout.text}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </SideNavItems>
      </SideNav>
    </Layer>
  )
}

export default UnifiedWorkspaceSideNav
