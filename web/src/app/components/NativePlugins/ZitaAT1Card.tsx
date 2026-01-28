import { useState, useEffect } from 'react'
import { Music, Mic2 } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { ZitaAT1Status } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface ZitaAT1CardProps {
  status: ZitaAT1Status
  onTuningChange?: (tuning: number) => void
  onBiasChange?: (bias: number) => void
  onFilterChange?: (filter: number) => void
  onCorrectionChange?: (correction: number) => void
  onOffsetChange?: (offset: number) => void
  onNotesChange?: (notes: boolean[]) => void
  onMidiChange?: (params: { enabled: boolean; channel: number }) => void
  onLowLatencyChange?: (enabled: boolean) => void
  onBypassChange?: (bypass: boolean) => void
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11] // C, D, E, F, G, A, B
const BLACK_KEYS = [1, 3, 6, 8, 10] // C#, D#, F#, G#, A#

export function ZitaAT1Card({
  status,
  onTuningChange,
  onBiasChange,
  onFilterChange,
  onCorrectionChange,
  onOffsetChange,
  onNotesChange,
  onMidiChange,
  onLowLatencyChange,
  onBypassChange
}: ZitaAT1CardProps) {
  const [tuning, setTuning] = useState(status.tuning)
  const [bias, setBias] = useState(status.bias * 100)
  const [filter, setFilter] = useState(status.filter * 100)
  const [correction, setCorrection] = useState(status.correction * 100)
  const [offset, setOffset] = useState(status.offset)
  const [enabledNotes, setEnabledNotes] = useState(status.enabledNotes)
  const [midiEnabled, setMidiEnabled] = useState(status.midiEnabled)
  const [midiChannel, setMidiChannel] = useState(status.midiChannel)
  const [lowLatencyMode, setLowLatencyMode] = useState(status.lowLatencyMode)

  useEffect(() => {
    setTuning(status.tuning)
    setBias(status.bias * 100)
    setFilter(status.filter * 100)
    setCorrection(status.correction * 100)
    setOffset(status.offset)
    setEnabledNotes(status.enabledNotes)
    setMidiEnabled(status.midiEnabled)
    setMidiChannel(status.midiChannel)
    setLowLatencyMode(status.lowLatencyMode)
  }, [status])

  const toggleNote = (index: number) => {
    const newNotes = [...enabledNotes]
    newNotes[index] = !newNotes[index]
    setEnabledNotes(newNotes)
    onNotesChange?.(newNotes)
  }

  const selectScale = (scale: 'chromatic' | 'major' | 'minor' | 'pentatonic') => {
    let newNotes: boolean[]
    switch (scale) {
      case 'chromatic':
        newNotes = Array(12).fill(true)
        break
      case 'major':
        // C Major: C, D, E, F, G, A, B
        newNotes = [true, false, true, false, true, true, false, true, false, true, false, true]
        break
      case 'minor':
        // A Minor (natural): A, B, C, D, E, F, G
        newNotes = [true, false, true, false, true, true, false, true, false, true, true, false]
        break
      case 'pentatonic':
        // Major Pentatonic: C, D, E, G, A
        newNotes = [true, false, true, false, true, false, false, true, false, true, false, false]
        break
      default:
        newNotes = Array(12).fill(true)
    }
    setEnabledNotes(newNotes)
    onNotesChange?.(newNotes)
  }

  // Get pitch error color (green when in tune, red when out of tune)
  const getPitchErrorColor = () => {
    const absError = Math.abs(status.pitchError)
    if (absError < 10) return '#4ade80' // Green - in tune
    if (absError < 25) return '#fbbf24' // Yellow - slightly off
    return '#ef4444' // Red - out of tune
  }

  return (
    <PluginCard
      title="Zita AT1"
      icon={<Music size={24} />}
      color="autotune"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="autotune" />

      {/* Pitch Detection Display */}
      <div style={{
        marginBottom: 20,
        padding: 16,
        background: 'rgba(74, 222, 128, 0.1)',
        border: '1px solid rgba(74, 222, 128, 0.2)',
        borderRadius: 8,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Detected Pitch
        </div>
        <div style={{
          fontSize: 32,
          fontWeight: 700,
          color: status.detectedNote ? '#4ade80' : '#666',
          marginBottom: 4
        }}>
          {status.detectedNote || '--'}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          {status.detectedFrequency > 0 ? `${status.detectedFrequency.toFixed(1)} Hz` : '-- Hz'}
        </div>

        {/* Pitch Error Meter */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Pitch Error</div>
          <div style={{
            position: 'relative',
            height: 8,
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
            {/* Center marker */}
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 2,
              background: 'rgba(255, 255, 255, 0.3)',
              transform: 'translateX(-50%)'
            }} />
            {/* Error indicator */}
            <div style={{
              position: 'absolute',
              left: `${50 + (status.pitchError / 2)}%`,
              top: '50%',
              width: 8,
              height: 8,
              background: getPitchErrorColor(),
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 8px ${getPitchErrorColor()}`,
              transition: 'left 0.1s ease'
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            color: '#666',
            marginTop: 2
          }}>
            <span>-100 cents</span>
            <span style={{ color: getPitchErrorColor() }}>
              {status.pitchError > 0 ? '+' : ''}{status.pitchError.toFixed(0)} cents
            </span>
            <span>+100 cents</span>
          </div>
        </div>
      </div>

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Note Selection Keyboard */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(74, 222, 128, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Target Notes
        </h5>

        {/* Scale presets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {(['chromatic', 'major', 'minor', 'pentatonic'] as const).map((scale) => (
            <button
              key={scale}
              onClick={() => selectScale(scale)}
              style={{
                padding: '4px 10px',
                background: 'rgba(74, 222, 128, 0.15)',
                color: '#4ade80',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.2s ease'
              }}
            >
              {scale}
            </button>
          ))}
        </div>

        {/* Piano keyboard visualization */}
        <div style={{ position: 'relative', height: 60, marginBottom: 8 }}>
          {/* White keys */}
          <div style={{ display: 'flex', gap: 2, height: '100%' }}>
            {WHITE_KEYS.map((noteIndex) => (
              <button
                key={noteIndex}
                onClick={() => toggleNote(noteIndex)}
                style={{
                  flex: 1,
                  background: enabledNotes[noteIndex]
                    ? 'linear-gradient(180deg, #4ade80, #22c55e)'
                    : 'linear-gradient(180deg, #f0f0f0, #d0d0d0)',
                  border: `1px solid ${enabledNotes[noteIndex] ? '#22c55e' : '#999'}`,
                  borderRadius: '0 0 4px 4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingBottom: 4,
                  fontSize: 9,
                  fontWeight: 600,
                  color: enabledNotes[noteIndex] ? '#fff' : '#666',
                  transition: 'all 0.15s ease'
                }}
              >
                {NOTE_NAMES[noteIndex]}
              </button>
            ))}
          </div>
          {/* Black keys */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '60%',
            display: 'flex',
            paddingLeft: 'calc(100% / 14)',
            pointerEvents: 'none'
          }}>
            {BLACK_KEYS.map((noteIndex, i) => {
              // Position offsets for black keys
              const offsets = [0, 1, 3, 4, 5]
              return (
                <button
                  key={noteIndex}
                  onClick={() => toggleNote(noteIndex)}
                  style={{
                    position: 'absolute',
                    left: `calc(${(offsets[i] * 2 + 1) * 100 / 14}% + ${offsets[i] > 1 ? '2px' : '0px'})`,
                    width: 'calc(100% / 10)',
                    height: '100%',
                    background: enabledNotes[noteIndex]
                      ? 'linear-gradient(180deg, #22c55e, #16a34a)'
                      : 'linear-gradient(180deg, #333, #222)',
                    border: `1px solid ${enabledNotes[noteIndex] ? '#16a34a' : '#444'}`,
                    borderRadius: '0 0 3px 3px',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    fontSize: 8,
                    color: enabledNotes[noteIndex] ? '#fff' : '#888',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: 2,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {NOTE_NAMES[noteIndex]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Controls */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(74, 222, 128, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Correction
        </h5>
        <ParameterSlider
          label="Amount"
          value={correction}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setCorrection(v); onCorrectionChange?.(v / 100) }}
        />
        <div style={{ fontSize: 10, color: '#888', marginTop: -8, marginBottom: 12 }}>
          0% = no correction, 100% = full correction
        </div>

        <ParameterSlider
          label="Bias"
          value={bias}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setBias(v); onBiasChange?.(v / 100) }}
        />
        <div style={{ fontSize: 10, color: '#888', marginTop: -8, marginBottom: 12 }}>
          Preference for staying on current note
        </div>

        <ParameterSlider
          label="Filter"
          value={filter}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setFilter(v); onFilterChange?.(v / 100) }}
        />
        <div style={{ fontSize: 10, color: '#888', marginTop: -8, marginBottom: 12 }}>
          Smoothing on pitch correction
        </div>

        <ParameterSlider
          label="Offset"
          value={offset}
          min={-200}
          max={200}
          unit=" cents"
          valueFormatter={(v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0))}
          onChange={(v) => { setOffset(v); onOffsetChange?.(v) }}
        />
        <div style={{ fontSize: 10, color: '#888', marginTop: -8 }}>
          +/- 2 semitones pitch shift
        </div>
      </div>

      {/* Reference Tuning */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(74, 222, 128, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Reference
        </h5>
        <ParameterSlider
          label="A = "
          value={tuning}
          min={430}
          max={450}
          step={0.2}
          unit=" Hz"
          valueFormatter={(v) => v.toFixed(1)}
          onChange={(v) => { setTuning(v); onTuningChange?.(v) }}
        />
      </div>

      {/* MIDI Control */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(74, 222, 128, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          MIDI Control
        </h5>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            id="zita-midi"
            checked={midiEnabled}
            onChange={(e) => {
              setMidiEnabled(e.target.checked)
              onMidiChange?.({ enabled: e.target.checked, channel: midiChannel })
            }}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="zita-midi" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Enable MIDI Note Control
          </label>
        </div>
        {midiEnabled && (
          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
              MIDI Channel
            </label>
            <select
              value={midiChannel}
              onChange={(e) => {
                const channel = parseInt(e.target.value)
                setMidiChannel(channel)
                onMidiChange?.({ enabled: midiEnabled, channel })
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(74, 222, 128, 0.1)',
                color: '#f2f6ff',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              <option value={0}>Omni (All Channels)</option>
              {Array.from({ length: 16 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Channel {i + 1}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Mode & Bypass */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            id="zita-low-latency"
            checked={lowLatencyMode}
            onChange={(e) => {
              setLowLatencyMode(e.target.checked)
              onLowLatencyChange?.(e.target.checked)
            }}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="zita-low-latency" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Low Latency Mode (~10ms vs ~21ms)
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <input
            type="checkbox"
            id="zita-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="zita-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Bypass
          </label>
        </div>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: '1px solid rgba(74, 222, 128, 0.2)',
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
          <span>Latency: <span style={{ color: '#4ade80', fontWeight: 600 }}>{lowLatencyMode ? '~10ms' : '~21ms'}</span></span>
          {midiEnabled && <span style={{ color: '#4ade80' }}>🎹 MIDI</span>}
          <span>A = <span style={{ color: '#4ade80', fontWeight: 600 }}>{tuning.toFixed(1)}Hz</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
