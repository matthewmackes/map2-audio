import type { ReactNode } from 'react'

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
    <div className="page-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {logo && (
          <img
            src={logo.url}
            alt={logo.alt}
            title={logo.title}
            style={{
              height: '48px',
              width: 'auto',
              objectFit: 'contain',
              flexShrink: 0,
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        {icon && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {icon}
          </div>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex">{actions}</div> : null}
    </div>
  )
}
