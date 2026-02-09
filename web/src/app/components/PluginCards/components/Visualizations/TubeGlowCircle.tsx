/**
 * TubeGlowCircle - Reusable tube glow visualization component
 * 
 * Renders a glowing tube with intensity-based scaling for amp simulators.
 */

import React from 'react'

interface TubeGlowCircleProps {
  /** X position */
  cx: number
  /** Y position */
  cy: number
  /** Intensity 0-1 (affects glow size) */
  intensity: number
  /** Base radius of tube */
  baseRadius?: number
  /** Glow scale multiplier */
  glowScale?: number
  /** Tube type affects appearance */
  tubeType?: 'preamp' | 'power'
  /** Glow gradient ID */
  glowGradientId?: string
  /** Tube color */
  color?: string
  /** Stroke color for tube outline */
  strokeColor?: string
  /** Animation class */
  className?: string
}

export const TubeGlowCircle: React.FC<TubeGlowCircleProps> = ({
  cx,
  cy,
  intensity,
  baseRadius = 7,
  glowScale = 2,
  tubeType = 'preamp',
  glowGradientId = 'tubeGlow',
  color = '#ff6622',
  strokeColor = '#333340',
  className = 'tube-glow',
}) => {
  const isPowerTube = tubeType === 'power'
  const effectiveBaseRadius = isPowerTube ? baseRadius * 1.3 : baseRadius
  const glowRadius = effectiveBaseRadius + (intensity * glowScale * effectiveBaseRadius)
  const tubeRadius = effectiveBaseRadius
  const coreRadius = effectiveBaseRadius * 0.4
  const coreOpacity = 0.3 + (intensity * 0.5)

  return (
    <g className={`tube-glow-circle ${className}`}>
      {/* Outer glow */}
      <circle
        className={className}
        cx={cx}
        cy={cy}
        r={glowRadius}
        fill={`url(#${glowGradientId})`}
        opacity={0.3 + intensity * 0.5}
      />
      {/* Tube body */}
      <circle
        cx={cx}
        cy={cy}
        r={tubeRadius}
        fill="none"
        stroke={strokeColor}
        strokeWidth="0.5"
      />
      {/* Hot cathode core */}
      <circle
        cx={cx}
        cy={cy}
        r={coreRadius}
        fill={color}
        opacity={coreOpacity}
      />
    </g>
  )
}

/**
 * TubeBank - Multiple tubes in a row (e.g., preamp stages)
 */
interface TubeBankProps {
  /** Array of X positions for tubes */
  positions: number[]
  /** Y position (same for all tubes) */
  cy: number
  /** Intensity per tube (0-1), or single value for all */
  intensities: number[] | number
  /** Base radius */
  baseRadius?: number
  /** Tube type */
  tubeType?: 'preamp' | 'power'
  /** Glow gradient ID */
  glowGradientId?: string
  /** Tube color */
  color?: string
  /** Animation class */
  className?: string
}

export const TubeBank: React.FC<TubeBankProps> = ({
  positions,
  cy,
  intensities,
  baseRadius = 7,
  tubeType = 'preamp',
  glowGradientId = 'tubeGlow',
  color = '#ff6622',
  className = 'tube-glow',
}) => {
  return (
    <g className="tube-bank">
      {positions.map((cx, i) => {
        const intensity = Array.isArray(intensities) ? intensities[i] : intensities
        return (
          <TubeGlowCircle
            key={i}
            cx={cx}
            cy={cy}
            intensity={intensity}
            baseRadius={baseRadius}
            tubeType={tubeType}
            glowGradientId={glowGradientId}
            color={color}
            className={`${className} ${className}-${i}`}
          />
        )
      })}
    </g>
  )
}
