import type { ReactNode } from 'react'
import { MAP2_PLATFORM_META, MAP2_PRIMARY_LABEL, Map2BrandMark } from './branding/map2Branding'
import { ShellWindowTitleStrip } from './shared/ShellWindowTitleStrip'
import './PageHeader.css'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  logo?: {
    url: string
    alt: string
    title?: string
  }
  icon?: ReactNode
}

export function PageHeader({ title, subtitle, actions, logo, icon }: Props) {
  return (
    <>
      <ShellWindowTitleStrip />
      <div className="page-header">
        <div className="page-header__main">
          {logo && (
            <img
              src={logo.url}
              alt={logo.alt}
              title={logo.title}
              className="page-header__logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
          {icon && (
            <div className="page-header__icon">
              {icon}
            </div>
          )}
          <div className="page-header__copy">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        <div className="page-header__aside">
          {actions ? <div className="page-header__actions flex">{actions}</div> : null}
          {!logo ? (
            <div className="page-header__brand" aria-hidden="true">
              <span className="page-header__brand-mark-wrap">
                <Map2BrandMark className="page-header__brand-mark" />
              </span>
              <span className="page-header__brand-copy-block">
                <span className="page-header__brand-primary">{MAP2_PRIMARY_LABEL}</span>
                <span className="page-header__brand-secondary">{MAP2_PLATFORM_META}</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
