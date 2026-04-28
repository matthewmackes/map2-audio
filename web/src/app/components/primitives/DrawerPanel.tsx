// DrawerPanel — side-panel pattern. Carbon doesn't ship a drawer
// component; the audit flagged that every off-canvas surface in MAP2
// uses Carbon Modal instead, which is wrong UX for inspector / detail
// surfaces that should slide in from the side.
//
// Renders a fixed-position side panel with a header bar, scrollable body,
// and optional footer. Backdrop click closes (unless `dismissible=false`).
//
// This is a primitive, not a manager — open/close state is the consumer's
// responsibility.

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Button } from '@carbon/react'
import { Close } from '@carbon/icons-react'

import './DrawerPanel.css'

interface DrawerPanelProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Optional uppercase context label above the title. */
  eyebrow?: string
  /** Drawer side. Defaults to 'right'. */
  side?: 'left' | 'right'
  /** Drawer width. Accepts CSS length. Defaults to clamp(20rem, 28vw, 32rem). */
  width?: string
  children: ReactNode
  footer?: ReactNode
  /** When false, the backdrop click and Escape are no-ops. */
  dismissible?: boolean
  className?: string
  /** ARIA label for the close button. */
  closeLabel?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function DrawerPanel({
  open,
  onClose,
  title,
  eyebrow,
  side = 'right',
  width,
  children,
  footer,
  dismissible = true,
  className,
  closeLabel = 'Close',
}: DrawerPanelProps) {
  useEffect(() => {
    if (!open || !dismissible) return undefined
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, dismissible, onClose])

  if (!open) return null

  return (
    <div
      className="map2-drawer-panel__backdrop"
      onClick={() => {
        if (dismissible) onClose()
      }}
      role="presentation"
    >
      <aside
        className={joinClasses(
          'map2-drawer-panel',
          `map2-drawer-panel--${side}`,
          className,
        )}
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="map2-drawer-panel__head">
          <div className="map2-drawer-panel__head-copy">
            {eyebrow ? <span className="map2-drawer-panel__eyebrow">{eyebrow}</span> : null}
            <h2 className="map2-drawer-panel__title">{title}</h2>
          </div>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Close}
            iconDescription={closeLabel}
            hasIconOnly
            onClick={onClose}
          />
        </header>
        <div className="map2-drawer-panel__body">{children}</div>
        {footer ? <footer className="map2-drawer-panel__footer">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export default DrawerPanel
