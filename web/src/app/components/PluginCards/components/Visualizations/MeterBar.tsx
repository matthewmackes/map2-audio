/**
 * MeterBar - Reusable level meter component
 * 
 * Supports both vertical and horizontal orientations with configurable styling.
 */

import React from 'react'
import { dbToVerticalBar, isClipping, getMeterColor } from '../../utils/metering'

interface MeterBarProps {
  /** Level in dB */
  level: number
  /** Meter orientation */
  orientation?: 'vertical' | 'horizontal'
  /** Container width in pixels */
  width?: number
  /** Container height in pixels */
  height?: number
  /** Accent color (overrides auto-coloring) */
  color?: string
  /** Show clipping indicator */
  showClipping?: boolean
  /** Minimum dB level (floor) */
  minDb?: number
  /** Use auto-coloring (green/yellow/red zones) */
  autoColor?: boolean
  /** X position in SVG */
  x?: number
  /** Y position in SVG */
  y?: number
  /** Corner radius */
  rx?: number
  /** Additional CSS class */
  className?: string
}

export const MeterBar: React.FC<MeterBarProps> = ({
  level,
  orientation = 'vertical',
  width = 6,
  height = 60,
  color,
  showClipping = true,
  minDb = -60,
  autoColor = false,
  x = 0,
  y = 0,
  rx = 1,
  className = '',
}) => {
  const fillColor = autoColor ? getMeterColor(level) : (color || '#00ff00')
  const clipping = showClipping && isClipping(level)

  if (orientation === 'vertical') {
    const { y: barY, height: barHeight } = dbToVerticalBar(level, height, minDb)
    
    return (
      <g className={`meter-bar ${className}`}>
        {/* Background */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="rgba(0, 0, 0, 0.3)"
          rx={rx}
        />
        {/* Level bar */}
        <rect
          x={x}
          y={y + barY}
          width={width}
          height={barHeight}
          fill={clipping ? '#ff0000' : fillColor}
          rx={rx}
          opacity={0.9}
        />
        {/* Clipping indicator */}
        {clipping && (
          <rect
            x={x}
            y={y}
            width={width}
            height={3}
            fill="#ff0000"
            opacity={1}
          />
        )}
      </g>
    )
  } else {
    // Horizontal orientation
    const barWidth = Math.max(0, ((level - minDb) / Math.abs(minDb)) * width)
    
    return (
      <g className={`meter-bar ${className}`}>
        {/* Background */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="rgba(0, 0, 0, 0.3)"
          rx={rx}
        />
        {/* Level bar */}
        <rect
          x={x}
          y={y}
          width={barWidth}
          height={height}
          fill={clipping ? '#ff0000' : fillColor}
          rx={rx}
          opacity={0.9}
        />
        {/* Clipping indicator */}
        {clipping && (
          <rect
            x={x + width - 3}
            y={y}
            width={3}
            height={height}
            fill="#ff0000"
            opacity={1}
          />
        )}
      </g>
    )
  }
}

/**
 * Stereo meter pair (L/R)
 */
interface StereoMeterProps {
  leftLevel: number
  rightLevel: number
  orientation?: 'vertical' | 'horizontal'
  width?: number
  height?: number
  spacing?: number
  color?: string
  showClipping?: boolean
  minDb?: number
  autoColor?: boolean
  x?: number
  y?: number
}

export const StereoMeter: React.FC<StereoMeterProps> = ({
  leftLevel,
  rightLevel,
  orientation = 'vertical',
  width = 6,
  height = 60,
  spacing = 4,
  color,
  showClipping = true,
  minDb = -60,
  autoColor = false,
  x = 0,
  y = 0,
}) => {
  if (orientation === 'vertical') {
    return (
      <g className="stereo-meter">
        <MeterBar
          level={leftLevel}
          orientation="vertical"
          width={width}
          height={height}
          color={color}
          showClipping={showClipping}
          minDb={minDb}
          autoColor={autoColor}
          x={x}
          y={y}
        />
        <MeterBar
          level={rightLevel}
          orientation="vertical"
          width={width}
          height={height}
          color={color}
          showClipping={showClipping}
          minDb={minDb}
          autoColor={autoColor}
          x={x + width + spacing}
          y={y}
        />
      </g>
    )
  } else {
    return (
      <g className="stereo-meter">
        <MeterBar
          level={leftLevel}
          orientation="horizontal"
          width={width}
          height={height}
          color={color}
          showClipping={showClipping}
          minDb={minDb}
          autoColor={autoColor}
          x={x}
          y={y}
        />
        <MeterBar
          level={rightLevel}
          orientation="horizontal"
          width={width}
          height={height}
          color={color}
          showClipping={showClipping}
          minDb={minDb}
          autoColor={autoColor}
          x={x}
          y={y + height + spacing}
        />
      </g>
    )
  }
}
