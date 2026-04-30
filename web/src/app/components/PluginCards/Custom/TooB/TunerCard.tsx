/**
 * TunerCard - TooB Tuner
 *
 * Uses CarbonCardShell directly (utility category).
 * Read-only output ports: frequency, note, cents.
 */

import { CarbonCardShell } from '../../Base/CarbonCardShell'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const OUTPUT_MAP = {
  frequency: 0,
  note: 1,
  cents: 2,
}

function TunerCardBase({
  plugin,
  parameterValues,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const frequency = parameterValues[OUTPUT_MAP.frequency] ?? 0
  const noteIndex = Math.round(parameterValues[OUTPUT_MAP.note] ?? 69)
  const cents = parameterValues[OUTPUT_MAP.cents] ?? 0

  const noteName = NOTE_NAMES[noteIndex % 12]
  const octave = Math.floor(noteIndex / 12) - 1
  const inTune = Math.abs(cents) < 5
  const sharp = cents > 0
  const flat = cents < 0

  const visualization = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      {/* Main Note Display */}
      <div style={{
        fontSize: compact ? 67 : 101, fontWeight: 'bold',
        color: inTune ? accentColor : '#fff',
        fontFamily: 'var(--font-mono)',
        textShadow: inTune ? `0 0 20px ${accentColor}` : 'none',
        transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
      }}>
        {frequency > 0 ? `${noteName}${octave}` : '--'}
      </div>

      {/* Cents Display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, width: '100%', maxWidth: 300 }}>
        <div style={{ fontSize: 24, color: flat && !inTune ? '#ff6b6b' : '#333', transition: 'all var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)' }}>&#9837;</div>
        <div style={{ flex: 1, height: 17, background: '#222', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: accentColor, transform: 'translateX(-50%)' }} />
          {frequency > 0 && (
            // T2474 E2: Was rendering an 8px tuner-needle dot with a 10px
            // boxShadow glow halo in #ffaa00 (sharp) / #ff6b6b (flat).
            // Per Q1=A (no glow halos) the dot is now flat. Sharp/flat
            // states route through MAP semantic alert tokens (advisory
            // for sharp/flat-but-acceptable, critical for hard-flat).
            // Position-on-bar already conveys cents-of-error precisely.
            <div style={{
              position: 'absolute', left: `${50 + (cents / 50) * 50}%`, top: '50%',
              width: 8, height: 8,
              background: inTune ? accentColor : sharp ? 'var(--map2-alert-advisory, #f1c21b)' : 'var(--map2-health-critical, #fa4d56)',
              borderRadius: '50%', transform: 'translate(-50%, -50%)',
              transition: 'left 0.05s ease-out',
            }} />
          )}
        </div>
        <div style={{ fontSize: 24, color: sharp && !inTune ? '#ffaa00' : '#333', transition: 'all var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)' }}>&#9839;</div>
      </div>

      {/* Frequency and cents readout */}
      <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#666', fontFamily: 'var(--font-mono)' }}>
        <span>{frequency > 0 ? `${frequency.toFixed(1)} Hz` : '-- Hz'}</span>
        <span style={{ color: inTune ? accentColor : cents > 0 ? '#ffaa00' : '#ff6b6b' }}>
          {frequency > 0 ? `${cents >= 0 ? '+' : ''}${cents.toFixed(0)} cents` : '-- cents'}
        </span>
      </div>
    </div>
  )

  return (
    <CarbonCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
      cardHeight={420}
    >
      {/* In Tune Indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
        <div style={{
          padding: '12px 32px',
          background: inTune && frequency > 0 ? accentColor : '#222',
          borderRadius: 8,
          border: `2px solid ${inTune && frequency > 0 ? accentColor : '#444'}`,
          color: inTune && frequency > 0 ? '#000' : '#666',
          fontSize: 14, fontWeight: 'bold',
          transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
        }}>
          {frequency === 0 ? 'No Signal' : inTune ? 'In Tune' : 'Tuning...'}
        </div>
      </div>
    </CarbonCardShell>
  )
}

export { TunerCardBase as TunerCard }
export default TunerCardBase
