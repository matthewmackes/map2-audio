/**
 * LFOWaveform Component
 *
 * Animated display of LFO waveform for modulation effects.
 */

import { useEffect, useRef, useState } from 'react'

interface LFOWaveformProps {
  rate: number // Hz
  depth: number // 0-1 or 0-100
  waveform?: 'sine' | 'triangle' | 'square' | 'saw'
  phase?: number // 0-360
  width?: number
  height?: number
  accentColor?: string
  animated?: boolean
}

export function LFOWaveform({
  rate,
  depth,
  waveform = 'sine',
  phase = 0,
  width = 200,
  height = 60,
  accentColor = '#f59e0b',
  animated = true,
}: LFOWaveformProps) {
  const [animPhase, setAnimPhase] = useState(0)
  const animationRef = useRef<number | undefined>(undefined)
  const lastTimeRef = useRef<number>(0)

  const padding = { top: 8, right: 12, bottom: 12, left: 12 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom

  // Normalize depth to 0-1
  const depthNorm = depth > 1 ? depth / 100 : depth

  // Animation loop
  useEffect(() => {
    if (!animated || rate === 0) return

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = timestamp - lastTimeRef.current

      // Advance phase based on rate
      const phaseIncrement = (rate * delta / 1000) * 360
      setAnimPhase(prev => (prev + phaseIncrement) % 360)

      lastTimeRef.current = timestamp
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [animated, rate])

  // Calculate waveform value at position
  const getWaveValue = (normalizedX: number, phaseOffset: number = 0): number => {
    const t = normalizedX + phaseOffset / 360
    const p = (t * 360 + phase) % 360
    const pRad = (p * Math.PI) / 180

    switch (waveform) {
      case 'triangle':
        return ((p < 180 ? p / 90 - 1 : 3 - p / 90) * depthNorm)
      case 'square':
        return (p < 180 ? depthNorm : -depthNorm)
      case 'saw':
        return ((p / 180 - 1) * depthNorm)
      case 'sine':
      default:
        return Math.sin(pRad) * depthNorm
    }
  }

  // Generate waveform path
  const steps = 64
  let path = ''
  for (let i = 0; i <= steps; i++) {
    const normalizedX = i / steps
    const value = getWaveValue(normalizedX, animated ? animPhase : 0)

    const x = padding.left + normalizedX * graphWidth
    const y = padding.top + graphHeight / 2 - (value * graphHeight / 2)

    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  }

  // Current position indicator (animated dot)
  const currentX = padding.left + ((animPhase / 360) % 1) * graphWidth
  const currentValue = getWaveValue(animPhase / 360, 0)
  const currentY = padding.top + graphHeight / 2 - (currentValue * graphHeight / 2)

  const centerY = padding.top + graphHeight / 2

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="lfo-waveform"
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

      {/* Center line */}
      <line
        x1={padding.left}
        y1={centerY}
        x2={padding.left + graphWidth}
        y2={centerY}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
      />

      {/* Depth boundaries */}
      <line
        x1={padding.left}
        y1={padding.top + graphHeight / 2 * (1 - depthNorm)}
        x2={padding.left + graphWidth}
        y2={padding.top + graphHeight / 2 * (1 - depthNorm)}
        stroke={accentColor}
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.3}
      />
      <line
        x1={padding.left}
        y1={padding.top + graphHeight / 2 * (1 + depthNorm)}
        x2={padding.left + graphWidth}
        y2={padding.top + graphHeight / 2 * (1 + depthNorm)}
        stroke={accentColor}
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.3}
      />

      {/* Waveform fill */}
      <path
        d={`${path} L ${padding.left + graphWidth} ${centerY} L ${padding.left} ${centerY} Z`}
        fill={accentColor}
        opacity={0.15}
      />

      {/* Waveform line */}
      <path
        d={path}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Animated position indicator */}
      {animated && rate > 0 && (
        <circle
          cx={currentX}
          cy={currentY}
          r={4}
          fill={accentColor}
          stroke="#fff"
          strokeWidth={1}
        >
          <animate
            attributeName="opacity"
            values="1;0.5;1"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Waveform type label */}
      <text
        x={padding.left + 4}
        y={padding.top + 10}
        fill={accentColor}
        fontSize={8}
        style={{ textTransform: 'uppercase' }}
        opacity={0.7}
      >
        {waveform}
      </text>

      {/* Rate label */}
      <text
        x={padding.left + graphWidth - 4}
        y={height - 2}
        textAnchor="end"
        fill={accentColor}
        fontSize={9}
        fontWeight="bold"
        fontFamily="monospace"
      >
        {rate >= 1 ? `${rate.toFixed(1)}Hz` : `${(rate * 1000).toFixed(0)}mHz`}
      </text>

      <style>{`
        .lfo-waveform {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>
    </svg>
  )
}

export default LFOWaveform
