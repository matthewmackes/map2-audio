/**
 * PitchDisplay Component
 *
 * Visual display of pitch shift amount with semitone/cent indicators.
 * Includes note name display and tuner-style visualization.
 */

import { useMemo, useRef } from 'react'
import { useResponsiveVizSize } from './useResponsiveVizSize'

interface PitchDisplayProps {
  semitones: number // -24 to +24 typically
  cents?: number // -100 to +100
  detune?: number // Fine detune
  formant?: number // Formant shift
  width?: number
  height?: number
  accentColor?: string
  showNote?: boolean
  showOctaveIndicator?: boolean
  compact?: boolean
}

// Note names
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function semitonesToNote(semitones: number, cents: number = 0): { note: string; octaveShift: number; centsDisplay: number } {
  const totalSemitones = semitones + cents / 100
  const noteIndex = ((Math.round(totalSemitones) % 12) + 12) % 12
  const octaveShift = Math.floor((totalSemitones + 0.5) / 12)
  const centsDisplay = Math.round((totalSemitones - Math.round(totalSemitones)) * 100)

  return {
    note: NOTE_NAMES[noteIndex],
    octaveShift,
    centsDisplay,
  }
}

export function PitchDisplay({
  semitones,
  cents = 0,
  detune = 0,
  formant = 0,
  width,
  height,
  accentColor = '#06b6d4',
  showNote = true,
  showOctaveIndicator = true,
  compact = false,
}: PitchDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dimensions = useResponsiveVizSize(svgRef as any, {
    width,
    height,
    aspectRatio: 200 / 100,
    baseOn: 'width',
    defaultWidth: 200,
    defaultHeight: 100,
  })

  const finalWidth = dimensions.width
  const finalHeight = dimensions.height
  const padding = { top: 12, right: 12, bottom: 12, left: 12 }
  const displayWidth = finalWidth - padding.left - padding.right
  const displayHeight = finalHeight - padding.top - padding.bottom

  // Calculate note from pitch shift
  const noteInfo = useMemo(() => semitonesToNote(semitones, cents), [semitones, cents])

  // Pitch direction
  const direction = semitones > 0 ? 'up' : semitones < 0 ? 'down' : 'none'

  // Calculate visual position for pitch slider (-24 to +24 range)
  const maxSemitones = 24
  const normalizedPitch = Math.max(-1, Math.min(1, semitones / maxSemitones))
  const pitchX = padding.left + (displayWidth / 2) + (normalizedPitch * displayWidth / 2)

  // Interval name for common shifts
  const intervalName = useMemo(() => {
    const intervals: Record<number, string> = {
      0: 'Unison',
      1: 'Minor 2nd',
      2: 'Major 2nd',
      3: 'Minor 3rd',
      4: 'Major 3rd',
      5: 'Perfect 4th',
      6: 'Tritone',
      7: 'Perfect 5th',
      8: 'Minor 6th',
      9: 'Major 6th',
      10: 'Minor 7th',
      11: 'Major 7th',
      12: 'Octave',
      24: '2 Octaves',
    }
    const absSemi = Math.abs(Math.round(semitones))
    return intervals[absSemi] || `${absSemi} st`
  }, [semitones])

  return (
    <svg
      ref={svgRef}
      width={finalWidth}
      height={finalHeight}
      viewBox={`0 0 ${finalWidth} ${finalHeight}`}
      className="pitch-display"
    >
      {/* Background */}
      <rect
        x={padding.left}
        y={padding.top}
        width={displayWidth}
        height={displayHeight}
        fill="#0a0a0a"
        rx={6}
      />

      {/* Center line (unison) */}
      <line
        x1={padding.left + displayWidth / 2}
        y1={padding.top}
        x2={padding.left + displayWidth / 2}
        y2={padding.top + displayHeight}
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth={1}
      />

      {/* Octave markers */}
      {showOctaveIndicator && [-24, -12, 12, 24].map(st => {
        const x = padding.left + displayWidth / 2 + (st / maxSemitones) * displayWidth / 2
        if (x < padding.left || x > padding.left + displayWidth) return null
        return (
          <g key={st}>
            <line
              x1={x}
              y1={padding.top + displayHeight - 8}
              x2={x}
              y2={padding.top + displayHeight}
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={padding.top + displayHeight - 12}
              textAnchor="middle"
              fill="#666"
              fontSize={7}
            >
              {st > 0 ? `+${st}` : st}
            </text>
          </g>
        )
      })}

      {/* Pitch bar */}
      <rect
        x={semitones >= 0 ? padding.left + displayWidth / 2 : pitchX}
        y={padding.top + 20}
        width={Math.abs(pitchX - (padding.left + displayWidth / 2))}
        height={24}
        fill={accentColor}
        opacity={0.6}
        rx={2}
      />

      {/* Current position indicator */}
      <circle
        cx={pitchX}
        cy={padding.top + 32}
        r={8}
        fill={accentColor}
        stroke="#fff"
        strokeWidth={2}
      />

      {/* Semitone value */}
      <text
        x={padding.left + displayWidth / 2}
        y={padding.top + 16}
        textAnchor="middle"
        fill={accentColor}
        fontSize={14}
        fontWeight="bold"
        fontFamily="monospace"
      >
        {semitones >= 0 ? '+' : ''}{semitones.toFixed(0)}
        {cents !== 0 && (
          <tspan fill="#888" fontSize={10}>
            {cents >= 0 ? '+' : ''}{cents.toFixed(0)}c
          </tspan>
        )}
      </text>

      {/* Interval name */}
      <text
        x={padding.left + displayWidth / 2}
        y={padding.top + displayHeight - 4}
        textAnchor="middle"
        fill="#888"
        fontSize={9}
      >
        {intervalName}
      </text>

      {/* Direction arrows */}
      {direction !== 'none' && (
        <g transform={`translate(${padding.left + displayWidth - 16}, ${padding.top + 32})`}>
          {direction === 'up' ? (
            <path
              d="M 0 6 L 8 6 L 4 -2 Z"
              fill={accentColor}
            />
          ) : (
            <path
              d="M 0 -2 L 8 -2 L 4 6 Z"
              fill={accentColor}
            />
          )}
        </g>
      )}

      {/* Note display */}
      {showNote && (
        <g>
          <rect
            x={padding.left + 4}
            y={padding.top + 24}
            width={32}
            height={20}
            fill="rgba(255, 255, 255, 0.05)"
            rx={4}
          />
          <text
            x={padding.left + 20}
            y={padding.top + 38}
            textAnchor="middle"
            fill="#fff"
            fontSize={11}
            fontWeight="bold"
          >
            {noteInfo.note}
            {noteInfo.octaveShift !== 0 && (
              <tspan fontSize={8} dy={-3}>
                {noteInfo.octaveShift > 0 ? '+' : ''}{noteInfo.octaveShift}
              </tspan>
            )}
          </text>
        </g>
      )}

      {/* Formant indicator if present */}
      {formant !== 0 && (
        <text
          x={padding.left + displayWidth - 4}
          y={padding.top + 12}
          textAnchor="end"
          fill="#888"
          fontSize={8}
        >
          Formant: {formant >= 0 ? '+' : ''}{formant.toFixed(0)}
        </text>
      )}

      <style>{`
        .pitch-display {
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>
    </svg>
  )
}

export default PitchDisplay
