/**
 * TunerDisplay - Pitch Detection Visualization
 *
 * Antares-style tuner display showing detected pitch, target note,
 * and cents deviation with professional needle meter.
 */

import { useMemo, useRef } from 'react'
import { useResponsiveVizSize } from './useResponsiveVizSize'

interface TunerDisplayProps {
  detectedPitch: number // Hz (0 = no signal)
  targetPitch: number // Hz
  cents: number // -50 to +50 cents deviation
  noteName: string // e.g., "A4", "C#3"
  confidence: number // 0-1 detection confidence
  width?: number
  height?: number
  accentColor?: string
  showOctave?: boolean
  compact?: boolean
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function TunerDisplay({
  detectedPitch = 0,
  cents = 0,
  noteName = '--',
  confidence = 0,
  width,
  height,
  accentColor = '#00d4aa',
  compact = false,
}: TunerDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResponsiveVizSize(svgRef as any, {
    width,
    height,
    aspectRatio: 280 / 120,
    baseOn: 'width',
    defaultWidth: 280,
    defaultHeight: 120,
  })

  const finalWidth = dimensions.width
  const finalHeight = dimensions.height

  // Calculate needle angle (-45° to +45°)
  const needleAngle = useMemo(() => {
    const clampedCents = Math.max(-50, Math.min(50, cents))
    return (clampedCents / 50) * 45
  }, [cents])

  // Determine tuning status
  const tuningStatus = useMemo(() => {
    const absCents = Math.abs(cents)
    if (absCents <= 3) return 'perfect'
    if (absCents <= 10) return 'close'
    if (absCents <= 25) return 'off'
    return 'far'
  }, [cents])

  const statusColors = {
    perfect: '#00ff88',
    close: '#88ff00',
    off: '#ffaa00',
    far: '#ff4444',
  }

  const statusColor = confidence > 0.3 ? statusColors[tuningStatus] : '#444'

  // Generate tick marks
  const ticks = useMemo(() => {
    const marks = []
    for (let i = -50; i <= 50; i += 10) {
      const angle = (i / 50) * 45
      const isCenter = i === 0
      const isMajor = Math.abs(i) === 50 || isCenter
      marks.push({ cents: i, angle, isCenter, isMajor })
    }
    return marks
  }, [])

  const centerX = finalWidth / 2
  const meterY = finalHeight * 0.7
  const radius = Math.min(finalWidth, finalHeight) * 0.55

  return (
    <svg
      ref={svgRef}
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      className="tuner-display"
    >
      <defs>
        {/* Glow filter for active states */}
        <filter id="tuner-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradient for meter arc */}
        <linearGradient id="tuner-arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff4444" />
          <stop offset="25%" stopColor="#ffaa00" />
          <stop offset="50%" stopColor="#00ff88" />
          <stop offset="75%" stopColor="#ffaa00" />
          <stop offset="100%" stopColor="#ff4444" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect x="0" y="0" width={finalWidth} height={finalHeight} fill="#0a0a0a" rx="8" />

      {/* Meter arc background */}
      <path
        d={describeArc(centerX, meterY, radius, -45, 45)}
        fill="none"
        stroke="#222"
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Colored arc based on tuning */}
      {confidence > 0.3 && (
        <path
          d={describeArc(centerX, meterY, radius, -45, 45)}
          fill="none"
          stroke="url(#tuner-arc-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.3"
        />
      )}

      {/* Tick marks */}
      {ticks.map(({ cents: c, angle, isCenter, isMajor }) => {
        const rad = (angle - 90) * (Math.PI / 180)
        const innerR = radius - (isMajor ? 15 : 10)
        const outerR = radius + 5
        const x1 = centerX + innerR * Math.cos(rad)
        const y1 = meterY + innerR * Math.sin(rad)
        const x2 = centerX + outerR * Math.cos(rad)
        const y2 = meterY + outerR * Math.sin(rad)

        return (
          <g key={c}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isCenter ? '#00ff88' : isMajor ? '#666' : '#333'}
              strokeWidth={isCenter ? 3 : isMajor ? 2 : 1}
            />
            {isMajor && !isCenter && (
              <text
                x={centerX + (radius + 18) * Math.cos(rad)}
                y={meterY + (radius + 18) * Math.sin(rad)}
                fill="#555"
                fontSize="9"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {c > 0 ? '+' : ''}{c}
              </text>
            )}
          </g>
        )
      })}

      {/* Center "in tune" indicator */}
      <circle
        cx={centerX}
        cy={meterY - radius - 8}
        r={tuningStatus === 'perfect' && confidence > 0.3 ? 6 : 4}
        fill={tuningStatus === 'perfect' && confidence > 0.3 ? '#00ff88' : '#333'}
        filter={tuningStatus === 'perfect' && confidence > 0.3 ? 'url(#tuner-glow)' : undefined}
      />

      {/* Needle */}
      <g transform={`rotate(${needleAngle}, ${centerX}, ${meterY})`}>
        <line
          x1={centerX}
          y1={meterY}
          x2={centerX}
          y2={meterY - radius + 10}
          stroke={statusColor}
          strokeWidth="3"
          strokeLinecap="round"
          filter={confidence > 0.3 ? 'url(#tuner-glow)' : undefined}
        />
        <circle
          cx={centerX}
          cy={meterY}
          r="6"
          fill={statusColor}
        />
      </g>

      {/* Note name display */}
      <text
        x={centerX}
        y={finalHeight * 0.25}
        fill={confidence > 0.3 ? accentColor : '#444'}
        fontSize="28"
        fontWeight="700"
        fontFamily="'JetBrains Mono', monospace"
        textAnchor="middle"
        dominantBaseline="middle"
        filter={confidence > 0.3 ? 'url(#tuner-glow)' : undefined}
      >
        {noteName}
      </text>

      {/* Frequency display */}
      <text
        x={centerX}
        y={finalHeight - 12}
        fill="#555"
        fontSize="10"
        fontFamily="'JetBrains Mono', monospace"
        textAnchor="middle"
      >
        {detectedPitch > 0 ? `${detectedPitch.toFixed(1)} Hz` : '-- Hz'}
      </text>

      {/* Cents display */}
      <text
        x={finalWidth - 12}
        y={finalHeight * 0.25}
        fill={statusColor}
        fontSize="12"
        fontWeight="600"
        fontFamily="'JetBrains Mono', monospace"
        textAnchor="end"
      >
        {cents >= 0 ? '+' : ''}{cents.toFixed(0)}¢
      </text>
    </svg>
  )
}

// Helper to draw arc path
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

export default TunerDisplay
