/**
 * DelayTapGrid Component
 *
 * Visual representation of delay taps and feedback pattern.
 * Shows the decay of repeated echoes over time.
 */

import { useMemo } from 'react'

interface DelayTapGridProps {
  delayTimeL: number // ms
  delayTimeR?: number // ms (if stereo)
  feedback: number // 0-1 or 0-100
  pingPong?: boolean
  modulationRate?: number
  modulationDepth?: number
  width?: number
  height?: number
  accentColor?: string
  maxTaps?: number
}

export function DelayTapGrid({
  delayTimeL,
  delayTimeR,
  feedback,
  pingPong = false,
  modulationRate,
  modulationDepth,
  width = 280,
  height = 80,
  accentColor = '#45b7d1',
  maxTaps = 8,
}: DelayTapGridProps) {
  const padding = { top: 8, right: 12, bottom: 16, left: 12 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom

  // Normalize feedback to 0-1 range
  const feedbackNorm = feedback > 1 ? feedback / 100 : feedback

  // Calculate tap positions and amplitudes
  const taps = useMemo(() => {
    const result: Array<{
      time: number
      amplitude: number
      channel: 'L' | 'R' | 'both'
      x: number
      y: number
    }> = []

    // Calculate total time span
    const maxTime = delayTimeL * maxTaps
    const timeToX = (t: number) => padding.left + (t / maxTime) * graphWidth

    let amp = 1
    for (let i = 0; i < maxTaps && amp > 0.01; i++) {
      const time = delayTimeL * (i + 1)
      const channel = pingPong ? (i % 2 === 0 ? 'L' : 'R') : 'both'

      // If stereo with different times, alternate
      const actualTime = pingPong && delayTimeR && i % 2 === 1
        ? delayTimeR * Math.floor((i + 1) / 2)
        : time

      result.push({
        time: actualTime,
        amplitude: amp,
        channel,
        x: timeToX(actualTime),
        y: padding.top + graphHeight * (1 - amp),
      })

      amp *= feedbackNorm
    }

    return result
  }, [delayTimeL, delayTimeR, feedbackNorm, pingPong, maxTaps, graphWidth, graphHeight])

  // Time labels
  const maxTimeMs = delayTimeL * maxTaps
  const timeLabels = useMemo(() => {
    const labels: number[] = []
    const step = maxTimeMs <= 500 ? 100 : maxTimeMs <= 1000 ? 200 : maxTimeMs <= 2000 ? 500 : 1000
    for (let t = 0; t <= maxTimeMs; t += step) {
      labels.push(t)
    }
    return labels
  }, [maxTimeMs])

  const formatTime = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="delay-tap-grid"
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

      {/* Time grid lines */}
      {timeLabels.map((t, i) => {
        const x = padding.left + (t / maxTimeMs) * graphWidth
        return (
          <g key={i}>
            <line
              x1={x}
              y1={padding.top}
              x2={x}
              y2={padding.top + graphHeight}
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={height - 2}
              textAnchor="middle"
              fill="#555"
              fontSize={8}
            >
              {formatTime(t)}
            </text>
          </g>
        )
      })}

      {/* Decay envelope line */}
      {taps.length > 0 && (
        <path
          d={`M ${padding.left} ${padding.top + graphHeight} ${taps.map(t => `L ${t.x} ${t.y}`).join(' ')} L ${taps[taps.length - 1].x} ${padding.top + graphHeight}`}
          fill="none"
          stroke={accentColor}
          strokeWidth={1}
          strokeDasharray="4 2"
          opacity={0.4}
        />
      )}

      {/* Tap bars */}
      {taps.map((tap, i) => {
        const barWidth = Math.max(4, graphWidth / maxTaps / 2)
        const barHeight = tap.amplitude * graphHeight

        // Color based on channel
        const color = tap.channel === 'L'
          ? '#4ecdc4'
          : tap.channel === 'R'
            ? '#f59e0b'
            : accentColor

        return (
          <g key={i}>
            {/* Bar */}
            <rect
              x={tap.x - barWidth / 2}
              y={padding.top + graphHeight - barHeight}
              width={barWidth}
              height={barHeight}
              fill={color}
              opacity={0.8}
              rx={2}
            />
            {/* Glow effect */}
            <rect
              x={tap.x - barWidth / 2}
              y={padding.top + graphHeight - barHeight}
              width={barWidth}
              height={barHeight}
              fill={color}
              opacity={0.3}
              rx={2}
              filter="blur(2px)"
            />
          </g>
        )
      })}

      {/* Modulation indicator */}
      {modulationRate && modulationDepth && modulationDepth > 0 && (
        <g>
          <text
            x={padding.left + graphWidth - 4}
            y={padding.top + 10}
            textAnchor="end"
            fill={accentColor}
            fontSize={8}
            opacity={0.7}
          >
            MOD
          </text>
          {/* Simple wave indicator */}
          <path
            d={`M ${width - padding.right - 30} ${padding.top + 14}
                q 5 -4 10 0
                q 5 4 10 0`}
            fill="none"
            stroke={accentColor}
            strokeWidth={1}
            opacity={0.5}
          />
        </g>
      )}

      {/* Ping-pong indicator */}
      {pingPong && (
        <g>
          <text
            x={padding.left + 4}
            y={padding.top + 10}
            fill="#4ecdc4"
            fontSize={7}
          >
            L
          </text>
          <text
            x={padding.left + 14}
            y={padding.top + 10}
            fill="#f59e0b"
            fontSize={7}
          >
            R
          </text>
        </g>
      )}

      {/* Feedback percentage */}
      <text
        x={padding.left + graphWidth}
        y={padding.top + graphHeight - 4}
        textAnchor="end"
        fill={accentColor}
        fontSize={9}
        fontWeight="bold"
        fontFamily="monospace"
      >
        {(feedbackNorm * 100).toFixed(0)}%
      </text>

      <style>{`
        .delay-tap-grid {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>
    </svg>
  )
}

export default DelayTapGrid
