import { useState, useEffect, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { DragonflyStatus, DragonflyReverbVariant, DragonflyPlateAlgorithm, DragonflyPreset } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface DragonflyReverbCardProps {
  status: DragonflyStatus
  onVariantChange?: (variant: DragonflyReverbVariant) => void
  onDryLevelChange?: (value: number) => void
  onWetLevelChange?: (value: number) => void
  onWidthChange?: (value: number) => void
  onPredelayChange?: (value: number) => void
  onDecayChange?: (value: number) => void
  onLowCutChange?: (value: number) => void
  onHighCutChange?: (value: number) => void
  onSizeChange?: (value: number) => void
  onDiffuseChange?: (value: number) => void
  onSpinChange?: (value: number) => void
  onWanderChange?: (value: number) => void
  onEarlyLevelChange?: (value: number) => void
  onEarlySendChange?: (value: number) => void
  onLateLevelChange?: (value: number) => void
  onLowXoverChange?: (value: number) => void
  onHighXoverChange?: (value: number) => void
  onLowMultChange?: (value: number) => void
  onHighMultChange?: (value: number) => void
  onModulationChange?: (value: number) => void
  onAlgorithmChange?: (algorithm: DragonflyPlateAlgorithm) => void
  onDampenChange?: (value: number) => void
  onBassBoostChange?: (value: number) => void
  onBoostFreqChange?: (value: number) => void
  onEarlyDampChange?: (value: number) => void
  onLateDampChange?: (value: number) => void
  onProgramChange?: (value: number) => void
  onBypassChange?: (bypass: boolean) => void
  onLoadPreset?: (presetName: string) => void
}

const VARIANTS: { value: DragonflyReverbVariant; label: string; description: string; icon: string }[] = [
  { value: 'hall', label: 'Hall', description: 'Concert halls and large spaces', icon: '🏛️' },
  { value: 'room', label: 'Room', description: 'Intimate acoustic environments', icon: '🏠' },
  { value: 'plate', label: 'Plate', description: 'Classic studio plate reverb', icon: '📀' },
  { value: 'early', label: 'Early', description: 'Early reflections for spatial positioning', icon: '🔊' },
]

const ALGORITHMS: { value: DragonflyPlateAlgorithm; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'nested', label: 'Nested' },
  { value: 'tank', label: 'Tank' },
]

export function DragonflyReverbCard({
  status,
  onVariantChange,
  onDryLevelChange,
  onWetLevelChange,
  onWidthChange,
  onPredelayChange,
  onDecayChange,
  onLowCutChange,
  onHighCutChange,
  onSizeChange,
  onDiffuseChange,
  onSpinChange,
  onWanderChange,
  onEarlyLevelChange,
  onEarlySendChange,
  onLateLevelChange,
  onLowXoverChange,
  onHighXoverChange,
  onLowMultChange,
  onHighMultChange,
  onModulationChange,
  onAlgorithmChange,
  onDampenChange,
  onBassBoostChange,
  onBoostFreqChange,
  onEarlyDampChange,
  onLateDampChange,
  onProgramChange,
  onBypassChange,
  onLoadPreset
}: DragonflyReverbCardProps) {
  // Local state for all parameters
  const [dryLevel, setDryLevel] = useState(status.dryLevel)
  const [wetLevel, setWetLevel] = useState(status.wetLevel)
  const [width, setWidth] = useState(status.width)
  const [predelay, setPredelay] = useState(status.predelay)
  const [decay, setDecay] = useState(status.decay)
  const [lowCut, setLowCut] = useState(status.lowCut)
  const [highCut, setHighCut] = useState(status.highCut)
  const [size, setSize] = useState(status.size)
  const [diffuse, setDiffuse] = useState(status.diffuse)
  const [spin, setSpin] = useState(status.spin)
  const [wander, setWander] = useState(status.wander)
  const [earlyLevel, setEarlyLevel] = useState(status.earlyLevel)
  const [earlySend, setEarlySend] = useState(status.earlySend)
  const [lateLevel, setLateLevel] = useState(status.lateLevel)
  const [lowXover, setLowXover] = useState(status.lowXover)
  const [highXover, setHighXover] = useState(status.highXover)
  const [lowMult, setLowMult] = useState(status.lowMult)
  const [highMult, setHighMult] = useState(status.highMult)
  const [modulation, setModulation] = useState(status.modulation)
  const [dampen, setDampen] = useState(status.dampen)
  const [bassBoost, setBassBoost] = useState(status.bassBoost)
  const [boostFreq, setBoostFreq] = useState(status.boostFreq)
  const [earlyDamp, setEarlyDamp] = useState(status.earlyDamp)
  const [lateDamp, setLateDamp] = useState(status.lateDamp)
  const [selectedBank, setSelectedBank] = useState<string>('All')

  // Sync with status updates
  useEffect(() => {
    setDryLevel(status.dryLevel)
    setWetLevel(status.wetLevel)
    setWidth(status.width)
    setPredelay(status.predelay)
    setDecay(status.decay)
    setLowCut(status.lowCut)
    setHighCut(status.highCut)
    setSize(status.size)
    setDiffuse(status.diffuse)
    setSpin(status.spin)
    setWander(status.wander)
    setEarlyLevel(status.earlyLevel)
    setEarlySend(status.earlySend)
    setLateLevel(status.lateLevel)
    setLowXover(status.lowXover)
    setHighXover(status.highXover)
    setLowMult(status.lowMult)
    setHighMult(status.highMult)
    setModulation(status.modulation)
    setDampen(status.dampen)
    setBassBoost(status.bassBoost)
    setBoostFreq(status.boostFreq)
    setEarlyDamp(status.earlyDamp)
    setLateDamp(status.lateDamp)
  }, [status])

  // Dragonfly theme color - purple/violet
  const dragonflyColor = '#8b5cf6'
  const dragonflyColorLight = 'rgba(139, 92, 246, 0.15)'

  const currentVariant = VARIANTS.find(v => v.value === status.variant) || VARIANTS[0]

  // Get unique banks for current variant
  const availableBanks = useMemo(() => {
    const banks = new Set<string>()
    status.availablePresets?.forEach((p: DragonflyPreset) => {
      if (p.variant === status.variant) {
        banks.add(p.bank)
      }
    })
    return ['All', ...Array.from(banks)]
  }, [status.availablePresets, status.variant])

  // Filter presets by bank
  const filteredPresets = useMemo(() => {
    return status.availablePresets?.filter((p: DragonflyPreset) => {
      if (p.variant !== status.variant) return false
      if (selectedBank === 'All') return true
      return p.bank === selectedBank
    }) || []
  }, [status.availablePresets, status.variant, selectedBank])

  // Size limits based on variant
  const getSizeLimits = () => {
    if (status.variant === 'room') return { min: 8, max: 32 }
    return { min: 10, max: 60 }
  }

  // Spin limits based on variant
  const getSpinLimits = () => {
    if (status.variant === 'hall') return { min: 0, max: 10 }
    return { min: 0, max: 5 }
  }

  return (
    <PluginCard
      title="Dragonfly Reverb"
      icon={<Sparkles size={24} />}
      color="dragonfly"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="dragonfly" />

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 16, display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Variant Selector */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        background: dragonflyColorLight,
        borderRadius: 8,
        border: `1px solid ${dragonflyColor}30`
      }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
          Reverb Type
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6
        }}>
          {VARIANTS.map((variant) => (
            <button
              key={variant.value}
              onClick={() => onVariantChange?.(variant.value)}
              style={{
                padding: '10px 6px',
                background: status.variant === variant.value ? dragonflyColor : 'rgba(255,255,255,0.05)',
                color: status.variant === variant.value ? '#fff' : '#888',
                border: `1px solid ${status.variant === variant.value ? dragonflyColor : '#444'}`,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: status.variant === variant.value ? `0 0 12px ${dragonflyColor}50` : 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2
              }}
              title={variant.description}
            >
              <span style={{ fontSize: 14 }}>{variant.icon}</span>
              <span>{variant.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#666', marginTop: 8, textAlign: 'center' }}>
          {currentVariant.description}
        </div>
      </div>

      {/* Preset Selector */}
      {status.availablePresets && status.availablePresets.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: 12,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Factory Presets
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            {/* Bank Filter */}
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              style={{
                padding: '8px 10px',
                background: '#1a1a1a',
                color: '#ddd',
                border: `1px solid ${dragonflyColor}40`,
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              {availableBanks.map(bank => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>

            {/* Preset Selector */}
            <select
              value={status.currentPreset || ''}
              onChange={(e) => e.target.value && onLoadPreset?.(e.target.value)}
              style={{
                padding: '8px 10px',
                background: '#1a1a1a',
                color: '#ddd',
                border: `1px solid ${dragonflyColor}40`,
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              <option value="">Select Preset...</option>
              {filteredPresets.map((preset: DragonflyPreset) => (
                <option key={preset.name} value={preset.name}>{preset.name}</option>
              ))}
            </select>
          </div>
          {status.currentPreset && (
            <div style={{ fontSize: 10, color: dragonflyColor, marginTop: 6, textAlign: 'center' }}>
              Current: {status.currentPreset} ({status.currentBank})
            </div>
          )}
        </div>
      )}

      {/* Main Level Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <ParameterSlider
          label="Dry Level"
          value={dryLevel}
          min={-80}
          max={0}
          unit="dB"
          onChange={(v) => { setDryLevel(v); onDryLevelChange?.(v) }}
        />
        <ParameterSlider
          label="Wet Level"
          value={wetLevel}
          min={-80}
          max={0}
          unit="dB"
          onChange={(v) => { setWetLevel(v); onWetLevelChange?.(v) }}
        />
      </div>

      {/* Size Control (Hall, Room, Early) */}
      {status.variant !== 'plate' && (
        <div style={{ marginBottom: 12 }}>
          <ParameterSlider
            label="Size"
            value={size}
            min={getSizeLimits().min}
            max={getSizeLimits().max}
            unit="m"
            onChange={(v) => { setSize(v); onSizeChange?.(v) }}
          />
        </div>
      )}

      {/* Width, Predelay, Decay - Common for most variants */}
      {status.variant !== 'early' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <ParameterSlider
              label="Width"
              value={width}
              min={50}
              max={150}
              unit="%"
              onChange={(v) => { setWidth(v); onWidthChange?.(v) }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <ParameterSlider
              label="Pre-Delay"
              value={predelay}
              min={0}
              max={100}
              unit="ms"
              onChange={(v) => { setPredelay(v); onPredelayChange?.(v) }}
            />
            <ParameterSlider
              label="Decay"
              value={decay}
              min={0.1}
              max={10}
              step={0.1}
              unit="s"
              onChange={(v) => { setDecay(v); onDecayChange?.(v) }}
            />
          </div>
        </>
      )}

      {/* Tone Controls */}
      <div style={{
        marginBottom: 12,
        padding: 10,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        border: `1px solid ${dragonflyColor}20`
      }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
          Tone
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ParameterSlider
            label="Low Cut"
            value={lowCut}
            min={0}
            max={200}
            unit="Hz"
            onChange={(v) => { setLowCut(v); onLowCutChange?.(v) }}
          />
          <ParameterSlider
            label="High Cut"
            value={highCut}
            min={1000}
            max={16000}
            unit="Hz"
            onChange={(v) => { setHighCut(v); onHighCutChange?.(v) }}
          />
        </div>
      </div>

      {/* Hall-Specific: Diffusion & Modulation */}
      {(status.variant === 'hall' || status.variant === 'room') && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Diffusion & Modulation
          </div>
          <div style={{ marginBottom: 8 }}>
            <ParameterSlider
              label="Diffuse"
              value={diffuse}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => { setDiffuse(v); onDiffuseChange?.(v) }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ParameterSlider
              label="Spin"
              value={spin}
              min={getSpinLimits().min}
              max={getSpinLimits().max}
              step={0.1}
              unit="Hz"
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
          {status.variant === 'hall' && (
            <div style={{ marginTop: 8 }}>
              <ParameterSlider
                label="Modulation"
                value={modulation}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => { setModulation(v); onModulationChange?.(v) }}
              />
            </div>
          )}
        </div>
      )}

      {/* Hall-Specific: Early/Late Level Balance */}
      {status.variant === 'hall' && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Level Balance
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <ParameterSlider
              label="Early"
              value={earlyLevel}
              min={-80}
              max={0}
              unit="dB"
              onChange={(v) => { setEarlyLevel(v); onEarlyLevelChange?.(v) }}
            />
            <ParameterSlider
              label="Send"
              value={earlySend}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => { setEarlySend(v); onEarlySendChange?.(v) }}
            />
            <ParameterSlider
              label="Late"
              value={lateLevel}
              min={-80}
              max={0}
              unit="dB"
              onChange={(v) => { setLateLevel(v); onLateLevelChange?.(v) }}
            />
          </div>
        </div>
      )}

      {/* Hall-Specific: Crossover */}
      {status.variant === 'hall' && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Crossover
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <ParameterSlider
              label="Low Xover"
              value={lowXover}
              min={50}
              max={1000}
              unit="Hz"
              onChange={(v) => { setLowXover(v); onLowXoverChange?.(v) }}
            />
            <ParameterSlider
              label="High Xover"
              value={highXover}
              min={1000}
              max={16000}
              unit="Hz"
              onChange={(v) => { setHighXover(v); onHighXoverChange?.(v) }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ParameterSlider
              label="Low Mult"
              value={lowMult}
              min={0.5}
              max={2.5}
              step={0.1}
              unit="x"
              onChange={(v) => { setLowMult(v); onLowMultChange?.(v) }}
            />
            <ParameterSlider
              label="High Mult"
              value={highMult}
              min={0.2}
              max={1.2}
              step={0.1}
              unit="x"
              onChange={(v) => { setHighMult(v); onHighMultChange?.(v) }}
            />
          </div>
        </div>
      )}

      {/* Room-Specific: Bass Boost & Damping */}
      {status.variant === 'room' && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Bass & Damping
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <ParameterSlider
              label="Bass Boost"
              value={bassBoost}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => { setBassBoost(v); onBassBoostChange?.(v) }}
            />
            <ParameterSlider
              label="Boost Freq"
              value={boostFreq}
              min={50}
              max={1050}
              unit="Hz"
              onChange={(v) => { setBoostFreq(v); onBoostFreqChange?.(v) }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ParameterSlider
              label="Early Damp"
              value={earlyDamp}
              min={1000}
              max={16000}
              unit="Hz"
              onChange={(v) => { setEarlyDamp(v); onEarlyDampChange?.(v) }}
            />
            <ParameterSlider
              label="Late Damp"
              value={lateDamp}
              min={1000}
              max={16000}
              unit="Hz"
              onChange={(v) => { setLateDamp(v); onLateDampChange?.(v) }}
            />
          </div>
        </div>
      )}

      {/* Plate-Specific: Algorithm & Dampen */}
      {status.variant === 'plate' && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Plate Settings
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>Algorithm</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {ALGORITHMS.map((algo) => (
                <button
                  key={algo.value}
                  onClick={() => onAlgorithmChange?.(algo.value)}
                  style={{
                    padding: '8px 6px',
                    background: status.algorithm === algo.value ? dragonflyColor : 'rgba(255,255,255,0.05)',
                    color: status.algorithm === algo.value ? '#fff' : '#888',
                    border: `1px solid ${status.algorithm === algo.value ? dragonflyColor : '#444'}`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {algo.label}
                </button>
              ))}
            </div>
          </div>
          <ParameterSlider
            label="Dampen"
            value={dampen}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => { setDampen(v); onDampenChange?.(v) }}
          />
        </div>
      )}

      {/* Early Reflections-Specific: Program Selector */}
      {status.variant === 'early' && status.earlyPrograms && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 6,
          border: `1px solid ${dragonflyColor}20`
        }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
            Early Reflections Program
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {status.earlyPrograms.map((program: string, index: number) => (
              <button
                key={index}
                onClick={() => onProgramChange?.(index)}
                style={{
                  padding: '10px 8px',
                  background: status.program === index ? dragonflyColor : 'rgba(255,255,255,0.05)',
                  color: status.program === index ? '#fff' : '#888',
                  border: `1px solid ${status.program === index ? dragonflyColor : '#444'}`,
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                {program}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Width control for Early */}
      {status.variant === 'early' && (
        <div style={{ marginBottom: 12 }}>
          <ParameterSlider
            label="Width"
            value={width}
            min={50}
            max={150}
            unit="%"
            onChange={(v) => { setWidth(v); onWidthChange?.(v) }}
          />
        </div>
      )}

      {/* Bypass */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 8 }}>
        <input
          type="checkbox"
          id="dragonfly-bypass"
          checked={status.bypass}
          onChange={(e) => onBypassChange?.(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="dragonfly-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
          Bypass
        </label>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: `1px solid ${dragonflyColor}30`,
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
            {status.available ? 'Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
          <span style={{ color: dragonflyColor, fontWeight: 600 }}>
            {currentVariant.icon} {currentVariant.label}
          </span>
          {status.variant !== 'plate' && (
            <span>Size: <span style={{ color: dragonflyColor, fontWeight: 600 }}>{size}m</span></span>
          )}
          <span>Wet: <span style={{ color: dragonflyColor, fontWeight: 600 }}>{wetLevel}dB</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
