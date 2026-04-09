import type { CSSProperties, ReactNode } from 'react'

import { PageTransition } from '../components/PageTransition'

type AppWindowProps = {
  accentColor: string
  ariaLabel: string
  closeLabel: string
  closing: boolean
  routeHint: string
  showPerformFullscreen: boolean
  title: string
  titleIcon: React.ComponentType<{ width?: number; height?: number; className?: string }>
  onClose: () => void
  children: ReactNode
}

export function AppWindow({
  accentColor,
  ariaLabel,
  closeLabel,
  closing,
  routeHint,
  showPerformFullscreen,
  title,
  titleIcon: TitleIcon,
  onClose,
  children,
}: AppWindowProps) {
  return (
    <section
      className={`app-window${closing ? ' is-closing' : ' is-open'}`}
      aria-label={ariaLabel}
      style={{ '--window-shell-accent': accentColor } as CSSProperties}
    >
      {!showPerformFullscreen ? (
        <div className="window-titlebar">
          <div className="window-titlebar__lead">
            <span className="window-titlebar__badge" aria-hidden="true">
              <TitleIcon width={16} height={16} className="window-titlebar__icon" />
            </span>
            <div className="window-titlebar__copy">
              <span className="window-titlebar__eyebrow">Program object</span>
              <div className="window-titlebar__title-row">
                <strong className="window-titlebar__title">{title}</strong>
                <span className="window-titlebar__meta">{routeHint}</span>
              </div>
            </div>
          </div>
          <div className="app-window__controls">
            <button
              type="button"
              className="app-window__close"
              aria-label={closeLabel}
              onClick={onClose}
            >
              X
            </button>
          </div>
        </div>
      ) : null}
      <div className="app-window__body">
        <PageTransition>{children}</PageTransition>
      </div>
    </section>
  )
}
