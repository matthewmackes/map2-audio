/**
 * ReverbDecayCurve Component
 *
 * SVG visualization of reverb decay envelope.
 * Shows early reflections pattern and exponential tail decay.
 */

import { useMemo, useRef } from 'react'
import { useResponsiveVizSize } from './useResponsiveVizSize'

interface ReverbDecayCurveProps {
  decayTime: number // seconds (RT60)
  preDelay?: number // ms
  earlyReflections?: number // 0-1, relative level
  damping?: number // 0-1, high frequency damping
  width?: number
  height?: number
  accentColor?: string
  showGrid?: boolean
  compact?: boolean
}

export function ReverbDecayCurve({
  decayTime,
  preDelay = 0,
  earlyReflections = 0.7,
  damping = 0.5,
  width,
  height,
  accentColor = '#a855f7',
  showGrid = true,
  compact = false,
}: ReverbDecayCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResponsiveVizSize(svgRef, {
    width,
    height,
    aspectRatio: 280 / 100,
    baseOn: 'width',
    defaultWidth: 280,
    defaultHeight: 100,
  })

  const finalWidth = dimensions.width
  const finalHeight = dimensions.height
  const padding = { top: 8, right: 12, bottom: 20, left: 8 }
  const graphWidth = finalWidth - padding.left - padding.right
  const graphHeight = finalHeight - padding.top - padding.bottom

  // Time scale: show up to decay time + some margin
  const maxTime = Math.max(decayTime * 1.2, 1)

  // Convert time to x position
  const timeToX = (t: number) => padding.left + (t / maxTime) * graphWidth

  // Convert amplitude (0-1) to y position
  const ampToY = (a: number) => padding.top + graphHeight - a * graphHeight

  // Generate early reflections as discrete spikes
  const earlyReflectionSpikes = useMemo(() => {
    const spikes: Array<{ time: number; amplitude: number }> = []
    const preDelaySeconds = preDelay / 1000
    const erDuration = Math.min(0.1, decayTime * 0.1) // ER region is ~10% of decay or 100ms max

    // Generate 5-8 early reflection spikes
    const numSpikes = Math.floor(5 + Math.random() * 3)
    for (let i = 0; i < numSpikes; i++) {
      const t = preDelaySeconds + (i / numSpikes) * erDuration
      const amp = earlyReflections * (1 - i * 0.1) * (0.8 + Math.random() * 0.4)
      spikes.push({ time: t, amplitude: Math.max(0, Math.min(1, amp)) })
    }

    return spikes
  }, [preDelay, earlyReflections, decayTime])

  // Generate decay envelope path
  const decayPath = useMemo(() => {
    const points: string[] = []
    const preDelaySeconds = preDelay / 1000
    const erDuration = Math.min(0.1, decayTime * 0.1)
    const tailStart = preDelaySeconds + erDuration

    // Start at origin
    points.push(`M ${timeToX(0)} ${ampToY(0)}`)

    // Pre-delay (silence)
    if (preDelaySeconds > 0) {
      points.push(`L ${timeToX(preDelaySeconds)} ${ampToY(0)}`)
    }

    // Jump to initial level (first spike)
    points.push(`L ${timeToX(preDelaySeconds)} ${ampToY(earlyReflections)}`)

    // ER envelope (rough approximation)
    points.push(`L ${timeToX(tailStart)} ${ampToY(earlyReflections * 0.6)}`)

    // Exponential decay tail
    // RT60 means -60dB drop, which is 0.001 linear amplitude
    const steps = 50
    for (let i = 0; i <= steps; i++) {
      const t = tailStart + (i / steps) * (decayTime - (tailStart - preDelaySeconds))
      const timeIntoDecay = t - tailStart
      // Exponential decay: A(t) = A0 * e^(-6.9 * t / RT60)
      // 6.9 comes from -60dB = 20*log10(e^-6.9) ≈ -60
      const decayFactor = Math.exp(-6.9 * timeIntoDecay / decayTime)
      // Apply damping (faster decay at end)
      const dampingFactor = 1 - damping * (timeIntoDecay / decayTime) * 0.5
      const amp = earlyReflections * 0.6 * decayFactor * dampingFactor
      points.push(`L ${timeToX(t).toFixed(1)} ${ampToY(Math.max(0, amp)).toFixed(1)}`)
    }

    // End at baseline
    points.push(`L ${timeToX(maxTime)} ${ampToY(0)}`)

    return points.join(' ')
  }, [decayTime, preDelay, earlyReflections, damping, maxTime, graphWidth, graphHeight])

  // Time markers
  const timeMarkers = useMemo(() => {
    const markers: number[] = []
    if (maxTime <= 1) {
      markers.push(0, 0.25, 0.5, 0.75, 1)
    } else if (maxTime <= 3) {
      markers.push(0, 0.5, 1, 1.5, 2, 2.5, 3)
    } else {
      markers.push(0, 1, 2, 3, 4, 5)
    }
    return markers.filter(m => m <= maxTime)
  }, [maxTime])

  return (
    <svg
      ref={svgRef}
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      className="reverb-decay-curve"
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

      {/* Grid lines */}
      {showGrid && timeMarkers.map((t, i) => (
        <g key={i}>
          <line
            x1={timeToX(t)}
            y1={padding.top}
            x2={timeToX(t)}
            y2={padding.top + graphHeight}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={1}
          />
          <text
            x={timeToX(t)}
            y={height - 4}
            textAnchor="middle"
            fill="#666"
            fontSize={8}
          >
            {t < 1 ? `${(t * 1000).toFixed(0)}ms` : `${t.toFixed(1)}s`}
          </text>
        </g>
      ))}

      {/* Horizontal grid lines */}
      {showGrid && [0.25, 0.5, 0.75].map((a, i) => (
        <line
          key={i}
          x1={padding.left}
          y1={ampToY(a)}
          x2={padding.left + graphWidth}
          y2={ampToY(a)}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth={1}
        />
      ))}

      {/* Pre-delay marker */}
      {preDelay > 0 && (
        <line
          x1={timeToX(preDelay / 1000)}
          y1={padding.top}
          x2={timeToX(preDelay / 1000)}
          y2={padding.top + graphHeight}
          stroke={accentColor}
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.4}
        />
      )}

      {/* RT60 marker */}
      <line
        x1={timeToX(decayTime)}
        y1={padding.top}
        x2={timeToX(decayTime)}
        y2={padding.top + graphHeight}
        stroke={accentColor}
        strokeWidth={1}
        strokeDasharray="4 2"
        opacity={0.6}
      />

      {/* Decay envelope fill */}
      <path
        d={`${decayPath} L ${timeToX(maxTime)} ${ampToY(0)} L ${padding.left} ${ampToY(0)} Z`}
        fill={`url(#decay-gradient-${accentColor.replace('#', '')})`}
        opacity={0.3}
      />

      {/* Decay envelope line */}
      <path
        d={decayPath}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Early reflection spikes */}
      {earlyReflectionSpikes.map((spike, i) => (
        <line
          key={i}
          x1={timeToX(spike.time)}
          y1={ampToY(0)}
          x2={timeToX(spike.time)}
          y2={ampToY(spike.amplitude)}
          stroke={accentColor}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.8}
        />
      ))}

      {/* RT60 label */}
      <text
        x={timeToX(decayTime) + 4}
        y={padding.top + 12}
        fill={accentColor}
        fontSize={9}
        fontWeight="bold"
      >
        RT60
      </text>

      {/* Gradient definition */}
      <defs>
        <linearGradient
          id={`decay-gradient-${accentColor.replace('#', '')}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.6} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      <style>{`
        .reverb-decay-curve {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>
    </svg>
  )
}

export default ReverbDecayCurve
