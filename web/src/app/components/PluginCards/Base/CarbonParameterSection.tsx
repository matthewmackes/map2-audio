/**
 * CarbonParameterSection — Carbon-compliant parameter grouping
 *
 * Always-visible section with icon header. For collapsible sections,
 * use the advancedSections prop on CarbonCardShell instead.
 */

import type { ReactNode } from 'react'
import { getSectionIcon } from './sectionIcons'

interface CarbonParameterSectionProps {
  title?: string
  icon?: ReactNode
  children: ReactNode
  accentColor?: string
  className?: string
  autoIcon?: boolean
  iconSize?: number
}

export function CarbonParameterSection({
  title,
  icon,
  children,
  accentColor,
  className = '',
  autoIcon = true,
  iconSize = 14,
}: CarbonParameterSectionProps) {
  const resolvedIcon = icon || (autoIcon && title ? getSectionIcon(title, iconSize) : null)

  return (
    <div
      className={`carbon-param-section ${className}`}
      style={{ '--accent-color': accentColor } as React.CSSProperties}
    >
      {title && (
        <div className="carbon-param-section-header">
          {resolvedIcon && (
            <span className="carbon-param-section-icon">{resolvedIcon}</span>
          )}
          <span className="carbon-param-section-label">{title}</span>
        </div>
      )}
      <div className="carbon-param-section-body">
        {children}
      </div>
    </div>
  )
}

export default CarbonParameterSection
