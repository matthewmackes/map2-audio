/**
 * ParameterSection Component
 *
 * Grouping container for related parameters with optional title,
 * icon, and collapsible behavior.
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ParameterSectionProps {
  title?: string
  icon?: ReactNode
  children: ReactNode
  collapsible?: boolean
  defaultCollapsed?: boolean
  accentColor?: string
  className?: string
}

export function ParameterSection({
  title,
  icon,
  children,
  collapsible = false,
  defaultCollapsed = false,
  accentColor = '#37d6c9',
  className = '',
}: ParameterSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  const toggleCollapse = () => {
    if (collapsible) {
      setIsCollapsed(!isCollapsed)
    }
  }

  return (
    <div
      className={`parameter-section ${collapsible ? 'collapsible' : ''} ${isCollapsed ? 'collapsed' : ''} ${className}`}
      style={{ '--section-accent': accentColor } as React.CSSProperties}
    >
      {title && (
        <div
          className="parameter-section-header"
          onClick={toggleCollapse}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={(e) => {
            if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              toggleCollapse()
            }
          }}
        >
          <div className="parameter-section-title">
            {collapsible && (
              <span className="parameter-section-chevron">
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
            )}
            {icon && <span className="parameter-section-icon">{icon}</span>}
            <span className="parameter-section-label">{title}</span>
          </div>
        </div>
      )}

      {(!collapsible || !isCollapsed) && (
        <div className="parameter-section-content">
          {children}
        </div>
      )}

      <style>{`
        .parameter-section {
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          overflow: hidden;
        }

        .parameter-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .parameter-section.collapsible .parameter-section-header {
          cursor: pointer;
          user-select: none;
          transition: background 0.15s ease;
        }

        .parameter-section.collapsible .parameter-section-header:hover {
          background: rgba(0, 0, 0, 0.3);
        }

        .parameter-section.collapsed .parameter-section-header {
          border-bottom: none;
        }

        .parameter-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .parameter-section-chevron {
          display: flex;
          align-items: center;
          color: var(--section-accent);
        }

        .parameter-section-icon {
          display: flex;
          align-items: center;
          color: var(--section-accent);
        }

        .parameter-section-label {
          font-size: 11px;
          font-weight: 600;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .parameter-section-content {
          padding: 12px;
        }

        /* Without header */
        .parameter-section:not(:has(.parameter-section-header)) {
          background: transparent;
          border: none;
        }

        .parameter-section:not(:has(.parameter-section-header)) .parameter-section-content {
          padding: 0;
        }
      `}</style>
    </div>
  )
}

export default ParameterSection
