/**
 * TunerCard - TooB Tuner
 *
 * Chromatic guitar tuner with pitch detection.
 *
 * Output ports (read-only):
 * - frequency: Detected frequency in Hz
 * - note: Detected note (MIDI number or index)
 * - cents: Deviation from target pitch in cents
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { PitchDisplay } from '../../Visualizations/PitchDisplay'
import type { PluginCardProps } from '../../types'

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// Output port indices
const OUTPUT_MAP = {
  frequency: 0,
  note: 1,
  cents: 2,
}

export function TunerCard({
  plugin,
  parameterValues,
  accentColor = '#22c55e',
  compact = false,
}: PluginCardProps) {
  // For tuner, we read from output ports
  const frequency = parameterValues[OUTPUT_MAP.frequency] ?? 0
  const noteIndex = Math.round(parameterValues[OUTPUT_MAP.note] ?? 69) // Default to A4
  const cents = parameterValues[OUTPUT_MAP.cents] ?? 0

  // Calculate note name and octave from MIDI note number
  const noteName = NOTE_NAMES[noteIndex % 12]
  const octave = Math.floor(noteIndex / 12) - 1

  // Determine if in tune (within 5 cents)
  const inTune = Math.abs(cents) < 5
  const sharp = cents > 0
  const flat = cents < 0

  const visualization = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '20px' }}>
      {/* Main Note Display */}
      <div
        style={{
          fontSize: compact ? '48px' : '72px',
          fontWeight: 'bold',
          color: inTune ? accentColor : '#fff',
          fontFamily: 'monospace',
          textShadow: inTune ? `0 0 20px ${accentColor}` : 'none',
          transition: 'all 0.2s',
        }}
      >
        {frequency > 0 ? `${noteName}${octave}` : '--'}
      </div>

      {/* Cents Display */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          width: '100%',
          maxWidth: '300px',
        }}
      >
        {/* Flat indicator */}
        <div
          style={{
            fontSize: '24px',
            color: flat && !inTune ? '#ff6b6b' : '#333',
            transition: 'all 0.1s',
          }}
        >
          ♭
        </div>

        {/* Cents meter */}
        <div
          style={{
            flex: 1,
            height: '12px',
            background: '#222',
            borderRadius: '6px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Center line */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: '2px',
              background: accentColor,
              transform: 'translateX(-50%)',
            }}
          />

          {/* Pitch indicator */}
          {frequency > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `${50 + (cents / 50) * 50}%`,
                top: '50%',
                width: '8px',
                height: '8px',
                background: inTune ? accentColor : sharp ? '#ffaa00' : '#ff6b6b',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                transition: 'left 0.05s ease-out',
                boxShadow: `0 0 10px ${inTune ? accentColor : sharp ? '#ffaa00' : '#ff6b6b'}`,
              }}
            />
          )}
        </div>

        {/* Sharp indicator */}
        <div
          style={{
            fontSize: '24px',
            color: sharp && !inTune ? '#ffaa00' : '#333',
            transition: 'all 0.1s',
          }}
        >
          ♯
        </div>
      </div>

      {/* Frequency and cents readout */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          fontSize: '12px',
          color: '#666',
          fontFamily: 'monospace',
        }}
      >
        <span>{frequency > 0 ? `${frequency.toFixed(1)} Hz` : '-- Hz'}</span>
        <span
          style={{
            color: inTune ? accentColor : cents > 0 ? '#ffaa00' : '#ff6b6b',
          }}
        >
          {frequency > 0 ? `${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cents` : '-- cents'}
        </span>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* In Tune Indicator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          style={{
            padding: '12px 32px',
            background: inTune && frequency > 0 ? accentColor : '#222',
            borderRadius: '8px',
            border: `2px solid ${inTune && frequency > 0 ? accentColor : '#444'}`,
            color: inTune && frequency > 0 ? '#000' : '#666',
            fontSize: '14px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            transition: 'all 0.2s',
          }}
        >
          {frequency === 0 ? 'No Signal' : inTune ? 'In Tune' : 'Tuning...'}
        </div>
      </div>
    </PluginCardShell>
  )
}

export default TunerCard
