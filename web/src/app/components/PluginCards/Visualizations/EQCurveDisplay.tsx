/**
 * EQCurveDisplay Component
 *
 * SVG visualization of EQ frequency response.
 * Adapts to any number of bands from plugin parameters.
 */

import { useMemo, useRef } from 'react'
import { useResponsiveVizSize } from './useResponsiveVizSize'

export interface EQBandData {
  frequency: number // Hz
  gain: number // dB
  q?: number // Q factor
  type?: 'peak' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch' | 'bandpass'
  enabled?: boolean
}

interface EQCurveDisplayProps {
  bands: EQBandData[]
  outputGain?: number
  width?: number
  height?: number
  accentColor?: string
  showGrid?: boolean
  interactive?: boolean
  selectedBand?: number | null
  onBandSelect?: (index: number | null) => void
  compact?: boolean
}

// Calculate filter response at a given frequency
function calculateBandResponse(freq: number, band: EQBandData): number {
  if (band.enabled === false) return 0

  const { frequency, gain, q = 1, type = 'peak' } = band

  switch (type) {
    case 'peak': {
      // Bell filter response approximation
      const ratio = freq / frequency
      const bw = 1 / q
      const factor = Math.pow(ratio, 2) - 1
      const denominator = Math.pow(factor, 2) + Math.pow(bw * ratio, 2)
      if (denominator === 0) return gain
      const response = gain * Math.pow(bw * ratio, 2) / denominator
      return response
    }
    case 'lowshelf': {
      // Low shelf response
      const ratio = freq / frequency
      const response = gain * (1 - ratio) / (1 + ratio * ratio)
      return Math.max(-24, Math.min(24, response))
    }
    case 'highshelf': {
      // High shelf response
      const ratio = freq / frequency
      const response = gain * ratio / (1 + ratio * ratio / 4)
      return Math.max(-24, Math.min(24, response))
    }
    case 'lowpass': {
      if (freq > frequency) {
        const octaves = Math.log2(freq / frequency)
        return -12 * octaves // -12dB/octave
      }
      return 0
    }
    case 'highpass': {
      if (freq < frequency) {
        const octaves = Math.log2(frequency / freq)
        return -12 * octaves
      }
      return 0
    }
    case 'notch': {
      const ratio = freq / frequency
      const bw = 0.1 / q
      const factor = Math.abs(1 - ratio)
      if (factor < bw) {
        return gain * (factor / bw - 1)
      }
      return 0
    }
    default:
      return 0
  }
}

export function EQCurveDisplay({
  bands,
  outputGain = 0,
  width,
  height,
  accentColor = '#4ecdc4',
  showGrid = true,
  interactive = false,
  selectedBand = null,
  onBandSelect,
  compact = false,
}: EQCurveDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResponsiveVizSize(svgRef as any, {
    width,
    height,
    aspectRatio: 320 / 120,
    baseOn: 'width',
    defaultWidth: 320,
    defaultHeight: 120,
  })

  const finalWidth = dimensions.width
  const finalHeight = dimensions.height
  const padding = { top: 12, right: 16, bottom: 24, left: 40 }
  const graphWidth = finalWidth - padding.left - padding.right
  const graphHeight = finalHeight - padding.top - padding.bottom

  // Frequency range (logarithmic)
  const minFreq = 20
  const maxFreq = 20000
  const minLog = Math.log10(minFreq)
  const maxLog = Math.log10(maxFreq)

  // dB range
  const minDb = -24
  const maxDb = 24

  const freqToX = (freq: number) => {
    const t = (Math.log10(Math.max(minFreq, Math.min(maxFreq, freq))) - minLog) / (maxLog - minLog)
    return padding.left + t * graphWidth
  }

  const dbToY = (db: number) => {
    const clamped = Math.max(minDb, Math.min(maxDb, db))
    const t = (clamped - minDb) / (maxDb - minDb)
    return padding.top + graphHeight - t * graphHeight
  }

  // Generate response curve
  const responsePath = useMemo(() => {
    const points: string[] = []
    const steps = 128

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const freq = Math.pow(10, minLog + t * (maxLog - minLog))

      // Sum all band responses
      let totalDb = outputGain
      for (const band of bands) {
        totalDb += calculateBandResponse(freq, band)
      }

      const x = padding.left + t * graphWidth
      const y = dbToY(totalDb)
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    }

    return points.join(' ')
  }, [bands, outputGain, graphWidth, graphHeight])

  // Band markers
  const bandMarkers = useMemo(() => {
    return bands.map((band, index) => ({
      x: freqToX(band.frequency),
      y: dbToY(band.gain),
      band,
      index,
    }))
  }, [bands, graphWidth, graphHeight])

  // Frequency grid labels
  const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  const dbLabels = [-24, -12, 0, 12, 24]

  const formatFreq = (freq: number) => freq >= 1000 ? `${freq / 1000}k` : `${freq}`

  return (
    <svg
      ref={svgRef}
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      className="eq-curve-display"
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
      {showGrid && (
        <>
          {/* Vertical frequency lines */}
          {freqLabels.map((freq, i) => {
            const x = freqToX(freq)
            return (
              <g key={`f-${i}`}>
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
                  y={height - 4}
                  textAnchor="middle"
                  fill="#555"
                  fontSize={8}
                >
                  {formatFreq(freq)}
                </text>
              </g>
            )
          })}

          {/* Horizontal dB lines */}
          {dbLabels.map((db, i) => {
            const y = dbToY(db)
            return (
              <g key={`db-${i}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + graphWidth}
                  y2={y}
                  stroke={db === 0 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)'}
                  strokeWidth={db === 0 ? 1 : 1}
                />
                <text
                  x={padding.left - 4}
                  y={y + 3}
                  textAnchor="end"
                  fill="#555"
                  fontSize={8}
                >
                  {db > 0 ? `+${db}` : db}
                </text>
              </g>
            )
          })}
        </>
      )}

      {/* Response curve fill */}
      <path
        d={`${responsePath} L ${padding.left + graphWidth} ${dbToY(0)} L ${padding.left} ${dbToY(0)} Z`}
        fill={`url(#eq-gradient-${accentColor.replace('#', '')})`}
        opacity={0.2}
      />

      {/* Response curve line */}
      <path
        d={responsePath}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Band markers */}
      {bandMarkers.map(({ x, y, band, index }) => (
        <g
          key={index}
          className={`eq-band-marker ${selectedBand === index ? 'selected' : ''}`}
          onClick={() => interactive && onBandSelect?.(selectedBand === index ? null : index)}
          style={{ cursor: interactive ? 'pointer' : 'default' }}
        >
          <circle
            cx={x}
            cy={y}
            r={selectedBand === index ? 8 : 6}
            fill={band.enabled !== false ? accentColor : '#444'}
            stroke={selectedBand === index ? '#fff' : 'rgba(255,255,255,0.3)'}
            strokeWidth={selectedBand === index ? 2 : 1}
            opacity={band.enabled !== false ? 1 : 0.4}
          />
          <text
            x={x}
            y={y + 3}
            textAnchor="middle"
            fill={band.enabled !== false ? '#fff' : '#888'}
            fontSize={8}
            fontWeight="bold"
            pointerEvents="none"
          >
            {index + 1}
          </text>
        </g>
      ))}

      {/* Gradient definition */}
      <defs>
        <linearGradient
          id={`eq-gradient-${accentColor.replace('#', '')}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.8} />
          <stop offset="50%" stopColor={accentColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
        </linearGradient>
      </defs>

      <style>{`
        .eq-curve-display {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }

        .eq-band-marker.selected circle {
          filter: drop-shadow(0 0 6px ${accentColor});
        }
      `}</style>
    </svg>
  )
}

export default EQCurveDisplay
