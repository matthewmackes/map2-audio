/**
 * TransferCurve Component
 *
 * SVG visualization of compressor/limiter transfer function.
 * Shows the relationship between input and output levels with
 * threshold, ratio, and knee visualization.
 */

import { useMemo, useRef } from 'react'
import { useResponsiveVizSize } from './useResponsiveVizSize'

interface TransferCurveProps {
  threshold: number // dB, typically -60 to 0
  ratio: number // 1:1 to infinity (20:1+)
  knee: number // dB, soft knee width (0 = hard)
  makeupGain?: number // dB
  inputLevel?: number // dB, for current input indicator
  outputLevel?: number // dB, for current output indicator
  width?: number
  height?: number
  accentColor?: string
  showGrid?: boolean
  minDb?: number
  maxDb?: number
}

export function TransferCurve({
  threshold,
  ratio,
  knee = 0,
  makeupGain = 0,
  inputLevel,
  outputLevel,
  width,
  height,
  accentColor = '#22c55e',
  showGrid = true,
  minDb = -60,
  maxDb = 0,
}: TransferCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Compute responsive dimensions based on container width
  const dimensions = useResponsiveVizSize(svgRef, {
    width,
    height,
    aspectRatio: 200 / 140, // Original aspect ratio (1.43:1)
    baseOn: 'width',
    defaultWidth: 200,
    defaultHeight: 140,
  })
  const padding = { top: 12, right: 12, bottom: 24, left: 32 }
  const finalWidth = dimensions.width
  const finalHeight = dimensions.height
  const graphWidth = finalWidth - padding.left - padding.right
  const graphHeight = finalHeight - padding.top - padding.bottom

  // Convert dB to pixel coordinates
  const dbToX = (db: number) => {
    return padding.left + ((db - minDb) / (maxDb - minDb)) * graphWidth
  }

  const dbToY = (db: number) => {
    return padding.top + graphHeight - ((db - minDb) / (maxDb - minDb)) * graphHeight
  }

  // Calculate transfer function output for given input
  const transferFunction = (inputDb: number): number => {
    // Below threshold: linear (1:1)
    if (inputDb <= threshold - knee / 2) {
      return inputDb + makeupGain
    }

    // Above threshold + knee: compression
    if (inputDb >= threshold + knee / 2 || knee === 0) {
      const overThreshold = inputDb - threshold
      const compressed = threshold + overThreshold / ratio
      return compressed + makeupGain
    }

    // In knee region: smooth transition
    const kneeStart = threshold - knee / 2
    const x = inputDb - kneeStart
    const compression = ((1 / ratio - 1) * Math.pow(x, 2)) / (2 * knee)
    return inputDb + compression + makeupGain
  }

  // Generate curve path
  const curvePath = useMemo(() => {
    const points: string[] = []
    const steps = 100

    for (let i = 0; i <= steps; i++) {
      const inputDb = minDb + (i / steps) * (maxDb - minDb)
      const outputDb = Math.min(maxDb, Math.max(minDb, transferFunction(inputDb)))
      const x = dbToX(inputDb)
      const y = dbToY(outputDb)
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    }

    return points.join(' ')
  }, [threshold, ratio, knee, makeupGain, minDb, maxDb, graphWidth, graphHeight])

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; label?: string; isLabel: boolean }> = []
    const dbSteps = [-48, -36, -24, -12, 0]

    dbSteps.forEach(db => {
      if (db >= minDb && db <= maxDb) {
        // Horizontal lines
        lines.push({
          x1: padding.left,
          y1: dbToY(db),
          x2: padding.left + graphWidth,
          y2: dbToY(db),
          label: `${db}`,
          isLabel: true,
        })
        // Vertical lines
        lines.push({
          x1: dbToX(db),
          y1: padding.top,
          x2: dbToX(db),
          y2: padding.top + graphHeight,
          isLabel: false,
        })
      }
    })

    return lines
  }, [minDb, maxDb, graphWidth, graphHeight])

  // Threshold line
  const thresholdX = dbToX(threshold)
  const thresholdY = dbToY(threshold + makeupGain)

  // Current level indicator
  const hasLevelIndicator = inputLevel !== undefined
  const indicatorInputX = hasLevelIndicator ? dbToX(inputLevel!) : 0
  const indicatorOutputY = hasLevelIndicator ? dbToY(transferFunction(inputLevel!)) : 0

  return (
    <svg
      ref={svgRef}
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      className="transfer-curve"
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
      {showGrid && gridLines.map((line, i) => (
        <g key={i}>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={1}
          />
          {line.isLabel && (
            <text
              x={padding.left - 4}
              y={line.y1}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#666"
              fontSize={8}
            >
              {line.label}
            </text>
          )}
        </g>
      ))}

      {/* Unity (1:1) reference line */}
      <line
        x1={dbToX(minDb)}
        y1={dbToY(minDb)}
        x2={dbToX(maxDb)}
        y2={dbToY(maxDb)}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Threshold indicator */}
      <line
        x1={thresholdX}
        y1={padding.top}
        x2={thresholdX}
        y2={padding.top + graphHeight}
        stroke={accentColor}
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.5}
      />

      {/* Knee region highlight */}
      {knee > 0 && (
        <rect
          x={dbToX(threshold - knee / 2)}
          y={padding.top}
          width={dbToX(threshold + knee / 2) - dbToX(threshold - knee / 2)}
          height={graphHeight}
          fill={accentColor}
          opacity={0.1}
        />
      )}

      {/* Transfer curve */}
      <path
        d={curvePath}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Threshold point */}
      <circle
        cx={thresholdX}
        cy={thresholdY}
        r={4}
        fill={accentColor}
        stroke="#fff"
        strokeWidth={1}
      />

      {/* Current level indicator */}
      {hasLevelIndicator && (
        <g>
          {/* Vertical line from input to curve */}
          <line
            x1={indicatorInputX}
            y1={padding.top + graphHeight}
            x2={indicatorInputX}
            y2={indicatorOutputY}
            stroke="#f59e0b"
            strokeWidth={1}
            opacity={0.6}
          />
          {/* Horizontal line from curve to output */}
          <line
            x1={padding.left}
            y1={indicatorOutputY}
            x2={indicatorInputX}
            y2={indicatorOutputY}
            stroke="#f59e0b"
            strokeWidth={1}
            opacity={0.6}
          />
          {/* Current point on curve */}
          <circle
            cx={indicatorInputX}
            cy={indicatorOutputY}
            r={3}
            fill="#f59e0b"
          />
        </g>
      )}

      {/* Labels */}
      <text
        x={padding.left + graphWidth / 2}
        y={height - 4}
        textAnchor="middle"
        fill="#666"
        fontSize={9}
      >
        Input (dB)
      </text>
      <text
        x={8}
        y={padding.top + graphHeight / 2}
        textAnchor="middle"
        fill="#666"
        fontSize={9}
        transform={`rotate(-90, 8, ${padding.top + graphHeight / 2})`}
      >
        Output
      </text>

      {/* Ratio display */}
      <text
        x={padding.left + graphWidth - 4}
        y={padding.top + 12}
        textAnchor="end"
        fill={accentColor}
        fontSize={10}
        fontWeight="bold"
        fontFamily="monospace"
      >
        {ratio >= 20 ? '∞:1' : `${ratio.toFixed(1)}:1`}
      </text>

      <style>{`
        .transfer-curve {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>
    </svg>
  )
}

export default TransferCurve
