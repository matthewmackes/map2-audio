import { useState, useEffect } from 'react'
import { Cloud, Sparkles } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { ReverbTailChart } from '../Visualizations/ReverbTailChart'
import { ReverbMSEGChart } from '../Visualizations/ReverbMSEGChart'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { ReverbStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface ReverbIRCardProps {
  status: ReverbStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
  onPreDelayChange?: (preDelay: number) => void
  onBypassChange?: (bypass: boolean) => void
}

export function ReverbIRCard({
  status,
  onIRChange,
  onMixChange,
  onPreDelayChange,
  onBypassChange
}: ReverbIRCardProps) {
  const [selectedIR, setSelectedIR] = useState(status.loaded || '')
  const [mix, setMix] = useState(status.mix)
  const [preDelay, setPreDelay] = useState(status.preDelay)
  const [stretch, setStretch] = useState(100)
  const [trim, setTrim] = useState(100)
  const [reverse, setReverse] = useState(false)
  const [attack, setAttack] = useState(0)
  const [decay, setDecay] = useState(0)
  const [sendLevel, setSendLevel] = useState(75)
  const [reverbLevel, setReverbLevel] = useState(100)
  const [eqFreq, setEqFreq] = useState(2000)
  const [eqDecay, setEqDecay] = useState(50)
  const [modulationAmount, setModulationAmount] = useState(0)
  const [lfoRate, setLfoRate] = useState(1)
  const [tempoSync, setTempoSync] = useState(false)
  const [envelopeFollower, setEnvelopeFollower] = useState(0)
  const [midiTrigger, setMidiTrigger] = useState(false)
  const [audioTrigger, setAudioTrigger] = useState(false)
  const [audioTriggerMode, setAudioTriggerMode] = useState<'simple' | 'drums'>('simple')
  const [clearTails, setClearTails] = useState(false)
  const [patternSync, setPatternSync] = useState(true)
  const [selectedPattern, setSelectedPattern] = useState(1)
  const [paintMode, setPaintMode] = useState(false)

  useEffect(() => {
    setSelectedIR(status.loaded || '')
    setMix(status.mix)
    setPreDelay(status.preDelay)
  }, [status])

  return (
    <PluginCard
      title="Reverb IR"
      icon={<Sparkles size={24} />}
      color="reverb"
      status={status.loaded ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="reverb" />

      {/* Decay Visualization */}
      <div style={{ marginBottom: 20 }}>
        <ReverbTailChart data={status.decayTail} height={120} />
      </div>

      {/* Modulation Envelope Visualization */}
      <div style={{ marginBottom: 20 }}>
        <ReverbMSEGChart
          points={[
            { x: 0, y: 0 },
            { x: 20, y: 30 + modulationAmount * 0.5 },
            { x: 50, y: 100 },
            { x: 80, y: 50 + modulationAmount * 0.3 },
            { x: 100, y: 0 }
          ]}
          height={140}
          label="Pre/Post Modulation"
        />
      </div>

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* IR Selection */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#a855f7', display: 'block', marginBottom: 6, fontWeight: 600 }}>
          Reverb Space
        </label>
        <select
          value={selectedIR}
          onChange={(e) => {
            setSelectedIR(e.target.value)
            onIRChange?.(e.target.value)
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'rgba(168, 85, 247, 0.1)',
            color: '#f2f6ff',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          <option value="">-- Select Space --</option>
          {status.availableIRs.map((ir: { name: string; type: string; decay: number }) => (
            <option key={ir.name} value={ir.name}>
              {ir.name}
            </option>
          ))}
        </select>
      </div>

      {/* Core Controls */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Core
        </h5>
        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setMix(v); onMixChange?.(v) }}
        />
        <ParameterSlider
          label="Pre-Delay"
          value={preDelay}
          min={0}
          max={500}
          unit="ms"
          onChange={(v) => { setPreDelay(v); onPreDelayChange?.(v) }}
        />
        <ParameterSlider
          label="Send Level"
          value={sendLevel}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setSendLevel(v)}
        />
      </div>

      {/* IR Manipulation */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          IR Edit
        </h5>
        <ParameterSlider
          label="Stretch"
          value={stretch}
          min={50}
          max={200}
          unit="%"
          onChange={(v) => setStretch(v)}
        />
        <ParameterSlider
          label="Trim"
          value={trim}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setTrim(v)}
        />
        <ParameterSlider
          label="Attack"
          value={attack}
          min={0}
          max={100}
          unit="ms"
          onChange={(v) => setAttack(v)}
        />
        <ParameterSlider
          label="Decay"
          value={decay}
          min={0}
          max={5000}
          unit="ms"
          onChange={(v) => setDecay(v)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <input
            type="checkbox"
            id="reverb-reverse"
            checked={reverse}
            onChange={(e) => setReverse(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="reverb-reverse" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Reverse IR
          </label>
        </div>
      </div>

      {/* Parametric EQ */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          EQ
        </h5>
        <ParameterSlider
          label="Center Freq"
          value={eqFreq}
          min={20}
          max={20000}
          unit="Hz"
          onChange={(v) => setEqFreq(v)}
        />
        <ParameterSlider
          label="Freq Decay"
          value={eqDecay}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setEqDecay(v)}
        />
      </div>

      {/* Modulation */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Modulation
        </h5>
        <ParameterSlider
          label="Modulation Amt"
          value={modulationAmount}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setModulationAmount(v)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <input
            type="checkbox"
            id="reverb-tempo"
            checked={tempoSync}
            onChange={(e) => setTempoSync(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="reverb-tempo" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Tempo Sync
          </label>
        </div>
        {!tempoSync && (
          <ParameterSlider
            label="LFO Rate"
            value={lfoRate}
            min={0.1}
            max={20}
            unit="Hz"
            onChange={(v) => setLfoRate(v)}
          />
        )}
      </div>

      {/* Reverb Level & Status */}
      <div style={{ marginBottom: 8 }}>
        <ParameterSlider
          label="Reverb Level"
          value={reverbLevel}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setReverbLevel(v)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <input
            type="checkbox"
            id="reverb-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="reverb-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Bypass
          </label>
        </div>
      </div>

      {/* Envelope Followers */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Envelope Followers
        </h5>
        <ParameterSlider
          label="Send Follower"
          value={envelopeFollower}
          min={-100}
          max={100}
          unit="%"
          onChange={(v) => setEnvelopeFollower(v)}
        />
        <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
          Positive = Follow, Negative = Inverse
        </div>
      </div>

      {/* Trigger Modes */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Triggers
        </h5>
        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={midiTrigger}
              onChange={(e) => setMidiTrigger(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>MIDI Trigger</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={audioTrigger}
              onChange={(e) => setAudioTrigger(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>Audio Trigger</span>
          </label>
        </div>
        {audioTrigger && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 6 }}>
              Detection Mode
            </label>
            <select
              value={audioTriggerMode}
              onChange={(e) => setAudioTriggerMode(e.target.value as 'simple' | 'drums')}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'rgba(168, 85, 247, 0.1)',
                color: '#f2f6ff',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              <option value="simple">Simple (Envelope)</option>
              <option value="drums">Drums (Energy)</option>
            </select>
          </div>
        )}
      </div>

      {/* Pattern Controls */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Patterns (12 Slots)
        </h5>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 12 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <button
              key={i}
              onClick={() => setSelectedPattern(i + 1)}
              style={{
                padding: '8px 6px',
                background: selectedPattern === i + 1 ? '#a855f7' : 'rgba(168, 85, 247, 0.2)',
                color: selectedPattern === i + 1 ? '#fff' : '#888',
                border: `1px solid rgba(168, 85, 247, ${selectedPattern === i + 1 ? '0.8' : '0.3'})`,
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title={`Pattern ${i + 1}`}
            >
              P{i + 1}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={patternSync}
              onChange={(e) => setPatternSync(e.target.checked)}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
            />
            <span>Sync to Beat</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={paintMode}
              onChange={(e) => setPaintMode(e.target.checked)}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
            />
            <span>Paint Mode</span>
          </label>
        </div>
      </div>

      {/* Maintenance */}
      <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <button
          onClick={() => setClearTails(true)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)'
            e.currentTarget.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          🗑️ Clear Reverb Tails
        </button>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: '1px solid rgba(168, 85, 247, 0.2)',
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
            background: status.loaded ? '#22c55e' : '#666',
            boxShadow: status.loaded ? '0 0 8px #22c55e' : 'none',
          }} />
          <span style={{
            color: status.loaded ? '#a855f7' : '#666',
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {status.loaded || 'No space loaded'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
          <span>Latency: <span style={{ color: '#a855f7', fontWeight: 600 }}>{status.latency}ms</span></span>
          <span>IRs: <span style={{ color: '#a855f7', fontWeight: 600 }}>{status.availableIRs.length}</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
