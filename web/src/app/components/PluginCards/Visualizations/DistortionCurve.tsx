/**
 * DistortionCurve Component
 *
 * SVG visualization of distortion/saturation transfer function.
 */

import { useRef } from 'react'
import { useResponsiveVizSize } from './useResponsiveVizSize'

interface DistortionCurveProps {
  drive: number // 0-1 or 0-100
  type?: 'soft' | 'hard' | 'tube' | 'tape' | 'fuzz'
  bias?: number // -1 to 1
  mix?: number // 0-1
  width?: number
  height?: number
  accentColor?: string
  compact?: boolean
}

export function DistortionCurve({
  drive,
  type = 'soft',
  bias = 0,
  mix = 1,
  width,
  height,
  accentColor = '#ff6b6b',
  compact = false,
}: DistortionCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResponsiveVizSize(svgRef, {
    width,
    height,
    aspectRatio: 160 / 100,
    baseOn: 'width',
    defaultWidth: 160,
    defaultHeight: 100,
  })

  const finalWidth = dimensions.width
  const finalHeight = dimensions.height
  const padding = { top: 8, right: 8, bottom: 8, left: 8 }
  const graphWidth = finalWidth - padding.left - padding.right
  const graphHeight = finalHeight - padding.top - padding.bottom

  // Normalize drive to 0-1
  const driveNorm = drive > 1 ? drive / 100 : drive

  // Calculate transfer function
  const transferFunction = (input: number): number => {
    // Apply bias
    const biased = input + bias * 0.5

    // Apply distortion based on type
    let output: number
    const d = 0.1 + driveNorm * 0.9 // Scale drive effect

    switch (type) {
      case 'hard':
        // Hard clipping
        output = Math.max(-1, Math.min(1, biased * (1 + d * 10)))
        break
      case 'tube':
        // Asymmetric soft clipping (tube-like)
        if (biased >= 0) {
          output = 1 - Math.exp(-biased * (1 + d * 5))
        } else {
          output = -1 + Math.exp(biased * (1 + d * 3))
        }
        break
      case 'tape':
        // Soft saturation with compression
        output = Math.tanh(biased * (1 + d * 3)) * (1 - d * 0.1)
        break
      case 'fuzz':
        // Aggressive clipping with fold-back
        const scaled = biased * (1 + d * 20)
        if (Math.abs(scaled) > 1) {
          output = Math.sign(scaled) * (2 - Math.abs(scaled))
          output = Math.max(-1, Math.min(1, output))
        } else {
          output = scaled
        }
        break
      case 'soft':
      default:
        // Soft clipping (tanh)
        output = Math.tanh(biased * (1 + d * 4))
    }

    // Apply mix (wet/dry)
    return input * (1 - mix) + output * mix
  }

  // Generate curve path
  const steps = 64
  let path = ''
  for (let i = 0; i <= steps; i++) {
    const input = -1 + (i / steps) * 2
    const output = transferFunction(input)

    const x = padding.left + ((input + 1) / 2) * graphWidth
    const y = padding.top + ((1 - output) / 2) * graphHeight

    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  }

  // Center lines
  const centerX = padding.left + graphWidth / 2
  const centerY = padding.top + graphHeight / 2

  return (
    <svg
      ref={svgRef}
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      className="distortion-curve"
    >
      {/* Background */}
      <rect
        x={padding.left}
        y={padding.top}
        width={graphWidth}
        height={graphHeight}
        fill="#0a0a0a"
        rx={4}
      />

      {/* Grid */}
      <line
        x1={centerX}
        y1={padding.top}
        x2={centerX}
        y2={padding.top + graphHeight}
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={1}
      />
      <line
        x1={padding.left}
        y1={centerY}
        x2={padding.left + graphWidth}
        y2={centerY}
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={1}
      />

      {/* Unity (linear) reference */}
      <line
        x1={padding.left}
        y1={padding.top + graphHeight}
        x2={padding.left + graphWidth}
        y2={padding.top}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Transfer curve */}
      <path
        d={path}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Clipping indicators */}
      {driveNorm > 0.5 && (
        <>
          <line
            x1={padding.left}
            y1={padding.top + 4}
            x2={padding.left + graphWidth}
            y2={padding.top + 4}
            stroke={accentColor}
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.4}
          />
          <line
            x1={padding.left}
            y1={padding.top + graphHeight - 4}
            x2={padding.left + graphWidth}
            y2={padding.top + graphHeight - 4}
            stroke={accentColor}
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.4}
          />
        </>
      )}

      {/* Type label */}
      <text
        x={padding.left + 4}
        y={padding.top + 10}
        fill={accentColor}
        fontSize={8}
        style={{ textTransform: 'uppercase' }}
        opacity={0.7}
      >
        {type}
      </text>

      {/* Drive level indicator */}
      <rect
        x={padding.left + graphWidth - 24}
        y={padding.top + graphHeight - 8}
        width={20}
        height={4}
        fill="rgba(255, 255, 255, 0.1)"
        rx={2}
      />
      <rect
        x={padding.left + graphWidth - 24}
        y={padding.top + graphHeight - 8}
        width={20 * driveNorm}
        height={4}
        fill={accentColor}
        rx={2}
      />

      <style>{`
        .distortion-curve {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>
    </svg>
  )
}

export default DistortionCurve
