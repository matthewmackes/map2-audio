import { useState, useEffect } from 'react'
import { Waves } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { Freeverb3Status, Freeverb3ReverbType } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface Freeverb3CardProps {
  status: Freeverb3Status
  onReverbTypeChange?: (type: Freeverb3ReverbType) => void
  onRoomSizeChange?: (value: number) => void
  onDampingChange?: (value: number) => void
  onWidthChange?: (value: number) => void
  onPredelayChange?: (value: number) => void
  onDecayChange?: (value: number) => void
  onLowCutChange?: (value: number) => void
  onHighCutChange?: (value: number) => void
  onModulationChange?: (value: number) => void
  onModFreqChange?: (value: number) => void
  onEarlyMixChange?: (value: number) => void
  onEarlySizeChange?: (value: number) => void
  onMixChange?: (value: number) => void
  onOutputGainChange?: (value: number) => void
  onDiffusionChange?: (value: number) => void
  onSpinChange?: (value: number) => void
  onWanderChange?: (value: number) => void
  onBypassChange?: (bypass: boolean) => void
}

const REVERB_TYPES: { value: Freeverb3ReverbType; label: string; description: string }[] = [
  { value: 'freeverb', label: 'Freeverb', description: 'Classic Schroeder reverb' },
  { value: 'strev', label: 'STRev', description: 'Stereo reverb with modulation' },
  { value: 'nrev', label: 'NRev', description: 'Natural room reverb' },
  { value: 'progenitor', label: 'Progenitor', description: 'Lush plate-style reverb' },
  { value: 'zrev', label: 'ZRev', description: 'Zero-latency reverb' },
  { value: 'earlyref', label: 'Early Ref', description: 'Early reflections only' },
]

export function Freeverb3Card({
  status,
  onReverbTypeChange,
  onRoomSizeChange,
  onDampingChange,
  onWidthChange,
  onPredelayChange,
  onDecayChange,
  onLowCutChange,
  onHighCutChange,
  onModulationChange,
  onModFreqChange,
  onEarlyMixChange,
  onEarlySizeChange,
  onMixChange,
  onOutputGainChange,
  onDiffusionChange,
  onSpinChange,
  onWanderChange,
  onBypassChange
}: Freeverb3CardProps) {
  const [roomSize, setRoomSize] = useState(status.roomSize)
  const [damping, setDamping] = useState(status.damping)
  const [width, setWidth] = useState(status.width)
  const [predelay, setPredelay] = useState(status.predelay)
  const [decay, setDecay] = useState(status.decay)
  const [lowCut, setLowCut] = useState(status.lowCut)
  const [highCut, setHighCut] = useState(status.highCut)
  const [modulation, setModulation] = useState(status.modulation)
  const [modFreq, setModFreq] = useState(status.modFreq)
  const [earlyMix, setEarlyMix] = useState(status.earlyMix)
  const [earlySize, setEarlySize] = useState(status.earlySize)
  const [mix, setMix] = useState(status.mix)
  const [outputGain, setOutputGain] = useState(status.outputGain)
  const [diffusion, setDiffusion] = useState(status.diffusion)
  const [spin, setSpin] = useState(status.spin)
  const [wander, setWander] = useState(status.wander)

  useEffect(() => {
    setRoomSize(status.roomSize)
    setDamping(status.damping)
    setWidth(status.width)
    setPredelay(status.predelay)
    setDecay(status.decay)
    setLowCut(status.lowCut)
    setHighCut(status.highCut)
    setModulation(status.modulation)
    setModFreq(status.modFreq)
    setEarlyMix(status.earlyMix)
    setEarlySize(status.earlySize)
    setMix(status.mix)
    setOutputGain(status.outputGain)
    setDiffusion(status.diffusion)
    setSpin(status.spin)
    setWander(status.wander)
  }, [status])

  // Freeverb3 theme color - deep blue/purple for reverb
  const freeverbColor = '#6366f1'
  const freeverbColorLight = 'rgba(99, 102, 241, 0.2)'

  const currentType = REVERB_TYPES.find(t => t.value === status.reverbType) || REVERB_TYPES[0]

  return (
    <PluginCard
      title="Freeverb3"
      icon={<Waves size={24} />}
      color="freeverb3"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="freeverb3" />

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 16, display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Reverb Type Selector */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        background: freeverbColorLight,
        borderRadius: 8,
        border: `1px solid ${freeverbColor}30`
      }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
          Reverb Algorithm
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6
        }}>
          {REVERB_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onReverbTypeChange?.(type.value)}
              style={{
                padding: '8px 6px',
                background: status.reverbType === type.value ? freeverbColor : 'rgba(255,255,255,0.05)',
                color: status.reverbType === type.value ? '#fff' : '#888',
                border: `1px solid ${status.reverbType === type.value ? freeverbColor : '#444'}`,
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: status.reverbType === type.value ? `0 0 12px ${freeverbColor}50` : 'none'
              }}
              title={type.description}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#666', marginTop: 8, textAlign: 'center' }}>
          {currentType.description}
        </div>
      </div>

      {/* Main Controls */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Room Size"
          value={roomSize}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setRoomSize(v); onRoomSizeChange?.(v) }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Decay"
          value={decay}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setDecay(v); onDecayChange?.(v) }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Damping"
          value={damping}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setDamping(v); onDampingChange?.(v) }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Pre-Delay"
          value={predelay}
          min={0}
          max={200}
          unit="ms"
          onChange={(v) => { setPredelay(v); onPredelayChange?.(v) }}
        />
      </div>

      {/* Width & Diffusion Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <ParameterSlider
          label="Width"
          value={width}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setWidth(v); onWidthChange?.(v) }}
        />
        <ParameterSlider
          label="Diffusion"
          value={diffusion}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setDiffusion(v); onDiffusionChange?.(v) }}
        />
      </div>

      {/* Early Reflections Section */}
      <div style={{
        marginBottom: 12,
        padding: 10,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        border: `1px solid ${freeverbColor}20`
      }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
          Early Reflections
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ParameterSlider
            label="ER Mix"
            value={earlyMix}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => { setEarlyMix(v); onEarlyMixChange?.(v) }}
          />
          <ParameterSlider
            label="ER Size"
            value={earlySize}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => { setEarlySize(v); onEarlySizeChange?.(v) }}
          />
        </div>
      </div>

      {/* Modulation Section */}
      <div style={{
        marginBottom: 12,
        padding: 10,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        border: `1px solid ${freeverbColor}20`
      }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
          Modulation
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <ParameterSlider
            label="Depth"
            value={modulation}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => { setModulation(v); onModulationChange?.(v) }}
          />
          <ParameterSlider
            label="Rate"
            value={modFreq}
            min={0.1}
            max={10}
            step={0.1}
            unit="Hz"
            onChange={(v) => { setModFreq(v); onModFreqChange?.(v) }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ParameterSlider
            label="Spin"
            value={spin}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => { setSpin(v); onSpinChange?.(v) }}
          />
          <ParameterSlider
            label="Wander"
            value={wander}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => { setWander(v); onWanderChange?.(v) }}
          />
        </div>
      </div>

      {/* Tone Controls */}
      <div style={{
        marginBottom: 12,
        padding: 10,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        border: `1px solid ${freeverbColor}20`
      }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
          Tone
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ParameterSlider
            label="Low Cut"
            value={lowCut}
            min={20}
            max={500}
            unit="Hz"
            onChange={(v) => { setLowCut(v); onLowCutChange?.(v) }}
          />
          <ParameterSlider
            label="High Cut"
            value={highCut}
            min={1000}
            max={20000}
            unit="Hz"
            onChange={(v) => { setHighCut(v); onHighCutChange?.(v) }}
          />
        </div>
      </div>

      {/* Output Section */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setMix(v); onMixChange?.(v) }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Output Gain"
          value={outputGain}
          min={-24}
          max={24}
          unit="dB"
          onChange={(v) => { setOutputGain(v); onOutputGainChange?.(v) }}
        />
      </div>

      {/* Bypass */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 8 }}>
        <input
          type="checkbox"
          id="freeverb3-bypass"
          checked={status.bypass}
          onChange={(e) => onBypassChange?.(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="freeverb3-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
          Bypass
        </label>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: `1px solid ${freeverbColor}30`,
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
            {status.available ? 'Reverb Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
          <span style={{ color: freeverbColor, fontWeight: 600 }}>{currentType.label}</span>
          <span>Size: <span style={{ color: freeverbColor, fontWeight: 600 }}>{roomSize}%</span></span>
          <span>Mix: <span style={{ color: freeverbColor, fontWeight: 600 }}>{mix}%</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
