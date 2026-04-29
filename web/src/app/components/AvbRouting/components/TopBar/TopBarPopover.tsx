// TopBarPopover — anchor-positioned overlay used by the TopBar
// scenes / filters / scene-diff panels. Replaces MUI Popover so
// TopBar can drop @mui/material entirely. Mirrors the
// anchorEl + open + onClose API the call-sites already use.
//
// Behaviour:
//   - Renders a fixed-position panel anchored to the bottom-left of
//     the trigger element (matching the prior anchorOrigin
//     bottom/left + transformOrigin top/left configuration).
//   - On mobile (matchMedia max-width 599px) the panel centers
//     under the trigger to mirror anchorOrigin/transformOrigin
//     center behaviour.
//   - Click-outside dismisses; Escape dismisses.
//   - Reads the anchor's bounding rect on every open and on
//     window resize so the overlay stays attached.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './TopBarPopover.css'

interface TopBarPopoverProps {
  open: boolean
  anchorEl: HTMLElement | null
  onClose: () => void
  isMobile: boolean
  children: React.ReactNode
}

interface PopoverPosition {
  top: number
  left: number
  transformOrigin: string
}

function computePosition(anchor: HTMLElement, isMobile: boolean): PopoverPosition {
  const rect = anchor.getBoundingClientRect()
  const top = rect.bottom + window.scrollY + 4
  if (isMobile) {
    return {
      top,
      left: rect.left + rect.width / 2 + window.scrollX,
      transformOrigin: 'top center',
    }
  }
  return {
    top,
    left: rect.left + window.scrollX,
    transformOrigin: 'top left',
  }
}

export function TopBarPopover({
  open,
  anchorEl,
  onClose,
  isMobile,
  children,
}: TopBarPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  useEffect(() => {
    if (!open || !anchorEl) {
      setPosition(null)
      return
    }
    const update = () => setPosition(computePosition(anchorEl, isMobile))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorEl, isMobile])

  useEffect(() => {
    if (!open) return
    const handleDocClick = (event: MouseEvent) => {
      if (
        panelRef.current &&
        anchorEl &&
        !panelRef.current.contains(event.target as Node) &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose()
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleDocClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleDocClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, anchorEl, onClose])

  if (!open || !position) return null

  return createPortal(
    <div
      ref={panelRef}
      className="topbar-popover"
      style={{
        top: position.top,
        left: position.left,
        transformOrigin: position.transformOrigin,
        transform: isMobile ? 'translateX(-50%)' : 'translateX(0)',
      }}
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  )
}

export default TopBarPopover
