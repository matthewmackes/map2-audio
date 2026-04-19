/**
 * Shared SVG gradient definitions for plugin cards
 * 
 * Provides reusable gradient components to eliminate duplication
 * across visualization SVGs.
 */

import React from 'react'

interface GradientProps {
  id: string
  color: string
}

/**
 * Radial gradient for tube glow effects
 */
export const TubeGlowGradient: React.FC<GradientProps> = ({ id, color }) => (
  <radialGradient id={id} cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor={color} stopOpacity="0.7" />
    <stop offset="60%" stopColor={color} stopOpacity="0.2" />
    <stop offset="100%" stopColor={color} stopOpacity="0" />
  </radialGradient>
)

/**
 * Vertical gradient for meters (bottom to top)
 */
export const VerticalMeterGradient: React.FC<GradientProps> = ({ id, color }) => (
  <linearGradient id={id} x1="0%" y1="100%" x2="0%" y2="0%">
    <stop offset="0%" stopColor={color} stopOpacity="0.9" />
    <stop offset="80%" stopColor={color} stopOpacity="0.5" />
    <stop offset="100%" stopColor="#ffaa00" stopOpacity="0.9" />
  </linearGradient>
)

/**
 * Horizontal gradient for glow effects (left to right fade)
 */
export const HorizontalGlowGradient: React.FC<GradientProps> = ({ id, color }) => (
  <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stopColor={color} stopOpacity="0.2" />
    <stop offset="50%" stopColor={color} stopOpacity="0.8" />
    <stop offset="100%" stopColor={color} stopOpacity="0.2" />
  </linearGradient>
)

/**
 * Radial gradient for power tube glow (stronger/hotter)
 */
export const PowerTubeGlowGradient: React.FC<GradientProps> = ({ id, color }) => (
  <radialGradient id={id} cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor={color} stopOpacity="0.8" />
    <stop offset="60%" stopColor={color} stopOpacity="0.3" />
    <stop offset="100%" stopColor={color} stopOpacity="0" />
  </radialGradient>
)

/**
 * Simple fade gradient (top to bottom)
 */
export const FadeGradient: React.FC<GradientProps> = ({ id, color }) => (
  <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stopColor={color} stopOpacity="0.8" />
    <stop offset="100%" stopColor={color} stopOpacity="0" />
  </linearGradient>
)

/**
 * Reverb tail gradient (horizontal fade from left)
 */
export const ReverbTailGradient: React.FC<GradientProps> = ({ id, color }) => (
  <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stopColor={color} stopOpacity="0.8" />
    <stop offset="100%" stopColor={color} stopOpacity="0" />
  </linearGradient>
)

/**
 * Shimmer/sparkle gradient (bright center)
 */
export const ShimmerGradient: React.FC<GradientProps> = ({ id, color }) => (
  <radialGradient id={id} cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
    <stop offset="100%" stopColor={color} stopOpacity="0" />
  </radialGradient>
)

/**
 * Collection of all gradients for convenience
 */
export const SVGGradients = {
  TubeGlow: TubeGlowGradient,
  VerticalMeter: VerticalMeterGradient,
  HorizontalGlow: HorizontalGlowGradient,
  PowerTubeGlow: PowerTubeGlowGradient,
  Fade: FadeGradient,
  ReverbTail: ReverbTailGradient,
  Shimmer: ShimmerGradient,
}

/**
 * Container component that includes common gradients
 * Usage: <CommonSVGDefs accentColor="#00A0FF" />
 */
interface CommonSVGDefsProps {
  accentColor: string
  includeGradients?: ('tubeGlow' | 'meter' | 'horizontalGlow' | 'powerTube' | 'fade' | 'reverbTail' | 'shimmer')[]
}

export const CommonSVGDefs: React.FC<CommonSVGDefsProps> = ({ 
  accentColor, 
  includeGradients = ['tubeGlow', 'meter'] 
}) => {
  return (
    <defs>
      {includeGradients.includes('tubeGlow') && (
        <TubeGlowGradient id="tubeGlow" color={accentColor} />
      )}
      {includeGradients.includes('meter') && (
        <VerticalMeterGradient id="meterGradient" color={accentColor} />
      )}
      {includeGradients.includes('horizontalGlow') && (
        <HorizontalGlowGradient id="horizontalGlow" color={accentColor} />
      )}
      {includeGradients.includes('powerTube') && (
        <PowerTubeGlowGradient id="powerTubeGlow" color={accentColor} />
      )}
      {includeGradients.includes('fade') && (
        <FadeGradient id="fadeGradient" color={accentColor} />
      )}
      {includeGradients.includes('reverbTail') && (
        <ReverbTailGradient id="reverbTail" color={accentColor} />
      )}
      {includeGradients.includes('shimmer') && (
        <ShimmerGradient id="shimmerGradient" color={accentColor} />
      )}
    </defs>
  )
}
