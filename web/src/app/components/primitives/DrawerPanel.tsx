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
import type { Variants } from 'framer-motion'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@carbon/react'
import { Close } from '@carbon/icons-react'
import { drawerVariants, scrimVariants, MAP2_SPRING } from '../../styles/motionPrimitives'
import { useReducedEffectsPreference } from '../../hooks/useReducedEffectsPreference'

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

const leftDrawerVariants: Variants = {
  initial: { x: '-100%', opacity: 0.6 },
  animate: {
    x: 0,
    opacity: 1,
    transition: MAP2_SPRING.drawer,
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: MAP2_SPRING.drawerExit,
  },
}

const instantVariants: Variants = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1 },
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
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const resolvedPanelVariants = shouldReduceEffects
    ? instantVariants
    : side === 'left' ? leftDrawerVariants : drawerVariants
  const resolvedBackdropVariants = shouldReduceEffects ? instantVariants : scrimVariants

  useEffect(() => {
    if (!open || !dismissible) return undefined
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, dismissible, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="map2-drawer-panel__backdrop"
          onClick={() => {
            if (dismissible) onClose()
          }}
          role="presentation"
          variants={resolvedBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <motion.aside
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
            variants={resolvedPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
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
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default DrawerPanel
