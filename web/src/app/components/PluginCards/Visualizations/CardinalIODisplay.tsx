/**
 * CardinalIODisplay Component
 *
 * Visualization of Cardinal's audio and CV input/output configuration.
 * Shows a VCV Rack-inspired port layout with connection indicators.
 */

import { useMemo } from 'react'

export type CardinalVariant = 'main' | 'synth' | 'fx' | 'mini'

export interface CardinalIODisplayProps {
  variant: CardinalVariant
  width?: number
  height?: number
  accentColor?: string
  midiActive?: boolean
}

interface IOConfig {
  audioIn: number
  audioOut: number
  cvIn: number
  cvOut: number
  midi: boolean
}

const VARIANT_CONFIGS: Record<CardinalVariant, IOConfig> = {
  main: { audioIn: 8, audioOut: 8, cvIn: 10, cvOut: 10, midi: true },
  synth: { audioIn: 0, audioOut: 2, cvIn: 0, cvOut: 0, midi: true },
  fx: { audioIn: 2, audioOut: 2, cvIn: 0, cvOut: 0, midi: true },
  mini: { audioIn: 2, audioOut: 2, cvIn: 5, cvOut: 5, midi: false },
}

const VARIANT_LABELS: Record<CardinalVariant, string> = {
  main: 'Cardinal',
  synth: 'Cardinal Synth',
  fx: 'Cardinal FX',
  mini: 'Cardinal Mini',
}

export function CardinalIODisplay({
  variant,
  width = 280,
  height = 80,
  accentColor = '#8b5cf6',
  midiActive = false,
}: CardinalIODisplayProps) {
  const config = VARIANT_CONFIGS[variant]
  const label = VARIANT_LABELS[variant]

  // Calculate layout
  const padding = { top: 12, right: 12, bottom: 8, left: 12 }
  const contentWidth = width - padding.left - padding.right
  const contentHeight = height - padding.top - padding.bottom

  // Port sizes
  const portSize = 6
  const portSpacing = 10
  const sectionGap = 20

  // Generate port positions
  const ports = useMemo(() => {
    const result: Array<{
      x: number
      y: number
      type: 'audio' | 'cv' | 'midi'
      direction: 'in' | 'out'
      index: number
    }> = []

    let currentX = padding.left

    // Audio inputs
    if (config.audioIn > 0) {
      const audioInWidth = config.audioIn * portSpacing
      for (let i = 0; i < config.audioIn; i++) {
        result.push({
          x: currentX + i * portSpacing + portSpacing / 2,
          y: padding.top + 20,
          type: 'audio',
          direction: 'in',
          index: i,
        })
      }
      currentX += audioInWidth + sectionGap
    }

    // CV inputs
    if (config.cvIn > 0) {
      const cvInWidth = config.cvIn * portSpacing
      for (let i = 0; i < config.cvIn; i++) {
        result.push({
          x: currentX + i * portSpacing + portSpacing / 2,
          y: padding.top + 20,
          type: 'cv',
          direction: 'in',
          index: i,
        })
      }
      currentX += cvInWidth + sectionGap
    }

    // MIDI
    if (config.midi) {
      result.push({
        x: currentX + portSpacing / 2,
        y: padding.top + 20,
        type: 'midi',
        direction: 'in',
        index: 0,
      })
      currentX += portSpacing + sectionGap
    }

    // Output section starts from right
    currentX = width - padding.right

    // Audio outputs (from right)
    if (config.audioOut > 0) {
      const audioOutWidth = config.audioOut * portSpacing
      currentX -= audioOutWidth
      for (let i = 0; i < config.audioOut; i++) {
        result.push({
          x: currentX + i * portSpacing + portSpacing / 2,
          y: padding.top + 45,
          type: 'audio',
          direction: 'out',
          index: i,
        })
      }
    }

    // CV outputs
    if (config.cvOut > 0) {
      currentX -= sectionGap + config.cvOut * portSpacing
      for (let i = 0; i < config.cvOut; i++) {
        result.push({
          x: currentX + i * portSpacing + portSpacing / 2,
          y: padding.top + 45,
          type: 'cv',
          direction: 'out',
          index: i,
        })
      }
    }

    return result
  }, [config, width, padding])

  // Port colors
  const getPortColor = (type: 'audio' | 'cv' | 'midi', active = false) => {
    switch (type) {
      case 'audio':
        return active ? '#22c55e' : '#22c55e80'
      case 'cv':
        return active ? '#f59e0b' : '#f59e0b80'
      case 'midi':
        return active ? '#ec4899' : '#ec489980'
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Background */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(0, 0, 0, 0.3)"
        rx={4}
      />

      {/* VCV-style panel lines */}
      <line
        x1={padding.left}
        y1={padding.top + 35}
        x2={width - padding.right}
        y2={padding.top + 35}
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={1}
      />

      {/* Section labels */}
      <text
        x={padding.left}
        y={padding.top + 8}
        fill="rgba(255, 255, 255, 0.5)"
        fontSize={8}
        style={{ textTransform: 'uppercase' }}
      >
        IN
      </text>

      <text
        x={width - padding.right}
        y={height - padding.bottom}
        fill="rgba(255, 255, 255, 0.5)"
        fontSize={8}
        textAnchor="end"
        style={{ textTransform: 'uppercase' }}
      >
        OUT
      </text>

      {/* IO Summary text */}
      <text
        x={width / 2}
        y={padding.top + 8}
        fill={accentColor}
        fontSize={9}
        textAnchor="middle"
        fontFamily="monospace"
      >
        {config.audioIn > 0 ? `${config.audioIn}A` : ''}
        {config.cvIn > 0 ? ` ${config.cvIn}CV` : ''}
        {config.midi ? ' MIDI' : ''}
        {' → '}
        {config.audioOut > 0 ? `${config.audioOut}A` : ''}
        {config.cvOut > 0 ? ` ${config.cvOut}CV` : ''}
      </text>

      {/* Render ports */}
      {ports.map((port, i) => (
        <g key={i}>
          {/* Port background ring */}
          <circle
            cx={port.x}
            cy={port.y}
            r={portSize}
            fill="rgba(0, 0, 0, 0.5)"
            stroke={getPortColor(port.type, port.type === 'midi' && midiActive)}
            strokeWidth={1.5}
          />

          {/* Port center */}
          <circle
            cx={port.x}
            cy={port.y}
            r={portSize - 3}
            fill={getPortColor(port.type, port.type === 'midi' && midiActive)}
          />

          {/* Active glow for MIDI */}
          {port.type === 'midi' && midiActive && (
            <circle
              cx={port.x}
              cy={port.y}
              r={portSize + 2}
              fill="none"
              stroke="#ec4899"
              strokeWidth={2}
              opacity={0.5}
            >
              <animate
                attributeName="opacity"
                values="0.5;0.2;0.5"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      ))}

      {/* Legend */}
      <g transform={`translate(${padding.left}, ${height - padding.bottom - 2})`}>
        <circle cx={4} cy={0} r={3} fill="#22c55e80" />
        <text x={10} y={3} fill="rgba(255, 255, 255, 0.4)" fontSize={7}>
          Audio
        </text>

        {(config.cvIn > 0 || config.cvOut > 0) && (
          <>
            <circle cx={50} cy={0} r={3} fill="#f59e0b80" />
            <text x={56} y={3} fill="rgba(255, 255, 255, 0.4)" fontSize={7}>
              CV
            </text>
          </>
        )}

        {config.midi && (
          <>
            <circle cx={82} cy={0} r={3} fill="#ec489980" />
            <text x={88} y={3} fill="rgba(255, 255, 255, 0.4)" fontSize={7}>
              MIDI
            </text>
          </>
        )}
      </g>
    </svg>
  )
}

export default CardinalIODisplay
