import { useState, useEffect, useRef, ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '../../hooks/useIsMobile'

interface ToolbarTooltipProps {
  content: string | React.ReactNode
  children: ReactElement
  delay?: number
  position?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
  shortcut?: string
}

export function ToolbarTooltip({
  content,
  children,
  delay = 500,
  position = 'bottom',
  disabled = false,
  shortcut,
}: ToolbarTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [actualPosition, setActualPosition] = useState(position)
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>(undefined)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const gap = 8

    let top = 0
    let left = 0
    let finalPosition = position

    // Calculate position with viewport detection
    if (position === 'bottom') {
      top = triggerRect.bottom + gap
      left = triggerRect.left + triggerRect.width / 2
      if (top + tooltipRect.height > window.innerHeight) {
        finalPosition = 'top'
      }
    }

    if (finalPosition === 'top') {
      top = triggerRect.top - tooltipRect.height - gap
      left = triggerRect.left + triggerRect.width / 2
    }

    if (position === 'right') {
      left = triggerRect.right + gap
      top = triggerRect.top + triggerRect.height / 2
      if (left + tooltipRect.width > window.innerWidth) {
        finalPosition = 'left'
      }
    }

    if (finalPosition === 'left') {
      left = triggerRect.left - tooltipRect.width - gap
      top = triggerRect.top + triggerRect.height / 2
    }

    // Center alignment
    if (finalPosition === 'top' || finalPosition === 'bottom') {
      left = Math.max(0, Math.min(left - tooltipRect.width / 2, window.innerWidth - tooltipRect.width))
    }

    if (finalPosition === 'left' || finalPosition === 'right') {
      top = Math.max(0, Math.min(top - tooltipRect.height / 2, window.innerHeight - tooltipRect.height))
    }

    setTooltipPos({ x: left, y: top })
    setActualPosition(finalPosition)
  }, [isVisible, position])

  const handleMouseEnter = () => {
    if (disabled || isMobile) return
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  const handleTriggerClick = () => {
    if (disabled || !isMobile) return
    setIsVisible((previous) => !previous)
  }

  useEffect(() => {
    if (!isVisible || !isMobile) {
      return
    }

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return
      }
      setIsVisible(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isVisible, isMobile])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleTriggerClick}
      onBlur={isMobile ? handleMouseLeave : undefined}
    >
      {children}
      {isVisible && !disabled &&
        createPortal(
          <div
            ref={tooltipRef}
            className="toolbar-tooltip"
            style={{
              position: 'fixed',
              top: `${tooltipPos.y}px`,
              left: `${tooltipPos.x}px`,
              zIndex: 10000,
            }}
          >
            <div className="toolbar-tooltip-content">
              {content}
              {shortcut && <span className="toolbar-tooltip-kbd">{shortcut}</span>}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
