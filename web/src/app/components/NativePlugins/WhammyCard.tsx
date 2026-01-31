import { useState, useEffect } from 'react'
import { Music, ArrowUpDown } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { WhammyStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface WhammyCardProps {
  status: WhammyStatus
  onPitchChange?: (pitch: number) => void
  onDryChange?: (dry: number) => void
  onWetChange?: (wet: number) => void
  onBypassChange?: (bypass: boolean) => void
}

// Pitch presets for quick selection (in semitones)
const PITCH_PRESETS = [
  { label: '-2 Oct', value: -24 },
  { label: '-1 Oct', value: -12 },
  { label: '-5th', value: -7 },
  { label: '-4th', value: -5 },
  { label: 'Unison', value: 0 },
  { label: '+4th', value: 5 },
  { label: '+5th', value: 7 },
  { label: '+1 Oct', value: 12 },
  { label: '+2 Oct', value: 24 },
]

export function WhammyCard({
  status,
  onPitchChange,
  onDryChange,
  onWetChange,
  onBypassChange
}: WhammyCardProps) {
  const [pitch, setPitch] = useState(status.pitch)
  const [dry, setDry] = useState(status.dry)
  const [wet, setWet] = useState(status.wet)

  useEffect(() => {
    setPitch(status.pitch)
    setDry(status.dry)
    setWet(status.wet)
  }, [status])

  // Format pitch display
  const formatPitch = (semitones: number) => {
    if (semitones === 0) return 'Unison'
    const sign = semitones > 0 ? '+' : ''
    const octaves = Math.floor(Math.abs(semitones) / 12)
    const remaining = Math.abs(semitones) % 12
    if (octaves > 0 && remaining === 0) {
      return `${sign}${semitones > 0 ? octaves : -octaves} Oct`
    }
    return `${sign}${semitones} st`
  }

  // Calculate pitch visualization position (0-100%)
  const pitchPosition = ((pitch + 24) / 48) * 100

  return (
    <PluginCard
      title="dm-Whammy"
      icon={<Music size={24} />}
      color="whammy"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="whammy" />

      {/* Pitch Visualization */}
      <div style={{
        marginBottom: 20,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(0, 0, 0, 0.3))',
        borderRadius: 10,
        border: '1px solid rgba(236, 72, 153, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowUpDown size={16} style={{ color: '#ec4899' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#ec4899', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Pitch Shift
            </span>
          </div>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#ec4899',
            fontFamily: 'monospace',
          }}>
            {formatPitch(pitch)}
          </span>
        </div>

        {/* Pitch slider visualization */}
        <div style={{
          height: 50,
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 6,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Center line (unison) */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 2,
            background: 'rgba(236, 72, 153, 0.4)',
          }} />

          {/* Octave markers */}
          {[-24, -12, 0, 12, 24].map((marker) => (
            <div
              key={marker}
              style={{
                position: 'absolute',
                left: `${((marker + 24) / 48) * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: marker === 0 ? 'rgba(236, 72, 153, 0.6)' : 'rgba(255, 255, 255, 0.1)',
              }}
            />
          ))}

          {/* Pitch indicator */}
          <div style={{
            position: 'absolute',
            left: `${pitchPosition}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 36,
            background: 'linear-gradient(180deg, #ec4899, #db2777)',
            borderRadius: 6,
            boxShadow: '0 0 20px rgba(236, 72, 153, 0.6)',
            transition: 'left 0.1s ease-out',
          }} />

          {/* Pitch range fill */}
          <div style={{
            position: 'absolute',
            left: pitch >= 0 ? '50%' : `${pitchPosition}%`,
            width: `${Math.abs(pitch) / 48 * 50}%`,
            top: '35%',
            height: '30%',
            background: `linear-gradient(${pitch >= 0 ? '90deg' : '270deg'}, rgba(236, 72, 153, 0.4), rgba(236, 72, 153, 0.1))`,
            borderRadius: 3,
            transition: 'all 0.1s ease-out',
          }} />
        </div>

        {/* Scale labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 9,
          color: '#888',
        }}>
          <span>-2 Oct</span>
          <span>-1 Oct</span>
          <span style={{ color: '#ec4899' }}>0</span>
          <span>+1 Oct</span>
          <span>+2 Oct</span>
        </div>
      </div>

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Pitch Presets */}
      <div style={{ marginBottom: 16 }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#ec4899', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Presets
        </h5>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PITCH_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => { setPitch(preset.value); onPitchChange?.(preset.value) }}
              style={{
                padding: '6px 10px',
                background: pitch === preset.value ? '#ec4899' : 'rgba(236, 72, 153, 0.15)',
                color: pitch === preset.value ? '#fff' : '#ec4899',
                border: `1px solid rgba(236, 72, 153, ${pitch === preset.value ? '0.8' : '0.3'})`,
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pitch Slider */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(236, 72, 153, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#ec4899', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Pitch Control
        </h5>
        <ParameterSlider
          label="Pitch"
          value={pitch}
          min={-24}
          max={24}
          unit=" st"
          valueFormatter={(v) => v > 0 ? `+${v}` : `${v}`}
          onChange={(v) => { setPitch(v); onPitchChange?.(v) }}
        />
      </div>

      {/* Level Controls */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(236, 72, 153, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#ec4899', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Levels
        </h5>
        <ParameterSlider
          label="Dry Level"
          value={dry}
          min={-70}
          max={6}
          unit=" dB"
          valueFormatter={(v) => v <= -70 ? '-∞' : v > 0 ? `+${v}` : `${v}`}
          onChange={(v) => { setDry(v); onDryChange?.(v) }}
        />
        <ParameterSlider
          label="Wet Level"
          value={wet}
          min={-70}
          max={6}
          unit=" dB"
          valueFormatter={(v) => v <= -70 ? '-∞' : v > 0 ? `+${v}` : `${v}`}
          onChange={(v) => { setWet(v); onWetChange?.(v) }}
        />
      </div>

      {/* Bypass */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 8 }}>
        <input
          type="checkbox"
          id="whammy-bypass"
          checked={status.bypass}
          onChange={(e) => onBypassChange?.(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="whammy-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
          Bypass
        </label>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: '1px solid rgba(236, 72, 153, 0.2)',
        paddingTop: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status.available ? '#22c55e' : '#666',
            boxShadow: status.available ? '0 0 8px #22c55e' : 'none',
          }} />
          <span style={{ color: status.available ? '#22c55e' : '#666' }}>
            {status.available ? 'Pitch Engine Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
          <span>Latency: <span style={{ color: '#ec4899', fontWeight: 600 }}>{status.latency}ms</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
