import type { ComponentType, CSSProperties } from 'react'
import { Close } from '@carbon/icons-react'
import './WindowTitleStrip.css'

interface WindowTitleStripProps {
  title: string
  titleIcon: ComponentType<{ width?: number; height?: number; className?: string }>
  routeHint: string
  accentColor?: string
  closeLabel?: string
  onClose: () => void
}

export function WindowTitleStrip({
  title,
  titleIcon: TitleIcon,
  routeHint,
  accentColor,
  closeLabel,
  onClose,
}: WindowTitleStripProps) {
  return (
    <div
      className="window-title-strip"
      style={accentColor ? { '--window-shell-accent': accentColor } as CSSProperties : undefined}
    >
      <div className="window-title-strip__lead">
        <span className="window-title-strip__badge" aria-hidden="true">
          <TitleIcon width={16} height={16} className="window-title-strip__icon" />
        </span>
        <div className="window-title-strip__copy">
          <span className="window-title-strip__eyebrow">Program object</span>
          <div className="window-title-strip__title-row">
            <strong className="window-title-strip__title">{title}</strong>
            <span className="window-title-strip__meta">{routeHint}</span>
          </div>
        </div>
      </div>
      <div className="window-title-strip__controls">
        <button
          type="button"
          className="window-title-strip__close"
          aria-label={closeLabel ?? `Close ${title}`}
          onClick={onClose}
        >
          <Close size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
