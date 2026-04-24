import type { ReactNode } from 'react'
import './ContentKicker.css'

interface ContentKickerProps {
  kicker?: string
  title?: string
  subtitle?: string
  lead?: ReactNode
}

export function ContentKicker({ kicker, title, subtitle, lead }: ContentKickerProps) {
  const hasContent = Boolean(kicker) || Boolean(title) || Boolean(subtitle) || Boolean(lead)
  if (!hasContent) {
    return null
  }
  return (
    <header className="shell-kicker">
      {kicker ? <div className="shell-kicker__eyebrow">{kicker}</div> : null}
      {title ? <h1 className="shell-kicker__title">{title}</h1> : null}
      {subtitle ? <p className="shell-kicker__subtitle">{subtitle}</p> : null}
      {lead ? <div className="shell-kicker__lead">{lead}</div> : null}
    </header>
  )
}
