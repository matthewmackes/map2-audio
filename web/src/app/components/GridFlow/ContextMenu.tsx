import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  separator?: boolean
  shortcut?: string
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  let top = position.y
  let left = position.x

  useEffect(() => {
    if (!menuRef.current) return

    const menuRect = menuRef.current.getBoundingClientRect()

    // Adjust horizontal
    if (position.x + menuRect.width > window.innerWidth) {
      left = Math.max(0, position.x - menuRect.width)
    }

    // Adjust vertical
    if (position.y + menuRect.height > window.innerHeight) {
      top = Math.max(0, position.y - menuRect.height)
    }

    menuRef.current.style.top = `${top}px`
    menuRef.current.style.left = `${left}px`
  }, [position.x, position.y])

  return createPortal(
    <div
      ref={menuRef}
      className="toolbar-context-menu"
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 10001,
      }}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={`sep-${idx}`} className="toolbar-context-menu-separator" />
        }

        return (
          <button
            key={`item-${idx}`}
            className="toolbar-context-menu-item"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="toolbar-context-menu-icon">{item.icon}</span>}
            <span className="toolbar-context-menu-label">{item.label}</span>
            {item.shortcut && <span className="toolbar-context-menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
