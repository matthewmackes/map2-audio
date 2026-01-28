import { useState, useEffect } from 'react'
import { Zap, Brain, Cpu } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { NAMStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface NAMCardProps {
  status: NAMStatus
  onModelChange?: (modelName: string) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
}

export function NAMCard({
  status,
  onModelChange,
  onMixChange,
  onBypassChange
}: NAMCardProps) {
  const [selectedModel, setSelectedModel] = useState(status.activeModel || '')
  const [mix, setMix] = useState(status.mix)

  useEffect(() => {
    setSelectedModel(status.activeModel || '')
    setMix(status.mix)
  }, [status])

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName)
    onModelChange?.(modelName)
  }

  const handleMixChange = (newMix: number) => {
    setMix(newMix)
    onMixChange?.(newMix)
  }

  return (
    <PluginCard
      title="NAM Player"
      icon={<Zap size={24} />}
      color="nam"
      status={status.available ? (status.bypass ? 'inactive' : 'active') : 'error'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="nam" />

      {/* Neural Network Status Visualization */}
      <div style={{
        marginBottom: 20,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1), rgba(0, 0, 0, 0.3))',
        borderRadius: 10,
        border: '1px solid rgba(255, 107, 53, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={16} style={{ color: '#ff6b35' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#ff6b35', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Neural Network
            </span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            background: status.activeModel ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 100, 100, 0.2)',
            borderRadius: 12,
          }}>
            <Cpu size={12} style={{ color: status.activeModel ? '#22c55e' : '#666' }} />
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: status.activeModel ? '#22c55e' : '#666',
            }}>
              {status.activeModel ? 'Model Loaded' : 'No Model'}
            </span>
          </div>
        </div>

        {/* Current model display */}
        {status.activeModel && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 6,
            border: '1px solid rgba(255, 107, 53, 0.15)',
          }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Active Model</div>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#ff6b35',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {status.activeModel}
            </div>
          </div>
        )}
      </div>

      {/* Audio Meters */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <AudioMeter
            label="Input"
            value={status.inputLevel}
            peak={status.peakInput}
            min={-60}
            max={12}
            unit="dB"
          />
          <AudioMeter
            label="Output"
            value={status.outputLevel}
            peak={status.peakOutput}
            min={-60}
            max={12}
            unit="dB"
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#252540',
              color: '#f2f6ff',
              border: '1px solid #444',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            <option value="">-- Select Model --</option>
            {status.availableModels.map((model: string) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={handleMixChange}
          showValue={true}
        />

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="nam-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <label htmlFor="nam-bypass" style={{ fontSize: 12, cursor: 'pointer' }}>
            Bypass
          </label>
        </div>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: '1px solid rgba(255, 107, 53, 0.2)',
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
            {status.available ? 'Engine Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <span>Latency: <span style={{ color: '#ff6b35', fontWeight: 600 }}>{status.latency.toFixed(2)}ms</span></span>
          <span>Models: <span style={{ color: '#ff6b35', fontWeight: 600 }}>{status.availableModels.length}</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
