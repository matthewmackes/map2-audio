import { useState, useEffect } from 'react'
import { Maximize2, Wind } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { TripleSpreadStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface TripleSpreadCardProps {
  status: TripleSpreadStatus
  onSpreadChange?: (spread: number) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
}

export function TripleSpreadCard({
  status,
  onSpreadChange,
  onMixChange,
  onBypassChange
}: TripleSpreadCardProps) {
  const [spread, setSpread] = useState(status.spread)
  const [mix, setMix] = useState(status.mix)

  useEffect(() => {
    setSpread(status.spread)
    setMix(status.mix)
  }, [status])

  return (
    <PluginCard
      title="TripleSpread"
      icon={<Maximize2 size={24} />}
      color="airwindows"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="triplespread" />

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Stereo Width Visualization */}
      <div style={{
        marginBottom: 20,
        padding: 16,
        background: 'rgba(167, 139, 250, 0.1)',
        borderRadius: 8,
        border: '1px solid rgba(167, 139, 250, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 60,
          position: 'relative'
        }}>
          {/* Center line */}
          <div style={{
            position: 'absolute',
            width: 2,
            height: '100%',
            background: 'rgba(167, 139, 250, 0.3)'
          }} />

          {/* Left spread indicator */}
          <div style={{
            position: 'absolute',
            left: `${50 - (spread / 2)}%`,
            width: 4,
            height: 40,
            background: '#a78bfa',
            borderRadius: 2,
            transition: 'left 0.2s ease',
            boxShadow: '0 0 10px rgba(167, 139, 250, 0.5)'
          }} />

          {/* Right spread indicator */}
          <div style={{
            position: 'absolute',
            left: `${50 + (spread / 2)}%`,
            width: 4,
            height: 40,
            background: '#a78bfa',
            borderRadius: 2,
            transition: 'left 0.2s ease',
            boxShadow: '0 0 10px rgba(167, 139, 250, 0.5)'
          }} />

          {/* Width area */}
          <div style={{
            position: 'absolute',
            left: `${50 - (spread / 2)}%`,
            width: `${spread}%`,
            height: 20,
            background: 'linear-gradient(90deg, rgba(167, 139, 250, 0.3), rgba(167, 139, 250, 0.1), rgba(167, 139, 250, 0.3))',
            borderRadius: 4,
            transition: 'all 0.2s ease'
          }} />
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 10,
          color: '#888'
        }}>
          <span>L</span>
          <span style={{ color: '#a78bfa' }}>Stereo Width</span>
          <span>R</span>
        </div>
      </div>

      {/* Spread Control */}
      <div style={{ marginBottom: 16 }}>
        <ParameterSlider
          label="Spread"
          value={spread}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setSpread(v); onSpreadChange?.(v) }}
        />
      </div>

      {/* Mix Control */}
      <div style={{ marginBottom: 16 }}>
        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setMix(v); onMixChange?.(v) }}
        />
      </div>

      {/* Bypass */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 8 }}>
        <input
          type="checkbox"
          id="triplespread-bypass"
          checked={status.bypass}
          onChange={(e) => onBypassChange?.(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="triplespread-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
          Bypass
        </label>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: '1px solid rgba(167, 139, 250, 0.2)',
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
            {status.available ? 'Spread Engine Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
          <span>Width: <span style={{ color: '#a78bfa', fontWeight: 600 }}>{spread}%</span></span>
          <span>Mix: <span style={{ color: '#a78bfa', fontWeight: 600 }}>{mix}%</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
