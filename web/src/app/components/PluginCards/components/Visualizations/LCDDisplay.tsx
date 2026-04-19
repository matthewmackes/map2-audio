/**
 * LCDDisplay - Reusable LCD/VFD/LED display component
 * 
 * Supports multiple display styles (green phosphor, blue VFD, red LED, etc.)
 */

import React from 'react'
import './LCDDisplay.css'

type DisplayStyle = 'lexicon-green' | 'eventide-blue' | 'h9-red' | 'boss-orange' | 'custom'

interface DisplayRow {
  label?: string
  value: string | number
  size?: 'small' | 'medium' | 'large'
}

interface LCDDisplayProps {
  /** Display style preset */
  style?: DisplayStyle
  /** Custom color (for 'custom' style) */
  customColor?: string
  /** Rows of content to display */
  rows: DisplayRow[]
  /** Logo/branding text */
  logo?: string
  /** Additional CSS class */
  className?: string
}

export const LCDDisplay: React.FC<LCDDisplayProps> = ({
  style = 'lexicon-green',
  customColor,
  rows,
  logo,
  className = '',
}) => {
  const displayColor = customColor || getStyleColor(style)
  
  return (
    <div className={`lcd-display lcd-display-${style} ${className}`}>
      <div className="lcd-screen" style={{ '--lcd-color': displayColor } as React.CSSProperties}>
        {rows.map((row, index) => (
          <div key={index} className={`lcd-row lcd-row-${row.size || 'medium'}`}>
            {row.label && <span className="lcd-label">{row.label}</span>}
            <span className="lcd-value">{row.value}</span>
          </div>
        ))}
      </div>
      {logo && <div className="lcd-logo" style={{ color: displayColor }}>{logo}</div>}
    </div>
  )
}

const getStyleColor = (style: DisplayStyle): string => {
  const colors: Record<DisplayStyle, string> = {
    'lexicon-green': '#00cc00',
    'eventide-blue': '#00aaff',
    'h9-red': '#ff1111',
    'boss-orange': '#ff6600',
    'custom': '#00ff00',
  }
  return colors[style]
}

/**
 * VFD-style display with pitch indicators (for harmonizers/pitch shifters)
 */
interface VFDPitchDisplayProps {
  algorithmName: string
  pitchL: string
  pitchR: string
  meterLevel?: number
  accentColor?: string
}

export const VFDPitchDisplay: React.FC<VFDPitchDisplayProps> = ({
  algorithmName,
  pitchL,
  pitchR,
  meterLevel = 0,
  accentColor = '#00aaff',
}) => {
  return (
    <div className="vfd-container" style={{ '--accent-color': accentColor } as React.CSSProperties}>
      <div className="vfd-screen">
        <div className="vfd-row">
          <span className="vfd-label">ALGORITHM</span>
          <span className="vfd-value">{algorithmName}</span>
        </div>
        <div className="vfd-row vfd-pitch-row">
          <div className="vfd-pitch">
            <span className="vfd-channel">L</span>
            <span className="vfd-pitch-value">{pitchL}</span>
          </div>
          <div className="vfd-divider" />
          <div className="vfd-pitch">
            <span className="vfd-channel">R</span>
            <span className="vfd-pitch-value">{pitchR}</span>
          </div>
        </div>
        <div className="vfd-meters">
          <div
            className="vfd-meter-bar"
            style={{ width: `${Math.max(0, Math.min(100, meterLevel))}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 7-segment LED style display (for numeric readouts)
 */
interface LEDDisplayProps {
  number: number
  name: string
  description?: string
  accentColor?: string
}

export const LEDDisplay: React.FC<LEDDisplayProps> = ({
  number,
  name,
  description,
  accentColor = '#ff1111',
}) => {
  return (
    <div className="led-container" style={{ '--led-color': accentColor } as React.CSSProperties}>
      <div className="led-screen">
        <div className="led-number">
          <span className="led-digit">{number}</span>
        </div>
        <div className="led-name">{name}</div>
        {description && <div className="led-description">{description}</div>}
      </div>
    </div>
  )
}
